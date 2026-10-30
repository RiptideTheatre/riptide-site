// Gifts, for Project Intimacy and Reset.
//
// The buyer ticks "This is a gift" and pays as normal. The gift's details ride on the Stripe
// Checkout Session as metadata, so nothing is stored until Stripe says the payment went through.
// Then ensureGift() (called by the thank-you page and by Stripe's webhook, whichever is first):
//   • gives the gift a short code, e.g. K3MQ-9XD7-P2HT, that works at /gift/
//   • stores it in KV as gift:<CODE>
//   • emails the buyer a copy, and emails the recipient if the buyer chose that.
// Project Intimacy recipients go straight to the questionnaire. Reset recipients choose a start
// month and "unwrap" the gift, which gives their own email address access (see /api/gift/claim).
import { sendEmail, isSettled, hmac, normEmail, esc, emailShell, runLabel } from "./reset.js";
import { loadRuns } from "./pi.js";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0 or 1, so codes are easy to read aloud
const YEAR_SECONDS = 60 * 60 * 24 * 400;

export const PRODUCTS = {
  pi: { name: "Project Intimacy" },
  reset: { name: "Reset" }
};

/* ---------- reading the booking form ---------- */

// Returns null when it isn't a gift, {error} when something is missing, otherwise the clean details.
export function readGift(input) {
  if (!input || typeof input !== "object") return null;
  const line = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const g = {
    to: line(input.to, 60),
    from: line(input.from, 60),
    note: String(input.note || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 300),
    send: input.send === "email" ? "email" : "me",
    email: normEmail(input.email).slice(0, 120)
  };
  if (!g.to || !g.from) return { error: "gift" };
  if (g.send === "email" && !EMAIL.test(g.email)) return { error: "giftEmail" };
  if (g.send !== "email") g.email = "";
  return g;
}

// Extra Stripe Checkout parameters for a gift. `when` is the run in words.
export function giftParams(g, productName, when, site) {
  const p = {
    "metadata[gift]": "1",
    "metadata[gift_to]": g.to,
    "metadata[gift_from]": g.from,
    "metadata[gift_send]": g.send,
    "payment_intent_data[metadata][gift]": "1",
    "payment_intent_data[description]": `Gift: ${productName} for ${g.to}, ${when}`,
    "custom_text[submit][message]":
      g.send === "email"
        ? `A gift for ${g.to}. Once you've paid we'll email them their gift, and send you a copy.`
        : `A gift for ${g.to}. Once you've paid you'll get a gift card to print or forward.`,
    return_url: site + "/gift/?session_id={CHECKOUT_SESSION_ID}"
  };
  if (g.note) p["metadata[gift_note]"] = g.note;
  if (g.email) p["metadata[gift_email]"] = g.email;
  return p;
}

export const isGiftSession = (session) => session?.metadata?.gift === "1";

/* ---------- codes ---------- */

export function cleanCode(s) {
  const c = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{12}$/.test(c) ? c : "";
}
export const prettyCode = (c) => c.replace(/(.{4})(?=.)/g, "$1-");

// The same payment always gets the same code, so the page and the webhook can't make two.
async function codeFor(env, sessionId) {
  const bytes = env.SESSION_SECRET
    ? await hmac(env.SESSION_SECRET, "gift:" + sessionId)
    : crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}

export async function getGift(env, code) {
  code = cleanCode(code);
  if (!code) return null;
  const raw = await env.RESET_KV.get("gift:" + code);
  return raw ? JSON.parse(raw) : null;
}

export async function saveGift(env, gift) {
  await env.RESET_KV.put("gift:" + gift.code, JSON.stringify(gift), { expirationTtl: YEAR_SECONDS });
}

/* ---------- when the run happens, in words ---------- */

export async function giftWhen(env, request, gift) {
  if (gift.product === "pi") {
    const runs = await loadRuns(env, request, false).catch(() => []);
    const r = runs.find((x) => x.start === gift.run);
    return { when: r ? r.range : "", startLabel: r ? r.startLabel : "" };
  }
  return { when: gift.run ? runLabel(gift.run) : "", startLabel: "" };
}

// What the gift page is allowed to show. Never includes the buyer's email.
export async function giftView(env, request, gift) {
  const { when, startLabel } = await giftWhen(env, request, gift);
  return {
    code: prettyCode(gift.code),
    product: gift.product,
    productName: PRODUCTS[gift.product]?.name || "",
    to: gift.to,
    from: gift.from,
    note: gift.note || "",
    run: gift.run,
    when,
    startLabel,
    toEmail: gift.email || "",
    send: gift.send,
    claimed: !!gift.claimed
  };
}

/* ---------- creating the gift once the payment is through ---------- */

export async function ensureGift(env, request, session) {
  if (!isGiftSession(session) || !isSettled(session) || !env.RESET_KV) return null;
  const m = session.metadata || {};
  const known = await env.RESET_KV.get("giftsession:" + session.id);
  const code = known || (await codeFor(env, session.id));
  let gift = await getGift(env, code);
  if (!gift) {
    gift = {
      code,
      product: m.product === "pi" ? "pi" : "reset",
      run: m.run || "",
      to: m.gift_to || "",
      from: m.gift_from || "",
      note: m.gift_note || "",
      send: m.gift_send === "email" ? "email" : "me",
      email: m.gift_email || "",
      buyerEmail: normEmail(session.customer_details?.email || session.customer_email),
      buyerName: session.customer_details?.name || "",
      session: session.id,
      created: Date.now(),
      claimed: null,
      notified: false
    };
    await saveGift(env, gift);
    await env.RESET_KV.put("giftsession:" + session.id, code, { expirationTtl: YEAR_SECONDS });
  }
  if (!gift.notified) {
    // Mark first, so the page and the webhook arriving together don't both send.
    gift.notified = true;
    await saveGift(env, gift);
    const { when } = await giftWhen(env, request, gift);
    const site = env.SITE_URL || new URL(request.url).origin;
    if (gift.buyerEmail) await sendEmail(env, { to: gift.buyerEmail, ...buyerEmail(site, gift, when) });
    if (gift.send === "email" && gift.email) await sendEmail(env, { to: gift.email, ...recipientEmail(site, gift, when) });
  }
  return gift;
}

/* ---------- emails ---------- */

export const giftLink = (site, gift) => `${site}/gift/?g=${gift.code}`;
const startLink = (site, gift) =>
  gift.product === "pi" ? `${site}/project-intimacy/questionnaire/?gift=${gift.code}` : giftLink(site, gift);

const noteBlock = (gift, dark) =>
  gift.note
    ? `<blockquote style="margin:22px 0;padding:4px 0 4px 18px;border-left:2px solid ${dark ? "#e9b65c" : "#9A7344"};font-size:18px;line-height:1.55;font-style:italic">${esc(gift.note).replace(/\n/g, "<br>")}<br><span style="font-style:normal;font-family:Arial,sans-serif;font-size:13px;opacity:.75">${esc(gift.from)}</span></blockquote>`
    : "";

// Project Intimacy emails use the dark Riptide look; Reset emails use Reset's own.
function shell(gift, inner) {
  if (gift.product !== "pi") return emailShell(inner);
  return `<!doctype html><html><body style="margin:0;background:#0a1416;font-family:Georgia,serif;color:#f4f1e9">
<div style="max-width:520px;margin:0 auto;padding:40px 24px">
<div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:#e9b65c;margin-bottom:24px">Project Intimacy · A gift</div>
${inner}
<p style="font-family:Arial,sans-serif;font-size:12px;color:#6e8482;margin-top:40px">Riptide · Patrick Studios, St Mary's Lane, Leeds LS9 7EH</p>
</div></body></html>`;
}
const button = (gift, href, label) =>
  gift.product === "pi"
    ? `<p style="margin:28px 0"><a href="${href}" style="background:#e8542b;color:#0a1416;text-decoration:none;padding:14px 26px;border-radius:6px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${label}</a></p>`
    : `<p style="margin:28px 0"><a href="${href}" style="background:#1E2431;color:#F1F2EF;text-decoration:none;padding:14px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:15px">${label}</a></p>`;
const small = (gift, html) =>
  `<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:${gift.product === "pi" ? "#a8b5b3" : "#5D6573"}">${html}</p>`;

export function buyerEmail(site, gift, when) {
  const name = PRODUCTS[gift.product].name;
  const link = giftLink(site, gift);
  const code = prettyCode(gift.code);
  const sent = gift.send === "email" && gift.email;
  const whenLine = gift.product === "pi" ? `Their fortnight: ${when}.` : `Their Reset begins ${when}. They can choose a different month when they unwrap it.`;
  const text = `Your gift is booked: ${name} for ${gift.to}.

${whenLine}

${sent ? `We've emailed ${gift.to} at ${gift.email} with their gift and everything they need.` : `When you're ready to give it, forward this link or print the gift card from it:`}

${link}
Gift code: ${code}

Riptide`;
  const html = shell(gift, `
<p style="font-size:26px;line-height:1.3;margin:0 0 18px">Your gift is booked.</p>
<p style="font-size:16px;line-height:1.6">${esc(name)} for <strong>${esc(gift.to)}</strong>. ${esc(whenLine)}</p>
<p style="font-size:16px;line-height:1.6">${sent ? `We've emailed ${esc(gift.to)} at ${esc(gift.email)} with their gift and everything they need.` : "When you're ready to give it, forward the link below or print the gift card."}</p>
${button(gift, link, sent ? "See their gift card" : "Open the gift card")}
${small(gift, `Gift code: <strong style="letter-spacing:.08em">${code}</strong>`)}`);
  return { subject: `Your gift for ${gift.to} is booked`, text, html };
}

export function recipientEmail(site, gift, when) {
  const name = PRODUCTS[gift.product].name;
  const link = startLink(site, gift);
  const code = prettyCode(gift.code);
  const isPi = gift.product === "pi";
  const lead = isPi
    ? `${gift.from} has given you a place on Project Intimacy: two strangers, two weeks, one conversation.`
    : `${gift.from} has given you Reset: twenty-one days, twenty minutes a day.`;
  const next = isPi
    ? `Your fortnight: ${when}.\n\nNext step: the questionnaire. It takes about fifteen minutes and it's how we match you with your partner, so please answer as honestly as you can.`
    : `Choose the month you'd like to begin, and your Reset is yours for a year from that date.`;
  const text = `${gift.to},

${lead}
${gift.note ? `\n"${gift.note}"\n— ${gift.from}\n` : ""}
${next}

${link}
Gift code: ${code}

Riptide`;
  const html = shell(gift, `
<p style="font-size:26px;line-height:1.3;margin:0 0 18px">${esc(gift.to)}, this is for you.</p>
<p style="font-size:16px;line-height:1.6">${esc(lead)}</p>
${noteBlock(gift, isPi)}
${isPi
    ? `<p style="font-size:16px;line-height:1.6">Your fortnight: <strong>${esc(when)}</strong>.</p><p style="font-size:16px;line-height:1.6">Next step: the questionnaire. It takes about fifteen minutes and it's how we match you with your partner, so please answer as honestly as you can.</p>`
    : `<p style="font-size:16px;line-height:1.6">Choose the month you'd like to begin, and your Reset is yours for a year from that date.</p>`}
${button(gift, link, isPi ? "Fill in your questionnaire" : "Unwrap your Reset")}
${small(gift, `Gift code: <strong style="letter-spacing:.08em">${code}</strong>`)}`);
  return { subject: `${gift.from} has given you ${name}`, text, html };
}
