import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleBackendRequest } from "./backend";

function readBody(req: IncomingMessage) {
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

function writeResponse(res: ServerResponse, status: number, headers: Record<string, string> | undefined, body: unknown) {
  res.statusCode = status;
  Object.entries(headers ?? {}).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  res.end(JSON.stringify(body));
}

export function securityApiPlugin(): Plugin {
  return {
    name: "security-api-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          next();
          return;
        }

        const url = new URL(req.url, "http://localhost");
        const body = await readBody(req);
        const response = await handleBackendRequest({
          method: req.method ?? "GET",
          path: `${url.pathname}${url.search}`,
          headers: req.headers as Record<string, string | string[] | undefined>,
          body,
          ip: req.socket.remoteAddress ?? "local",
        });

        writeResponse(res, response.status, response.headers, response.body);
      });
    },
  };
}
