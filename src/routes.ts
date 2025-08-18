import type { BunRequest, S3Client } from "bun";
import { verifyUrl } from "./signer";

export const createRoutes = (s3ClientPromise: Promise<S3Client>, uriSignerSecret: string) => ({
  "/download/:id/:filename": async (req) => {
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

    //override parts of the URL that we know will be different
    url.host = "elifesciences.org"
    url.protocol = "https"
    url.port = "443"
    url.search = ""

    if (!verifyUrl(uriSignerSecret, url.toString(), hash)) {
      return new Response("Not Acceptable: invalid signature", { status: 406 });
    }

    // the journal called these "unsafe params" so we need to spport replacing them
    const id = req.params.id.replace('.', '+').replace('_', '/').replace('-', '=');

    const cdnUri = URL.parse(atob(id));

    if (!cdnUri) {
      return new Response("Not Found", { status: 404 });
    }

    if (cdnUri.host !== "cdn.elifesciences.org") {
      return new Response("Not Acceptable: invalid host", { status: 406 });
    }

    const canonicalUri = cdnUri.searchParams.get('canonicalUri');

    const s3Client = await s3ClientPromise;
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
