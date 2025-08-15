import { createRoutes } from "./routes";
import { s3 } from "bun";

Bun.serve({
  // `routes` requires Bun v1.2.3+
  routes: createRoutes(s3),
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});
