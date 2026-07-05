import type { IncomingMessage, ServerResponse } from "node:http";
import { runBackendHandler } from "../server/vercel-handler";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await runBackendHandler(req, res);
}
