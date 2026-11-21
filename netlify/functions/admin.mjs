import { blobStore } from "../../lib/store.mjs";
import { admin, passwordOk } from "../../lib/logic.mjs";

export const config = { path: "/api/admin" };

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!passwordOk(req.headers.get("x-admin-password"), process.env.ADMIN_PASSWORD)) {
    return json({ ok: false, error: "Wrong password" }, 401);
  }
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "Bad request" }, 400); }
  try {
    return json(await admin(blobStore(), body));
  } catch (e) {
    return json({ ok: false, error: "server error" }, 500);
  }
};
