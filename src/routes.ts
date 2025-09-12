import type { BunRequest, S3Client } from "bun";
import { createLogger } from "./logger";
import { verifyUrl } from "./signer";

export const createRoutes = (s3ClientFactory: () => Promise<S3Client>, uriSignerSecret: string, proxyConfig: Map<string, URL>, allowedHosts: string[]) => ({
  "/download/:id/:filename": async (req: BunRequest<"/download/:id/:filename">) => {
    const log = createLogger(req);
    const url = URL.parse(req.url);
    if (!url) {
      return new Response("Not Found", { status: 404 });
    }

    const hash = url?.searchParams.get('_hash');
    if (!hash) {
      return new Response("Not Acceptable: no signature given", { status: 406 });
    }

    const hostHeader = req.headers.get('x-forwarded-host');
    if (hostHeader) {
      // pull the last of any comma separated. This should only be from trusted proxies
      const expectedHostOverride = hostHeader.split(',').map((host) => host.trim()).pop();
      // test if the last host override is allowed, then override
      if (expectedHostOverride && allowedHosts.includes(expectedHostOverride)) {
        //override parts of the URL that we know will be different
        url.host = expectedHostOverride
        url.protocol = "https"
        url.port = "443"
      }
    }

    // original URL was hashed without the hash parameter in it, so we should too
    url.searchParams.delete('_hash');

    if (!verifyUrl(uriSignerSecret, url.toString(), hash)) {
      log('Failed to verify the URL for the download', url.toString(), hash);
      return new Response("Not Acceptable: invalid signature", { status: 406 });
    }

    // the journal called these "unsafe params" so we need to support replacing them
    const id = req.params.id.replaceAll('.', '+').replaceAll('_', '/').replaceAll('-', '=');

    const cdnUri = URL.parse(atob(id));
    if (!cdnUri) {
      return new Response("Not Found", { status: 404 });
    }

    // proxy S3 or http
    try {
      const upstream = proxyConfig.get(cdnUri.host);

      let response: Response;
      if (!upstream) {
        response = await httpProxy(cdnUri, req, log);
      } else if (upstream.protocol === 's3:') {
        response = await s3Proxy(await s3ClientFactory(), upstream.hostname, cdnUri.pathname, log);
      } else {
        response = await httpProxy(new URL(cdnUri.pathname, upstream), req, log);
      }

      if (response.status !== 200) {
        return response;
      }

      response.headers.set('Content-Disposition', `attachment; filename="${req.params.filename}"`);
      const canonicalUri = cdnUri.searchParams.get('canonicalUri');
      if (canonicalUri) {
        response.headers.set('Link', `<${canonicalUri}>; rel="canonical"`);
      }
      return response;
    } catch (_error) {
      log("Failed to connect to the upstream source to retrieve the download", _error);
      return new Response("Bad Gateway", { status: 502 });
    }
  },
});

const httpProxy = async (uri: URL, req: BunRequest, log: (...args: unknown[]) => void) => {
  log('Retrieving file from HTTP', uri.toString());
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
    log({
      message: 'Upstream source failed to return 200 or 304 when retrieving the download',
      status: upstreamResponse.status,
      uri,
    });
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

const s3Proxy = async (s3Client: S3Client, bucket: string, path: string, log: (...args: unknown[]) => void) => {
  log('Retrieving file from S3', bucket, path);
  const s3file = s3Client.file(`${bucket}${path}`);

  if (!(await s3file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  const stream = s3file.stream();

  const response = new Response(stream);

  // get file details to pass back with headers
  const s3FileStat = await s3file.stat();
  response.headers.set('Content-Length', s3FileStat.size.toString());
  response.headers.set('Content-Type', s3FileStat.type);
  response.headers.set('Etag', s3FileStat.etag);
  response.headers.set('Last-Modified', s3FileStat.lastModified.toUTCString());

  return response;
}
