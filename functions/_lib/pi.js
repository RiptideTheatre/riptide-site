// Project Intimacy booking: shared helpers.
// Run dates live in the show's settings (src/shows/project-intimacy.md → runs) and are
// published at /project-intimacy/runs.json, so the payment code always checks the same list
// the page and the questionnaire show.
import { sendEmail, isSettled } from "./reset.js";

export async function loadRuns(env, request, bookableOnly = true) {
  const url = new URL("/project-intimacy/runs.json", request.url);
  const res = env.ASSETS ? await env.ASSETS.fetch(url) : await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const today = new Date().toISOString().slice(0, 10);
  // A run can be booked until the day it starts.
  return (data.runs || []).filter((r) => !bookableOnly || r.start > today);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function piBookedEmail(env, run) {
  const site = env.SITE_URL || "https://www.theriptide.co.uk";
  const link = `${site}/project-intimacy/questionnaire/`;
  const when = run ? run.range : "your chosen dates";
  const text = `You're booked onto Project Intimacy (${when}).

Next step: fill in the questionnaire. It takes about fifteen minutes and it's how we match you with your partner, so please answer as honestly as you can.

${link}

Before your start date, anonymise yourself on WhatsApp and save Riptide's number. The questionnaire's checklist walks you through both.

Riptide`;
  const html = `<!doctype html><html><body style="margin:0;background:#0a1416;font-family:Georgia,serif;color:#f4f1e9">
<div style="max-width:520px;margin:0 auto;padding:40px 24px">
<div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:#e9b65c;margin-bottom:24px">Project Intimacy</div>
<p style="font-size:26px;line-height:1.3;margin:0 0 18px">You're booked.</p>
<p style="font-size:16px;line-height:1.6;color:#a8b5b3">Your fortnight: <strong style="color:#f4f1e9">${esc(when)}</strong>.</p>
<p style="font-size:16px;line-height:1.6;color:#a8b5b3">Next step: the questionnaire. It takes about fifteen minutes and it's how we match you with your partner, so please answer as honestly as you can.</p>
<p style="margin:28px 0"><a href="${link}" style="background:#e8542b;color:#0a1416;text-decoration:none;padding:14px 26px;border-radius:6px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">Fill in the questionnaire</a></p>
<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#a8b5b3">Before your start date, anonymise yourself on WhatsApp and save Riptide's number. The questionnaire's checklist walks you through both.</p>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#6e8482;margin-top:40px">Riptide · Patrick Studios, St Mary's Lane, Leeds LS9 7EH</p>
</div></body></html>`;
  return { subject: "You're booked: Project Intimacy, " + when, text, html };
}

// Sends the confirmation once per payment, whether the page or Stripe's webhook gets there first.
export async function confirmPiBooking(env, session, runs) {
  if (!isSettled(session) || session.metadata?.gift === "1") return false;
  const email = session.customer_details?.email || session.customer_email;
  if (!email) return false;
  const key = "pi:sent:" + session.id;
  if (env.RESET_KV && (await env.RESET_KV.get(key))) return false;
  const run = (runs || []).find((r) => r.start === session.metadata?.run);
  await sendEmail(env, { to: email, ...piBookedEmail(env, run || null) });
  if (env.RESET_KV) await env.RESET_KV.put(key, "1", { expirationTtl: 60 * 60 * 24 * 120 });
  return true;
}
