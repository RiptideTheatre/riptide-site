// GET /api/reset/verify?token=…  — the link in the sign-in email.
import { useSignInToken, getBuyer, activeRun, makeSessionCookie, redirect } from "../../_lib/reset.js";

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get("token");
  const email = await useSignInToken(env, token);
  const run = email && activeRun(await getBuyer(env, email));
  if (!run) return redirect("/reset/?error=link#signin");
  return redirect("/reset/members/", { "Set-Cookie": await makeSessionCookie(env, email, run) });
}
