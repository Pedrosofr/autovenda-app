/**
 * AutoVenda Pro — Servidor de producao (Railway)
 * Serve o frontend estático + rotas /api/* via handleBackendRequest
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleBackendRequest } from "./backend.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = join(__dirname, "../dist");
const PORT = Number(process.env.PORT ?? 8080);

const MIME: Record<string, string> = {
  ".html":  "text/html; charset=utf-8",
  ".js":    "application/javascript; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".json":  "application/json",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".gif":   "image/gif",
  ".svg":   "image/svg+xml",
  ".ico":   "image/x-icon",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".webp":  "image/webp",
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      if (!chunks.length) { resolve(undefined); return; }
      const raw = Buffer.concat(chunks).toString("utf-8");
      try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
    });
    req.on("error", reject);
  });
}

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  // ── API routes ──────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache");
    try {
      const body = await readBody(req);
      const response = await handleBackendRequest({
        method: req.method ?? "GET",
        path: `${pathname}${url.search}`,
        headers: req.headers as Record<string, string | string[] | undefined>,
        body,
        ip: clientIp(req),
      });
      res.statusCode = response.status;
      Object.entries(response.headers ?? {}).forEach(([k, v]) => res.setHeader(k, v));
      res.end(JSON.stringify(response.body));
    } catch (err) {
      console.error("[API Error]", err);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Erro interno do servidor." }));
    }
    return;
  }

  // ── Static files ────────────────────────────────────────────────────────
  const ext = extname(pathname);
  let filePath = join(DIST_DIR, pathname);

  const fileExists = existsSync(filePath) && statSync(filePath).isFile();

  // SPA fallback: se nao é um arquivo estático, serve index.html
  if (!fileExists || !ext) {
    filePath = join(DIST_DIR, "index.html");
  }

  try {
    const content = readFileSync(filePath);
    const mime = MIME[extname(filePath)] ?? "application/octet-stream";
    res.setHeader("Content-Type", mime);

    if (extname(filePath) === ".html") {
      res.setHeader("Cache-Control", "no-cache, no-store");
    } else {
      // Assets versionados pelo Vite podem ser cacheados por 1 ano
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }

    res.statusCode = 200;
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain");
    res.end("Not found");
  }
});

server.on("error", (err) => {
  console.error("[Server Error]", err);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[AutoVenda Pro] Servidor rodando na porta ${PORT}`);
  console.log(`[AutoVenda Pro] NODE_ENV: ${process.env.NODE_ENV ?? "production"}`);
});
