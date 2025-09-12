import type { BunRequest } from "bun";
import { randomBytes } from "node:crypto";

// Define a symbol to attach the request ID to the request object
const requestIdSymbol = Symbol.for('requestId');

// Augment the BunRequest type to include our custom property
declare module "bun" {
  interface BunRequest {
    [requestIdSymbol]?: string;
  }
}

// Function to get or create a request ID
const getRequestId = (req: BunRequest): string => {
  if (!req[requestIdSymbol]) {
    req[requestIdSymbol] = randomBytes(4).toString('hex');
  }
  // we know it is set in the if block above
  return req[requestIdSymbol] as string;
};

let loggerImpl = console.log;

export const setLogger = (logger: (...args: unknown[]) => void) => {
  loggerImpl = logger;
}

// Higher-order function to create a logger for a specific request
export const createLogger = (req: BunRequest) => {
  const requestId = getRequestId(req);
  return (...args: unknown[]) => {
    loggerImpl(`[id: ${requestId}]`, ...args);
  };
};

// A generic logger for use outside of request handlers
export const logger = (...args: unknown[]) => {
  loggerImpl(...args);
};
