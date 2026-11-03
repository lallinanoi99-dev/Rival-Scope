// Router (/ website · /app routes), navbar, wallet button, modals, footer (address, block number, sticker pile).
import { CONFIG, NET, CONTRACT, IS_DEPLOYED, BASE, at } from "./config.js";
import { $, $$, esc, toast, modal, initModal, nav, loadScript, reduced, isMobile } from "./ui.js";
import { initWallet, onWallet, connect, ensureChain, wallet, short, hasMetaMask, explorerAddr, rpcBlockNumber, readContract } from "./chain.js";
import { renderApp } from "./app.js";
import { initSite, countUp } from "./site.js";

const MATTER = "https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js";

// ---------- router ----------
let siteReady = false;
// Links are written root-style (href="/app"); point them at the real location under BASE.
function fixLinks(root) {
  const list = root.matches?.('a[href^="/"]:not([data-route])') ? [root] : [];
  list.push(...(root.querySelectorAll?.('a[href^="/"]:not([data-route])') || []));
  for (const a of list) { const r = a.getAttribute("href"); if (r.startsWith("//")) continue; a.dataset.route = r; a.setAttribute("href", at(r)); }
}
new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && fixLinks(n)))).observe(document.documentElement, { childList: true, subtree: true });
fixLinks(document);
const routePath = () => (location.pathname.startsWith(BASE) ? "/" + location.pathname.slice(BASE.length) : location.pathname);

function route() {
  const { search, hash } = location;
  const pathname = routePath();
  const params = new URLSearchParams(search);
  const inApp = /^\/app(\/|$)/.test(pathname) || params.has("report");
  document.body.classList.toggle("in-app", inApp);
  $("#site").hidden = inApp;
  $("#app").hidden = !inApp;
  $("#navLinks")?.classList.remove("open");
  if (inApp) {
    document.title = "RivalScope — App";
    renderApp(pathname, params);
    window.scrollTo(0, 0);
    $("#appMain").focus({ preventScroll: true });
  } else {
    document.title = "RivalScope — The research engine behind irresistible brands";
    if (!siteReady) { siteReady = true; initSite(); loadStats(); }
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" }), 30);
    else window.scrollTo(0, 0);
    window.ScrollTrigger?.refresh();
  }
}
nav.go = (url) => { history.pushState(null, "", at(url)); route(); };
// In-page anchors ("#main"): scroll here instead of following <base>.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.getAttribute("href").length < 2) return;
  const t = document.getElementById(a.getAttribute("href").slice(1));
  if (t) { e.preventDefault(); t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); t.scrollIntoView(); }
});
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank" || !a.dataset.route) return;
  const u = new URL(a.dataset.route, "http://x");
  e.preventDefault();
  if (u.pathname === routePath() && u.search === location.search && u.hash) {
    history.pushState(null, "", u.hash);
    document.getElementById(u.hash.slice(1))?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth" });
    $(".nav-links")?.classList.remove("open");
    $("#burger")?.setAttribute("aria-expanded", "false");
    return;
  }
  nav.go(u.pathname + u.search + u.hash);
});
addEventListener("popstate", route);

// ---------- navbar ----------
$(".nav-links").id = "navLinks";
$("#burger").addEventListener("click", () => {
  const open = $("#navLinks").classList.toggle("open");
  $("#burger").setAttribute("aria-expanded", open);
});

// ---------- wallet ----------
function paintWallet() {
  const label = !hasMetaMask() ? "Install MetaMask" : !wallet.address ? "Connect wallet" : !wallet.chainOk ? "Switch to BOT Chain" : short(wallet.address);
  $$("[data-wallet]").forEach((b) => { b.textContent = label; b.title = wallet.address || ""; });
  const note = $("#netNote");
  if (note) note.textContent = wallet.address && wallet.chainOk ? `● ${NET.chainName}` : hasMetaMask() ? "" : "Analysis works without a wallet";
}
document.addEventListener("click", async (e) => {
  if (!e.target.closest("[data-wallet]")) return;
  try {
    if (!hasMetaMask()) { window.open("https://metamask.io/download/", "_blank", "noopener"); return; }
    if (!wallet.address) await connect();
    else if (!wallet.chainOk) await ensureChain();
    else { await navigator.clipboard?.writeText(wallet.address); toast("Address copied ✓"); }
  } catch (err) {
    toast(err?.code === 4001 ? "Request cancelled in MetaMask." : "Couldn't connect — open MetaMask and try again.");
  }
});
onWallet(paintWallet);

// ---------- modals: guide, about, legal ----------
const GUIDE = `<span class="mono-label">Free guide · 30 minutes</span><h2>How to find your positioning</h2>
<ol>
<li><b>List your 3 closest rivals</b> (5 min). Who would a customer compare you with today?</li>
<li><b>Write down what each one leads with</b> (10 min). Their headline, main promise and button. RivalScope does this for you.</li>
<li><b>Circle what everyone says</b> (5 min). If three sites say it, it's no longer a reason to choose anyone.</li>
<li><b>Find what nobody says that's true for you</b> (5 min). Speed? Care? Expertise? Pick one you can prove.</li>
<li><b>Rewrite your headline around it</b> (5 min). One line, plain words, one clear button.</li>
</ol>
<a class="pill pill-yellow" href="/app" data-link>Run it on my site ▸</a>`;
const ABOUT = `<h2>About RivalScope</h2><p>RivalScope is a small research tool built for BOT Chain Build Week. It reads public homepages, builds evidence-backed profiles, and suggests where you can stand out. Reports stay in your browser; only a fingerprint goes on-chain.</p><p class="mono-label">Mascot: Scout · Made with GSAP, Matter.js and ethers.js</p>`;
const LEGAL = {
  privacy: `<h2>Privacy policy</h2><p>No accounts and no tracking. The pages you analyse are fetched by our Worker only to read them; the analysis runs in your browser, and nothing is logged or stored on a server. Reports are saved in your browser's local storage. If you stamp a report, its fingerprint, domains, site count, date and your wallet address are public on BOT Chain.</p>`,
  terms: `<h2>Terms of service</h2><p>RivalScope gives an automated, rule-based analysis of public web pages on a given date. It is not a statement of fact about any company, and it may be wrong — check the evidence quotes. Only analyse pages you're allowed to view publicly, and don't copy rivals' slogans. Provided as-is, without warranty.</p>`,
};
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-guide]")) modal(GUIDE);
  else if (e.target.closest("[data-about]")) modal(ABOUT);
  else if (e.target.closest("[data-legal]")) modal(LEGAL[e.target.closest("[data-legal]").dataset.legal]);
  else if (e.target.closest("#modalBody a[data-link]")) $("#modal").hidden = true;
});

// ---------- home stats (real numbers only — hidden until there's data) ----------
async function loadStats() {
  if (!IS_DEPLOYED) return;
  try {
    const c = await readContract();
    const [reports, sites, wallets] = (await c.stats()).map(Number);
    if (!reports) return;
    const box = $("#heroStats");
    $$("dd", box).forEach((dd, i) => (dd.dataset.count = [reports, sites, wallets][i]));
    box.hidden = false;
    countUp(box);
  } catch { /* stays hidden */ }
}

// ---------- footer ----------
function initFooter() {
  const addr = CONTRACT;
  $("#footAddrText").textContent = IS_DEPLOYED ? short(addr) : "Not deployed yet";
  $("#footExplorer").href = IS_DEPLOYED ? explorerAddr(addr) : NET.explorer;
  $("#footAddr").addEventListener("click", async () => {
    if (!IS_DEPLOYED) { toast("The contract address appears here after deployment."); return; }
    try { await navigator.clipboard.writeText(addr); toast("Contract address copied ✓"); } catch { toast(addr); }
  });
  $("#footGithub").href = CONFIG.GITHUB_URL;
  $("#footX").href = CONFIG.X_URL;
  $("#botStickerLink").href = CONFIG.BOTCHAIN_URL;
  const io = new IntersectionObserver(async ([en]) => {
    if (!en.isIntersecting) return;
    io.disconnect();
    try { $("#footBlock").textContent = `● live · block #${(await rpcBlockNumber()).toLocaleString()}`; } catch { /* offline */ }
    stickers();
  }, { rootMargin: "200px" });
  io.observe($("#footer"));
  // mascot eyes follow the pointer
  const pupils = $$(".mascot .pupil");
  const svg = $(".mascot");
  if (!reduced()) addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    pupils.forEach((p) => (p.style.transform = `translate(${(dx / d) * 4}px, ${(dy / d) * 4}px)`));
  }, { passive: true });
}

// Sticker pile: round candy stickers drop and pile up (Matter.js); one is the BOT Chain sticker → botchain.ai
const STICKERS = [
  { c: "#F5DA53", g: "star" }, { c: "#FC42A2", g: "heart" }, { c: "#5138DE", g: "lens" }, { c: "#00A148", g: "check" },
  { c: "#FE9F7B", g: "bolt" }, { c: "#CDF4E0", g: "chart" }, { c: "#8C77C9", g: "ast" }, { c: "#fff", g: "bot" },
];
function drawGlyph(ctx, g, r, botImg) {
  ctx.fillStyle = "#17121A"; ctx.strokeStyle = "#17121A"; ctx.lineWidth = r * 0.12; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const s = r * 0.5;
  ctx.beginPath();
  if (g === "star") { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
  else if (g === "heart") { ctx.moveTo(0, s * 0.8); ctx.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.5, -s * 1.1, 0, -s * 0.35); ctx.bezierCurveTo(s * 0.5, -s * 1.1, s * 1.3, -s * 0.1, 0, s * 0.8); ctx.fillStyle = "#fff"; ctx.fill(); }
  else if (g === "lens") { ctx.strokeStyle = "#fff"; ctx.arc(-s * 0.15, -s * 0.15, s * 0.55, 0, Math.PI * 2); ctx.moveTo(s * 0.25, s * 0.25); ctx.lineTo(s * 0.75, s * 0.75); ctx.stroke(); }
  else if (g === "check") { ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.16; ctx.moveTo(-s * 0.6, 0); ctx.lineTo(-s * 0.1, s * 0.5); ctx.lineTo(s * 0.7, -s * 0.5); ctx.stroke(); }
  else if (g === "bolt") { ctx.moveTo(s * 0.2, -s); ctx.lineTo(-s * 0.5, s * 0.1); ctx.lineTo(0, s * 0.1); ctx.lineTo(-s * 0.2, s); ctx.lineTo(s * 0.5, -s * 0.1); ctx.lineTo(0, -s * 0.1); ctx.closePath(); ctx.fill(); }
  else if (g === "chart") { [[-0.6, 0.3], [-0.1, -0.1], [0.4, -0.6]].forEach(([x, h]) => ctx.rect(x * s, h * s, s * 0.35, (0.7 - h) * s)); ctx.fill(); }
  else if (g === "ast") { ctx.strokeStyle = "#fff"; ctx.lineWidth = r * 0.16; for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; ctx.moveTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8); ctx.lineTo(-Math.cos(a) * s * 0.8, -Math.sin(a) * s * 0.8); } ctx.stroke(); }
  else if (g === "bot" && botImg?.complete && botImg.naturalWidth) { ctx.drawImage(botImg, -r * 0.72, -r * 0.72, r * 1.44, r * 1.44); }
}
function stickerDataUrl(st, size = 112) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.translate(size / 2, size / 2);
  ctx.beginPath(); ctx.arc(0, 0, size / 2 - 3, 0, Math.PI * 2); ctx.fillStyle = st.c; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#17121A"; ctx.stroke();
  drawGlyph(ctx, st.g, size / 2 - 3);
  return c.toDataURL();
}
async function stickers() {
  const box = $("#stickerBox"), row = $("#stickerRow");
  const staticRow = () => {
    row.innerHTML = STICKERS.map((st) => st.g === "bot"
      ? `<a href="${CONFIG.BOTCHAIN_URL}" target="_blank" rel="noopener" title="Built on BOT Chain"><img src="${at("assets/botchain-mark.png")}" alt="Built on BOT Chain" style="border-radius:50%;border:3px solid #17121A;background:#fff"></a>`
      : `<img src="${stickerDataUrl(st)}" alt="">`).join("");
    row.style.display = "flex";
    $("#stickerCanvas").style.display = "none";
    $("#botStickerLink").style.display = "none";
  };
  if (isMobile() || reduced()) return staticRow();
  try { await loadScript(MATTER); } catch { return staticRow(); }
  const M = window.Matter;
  const canvas = $("#stickerCanvas");
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = box.clientWidth, H = box.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.setAttribute("data-pixel-ratio", dpr);
  const ctx = canvas.getContext("2d");
  const engine = M.Engine.create({ gravity: { y: 1 } });
  const wall = { isStatic: true, render: { visible: false } };
  M.Composite.add(engine.world, [M.Bodies.rectangle(W / 2, H + 30, W * 2, 60, wall), M.Bodies.rectangle(-30, H / 2, 60, H * 4, wall), M.Bodies.rectangle(W + 30, H / 2, 60, H * 4, wall)]);
  const botImg = new Image(); botImg.src = at("assets/botchain-mark.png");
  const bodies = STICKERS.map((st, i) => {
    const r = st.g === "bot" ? 37 : 26 + ((i * 7) % 14);
    const b = M.Bodies.circle(W * 0.08 + ((i * 97) % (W * 0.5)), -60 - i * 70, r, { restitution: 0.45, friction: 0.08, frictionAir: 0.01, density: 0.002 });
    b.sticker = st; b.r = r;
    return b;
  });
  M.Composite.add(engine.world, bodies);
  const mouse = M.Mouse.create(canvas);
  ["mousewheel", "DOMMouseScroll", "wheel"].forEach((ev) => canvas.removeEventListener(ev, mouse.mousewheel));
  const mc = M.MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
  M.Composite.add(engine.world, mc);
  const bot = bodies.find((b) => b.sticker.g === "bot");
  const link = $("#botStickerLink");
  let raf, last = performance.now(), visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) { last = performance.now(); loop(); } }).observe(box);
  function loop(now = performance.now()) {
    cancelAnimationFrame(raf);
    if (!visible) return;
    M.Engine.update(engine, Math.min(32, now - last));
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const b of bodies) {
      ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fillStyle = b.sticker.c; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#17121A"; ctx.stroke();
      drawGlyph(ctx, b.sticker.g, b.r, botImg);
      ctx.restore();
    }
    link.style.translate = `${bot.position.x - 37}px ${bot.position.y - 37}px`;
    raf = requestAnimationFrame(loop);
  }
  loop();
}

// ---------- boot ----------
initModal();
initWallet();
paintWallet();
initFooter();
route();
