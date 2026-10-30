// POST /api/gift/claim  {code, email, run}
// Unwraps a Reset gift: gives the recipient's own email address a place on the run they chose,
// signs them in and sends the usual Reset welcome email. Each gift can be unwrapped once.
// (Project Intimacy gifts need no unwrapping: the recipient just fills in the questionnaire.)
import { json, isValidRun, grantAccess, activeRun, makeSessionCookie, sendEmail, welcomeEmail, normEmail } from "../../_lib/reset.js";
import { getGift, saveGift, cleanCode } from "../../_lib/gift.js";

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "form" }, 400); }
  const code = cleanCode(body.code);
  const email = normEmail(body.email);
  const run = String(body.run || "");
  if (!code) return json({ error: "code" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "email" }, 400);

  const gift = await getGift(env, code);
  if (!gift || gift.product !== "reset") return json({ error: "code" }, 404);
  if (gift.claimed && gift.claimed.email !== email) return json({ error: "claimed" }, 409);

  try {
    let chosen = gift.claimed ? gift.claimed.run : run;
    if (!gift.claimed) {
      if (!isValidRun(env, chosen)) return json({ error: "run" }, 400);
      gift.claimed = { email, run: chosen, at: Date.now() };
      await saveGift(env, gift);
    }
    const { buyer, isNew } = await grantAccess(env, email, chosen, "gift:" + code, { name: gift.to, gift: true });
    const mine = buyer.runs.find((r) => r.session === "gift:" + code);
    if (isNew) await sendEmail(env, { to: email, ...welcomeEmail(env, mine) });
    const shown = activeRun(buyer) || mine;
    return json({ ok: true, next: "/reset/members/?welcome=1" }, 200, { "Set-Cookie": await makeSessionCookie(env, email, shown) });
  } catch (e) {
    console.log("[gift] claim failed", e.message);
    return json({ error: "claim" }, 502);
  }
}
