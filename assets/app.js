// The RivalScope app: add sites → analysing → report tabs → export / stamp → proof page, re-run diff, My reports.
import { CONFIG, IS_DEPLOYED, NET } from "./config.js";
import * as S from "./scope.js";
import { extractPage, extractFromText } from "./extract-core.js";
import { $, $$, esc, toast, modal, closeModal, confirmBox, confetti, loadScript, nav, reduced } from "./ui.js";
import { wallet, onWallet, writeContract, readContract, txError, short, explorerTx, explorerAddr, keccakText, reportFromResult, hasMetaMask } from "./chain.js";

const STORE = "rivalscope.reports.v1";
const MAX_SITES = 4;
const WORKER = (CONFIG.WORKER_URL || "").replace(/\/$/, "");
const HTML2PDF = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
const TABS = [
  ["overview", "Overview", "#F5DA53"], ["profiles", "Profiles", "#FC42A2"], ["compare", "Compare", "#00A148"], ["map", "Positioning map", "#5138DE"],
  ["gaps", "Gaps & opportunities", "#FE9F7B"], ["rewrite", "Rewrite", "#8C77C9"], ["seo", "SEO snapshot", "#411C2A"], ["changes", "What changed", "#CDF4E0"],
];

// ---------- storage (this browser only) ----------
export function loadReports() { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } }
function saveReports(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { toast("Couldn't save — browser storage is full or blocked."); return false; }
}
const getReport = (id) => loadReports().find((r) => r.id === id);
function putReport(r) { const list = loadReports().filter((x) => x.id !== r.id); list.unshift(r); return saveReports(list.slice(0, 60)); }
const newId = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const color = (i) => S.BRAND_COLORS[i] || "#999";
const proofUrl = (id) => `${location.origin}/app?report=${id}`;

// ---------- worker ----------
async function post(path, body, ms = 60000) {
  const res = await fetch(WORKER + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw Object.assign(new Error(data.error || "http_" + res.status), { status: res.status });
  return data;
}
const READ_ERR = {
  blocked: "That address is private or not allowed.", timeout: "The page took longer than 5 seconds.", protected: "Login or bot protection.",
  no_text: "Almost no text — the page may need JavaScript or a login.", not_html: "That isn't a web page.", too_large: "The page is over 2 MB.",
  rate_limited: "Daily limit reached — try again tomorrow.", fetch_failed: "Couldn't load the page.", bad_url: "That doesn't look like a web address.",
  no_worker: "Live reading needs the RivalScope Worker — paste the page text instead.",
};

// ---------- app state ----------
let draft = freshDraft();
let view = { el: null, report: null, tab: "overview", axes: ["budget_premium", "simple_advanced"] };
let unsubWallet = null;
function freshDraft() {
  return { rows: [blankRow(), blankRow()], industry: "", customer: "", previousId: null, formErr: "" };
}
function blankRow() { return { input: "", url: "", domain: "", status: "idle", page: null, err: "", warn: "", pasteOpen: false, pasteText: "", source: "url", seq: 0 }; }

// ---------- entry ----------
export function renderApp(path, params) {
  const el = $("#appMain");
  view.el = el;
  el.onclick = null;
  unsubWallet?.(); unsubWallet = null;
  $$(".rail-nav a").forEach((a) => a.classList.remove("active"));
  const rail = (k) => $(`.rail-nav a[data-rail="${k}"]`)?.classList.add("active");

  if (params.get("report")) return renderProof(el, params.get("report"));
  if (params.get("example")) { rail("example"); return openExample(el); }
  const m = path.match(/^\/app\/report\/([\w-]+)/);
  if (m) {
    const r = getReport(m[1]);
    if (!r) return renderMissing(el, "That report isn't saved in this browser.", "Reports live only in the browser where you made them.");
    rail("reports");
    return renderReport(el, r, params.get("tab"));
  }
  if (/^\/app\/reports\/?$/.test(path)) { rail("reports"); return renderReports(el); }
  if (!/^\/app\/?$/.test(path)) return renderMissing(el, "Page not found", "Try starting a new report.");
  rail("new");
  renderNew(el);
}

function renderMissing(el, title, text) {
  el.innerHTML = `<div class="cell empty"><h2>${esc(title)}</h2><p class="app-sub">${esc(text)}</p><a class="pill pill-yellow" href="/app" data-link>New report ▸</a></div>`;
}

// =================== STEP 1 · ADD SITES ===================
function renderNew(el) {
  el.innerHTML = `
    <span class="mono-label">Step 1 · Add sites</span>
    <h1 class="app-h">Who are you up against?</h1>
    <p class="app-sub">Paste your website and up to 3 rivals. We read one public page per site — usually the homepage.</p>
    <div class="cell form-cell">
      <div class="site-rows" id="rows"></div>
      <button class="mono-link" id="addRival">+ Add rival</button>
      <div class="opt-grid">
        <label>Industry (optional)<input class="input" id="industry" maxlength="60" placeholder="e.g. coffee subscriptions"></label>
        <label>Target customer (optional)<input class="input" id="customer" maxlength="80" placeholder="e.g. small coffee shops"></label>
      </div>
      <div class="form-actions">
        <button class="pill pill-yellow big" id="analyze">Analyze ▸</button>
        <button class="mono-link" id="tryExample">Try the example sites ▸</button>
        <span class="form-err" id="formErr" role="alert"></span>
      </div>
      ${WORKER ? "" : `<p class="mode-note"><b>Offline mode:</b> the page reader (Worker) isn't connected, so only the demo sites or pasted text can be read. Start it with <code>npm --prefix worker run dev</code> or set <code>WORKER_URL</code> in <code>assets/config.js</code>.</p>`}
    </div>`;
  $("#industry").value = draft.industry;
  $("#customer").value = draft.customer;
  $("#industry").addEventListener("input", (e) => (draft.industry = e.target.value));
  $("#customer").addEventListener("input", (e) => (draft.customer = e.target.value));
  $("#addRival").addEventListener("click", () => {
    if (draft.rows.length >= MAX_SITES) return;
    draft.rows.push(blankRow());
    renderRows();
    $$("#rows input[type=url]").at(-1)?.focus();
  });
  $("#analyze").addEventListener("click", () => startAnalysis());
  $("#tryExample").addEventListener("click", () => { fillExample(); renderRows(); draft.rows.forEach((_, i) => readRow(i)); });
  renderRows();
}

function rowHtml(r, i) {
  const label = i === 0 ? "Your site" : `Rival ${i}`;
  const chip = {
    idle: "",
    reading: `<span class="status reading">Reading…</span>`,
    ok: `<span class="status ok" title="${esc(r.page?.title || r.domain)}">${r.page?.favicon ? `<img src="${esc(r.page.favicon)}" alt="" onerror="this.remove()">` : ""}✓ ${r.source === "paste" ? "Pasted text" : esc(r.page?.title || "Read")}</span>`,
    fail: `<span class="status fail">✗ Couldn't read</span>`,
  }[r.status];
  return `<div class="site-row" data-i="${i}">
    <label for="site${i}"><i class="bdot" style="--c:${color(i)}"></i>${label}</label>
    <input id="site${i}" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="${i === 0 ? "yoursite.com" : "rival.com"}" value="${esc(r.input)}" aria-invalid="${r.err && r.status !== "fail" ? "true" : "false"}">
    <span class="row-chip">${chip}</span>
    ${i >= 2 ? `<button class="row-x" data-x="${i}" aria-label="Remove ${label}">×</button>` : "<span></span>"}
    ${r.err ? `<div class="row-err">${esc(r.err)} ${r.status === "fail" && !r.pasteOpen ? `<button class="mono-link" data-paste="${i}">[Paste page text]</button>` : ""}</div>` : ""}
    ${r.warn ? `<div class="row-warn">⚠ ${esc(r.warn)}</div>` : ""}
    ${r.pasteOpen ? `<div class="paste-box"><textarea class="input" data-ptext="${i}" placeholder="Open the page in your browser, select all (⌘/Ctrl + A), copy and paste it here.">${esc(r.pasteText)}</textarea><div><button class="pill pill-ghost small" data-usepaste="${i}">Use this text</button></div></div>` : ""}
  </div>`;
}
function renderRows() {
  const box = $("#rows");
  if (!box) return;
  box.innerHTML = draft.rows.map(rowHtml).join("");
  $("#addRival").hidden = draft.rows.length >= MAX_SITES;
  $$("input[type=url]", box).forEach((inp) => {
    const i = +inp.closest(".site-row").dataset.i;
    inp.addEventListener("input", () => {
      const r = draft.rows[i];
      r.input = inp.value;
      if (r.status !== "idle" || r.err) { Object.assign(r, { status: "idle", page: null, err: "", warn: "", source: "url", pasteOpen: false }); updateRow(i); }
    });
    inp.addEventListener("change", () => readRow(i));
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); readRow(i); } });
  });
  box.onclick = (e) => {
    const x = e.target.closest("[data-x]");
    if (x) { draft.rows.splice(+x.dataset.x, 1); renderRows(); checkDuplicates(); return; }
    const p = e.target.closest("[data-paste]");
    if (p) { draft.rows[+p.dataset.paste].pasteOpen = true; updateRow(+p.dataset.paste); $(`[data-ptext="${p.dataset.paste}"]`)?.focus(); return; }
    const u = e.target.closest("[data-usepaste]");
    if (u) usePaste(+u.dataset.usepaste);
  };
  box.oninput = (e) => { const t = e.target.closest("[data-ptext]"); if (t) draft.rows[+t.dataset.ptext].pasteText = t.value; };
}
function updateRow(i) {
  const old = $(`.site-row[data-i="${i}"]`);
  if (!old) return;
  const focused = document.activeElement === $("input", old);
  const pos = focused ? $("input", old).selectionStart : null;
  const tmp = document.createElement("div");
  tmp.innerHTML = rowHtml(draft.rows[i], i);
  const fresh = tmp.firstElementChild;
  // keep the live input element so typing and focus aren't interrupted
  const inp = $("input", old);
  inp.setAttribute("aria-invalid", $("input", fresh).getAttribute("aria-invalid"));
  $("input", fresh).replaceWith(inp);
  old.replaceWith(fresh);
  if (focused) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch { /* ignore */ } }
}

function checkDuplicates() {
  const seen = new Map();
  draft.rows.forEach((r, i) => {
    const had = r.warn === "Same site as another row — results will repeat.";
    if (had) r.warn = "";
    if (r.domain && seen.has(r.domain)) r.warn = "Same site as another row — results will repeat.";
    else if (r.domain) seen.set(r.domain, i);
    if (had !== (r.warn === "Same site as another row — results will repeat.")) updateRow(i);
  });
}

async function readRow(i) {
  const r = draft.rows[i];
  if (!r || !r.input.trim()) { if (r) { r.err = ""; updateRow(i); } return; }
  const n = S.normalizeUrl(r.input);
  if (n.error) { Object.assign(r, { status: "idle", err: n.error, page: null }); updateRow(i); return; }
  if (r.status === "ok" && r.url === n.url) return;
  const seq = ++r.seq;
  Object.assign(r, { url: n.url, domain: n.domain, status: "reading", err: "", warn: "", page: null, source: "url", pasteOpen: false });
  updateRow(i);
  checkDuplicates();
  try {
    const page = await fetchPage(n.url);
    if (r.seq !== seq) return;
    Object.assign(r, { page, status: "ok" });
    if (page.words < 80) r.warn = "We found very little text — results may be thin.";
  } catch (e) {
    if (r.seq !== seq) return;
    Object.assign(r, { status: "fail", err: READ_ERR[e.message] || READ_ERR.fetch_failed });
  }
  updateRow(i);
  checkDuplicates();
}

async function fetchPage(url) {
  const u = new URL(url);
  if (u.origin === location.origin) {
    // Same-site pages (the demo cafés) are read right here in the browser.
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => { throw new Error("timeout"); });
    if (!res.ok) throw new Error("fetch_failed");
    const page = extractPage(await res.text(), url);
    if (page.words < 15) throw new Error("no_text");
    return page;
  }
  if (!WORKER) throw new Error("no_worker");
  return post("/extract-url", { url }, 12000);
}

function usePaste(i) {
  const r = draft.rows[i];
  const text = (r.pasteText || "").trim();
  if (text.split(/\s+/).length < 15) { toast("Paste a bit more of the page — at least a few sentences."); return; }
  const n = S.normalizeUrl(r.input);
  r.domain = n.domain || r.domain || `site${i + 1}`;
  r.url = n.url || r.url || "";
  r.page = extractFromText(text, r.domain);
  Object.assign(r, { status: "ok", source: "paste", err: "", pasteOpen: false, warn: r.page.words < 80 ? "We found very little text — results may be thin." : "" });
  updateRow(i);
  checkDuplicates();
}

function fillExample() {
  draft = freshDraft();
  draft.rows = CONFIG.DEMO_SITES.map((p) => ({ ...blankRow(), input: location.origin + p }));
  draft.industry = "Coffee subscriptions";
  draft.customer = "home coffee lovers";
  const ind = $("#industry"), cus = $("#customer");
  if (ind) ind.value = draft.industry;
  if (cus) cus.value = draft.customer;
}

async function startAnalysis() {
  const errEl = $("#formErr");
  const setErr = (m) => { if (errEl) errEl.textContent = m; };
  setErr("");
  draft.rows = draft.rows.filter((r, i) => i < 2 || r.input.trim() || r.source === "paste");
  renderRows();
  const filled = draft.rows.filter((r) => r.input.trim() || r.source === "paste");
  if (!draft.rows[0].input.trim() && draft.rows[0].source !== "paste") { setErr("Add your own site first."); $("#site0")?.focus(); return; }
  if (filled.length < 2) { setErr("Add at least one rival."); $("#site1")?.focus(); return; }
  for (let i = 0; i < draft.rows.length; i++) {
    const r = draft.rows[i];
    if (r.source === "paste") continue;
    if (!r.input.trim()) continue;
    const n = S.normalizeUrl(r.input);
    if (n.error) { r.err = n.error; updateRow(i); setErr("Fix the highlighted address."); return; }
  }
  $("#analyze").classList.add("is-busy");
  await Promise.all(draft.rows.map((r, i) => (r.status === "ok" || !r.input.trim() ? null : readRow(i))));
  $("#analyze")?.classList.remove("is-busy");
  const rows = draft.rows.filter((r) => r.status === "ok");
  if (draft.rows.some((r) => r.input.trim() && r.status !== "ok")) { setErr("Some sites couldn't be read — paste their text or remove them."); return; }
  if (rows.length < 2 || draft.rows[0].status !== "ok") { setErr("Add at least one rival."); return; }
  const report = await runPipeline({ rows, industry: draft.industry.trim(), customer: draft.customer.trim(), previousId: draft.previousId });
  if (report) { draft = freshDraft(); nav.go(`/app/report/${report.id}${report.previousId ? "?tab=changes" : ""}`); }
}

// =================== STEP 2 · ANALYSING ===================
const STEPS = ["Reading pages", "Building profiles", "Comparing", "Finding gaps", "Writing headlines"];
async function runPipeline({ rows, industry, customer, previousId, example }) {
  const el = view.el;
  el.innerHTML = `<div class="cell analysing" aria-live="polite">
    <span class="mono-label">Step 2 · Analysing ${rows.length} sites</span>
    <h1 class="app-h">Reading the room…</h1>
    <ol class="an-steps">${STEPS.map((s, i) => `<li data-s="${i}"><span class="pix" style="--c:${["#FE9F7B", "#FC42A2", "#F5DA53", "#CDF4E0", "#8C77C9"][i]}">${i + 1}</span>${s}</li>`).join("")}</ol>
    <p class="mode-note">Rule-based analysis — no AI, runs in your browser.</p>
  </div>`;
  const pace = reduced() ? 0 : 450;
  const step = async (i) => {
    $$(".an-steps li", el).forEach((li) => { const s = +li.dataset.s; li.classList.toggle("done", s < i); li.classList.toggle("on", s === i); });
    if (pace) await new Promise((r) => setTimeout(r, pace));
  };
  const ctx = { industry, customer };
  try {
    await step(0);
    const sites = rows.map((r, i) => {
      const page = r.page;
      return {
        role: i === 0 ? "you" : "rival", url: r.url, domain: r.domain || S.domainOf(r.url), source: r.source, pasteText: r.source === "paste" ? r.pasteText.slice(0, 40000) : undefined,
        page, facts: S.compareFacts(page), seo: S.seoSnapshot(page), thin: page.words < 80,
      };
    });
    await step(1);
    // every profile field keeps a quote copied from the page; anything not found shows "not shown"
    for (const s of sites) s.profile = S.verifyProfile(S.demoProfile(s.page), s.page);
    await step(2);
    await step(3);
    const compare = S.demoCompare(sites, ctx);
    await step(4);
    const report = {
      id: newId(), createdAt: new Date().toISOString(), industry, customer, previousId: previousId || null, example: !!example,
      mode: "rules",
      sites: sites.map((s) => ({ ...s, page: slimPage(s.page) })), compare, stamp: null,
    };
    await step(5);
    putReport(report);
    return report;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="cell empty"><h2>Something went wrong</h2><p class="app-sub">The analysis stopped unexpectedly. Your sites are still filled in.</p><button class="pill pill-yellow" id="back">Back to sites ▸</button></div>`;
    $("#back").onclick = () => renderNew(el);
    return null;
  }
}
function slimPage(p) { const { text, ...rest } = p; return rest; } // the page text isn't kept after analysis

// =================== STEP 3 · REPORT ===================
function analysisLabel(r) {
  return `${r.mode === "ai" ? "AI" : "Automated"} analysis of public web pages on ${fmtDate(r.createdAt)}`;
}
async function currentHash(r) { return keccakText(S.stableStringify(S.reportCore(r))); }

function renderReport(el, r, tab) {
  view.report = r;
  const prev = r.previousId ? getReport(r.previousId) : null;
  view.tab = TABS.some(([k]) => k === tab) && (tab !== "changes" || prev) ? tab : "overview";
  const tabs = TABS.filter(([k]) => k !== "changes" || prev);
  el.innerHTML = `
    <div class="rep-head">
      <div>
        <span class="mono-label">${r.example ? "Example report · fictional demo sites" : "Report"} · ${fmtDateTime(r.createdAt)}</span>
        <h1 class="rep-title">${esc(r.sites[0].domain)} vs ${r.sites.length - 1} rival${r.sites.length > 2 ? "s" : ""}</h1>
        <div class="rep-sites">${r.sites.map((s, i) => `<span class="chip" style="--c:${color(i)}">${esc(s.domain)}${s.source === "paste" ? " · pasted" : ""}</span>`).join("")}</div>
        <span class="rep-label">${esc(analysisLabel(r))}</span>
      </div>
      <div class="rep-actions desk">
        <button class="pill pill-ghost small" data-act="rerun">↻ Re-run</button>
        <button class="pill pill-ghost small" data-act="pdf">Download PDF report</button>
        <button class="pill pill-yellow small" data-act="stamp">Stamp on BOT Chain ▸</button>
      </div>
    </div>
    ${r.sites.some((s) => s.thin) ? `<div class="banner-note">⚠ We found very little text on ${r.sites.filter((s) => s.thin).map((s) => esc(s.domain)).join(", ")} — results may be thin.</div>` : ""}
    <div class="tabs" role="tablist">${tabs.map(([k, l, c]) => `<button role="tab" data-tab="${k}" aria-selected="${k === view.tab}"><i class="sq" style="--c:${c}"></i>${l}</button>`).join("")}</div>
    <div id="panel" class="panel" role="tabpanel"></div>
    <div id="stampBox"></div>
    <div class="mobile-bar"><button class="pill pill-ghost" data-act="pdf">Export</button><button class="pill pill-yellow" data-act="stamp">Stamp ▸</button></div>`;
  $(".tabs", el).addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    view.tab = b.dataset.tab;
    $$(".tabs button", el).forEach((x) => x.setAttribute("aria-selected", x === b));
    history.replaceState(null, "", `/app/report/${r.id}?tab=${view.tab}`);
    renderPanel();
  });
  el.onclick = (e) => {
    const a = e.target.closest("[data-act]");
    if (!a) return;
    ({ rerun: () => rerun(r), pdf: () => exportPdf(r), stamp: () => stamp(r), })[a.dataset.act]?.();
  };
  renderPanel();
  renderStampBox();
  unsubWallet = onWallet(() => renderStampBox());
}

function renderPanel() {
  const r = view.report, p = $("#panel");
  p.style.animation = "none"; void p.offsetWidth; p.style.animation = "";
  p.innerHTML = ({ overview: tabOverview, profiles: tabProfiles, compare: tabCompare, map: tabMap, gaps: tabGaps, rewrite: tabRewrite, seo: tabSeo, changes: tabChanges })[view.tab](r);
  if (view.tab === "map") wireMap(p);
  if (view.tab === "rewrite") wireRewrite(p);
}

// ----- Overview -----
function tabOverview(r) {
  const c = r.compare;
  return `<div class="ov-grid">
    <div class="ov-insights">
      ${c.insights.map((t, i) => `<div class="cell insight"><span class="n" style="--c:${["#F5DA53", "#FC42A2", "#CDF4E0"][i]}">0${i + 1}</span><span>${esc(t)}</span></div>`).join("")}
      <div class="cell ov-actions"><h3>Your top 3 actions</h3><ol>${c.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ol></div>
    </div>
    <div class="cell ov-map"><h3>Positioning map</h3>${mapSvg(r, view.axes[0], view.axes[1], false)}${legend(r)}<button class="mono-link" data-goto="map">Open the full map ▸</button></div>
  </div>`;
}
function legend(r) { return `<div class="rep-sites">${r.sites.map((s, i) => `<span class="chip" style="--c:${color(i)}">${i === 0 ? "You" : esc(s.domain)}</span>`).join("")}</div>`; }
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) $(`.tabs [data-tab="${g.dataset.goto}"]`)?.click();
});

// ----- Profiles -----
function pf(label, f) {
  const ns = f.value === S.NOT_SHOWN;
  return `<div class="pf"><span>${label}</span><span class="v${ns ? " ns" : ""}">${esc(f.value)}</span>${f.quote && !ns ? `<span class="ev">“${esc(f.quote)}”</span>` : ""}</div>`;
}
function tabProfiles(r) {
  return `<div class="prof-grid">${r.sites.map((s, i) => {
    const p = s.profile;
    return `<article class="cell prof" style="--c:${color(i)}">
      <div class="prof-head"><b>${s.page.favicon ? `<img src="${esc(s.page.favicon)}" alt="" onerror="this.remove()"> ` : ""}${esc(s.domain)}</b><span class="chip ${i ? "chip-pink" : ""}" ${i ? "" : `style="--c:${color(0)}"`}>${S.ROLE_LABEL(i)}</span></div>
      ${pf("Headline", p.headline)}
      ${pf("Main promise", p.promise)}
      ${pf("Who it's for", p.audience)}
      <div class="pf"><span>Top value props</span>${p.valueProps.length ? `<ul>${p.valueProps.map((v) => `<li><span class="v">${esc(v.value)}</span><br><span class="ev">“${esc(v.quote)}”</span></li>`).join("")}</ul>` : `<span class="v ns">${S.NOT_SHOWN}</span>`}</div>
      ${pf("Offer / pricing", p.offer)}
      ${pf("Main CTA", p.cta)}
      <div class="pf"><span>Social proof found (counted, not judged)</span><div class="proof-counts"><span class="chip">${p.proof.testimonials} testimonials</span><span class="chip">${p.proof.logos} logos</span><span class="chip">${p.proof.numbers} numbers</span></div>${p.proof.quote ? `<span class="ev">“${esc(p.proof.quote)}”</span>` : ""}</div>
      <div class="pf"><span>Tone</span><div class="tone-tags">${(p.tone.length ? p.tone : ["—"]).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>${p.toneQuote ? `<span class="ev">“${esc(p.toneQuote)}”</span>` : ""}</div>
      ${p._dropped ? `<span class="mono-label">${p._dropped} item${p._dropped > 1 ? "s" : ""} hidden — the quote wasn't on the page.</span>` : ""}
    </article>`;
  }).join("")}</div>`;
}

// ----- Compare -----
const cellMark = (v) => (v === true ? `<span class="yes" aria-label="yes">✓</span>` : v === false ? `<span class="no" aria-label="no">✗</span>` : `<span class="dash-c" aria-label="unknown">—</span>`);
function tabCompare(r) {
  const head = r.sites.map((s, i) => `<th><i class="bdot" style="--c:${color(i)}"></i> ${i === 0 ? "You" : esc(s.domain)}</th>`).join("");
  const rows = S.COMPARE_ROWS.map((row) => `<tr><td>${row.label}</td>${r.sites.map((s) => `<td>${cellMark(s.facts[row.key])}</td>`).join("")}</tr>`).join("");
  const pairs = r.sites.slice(1).map((s, j) => `<div class="cell pair"><table><thead><tr><th></th><th><i class="bdot" style="--c:${color(0)}"></i> You</th><th><i class="bdot" style="--c:${color(j + 1)}"></i> ${esc(s.domain)}</th></tr></thead><tbody>${S.COMPARE_ROWS.map((row) => `<tr><td>${row.label}</td><td>${cellMark(r.sites[0].facts[row.key])}</td><td>${cellMark(s.facts[row.key])}</td></tr>`).join("")}</tbody></table></div>`).join("");
  return `<div class="tbl-wrap has-pairs"><table class="cmp"><thead><tr><th>Check</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="pairs">${pairs}</div>
    <p class="cmp-legend">✓ found · ✗ not found · — can't tell (pasted text). Checked automatically from the page.</p>`;
}

// ----- Positioning map -----
function mapSvg(r, ax, ay, big) {
  const W = 400, H = 400, P = 44;
  const X = (v) => P + ((v - 1) / 9) * (W - 2 * P), Y = (v) => H - P - ((v - 1) / 9) * (H - 2 * P);
  const xs = r.compare.positioning[ax], ys = r.compare.positioning[ay];
  const pts = r.sites.map((s, i) => ({ i, x: xs[i]?.score ?? 5, y: ys[i]?.score ?? 5 }));
  // nudge identical points apart
  pts.forEach((p, k) => { const same = pts.slice(0, k).filter((q) => q.x === p.x && q.y === p.y).length; p.dx = same * 14; p.dy = same * -10; });
  const [l, rr] = S.AXES[ax], [b, t] = S.AXES[ay];
  return `<svg class="map-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Positioning map: ${l} to ${rr} across, ${b} to ${t} up">
    <rect x="${P}" y="${P}" width="${W - 2 * P}" height="${H - 2 * P}" fill="#fff" stroke="#D9DED9"/>
    ${[...Array(9)].map((_, k) => `<path d="M${X(k + 1.5)} ${P}V${H - P}M${P} ${Y(k + 1.5)}H${W - P}" stroke="#F0F2F0"/>`).join("")}
    <path d="M${W / 2} ${P}V${H - P}M${P} ${H / 2}H${W - P}" stroke="#C9CFC9" stroke-dasharray="4 4"/>
    <text x="${P}" y="${H - 14}" font-family="JetBrains Mono" font-size="11" fill="#5E5A60">← ${esc(l)}</text>
    <text x="${W - P}" y="${H - 14}" font-family="JetBrains Mono" font-size="11" fill="#5E5A60" text-anchor="end">${esc(rr)} →</text>
    <text x="${P - 8}" y="${H - P}" font-family="JetBrains Mono" font-size="11" fill="#5E5A60" transform="rotate(-90 ${P - 8} ${H - P})">← ${esc(b)}</text>
    <text x="${P - 8}" y="${P}" font-family="JetBrains Mono" font-size="11" fill="#5E5A60" text-anchor="end" transform="rotate(-90 ${P - 8} ${P})">${esc(t)} →</text>
    ${pts.map((p) => `<g class="dot" tabindex="0"><title>${esc(r.sites[p.i].domain)} — ${esc(l)}↔${esc(rr)}: ${p.x}/10 (${esc(xs[p.i]?.reason || "")}); ${esc(b)}↔${esc(t)}: ${p.y}/10 (${esc(ys[p.i]?.reason || "")})</title>
      <circle cx="${X(p.x) + p.dx}" cy="${Y(p.y) + p.dy}" r="${big ? 13 : 11}" fill="${color(p.i)}" stroke="#fff" stroke-width="3"/>
      ${big ? `<text x="${X(p.x) + p.dx}" y="${Y(p.y) + p.dy - 18}" text-anchor="middle" font-family="Manrope" font-weight="700" font-size="12" fill="#17121A">${p.i === 0 ? "You" : esc(r.sites[p.i].domain)}</text>` : ""}</g>`).join("")}
  </svg>`;
}
function tabMap(r) {
  const [ax, ay] = view.axes;
  const opts = (sel) => Object.entries(S.AXES).map(([k, [a, b]]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${a} ↔ ${b}</option>`).join("");
  const reasons = (axis) => r.sites.map((s, i) => `<div><i class="bdot" style="--c:${color(i)}"></i><span><b>${r.compare.positioning[axis][i].score}/10</b> · ${esc(r.compare.positioning[axis][i].reason)}</span></div>`).join("");
  return `<div class="map-wrap">
    <div class="cell map-cell">${mapSvg(r, ax, ay, true)}</div>
    <div class="cell map-controls">
      <span class="mono-label">Drag an axis onto the other to swap</span>
      <div class="axis-chip" draggable="true" data-axis="0">X ⇆ <select aria-label="Horizontal axis" data-sel="0">${opts(ax)}</select></div>
      <div class="axis-chip" draggable="true" data-axis="1">Y ⇅ <select aria-label="Vertical axis" data-sel="1">${opts(ay)}</select></div>
      <button class="mono-link" data-swap>⇄ Swap axes</button>
      <span class="mono-label">Why — ${esc(S.AXES[ax].join(" ↔ "))}</span><div class="map-reasons">${reasons(ax)}</div>
      <span class="mono-label">Why — ${esc(S.AXES[ay].join(" ↔ "))}</span><div class="map-reasons">${reasons(ay)}</div>
    </div></div>`;
}
function wireMap(p) {
  const swap = () => { view.axes.reverse(); renderPanel(); };
  $("[data-swap]", p).onclick = swap;
  $$("select[data-sel]", p).forEach((s) => s.addEventListener("change", () => {
    const i = +s.dataset.sel, other = view.axes[1 - i];
    if (s.value === other) view.axes[1 - i] = view.axes[i];
    view.axes[i] = s.value;
    renderPanel();
  }));
  $$(".axis-chip", p).forEach((c) => {
    c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", c.dataset.axis); e.dataTransfer.effectAllowed = "move"; });
    c.addEventListener("dragover", (e) => { e.preventDefault(); c.classList.add("drop"); });
    c.addEventListener("dragleave", () => c.classList.remove("drop"));
    c.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.getData("text/plain") !== c.dataset.axis) swap(); });
  });
}

// ----- Gaps -----
function tabGaps(r) {
  const c = r.compare;
  return `<div class="gap-grid">
    <div class="cell gap-col crowd"><h3><i class="bdot" style="--c:#FC42A2"></i>Everyone says</h3><p class="app-sub">Crowded messages to avoid leading with.</p>
      <ul>${c.everyoneSays.length ? c.everyoneSays.map((g) => `<li><b>${esc(g.message)}</b><span>${esc(g.why)}</span><div class="who">${g.sites.map((i) => `<span class="chip" style="--c:${color(i)}">${i === 0 ? "You" : esc(r.sites[i].domain)}</span>`).join("")}</div></li>`).join("") : `<li><span>No crowded messages found — the market is still open.</span></li>`}</ul></div>
    <div class="cell gap-col open"><h3><i class="bdot" style="--c:#00A148"></i>Nobody says</h3><p class="app-sub">Open angles you could own — if they're true for you.</p>
      <ul>${c.nobodySays.map((g) => `<li><b>${esc(g.angle)}</b><span>${esc(g.why)}</span></li>`).join("") || `<li><span>Nothing obvious — every angle is taken.</span></li>`}</ul></div>
  </div>`;
}

// ----- Rewrite -----
function tabRewrite(r) {
  return `<p class="app-sub">New hero options for <b>${esc(r.sites[0].domain)}</b>, each tied to a gap. Templates matched to your gaps — only use claims that are true for you. Rivals' slogans are never reused.</p>
  <div class="rw-grid">${r.compare.rewrites.map((w, i) => `<article class="cell rw"><span class="gap-tag">↳ gap: ${esc(w.gap)}</span><h3>${esc(w.headline)}</h3><p>${esc(w.subheadline)}</p><span class="pill pill-plum small" style="justify-self:start">${esc(w.cta)} ▸</span>
    <div class="rw-actions"><button class="pill pill-ghost small" data-copy="${i}">Copy</button><button class="pill pill-ghost small" data-another="${i}">Another</button></div></article>`).join("") || `<p>No rewrites yet.</p>`}</div>`;
}
function wireRewrite(p) {
  const r = view.report;
  p.onclick = async (e) => {
    const c = e.target.closest("[data-copy]");
    if (c) {
      const w = r.compare.rewrites[+c.dataset.copy];
      try { await navigator.clipboard.writeText(`${w.headline}\n${w.subheadline}\n[${w.cta}]`); toast("Copied ✓"); } catch { toast("Couldn't copy — select the text instead."); }
      return;
    }
    const a = e.target.closest("[data-another]");
    if (!a) return;
    a.classList.add("is-busy"); a.textContent = "Writing…";
    const i = +a.dataset.another;
    const next = S.demoAnotherRewrite(r.sites, r.compare, r);
    if (next) { r.compare.rewrites[i] = next; putReport(r); toast("New option ✓"); }
    else toast("That's every headline template for these gaps — copy the one you like best.");
    renderPanel();
    renderStampBox();
  };
}

// ----- SEO -----
function tabSeo(r) {
  return `<div class="seo-grid">${r.sites.map((s, i) => {
    const x = s.seo, notes = S.seoNotes(x);
    return `<article class="cell seo" style="--c:${color(i)}"><b>${esc(s.domain)}</b>
      <dl>
        <dt>Title</dt><dd>${x.pasted ? "—" : `${esc(x.title || "none")} <span class="mono-label">(${x.titleLen} chars)</span>`}</dd>
        <dt>Meta</dt><dd>${x.pasted ? "—" : x.metaLen ? `${esc(x.meta)} <span class="mono-label">(${x.metaLen})</span>` : "none"}</dd>
        <dt>H1</dt><dd>${x.h1.length ? x.h1.map(esc).join(" · ") : "none"}</dd>
        <dt>H2s</dt><dd>${x.pasted ? "—" : x.h2Count}</dd>
        <dt>Words</dt><dd>${x.words.toLocaleString()}</dd>
        <dt>Keywords</dt><dd class="kw">${x.keywords.length ? x.keywords.map(([w, n]) => `<span class="chip mini">${esc(w)} ×${n}</span>`).join("") : "—"}</dd>
      </dl>
      ${notes.length ? `<ul class="seo-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : `<span class="good mono-label">✓ The basics look good</span>`}
    </article>`;
  }).join("")}</div><p class="cmp-legend">Counted automatically from the page.</p>`;
}

// ----- What changed -----
function tabChanges(r) {
  const prev = getReport(r.previousId);
  if (!prev) return `<p>The earlier report isn't in this browser any more.</p>`;
  const d = S.diffSites(prev.sites, r.sites);
  return `<p class="app-sub">Compared with your report from <b>${fmtDateTime(prev.createdAt)}</b> — <a href="/app/report/${prev.id}" data-link>open it</a>.</p>
    ${d.length ? `<div class="diff-list">${d.map((x) => `<div class="cell diff"><span><span class="chip" style="--c:${color(Math.max(0, r.sites.findIndex((s) => s.domain === x.domain)))}">${esc(x.domain)}</span><br><span class="mono-label">${esc(x.field)}</span></span><span>${x.before && x.before !== "—" ? `<s>${esc(x.before)}</s><br>` : ""}<span class="after">${esc(x.after)}</span></span></div>`).join("")}</div>` : `<div class="cell empty"><h3>No changes</h3><p class="app-sub">Headlines, promises, offers, CTAs and prices are the same as last time.</p></div>`}`;
}

// =================== STEP 4 · EXPORT & STAMP ===================
async function renderStampBox() {
  const box = $("#stampBox"), r = view.report;
  if (!box || !r) return;
  const hash = await currentHash(r);
  const changed = r.stamp && r.stamp.hash !== hash;
  if (r.stamp && !changed) {
    box.innerHTML = `<div class="cell stamp-cell done"><div><span class="mono-label">Stamped on ${esc(NET.chainName)} · report #${r.stamp.id}</span><h3 style="margin:4px 0">Proof of research ✓</h3><span class="mono-label">Fingerprint ${esc(hash.slice(0, 10))}…${esc(hash.slice(-6))}</span></div>
      <div class="rep-actions"><button class="pill pill-ghost small" data-copyproof>Copy proof link</button><a class="pill pill-violet small" href="/app?report=${r.stamp.id}" data-link>View proof ▸</a><a class="mono-link" href="${explorerTx(r.stamp.tx)}" target="_blank" rel="noopener">Tx ▸</a></div></div>`;
  } else {
    let note = "Saves a fingerprint of this report + the domains + the date on BOT Chain. The report itself stays with you.";
    if (!IS_DEPLOYED) note = "Stamping goes live once the RivalScope contract is deployed. Analysis and PDF export work now.";
    else if (!hasMetaMask()) note = "Install MetaMask to stamp — analysis and export still work without it.";
    else if (wallet.address && !wallet.chainOk) note = "Switch MetaMask to BOT Chain to stamp.";
    if (changed) note = `This report changed since stamp #${r.stamp.id}. Stamp again — the new stamp links to the previous one.`;
    box.innerHTML = `<div class="cell stamp-cell"><div><span class="mono-label">Step 4 · Export &amp; stamp</span><p style="margin:4px 0 0;max-width:60ch">${note}</p>${!hasMetaMask() && IS_DEPLOYED ? `<a class="mono-link" href="https://metamask.io/download/" target="_blank" rel="noopener">Install MetaMask ▸</a>` : ""}</div>
      <div class="rep-actions"><button class="pill pill-ghost small" data-act="pdf">Download PDF report</button><button class="pill pill-yellow small" data-act="stamp" ${IS_DEPLOYED ? "" : "disabled"}>${wallet.address && !wallet.chainOk && hasMetaMask() ? "Switch to BOT Chain" : "Stamp on BOT Chain"} ▸</button></div></div>`;
  }
  $("[data-copyproof]", box)?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(proofUrl(r.stamp.id)); toast("Proof link copied ✓"); } catch { toast(proofUrl(r.stamp.id)); }
  });
}

let stamping = false;
async function stamp(r) {
  if (stamping) return;
  if (!IS_DEPLOYED) { toast("The RivalScope contract isn't deployed yet."); return; }
  if (!hasMetaMask()) {
    modal(`<h3>Install MetaMask</h3><p>You need the MetaMask browser extension to stamp a report on BOT Chain. Your analysis and PDF export work without it.</p><a class="pill pill-yellow" href="https://metamask.io/download/" target="_blank" rel="noopener">Get MetaMask ▸</a>`);
    return;
  }
  stamping = true;
  const btns = $$('[data-act="stamp"]');
  btns.forEach((b) => { b.classList.add("is-busy"); b.dataset.label = b.textContent; b.textContent = "Confirm in MetaMask…"; });
  try {
    const c = await writeContract();
    const hash = await currentHash(r);
    // previous = this report's own earlier stamp, else the stamp of the report it was re-run from (same wallet only)
    const me = wallet.address?.toLowerCase();
    let previous = 0;
    const prevLocal = r.previousId ? getReport(r.previousId) : null;
    if (r.stamp && r.stamp.owner?.toLowerCase() === me) previous = r.stamp.id;
    else if (prevLocal?.stamp && prevLocal.stamp.owner?.toLowerCase() === me) previous = prevLocal.stamp.id;
    const tx = await c.stamp(hash, S.domainsString(r), r.sites.length, previous);
    btns.forEach((b) => (b.textContent = "Pending…"));
    toast("Transaction sent — waiting for BOT Chain…", 4000);
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "Stamped");
    const id = ev ? Number(ev.args.id) : null;
    if (id == null) throw new Error("no_event");
    r.stamp = { id, tx: tx.hash, hash, owner: wallet.address, at: new Date().toISOString(), previous };
    putReport(r);
    confetti();
    toast(`Stamped as report #${id} ✓`);
  } catch (e) {
    console.warn(e);
    toast(e.message === "no_event" ? "Stamped, but the report id couldn't be read — check the explorer." : txError(e), 4200);
  } finally {
    stamping = false;
    btns.forEach((b) => { b.classList.remove("is-busy"); if (b.dataset.label) b.textContent = b.dataset.label; });
    renderStampBox();
  }
}

// ----- PDF -----
async function exportPdf(r) {
  toast("Building your PDF…");
  try { await loadScript(HTML2PDF); } catch { toast("Couldn't load the PDF tool — check your connection."); return; }
  const root = document.createElement("div");
  root.className = "pdf-root";
  const c = r.compare;
  root.innerHTML = `
    <h1>RivalScope report — ${esc(r.sites[0].domain)} vs ${r.sites.length - 1} rival${r.sites.length > 2 ? "s" : ""}</h1>
    <p>${esc(analysisLabel(r))}. Sites: ${r.sites.map((s, i) => `${esc(s.domain)} (${S.ROLE_LABEL(i)})`).join(", ")}.${r.industry ? ` Industry: ${esc(r.industry)}.` : ""}${r.customer ? ` Target customer: ${esc(r.customer)}.` : ""}</p>
    <p style="font-size:10px;color:#666">Automated analysis of public web pages — not statements of fact about any company. ${r.stamp ? `Stamped on BOT Chain as report #${r.stamp.id}.` : ""}</p>
    <h2>Overview</h2><ol>${c.insights.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
    <p><b>Top 3 actions</b></p><ol>${c.actions.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
    <div class="pb" style="width:360px">${mapSvg(r, view.axes[0], view.axes[1], true)}</div>
    <h2>Profiles</h2>
    ${r.sites.map((s, i) => { const p = s.profile; const row = (l, f) => `<tr><th style="width:120px">${l}</th><td>${esc(f.value)}${f.quote && f.value !== S.NOT_SHOWN ? `<div class="q">“${esc(f.quote)}”</div>` : ""}</td></tr>`; return `<div class="pb"><h3>${esc(s.domain)} — ${S.ROLE_LABEL(i)}</h3><table>${row("Headline", p.headline)}${row("Main promise", p.promise)}${row("Who it's for", p.audience)}<tr><th>Value props</th><td>${p.valueProps.map((v) => esc(v.value)).join(" · ") || S.NOT_SHOWN}</td></tr>${row("Offer", p.offer)}${row("Main CTA", p.cta)}<tr><th>Proof</th><td>${p.proof.testimonials} testimonials · ${p.proof.logos} logos · ${p.proof.numbers} numbers</td></tr><tr><th>Tone</th><td>${p.tone.map(esc).join(" · ")}</td></tr></table></div>`; }).join("")}
    <h2>Compare</h2>
    <table class="pb"><tr><th>Check</th>${r.sites.map((s) => `<th>${esc(s.domain)}</th>`).join("")}</tr>${S.COMPARE_ROWS.map((row) => `<tr><td>${row.label}</td>${r.sites.map((s) => `<td>${s.facts[row.key] === true ? "✓" : s.facts[row.key] === false ? "✗" : "—"}</td>`).join("")}</tr>`).join("")}</table>
    <h2>Gaps &amp; opportunities</h2>
    <div class="pb"><p><b>Everyone says</b></p><ul>${c.everyoneSays.map((g) => `<li><b>${esc(g.message)}</b> — ${esc(g.why)}</li>`).join("") || "<li>—</li>"}</ul>
    <p><b>Nobody says</b></p><ul>${c.nobodySays.map((g) => `<li><b>${esc(g.angle)}</b> — ${esc(g.why)}</li>`).join("") || "<li>—</li>"}</ul></div>
    <h2>Headline rewrites</h2>
    ${c.rewrites.map((w) => `<div class="pb" style="margin-bottom:8px"><b style="font-size:14px">${esc(w.headline)}</b><br>${esc(w.subheadline)}<br>[${esc(w.cta)}] <span class="q">gap: ${esc(w.gap)}</span></div>`).join("")}
    <h2>SEO snapshot</h2>
    <table class="pb"><tr><th>Site</th><th>Title (chars)</th><th>Meta (chars)</th><th>H1</th><th>H2s</th><th>Words</th><th>Top keywords</th></tr>${r.sites.map((s) => `<tr><td>${esc(s.domain)}</td><td>${s.seo.titleLen}</td><td>${s.seo.metaLen}</td><td>${s.seo.h1.length}</td><td>${s.seo.h2Count}</td><td>${s.seo.words}</td><td>${s.seo.keywords.map(([w]) => esc(w)).join(", ")}</td></tr>`).join("")}</table>`;
  const holder = document.createElement("div");
  holder.className = "pdf-holder"; // only the holder is off-screen; html2pdf clones the inner root
  holder.appendChild(root);
  document.body.appendChild(holder);
  try {
    await window.html2pdf().set({ margin: 8, filename: `rivalscope-${r.sites[0].domain}-${r.createdAt.slice(0, 10)}.pdf`, html2canvas: { scale: 2, useCORS: true }, jsPDF: { format: "a4", unit: "mm" }, pagebreak: { mode: ["css", "legacy"] } }).from(root).save();
    toast("PDF downloaded ✓");
  } catch { toast("Couldn't build the PDF."); }
  holder.remove();
}

// =================== STEP 5 · RE-RUN ===================
async function rerun(r, sameAsRetry = false) {
  const rows = r.sites.map((s) => ({ ...blankRow(), input: s.url, url: s.url, domain: s.domain, source: s.source, pasteText: s.pasteText || "", status: s.source === "paste" ? "ok" : "idle", page: s.source === "paste" ? extractFromText(s.pasteText || "", s.domain) : null }));
  view.el.innerHTML = `<div class="cell analysing"><span class="mono-label">Re-run</span><h1 class="app-h">Reading the pages again…</h1><ol class="an-steps">${rows.map((x) => `<li class="on">${esc(x.domain)}</li>`).join("")}</ol></div>`;
  const failed = [];
  await Promise.all(rows.map(async (row) => {
    if (row.source === "paste") return;
    try { row.page = await fetchPage(row.url); row.status = "ok"; } catch (e) { failed.push(`${row.domain}: ${READ_ERR[e.message] || READ_ERR.fetch_failed}`); }
  }));
  if (failed.length) {
    view.el.innerHTML = `<div class="cell empty"><h2>Couldn't read every site</h2><p class="app-sub">${failed.map(esc).join("<br>")}</p><button class="pill pill-yellow" id="toForm">Fix in the form ▸</button> <a class="mono-link" href="/app/report/${r.id}" data-link>Back to report</a></div>`;
    $("#toForm").onclick = () => {
      draft = freshDraft();
      draft.rows = rows.map((x) => (x.status === "ok" ? x : { ...x, status: "fail", err: "Couldn't read this time.", page: null }));
      draft.industry = r.industry; draft.customer = r.customer; draft.previousId = sameAsRetry ? r.previousId : r.id;
      renderNew(view.el);
    };
    return;
  }
  const report = await runPipeline({ rows, industry: r.industry, customer: r.customer, previousId: sameAsRetry ? r.previousId : r.id, example: r.example });
  if (report) nav.go(`/app/report/${report.id}${report.previousId && !sameAsRetry ? "?tab=changes" : ""}`);
}

// =================== EXAMPLE ===================
async function openExample(el) {
  const ex = loadReports().find((r) => r.example && r.sites[0]?.url?.startsWith(location.origin));
  if (ex) { history.replaceState(null, "", `/app/report/${ex.id}`); return renderReport(el, ex); }
  fillExample();
  view.el = el;
  const rows = [];
  for (const [i, r] of draft.rows.entries()) {
    const n = S.normalizeUrl(r.input);
    try { rows.push({ ...r, url: n.url, domain: n.domain, page: await fetchPage(n.url), status: "ok" }); } catch { /* skip */ }
    i;
  }
  if (rows.length < 2) return renderMissing(el, "The example sites couldn't be loaded", "Try again, or start your own report.");
  const report = await runPipeline({ rows, industry: draft.industry, customer: draft.customer, example: true });
  draft = freshDraft();
  if (report) { history.replaceState(null, "", `/app/report/${report.id}`); renderReport(el, report); }
}

// =================== MY REPORTS ===================
function renderReports(el) {
  const list = loadReports();
  el.innerHTML = `<span class="mono-label">Saved in this browser only</span><h1 class="app-h">My reports</h1>
    ${list.length ? `<div class="rep-list">${list.map((r) => `<div class="cell rep-item"><div>
        <a href="/app/report/${r.id}" data-link>${esc(r.sites.map((s) => s.domain).join(" · "))}</a><br>
        <span class="mono-label">${fmtDateTime(r.createdAt)} · ${r.mode === "ai" ? "AI" : "automated"}${r.example ? " · example" : ""}${r.previousId ? " · re-run" : ""}${r.stamp ? ` · stamped #${r.stamp.id}` : ""}</span></div>
        <div class="rep-actions"><a class="pill pill-ghost small" href="/app/report/${r.id}" data-link>Open</a><button class="pill pill-ghost small" data-del="${r.id}" aria-label="Delete report">Delete</button></div></div>`).join("")}</div>`
      : `<div class="cell empty"><h2>No reports yet</h2><p class="app-sub">Your reports are saved here, in this browser.</p><a class="pill pill-yellow" href="/app" data-link>New report ▸</a> <a class="mono-link" href="/app?example=1" data-link>See an example ▸</a></div>`}`;
  el.onclick = async (e) => {
    const d = e.target.closest("[data-del]");
    if (!d) return;
    const r = getReport(d.dataset.del);
    if (!(await confirmBox("Delete this report?", `${r?.stamp ? "The on-chain stamp stays, but the" : "The"} full report will be removed from this browser.`, "Delete"))) return;
    saveReports(loadReports().filter((x) => x.id !== d.dataset.del));
    renderReports(el);
  };
}

// =================== PROOF (?report=N) ===================
async function renderProof(el, raw) {
  const id = Number(raw);
  el.innerHTML = `<div class="cell proof"><span class="mono-label">Report proof · ${esc(NET.chainName)}</span><h1 class="app-h">Loading report #${esc(raw)}…</h1></div>`;
  if (!Number.isInteger(id) || id < 1) return proofMissing(el, raw);
  if (!IS_DEPLOYED) { el.innerHTML = `<div class="cell proof"><h1 class="app-h">Stamping isn't live yet</h1><p>The RivalScope contract hasn't been deployed, so there are no on-chain reports to show.</p><a class="pill pill-plum" href="/app" data-link>New report ▸</a></div>`; return; }
  let rep, hist = [];
  try {
    const c = await readContract();
    rep = reportFromResult(await c.getReport(id));
    hist = (await c.history(id)).map(Number);
  } catch (e) {
    if (e?.revert?.name === "NotFound" || /NotFound|revert/i.test(e?.shortMessage || e?.message || "")) return proofMissing(el, raw);
    el.innerHTML = `<div class="cell proof"><h1 class="app-h">Couldn't reach BOT Chain</h1><p>Check your connection and try again.</p><button class="pill pill-plum" id="again">Retry</button></div>`;
    $("#again").onclick = () => renderProof(el, raw);
    return;
  }
  const date = new Date(rep.at * 1000).toISOString();
  const local = loadReports().find((r) => r.stamp?.id === id && r.stamp?.hash === rep.reportHash);
  el.innerHTML = `<div class="cell proof">
    <span class="mono-label">Report proof · ${esc(NET.chainName)} · chain ID ${NET.chainId}</span>
    <h1 class="app-h">Report #${id}</h1>
    <p>${esc(rep.domains)}</p>
    <dl>
      <dt>Stamped</dt><dd>${fmtDateTime(date)}</dd>
      <dt>Sites</dt><dd>${rep.sites}</dd>
      <dt>Fingerprint</dt><dd class="hash">${esc(rep.reportHash)}</dd>
      <dt>Owner</dt><dd><a href="${explorerAddr(rep.owner)}" target="_blank" rel="noopener">${esc(short(rep.owner))}</a></dd>
      <dt>Research history</dt><dd>${hist.map((h) => (h === id ? `#${h}` : `<a href="/app?report=${h}" data-link>#${h}</a>`)).join(" ← ")}</dd>
    </dl>
    <p class="mono-label">Automated analysis of public web pages on ${fmtDate(date)} — the full report stays with its owner; this page shows only what's on-chain.</p>
    <div class="rep-actions">
      ${local ? `<a class="pill pill-plum" href="/app/report/${local.id}" data-link>Open the full report ▸</a>` : ""}
      <a class="pill pill-violet" href="${explorerAddr(CONFIG.NETWORK === "mainnet" ? CONFIG.MAINNET_CONTRACT_ADDRESS : CONFIG.TESTNET_CONTRACT_ADDRESS)}" target="_blank" rel="noopener">View on explorer ▸</a>
      <button class="pill pill-ghost" id="copyProof">Copy link</button>
    </div>
  </div>`;
  $("#copyProof").onclick = async () => { try { await navigator.clipboard.writeText(proofUrl(id)); toast("Link copied ✓"); } catch { toast(proofUrl(id)); } };
}
function proofMissing(el, raw) {
  el.innerHTML = `<div class="cell proof"><span class="mono-label">Report proof</span><h1 class="app-h">Report not found</h1><p>There's no report #${esc(raw)} on ${esc(NET.chainName)}.</p><a class="pill pill-plum" href="/app" data-link>New report ▸</a></div>`;
}

export function closeAppModals() { closeModal(); }
