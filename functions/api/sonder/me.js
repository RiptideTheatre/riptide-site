// GET /api/sonder/me  — how long this phone's Sonder ticket lasts.
import { json } from "../../_lib/reset.js";
import { readSonderSession, untilLabel } from "../../_lib/sonder.js";

export async function onRequestGet({ request, env }) {
  const s = await readSonderSession(env, request);
  if (!s) return json({ error: "signin" }, 401);
  return json({ until: s.until, untilLabel: untilLabel(s.until) });
}
