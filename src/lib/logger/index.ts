type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

function createLogger(baseContext: LogContext = {}): Logger {
  const write = (level: LogLevel, message: string, context?: LogContext) => {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...baseContext,
      ...context,
    };

    if (level === "error") {
      console.error(JSON.stringify(entry));
    } else if (level === "warn") {
      console.warn(JSON.stringify(entry));
    } else {
      console.log(JSON.stringify(entry));
    }
  };

  return {
    debug: (msg, ctx) => write("debug", msg, ctx),
    info: (msg, ctx) => write("info", msg, ctx),
    warn: (msg, ctx) => write("warn", msg, ctx),
    error: (msg, ctx) => write("error", msg, ctx),
    child: (ctx) => createLogger({ ...baseContext, ...ctx }),
  };
}

export const logger = createLogger({ service: "pnut-monster" });

export function withRequestId(request: Request): Logger {
  const requestId = crypto.randomUUID();
  return logger.child({
    requestId,
    path: new URL(request.url).pathname,
    method: request.method,
  });
}

export type { Logger, LogContext };
