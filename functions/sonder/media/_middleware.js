// Guards the walk's audio, photos and route: ticket holders only.
import { readSonderSession } from "../../_lib/sonder.js";

export async function onRequest({ request, env, next }) {
  if (!(await readSonderSession(env, request))) return new Response("Ticket needed", { status: 403, headers: { "Cache-Control": "no-store" } });
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, max-age=86400");
  out.headers.set("X-Robots-Tag", "noindex");
  return out;
}
