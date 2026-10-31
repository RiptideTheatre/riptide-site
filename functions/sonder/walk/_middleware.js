// Guards /sonder/walk/: only ticket holders get in.
// ?key=… (the link in the welcome email) signs this phone in for the rest of the ticket.
import { redirect } from "../../_lib/reset.js";
import { readSonderSession, useWalkKey, makeSonderCookie } from "../../_lib/sonder.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key) {
    const v = await useWalkKey(env, key);
    if (!v) return redirect("/sonder/?error=link#book");
    url.searchParams.delete("key");
    return redirect(url.pathname + (url.search || ""), { "Set-Cookie": await makeSonderCookie(env, v.email, v.until) });
  }
  if (!(await readSonderSession(env, request))) return redirect("/sonder/?signin=1#book");
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, no-store");
  out.headers.set("X-Robots-Tag", "noindex");
  return out;
}
