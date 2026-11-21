// Leeds Actors Studio sign-ups: Uta Hagen pledges, Company applications,
// the Audition Surgery waitlist and 1:1 coaching enquiries.
// Stored in RESET_KV under "las:"; each one is emailed to the studio (reply goes straight to the actor)
// and the actor gets a short confirmation.
//   LAS_NOTIFY  optional  where sign-ups are sent (default leedsactorsstudio@gmail.com)
//   LAS_FROM    optional  sender (default "Leeds Actors Studio <studio@theriptide.co.uk>")
export const SERVICES = {
  hagen: "Uta Hagen Technique",
  surgery: "Audition Surgery",
  company: "Company",
  ds: "Drama School Admissions",
  tape: "Self-Tape Surgery"
};
export const RATES = { reduced: ["Reduced", 14], standard: ["Standard", 20], supporter: ["Supporter", 26] };
export const MIN = 10, CAP = 14;

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clip = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

export function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
export function deadline(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 7));
  return t.toISOString().slice(0, 10);
}

export function readSignup(b) {
  const service = String(b.service || "");
  if (!SERVICES[service]) return { error: "service" };
  const name = clip(b.name, 80), email = clip(b.email, 120).toLowerCase();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "details" };
  const out = { service, name, email, experience: clip(b.experience, 60), notes: String(b.notes || "").trim().slice(0, 2000), at: new Date().toISOString() };
  if (service === "hagen") {
    const date = String(b.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "date" };
    const today = new Date().toISOString().slice(0, 10);
    if (date <= today) return { error: "date" };
    if (!RATES[b.rate]) return { error: "rate" };
    out.date = date; out.rate = b.rate;
  }
  if (service === "ds" || service === "tape") out.tier = clip(b.tier, 60);
  if (service === "surgery") out.speech = clip(b.speech, 60);
  return out;
}

export async function pledgesFor(env, date) {
  const list = await env.RESET_KV.get("las:pledges:" + date, "json");
  return Array.isArray(list) ? list : [];
}

export async function sendMail(env, { to, subject, text, replyTo }) {
  if (!env.RESEND_API_KEY) { console.log("[las] RESEND_API_KEY not set; email not sent:", subject, "→", to); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.LAS_FROM || "Leeds Actors Studio <studio@theriptide.co.uk>", to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  if (!res.ok) console.log("[las] email failed", res.status, await res.text());
  return res.ok;
}

// ---------- Paid 1:1 coaching (Stripe, Riptide's account) ----------
// Prices in pence. Drama School Admissions can be paid as a £50 non-refundable deposit or in full.
//   Booking pages are the hidden Cal.com events in BOOKING below; the actor picks a time after paying
export const PAID = {
  "tape-coach":  { service: "tape", name: "Self-Tape Surgery · online coaching (60 min)", full: 4500 },
  "tape-check":  { service: "tape", name: "Self-Tape Surgery · tape check (30 min)", full: 3000 },
  "ds-lighter":  { service: "ds", name: "Drama School Admissions · Lighter tier", full: 15000, deposit: 5000 },
  "ds-standard": { service: "ds", name: "Drama School Admissions · Standard", full: 30000, deposit: 5000 },
  "ds-recalls":  { service: "ds", name: "Drama School Admissions · Recalls", full: 12000, deposit: 5000 }
};
// Cal.com booking pages (hidden from the public profile), one per kind of session
export const BOOKING = {
  "tape-coach": "https://cal.com/leedsactorsstudio/self-tape-coaching",
  "tape-check": "https://cal.com/leedsactorsstudio/tape-check",
  "ds-lighter": "https://cal.com/leedsactorsstudio/drama-school-admissions",
  "ds-standard": "https://cal.com/leedsactorsstudio/drama-school-admissions",
  "ds-recalls": "https://cal.com/leedsactorsstudio/drama-school-admissions"
};
export function bookingLink(item, name, email) {
  const base = BOOKING[item];
  if (!base) return "";
  const q = new URLSearchParams();
  if (name) q.set("name", name);
  if (email) q.set("email", email);
  return base + (q.toString() ? "?" + q : "");
}
export const pounds = (p) => "£" + (p % 100 ? (p / 100).toFixed(2) : String(p / 100));

// Called after a Stripe payment (from the thank-you page and from the webhook); sends the emails once.
export async function confirmLas(env, session) {
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const m = session.metadata || {};
  const item = PAID[m.item];
  if (!paid || !item) return { paid, item };
  const key = "las:paid:" + session.id;
  const prior = env.RESET_KV ? await env.RESET_KV.get(key, "json") : null;
  if (prior) {
    const dep = prior.pay === "deposit";
    return { paid, item, already: true, email: prior.email, name: prior.name, amount: prior.amount, deposit: dep, balance: dep ? pounds(item.full - item.deposit) : "" };
  }
  const email = session.customer_details?.email || session.customer_email || "";
  const name = m.name || session.customer_details?.name || "";
  const first = name.split(" ")[0] || "there";
  const amount = pounds(session.amount_total ?? 0);
  const deposit = m.pay === "deposit";
  const balance = deposit ? pounds(item.full - item.deposit) : "";
  if (env.RESET_KV) await env.RESET_KV.put(key, JSON.stringify({ email, name, item: m.item, pay: m.pay, amount, notes: m.notes || "", at: new Date().toISOString() }));
  const booking = bookingLink(m.item, name, email);
  await sendMail(env, {
    to: env.LAS_NOTIFY || "leedsactorsstudio@gmail.com",
    subject: `LAS booking paid: ${item.name} · ${amount}${deposit ? " deposit" : ""} · ${name}`,
    text: [`${item.name}`, `Paid: ${amount}${deposit ? ` (deposit; ${balance} still to pay)` : " (in full)"}`, `Name: ${name}`, `Email: ${email}`,
      m.experience && `Experience: ${m.experience}`, m.notes && `\n${m.notes}`, `\nStripe: ${session.payment_intent || session.id}`,
      `\nReply to this email to answer ${first} directly.`].filter(Boolean).join("\n"),
    replyTo: email
  });
  if (email) await sendMail(env, {
    to: email,
    subject: `Leeds Actors Studio: you're booked for ${item.name.split(" · ")[0]}`,
    text: `Hi ${first},\n\nThanks for booking ${item.name}. We've received your payment of ${amount}${deposit ? ` (your non-refundable deposit; the remaining ${balance} is due before your first session)` : ""}.\n\n` +
      (booking ? `Next, choose a time that suits you:\n${booking}\n\n` : `We'll be in touch shortly to arrange a time.\n\n`) +
      `You can move a session free of charge up to 24 hours before it starts. Sessions cancelled with less than 24 hours' notice, or missed, can't be refunded.${deposit || m.item.startsWith("ds-") ? " The £50 Drama School Admissions deposit is non-refundable." : ""}\n\n` +
      `If you have any questions, just reply to this email.\n\nLeeds Actors Studio`,
    replyTo: env.LAS_NOTIFY || "leedsactorsstudio@gmail.com"
  });
  return { paid, item, email, name, amount, deposit, balance };
}
