import { createRoutes } from "./routes";
import { createS3 } from "./s3";

const uriSignerSecret = process.env.SECRET;

Bun.serve({
  // `routes` requires Bun v1.2.3+
  routes: createRoutes(createS3(), uriSignerSecret),
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});
