// GET /api/pi/session?session_id=cs_…
// Used by the questionnaire straight after payment: confirms the booking with Stripe,
// sends the confirmation email (once), and returns what the page needs to greet the buyer.
import { stripe, json, isSettled } from "../../_lib/reset.js";
import { loadRuns, confirmPiBooking } from "../../_lib/pi.js";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: "session" }, 400);
  try {
    const session = await stripe(env, "GET", "checkout/sessions/" + id);
    if (session.metadata?.product !== "pi") return json({ error: "session" }, 404);
    const paid = isSettled(session);
    const runs = await loadRuns(env, request, false).catch(() => []);
    const all = runs.length ? runs : [];
    if (paid) await confirmPiBooking(env, session, all);
    const run = all.find((r) => r.start === session.metadata?.run);
    return json({
      paid,
      email: session.customer_details?.email || "",
      startLabel: run ? run.startLabel : "",
      range: run ? run.range : ""
    });
  } catch (e) {
    console.log("[pi] session lookup failed", e.message);
    return json({ error: "lookup" }, 502);
  }
}
