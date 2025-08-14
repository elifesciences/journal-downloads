Bun.serve({
  // `routes` requires Bun v1.2.3+
  routes: {
    // Dynamic routes
    "/download/:id/:filename": req => {
      const cdnUri = URL.parse(atob(req.params.id));

      if (!cdnUri) {
        return new Response("Not Found", { status: 404 });
      }


      if (cdnUri.host !== "cdn.elifesciences.org") {
        return new Response("Not Acceptable", { status: 406 });
      }

      const canonicalUri = cdnUri.searchParams.get('canonicalUri');

      const response = new Response(`Decode ${req.params.id} to CDN uri ${cdnUri} and return as ${req.params.filename} with canonicalUri of ${canonicalUri}`);

      response.headers.set('Link', `<${canonicalUri}>; rel="canonical"`)
      return response;
    },
  },
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});
