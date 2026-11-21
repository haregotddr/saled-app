import { blobStore } from "../../lib/store.mjs";
import { checkin } from "../../lib/logic.mjs";

export const config = { path: "/api/checkin" };

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return json({ enabled: false, message: "POST only" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ enabled: false, message: "Bad request" }, 400); }
  try {
    return json(await checkin(blobStore(), body));
  } catch (e) {
    // A server problem must not look like a switch-off: the app treats a 5xx as "could not reach".
    return json({ error: "server error" }, 500);
  }
};
