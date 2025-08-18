import { createRoutes } from "./routes";
import { createS3 } from "./s3";

const uriSignerSecret = process.env.SECRET;
if (!uriSignerSecret) {
  console.log('Cannot start without a secret')
  process.exit(1);
}

const expectedHostOverride = process.env.HOST_OVERRIDE;

Bun.serve({
  // `routes` requires Bun v1.2.3+
  routes: createRoutes(createS3(), uriSignerSecret, expectedHostOverride),
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});
