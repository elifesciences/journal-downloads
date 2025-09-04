import type { BunRequest, S3Client } from "bun";
import { verifyUrl } from "./signer";

export const createRoutes = (s3ClientFactory: () => Promise<S3Client>, uriSignerSecret: string, cdnHost: string, allowedHosts: string[]) => ({
  "/download/:id/:filename": async (req: Request) => {
    const url = URL.parse(req.url);
    if (!url) {
      return new Response("Not Found", { status: 404 });
    }

    if (!uriSignerSecret) {
      return new Response("Cannot verify request", { status: 500 });
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

    // original URL does not contain has parameter in URL, so we should hash it without it
    url.search = ""

    if (!verifyUrl(uriSignerSecret, url.toString(), hash)) {
      return new Response("Not Acceptable: invalid signature", { status: 406 });
    }

    // the journal called these "unsafe params" so we need to spport replacing them
    const id = req.params.id.replaceAll('.', '+').replaceAll('_', '/').replaceAll('-', '=');

    const cdnUri = URL.parse(atob(id));

    if (!cdnUri) {
      return new Response("Not Found", { status: 404 });
    }

    if (cdnUri.host !== cdnHost) {
      return new Response("Not Acceptable: invalid host", { status: 406 });
    }

    const canonicalUri = cdnUri.searchParams.get('canonicalUri');

    const s3Client = await s3ClientFactory();
    const s3file = s3Client.file(cdnUri.pathname);
    if (!(await s3file.exists())) {
      return new Response("Not Found", { status: 404 });
    }

    const stream = s3file.stream();

    const response = new Response(stream);
    if (canonicalUri) {
      response.headers.set('Link', `<${canonicalUri}>; rel="canonical"`);
    }
    response.headers.set('Content-Disposition', `attachment; filename="${req.params.filename}"`)
    return response;
  },
});
