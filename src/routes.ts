import type { BunRequest, S3Client } from "bun";
import { verifyUrl } from "./signer";

export const createRoutes = (s3Client: S3Client, uriSignerSecret?: string) => ({
  "/download/:id/:filename": async (req) => {
    const url = URL.parse(req.url);
    if (!url) {
      return new Response("Not Found", { status: 404 });
    }

    const hash = url?.searchParams.get('_hash');

    if (hash !== null) {
      if (!uriSignerSecret) {
        return new Response("Cannot verify request", { status: 500 });
      }

      //override parts of the URL that we know will be different
      url.host = "elifesciences.org"
      url.protocol = "https"
      url.port = "443"
      url.search = ""

      if (!verifyUrl(uriSignerSecret, url.toString(), hash)) {
        return new Response("NotAcceptable", { status: 406 });
      }
    }

    const cdnUri = URL.parse(atob(req.params.id));

    if (!cdnUri) {
      return new Response("Not Found", { status: 404 });
    }

    if (cdnUri.host !== "cdn.elifesciences.org") {
      return new Response("Not Acceptable", { status: 406 });
    }

    const canonicalUri = cdnUri.searchParams.get('canonicalUri');

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
