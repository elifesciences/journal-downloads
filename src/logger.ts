import { randomBytes } from "node:crypto";

let loggerImpl = console.log;

export const setLogger = (logger: (...args: unknown[]) => void) => {
  loggerImpl = logger;
}

type RequestLogger = (statusCode: number, message?: string) => void

// Logger with generic context, displayed as [key:value]
export const createRequestLogger = (): { log: RequestLogger, context: Map<string, string> } => {
  const context = new Map<string, string>();
  context.set('id', randomBytes(4).toString('hex'));
  return {
    log: (statusCode: number, message?: string) => {
      const props = Object.fromEntries(context.entries());
      props.statusCode = `${statusCode}`;
      if (message) {
        props.message = message;
      }

      loggerImpl(JSON.stringify(props));
    },
    context,
  }
};

// A generic logger for use outside of request handlers
export const logger = (...args: unknown[]) => {
  loggerImpl(...args);
};
