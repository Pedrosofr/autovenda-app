import type { IncomingMessage, ServerResponse } from "node:http";
import { runBackendHandler } from "../_shared";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await runBackendHandler(req, res, "/api/fipe/modelos");
}
