// Sonder: tickets for the browser sound walk. A ticket gives 30 days of access.
// Shares Stripe, email and signing helpers with Reset.
//
// Settings (Cloudflare Pages → Settings → Variables and secrets), as well as Reset's:
//   SONDER_PRICE_ID        plain    optional: overrides the £10 price below
//   SONDER_PAIR_PRICE_ID   plain    optional: overrides the £14 price below
//
// KV (RESET_KV):
//   sonder:<email>   {email, name, passes:[{ref, qty, from, until, key}]}
//   sonderkey:<key>  {email, until}   the walk link in the welcome email (reusable, so it can be
//                                     forwarded to the second person on a pair ticket)
import { hmac, b64u, normEmail, sendEmail, esc, isSettled, DAY } from "./reset.js";

export const SONDER_COOKIE = "sonder_session";
export const ACCESS_DAYS = 30;
export const TICKETS = {
  1: { label: "Sonder, one person", env: "SONDER_PRICE_ID", priceId: "price_1UWkNYEMSsljgDjENiGauPXs", price: "£10" },
  2: { label: "Sonder for two", env: "SONDER_PAIR_PRICE_ID", priceId: "price_1UWkNxEMSsljgDjEbtFr47O6", price: "£14" }
};

const enc = new TextEncoder();
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

export async function getSonderBuyer(env, email) {
  const raw = await env.RESET_KV.get("sonder:" + normEmail(email));
  return raw ? JSON.parse(raw) : null;
}

// The pass that runs longest, if any is still live.
export function livePass(buyer, now = Date.now()) {
  if (!buyer) return null;
  const live = (buyer.passes || []).filter((p) => p.until > now).sort((a, b) => b.until - a.until);
  return live[0] || null;
}

// Give an email address 30 days of Sonder. `ref` (a payment) makes repeat calls harmless.
export async function grantSonder(env, email, ref, qty = 1, name = "") {
  email = normEmail(email);
  if (!email || !ref) throw new Error("Missing email or reference");
  const buyer = (await getSonderBuyer(env, email)) || { email, name, passes: [] };
  const existing = buyer.passes.find((p) => p.ref === ref);
  if (existing) return { buyer, pass: existing, isNew: false };
  const from = Date.now();
  const until = from + ACCESS_DAYS * DAY;
  const key = b64u(crypto.getRandomValues(new Uint8Array(18)));
  const pass = { ref, qty: qty === 2 ? 2 : 1, from, until, key };
  buyer.passes.push(pass);
  if (name && !buyer.name) buyer.name = name;
  const ttl = Math.ceil((until - Date.now()) / 1000) + 86400;
  await env.RESET_KV.put("sonder:" + email, JSON.stringify(buyer));
  await env.RESET_KV.put("sonderkey:" + key, JSON.stringify({ email, until }), { expirationTtl: ttl });
  return { buyer, pass, isNew: true };
}

export async function recordSonderBooking(env, session) {
  const email = session.customer_details?.email || session.customer_email;
  if (!email) throw new Error("Session is missing email");
  const qty = session.metadata?.qty === "2" ? 2 : 1;
  return grantSonder(env, email, session.id, qty, session.customer_details?.name || "");
}

// A preview link for Riptide to check the walk before tickets go on sale. Only its hash is stored here;
// to retire them, delete the list (or set SONDER_PREVIEW_OFF=1 in Cloudflare).
const PREVIEW_KEYS_SHA256 = [
  "7a5f86473b3d41c932f236c725f1c868e09b08b92ed2dc16346e4c020bcc58f3",
  "1cf60e9ca877df6caad49cc8b80f7d1404194310aef160492db63e2f200240c5"
];

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function useWalkKey(env, key) {
  if (!key || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) return null;
  if (!env.SONDER_PREVIEW_OFF && PREVIEW_KEYS_SHA256.includes(await sha256hex(key))) {
    return { email: "preview@theriptide.co.uk", until: Date.now() + ACCESS_DAYS * DAY };
  }
  const raw = await env.RESET_KV.get("sonderkey:" + key);
  if (!raw) return null;
  const v = JSON.parse(raw);
  return v.until > Date.now() ? v : null;
}

/* ---------- signed cookie ---------- */

export async function makeSonderCookie(env, email, until) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  const body = b64u(enc.encode(JSON.stringify({ e: normEmail(email), x: until })));
  const sig = b64u(await hmac(env.SESSION_SECRET, "sonder." + body));
  const maxAge = Math.max(60, Math.floor((until - Date.now()) / 1000));
  return `${SONDER_COOKIE}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function readSonderSession(env, request) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp("(?:^|;\\s*)" + SONDER_COOKIE + "=([^;]+)"));
  if (!m || !env.SESSION_SECRET) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return null;
  try {
    const good = await hmac(env.SESSION_SECRET, "sonder." + body);
    if (!sameBytes(good, fromB64u(sig))) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    if (!p.x || p.x < Date.now()) return null;
    return { email: p.e, until: p.x };
  } catch {
    return null;
  }
}

/* ---------- email ---------- */

const shell = (inner) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0a1416;font-family:Georgia,serif;color:#f4f1e9">
<div style="max-width:520px;margin:0 auto;padding:40px 24px">${inner}
<p style="font-family:Arial,sans-serif;font-size:12px;color:#6e8482;margin-top:40px">Riptide · Patrick Studios, St Mary's Lane, Leeds LS9 7EH</p>
</div></body></html>`;

export const untilLabel = (ms) => new Date(ms).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

export function sonderEmail(env, pass) {
  const site = env.SITE_URL || "https://www.theriptide.co.uk";
  const link = `${site}/sonder/walk/?key=${pass.key}`;
  const until = untilLabel(pass.until);
  const pair = pass.qty === 2;
  const text = `Your Sonder ticket is ready.

Open the walk on your phone:
${link}

${pair ? "This ticket is for two. Forward this email to the person walking with you, so they can open the walk on their own phone.\n\n" : ""}You can walk it as many times as you like until ${until}.

Before you set off: open the link over wi-fi and download the walk, charge your phone and bring headphones. The walk starts at Leeds train station.

Riptide`;
  const html = shell(`
<div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:#6fc4b8;margin-bottom:24px">Sonder</div>
<p style="font-size:26px;line-height:1.3;margin:0 0 18px">Your walk is ready.</p>
<p style="font-size:16px;line-height:1.6;color:#a8b5b3">Open this link on your phone. You can walk Sonder as many times as you like until <strong style="color:#f4f1e9">${esc(until)}</strong>.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#e8542b;color:#0a1416;text-decoration:none;padding:14px 26px;border-radius:6px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">Open the walk</a></p>
${pair ? `<p style="font-size:16px;line-height:1.6;color:#a8b5b3">This ticket is for two. <strong style="color:#f4f1e9">Forward this email</strong> to the person walking with you, so they can open the walk on their own phone.</p>` : ""}
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#a8b5b3">Before you set off: open the link over wi-fi and download the walk, charge your phone and bring headphones. The walk starts at Leeds train station.</p>`);
  return { subject: "Your Sonder walk", text, html };
}

// Records the ticket and sends the email once, whichever of the page or the webhook arrives first.
export async function confirmSonder(env, session) {
  if (!isSettled(session) || session.metadata?.product !== "sonder" || session.metadata?.gift === "1") return null;
  const { buyer, pass, isNew } = await recordSonderBooking(env, session);
  if (isNew) await sendEmail(env, { to: buyer.email, ...sonderEmail(env, pass) });
  return { buyer, pass };
}
