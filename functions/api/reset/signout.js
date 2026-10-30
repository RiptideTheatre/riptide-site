// POST /api/reset/signout
import { clearSessionCookie, redirect } from "../../_lib/reset.js";

export async function onRequestPost() {
  return redirect("/reset/?signedout=1#signin", { "Set-Cookie": clearSessionCookie() });
}
