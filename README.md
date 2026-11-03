# RivalScope

**The research engine behind irresistible brands** — paste your website and up to 3 competitors, and see how you compare, where the gaps are, and what to say instead. Stamp each report on **BOT Chain**.

- Live site: `https://YOUR_DOMAIN` *(fill in after GitHub Pages deploy)*
- Contract (BOT Chain mainnet, chain ID 677): `0x910CF2Aea22a90Ddb5BB0b0CDEAa71eceE2fF2CF` — https://scan.botchain.ai/address/0x910CF2Aea22a90Ddb5BB0b0CDEAa71eceE2fF2CF

> Automated, rule-based analysis of public web pages on a given date — **no AI, no API keys, free to run** — not statements of fact about any company. Every profile field quotes the page; if the quote isn't on the page, the field shows **"not shown"** instead of a guess.

---

## What's inside

| Route | What it is |
|---|---|
| `/` | Website: banner, navbar, 9 sections (hero · categories · intro · bento · 3-2-1 · sticky phone story · examples · level up · FAQ) + footer |
| `/app` | Step 1 · add your site + up to 3 rivals (status chip per row, paste-text fallback), optional industry / target customer |
| `/app/report/:id` | The report: Overview · Profiles · Compare · Positioning map · Gaps & opportunities · Rewrite · SEO snapshot · What changed |
| `/app/reports` | My reports (this browser only) |
| `/app?example=1` | Example report on the 3 fictional demo cafés |
| `/app?report=12` | Public proof page read from BOT Chain (domains, date, fingerprint, research history) |
| `/demo/brewly/` · `/demo/beanbox/` · `/demo/cuppa-club/` | Fictional demo landing pages used by the example |

**How a report is built**
1. **Read** — each page is read once (Worker `/extract-url`, or in the browser for same-site demo pages): title, meta description, H1/H2, main text (≤ 6k words), prices, button texts, favicon and a few signals (video, blog link, logo strip, testimonials, CTA above the fold).
2. **Code** — the SEO snapshot and the 11-row compare table are computed in `assets/scope.js`.
3. **Profiles** — headline, promise, audience, value props, offer, CTA, proof counts and tone, each with a quote copied from the page. Anything not found shows "not shown".
4. **Compare** — message themes found on each page give the "everyone says" / "nobody says" lists, 3 insights, top 3 actions, positioning scores (4 axes, 1–10 with the words that drove them) and 3 headline options from templates matched to the open gaps.
5. **Stamp** — `keccak256` of the canonical report + domains + site count + link to the previous report → `stamp()` on BOT Chain. Edited or re-run reports get a new fingerprint and link back.
6. **Re-run** — reads the same sites again and diffs the profiles field by field ("What changed": new headline, new CTA, pricing added/removed…).

All analysis runs in the browser. The Worker only fetches pages (browsers can't read other websites directly). Without a Worker, the demo sites and pasted text still work.

## Project layout

```
index.html              website + app shell (banner, navbar, sections, rail, footer, mascot SVG)
404.html                GitHub Pages SPA redirect (/app/report/x → /?p=/app/report/x)
assets/
  config.js             ← contract address, Worker URL, network, links (one place to edit)
  main.js               router, navbar, wallet button, modals, footer (address, live block, Matter.js sticker pile)
  site.js               home page motion: GSAP hero reveal, phone pixel grid, magnetic shapes, pixel words, story phone
  app.js                the app: add sites, analysing, report tabs, PDF, stamp, proof page, re-run, My reports
  scope.js              pure logic: URL checks, SEO, compare facts, evidence checks, rule-based analyser, diff, fingerprint
  extract-core.js       HTML → page facts + SSRF guard (shared by the Worker and the browser)
  chain.js · ui.js · styles.css · favicon.svg · botchain-*.png
contracts/
  RivalScopeReports.sol the contract
  test-reports.mjs      local test (solc + ganache), 18 checks
demo/                   3 fictional landing pages (Brewly = you, BeanBox, Cuppa Club)
worker/src/             index.js + extract.js (/extract-url — the page reader)
scripts/serve.mjs       local server that behaves like GitHub Pages
scripts/test-scope.mjs  logic tests on the demo sites (20 checks)
```

## Run locally

```bash
node scripts/serve.mjs 5181
```
Open http://localhost:5181 and try **See an example**. Tests: `node scripts/test-scope.mjs`.

To read real websites locally, also run the Worker (the app uses `http://127.0.0.1:8790` automatically on localhost):
```bash
npm --prefix worker install
npm --prefix worker run dev -- --port 8790 --ip 127.0.0.1
```
No API key is needed.

## Deploy

### 1. Contract (Remix)
1. Open https://remix.ethereum.org, paste `contracts/RivalScopeReports.sol`, compile with **0.8.24**, optimizer on (200). If the chain rejects the deploy with an invalid-opcode error, set **EVM version → paris** under Advanced.
2. **Testnet first:** MetaMask network *BOT Chain Testnet* — chain ID **968**, RPC `https://rpc.bohr.life`, explorer `https://scan.bohr.life`. Deploy, set `NETWORK: "testnet"` and `TESTNET_CONTRACT_ADDRESS` in `assets/config.js`, then stamp a report and open its proof link.
3. **Mainnet:** chain ID **677**, RPC `https://rpc.botchain.ai`, explorer `https://scan.botchain.ai`. Deploy, paste the address into `MAINNET_CONTRACT_ADDRESS`, set `NETWORK: "mainnet"`, and put it at the top of this README. The footer and "View on explorer" pick it up automatically.
4. Optional: verify the source on scan.botchain.ai.

Contract API: `stamp(bytes32 reportHash, string domains, uint8 sites, uint256 previous) → id` (2–4 sites, domains ≤ 160 bytes, `previous` = 0 or an earlier report of the same owner) · `getReport(id)` · `reportsOfOwner(addr)` · `history(id)` · `stats()` · `event Stamped(id, owner, sites)`. Ids start at 1. No tokens, payments or admin.

Local contract test (needs `npm i solc@0.8.24 ganache@7.9.2 ethers@6.13.4` next to the file):
```bash
node contracts/test-reports.mjs contracts/RivalScopeReports.sol assets/config.js
```

### 2. Worker (Cloudflare)
```bash
cd worker
npm install
npx wrangler kv namespace create RATE        # paste the id into wrangler.toml and uncomment the block
npx wrangler deploy
```
Set `ALLOWED_ORIGINS` in `wrangler.toml` to your site's origin(s) and paste the Worker URL into `WORKER_URL` in `assets/config.js`.
Using the shared Week 1 Worker instead? Copy `worker/src/extract.js` + `assets/extract-core.js` for `/extract-url`.

- Limit per IP per day: 40 page reads (needs the `RATE` KV). Cloudflare's free Workers plan is enough.
- Page reads: http/https only, private/internal addresses blocked on every redirect, 5 s timeout, 2 MB cap, no cookies, one page per site.
- No logging: observability is off and errors never include page text. No API keys or secrets.

### 3. Website (GitHub Pages)
Push the repo root to GitHub → Settings → Pages → deploy from the main branch. Add a `CNAME` file with your custom domain. `404.html` keeps deep links like `/app/report/…` working.

## Credits
Design direction inspired by the playful-technical style of modern product sites; all art (logo, Scout the mascot, stickers, mockups) is original. Libraries: ethers.js 6, GSAP 3 + ScrollTrigger, Matter.js, html2pdf.js. Fonts: Manrope, JetBrains Mono, Silkscreen (Google Fonts).
