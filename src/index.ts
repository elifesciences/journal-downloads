import { createRoutes } from "./routes";
import { createS3 } from "./s3";
import { logger } from "./logger";

const uriSignerSecret = process.env.SECRET;
if (!uriSignerSecret) {
  logger('Cannot start without a secret')
  process.exit(1);
}

const proxyConfig = new Map<string, URL>();
(process.env.PROXY_CONFIG ?? '').split(',').forEach((pair) => {
  const parts = pair.split(':');
  const source = parts.shift();
  const target = parts.join(':');
  if (source && target) {
    proxyConfig.set(source.trim(), new URL(target.trim()));
  }
});

if (proxyConfig.size === 0) {
  logger('Cannot start without a proxy config')
  process.exit(1);
}

const allowedHosts = (process.env.ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim());

Bun.serve({
  development: process.env.NODE_ENV === 'development',
  // `routes` requires Bun v1.2.3+
  routes: createRoutes(createS3, uriSignerSecret, proxyConfig, allowedHosts),
  fetch: () => new Response("Not Found", { status: 404 }),
});
