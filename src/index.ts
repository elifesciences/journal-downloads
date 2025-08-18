import { createRoutes } from "./routes";
import { s3 } from "./s3";

const uriSignerSecret = process.env.SECRET;

Bun.serve({
  // `routes` requires Bun v1.2.3+
  routes: createRoutes(s3, uriSignerSecret),
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});
