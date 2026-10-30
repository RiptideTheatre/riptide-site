// POST /api/reset/checkout
//
// Two ways in:
//  • JSON {run: "YYYY-MM-01"} from the Reset page's script → an EMBEDDED Stripe Checkout
//    session. Answers {clientSecret, publishableKey}; the page mounts Stripe's secure form
//    inside theriptide.co.uk. Card details go straight from the buyer's browser to Stripe.
//  • A plain form post (no JavaScript) → the same session on Stripe's own page, as a fallback.
//
// Either way Stripe returns the buyer to /reset/welcome, which confirms payment and signs them in.
import { isValidRun, runLabel, stripe, redirect, json } from "../../_lib/reset.js";

function sessionParams(env, site, run) {
  return {
    mode: "payment",
    "line_items[0][price]": env.RESET_PRICE_ID,
    "line_items[0][quantity]": 1,
    customer_creation: "always",
    allow_promotion_codes: "true",
    submit_type: "book",
    "metadata[run]": run,
    "payment_intent_data[metadata][run]": run,
    "payment_intent_data[description]": "Reset, run beginning " + runLabel(run),
    "custom_text[submit][message]": "Your Reset begins on " + runLabel(run) + ". You'll have access to all 21 days for a year."
  };
}

export async function onRequestPost({ request, env }) {
  const site = env.SITE_URL || new URL(request.url).origin;
  const wantsJson = (request.headers.get("Content-Type") || "").includes("application/json");

  let run = "";
  try {
    run = wantsJson ? String((await request.json()).run || "") : String((await request.formData()).get("run") || "");
  } catch {
    return wantsJson ? json({ error: "run" }, 400) : redirect(site + "/reset/?error=run#book");
  }

  if (!isValidRun(env, run)) return wantsJson ? json({ error: "run" }, 400) : redirect(site + "/reset/?error=run#book");
  if (!env.RESET_PRICE_ID) return wantsJson ? json({ error: "setup" }, 503) : redirect(site + "/reset/?error=setup#book");

  try {
    if (wantsJson) {
      if (!env.STRIPE_PUBLISHABLE_KEY) return json({ error: "setup" }, 503);
      const session = await stripe(env, "POST", "checkout/sessions", {
        ...sessionParams(env, site, run),
        ui_mode: "embedded",
        return_url: site + "/reset/welcome?session_id={CHECKOUT_SESSION_ID}"
      });
      return json({ clientSecret: session.client_secret, publishableKey: env.STRIPE_PUBLISHABLE_KEY, run, label: runLabel(run) });
    }
    const session = await stripe(env, "POST", "checkout/sessions", {
      ...sessionParams(env, site, run),
      success_url: site + "/reset/welcome?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: site + "/reset/?cancelled=1#book"
    });
    return redirect(session.url);
  } catch (e) {
    console.log("[reset] checkout failed", e.message);
    return wantsJson ? json({ error: "checkout" }, 502) : redirect(site + "/reset/?error=checkout#book");
  }
}
