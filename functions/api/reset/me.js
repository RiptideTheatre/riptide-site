// GET /api/reset/me  — the signed-in buyer's run, for the members page.
import { readSession, json } from "../../_lib/reset.js";

export async function onRequestGet({ request, env }) {
  const s = await readSession(env, request);
  if (!s) return json({ signedIn: false }, 401);
  return json({ signedIn: true, email: s.email, runStart: s.runStart, expires: s.expires });
}
