// GET /api/las/session?session_id=cs_…  — used by /leedsactorsstudio/booked/ straight after payment.
import { stripe } from "../../_lib/reset.js";
import { json, confirmLas } from "../../_lib/las.js";

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: "session" }, 400);
  try {
    const session = await stripe(env, "GET", "checkout/sessions/" + id);
    if (session.metadata?.product !== "las") return json({ error: "session" }, 404);
    const r = await confirmLas(env, session);
    return json({
      paid: r.paid, what: r.item?.name || "", amount: r.amount || "", deposit: !!r.deposit, balance: r.balance || "",
      first: (session.metadata?.name || "").split(" ")[0], bookingUrl: env.LAS_BOOKING_URL || ""
    });
  } catch (e) {
    console.log("[las] session lookup failed", e.message);
    return json({ error: "lookup" }, 502);
  }
}
