// Logic tests for the extractor + demo analyser on the 3 fictional demo sites: node scripts/test-scope.mjs
import fs from "node:fs";
import { extractPage, extractFromText, blockedHost } from "../assets/extract-core.js";
import * as S from "../assets/scope.js";

const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const names = ["brewly", "beanbox", "cuppa-club"];
const sites = names.map((n) => {
  const url = `http://localhost:5181/demo/${n}/`;
  const page = extractPage(fs.readFileSync(`demo/${n}/index.html`, "utf8"), url);
  const facts = S.compareFacts(page);
  const profile = S.verifyProfile(S.demoProfile(page), page);
  return { url, domain: S.domainOf(url), page, facts, profile, seo: S.seoSnapshot(page) };
});
if (process.argv[2] === "-v") console.log(JSON.stringify(sites.map((s) => ({ d: s.domain, facts: s.facts, profile: s.profile, seo: S.seoNotes(s.seo) })), null, 1));
const cmp = S.demoCompare(sites, { customer: "home coffee lovers" });
if (process.argv[2] === "-v") console.log(JSON.stringify(cmp, null, 1));

ok(sites.map((s) => s.domain).join() === "brewly.demo,beanbox.demo,cuppa-club.demo", "demo domains named by folder");
ok(sites[1].facts.trial && sites[1].facts.testimonials && sites[1].facts.logos && sites[1].facts.numbers, "BeanBox: trial, testimonials, logos, numbers");
ok(sites[2].facts.guarantee && sites[2].facts.video && sites[2].facts.blog, "Cuppa Club: guarantee, video, blog");
ok(!sites[0].facts.trial && !sites[0].facts.testimonials && sites[0].facts.pricing && sites[0].facts.blog, "Brewly: no trial/testimonials, pricing + journal");
ok(sites.every((s) => s.profile._dropped === 0), "every demo evidence quote is found on its page");
ok(sites[0].profile.cta.value === "Start your subscription", "Brewly CTA");
ok(sites.every((s) => !/fictional/i.test(s.profile.promise.value)), "demo notice is not read as a promise");
ok(/price/i.test(cmp.insights[0]) && cmp.insights.length === 3, "first insight: rivals lead with price");
ok(cmp.everyoneSays.length >= 2 && cmp.nobodySays.length >= 3 && cmp.rewrites.length === 3, "gaps and 3 rewrites");
ok(Object.values(cmp.positioning).every((a) => a.length === 3 && a.every((x) => x.score >= 1 && x.score <= 10)), "positioning scores 1–10 for each site");
ok(cmp.positioning.budget_premium[0].score > cmp.positioning.budget_premium[1].score, "Brewly sits more premium than BeanBox");
ok(S.demoAnotherRewrite(sites, cmp, {}) !== null, "another rewrite available");

const bad = S.verifyProfile({ headline: { value: "Fastest coffee on earth", quote: "We are the fastest coffee on earth" } }, sites[0].page);
ok(bad.headline.value === "not shown" && bad._dropped === 1, "made-up quote becomes 'not shown'");
ok(S.normalizeUrl("brewly.cafe").url === "https://brewly.cafe/", "bare domain gets https");
ok(!!S.normalizeUrl("ftp://x.com").error && !!S.normalizeUrl("hello").error, "bad URLs rejected");
ok(blockedHost(new URL("http://192.168.1.4")) && blockedHost(new URL("http://[::1]")) && !blockedHost(new URL("https://example.com")), "private hosts blocked");
const pasted = extractFromText("Great Tea Co\nLoose-leaf tea for busy people. From £8 a tin.\nJoin 4,000 tea lovers.");
ok(pasted.prices[0] === "£8" && S.compareFacts(pasted).cta === null && S.compareFacts(pasted).numbers, "pasted text: prices, unknown signals");

const r = { createdAt: "2026-11-01T00:00:00Z", sites, compare: cmp };
ok(S.stableStringify(S.reportCore(r)) === S.stableStringify(S.reportCore(JSON.parse(JSON.stringify(r)))), "fingerprint input is stable");
const changed = structuredClone(sites);
changed[1].profile.cta.value = "Start saving"; changed[1].page.prices = [];
const d = S.diffSites(sites, changed);
ok(d.some((x) => x.field === "Main CTA") && d.some((x) => x.field === "Pricing removed"), "diff finds new CTA and pricing removed");
ok(new TextEncoder().encode(S.domainsString({ sites: Array(4).fill({ domain: "x".repeat(60) + ".com" }) })).length <= 160, "domains string ≤ 160 bytes");
