import assert from "node:assert/strict";
import { checkin, admin, newKey, isExpired, passwordOk } from "./lib/logic.mjs";

const mem = new Map();
const store = {
  get: async (k) => (mem.has(k) ? structuredClone(mem.get(k)) : null),
  set: async (k, v) => void mem.set(k, structuredClone(v)),
  delete: async (k) => void mem.delete(k),
  list: async (p) => [...mem.keys()].filter((k) => k.startsWith(p)),
};
const D1 = "device-aaaa-1111", D2 = "device-bbbb-2222", D3 = "device-cccc-3333";
const now = Date.parse("2026-11-21T10:00:00Z");

assert.match(newKey(), /^KP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
assert.equal((await checkin(store, { key: "KP-NOPE-NOPE-NOPE", device: D1 }, now)).enabled, false);
assert.equal((await checkin(store, { key: "x", device: "y" }, now)).message, "Invalid license key");

const { license } = await admin(store, { action: "create", name: "Buyer A", maxDevices: 2, expires: "" }, now);
const key = license.key;

let r = await checkin(store, { key, device: D1, version: "1.9", paid: 3, verified: 2, etb: 4500 }, now);
assert.equal(r.enabled, true);
r = await checkin(store, { key: key.toLowerCase(), device: D2, paid: 1, verified: 1, etb: 500 }, now);
assert.equal(r.enabled, true);
r = await checkin(store, { key, device: D3 }, now);
assert.equal(r.enabled, false);
assert.match(r.message, /Device limit/);
// a known device is still fine at the limit, and its counts are replaced (cumulative), not added
r = await checkin(store, { key, device: D1, paid: 5, verified: 4, etb: 7000 }, now);
assert.equal(r.enabled, true);

let list = await admin(store, { action: "list" }, now);
let row = list.licenses[0];
assert.equal(row.devices, 2);
assert.equal(row.paid, 6);
assert.equal(row.verified, 5);
assert.equal(row.etb, 7500);

// remote switch off / on, with a message
await admin(store, { action: "update", key, enabled: false, message: "Payment due" }, now);
r = await checkin(store, { key, device: D1 }, now);
assert.deepEqual([r.enabled, r.message], [false, "Payment due"]);
await admin(store, { action: "update", key, enabled: true, message: "" }, now);
assert.equal((await checkin(store, { key, device: D1 }, now)).enabled, true);

// expiry: works through the end of the day (Addis Ababa), then stops
await admin(store, { action: "update", key, expires: "2026-11-21" }, now);
assert.equal((await checkin(store, { key, device: D1 }, Date.parse("2026-11-21T20:00:00Z"))).enabled, true);  // 23:00 Addis
assert.equal((await checkin(store, { key, device: D1 }, Date.parse("2026-11-21T21:30:00Z"))).enabled, false); // 00:30 next day
assert.equal(isExpired("", now), false);

// raise the device limit
await admin(store, { action: "update", key, expires: "", maxDevices: 3 }, now);
assert.equal((await checkin(store, { key, device: D3 }, now)).enabled, true);

// garbage numbers cannot break the totals
await checkin(store, { key, device: D3, paid: -5, verified: "abc", etb: 1e30 }, now);
const devs = (await admin(store, { action: "devices", key })).devices;
assert.equal(devs.length, 3);
assert.ok(devs.every((d) => d.paid >= 0 && d.verified >= 0 && d.etb <= 1e12));

// delete removes the key and its devices
await admin(store, { action: "delete", key }, now);
assert.equal((await admin(store, { action: "list" }, now)).licenses.length, 0);
assert.equal([...mem.keys()].length, 0);

assert.equal(passwordOk("abc", "abc"), true);
assert.equal(passwordOk("abd", "abc"), false);
assert.equal(passwordOk("abc", ""), false);
assert.equal(passwordOk("", "abc"), false);
console.log("all tests passed");
