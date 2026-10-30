// Receives the Project Intimacy questionnaire from Riptide's own page and passes it
// to the Google Form, so responses keep landing in the same Google Sheet.
// Nothing is stored here.
import form from "../../../src/_data/piForm.json";

const questions = form.pages.flatMap((p) => p.groups.flatMap((g) => g.questions));
const byEntry = new Map(questions.map((q) => [q.entry, q]));
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request" }, 400); }
  const answers = body && typeof body.answers === "object" ? body.answers : {};
  const other = body && typeof body.other === "object" ? body.other : {};

  const params = new URLSearchParams();
  const missing = [];
  for (const q of questions) {
    let v = answers[q.entry];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (empty) { if (q.required) missing.push(q.entry); continue; }
    const name = q.entry === "emailAddress" ? "emailAddress" : `entry.${q.entry}`;
    const list = Array.isArray(v) ? v : [v];
    for (let item of list) {
      item = String(item).slice(0, 5000);
      if (q.sendAsOther) {
        // Start dates come from the website's run list, so Google receives them through
        // the question's "Other" option and they never need retyping in the form.
        if (!/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2}(st|nd|rd|th) [A-Z][a-z]+$/.test(item)) return json({ error: "Unknown option", entry: q.entry }, 400);
        params.append(name, "__other_option__");
        params.append(`${name}.other_option_response`, item);
        continue;
      }
      if (q.options) {
        if (item === "__other_option__" && q.other) {
          const text = String(other[q.entry] || "").trim().slice(0, 500);
          if (!text) { if (q.required) missing.push(q.entry); continue; }
          params.append(name, "__other_option__");
          params.append(`${name}.other_option_response`, text);
          continue;
        }
        if (!q.options.includes(item)) return json({ error: "Unknown option", entry: q.entry }, 400);
        // Corrected labels on the site, original option names in the Google Form
        if (q.sendMap && q.sendMap[item]) item = q.sendMap[item];
      }
      params.append(name, item);
    }
  }
  for (const k of Object.keys(answers)) if (!byEntry.has(k)) return json({ error: "Unknown question" }, 400);
  if (missing.length) return json({ error: "Missing required answers", missing }, 400);

  params.append("pageHistory", form.pages.map((_, i) => i).join(","));
  params.append("fvv", "1");

  const res = await fetch(`https://docs.google.com/forms/d/e/${env.PI_FORM_ID || form.formId}/formResponse`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    redirect: "follow",
  });
  if (!res.ok) {
    console.log("Google Form refused the questionnaire", res.status);
    return json({ error: "Could not send" }, 502);
  }
  return json({ ok: true });
}

