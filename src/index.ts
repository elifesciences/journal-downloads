import { createRoutes } from "./routes";
import { createS3 } from "./s3";

const uriSignerSecret = process.env.SECRET;
if (!uriSignerSecret) {
  console.log('Cannot start without a secret')
  process.exit(1);
}

const cdnHost = process.env.CDN_HOST;
if (!cdnHost) {
  console.log('Cannot start without a cdn host')
  process.exit(1);
}

const allowedHosts = (process.env.ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim());

Bun.serve({
  development: process.env.NODE_ENV === 'development',
  // `routes` requires Bun v1.2.3+
  routes: createRoutes(createS3, uriSignerSecret, cdnHost, allowedHosts),
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});
