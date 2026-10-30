// Guards everything under /reset/members/: the days page, the audio and the PDF.
// No valid sign-in → back to the Reset page to book or sign in.
import { readSession, redirect } from "../../_lib/reset.js";

export async function onRequest(context) {
  const { request, env } = context;
  const s = await readSession(env, request);
  if (!s) {
    const wantsPage = (request.headers.get("Accept") || "").includes("text/html");
    if (wantsPage) return redirect("/reset/?members=1#signin");
    return new Response("Sign in to Reset to open this.", { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const res = await context.next();
  const range = request.headers.get("Range");

  // Audio players (Safari especially) need byte ranges to play and to skip.
  // If the host returned the whole file, answer the range ourselves.
  if (range && res.status === 200 && /^(audio|video)\//.test(res.headers.get("Content-Type") || "")) {
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    if (m) {
      const buf = await res.arrayBuffer();
      const size = buf.byteLength;
      let start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
      let end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Cache-Control": "private, no-store" } });
      }
      const h = new Headers(res.headers);
      h.set("Content-Range", `bytes ${start}-${end}/${size}`);
      h.set("Content-Length", String(end - start + 1));
      h.set("Accept-Ranges", "bytes");
      h.set("Cache-Control", "private, no-store");
      h.delete("Content-Encoding");
      return new Response(buf.slice(start, end + 1), { status: 206, headers: h });
    }
  }

  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, no-store");
  out.headers.set("X-Robots-Tag", "noindex");
  if (/^(audio|video)\//.test(out.headers.get("Content-Type") || "")) out.headers.set("Accept-Ranges", "bytes");
  return out;
}
