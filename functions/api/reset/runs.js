// GET /api/reset/runs  — the upcoming start dates, for the booking form.
import { upcomingRuns, runLabel, json } from "../../_lib/reset.js";

export async function onRequestGet({ env }) {
  return json({ runs: upcomingRuns(env).map((r) => ({ value: r, label: runLabel(r) })) });
}
