import type { BunRequest, S3Client } from "bun";
import { verifyUrl } from "./signer";

export const createRoutes = (s3ClientFactory: () => Promise<S3Client>, uriSignerSecret: string, cdnHost: string, allowedHosts: string[]) => ({
  "/download/:id/:filename": async (req: BunRequest<"/download/:id/:filename">) => {
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
      const response = cdnUri.host === cdnHost ? await s3Proxy(await s3ClientFactory(), cdnUri) : await httpProxy(cdnUri);
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
      return new Response("Unexpected Error fetching content", { status: 500 });
    }
  },
});

const httpProxy = async (uri: URL) => {
  const upstreamResponse = await fetch(uri);

  if (upstreamResponse.status === 404) {
    return new Response("Not Found", { status: 404 });
  }

  if (upstreamResponse.status !== 200) {
    return new Response(`Error fetching upstream content: ${upstreamResponse.status}`, { status: 500 });
  }

  const response = new Response(upstreamResponse.body, {
    status: 200
  });
  const contentLength = upstreamResponse.headers.get('Content-Length');
  const etag = upstreamResponse.headers.get('Etag');
  const contentType = upstreamResponse.headers.get('Content-Type');
  const lastModified = upstreamResponse.headers.get('Last-Modified');
  if (contentLength) {
    response.headers.set('Content-Length', contentLength);
  }
  if (etag) {
    response.headers.set('Etag', etag);
  }
  if (contentType) {
    response.headers.set('Content-Type', contentType);
  }
  if (lastModified) {
    response.headers.set('Last-Modified', lastModified);
  }

  return response;
}


const s3Proxy = async (s3Client: S3Client, uri: URL) => {
  const s3file = s3Client.file(uri.pathname);
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
