// All the license rules. The store is any object with:
//   get(key) -> object | null,  set(key, obj),  delete(key),  list(prefix) -> [keys]
import { randomBytes, timingSafeEqual } from "node:crypto";

const LIC = "lic:";
const DEV = "dev:";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

const num = (v, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};
const clean = (v, max = 80) => String(v ?? "").trim().slice(0, max);

export function newKey() {
  const b = randomBytes(12);
  const part = (o) => Array.from({ length: 4 }, (_, i) => ALPHABET[b[o + i] % ALPHABET.length]).join("");
  return `KP-${part(0)}-${part(4)}-${part(8)}`;
}

const validKey = (k) => /^[A-Z0-9-]{6,40}$/.test(k);

/** expires is "" (never) or YYYY-MM-DD. The license works through the end of that day (Addis Ababa time, UTC+3). */
export function isExpired(expires, nowMs) {
  if (!expires) return false;
  const end = Date.parse(expires + "T23:59:59+03:00");
  return Number.isFinite(end) && nowMs > end;
}

/** What the app calls. Returns { enabled, message, expires }. */
export async function checkin(store, body, nowMs = Date.now()) {
  const key = clean(body?.key, 40).toUpperCase();
  const device = clean(body?.device, 64);
  if (!validKey(key) || !/^[A-Za-z0-9-]{8,64}$/.test(device)) {
    return { enabled: false, message: "Invalid license key" };
  }
  const lic = await store.get(LIC + key);
  if (!lic) return { enabled: false, message: "Unknown license key" };
  if (!lic.enabled) return { enabled: false, message: lic.message || "This license is switched off" };
  if (isExpired(lic.expires, nowMs)) return { enabled: false, message: `This license expired on ${lic.expires}` };

  const devKey = `${DEV}${key}|${device}`;
  const existing = await store.get(devKey);
  if (!existing) {
    const count = (await store.list(`${DEV}${key}|`)).length;
    if (lic.maxDevices > 0 && count >= lic.maxDevices) {
      return { enabled: false, message: `Device limit reached (${lic.maxDevices}). Ask the seller.` };
    }
  }
  await store.set(devKey, {
    key,
    device,
    first: existing?.first ?? nowMs,
    last: nowMs,
    version: clean(body?.version, 20),
    paid: num(body?.paid, 1e9),
    verified: num(body?.verified, 1e9),
    etb: num(body?.etb, 1e12),
  });
  return { enabled: true, message: lic.message || "", expires: lic.expires || "" };
}

// ---------- admin ----------

export function passwordOk(given, expected) {
  if (!expected || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function devicesOf(store, key) {
  const keys = await store.list(`${DEV}${key}|`);
  const out = [];
  for (const k of keys) {
    const d = await store.get(k);
    if (d) out.push(d);
  }
  return out;
}

export async function admin(store, body, nowMs = Date.now()) {
  const action = body?.action;
  if (action === "list") {
    const keys = await store.list(LIC);
    const out = [];
    for (const k of keys) {
      const lic = await store.get(k);
      if (!lic) continue;
      const devs = await devicesOf(store, lic.key);
      out.push({
        ...lic,
        expired: isExpired(lic.expires, nowMs),
        devices: devs.length,
        paid: devs.reduce((s, d) => s + d.paid, 0),
        verified: devs.reduce((s, d) => s + d.verified, 0),
        etb: devs.reduce((s, d) => s + d.etb, 0),
        lastSeen: devs.reduce((s, d) => Math.max(s, d.last), 0),
      });
    }
    out.sort((a, b) => b.created - a.created);
    return { ok: true, licenses: out };
  }
  if (action === "devices") {
    const key = clean(body.key, 40).toUpperCase();
    const devs = await devicesOf(store, key);
    devs.sort((a, b) => b.last - a.last);
    return { ok: true, devices: devs };
  }
  if (action === "create") {
    const key = newKey();
    const lic = {
      key,
      name: clean(body.name, 60),
      enabled: true,
      expires: /^\d{4}-\d{2}-\d{2}$/.test(body.expires || "") ? body.expires : "",
      maxDevices: Math.floor(num(body.maxDevices, 1000)) || 1,
      message: "",
      created: nowMs,
    };
    await store.set(LIC + key, lic);
    return { ok: true, license: lic };
  }
  if (action === "update") {
    const key = clean(body.key, 40).toUpperCase();
    const lic = await store.get(LIC + key);
    if (!lic) return { ok: false, error: "Unknown key" };
    if (typeof body.enabled === "boolean") lic.enabled = body.enabled;
    if (body.expires !== undefined) {
      lic.expires = /^\d{4}-\d{2}-\d{2}$/.test(body.expires) ? body.expires : "";
    }
    if (body.maxDevices !== undefined) lic.maxDevices = Math.floor(num(body.maxDevices, 1000));
    if (body.message !== undefined) lic.message = clean(body.message, 200);
    if (body.name !== undefined) lic.name = clean(body.name, 60);
    await store.set(LIC + key, lic);
    return { ok: true, license: lic };
  }
  if (action === "delete") {
    const key = clean(body.key, 40).toUpperCase();
    for (const k of await store.list(`${DEV}${key}|`)) await store.delete(k);
    await store.delete(LIC + key);
    return { ok: true };
  }
  return { ok: false, error: "Unknown action" };
}
