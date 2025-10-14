import type { BunRequest, S3Client } from "bun";
import { createRequestLogger } from "./logger";
import { verifyUrl } from "./signer";

const findProxyUpstream = (cdnUri: URL, proxyConfig: Map<string, URL>): { upstream: URL, key: string } | undefined => {
  const target = cdnUri.host + cdnUri.pathname;

  const matchingEntries = Array.from(proxyConfig.entries())
    .filter(([key, _]) => target.startsWith(key))
    .sort(([keyA, _], [keyB, __]) => keyB.length - keyA.length);

  if (matchingEntries.length > 0) {
    const [bestMatchKey, upstream] = matchingEntries[0];
    return { upstream, key: bestMatchKey };
  }

  return undefined;
}

export const createRoutes = (s3ClientFactory: () => Promise<S3Client>, uriSignerSecret: string, proxyConfig: Map<string, URL>, allowedHosts: string[]) => ({
  "/download/:id/:filename": async (req: BunRequest<"/download/:id/:filename">) => {
    const logger = createRequestLogger();

    const url = URL.parse(req.url);
    if (!url) {
      logger.log(404, 'Could not parse requests URL');
      return new Response("Not Found", { status: 404 });
    }
    logger.context.set('url', url.toString());

    const hash = url?.searchParams.get('_hash');
    if (!hash) {
      logger.log(404, 'Request with no signature');
      return new Response("Not Acceptable: no signature given", { status: 406 });
    }
    logger.context.set('hash', hash);

    const hostHeader = req.headers.get('x-forwarded-host');
    if (hostHeader) {
      // pull the last of any comma separated. This should only be from trusted proxies
      const expectedHostOverride = hostHeader.split(',').map((host) => host.trim()).pop();
      // test if the last host override is allowed, then override
      if (expectedHostOverride && allowedHosts.includes(expectedHostOverride)) {
        logger.context.set('hostOverride', expectedHostOverride);
        //override parts of the URL that we know will be different
        url.host = expectedHostOverride
        url.protocol = "https"
        url.port = "443"
      }
    }

    // original URL was hashed without the hash parameter in it, so we should too
    url.searchParams.delete('_hash');

    if (!verifyUrl(uriSignerSecret, url.toString(), hash)) {
      logger.log(406, 'Failed to verify the URL for the download');
      return new Response("Not Acceptable: invalid signature", { status: 406 });
    }

    // the journal called these "unsafe params" so we need to support replacing them
    const id = req.params.id.replaceAll('.', '+').replaceAll('_', '/').replaceAll('-', '=');

    const cdnUri = URL.parse(atob(id));
    if (!cdnUri) {
      logger.log(400, `CDN Uri could not be decoded or parsed: ${id}`);
      return new Response("Not Found", { status: 404 });
    }
    logger.context.set('upstreamUrl', cdnUri.toString());

    // proxy S3 or http
    try {
      const match = findProxyUpstream(cdnUri, proxyConfig);

      let response: Response;
      if (!match) {
        response = await httpProxy(cdnUri, req);
        logger.context.set('type', 'HTTP');
      } else {
        const { upstream } = match;
        const path = cdnUri.pathname;
        if (upstream.protocol === 's3:') {
          response = await s3Proxy(await s3ClientFactory(), upstream.hostname, path);
          logger.context.set('type', 'S3');
          logger.context.set('bucket', upstream.hostname);
          logger.context.set('key', path);
        } else {
          const replacementUri = new URL(path, upstream);
          response = await httpProxy(replacementUri, req);
          logger.context.set('type', 'HTTP');
          logger.context.set('originalUpstreamUrl', cdnUri.toString());
          logger.context.set('upstreamUrl', replacementUri.toString());
        }
      }

      if (response.status !== 200) {
        const responseText = await response.clone().text();
        logger.log(response.status, `${responseText}`);
        return response;
      }

      response.headers.set('Content-Disposition', `attachment; filename="${req.params.filename}"`);
      const canonicalUri = cdnUri.searchParams.get('canonicalUri');
      if (canonicalUri) {
        response.headers.set('Link', `<${canonicalUri}>; rel="canonical"`);
      }

      logger.log(200);
      return response;
    } catch (error) {
      logger.context.set('error', error);
      logger.log(502, 'Error while retrieving download');
      return new Response("Bad Gateway", { status: 502 });
    }
  },
});

const httpProxy = async (uri: URL, req: BunRequest) => {
  const upstreamRequestHeadersToProxy = [
    'Accept',
    'Cache-Control',
    'If-Modified-Since',
    'If-None-Match',
    'Referer',
    'X-Forwarded-Host',
    'X-Forwarded-Port',
    'X-Forwarded-Proto',
  ];

  const upstreamHeaders = {};
  upstreamRequestHeadersToProxy.forEach((header) => {
    const requestHeaderValue = req.headers.get(header);
    if (requestHeaderValue) {
      upstreamHeaders[header] = requestHeaderValue;
    }
  });

  const upstreamResponse = await fetch(uri, {
    headers: upstreamHeaders,
  });

  if (upstreamResponse.status === 404) {
    return new Response("Not Found", { status: 404 });
  }

  if (!([200, 304].includes(upstreamResponse.status))) {
    return new Response(`Bad Gateway\n\nError fetching upstream content: ${upstreamResponse.status}`, { status: 502 });
  }

  const response = new Response(upstreamResponse.body, {
    status: upstreamResponse.status
  });

  const headersToProxy = [
    'Content-Length',
    'Etag',
    'Content-Type',
    'Last-Modified',
    'Cache-Control',
    'Date',
    'Expires',
    'Vary',
  ];
  headersToProxy.forEach((header) => {
    const upstreamHeaderValue = upstreamResponse.headers.get(header);
    if (upstreamHeaderValue) {
      response.headers.set(header, upstreamHeaderValue);
    }
  });
  return response;
}

const s3Proxy = async (s3Client: S3Client, bucket: string, path: string) => {
  const s3file = s3Client.file(`${bucket}${path}`);

  if (!(await s3file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const s3Stream = s3file.stream();
      const reader = s3Stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          controller.enqueue(value);
        }
      } finally {
      }
      controller.close();
    },
  });

  const response = new Response(stream);

  // get file details to pass back with headers
  const s3FileStat = await s3file.stat();
  response.headers.set('Content-Length', s3FileStat.size.toString());
  response.headers.set('Content-Type', s3FileStat.type);
  response.headers.set('Etag', s3FileStat.etag);
  response.headers.set('Last-Modified', s3FileStat.lastModified.toUTCString());

  return response;
}
