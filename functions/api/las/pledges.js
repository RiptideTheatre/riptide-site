// GET /api/las/pledges?dates=2026-12-01,2027-01-12  →  {counts: {"2026-12-01": 3, ...}, min, cap}
import { json, pledgesFor, MIN, CAP } from "../../_lib/las.js";

export async function onRequestGet({ request, env }) {
  const dates = (new URL(request.url).searchParams.get("dates") || "").split(",").filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 8);
  const counts = {};
  for (const d of dates) counts[d] = (await pledgesFor(env, d)).length;
  return json({ counts, min: MIN, cap: CAP });
}
