import { parseArgs } from "node:util";
import { createUrlHash } from "./signer";
import { logger } from "./logger";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    url: {
      type: 'string',
    },
    host: {
      type: 'string',
    },
    filename: {
      type: 'string',
    },
  },
  strict: true,
  allowPositionals: true,
});

if (!process.env.SECRET) {
  logger('env var SECRET is required');
  process.exit(1);
}

if (!values.url || !values.host || !values.filename) {
  logger('all params are required, url, host and filename');
  process.exit(1);
}

const validID = btoa(values.url).replaceAll('+', '.').replaceAll('/', '_').replaceAll('=', '-');;
const filename = values.filename;

const requestUrl = `${values.host}/download/${validID}/${filename}`;

const hash = createUrlHash(process.env.SECRET, requestUrl);

logger(`${requestUrl}?_hash=${encodeURIComponent(hash)}`);
