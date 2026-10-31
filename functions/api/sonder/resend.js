// POST /api/sonder/resend  {email}  — "I've lost my link". Emails the walk link again if the
// address has a live ticket. Always answers the same way, so it can't be used to check who booked.
import { json, normEmail, sendEmail } from "../../_lib/reset.js";
import { getSonderBuyer, livePass, sonderEmail } from "../../_lib/sonder.js";

export async function onRequestPost({ request, env }) {
  let email = "";
  try { email = normEmail((await request.json()).email); } catch {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email" }, 400);
  const limitKey = "sonderresend:" + email;
  if (await env.RESET_KV.get(limitKey)) return json({ ok: true });
  const pass = livePass(await getSonderBuyer(env, email));
  if (pass) {
    await sendEmail(env, { to: email, ...sonderEmail(env, pass) });
    await env.RESET_KV.put(limitKey, "1", { expirationTtl: 120 });
  }
  return json({ ok: true });
}
