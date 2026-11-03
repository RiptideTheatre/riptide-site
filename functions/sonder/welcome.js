// GET /sonder/welcome?session_id=cs_…  — where Stripe sends the buyer after paying.
// Confirms the payment, records the ticket, emails the walk link and, on a phone, opens the walk.
import { stripe, isSettled, redirect } from "../_lib/reset.js";
import { confirmSonder, recordSonderBooking } from "../_lib/sonder.js";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return redirect("/sonder/");
  try {
    const session = await stripe(env, "GET", "checkout/sessions/" + id);
    if (!isSettled(session) || session.metadata?.product !== "sonder") return redirect("/sonder/?error=unpaid#book");
    const done = (await confirmSonder(env, session)) || (await recordSonderBooking(env, session));
    // A ticket opens on one phone (two for a pair). Paid on a phone: open the walk on it now.
    // Paid on a computer: don't use up the phone, point them to the email instead.
    const ua = request.headers.get("User-Agent") || "";
    if (/Mobi|Android|iPhone|iPad/i.test(ua)) return redirect("/sonder/walk/?welcome=1&key=" + encodeURIComponent(done.pass.key));
    return redirect("/sonder/?booked=1#book");
  } catch (e) {
    console.log("[sonder] welcome failed", e.message);
    return redirect("/sonder/?error=welcome#book");
  }
}
