import type { IncomingMessage, ServerResponse } from "node:http";
import { handle } from "../server/app";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handle(req, res);
}
