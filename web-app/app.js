/* ═══════════════════════════════════════════════
   SOFI THESIS — APP JS
   Earnings re-rating model, scenario interactivity,
   theme toggle, animations
════════════════════════════════════════════════ */

'use strict';

// ── THEME TOGGLE ────────────────────────────────
(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root   = document.documentElement;
  let theme = root.getAttribute('data-theme') || 'dark';

  function applyTheme(t) {
    theme = t;
    root.setAttribute('data-theme', t);
    if (toggle) {
      toggle.setAttribute('aria-label', `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`);
      toggle.innerHTML = t === 'dark'
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
  }

  applyTheme(theme);
  toggle && toggle.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'));
})();

// ── NAV SCROLL SHADOW ───────────────────────────
(function () {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const obs = new IntersectionObserver(
    ([e]) => nav.classList.toggle('nav--scrolled', !e.isIntersecting),
    { threshold: 0, rootMargin: '-64px 0px 0px 0px' }
  );
  const sentinel = document.getElementById('hero');
  if (sentinel) obs.observe(sentinel);
})();

// ── EARNINGS RE-RATING MODEL DATA ──────────────
// Cost of equity for digital bank ~12%
// Base year FY2025 GAAP NI estimated at $525M on $3.58B revenue
// Diluted shares estimated at 1.5B post-2025 equity offering
const WACC       = 0.12;
const BASE_REV   = 3_580_000_000;
const BASE_NI_M  = 0.147;
const SHARES     = 1_500_000_000;
const NET_CASH   = 0;
const CUR_PRICE  = 18.44;
const CONV       = 0.70;

const SCENARIOS = {
  bull: {
    label:    'Bull Case',
    desc:     '26% revenue CAGR · NI margin expanding to 21% · 35× terminal P/E (HOOD parity)',
    cagr:     0.26,
    niEnd:    0.21,
    tvMult:   35,
    color:    'bull',
    panelClass: 'scenario-bull',
  },
  base: {
    label:    'Base Case',
    desc:     '24% revenue CAGR · NI margin expanding to 20% · 32× terminal P/E (premium to lenders)',
    cagr:     0.24,
    niEnd:    0.20,
    tvMult:   32,
    color:    'base',
    panelClass: 'scenario-base',
  },
  bear: {
    label:    'Bear Case',
    desc:     '20% revenue CAGR · NI margin expanding to 18% · 30× terminal P/E (multiple stays compressed)',
    cagr:     0.20,
    niEnd:    0.18,
    tvMult:   30,
    color:    'bear',
    panelClass: 'scenario-bear',
  },
};

// ── EARNINGS PROJECTION & VALUATION ─────────────
function calcDCF(sc) {
  const revs = [], nis = [], pvs = [];
  let pvSum = 0;
  for (let yr = 1; yr <= 5; yr++) {
    const rev    = BASE_REV * Math.pow(1 + sc.cagr, yr);
    const margin = BASE_NI_M + (sc.niEnd - BASE_NI_M) * (yr / 5);
    const ni     = rev * margin;
    const pv     = ni / Math.pow(1 + WACC, yr);
    revs.push(rev); nis.push(ni); pvs.push(pv);
    pvSum += pv;
  }
  const tv        = sc.tvMult * nis[4];
  const pvTV      = tv / Math.pow(1 + WACC, 5);
  const ev        = pvSum + pvTV;
  const intrinsic = (ev + NET_CASH) / SHARES;
  const target12m = CUR_PRICE + CONV * (intrinsic - CUR_PRICE);
  // alias to keep downstream renderer compatible
  return { revs, fcfs: nis, nis, pvs, pvSum, tv, pvTV, ev, intrinsic, target12m };
}

// ── FORMAT HELPERS ──────────────────────────────
const fmt = {
  pct:   (v) => `${(v * 100).toFixed(0)}%`,
  pct1:  (v) => `${(v * 100).toFixed(1)}%`,
  B:     (v) => `$${(v / 1e9).toFixed(2)}B`,
  price: (v) => `$${v.toFixed(2)}`,
  updown:(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
};

// ── ANIMATED NUMBER ─────────────────────────────
function animateValue(el, from, to, formatter, duration = 350) {
  if (!el) return;
  const start = performance.now();
  function step(ts) {
    const progress = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = formatter(from + (to - from) * ease);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = formatter(to);
  }
  requestAnimationFrame(step);
}

// ── RENDER SCENARIO ─────────────────────────────
let currentScenario = 'base';

function renderScenario(key) {
  const sc   = SCENARIOS[key];
  const data = calcDCF(sc);

  // Update panel class for border color
  const panel = document.getElementById('scenario-panel');
  if (panel) {
    panel.className = `scenario-panel ${sc.panelClass}`;
  }

  // Labels
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('sc-name',  sc.label);
  setTxt('sc-desc',  sc.desc);

  // Animated metrics
  const prev = currentScenario === key ? calcDCF(sc) : calcDCF(SCENARIOS[currentScenario]);

  const metrics = [
    ['sc-cagr',        prev.revs[0] / BASE_REV / 1 - 1, sc.cagr,       (v) => fmt.pct(v)],
    ['sc-fcf-margin',  prev.nis[4] / prev.revs[4],        sc.niEnd,      (v) => fmt.pct(v)],
    ['sc-yr5-rev',     prev.revs[4], data.revs[4],  fmt.B],
    ['sc-yr5-fcf',     prev.nis[4],  data.nis[4],   fmt.B],
    ['sc-intrinsic',   prev.intrinsic, data.intrinsic, fmt.price],
    ['sc-target',      prev.target12m, data.target12m, fmt.price],
  ];

  metrics.forEach(([id, from, to, f]) => {
    animateValue(document.getElementById(id), from, to, f);
  });

  // Sub-labels
  const intrinsicUpEl = document.getElementById('sc-intrinsic-upside');
  const targetUpEl    = document.getElementById('sc-target-upside');
  if (intrinsicUpEl) intrinsicUpEl.textContent = `${fmt.updown((data.intrinsic / CUR_PRICE - 1) * 100)} vs. $${CUR_PRICE}`;
  if (targetUpEl)    targetUpEl.textContent    = `${fmt.updown((data.target12m / CUR_PRICE - 1) * 100)} upside`;

  // Year-by-year table
  const tbody = document.getElementById('dcf-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    const YEARS = [2026, 2027, 2028, 2029, 2030];
    YEARS.forEach((yr, i) => {
      const margin = BASE_NI_M + (sc.niEnd - BASE_NI_M) * ((i + 1) / 5);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>FY${yr}</td>
        <td>${fmt.B(data.revs[i])}</td>
        <td>${fmt.pct1(margin)}</td>
        <td>${fmt.B(data.nis[i])}</td>
        <td>${fmt.B(data.pvs[i])}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Price bar (scale: $10 to max above bull intrinsic)
  const MIN  = 10;
  const MAX  = Math.max(50, Math.ceil(data.intrinsic / 5) * 5 + 5);
  const pct  = (v) => `${Math.max(0, Math.min(100, ((v - MIN) / (MAX - MIN)) * 100)).toFixed(1)}%`;

  const barFill   = document.getElementById('price-bar-fill');
  const barCur    = document.getElementById('price-bar-current');
  const barTarget = document.getElementById('price-bar-target');
  const barIntr   = document.getElementById('price-bar-intrinsic');
  const barMaxLbl = document.getElementById('price-bar-max-label');

  if (barFill)    barFill.style.width = pct(data.target12m);
  if (barCur)     barCur.style.left   = pct(CUR_PRICE);
  if (barTarget) {
    barTarget.style.left = pct(data.target12m);
    const span = barTarget.querySelector('.price-bar-tag');
    if (span) span.innerHTML = `${fmt.price(data.target12m)}<br/>12m Target`;
  }
  if (barIntr) {
    barIntr.style.left = pct(data.intrinsic);
    const span = barIntr.querySelector('.price-bar-tag');
    if (span) span.innerHTML = `${fmt.price(data.intrinsic)}<br/>Intrinsic`;
  }
  if (barMaxLbl) barMaxLbl.textContent = `$${MAX}`;

  currentScenario = key;
}

// ── SCENARIO BUTTON WIRING ──────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btns = document.querySelectorAll('.scenario-btn');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.scenario;
      if (key === currentScenario) return;

      // Update active state
      btns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      renderScenario(key);
    });
  });

  // Initial render
  renderScenario('base');

  // ── INTERSECTION OBSERVER — ENTRANCE ANIMATIONS
  const animateItems = document.querySelectorAll(
    '.kpi-card, .exec-bullet, .risk-card, .timeline-item, .versus-card'
  );

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.animation = 'fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both';
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    animateItems.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.animationDelay = `${(i % 6) * 60}ms`;
      io.observe(el);
    });
  }

  // ── ACTIVE NAV LINK on scroll
  const sections = ['hero','summary','rebuttal','dcf','comps','catalysts','risks','recommendation'];
  const navLinks = document.querySelectorAll('.nav-links a');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(a => {
          const href = a.getAttribute('href');
          a.style.color = href === `#${id}` ? 'var(--color-text)' : '';
        });
      }
    });
  }, { threshold: 0.3 });

  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) sectionObserver.observe(el);
  });
});
