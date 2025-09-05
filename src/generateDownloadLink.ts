import { parseArgs } from "util";
import { createUrlHash } from "./signer";

const { values, positionals } = parseArgs({
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
  throw Error('env var SECRET is required');
}

if (!values.url || !values.host || !values.filename) {
  throw Error('all params are required, url, host and filename');
}

const validID = btoa(values.url);
const filename = values.filename;

const requestUrl = `${values.host}/download/${validID}/${filename}`;

const hash = createUrlHash(process.env.SECRET, requestUrl);

console.log(`${requestUrl}?_hash=${encodeURIComponent(hash)}`);
