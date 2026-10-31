// POST /api/sonder/checkout  {qty: 1|2}
// Opens Stripe's secure payment form inside the Sonder page (embedded Checkout).
// After paying, Stripe returns the buyer to /sonder/welcome, which opens the walk.
import { stripe, json } from "../../_lib/reset.js";
import { TICKETS, ACCESS_DAYS } from "../../_lib/sonder.js";

export async function onRequestPost({ request, env }) {
  let qty = 1;
  try { qty = Number((await request.json()).qty) === 2 ? 2 : 1; } catch { return json({ error: "qty" }, 400); }
  const t = TICKETS[qty];
  if (!env[t.env] || !env.STRIPE_PUBLISHABLE_KEY) return json({ error: "setup" }, 503);
  const site = env.SITE_URL || new URL(request.url).origin;
  try {
    const session = await stripe(env, "POST", "checkout/sessions", {
      ui_mode: "embedded",
      mode: "payment",
      "line_items[0][price]": env[t.env],
      "line_items[0][quantity]": 1,
      allow_promotion_codes: "true",
      submit_type: "book",
      "metadata[product]": "sonder",
      "metadata[qty]": String(qty),
      "payment_intent_data[metadata][product]": "sonder",
      "payment_intent_data[description]": t.label,
      "custom_text[submit][message]": `You'll get a link to the walk straight away, and ${ACCESS_DAYS} days to walk it as often as you like.${qty === 2 ? " Forward the email to the person walking with you." : ""}`,
      return_url: site + "/sonder/welcome?session_id={CHECKOUT_SESSION_ID}"
    });
    return json({ clientSecret: session.client_secret, publishableKey: env.STRIPE_PUBLISHABLE_KEY, qty });
  } catch (e) {
    console.log("[sonder] checkout failed", e.message);
    return json({ error: "checkout" }, 502);
  }
}
