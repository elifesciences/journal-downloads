import { routes } from "./routes";

Bun.serve({
  // `routes` requires Bun v1.2.3+
  routes: routes,
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});
