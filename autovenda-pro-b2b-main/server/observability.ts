type LogLevel = "info" | "warn" | "error";

function nowIso() {
  return new Date().toISOString();
}

function getStack(error: unknown) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

export function toErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? error.message,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: String(error),
  };
}

function baseLog(level: LogLevel, event: string, payload: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && process.env.ENABLE_TEST_LOGS !== "1") {
    return;
  }

  const line = JSON.stringify({
    timestamp: nowIso(),
    level,
    event,
    ...payload,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function logEvent(level: LogLevel, event: string, payload: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test" && level === "info") {
    return;
  }
  baseLog(level, event, payload);
}

export function logInfo(event: string, payload: Record<string, unknown> = {}) {
  baseLog("info", event, payload);
}

export function logWarn(event: string, payload: Record<string, unknown> = {}) {
  baseLog("warn", event, payload);
}

export function logError(event: string, error: unknown, payload: Record<string, unknown> = {}) {
  baseLog("error", event, {
    ...payload,
    error: getStack(error),
  });
}

export function createRequestId() {
  return `req_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}
