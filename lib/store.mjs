import { getStore } from "@netlify/blobs";

/** Adapter: the Netlify Blobs store as the simple store the logic expects. */
export function blobStore() {
  const s = getStore("autopayer");
  return {
    get: (k) => s.get(k, { type: "json" }),
    set: (k, v) => s.setJSON(k, v),
    delete: (k) => s.delete(k),
    list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key),
  };
}
