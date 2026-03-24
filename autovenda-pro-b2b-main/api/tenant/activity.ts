import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runBackendHandler } from "../_shared";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runBackendHandler(req, res, "/api/tenant/activity");
}
