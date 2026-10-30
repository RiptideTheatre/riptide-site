// POST /api/reset/signin  (form field: email)
// Emails a one-time sign-in link if that address has a current booking.
// Always answers the same way, so it can't be used to check who has booked.
import { getBuyer, activeRun, makeSignInToken, sendEmail, signInEmail, redirect } from "../../_lib/reset.js";

export async function onRequestPost({ request, env }) {
  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const limitKey = "limit:" + email;
    const recent = Number((await env.RESET_KV.get(limitKey)) || 0);
    if (recent < 5) {
      await env.RESET_KV.put(limitKey, String(recent + 1), { expirationTtl: 3600 });
      const buyer = await getBuyer(env, email);
      if (activeRun(buyer)) {
        const token = await makeSignInToken(env, email);
        await sendEmail(env, { to: email, ...signInEmail(env, token) });
      }
    }
  }
  return redirect("/reset/?sent=1#signin");
}
