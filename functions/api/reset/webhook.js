// POST /api/reset/webhook  — Stripe calls this when a payment completes.
// A backstop: records the booking and sends the welcome email even if the buyer
// closed the tab before reaching /reset/welcome.
import { verifyStripeSignature, recordBooking, sendEmail, welcomeEmail, json, isSettled } from "../../_lib/reset.js";
import { loadRuns, confirmPiBooking } from "../../_lib/pi.js";
import { ensureGift, isGiftSession } from "../../_lib/gift.js";

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const ok = await verifyStripeSignature(env, raw, request.headers.get("Stripe-Signature"));
  if (!ok) return json({ error: "bad signature" }, 400);
  const event = JSON.parse(raw);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (isGiftSession(session)) {
      // A gift (either show): store it and send the buyer's and recipient's emails.
      await ensureGift(env, request, session);
    } else if (session.metadata?.product === "pi") {
      // Project Intimacy: make sure the confirmation email went out, even if the buyer closed the tab.
      await confirmPiBooking(env, session, await loadRuns(env, request, false).catch(() => []));
    } else if (isSettled(session) && session.metadata?.run) {
      const { buyer, isNew } = await recordBooking(env, session);
      if (isNew) {
        const run = buyer.runs.find((r) => r.session === session.id);
        await sendEmail(env, { to: buyer.email, ...welcomeEmail(env, run) });
      }
    }
  }
  return json({ received: true });
}
