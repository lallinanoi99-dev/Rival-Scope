// Home page motion (GSAP + ScrollTrigger). Transform/opacity only; everything has a static fallback
// for prefers-reduced-motion or if the CDN scripts fail to load.
import { $, $$, reduced, isMobile } from "./ui.js";

export function countUp(scope) {
  $$("[data-count]", scope).forEach((el) => {
    const to = Number(el.dataset.count) || 0;
    if (reduced() || !window.gsap) { el.textContent = to.toLocaleString(); return; }
    const o = { v: 0 };
    window.gsap.to(o, { v: to, duration: 1.4, ease: "power2.out", onUpdate: () => (el.textContent = Math.round(o.v).toLocaleString()) });
  });
}

function phoneClock() {
  const now = new Date();
  $("#lockTime").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
  $("#lockDate").textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function buildPixelGrid() {
  const grid = $("#pixelGrid");
  grid.innerHTML = Array.from({ length: 60 }, () => "<i></i>").join("");
  const cells = $$("i", grid);
  // fill order: a loose diagonal sweep, colours pink / yellow with a few violet
  const order = cells.map((c, i) => [c, (i % 10) + Math.floor(i / 10) + Math.random() * 2]).sort((a, b) => a[1] - b[1]).map(([c]) => c);
  order.forEach((c, i) => (c.dataset.cls = i % 9 === 4 ? "on-v" : i % 3 === 0 ? "on-y" : "on-p"));
  return order;
}

function typePixelWord(el) {
  const word = el.dataset.word;
  if (el.dataset.done) return;
  el.dataset.done = 1;
  if (reduced()) { el.textContent = word; return; }
  let i = 0;
  el.innerHTML = '<span class="cur"></span>';
  const t = setInterval(() => {
    i++;
    el.innerHTML = word.slice(0, i) + (i < word.length ? '<span class="cur"></span>' : "");
    if (i >= word.length) clearInterval(t);
  }, 110);
}

function magnet() {
  const area = $(".hero-visual");
  const shapes = $$(".shapes .shape", area);
  if (reduced() || matchMedia("(hover: none)").matches) return;
  area.addEventListener("pointermove", (e) => {
    shapes.forEach((s) => {
      const r = s.getBoundingClientRect();
      const dx = r.left + r.width / 2 - e.clientX, dy = r.top + r.height / 2 - e.clientY;
      const d = Math.hypot(dx, dy) || 1, push = Math.max(0, 220 - d) / 220;
      s.style.translate = `${(dx / d) * push * 46}px ${(dy / d) * push * 46}px`;
    });
  });
  area.addEventListener("pointerleave", () => shapes.forEach((s) => (s.style.translate = "0 0")));
}

function storyPhone() {
  // mobile copies of each phone screen
  $$(".sm-screen").forEach((slot) => {
    const src = $(`.story-phone .sscreen[data-i="${slot.dataset.clone}"]`);
    slot.innerHTML = `<div class="sscreen">${src.innerHTML}</div>`;
  });
  const screens = $$(".story-phone .sscreen");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const i = en.target.dataset.screen;
      screens.forEach((s) => s.classList.toggle("on", s.dataset.i === i));
    });
  }, { rootMargin: "-45% 0px -45% 0px" });
  $$(".sblock").forEach((b) => io.observe(b));
}

export function initSite() {
  phoneClock();
  const order = buildPixelGrid();
  storyPhone();
  magnet();
  const g = window.gsap, ST = window.ScrollTrigger;
  const io = (sel, fn, opts = { threshold: 0.35 }) => {
    const ob = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) { ob.unobserve(en.target); fn(en.target); } }), opts);
    $$(sel).forEach((el) => ob.observe(el));
  };
  io(".pix", typePixelWord, { threshold: 0.6 });

  if (reduced() || !g) {
    // static end states
    order.forEach((c) => c.classList.add(c.dataset.cls));
    $$(".tick-num").forEach((n) => (n.textContent = n.dataset.to));
    return;
  }
  if (ST) g.registerPlugin(ST);

  // hero: staggered line reveal + highlighter swipe
  const hl = $("#heroHl");
  hl.style.setProperty("--hl", 0);
  const tl = g.timeline({ defaults: { ease: "power4.out" } });
  tl.from(".hero-h1 .line > span", { yPercent: 115, duration: 0.9, stagger: 0.12 })
    .to(hl, { "--hl": 1, duration: 0.6, ease: "power2.inOut" }, "-=0.3")
    .from(".hero .reveal", { y: 24, opacity: 0, duration: 0.7, stagger: 0.1 }, "-=0.5")
    .from("#heroPhone", { y: 60, opacity: 0, rotate: 4, duration: 1, ease: "back.out(1.4)" }, 0.2)
    .from("#heroNotif", { y: -30, scale: 0.7, opacity: 0, duration: 0.6, ease: "back.out(2)" }, 1.3);
  order.forEach((c, i) => tl.call(() => c.classList.add(c.dataset.cls), null, 1.9 + i * 0.03));
  tl.from("#gapBadge", { scale: 0, opacity: 0, duration: 0.5, ease: "back.out(3)" }, 1.9 + order.length * 0.03);

  if (!ST) return;
  const up = (targets, trigger, extra = {}) => g.from(targets, { y: 32, opacity: 0, duration: 0.7, ease: "power3.out", stagger: 0.08, scrollTrigger: { trigger, start: "top 85%" }, ...extra });

  $$("#site > section:not(.hero) .reveal").forEach((el) => up(el, el));
  up(".cat", ".cat-strip", { stagger: 0.09 });
  g.from(".promo", { y: 40, opacity: 0, duration: 0.8, ease: "back.out(1.4)", scrollTrigger: { trigger: ".promo", start: "top 88%" } });

  // bento mockups: spring in, fields fill one by one
  $$(".bento .cell").forEach((cell) => {
    const t = g.timeline({ scrollTrigger: { trigger: cell, start: "top 80%" } });
    t.from(cell, { y: 40, opacity: 0, duration: 0.6, ease: "power3.out" });
    const card = $(".card-pop", cell);
    if (card) t.from(card, { y: 50, scale: 0.92, opacity: 0, duration: 0.8, ease: "elastic.out(1, 0.7)" }, "-=0.3");
    if ($$(".checks li", cell).length) t.from($$(".checks li", cell), { x: -14, opacity: 0, stagger: 0.12, duration: 0.35 }, "-=0.4");
    if ($$(".chip, .lblock", cell).length) t.from($$(".chip, .lblock", cell), { scale: 0, opacity: 0, stagger: 0.07, duration: 0.4, ease: "back.out(3)" }, "-=0.2");
    const tog = $(".toggle", cell);
    if (tog) { tog.classList.remove("on"); t.call(() => tog.classList.add("on")); }
    const num = $(".tick-num", cell);
    if (num) { const o = { v: 0 }; t.to(o, { v: +num.dataset.to, duration: 1.1, ease: "power2.out", onUpdate: () => (num.textContent = Math.round(o.v)) }, "<"); }
    const bub = $(".bubble", cell);
    if (bub) t.from(bub, { y: 20, scale: 0.6, opacity: 0, duration: 0.5, ease: "back.out(2.4)" });
    if ($$("td.yes, td.no", cell).length) t.from($$("td.yes, td.no", cell), { scale: 0, opacity: 0, stagger: 0.04, duration: 0.25 }, "-=0.6");
  });

  up(".step", ".steps-list", { stagger: 0.15 });
  up(".ex", ".ex-grid", { stagger: 0.12 });
  up(".faq details", ".faq-list", { stagger: 0.06, y: 16 });
  g.from(".dline", { strokeDashoffset: 200, duration: 1.4, ease: "power2.out", stagger: 0.15, scrollTrigger: { trigger: ".dash", start: "top 80%" } });
  if (!isMobile()) $$(".sblock").forEach((b) => g.from(b, { x: b.classList.contains("left") ? -40 : 40, opacity: 0, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: b, start: "top 70%" } }));
}
