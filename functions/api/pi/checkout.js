// POST /api/pi/checkout  {run: "YYYY-MM-DD", gift?: {to, from, note, send, email}}
// Opens Stripe's secure payment form inside the Project Intimacy page (embedded Checkout).
// After paying, Stripe returns the buyer to the questionnaire (or, for a gift, to the gift page).
import { stripe, json } from "../../_lib/reset.js";
import { loadRuns } from "../../_lib/pi.js";
import { readGift, giftParams, PRODUCTS } from "../../_lib/gift.js";

export async function onRequestPost({ request, env }) {
  let run = "", gift = null;
  try {
    const body = await request.json();
    run = String(body.run || "");
    gift = readGift(body.gift);
  } catch { return json({ error: "run" }, 400); }
  if (gift?.error) return json({ error: gift.error }, 400);
  const runs = await loadRuns(env, request);
  const chosen = runs.find((r) => r.start === run);
  if (!chosen) return json({ error: "run" }, 400);
  if (!env.PI_PRICE_ID || !env.STRIPE_PUBLISHABLE_KEY) return json({ error: "setup" }, 503);
  const site = env.SITE_URL || new URL(request.url).origin;
  try {
    const session = await stripe(env, "POST", "checkout/sessions", {
      ui_mode: "embedded",
      mode: "payment",
      "line_items[0][price]": env.PI_PRICE_ID,
      "line_items[0][quantity]": 1,
      allow_promotion_codes: "true",
      submit_type: "book",
      "metadata[product]": "pi",
      "metadata[run]": run,
      "payment_intent_data[metadata][product]": "pi",
      "payment_intent_data[metadata][run]": run,
      "payment_intent_data[description]": "Project Intimacy, " + chosen.range,
      "custom_text[submit][message]": "Project Intimacy runs " + chosen.range + ". Straight after paying you'll fill in the questionnaire we use to match you.",
      return_url: site + "/project-intimacy/questionnaire/?session_id={CHECKOUT_SESSION_ID}",
      ...(gift ? giftParams(gift, PRODUCTS.pi.name, chosen.range, site) : {})
    });
    return json({ clientSecret: session.client_secret, publishableKey: env.STRIPE_PUBLISHABLE_KEY, run, label: chosen.range });
  } catch (e) {
    console.log("[pi] checkout failed", e.message);
    return json({ error: "checkout" }, 502);
  }
}
