import { ensure } from "../recipe";
import { allowedResource, bytes } from "./schema";

export interface CommunityTransport { get(url: string, maxBytes: number): Promise<string> }
export class CommunityNetworkError extends Error {}
/** No note/model port, credentials, configurable origin, redirect or request body. */
export const communityTransport: CommunityTransport = {
  async get(url, maxBytes) {
    ensure(allowedResource(url), "recipe");
    const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      // requestUrl follows redirects without a veto; Fetch is required to reject them before transmission.
      const response = await fetch(url, { method: "GET", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: controller.signal });
      if (response.status !== 200 || response.redirected || response.url !== url) throw new CommunityNetworkError("response");
      const type = response.headers.get("content-type")?.split(";")[0];
      ensure(type === "application/json" || type === "text/plain", "recipe");
      const length = response.headers.get("content-length");
      ensure(length === null || /^\d+$/u.test(length) && Number(length) <= maxBytes, "size");
      ensure(response.body, "response"); const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true }); let raw = "", count = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          count += part.value.byteLength; ensure(count <= maxBytes, "size"); raw += decoder.decode(part.value, { stream: true });
        }
        raw += decoder.decode(); ensure(bytes(raw) <= maxBytes, "size"); return raw;
      } finally { await reader.cancel(); }
    } catch (e) {
      if (e instanceof TypeError || controller.signal.aborted) throw new CommunityNetworkError("offline");
      throw e;
    } finally { controller.abort(); window.clearTimeout(timer); }
  },
};
