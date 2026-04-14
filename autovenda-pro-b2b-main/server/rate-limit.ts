import { enforceDistributedRateLimit, getDatabaseMode } from "./database";

export async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  return enforceDistributedRateLimit(key, limit, windowMs);
}

export function getRateLimitStoreMetrics() {
  return {
    strategy: getDatabaseMode() === "postgres" ? "database" : "sqlite-local",
  };
}

export function resetRateLimitStore() {
  return;
}
