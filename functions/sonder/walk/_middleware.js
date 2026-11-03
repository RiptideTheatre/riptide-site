// Guards /sonder/walk/: only ticket holders get in.
// ?key=… (the link in the welcome email) signs this phone in for the rest of the ticket.
import { redirect } from "../../_lib/reset.js";
import { readSonderSession, useWalkKey, makeSonderCookie, deviceStillIn } from "../../_lib/sonder.js";

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (key) {
    const before = await readSonderSession(env, request);
    const v = await useWalkKey(env, key, before && before.k === key ? before.d : null);
    if (!v) return redirect("/sonder/?error=link#book");
    if (v.full) return redirect("/sonder/?error=phones&n=" + v.full + "#book");
    url.searchParams.delete("key");
    return redirect(url.pathname + (url.search || ""), { "Set-Cookie": await makeSonderCookie(env, v.email, v.until, v.key, v.device) });
  }
  const session = await readSonderSession(env, request);
  if (!session) return redirect("/sonder/?signin=1#book");
  // the page itself checks this phone is still on the ticket; sound and photos only check the cookie
  const isPage = /\/(index\.html)?$/.test(url.pathname);
  if (isPage && !(await deviceStillIn(env, session))) return redirect("/sonder/?error=moved#book");
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, no-store");
  out.headers.set("X-Robots-Tag", "noindex");
  return out;
}
