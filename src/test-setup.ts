import { setLogger } from "./logger";

if (process.env.NODE_ENV === 'test') {
  // silence console log output during tests
  setLogger(() => {});
}
