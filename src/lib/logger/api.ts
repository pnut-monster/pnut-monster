import { logger, type Logger } from "./index";

export function createApiLogger(request: Request): { log: Logger; requestId: string } {
  const requestId = crypto.randomUUID();
  const log = logger.child({
    requestId,
    path: new URL(request.url).pathname,
    method: request.method,
  });
  return { log, requestId };
}
