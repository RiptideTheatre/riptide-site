// POST /api/sonder/resend  {email}  — "I've lost my link" or "I've a new phone". Emails a fresh walk
// link if the address has a live ticket; the old link stops working. Always answers the same way, so it can't be used to check who booked.
import { json, normEmail, sendEmail } from "../../_lib/reset.js";
import { freshWalkLink, sonderEmail } from "../../_lib/sonder.js";

export async function onRequestPost({ request, env }) {
  let email = "";
  try { email = normEmail((await request.json()).email); } catch {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email" }, 400);
  const limitKey = "sonderresend:" + email;
  if (await env.RESET_KV.get(limitKey)) return json({ ok: true });
  // a fresh link each time, which signs out the phones that used the old one
  const pass = await freshWalkLink(env, email);
  if (pass) {
    await sendEmail(env, { to: email, ...sonderEmail(env, pass) });
    await env.RESET_KV.put(limitKey, "1", { expirationTtl: 120 });
  }
  return json({ ok: true });
}
