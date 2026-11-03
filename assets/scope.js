// RivalScope pure logic — no DOM. Validation, SEO snapshot, compare-table facts, evidence checks,
// the rule-based demo analyser (used when no Worker is connected or the AI fails), diffs and the fingerprint input.
import { wordCount, findPrices } from "./extract-core.js";

export const BRAND_COLORS = ["#5138DE", "#FC42A2", "#00A148", "#FE9F7B"];
export const ROLE_LABEL = (i) => (i === 0 ? "You" : `Rival ${i}`);
export const NOT_SHOWN = "not shown";

export const AXES = {
  simple_advanced: ["Simple", "Advanced"],
  budget_premium: ["Budget", "Premium"],
  playful_serious: ["Playful", "Serious"],
  individuals_teams: ["For individuals", "For teams"],
};

export const COMPARE_ROWS = [
  { key: "trial", label: "Free trial" },
  { key: "pricing", label: "Pricing on page" },
  { key: "guarantee", label: "Guarantee" },
  { key: "testimonials", label: "Testimonials" },
  { key: "logos", label: "Customer logos" },
  { key: "numbers", label: "Numbers / stats" },
  { key: "video", label: "Demo / video" },
  { key: "cta", label: "Clear CTA above the fold" },
  { key: "blog", label: "Blog / resources" },
  { key: "meta", label: "Meta description" },
  { key: "h1", label: "H1 present" },
];

const ROW_PHRASE = { trial: "a free trial", pricing: "your pricing", guarantee: "a guarantee", testimonials: "customer quotes", logos: "customer logos", numbers: "a few real numbers", video: "a demo video", cta: "a clear button above the fold", blog: "a blog or guides link", meta: "a meta description", h1: "an H1 headline" };

// ---------- URLs ----------
export function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) return { error: "empty" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return { error: "That doesn't look like a web address." }; }
  if (!["http:", "https:"].includes(u.protocol)) return { error: "Only http:// and https:// addresses work." };
  const host = u.hostname.toLowerCase();
  const local = /^(localhost|127\.0\.0\.1)$/.test(host);
  if (!local && (!host.includes(".") || /\.$/.test(host) || /[^a-z0-9.-]/.test(host))) return { error: "That doesn't look like a web address." };
  u.hash = "";
  return { url: u.toString(), domain: domainOf(u.toString()) };
}
export function domainOf(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    // Demo sites live in sub-folders of one host: name them by folder so they stay distinct.
    const demo = u.pathname.match(/\/demo\/([a-z0-9-]+)/i);
    return demo ? `${demo[1]}.demo` : host;
  } catch { return String(url || "").slice(0, 60); }
}

// ---------- SEO snapshot (computed in code, not by AI) ----------
const STOP = new Set("a an and are as at be but by can do for from get has have how i if in into is it its just more my no not of on or our out so that the their them then there these they this to up us was we what when which who will with you your yours it's we're you're don't can't than too very all any also only per every each one".split(" "));
export function topKeywords(text, n = 8) {
  const counts = new Map();
  for (const w of String(text).toLowerCase().match(/[\p{L}][\p{L}'’-]{2,}/gu) || []) {
    const k = w.replace(/['’]s$/, "");
    if (STOP.has(k) || k.length < 3) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}
export function seoSnapshot(p) {
  return {
    title: p.title || "",
    titleLen: (p.title || "").length,
    meta: p.metaDescription || "",
    metaLen: (p.metaDescription || "").length,
    h1: p.h1 || [],
    h2Count: (p.h2 || []).length,
    words: p.words ?? wordCount(p.text || ""),
    keywords: topKeywords([p.title, ...(p.h1 || []), ...(p.h2 || []), p.text].join("\n")),
    pasted: !!p.pasted,
  };
}
export function seoNotes(s) {
  const notes = [];
  if (s.pasted) return ["Pasted text — title, meta and headings can't be checked."];
  if (!s.titleLen) notes.push("No page title");
  else if (s.titleLen < 30) notes.push("Title is short (aim for 30–60 characters)");
  else if (s.titleLen > 60) notes.push("Title may be cut off in search (over 60 characters)");
  if (!s.metaLen) notes.push("No meta description");
  else if (s.metaLen < 70) notes.push("Meta description is short (aim for 70–160)");
  else if (s.metaLen > 160) notes.push("Meta description may be cut off (over 160)");
  if (!s.h1.length) notes.push("No H1 heading");
  else if (s.h1.length > 1) notes.push(`${s.h1.length} H1 headings (one is clearer)`);
  if (s.words < 250) notes.push("Thin page (under 250 words)");
  return notes;
}

// ---------- compare-table facts (computed in code) ----------
const RX = {
  trial: /\bfree trial\b|\btry (it )?(for )?free\b|\bstart (for )?free\b|\b\d+[- ]day (free )?trial\b|\bfirst (box|bag|month|order|lesson|class|session) (is )?free\b|\bfree for \d+ days\b/i,
  guarantee: /\bguarantee[ds]?\b|\bmoney[- ]back\b|\brefund(ed)?\b|\brisk[- ]free\b|\bno questions asked\b/i,
  testimonials: /[“"][^”"]{15,200}[”"]\s*[—–-]\s*[A-Z]/,
  logos: /\b(trusted by|as seen (in|on)|featured (in|on)|used by teams at|our (clients|customers|partners))\b/i,
  numbers: /\b\d{1,3}(?:[,.]\d{3})+\+?|\b\d+(?:\.\d)?\s?(?:%|★|\/5\b|k\+?\b|m\+?\b)|\b\d{2,}\+?\s+(?:customers|users|members|clients|teams|orders|reviews|subscribers|countries|cafés|cafes|cups|bags|drinkers|students|businesses|downloads)\b/i,
  video: /\bwatch (the |our )?(demo|video)\b|\bwatch how\b|\bbook a demo\b|\bsee it in action\b/i,
};
export function compareFacts(p) {
  const text = [p.title, ...(p.h1 || []), ...(p.h2 || []), p.text].join("\n");
  const sig = p.signals; // null for pasted text
  return {
    trial: RX.trial.test(text),
    pricing: (p.prices || []).length > 0,
    guarantee: RX.guarantee.test(text),
    testimonials: (sig?.testimonials || 0) > 0 || RX.testimonials.test(text),
    logos: (sig?.logos || 0) > 0 || RX.logos.test(text),
    numbers: RX.numbers.test(text),
    video: sig ? sig.video || RX.video.test(text) : RX.video.test(text) || null,
    cta: sig ? !!sig.ctaAboveFold : null,
    blog: sig ? !!sig.blog : null,
    meta: sig ? !!p.metaDescription : null,
    h1: sig ? (p.h1 || []).length > 0 : null,
  };
}

// ---------- evidence checks ----------
const norm = (s) => String(s || "").toLowerCase().replace(/[“”«»„]/g, '"').replace(/[‘’`]/g, "'").replace(/[–—]/g, "-").replace(/[^\p{L}\p{N}$€£%★]+/gu, " ").replace(/\s+/g, " ").trim();
export function corpusOf(p) {
  return norm([p.title, p.metaDescription, ...(p.h1 || []), ...(p.h2 || []), ...(p.buttons || []), (p.prices || []).join(" "), p.text].join("\n"));
}
export function quoteFound(quote, corpus) {
  const q = norm(quote);
  if (!q) return false;
  if (corpus.includes(q)) return true;
  // allow small cuts: the first and last 5 words both appear in order
  const w = q.split(" ");
  if (w.length < 6) return false;
  const a = corpus.indexOf(w.slice(0, 5).join(" "));
  return a >= 0 && corpus.indexOf(w.slice(-5).join(" "), a) >= 0;
}
const isNotShown = (v) => !v || /^not shown\.?$/i.test(String(v).trim());
const clipW = (s, n) => { const w = String(s || "").trim().split(/\s+/); return w.length > n ? w.slice(0, n).join(" ") + "…" : w.join(" "); };
const TONES = ["playful", "premium", "technical", "friendly", "bold", "calm", "minimal", "warm", "expert", "fun", "serious", "luxurious", "practical", "earnest", "quirky", "urgent"];

/** Clean an AI (or demo) profile: clamp lengths; any field whose quote isn't on the page becomes "not shown". */
export function verifyProfile(raw, page) {
  const corpus = corpusOf(page);
  let dropped = 0;
  const field = (f, maxWords) => {
    const value = String(f?.value ?? "").trim();
    const quote = String(f?.quote ?? "").trim().replace(/^["“]|["”]$/g, "");
    if (isNotShown(value)) return { value: NOT_SHOWN, quote: "" };
    if (!quoteFound(quote, corpus)) { dropped++; return { value: NOT_SHOWN, quote: "" }; }
    return { value: clipW(value, maxWords), quote: clipW(quote, 24) };
  };
  const num = (n) => Math.max(0, Math.min(99, parseInt(n, 10) || 0));
  const proofQuote = String(raw?.proof?.quote ?? "").trim();
  const toneQuote = String(raw?.toneQuote ?? "").trim();
  return {
    headline: field(raw?.headline, 20),
    promise: field(raw?.promise, 16),
    audience: field(raw?.audience, 10),
    valueProps: (Array.isArray(raw?.valueProps) ? raw.valueProps : []).map((v) => field(v, 12)).filter((v) => v.value !== NOT_SHOWN).slice(0, 3),
    offer: field(raw?.offer, 14),
    cta: field(raw?.cta, 6),
    proof: {
      testimonials: num(raw?.proof?.testimonials),
      logos: num(raw?.proof?.logos),
      numbers: num(raw?.proof?.numbers),
      quote: quoteFound(proofQuote, corpus) ? clipW(proofQuote, 24) : "",
    },
    tone: [...new Set((Array.isArray(raw?.tone) ? raw.tone : []).map((t) => String(t).toLowerCase().trim()).filter((t) => TONES.includes(t)))].slice(0, 4),
    toneQuote: quoteFound(toneQuote, corpus) ? clipW(toneQuote, 24) : "",
    _dropped: dropped,
  };
}

// ---------- rule-based demo analyser ----------
const sentences = (text) => String(text).split(/\n|(?<=[.!?])\s+(?=[A-Z“"])/).map((s) => s.trim()).filter((s) => s.length > 3);
const GENERIC_H2 = /^(faq|faqs|questions|pricing|reviews|testimonials|how it works|contact|about|blog|journal|our story|get started|why us|features)$/i;

const TONE_WORDS = {
  playful: /!|\b(fun|yay|love|tasty|brag|zero fuss|oops|hey|woo|happy)\b|[☕🎉😍✨]/gi,
  premium: /\b(premium|finest|curated|artisan|crafted|small[- ]batch|specialty|single origin|exclusive|luxury)\b/gi,
  technical: /\b(data|api|platform|integrat\w*|analytics|algorithm|dashboard|workflow|automat\w*)\b/gi,
  friendly: /\b(you|your|we|our|us)\b/gi,
  bold: /\b(best|ever|never|only|guaranteed|unbeatable|switch)\b/gi,
  calm: /\b(ritual|slow|calm|gentle|quiet|simple|story)\b/gi,
  practical: /\b(save|price|prices|cheap|cheaper|value|deal|free shipping|cost|lower)\b/gi,
  warm: /\b(community|together|family|members|club|neighbourhood|neighborhood|people)\b/gi,
};
function toneOf(text) {
  const words = Math.max(50, wordCount(text));
  const scores = Object.entries(TONE_WORDS).map(([k, re]) => [k, ((text.match(re) || []).length / words) * (k === "friendly" ? 0.25 : 1)]);
  const top = scores.filter(([, s]) => s > 0.004).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  return top.length ? top : ["practical"];
}

export function demoProfile(page) {
  const text = page.text || "";
  const ss = sentences(text);
  const headline = page.h1?.[0] || page.title || ss[0] || "";
  const after = ss.filter((s) => s !== headline && wordCount(s) >= 8);
  const promiseS = after[0] || page.metaDescription || "";
  const audM = text.match(/\b(?:built|made|designed|perfect|ideal|great) for ([^.,!?\n—–]{3,50})/i) || text.match(/\bfor (small \w+|busy \w+|teams?\b[^.,!?\n]{0,30}|coffee lovers|home baristas|families|students|freelancers|startups)/i);
  const vps = (page.h2 || []).filter((h) => !GENERIC_H2.test(h)).slice(0, 3);
  const vpList = vps.length ? vps : ss.filter((s) => wordCount(s) <= 10 && wordCount(s) >= 3 && s !== headline).slice(0, 3);
  const priceS = page.prices?.length ? ss.find((s) => s.includes(page.prices[0])) : ss.find((s) => RX.trial.test(s));
  const ctaText = page.buttons?.[0] || ss.find((s) => /^(start|get|try|join|book|order|shop|subscribe|sign up|buy)\b/i.test(s) && wordCount(s) <= 6) || "";
  const stats = ss.filter((s) => RX.numbers.test(s));
  const quotes = (text.match(/[“"][^”"]{15,200}[”"]/g) || []).length;
  const logos = page.signals?.logos || (RX.logos.test(text) ? 1 : 0);
  const tone = toneOf([headline, text].join("\n"));
  const toneRe = TONE_WORDS[tone[0]];
  const toneS = ss.find((s) => { toneRe.lastIndex = 0; return toneRe.test(s); }) || headline;
  const f = (v, q = v) => (v ? { value: v, quote: q } : { value: NOT_SHOWN, quote: "" });
  return {
    headline: f(headline),
    promise: f(clipW(promiseS.replace(/[.!]$/, ""), 14), promiseS),
    audience: audM ? f(clipW(audM[1].trim(), 8), audM[0]) : f(""),
    valueProps: vpList.map((v) => f(clipW(v, 10), v)),
    offer: priceS ? f(clipW(priceS.replace(/[.!]$/, ""), 12), priceS) : f(""),
    cta: f(ctaText),
    proof: { testimonials: Math.max(page.signals?.testimonials || 0, quotes), logos, numbers: stats.length, quote: stats[0] || "" },
    tone,
    toneQuote: toneS,
  };
}

const FOOD = /\b(coffee|tea|food|meals?|bak(e|ery|ed)|snacks?|grocer\w*|recipes?|restaurant|caf[eé]s?|kitchen|flowers?|produce|beans?|wine|beer)\b/i;
const SUBSCRIPTION = /\b(subscri\w*|per month|\/mo|monthly|membership|plans?|deliver(y|ed|ies)|orders?|box(es)?|shipping)\b/i;
// Messaging themes used to spot "everyone says" / "nobody says".
// `fit` limits a theme to markets where it makes sense (no "freshness" advice for a software site).
export const THEMES = [
  { key: "speed", label: "speed", re: /\b(fast|faster|quick|quickly|in minutes|same[- ]day|next[- ]day|(24|48) ?(h|hrs?|hours?)|(in|within|under) \d+ (minutes|mins|hours|hrs)|delivered (today|tomorrow)|instant(ly)?)\b/i, angle: "Fast, no waiting", why: "Nobody promises how quickly it arrives; time is a benefit buyers notice." },
  { key: "price", label: "low prices", re: /\b(cheap|cheaper|low(est)? price|best price|save \d+%|save money|affordable|great prices|value|from \$?\d)/i, angle: "Worth paying for", why: "When rivals race to the bottom on price, owning quality-for-money makes you the confident choice." },
  { key: "premium", label: "premium quality", re: /\b(premium|finest|high[- ]quality|specialty|artisan|crafted|small[- ]batch)\b/i, angle: "Quality that shows", why: "A clear quality story gives buyers a reason beyond price." },
  { key: "flex", fit: SUBSCRIPTION, label: "cancel anytime", re: /\b(cancel anytime|cancel any time|pause|skip|no commitment|no contract)\b/i, angle: "No-strings flexibility", why: "Flexibility removes the fear of committing — say it plainly." },
  { key: "fresh", fit: FOOD, label: "freshness", re: /\b(fresh|freshly|roasted (this|every|on)|never stale)\b/i, angle: "Freshest on the market", why: "Freshness is easy to feel and hard for big rivals to match." },
  { key: "ease", label: "ease of use", re: /\b(easy|easier|effortless|no[- ]code|hassle[- ]free|user[- ]friendly|beginner[- ]friendly|get started in)\b/i, angle: "Effortless from day one", why: "If nobody promises it's easy, being the simple choice lowers the barrier to trying you." },
  { key: "time", label: "saving time", re: /\b(save[sd]? (you )?time|time[- ]saving|hours (a|per|every) week|automat(e|es|ed|ically)|on autopilot)\b/i, angle: "Gives you time back", why: "Time saved is a benefit everyone understands — and no one here claims it." },
  { key: "results", label: "proven results", re: /\b(results|proven|outcomes?|roi|grow(th)?|boost|increase[sd]?|success stories)\b/i, angle: "Results you can see", why: "Showing outcomes, not features, answers the buyer's real question: will it work for me?" },
  { key: "trust", label: "security & privacy", re: /\b(secure|security|privacy|private|encrypted|gdpr|compliant|safe space|safe and)\b/i, angle: "Safe and private by default", why: "Trust is a deciding factor that rivals leave unspoken." },
  { key: "eco", label: "sustainability", re: /\b(sustainab\w*|eco|planet|carbon|compostable|recyclable|ethical|fair trade|direct trade)\b/i, angle: "Kind to the planet", why: "A growing group of buyers choose on impact; nobody here speaks to them." },
  { key: "personal", label: "personalisation", re: /\b(personali[sz]ed|tailored|quiz|matched to you|your taste|just for you)\b/i, angle: "Made just for you", why: "Personal picks make a subscription feel like a service, not a product." },
  { key: "community", label: "community", re: /\b(community|members|club|join \d|together)\b/i, angle: "Belong to something", why: "Community turns customers into fans who stay longer." },
  { key: "inclusive", label: "inclusion", re: /\b(everyone|for all|inclusive|inclusion|diverse|diversity|underrepresented|accessible|belong(ing)?)\b/i, angle: "Made for everyone", why: "A clear welcome to people who feel left out is a strong reason to choose you." },
  { key: "learning", label: "learning & growth", re: /\b(learn(ing)?|courses?|workshops?|mentor(ing|ship|s)?|upskill\w*|career|training|bootcamp)\b/i, angle: "Grow your skills with us", why: "People choose the place that helps them get better, not just the product." },
  { key: "expert", label: "expertise", re: /\b(expert|barista|roaster'?s notes|brew guide|years of experience|award)/i, angle: "Expert guidance included", why: "Teaching customers builds trust and makes the product easier to love." },
  { key: "support", label: "human support", re: /\b(support|help(ful)? team|real people|chat with us|24\/7)\b/i, angle: "Real humans, real help", why: "Easy access to people is reassuring when nobody else offers it." },
  { key: "story", label: "origin story", re: /\b(story|farm|origin|harvest|traceable|transparent)\b/i, angle: "Know where it comes from", why: "Transparency is a trust signal few rivals use." },
  { key: "local", label: "local roots", re: /\b(local(ly)?|neighbou?rhood|near you|family[- ]run|independent|hometown)\b/i, angle: "Proudly local", why: "Local roots build trust and loyalty that big rivals can't copy." },
  { key: "free", fit: SUBSCRIPTION, label: "free offers", re: /\b(free shipping|first (box|bag|month|order) (is )?free|free trial|try (it )?free)\b/i, angle: "Try before you commit", why: "A low-risk first step lowers the barrier to buying." },
];
const themeHits = (p) => {
  const t = [p.title, ...(p.h1 || []), ...(p.h2 || []), p.metaDescription, p.text].join("\n");
  return THEMES.filter((th) => th.re.test(t)).map((th) => th.key);
};

const AXIS_WORDS = {
  simple_advanced: [/\b(simple|easy|zero fuss|no fuss|just|one click|effortless|beginner\w*|no[- ]code)\b/gi, /\b(advanced|pro|enterprise|api|integrations?|analytics|technical|custom\w*|precision|data|configur\w*|single origin|specialty|tasting notes|grind)\b/gi],
  budget_premium: [/\b(cheap\w*|save|best price|low(er)? price|affordable|deal|value|from \$?\d)\b/gi, /\b(premium|finest|small[- ]batch|specialty|artisan|crafted|luxury|curated)\b/gi],
  playful_serious: [/!|\b(fun|tasty|brag|love|yay|happy|fuss)\b|[☕🎉😍✨]/gi, /\b(precision|quality|expert|professional|serious|ritual|story)\b/gi],
  individuals_teams: [/\b(you|your|morning|home|me|my|yourself|personal)\b/gi, /\b(team|teams|office|business|businesses|companies|organi[sz]ations?|employers?|enterprise|partners|company|staff|colleagues|workplace)\b/gi],
};
function axisScore(p, axis) {
  const t = [p.title, ...(p.h1 || []), ...(p.h2 || []), p.text].join("\n");
  const [l, r] = AXIS_WORDS[axis];
  const lw = t.match(l) || [], rw = t.match(r) || [];
  const scale = axis === "individuals_teams" ? 0.25 : 1;
  let score = 5.5 + (rw.length - lw.length * scale) * 0.9;
  if (axis === "budget_premium" && p.prices?.length) {
    const n = parseFloat(String(p.prices[0]).replace(/[^\d.]/g, ""));
    if (n) score += n >= 14 ? 1 : n <= 10 ? -1 : 0;
  }
  score = Math.round(Math.max(1, Math.min(10, score)));
  const words = [...new Set([...(score >= 6 ? rw : lw)].map((w) => w.toLowerCase().trim()).filter((w) => w.length > 2))].slice(0, 3);
  const reason = words.length ? `Page uses ${words.map((w) => `“${w}”`).join(", ")}` : "Few signals on the page — placed near the middle";
  return { score, reason };
}

const REWRITE_TEMPLATES = {
  ease: [["Easier than you'd expect", "{brand} is built so {customer} can get started in minutes, not weeks.", "Get started"]],
  time: [["Get your hours back", "{brand} takes the busywork off your plate, so {customer} can focus on what matters.", "Save time"]],
  results: [["See the difference, not just the features", "{brand} is about real outcomes for {customer} — here's what changes when you join.", "See how"]],
  trust: [["Safe, private, and yours", "{brand} keeps {customer} protected, so you can focus on everything else.", "Learn more"]],
  inclusive: [["Made for everyone, built with you", "{brand} welcomes {customer} of every background — no gatekeeping, no jargon.", "Join us"]],
  learning: [["Grow your skills, one step at a time", "{brand} helps {customer} learn, practise and move forward with people who get it.", "Start learning"]],
  local: [["Proudly local, made for you", "{brand} is rooted in the place {customer} call home.", "Visit us"]],
  price: [["Worth it — not just cheap", "Skip the bargain race — {brand} is for {customer} who want something they'll actually look forward to.", "See why"]],
  premium: [["Quality you can see from day one", "{brand} puts care into every step, so {customer} get something genuinely better.", "See the difference"]],
  flex: [["Your plan, your rules", "Pause, skip or change anytime — {brand} fits around {customer}, not the other way round.", "Start your way"]],
  fresh: [["Fresh enough to notice", "{brand} gets it to {customer} while it's at its best — not after months on a shelf.", "Get it fresh"]],
  speed: [["From us to you, fast", "No waiting around: {brand} gets {customer} what they need quickly, every time.", "Get started"], ["Less waiting, more enjoying", "{brand} is built for {customer} who don't want to wait for good things.", "Order now"]],
  eco: [["Good for you, kinder to the planet", "{brand} helps {customer} make a choice they feel good about.", "Choose better"]],
  personal: [["Tailored to you, not to everyone", "Tell {brand} what you need and get something shaped around {customer} like you.", "Find my fit"]],
  community: [["Join people who care as much as you", "{brand} is more than a product — it's a crowd of {customer} who share tips and favourites.", "Join us"]],
  expert: [["Expert help in every box", "{brand} shows {customer} how to get the most out of every order — no guesswork.", "Learn more"]],
  support: [["Real people, ready to help", "Questions? {brand} answers fast, so {customer} are never left guessing.", "Talk to us"]],
  story: [["Know exactly where it comes from", "{brand} shows {customer} the story behind every order, start to finish.", "Meet the makers"]],
  free: [["Try it first, decide later", "Start small with {brand} and see if it's right for {customer} — no pressure.", "Try it"]],
};
function fillTpl(t, brand, customer) {
  const [h, s, c] = t;
  const sub = s.replace("{brand}", brand).replace(/\{customer\}/g, customer || "people");
  return { headline: h, subheadline: sub.charAt(0).toUpperCase() + sub.slice(1), cta: c };
}
const brandName = (site) => {
  const t = (site.page?.title || "").split(/\s[—|–-]\s/)[0].trim();
  return t && t.length <= 30 ? t : site.domain.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
};

/** Rule-based comparison with the same shape the AI returns. sites: [{domain, page, profile, facts}] */
export function demoCompare(sites, ctx = {}) {
  const n = sites.length;
  const hits = sites.map((s) => themeHits(s.page));
  const count = (k) => hits.filter((h) => h.includes(k)).length;
  const crowded = THEMES.filter((t) => count(t.key) >= 2).sort((a, b) => count(b.key) - count(a.key));
  const allText = sites.map((x) => [x.page.title, ...(x.page.h1 || []), ...(x.page.h2 || []), x.page.text].join("\n")).join("\n");
  const PRIORITY = ["speed", "ease", "time", "results", "trust", "personal", "support", "inclusive", "learning", "community", "expert", "story", "local", "eco", "free", "price", "premium", "flex", "fresh"];
  const rank = (t) => { const i = PRIORITY.indexOf(t.key); return i < 0 ? 99 : i; };
  const open = THEMES.filter((t) => count(t.key) === 0 && (!t.fit || t.fit.test(allText))).sort((a, b) => rank(a) - rank(b));
  const youOnly = THEMES.filter((t) => hits[0].includes(t.key) && count(t.key) === 1);
  const rivals = sites.slice(1);

  const insights = [];
  const priceRivals = rivals.filter((s, i) => hits[i + 1].includes("price")).length;
  if (priceRivals >= 2 && open[0]) insights.push(`${priceRivals === rivals.length ? (rivals.length === 2 ? "Both" : `All ${rivals.length}`) : priceRivals} rivals lead with price — nobody talks about ${open[0].label}`);
  else if (crowded[0] && open[0]) insights.push(`${count(crowded[0].key)} of ${n} sites talk about ${crowded[0].label} — nobody talks about ${open[0].label}`);
  for (const row of COMPARE_ROWS) {
    if (insights.length >= 2) break;
    const mine = sites[0].facts[row.key];
    const theirs = rivals.map((s) => s.facts[row.key]);
    if (mine === false && theirs.length && theirs.every((v) => v === true)) insights.push(`Every rival shows ${row.label.toLowerCase()} — your page doesn't`);
    else if (mine === true && theirs.every((v) => v === false)) insights.push(`Only you show ${row.label.toLowerCase()} — make more of it`);
  }
  if (youOnly[0]) insights.push(`Only you talk about ${youOnly[0].label} — that's an angle to own`);
  const yourProof = sites[0].profile.proof, rivalProof = rivals.reduce((a, s) => a + s.profile.proof.testimonials + s.profile.proof.numbers + s.profile.proof.logos, 0);
  if (insights.length < 3) insights.push(yourProof.testimonials + yourProof.numbers + yourProof.logos === 0 && rivalProof ? "Rivals show social proof (quotes, numbers, logos) — you show none" : `Your tone reads ${sites[0].profile.tone.join(" · ")}`);
  while (insights.length < 3) insights.push(crowded[insights.length] ? `${crowded[insights.length].label[0].toUpperCase() + crowded[insights.length].label.slice(1)} is a crowded message here` : "Few overlaps — the market's messaging is still open");

  const actions = [];
  if (open[0]) actions.push(`Lead your hero with “${open[0].angle.toLowerCase()}” if it's true for you`);
  const missing = COMPARE_ROWS.filter((r) => sites[0].facts[r.key] === false && rivals.some((s) => s.facts[r.key] === true));
  if (missing[0]) actions.push(`Add ${ROW_PHRASE[missing[0].key]}${missing[1] ? ` and ${ROW_PHRASE[missing[1].key]}` : ""} to your homepage`);
  const youCrowd = crowded.find((t) => hits[0].includes(t.key));
  if (youCrowd) actions.push(`Say less about ${youCrowd.label} — it's what everyone says`);
  if (!sites[0].facts.meta && sites[0].facts.meta !== null) actions.push("Write a meta description for search results");
  if (youOnly[0] && actions.length < 3) actions.push(`Make “${youOnly[0].label}” more prominent — only you say it`);
  while (actions.length < 3) actions.push(["Add one customer quote near your main button", "Put your price or offer above the fold", "Test one of the new headlines below"][actions.length]);

  const positioning = Object.fromEntries(Object.keys(AXES).map((ax) => [ax, sites.map((s, i) => ({ site: i, ...axisScore(s.page, ax) }))]));

  const everyoneSays = crowded.slice(0, 5).map((t) => ({
    message: t.label[0].toUpperCase() + t.label.slice(1),
    why: `${count(t.key)} of ${n} sites say it, so it no longer helps anyone stand out.`,
    sites: hits.map((h, i) => (h.includes(t.key) ? i : -1)).filter((i) => i >= 0),
  }));
  const nobodySays = open.slice(0, 5).map((t) => ({ angle: t.angle, why: t.why, key: t.key }));

  const brand = brandName(sites[0]);
  const customer = ctx.customer || "";
  const rewrites = [];
  for (const t of [...open, ...youOnly]) {
    if (rewrites.length >= 3) break;
    const tpl = REWRITE_TEMPLATES[t.key]?.[0];
    if (tpl) rewrites.push({ ...fillTpl(tpl, brand, customer), gap: t.angle });
  }
  return { insights: insights.slice(0, 3), actions: actions.slice(0, 3), positioning, everyoneSays, nobodySays, rewrites };
}

/** Next "Another" headline in demo mode — cycles templates the report hasn't used yet. */
export function demoAnotherRewrite(sites, compare, ctx = {}) {
  const used = new Set(compare.rewrites.map((r) => r.headline));
  const brand = brandName(sites[0]);
  const keys = [...compare.nobodySays.map((x) => x.key).filter(Boolean), ...Object.keys(REWRITE_TEMPLATES)];
  for (const k of keys) for (const tpl of REWRITE_TEMPLATES[k] || []) {
    if (used.has(tpl[0])) continue;
    const th = THEMES.find((t) => t.key === k);
    return { ...fillTpl(tpl, brand, ctx.customer), gap: th?.angle || k };
  }
  return null;
}

// ---------- diff (re-run) ----------
const flat = (site) => ({
  Headline: site.profile.headline.value,
  "Main promise": site.profile.promise.value,
  "Who it's for": site.profile.audience.value,
  "Offer / pricing": site.profile.offer.value,
  "Main CTA": site.profile.cta.value,
  "Value props": site.profile.valueProps.map((v) => v.value).join(" · ") || NOT_SHOWN,
  "Prices on page": (site.page.prices || []).join(", ") || "none",
  "Page title": site.seo.title || "none",
  "Meta description": site.seo.meta || "none",
});
export function diffSites(oldSites, newSites) {
  const out = [];
  for (const ns of newSites) {
    const os = oldSites.find((s) => s.domain === ns.domain);
    if (!os) { out.push({ domain: ns.domain, field: "Site", before: "—", after: "Added to this report" }); continue; }
    const a = flat(os), b = flat(ns);
    for (const k of Object.keys(b)) {
      if (norm(a[k]) === norm(b[k])) continue;
      let label = k;
      if (k === "Prices on page") label = a[k] === "none" ? "Pricing added" : b[k] === "none" ? "Pricing removed" : "Prices changed";
      out.push({ domain: ns.domain, field: label, before: a[k], after: b[k] });
    }
  }
  return out;
}

// ---------- fingerprint ----------
export function stableStringify(v) {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter((k) => v[k] !== undefined && !k.startsWith("_")).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
/** What the fingerprint covers: date, sites (domain/url/profile/SEO/facts) and the comparison. */
export function reportCore(r) {
  return {
    v: 1,
    createdAt: r.createdAt,
    industry: r.industry || "",
    customer: r.customer || "",
    sites: r.sites.map((s) => ({ domain: s.domain, url: s.url, source: s.source, profile: s.profile, seo: s.seo, facts: s.facts })),
    compare: r.compare,
  };
}
export function domainsString(r) {
  let s = r.sites.map((x) => x.domain).join(", ");
  while (new TextEncoder().encode(s).length > 160) s = s.slice(0, -2) + "…";
  return s;
}
export { wordCount, findPrices };
