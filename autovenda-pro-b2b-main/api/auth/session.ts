import type { IncomingMessage, ServerResponse } from "node:http";
import { handleBackendRequest } from "../../server/backend";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const response = await handleBackendRequest({
    method: req.method ?? "GET",
    path: "/api/auth/session",
    headers: req.headers as Record<string, string | string[] | undefined>,
    ip: req.socket.remoteAddress ?? "vercel",
  });

  res.statusCode = response.status;
  Object.entries(response.headers ?? {}).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(response.body));
}
