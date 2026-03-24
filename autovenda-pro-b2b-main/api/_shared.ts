import type { IncomingMessage, ServerResponse } from "node:http";
import { handleBackendRequest } from "../server/backend";

async function readBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (!chunks.length) {
        resolve(undefined);
        return;
      }

      const raw = Buffer.concat(chunks).toString("utf-8");
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on("error", reject);
  });
}

export async function runBackendHandler(
  req: IncomingMessage,
  res: ServerResponse,
  fallbackPath: string,
) {
  const requestUrl = req.url ? new URL(req.url, "http://localhost") : null;
  const path = requestUrl ? `${requestUrl.pathname}${requestUrl.search}` : fallbackPath;

  const response = await handleBackendRequest({
    method: req.method ?? "GET",
    path,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: await readBody(req),
    ip: req.socket.remoteAddress ?? "vercel",
  });

  res.statusCode = response.status;
  Object.entries(response.headers ?? {}).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(response.body));
}
