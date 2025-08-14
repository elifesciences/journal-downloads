import { s3 } from "bun";
import { createHmac } from "crypto";

const uriSignerSecret = process.env.SECRET

Bun.serve({
  // `routes` requires Bun v1.2.3+
  routes: {
    // Dynamic routes
    "/download/:id/:filename": async req => {
      const url = URL.parse(req.url);
      if (!url) {
        return new Response("Not Found", { status: 404 });
      }

      const hash = url?.searchParams.get('_hash');

      if (hash) {
        if (!uriSignerSecret) {
          return new Response("Cannot verify request", { status: 500 });
        }

        //override parts of the URL that we know will be different
        url.host = "elifesciences.org"
        url.protocol = "https"
        url.port = "443"
        url.search = ""

        const newHash = createHmac("sha256", uriSignerSecret)
                      .update(url.toString())
                      .digest("base64");

        if (newHash !== hash) {
          return new Response("Not Acceptable", { status: 406 });
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

      const s3file = s3.file(cdnUri.pathname);
      if (!(await s3file.exists())) {
        return new Response("Not Found", { status: 404 });
      }

      const stream = s3file.stream();

      const response = new Response(stream);
      response.headers.set('Link', `<${canonicalUri}>; rel="canonical"`);
      response.headers.set('Content-Disposition', `attachment; filename="${req.params.filename}"`)
      return response;
    },
  },
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});
