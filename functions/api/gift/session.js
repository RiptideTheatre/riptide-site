// GET /api/gift/session?session_id=cs_…
// The gift page straight after paying: confirms the payment with Stripe, creates the gift
// (once) and sends its emails, then returns what the buyer's page needs to show.
import { stripe, json } from "../../_lib/reset.js";
import { ensureGift, giftView, isGiftSession } from "../../_lib/gift.js";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: "session" }, 400);
  try {
    const session = await stripe(env, "GET", "checkout/sessions/" + id);
    if (!isGiftSession(session)) return json({ error: "session" }, 404);
    const gift = await ensureGift(env, request, session);
    if (!gift) return json({ paid: false });
    return json({ paid: true, buyer: true, ...(await giftView(env, request, gift)) });
  } catch (e) {
    console.log("[gift] session lookup failed", e.message);
    return json({ error: "lookup" }, 502);
  }
}
