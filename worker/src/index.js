// RivalScope Worker — POST /extract-url
// Reads one public web page and returns its facts (title, meta, headings, text, prices, buttons, signals).
// All analysis happens in the browser with RivalScope's rule-based engine: no AI, no API keys, no cost.
// Vars: ALLOWED_ORIGINS (comma list). KV binding: RATE (optional, daily limit). Nothing is logged or stored.
import { extractUrl } from "./extract.js";

const LIMIT_PER_DAY = 40; // page reads per IP per day (needs the RATE KV)
const MAX_BODY = 4_000;

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });

async function rateLimit(env, req) {
  if (!env.RATE) return true; // no KV bound → no limit (dev)
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const key = `rs:extract:${new Date().toISOString().slice(0, 10)}:${ip}`;
  const n = parseInt((await env.RATE.get(key)) || "0", 10);
  if (n >= LIMIT_PER_DAY) return false;
  await env.RATE.put(key, String(n + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

export default {
  async fetch(req, env) {
    const h = corsHeaders(req, env);
    const origin = req.headers.get("Origin");
    if (origin && h["Access-Control-Allow-Origin"] !== origin) return json({ error: "forbidden_origin" }, 403, h);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (req.method !== "POST" || new URL(req.url).pathname !== "/extract-url") return json({ error: "not_found" }, 404, h);
    try {
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ error: "too_large" }, 413, h);
      if (!(await rateLimit(env, req))) return json({ error: "rate_limited" }, 429, h);
      let body = {};
      try { body = JSON.parse(text || "{}"); } catch { /* empty */ }
      const out = await extractUrl(body.url);
      return json(out.body, out.status, h);
    } catch {
      return json({ error: "fetch_failed" }, 502, h); // no page content in errors or logs
    }
  },
};
