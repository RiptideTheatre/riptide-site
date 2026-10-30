// GET /reset/welcome?session_id=cs_…  — where Stripe sends the buyer after paying.
// Confirms the payment with Stripe, records the booking, signs them in.
import { stripe, isSettled, recordBooking, activeRun, makeSessionCookie, sendEmail, welcomeEmail, redirect } from "../_lib/reset.js";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return redirect("/reset/");
  try {
    const session = await stripe(env, "GET", "checkout/sessions/" + id);
    if (!isSettled(session)) return redirect("/reset/?error=unpaid#book");
    const { buyer, isNew } = await recordBooking(env, session);
    const run = buyer.runs.find((r) => r.session === session.id);
    if (isNew) await sendEmail(env, { to: buyer.email, ...welcomeEmail(env, run) });
    const shown = activeRun(buyer) || run;
    return redirect("/reset/members/?welcome=1", { "Set-Cookie": await makeSessionCookie(env, buyer.email, shown) });
  } catch (e) {
    console.log("[reset] welcome failed", e.message);
    return redirect("/reset/?error=welcome#signin");
  }
}
