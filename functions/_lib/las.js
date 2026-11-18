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
