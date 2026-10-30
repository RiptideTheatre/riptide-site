// GET /api/gift/info?code=XXXX-XXXX-XXXX
// The recipient's view of a gift: who it's from, their message, and when it runs.
import { json } from "../../_lib/reset.js";
import { getGift, giftView, cleanCode } from "../../_lib/gift.js";

export async function onRequestGet({ request, env }) {
  const code = cleanCode(new URL(request.url).searchParams.get("code"));
  if (!code) return json({ error: "code" }, 400);
  const gift = await getGift(env, code);
  if (!gift) return json({ error: "code" }, 404);
  return json(await giftView(env, request, gift));
}
