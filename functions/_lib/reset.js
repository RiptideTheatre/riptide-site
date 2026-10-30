// Shared helpers for Reset: runs, bookings, sign-in cookies, Stripe and email.
// Runs on Cloudflare Pages Functions. No npm packages: plain fetch + Web Crypto.
//
// Settings (Cloudflare Pages → Settings → Variables and secrets):
//   STRIPE_SECRET_KEY      secret   sk_live_… (sk_test_… while testing)
//   STRIPE_WEBHOOK_SECRET  secret   whsec_…
//   RESET_PRICE_ID         plain    price_… for the £45 Reset product
//   SESSION_SECRET         secret   any long random string (signs sign-in cookies)
//   RESEND_API_KEY         secret   re_… (sends sign-in and welcome emails)
//   MAIL_FROM              plain    Riptide Reset <reset@theriptide.co.uk>
//   SITE_URL               plain    https://www.theriptide.co.uk
//   FIRST_RUN              plain    2027-01-01 (no runs are offered before this)
// Binding: KV namespace bound as RESET_KV.

export const COOKIE = "reset_session";
const DAY = 86400000;

/* ---------- runs ---------- */

// Runs start on the 1st of each month. Offer the next six, never before FIRST_RUN.
export function upcomingRuns(env, now = new Date()) {
  const first = parseDay(env.FIRST_RUN || "2027-01-01");
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  if (d < first) d = first;
  const out = [];
  for (let i = 0; i < 6; i++) {
    out.push(isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1))));
  }
  return out;
}

export function isValidRun(env, run, now = new Date()) {
  return upcomingRuns(env, now).includes(run);
}

export function runLabel(run) {
  return parseDay(run).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// Access lasts one year from the start of the run.
export function accessEnds(run) {
  const s = parseDay(run);
  return Date.UTC(s.getUTCFullYear() + 1, s.getUTCMonth(), s.getUTCDate());
}

export function parseDay(s) {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

/* ---------- bookings (KV) ---------- */

export const normEmail = (e) => String(e || "").trim().toLowerCase();

export async function getBuyer(env, email) {
  const raw = await env.RESET_KV.get("buyer:" + normEmail(email));
  return raw ? JSON.parse(raw) : null;
}

// Give an email address access to a run. `ref` identifies the payment (or gift), so
// calling twice with the same ref changes nothing.
export async function grantAccess(env, email, run, ref, extra = {}) {
  email = normEmail(email);
  if (!email || !run || !ref) throw new Error("Missing email, run or reference");
  const buyer = (await getBuyer(env, email)) || { email, runs: [] };
  const isNew = !buyer.runs.some((r) => r.session === ref);
  if (isNew) {
    buyer.runs.push({ start: run, expires: accessEnds(run), session: ref, paidAt: Date.now(), ...extra });
    await env.RESET_KV.put("buyer:" + email, JSON.stringify(buyer));
  }
  return { buyer, isNew };
}

// Record a paid Stripe Checkout Session for the person who paid. Safe to call twice.
export async function recordBooking(env, session) {
  const email = session.customer_details?.email || session.customer_email;
  const run = session.metadata?.run;
  if (!email || !run) throw new Error("Session is missing email or run");
  return grantAccess(env, email, run, session.id, { name: session.customer_details?.name || "" });
}

// The run someone should see now: the one in progress, else the next one, else none.
export function activeRun(buyer, now = Date.now()) {
  if (!buyer) return null;
  const live = buyer.runs.filter((r) => r.expires > now);
  if (!live.length) return null;
  const started = live.filter((r) => parseDay(r.start).getTime() <= now).sort((a, b) => b.start.localeCompare(a.start));
  if (started.length) return started[0];
  return live.sort((a, b) => a.start.localeCompare(b.start))[0];
}

/* ---------- signed cookie ---------- */

const enc = new TextEncoder();
export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
  return x === 0;
}

export async function makeSessionCookie(env, email, run) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  const payload = { e: normEmail(email), r: run.start, x: run.expires };
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = b64u(await hmac(env.SESSION_SECRET, body));
  const maxAge = Math.max(60, Math.floor((run.expires - Date.now()) / 1000));
  return `${COOKIE}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function readSession(env, request) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m || !env.SESSION_SECRET) return null;
  const [body, sig] = m[1].split(".");
  if (!body || !sig) return null;
  try {
    const good = await hmac(env.SESSION_SECRET, body);
    if (!sameBytes(good, fromB64u(sig))) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64u(body)));
    if (!p.x || p.x < Date.now()) return null;
    return { email: p.e, runStart: p.r, expires: p.x };
  } catch {
    return null;
  }
}

/* ---------- one-time sign-in links ---------- */

export async function makeSignInToken(env, email) {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = b64u(bytes);
  await env.RESET_KV.put("signin:" + token, normEmail(email), { expirationTtl: 1800 });
  return token;
}

export async function useSignInToken(env, token) {
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const email = await env.RESET_KV.get("signin:" + token);
  if (email) await env.RESET_KV.delete("signin:" + token);
  return email;
}

/* ---------- Stripe ---------- */

export async function stripe(env, method, path, params) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  const init = {
    method,
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Stripe-Version": "2024-06-20" }
  };
  let url = "https://api.stripe.com/v1/" + path;
  if (params) {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.append(k, String(v));
    if (method === "GET") url += "?" + body;
    else {
      init.body = body;
      init.headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
  }
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error("Stripe: " + (data.error?.message || res.status));
  return data;
}

// Checks the Stripe-Signature header against the raw body (Stripe's v1 scheme).
export async function verifyStripeSignature(env, rawBody, header, toleranceSec = 300) {
  if (!env.STRIPE_WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")).filter((p) => p.length === 2 && p[0] === "t"));
  const t = parts.t;
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const mac = await hmac(env.STRIPE_WEBHOOK_SECRET, `${t}.${rawBody}`);
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && sameBytes(enc.encode(s), enc.encode(hex)));
}

/* ---------- email ---------- */

export async function sendEmail(env, { to, subject, text, html }) {
  if (!env.RESEND_API_KEY) {
    console.log("[reset] RESEND_API_KEY not set; email not sent:", subject, "→", to);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Riptide Reset <reset@theriptide.co.uk>", to: [to], subject, text, html })
  });
  if (!res.ok) console.log("[reset] email failed", res.status, await res.text());
  return res.ok;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function emailShell(inner) {
  return `<!doctype html><html><body style="margin:0;background:#F1F2EF;font-family:Georgia,serif;color:#1E2431">
<div style="max-width:520px;margin:0 auto;padding:40px 24px">
<div style="font-size:28px;letter-spacing:.2em;margin-bottom:28px">RESET</div>
${inner}
<p style="font-family:Arial,sans-serif;font-size:12px;color:#5D6573;margin-top:40px">Riptide · Patrick Studios, St Mary's Lane, Leeds LS9 7EH</p>
</div></body></html>`;
}

export function welcomeEmail(env, run) {
  const site = env.SITE_URL || "https://www.theriptide.co.uk";
  const when = runLabel(run.start);
  const link = `${site}/reset/members/`;
  const signin = `${site}/reset/#signin`;
  const text = `You're booked onto Reset.

Your 21 days begin on ${when}. Each day opens on its own date, and you can return to every day for a year.

Your Reset: ${link}
On a new phone or computer, sign in with this email address here: ${signin}

Before you begin:
- Find a notebook. This will be your RESET journal.
- Buy a packet of seeds. Day 1 asks you to plant something.
- Decide which twenty minutes of your day belong to Reset.

Riptide`;
  const html = emailShell(`
<p style="font-size:22px;line-height:1.4;margin:0 0 18px">You're booked onto Reset.</p>
<p style="font-size:16px;line-height:1.6">Your 21 days begin on <strong>${esc(when)}</strong>. Each day opens on its own date, and you can return to every day for a year.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#1E2431;color:#F1F2EF;text-decoration:none;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px">Open your Reset</a></p>
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#5D6573">On a new phone or computer, <a href="${signin}" style="color:#9A7344">sign in</a> with this email address.</p>
<p style="font-size:16px;line-height:1.6;margin-top:28px"><strong>Before you begin</strong></p>
<ul style="font-size:16px;line-height:1.7;padding-left:20px">
<li>Find a notebook. This will be your RESET journal.</li>
<li>Buy a packet of seeds. Day 1 asks you to plant something.</li>
<li>Decide which twenty minutes of your day belong to Reset.</li>
</ul>`);
  return { subject: "Your Reset begins " + when, text, html };
}

export function signInEmail(env, token) {
  const site = env.SITE_URL || "https://www.theriptide.co.uk";
  const link = `${site}/api/reset/verify?token=${token}`;
  const text = `Here is your link to sign in to Reset. It works once, for the next 30 minutes.

${link}

If you didn't ask for this, you can ignore this email.`;
  const html = emailShell(`
<p style="font-size:20px;line-height:1.4;margin:0 0 18px">Sign in to Reset</p>
<p style="font-size:16px;line-height:1.6">This link works once, for the next 30 minutes.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#1E2431;color:#F1F2EF;text-decoration:none;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px">Sign in</a></p>
<p style="font-family:Arial,sans-serif;font-size:13px;color:#5D6573">If you didn't ask for this, you can ignore this email.</p>`);
  return { subject: "Your Reset sign-in link", text, html };
}

/* ---------- responses ---------- */

// A booking counts once Stripe says it's paid, or needs no payment (a 100%-off comp code).
export const isSettled = (session) => session.payment_status === "paid" || session.payment_status === "no_payment_required";

export const redirect = (to, headers = {}) => new Response(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store", ...headers } });
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
export { DAY };
