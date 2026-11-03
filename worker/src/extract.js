// POST /extract-url { url } → page facts (title, meta description, H1/H2, main text, prices, buttons, favicon, signals).
// Safety: http/https only, public hosts on default ports (checked on every redirect hop), 5s timeout, 2 MB cap, no cookies.
// Homepage only: the path is dropped, so only the site's front page is read.
import { extractPage, blockedHost } from "../../assets/extract-core.js";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

async function readCapped(res) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) { await reader.cancel(); throw Object.assign(new Error("too large"), { code: "too_large" }); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

export async function extractUrl(raw) {
  let url;
  try {
    let s = String(raw || "").trim();
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    url = new URL(s);
    // One page only (no crawling): the URL the user pasted, usually their homepage.
  } catch { return { status: 400, body: { error: "bad_url" } }; }
  try {
    let res;
    for (let hop = 0; ; hop++) {
      if (blockedHost(url)) return { status: 400, body: { error: "blocked" } };
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "RivalScopeBot/1.0 (+reads one public homepage for a competitor comparison)", Accept: "text/html,application/xhtml+xml" },
      });
      if (res.status < 300 || res.status >= 400) break;
      const next = res.headers.get("Location");
      if (!next || hop >= MAX_REDIRECTS) return { status: 502, body: { error: "fetch_failed" } };
      url = new URL(next, url);
    }
    if (res.status === 401 || res.status === 403) return { status: 502, body: { error: "protected" } };
    if (!res.ok) return { status: 502, body: { error: "fetch_failed" } };
    if (!/text\/html|application\/xhtml/i.test(res.headers.get("Content-Type") || "")) return { status: 415, body: { error: "not_html" } };
    const out = extractPage(await readCapped(res), url.toString());
    if (out.words < 15) return { status: 422, body: { error: "no_text" } }; // login wall, bot check or a JavaScript-only page
    return { status: 200, body: { ...out, url: url.toString() } };
  } catch (e) {
    if (e?.code === "too_large") return { status: 413, body: { error: "too_large" } };
    if (e?.name === "TimeoutError" || e?.name === "AbortError") return { status: 504, body: { error: "timeout" } };
    return { status: 502, body: { error: "fetch_failed" } };
  }
}
