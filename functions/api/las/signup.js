// POST /api/las/signup  {service, name, email, experience?, notes?, date?, rate?, tier?, speech?, website?}
import { json, readSignup, pledgesFor, sendMail, SERVICES, RATES, MIN, CAP, longDate, deadline } from "../../_lib/las.js";

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "bad" }, 400); }
  if (b && b.website) return json({ ok: true }); // honeypot: quietly ignore bots
  const s = readSignup(b || {});
  if (s.error) return json({ error: s.error }, 400);

  // a few sign-ups per address per hour is plenty
  const rlKey = "las:rl:" + s.email;
  const tries = Number(await env.RESET_KV.get(rlKey)) || 0;
  if (tries >= 5) return json({ error: "busy" }, 429);
  await env.RESET_KV.put(rlKey, String(tries + 1), { expirationTtl: 3600 });

  let count = null;
  if (s.service === "hagen") {
    const list = await pledgesFor(env, s.date);
    const i = list.findIndex((p) => p.email === s.email);
    if (i >= 0) list[i] = { email: s.email, name: s.name, rate: s.rate, at: s.at };
    else {
      if (list.length >= CAP) return json({ error: "full" }, 409);
      list.push({ email: s.email, name: s.name, rate: s.rate, at: s.at });
    }
    await env.RESET_KV.put("las:pledges:" + s.date, JSON.stringify(list));
    count = list.length;
  }
  const id = s.at.replace(/[-:.TZ]/g, "") + "-" + Math.random().toString(36).slice(2, 7);
  await env.RESET_KV.put("las:signup:" + s.service + ":" + id, JSON.stringify(s));

  const what = SERVICES[s.service];
  const when = s.date ? `${longDate(s.date)}, 6–7.30pm` : "";
  const rate = s.rate ? `${RATES[s.rate][0]} · £${RATES[s.rate][1]}` : "";
  const kind = s.service === "hagen" ? "pledge" : s.service === "company" ? "application" : s.service === "surgery" ? "waitlist sign-up" : "enquiry";

  const lines = [
    `${what} · ${kind}`,
    when && `Date: ${when}`, rate && `Rate: ${rate}`,
    count !== null && `Pledges for this date: ${count} of ${MIN} needed (cap ${CAP})`,
    s.tier && `Option: ${s.tier}`, s.speech && `Speech: ${s.speech}`,
    `Name: ${s.name}`, `Email: ${s.email}`, s.experience && `Experience: ${s.experience}`,
    s.notes && `\n${s.notes}`, `\nReply to this email to answer ${s.name.split(" ")[0]} directly.`
  ].filter(Boolean).join("\n");
  await sendMail(env, {
    to: env.LAS_NOTIFY || "leedsactorsstudio@gmail.com",
    subject: `LAS ${kind}: ${what}${s.date ? " · " + longDate(s.date) : ""} · ${s.name}`,
    text: lines, replyTo: s.email
  });

  const first = s.name.split(" ")[0];
  const bodyFor = {
    hagen: `Thanks for pledging for ${what} on ${when} (${rate}).\n\nThe session goes ahead once ${MIN} actors have pledged. We'll email you by ${longDate(deadline(s.date))} to say whether it's running. Nothing is charged unless it is.`,
    company: `Thanks for applying to join the Company. We'll send you details of the next audition round.`,
    surgery: `You're on the waitlist for the Audition Surgery. We'll let you know when dates are confirmed.`,
    ds: `Thanks for your enquiry about ${what}${s.tier ? " (" + s.tier + ")" : ""}. We'll be in touch to arrange your session.`,
    tape: `Thanks for your enquiry about ${what}${s.tier ? " (" + s.tier + ")" : ""}. We'll be in touch to arrange your session.`
  };
  await sendMail(env, {
    to: s.email,
    subject: `Leeds Actors Studio: your ${kind}`,
    text: `Hi ${first},\n\n${bodyFor[s.service]}\n\nIf you have any questions, just reply to this email.\n\nLeeds Actors Studio`,
    replyTo: env.LAS_NOTIFY || "leedsactorsstudio@gmail.com"
  });

  return json({ ok: true, count });
}
