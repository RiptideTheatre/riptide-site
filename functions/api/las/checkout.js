// POST /api/las/checkout  {item, pay: "deposit"|"full", name, email, experience?, notes?}
// Opens Stripe's secure payment form inside the Leeds Actors Studio booking panel (embedded Checkout).
import { stripe } from "../../_lib/reset.js";
import { json, PAID } from "../../_lib/las.js";

const clip = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad" }, 400); }
  if (b && b.website) return json({ error: "bad" }, 400);
  const item = PAID[String(b.item || "")];
  if (!item) return json({ error: "item" }, 400);
  const pay = b.pay === "deposit" && item.deposit ? "deposit" : "full";
  const name = clip(b.name, 80), email = clip(b.email, 120).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "details" }, 400);
  if (!env.STRIPE_PUBLISHABLE_KEY) return json({ error: "setup" }, 503);
  const amount = pay === "deposit" ? item.deposit : item.full;
  const label = item.name + (pay === "deposit" ? " · deposit" : "");
  const site = env.SITE_URL || new URL(request.url).origin;
  try {
    const session = await stripe(env, "POST", "checkout/sessions", {
      ui_mode: "embedded",
      mode: "payment",
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][unit_amount]": amount,
      "line_items[0][price_data][product_data][name]": label,
      "line_items[0][quantity]": 1,
      customer_email: email,
      allow_promotion_codes: "true",
      submit_type: "book",
      "metadata[product]": "las",
      "metadata[item]": String(b.item),
      "metadata[pay]": pay,
      "metadata[name]": name,
      "metadata[experience]": clip(b.experience, 60),
      "metadata[notes]": String(b.notes || "").trim().slice(0, 480),
      "payment_intent_data[metadata][product]": "las",
      "payment_intent_data[description]": "Leeds Actors Studio · " + label,
      "custom_text[submit][message]": pay === "deposit"
        ? "This £50 deposit is non-refundable and comes off the full fee. After paying you'll choose a time."
        : "After paying you'll choose a time for your session.",
      return_url: site + "/leedsactorsstudio/booked/?session_id={CHECKOUT_SESSION_ID}"
    });
    return json({ clientSecret: session.client_secret, publishableKey: env.STRIPE_PUBLISHABLE_KEY });
  } catch (e) {
    console.log("[las] checkout failed", e.message);
    return json({ error: "checkout" }, 502);
  }
}
