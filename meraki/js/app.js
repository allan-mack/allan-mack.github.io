/*
 * app.js — bootstrap, global state, connect flow, and PWA registration.
 */
(function (global) {
  'use strict';

  const MTK = global.MTK = global.MTK || {};
  MTK.VERSION = 'v1.1';
  MTK.state = {
    route: 'overview',
    data: null,
    analysis: null,
    insightFilter: 'all',
    clientSort: 'usage',
    clientQuery: '',
  };

  MTK.debounce = function (fn, ms) {
    let t; return function () { clearTimeout(t); const a = arguments, c = this; t = setTimeout(() => fn.apply(c, a), ms); };
  };

  const el = (id) => document.getElementById(id);

  MTK.go = function (route) {
    if (!MTK.state.data) return;
    location.hash = '#/' + route;
  };

  function onHashChange() {
    const m = (location.hash || '').match(/^#\/(\w+)/);
    const route = m ? m[1] : 'overview';
    if (MTK.state.data) MTK.ui.render(route);
  }

  function setData(data) {
    MTK.state.data = data;
    MTK.state.analysis = MTK.insights.analyze(data);
    el('connect-screen').classList.add('hidden');
    el('app-shell').classList.remove('hidden');
    el('org-label').textContent = data.org.name || ('Org ' + data.org.id);
    el('mode-label').textContent = data.demo ? 'Demo data' : 'Live';
    el('mode-label').className = 'mode-badge ' + (data.demo ? 'demo' : 'live');
    el('generated-label').textContent = 'Updated ' + new Date(data.generatedAt).toLocaleTimeString();
    updatePlanChrome();
    if (!location.hash) location.hash = '#/overview';
    else onHashChange();
  }

  // ---- Subscription / plan chrome -----------------------------------------
  function updatePlanChrome() {
    const p = MTK.plan.get();
    const badge = el('plan-label');
    if (badge) { badge.textContent = p.name; badge.className = 'plan-badge tier-' + p.id; }
    const rpt = el('btn-report');
    if (rpt) rpt.classList.toggle('hidden', !MTK.plan.can('export'));
  }

  // Simulated checkout. In production, replace the confirm() with your billing
  // provider's flow (Stripe Checkout, Apple/Google IAP) and call MTK.plan.set
  // from the success callback.
  MTK.subscribe = function (tier) {
    const p = MTK.plan.PLANS[tier];
    if (!p) return;
    if (tier === 'free' || MTK.state.data && MTK.state.data.demo) {
      MTK.plan.set(tier);
      toast(tier === MTK.plan.id() ? `You're on the ${p.name} plan` : `Switched to ${p.name}`);
      return;
    }
    const ok = window.confirm(`Subscribe to MerakiScope ${p.name} for $${p.price}/mo per organization?\n\n(Demo: this simulates checkout — no payment is taken.)`);
    if (ok) { MTK.plan.set(tier); toast(`Welcome to ${p.name}! 🎉`); }
  };

  MTK.onPlanChange = function () {
    updatePlanChrome();
    if (MTK.state.data) MTK.ui.render(MTK.state.route || 'overview');
  };

  function toast(msg) {
    let t = el('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---- Connect flow --------------------------------------------------------

  function showConnectError(msg) {
    const e = el('connect-error');
    e.textContent = msg;
    e.classList.toggle('hidden', !msg);
  }

  async function loadDemo() {
    showConnectError('');
    setBusy(true);
    try {
      const data = MTK.mock.build();
      setData(data);
    } catch (e) {
      showConnectError('Could not build demo data: ' + e.message);
    } finally { setBusy(false); }
  }

  function readCfg() {
    return {
      apiKey: el('api-key').value.trim(),
      baseUrl: el('base-url').value.trim() || undefined,
      proxyUrl: el('proxy-url').value.trim() || undefined,
    };
  }

  // Your API key is sent on every request to baseUrl/proxyUrl, so both must be
  // HTTPS — otherwise the key could travel in cleartext. Reject anything else.
  function validateCfg(cfg) {
    const httpsOk = (u) => { try { return new URL(u).protocol === 'https:'; } catch (e) { return false; } };
    if (cfg.baseUrl && !httpsOk(cfg.baseUrl)) return 'The API base URL must start with https:// (your key is sent there).';
    if (cfg.proxyUrl && !httpsOk(cfg.proxyUrl)) return 'The CORS proxy URL must start with https:// (your key is sent there).';
    return null;
  }

  async function fetchOrgs() {
    showConnectError('');
    const cfg = readCfg();
    if (!cfg.apiKey) { showConnectError('Enter your Meraki API key first.'); return; }
    const bad = validateCfg(cfg);
    if (bad) { showConnectError(bad); return; }
    setBusy(true);
    try {
      const orgs = await MTK.api.listOrganizations(cfg);
      if (!orgs.length) { showConnectError('No organizations are visible to this API key.'); return; }
      const sel = el('org-select');
      sel.innerHTML = orgs.map((o) => `<option value="${o.id}">${MTK.ui.esc(o.name)} (${o.id})</option>`).join('');
      el('org-picker').classList.remove('hidden');
      el('load-live').classList.remove('hidden');
      MTK._cfg = cfg;
    } catch (e) {
      showConnectError(connectHint(e.message));
    } finally { setBusy(false); }
  }

  async function loadLive() {
    showConnectError('');
    const cfg = MTK._cfg || readCfg();
    const orgId = el('org-select').value;
    if (!orgId) { showConnectError('Pick an organization.'); return; }
    const bad = validateCfg(cfg);
    if (bad) { showConnectError(bad); return; }
    setBusy(true, 'Pulling data from Meraki…');
    try {
      const data = await MTK.api.load(cfg, orgId);
      // Persist non-secret connection prefs (never the key).
      try { localStorage.setItem('mtk_base', cfg.baseUrl || ''); localStorage.setItem('mtk_proxy', cfg.proxyUrl || ''); } catch (e) {}
      setData(data);
    } catch (e) {
      showConnectError(connectHint(e.message));
    } finally { setBusy(false); }
  }

  function connectHint(msg) {
    if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
      return 'The browser could not reach the Meraki API directly. This is almost always CORS — Meraki does not allow direct browser calls. Set a CORS proxy URL (see the "Live mode" note below), then try again. [' + msg + ']';
    }
    return msg;
  }

  function setBusy(on, label) {
    el('connect-spinner').classList.toggle('hidden', !on);
    if (label) el('spinner-label').textContent = label;
    document.querySelectorAll('#connect-screen button').forEach((b) => b.disabled = !!on);
  }

  function disconnect() {
    MTK.state.data = null;
    // Wipe the credential and any cached connection from memory and the DOM.
    MTK._cfg = null;
    const keyEl = el('api-key');
    if (keyEl) keyEl.value = '';
    const sel = el('org-select');
    if (sel) sel.innerHTML = '';
    el('org-picker').classList.add('hidden');
    el('load-live').classList.add('hidden');
    showConnectError('');
    el('app-shell').classList.add('hidden');
    el('connect-screen').classList.remove('hidden');
    location.hash = '';
  }

  function refresh() {
    if (!MTK.state.data) return;
    if (MTK.state.data.demo) { loadDemo(); return; }
    if (MTK._cfg) loadLive();
  }

  function init() {
    // Restore non-secret prefs.
    try {
      el('base-url').value = localStorage.getItem('mtk_base') || '';
      el('proxy-url').value = localStorage.getItem('mtk_proxy') || '';
    } catch (e) {}

    el('btn-demo').onclick = loadDemo;
    el('fetch-orgs').onclick = fetchOrgs;
    el('load-live').onclick = loadLive;
    el('btn-disconnect').onclick = disconnect;
    el('btn-refresh').onclick = refresh;
    el('btn-report').onclick = () => MTK.ui.printReport();
    el('plan-label').onclick = () => MTK.go('pricing');

    document.querySelectorAll('.nav-tab').forEach((t) => t.onclick = () => MTK.go(t.dataset.route));
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') MTK.ui.closeModal(); });

    // Mobile nav toggle
    const menuBtn = el('menu-toggle');
    if (menuBtn) menuBtn.onclick = () => el('main-nav').classList.toggle('open');
    document.querySelectorAll('.nav-tab').forEach((t) => t.addEventListener('click', () => el('main-nav').classList.remove('open')));

    // Service worker (installability on phones).
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
