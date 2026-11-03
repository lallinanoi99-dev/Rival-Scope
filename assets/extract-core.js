// Pure HTML → page facts. Shared by the Worker (/extract-url) and the browser (demo mode, pasted text).
// No DOM needed: a regex pass that keeps the main readable text and the things RivalScope compares.
export const MAX_WORDS = 6000;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", euro: "€", pound: "£", yen: "¥", copy: "©", middot: "·", bull: "•", times: "×" };
const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
export const strip = (s) => decode(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
// Quoted or unquoted (minified HTML) attribute values.
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return decode(m ? m[1] ?? m[2] ?? m[3] ?? "" : "").trim();
};
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

function metaContent(html, key) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0];
    if (attr(t, "name").toLowerCase() === key || attr(t, "property").toLowerCase() === key) return attr(t, "content");
  }
  return "";
}

const PRICE_RE = /(?:[$€£¥₹]\s?\d{1,5}(?:[.,]\d{1,2})?|\b\d{1,5}(?:[.,]\d{1,2})?\s?(?:€|USD|EUR|GBP|IDR|SGD|AUD|CAD)\b|\b(?:USD|EUR|GBP|IDR|SGD|AUD|CAD)\s?\d{1,7}(?:[.,]\d{1,3})*)(?:\s?\/\s?(?:mo|month|yr|year|week|wk|bag|box|user|seat|cup)\b)?/g;
export const findPrices = (text) => uniq((String(text).match(PRICE_RE) || []).map((p) => p.replace(/\s+/g, " ").trim())).slice(0, 8);

export function wordCount(text) {
  return (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}
function capWords(text, max = MAX_WORDS) {
  let n = 0;
  const out = [];
  for (const line of String(text).split("\n")) {
    const w = wordCount(line);
    if (n + w > max) break;
    n += w;
    out.push(line);
  }
  return out.join("\n");
}

/** html → { title, metaDescription, h1, h2, text, words, prices, buttons, favicon, lang, signals } */
export function extractPage(html, pageUrl = "") {
  html = String(html || "");
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 200);
  const metaDescription = (metaContent(html, "description") || "").slice(0, 400);
  const ogTitle = metaContent(html, "og:title");
  const lang = attr(html.match(/<html\b[^>]*>/i)?.[0] || "", "lang").slice(0, 12);

  let favicon = "";
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/\bicon\b/i.test(attr(m[0], "rel"))) { favicon = attr(m[0], "href"); break; }
  }
  try { favicon = new URL(favicon || "/favicon.ico", pageUrl || undefined).toString(); } catch { favicon = ""; }
  if (/^javascript:/i.test(favicon)) favicon = "";

  // Signals read from the raw page (before nav/footer are removed).
  const blog = /href\s*=\s*["']?[^"'\s>]*\/(blog|resources|guides|articles|learn|journal|news|insights)\b/i.test(html)
    || /<a\b[^>]*>\s*(blog|resources|guides|journal)\s*<\/a>/i.test(html);
  const video = /<video\b|youtube(?:-nocookie)?\.com\/embed|player\.vimeo\.com|fast\.wistia|loom\.com\/embed|vidyard/i.test(html);
  const noChrome = html.replace(/<(nav|header)\b[\s\S]*?<\/\1>/gi, " ");
  const logoImgs = [...noChrome.matchAll(/<img\b[^>]*>/gi)].filter((m) => /logo/i.test(attr(m[0], "alt") + " " + attr(m[0], "class") + " " + attr(m[0], "src")));
  const logoSection = /class\s*=\s*["']?[^"'>]*\b(logos|logo-(strip|wall|cloud|grid)|clients|customers|trusted-by|partners|press|as-seen)\b/i.test(html);
  const logos = logoImgs.length || (logoSection ? 1 : 0);
  const testimonials = (html.match(/<blockquote\b/gi) || []).length
    || (html.match(/class\s*=\s*["']?[^"'>]*\b(testimonial|review)\b/gi) || []).length;

  let body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] || html;
  body = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|select|head)\b[\s\S]*?<\/\1>/gi, " ");

  // Buttons and CTAs: <button>, links styled as buttons, submit inputs.
  const btnRe = /<button\b[^>]*>([\s\S]*?)<\/button>|<a\b([^>]*\bclass\s*=\s*["']?[^"'>]*\b(?:btn|button|cta)[^>]*)>([\s\S]*?)<\/a>|<input\b[^>]*type\s*=\s*["']?submit\b[^>]*>/gi;
  const btnHits = [...body.matchAll(btnRe)].map((m) => ({
    i: m.index,
    t: strip(m[1] ?? m[3] ?? attr(m[0], "value")).replace(/[▸►→›»]+\s*$/u, "").trim(),
  })).filter((b) => b.t && b.t.length <= 48 && !/^(menu|close|×|x|search|toggle)$/i.test(b.t));
  const buttons = uniq(btnHits.map((b) => b.t)).slice(0, 12);

  const main = body.replace(/<(nav|footer|aside|header)\b[\s\S]*?<\/\1>/gi, (m) => (/<h1\b/i.test(m) ? m : " "));
  const firstH2 = main.search(/<h2\b/i);
  const heroEnd = firstH2 > 0 ? firstH2 : Math.floor(main.length * 0.3);
  const mainStart = body.indexOf(main.slice(0, 200)) || 0;
  const ctaAboveFold = btnHits.some((b) => b.i - mainStart < heroEnd + 400) || /<a\b[^>]*\bclass\s*=\s*["']?[^"'>]*\b(btn|button|cta)/i.test(main.slice(0, heroEnd));

  const h1 = [...main.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1])).filter(Boolean).slice(0, 4);
  const h2 = [...main.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => strip(m[1])).filter(Boolean).slice(0, 30);

  // Readable text in page order: block tags become line breaks (catches text in plain <div>s too).
  const BLOCK = /<\/?(div|section|article|main|header|p|li|ul|ol|h[1-6]|tr|td|th|blockquote|figure|figcaption|dd|dt|dl|label|button|table|form|br|hr)\b[^>]*>/gi;
  const seen = new Set();
  const lines = [];
  for (const raw of main.replace(BLOCK, "\n").split("\n")) {
    const t = strip(raw);
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    lines.push(t);
  }
  const text = capWords(lines.join("\n"));
  const plain = strip(main);

  return {
    title: title || ogTitle,
    metaDescription,
    h1,
    h2,
    text,
    words: wordCount(text),
    prices: findPrices(plain),
    buttons,
    favicon,
    lang,
    signals: { blog, video, logos, testimonials, ctaAboveFold },
  };
}

/** Pasted page text → the same shape (unknown structure → signals null). */
export function extractFromText(raw, label = "") {
  const text = capWords(String(raw || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
  const first = text.split("\n")[0] || "";
  return {
    title: label || first.slice(0, 120),
    metaDescription: "",
    h1: first ? [first.slice(0, 160)] : [],
    h2: [],
    text,
    words: wordCount(text),
    prices: findPrices(text),
    buttons: [],
    favicon: "",
    lang: "",
    signals: null,
    pasted: true,
  };
}

/** SSRF guard used by the Worker before every fetch hop. Returns a reason string or null. */
export function blockedHost(url) {
  if (!["http:", "https:"].includes(url.protocol)) return "scheme";
  if (url.username || url.password) return "credentials";
  if (url.port && url.port !== "80" && url.port !== "443") return "port";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|arpa|corp|intranet)$/.test(host) || (!host.includes(".") && !host.includes(":"))) return "private";
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return "private";
    if (a === 169 && b === 254) return "private";
    if (a === 172 && b >= 16 && b <= 31) return "private";
    if (a === 192 && b === 168) return "private";
    if (a === 100 && b >= 64 && b <= 127) return "private";
    if (a === 198 && (b === 18 || b === 19)) return "private";
    return null;
  }
  if (/^(0x[0-9a-f]*|\d+)(\.(0x[0-9a-f]*|\d+)){0,3}$/i.test(host)) return "private";
  if (host.includes(":")) return "private"; // no raw IPv6 literals at all
  return null;
}
