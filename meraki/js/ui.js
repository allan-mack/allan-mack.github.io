/*
 * ui.js — rendering, router, glossary, modals, and plan-gated depth.
 * Pure DOM rendering; reads from MTK.state, writes into #view.
 */
(function (global) {
  'use strict';

  const fmtBytes = (n) => MTK.insights.fmtBytes(n);
  const timeAgo = (iso) => MTK.insights.timeAgo(iso);
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const can = (f) => MTK.plan.can(f);
  const limit = (k) => MTK.plan.limit(k);

  const SEV_LABEL = { critical: 'Critical', warning: 'Warning', info: 'Heads-up', good: 'Healthy' };

  // ---- Glossary (educational layer for non-specialists) --------------------
  const GLOSSARY = {
    rssi: ['Signal strength (RSSI)', 'How strong the Wi-Fi signal is, in dBm. Closer to 0 is better: −50 is excellent, −67 is good, −72 or lower is weak and will feel slow.'],
    latency: ['Latency', 'The round-trip delay for data, in milliseconds (ms). Under 60 ms feels instant; over 100 ms makes calls and cloud apps feel laggy.'],
    loss: ['Packet loss', 'The share of data that never arrives and must be re-sent. Even 1–2% badly hurts video calls and voice.'],
    jitter: ['Jitter', 'How much latency varies moment to moment. High jitter causes choppy audio and video even if average latency looks fine.'],
    channel: ['Channel utilization', 'How busy the Wi-Fi airwaves are. Wi-Fi is shared, so above ~50% everyone nearby slows down.'],
    ssid: ['SSID', 'The name of a Wi-Fi network that devices connect to (e.g. "Corp-WiFi").'],
    vlan: ['VLAN', 'A virtual network used to separate traffic (e.g. guests from staff) on the same hardware.'],
    uplink: ['Uplink / WAN', 'The connection from a site to the internet, usually through an internet provider.'],
    dhcp: ['DHCP', 'The service that hands out IP addresses so devices can join the network. If it fails, devices connect but "can\'t get online".'],
    dns: ['DNS', 'The internet\'s address book that turns names like example.com into numbers. DNS problems look like "the internet is down" even when it isn\'t.'],
    association: ['Association', 'The first step of joining Wi-Fi, where a device latches onto an access point. Failures here usually mean weak signal or an overloaded AP.'],
    throughput: ['Throughput / usage', 'How much data a device or app moved. Useful for spotting heavy users.'],
    poe: ['PoE', 'Power over Ethernet — switches powering devices like access points and phones over the network cable.'],
    snr: ['Signal-to-noise (SNR)', 'How far the Wi-Fi signal stands above background noise. Higher is better; under ~25 dB gets unreliable.'],
    score: ['Health score', 'A 0–100 summary of your network\'s health. We start at 100 and subtract for problems, weighting critical issues most.'],
  };
  function gloss(key, label) {
    const g = GLOSSARY[key];
    if (!g) return esc(label || key);
    return `<span class="gloss-term" data-term="${key}" tabindex="0" role="button" aria-label="${esc(g[0])}: ${esc(g[1])}">${esc(label || g[0])}</span>`;
  }

  function netName(id) {
    const n = (MTK.state.data.networks || []).find((x) => x.id === id);
    return n ? n.name : (id || '—');
  }
  function statusDot(status) {
    const cls = status === 'online' ? 'ok' : status === 'alerting' ? 'warn' : 'bad';
    return `<span class="dot ${cls}" title="${esc(status)}"></span>`;
  }

  // ---- Sparkline (no dependencies) ----------------------------------------
  function sparkline(vals, o) {
    o = o || {}; const w = o.w || 130, h = o.h || 34, pad = 3;
    if (!vals || vals.length < 2) return '';
    const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), range = (max - min) || 1;
    const xy = vals.map((v, i) => {
      const x = pad + (i / (vals.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return [x, y];
    });
    const line = xy.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = `${pad},${h - pad} ${line} ${(w - pad)},${h - pad}`;
    const color = o.color || '#1ba0d8';
    const id = 'sg' + Math.random().toString(36).slice(2, 7);
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${area}" fill="url(#${id})" stroke="none"/>
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${xy[xy.length - 1][0].toFixed(1)}" cy="${xy[xy.length - 1][1].toFixed(1)}" r="2.6" fill="${color}"/>
    </svg>`;
  }

  // ---- Upgrade nudge -------------------------------------------------------
  function nudge(flag, title, desc) {
    const p = MTK.plan.requiredPlan(flag);
    return `<div class="card nudge">
      <div class="lock">🔒</div>
      <div>
        <h3>${esc(title)}</h3>
        <p class="muted">${esc(desc)}</p>
        <button class="btn primary" data-upgrade="${p.id}">Unlock with ${esc(p.name)} →</button>
        <button class="link-btn" data-nav="pricing">Compare plans</button>
      </div>
    </div>`;
  }

  // ========================================================================
  // VIEWS
  // ========================================================================

  function viewOverview() {
    const d = MTK.state.data;
    const a = MTK.state.analysis;
    const statuses = d.deviceStatuses || [];
    const online = statuses.filter((s) => s.status === 'online').length;
    const offline = statuses.filter((s) => s.status === 'offline').length;
    const alerting = statuses.filter((s) => s.status === 'alerting').length;
    const clients = d.clients || [];
    const onlineClients = clients.filter((c) => c.status === 'Online').length;
    const totalUsage = clients.reduce((s, c) => s + (c.usageTotalBytes || 0), 0);
    const scoreClass = a.score >= 85 ? 'ok' : a.score >= 70 ? 'good' : a.score >= 50 ? 'warn' : 'bad';
    const topFindings = a.findings.filter((f) => f.severity === 'critical' || f.severity === 'warning').slice(0, 4);
    const hist = d.trends && d.trends.healthHistory;
    const trendDelta = hist && hist.length > 1 ? hist[hist.length - 1] - hist[0] : null;

    return `
      <section class="grid-hero">
        <div class="card score-card">
          <div class="score-ring ${scoreClass}"><span>${a.score}</span><small>/100</small></div>
          <div class="score-body">
            <h2>${esc(a.grade)}</h2>
            <p class="muted">Overall ${gloss('score', 'health score')} for <strong>${esc(d.org.name || 'your organization')}</strong></p>
            <div class="pill-row">
              <span class="pill bad" data-filter-nav="critical">${a.counts.critical} critical</span>
              <span class="pill warn" data-filter-nav="warning">${a.counts.warning} warnings</span>
              <span class="pill info" data-filter-nav="info">${a.counts.info} heads-up</span>
              <span class="pill ok" data-filter-nav="good">${a.counts.good} healthy</span>
            </div>
          </div>
          ${can('trends') && hist ? `<div class="score-trend">${sparkline(hist, { color: scoreClass === 'bad' ? '#e15554' : '#2bb673', w: 150, h: 48 })}<span class="muted small">14-day trend ${trendDelta != null ? `<strong class="${trendDelta >= 0 ? 'up' : 'down'}">${trendDelta >= 0 ? '▲' : '▼'} ${Math.abs(trendDelta)}</strong>` : ''}</span></div>` : ''}
        </div>
      </section>

      <section class="kpi-row">
        ${kpi('Networks', (d.networks || []).length, 'sites managed')}
        ${kpi('Devices online', `${online}/${statuses.length}`, offline ? `${offline} offline${alerting ? ', ' + alerting + ' alerting' : ''}` : 'all reporting', offline ? 'bad' : 'ok')}
        ${kpi('Clients (24h)', clients.length, `${onlineClients} online now`)}
        ${kpi('Data moved', fmtBytes(totalUsage), 'across all clients')}
        ${kpi('License', d.licenses && d.licenses.daysToExpiration != null ? d.licenses.daysToExpiration + ' days' : '—', 'until renewal', d.licenses && d.licenses.daysToExpiration != null && d.licenses.daysToExpiration <= 45 ? 'warn' : 'ok')}
        ${kpi('Open alerts', (d.alerts || []).filter((x) => x.severity !== 'info').length, (d.alerts || []).length + ' total events')}
      </section>

      <section class="two-col">
        <div class="card">
          <h3>What needs your attention</h3>
          ${topFindings.length ? topFindings.map(findingMini).join('') : '<p class="muted">Nothing urgent — see the Insights tab for the full picture. 🎉</p>'}
          <button class="link-btn" data-nav="insights">View all insights →</button>
        </div>
        <div class="card">
          <h3>Recent alerts</h3>
          ${(d.alerts || []).slice(0, 6).map((al) => `
            <div class="alert-row">
              <span class="sev ${al.severity}">${esc(al.severity)}</span>
              <div><strong>${esc(al.type)}</strong><br><span class="muted">${esc(al.networkName || netName(al.networkId))} · ${timeAgo(al.occurredAt)}</span></div>
            </div>`).join('') || '<p class="muted">No recent alerts.</p>'}
        </div>
      </section>`;
  }

  function kpi(label, value, sub, cls) {
    return `<div class="card kpi"><div class="kpi-val ${cls || ''}">${esc(value)}</div><div class="kpi-label">${esc(label)}</div><div class="muted small">${esc(sub)}</div></div>`;
  }
  function findingMini(f) {
    return `<div class="finding-mini ${f.severity}"><span class="sev ${f.severity}">${SEV_LABEL[f.severity]}</span> <strong>${esc(f.title)}</strong></div>`;
  }

  function viewInsights() {
    const a = MTK.state.analysis;
    const filter = MTK.state.insightFilter || 'all';
    let list = a.findings.filter((f) => filter === 'all' || f.severity === filter);
    const cap = limit('insights');
    let capped = false;
    if (!can('insights_all') && list.length > cap) { list = list.slice(0, cap); capped = true; }
    return `
      <section>
        <div class="card">
          <h2>Insights &amp; recommendations</h2>
          <p class="muted">Plain-English findings about your organization, sorted by urgency. Each explains what we found, why it matters, and what to do.</p>
          <div class="filter-row">
            ${['all', 'critical', 'warning', 'info', 'good'].map((k) => `<button class="chip ${filter === k ? 'active' : ''}" data-filter="${k}">${k === 'all' ? 'All' : SEV_LABEL[k]} (${k === 'all' ? a.findings.length : a.counts[k]})</button>`).join('')}
          </div>
        </div>
        ${list.map(findingCard).join('') || '<div class="card"><p class="muted">No findings in this category.</p></div>'}
        ${capped ? nudge('insights_all', `${a.findings.length - cap} more insights are waiting`, 'The Free plan shows your top findings. Upgrade to see every prioritized recommendation across all categories.') : ''}
      </section>`;
  }
  function findingCard(f) {
    return `
      <div class="card finding ${f.severity}">
        <div class="finding-head"><span class="sev ${f.severity}">${SEV_LABEL[f.severity]}</span><span class="area-tag">${esc(f.area)}</span></div>
        <h3>${esc(f.title)}</h3>
        <p>${enrich(f.detail)}</p>
        ${f.impact ? `<p class="kv"><strong>Why it matters:</strong> ${enrich(f.impact)}</p>` : ''}
        ${f.action ? `<p class="kv action"><strong>What to do:</strong> ${enrich(f.action)}</p>` : ''}
        ${f.evidence && f.evidence.length ? `<details><summary>Evidence (${f.evidence.length})</summary><ul>${f.evidence.map((e) => '<li>' + esc(e) + '</li>').join('')}</ul></details>` : ''}
      </div>`;
  }
  // Auto-link known jargon inside finding text to the glossary.
  function enrich(text) {
    let out = esc(text);
    const map = { 'packet loss': 'loss', 'latency': 'latency', 'channel utilization': 'channel', 'DHCP': 'dhcp', 'DNS': 'dns', 'association': 'association', 'RSSI': 'rssi', 'jitter': 'jitter' };
    Object.keys(map).forEach((phrase) => {
      const re = new RegExp('\\b(' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b');
      out = out.replace(re, (m) => `<span class="gloss-term" data-term="${map[phrase]}" tabindex="0" role="button">${m}</span>`);
    });
    return out;
  }

  function viewClients() {
    const d = MTK.state.data;
    let clients = (d.clients || []).slice();
    const sort = MTK.state.clientSort || 'usage';
    clients.sort((a, b) => {
      if (sort === 'usage') return (b.usageTotalBytes || 0) - (a.usageTotalBytes || 0);
      if (sort === 'signal') return (a.rssi == null ? 999 : a.rssi) - (b.rssi == null ? 999 : b.rssi);
      if (sort === 'latency') return (b.avgLatencyMs || 0) - (a.avgLatencyMs || 0);
      return 0;
    });
    const q = (MTK.state.clientQuery || '').toLowerCase();
    const searchable = can('search_all') ? clients : clients.slice(0, limit('clients'));
    let filtered = searchable;
    if (q) filtered = searchable.filter((c) => (c.description + ' ' + c.mac + ' ' + (c.manufacturer || '') + ' ' + (c.ssid || '')).toLowerCase().includes(q));
    const cap = limit('clients');
    const shown = can('clients_all') ? filtered.slice(0, 200) : filtered.slice(0, cap);
    const hiddenCount = (d.clients || []).length - (can('clients_all') ? 0 : Math.min(cap, (d.clients || []).length));

    return `
      <section>
        <div class="card">
          <h2>Client experience</h2>
          <p class="muted">Every device on the network, with the signals that predict their experience: ${gloss('rssi', 'signal')}, ${gloss('latency')}, and ${gloss('throughput', 'usage')}.${can('client_detail') ? ' Tap any device for a deep-dive.' : ''}</p>
          <div class="filter-row">
            <input id="client-search" class="search" placeholder="Search by name, MAC, vendor, SSID…" value="${esc(MTK.state.clientQuery || '')}">
            <span class="muted small">Sort:</span>
            ${['usage', 'signal', 'latency'].map((k) => `<button class="chip ${sort === k ? 'active' : ''}" data-csort="${k}">${k}</button>`).join('')}
          </div>
        </div>
        <div class="card table-wrap">
          <table class="data">
            <thead><tr><th>Device</th><th>Site</th><th>Conn.</th><th>Signal</th><th>Latency</th><th>Usage (24h)</th><th>Status</th></tr></thead>
            <tbody>
              ${shown.map((c) => `
                <tr class="${can('client_detail') ? 'clickable' : ''}" data-client="${esc(c.id)}">
                  <td><strong>${esc(c.description)}</strong><br><span class="muted small">${esc(c.manufacturer || '')} · ${esc(c.os || '')}</span></td>
                  <td>${esc(netName(c.networkId))}</td>
                  <td>${c.connectionType === 'wireless' ? '📶 ' + esc(c.ssid || 'Wi-Fi') : '🔌 wired'}</td>
                  <td>${signalCell(c)}</td>
                  <td>${c.avgLatencyMs != null ? latencyCell(c.avgLatencyMs) : '<span class="muted">—</span>'}</td>
                  <td>${fmtBytes(c.usageTotalBytes)}</td>
                  <td><span class="badge ${c.status === 'Online' ? 'ok' : 'muted-badge'}">${esc(c.status)}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
          ${shown.length === 0 ? '<p class="muted">No clients match your search.</p>' : ''}
        </div>
        ${!can('clients_all') && hiddenCount > 0 ? nudge('clients_all', `${hiddenCount} more clients are hidden`, `The Free plan shows up to ${cap} clients. Upgrade to see and search every device, with per-client deep-dives.`) : '<p class="muted small">Showing up to 200 clients — refine with search to narrow down.</p>'}
      </section>`;
  }
  function signalCell(c) {
    if (c.rssi == null) return '<span class="muted">n/a</span>';
    const cls = c.rssi >= -67 ? 'ok' : c.rssi >= -72 ? 'warn' : 'bad';
    const word = c.rssi >= -67 ? 'good' : c.rssi >= -72 ? 'fair' : 'weak';
    return `<span class="badge ${cls}">${c.rssi} dBm</span> <span class="muted small">${word}</span>`;
  }
  function latencyCell(ms) {
    const cls = ms < 60 ? 'ok' : ms < 100 ? 'warn' : 'bad';
    return `<span class="badge ${cls}">${ms} ms</span>`;
  }

  function viewApps() {
    const d = MTK.state.data;
    const apps = (d.applications || []).slice();
    const metrics = can('apps_metrics');
    return `
      <section>
        <div class="card">
          <h2>Application experience</h2>
          <p class="muted">How the apps your people use most are actually performing${metrics ? ' — including ' + gloss('latency') + ' and ' + gloss('loss', 'packet loss') : ''}.</p>
        </div>
        <div class="card table-wrap">
          <table class="data">
            <thead><tr><th>Application</th><th>Category</th><th>Users</th><th>Data (24h)</th>${metrics ? '<th>Latency</th><th>Loss</th><th>Experience</th>' : '<th>Experience</th>'}</tr></thead>
            <tbody>
              ${apps.map((ap) => {
                const lat = ap.avgLatencyMs, loss = ap.lossPercent;
                const bad = (lat != null && lat >= 120) || (loss != null && loss >= 1.5);
                const meh = !bad && ((lat != null && lat >= 80) || (loss != null && loss >= 0.8));
                const exp = !metrics ? '<span class="badge muted-badge">🔒 Pro</span>' : bad ? '<span class="badge bad">Poor</span>' : meh ? '<span class="badge warn">Fair</span>' : '<span class="badge ok">Good</span>';
                return `<tr>
                  <td><strong>${esc(ap.name)}</strong></td>
                  <td class="muted">${esc(ap.category || '—')}</td>
                  <td>${esc(ap.numClients || '—')}</td>
                  <td>${fmtBytes(ap.usageTotalBytes)}</td>
                  ${metrics ? `<td>${lat != null ? latencyCell(lat) : '<span class="muted">—</span>'}</td><td>${loss != null ? `<span class="badge ${loss < 1 ? 'ok' : loss < 2 ? 'warn' : 'bad'}">${loss}%</span>` : '<span class="muted">—</span>'}</td><td>${exp}</td>` : `<td>${exp}</td>`}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${!metrics ? nudge('apps_metrics', 'See how each app actually performs', 'Free shows app usage. Upgrade to reveal per-app latency, packet loss, and an at-a-glance experience rating so you know which apps are suffering and why.') : ''}
      </section>`;
  }

  function viewNetworks() {
    const d = MTK.state.data;
    const detail = can('networks_detail');
    return `
      <section>
        <div class="card"><h2>Networks &amp; devices</h2><p class="muted">Each site and the hardware running it.</p></div>
        ${(d.networks || []).map((n) => {
          const devs = (d.deviceStatuses || []).filter((s) => s.networkId === n.id);
          const ll = (d.uplinkLossLatency || []).filter((u) => u.networkId === n.id);
          const offline = devs.filter((s) => s.status === 'offline').length;
          return `
            <div class="card">
              <div class="net-head">
                <h3>${esc(n.name)} ${offline ? '<span class="badge bad">' + offline + ' offline</span>' : '<span class="badge ok">all online</span>'}</h3>
                <span class="muted small">${(n.productTypes || []).join(' · ')} · ${devs.length} devices</span>
              </div>
              ${ll.length ? `<div class="uplink-strip">${ll.map((u) => `
                <div class="uplink-chip ${(u.avgLossPercent >= 1 || u.avgLatencyMs >= 100) ? 'bad' : 'ok'}">
                  <div><strong>${esc(u.uplink)}</strong> ${gloss('uplink', 'uplink')}</div>
                  <div class="small">${u.avgLatencyMs} ms · ${u.avgLossPercent}% loss</div>
                  ${can('trends') && u.latencySeries ? sparkline(u.latencySeries, { color: (u.avgLatencyMs >= 100 ? '#e15554' : '#2bb673'), w: 110, h: 28 }) : ''}
                </div>`).join('')}</div>` : ''}
              ${detail ? `<table class="data compact">
                <thead><tr><th>Device</th><th>Model</th><th>Type</th><th>Status</th><th>Last seen</th></tr></thead>
                <tbody>
                  ${devs.map((s) => `<tr><td>${esc(s.name || s.serial)}</td><td class="muted">${esc(s.model || '')}</td><td>${esc(s.productType || '')}</td><td>${statusDot(s.status)} ${esc(s.status)}</td><td class="muted small">${timeAgo(s.lastReportedAt)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No devices reported.</td></tr>'}
                </tbody>
              </table>` : `<p class="muted small">${devs.filter((s) => s.status === 'online').length}/${devs.length} devices online.</p>`}
            </div>`;
        }).join('')}
        ${!detail ? nudge('networks_detail', 'Drill into every device & uplink', 'Upgrade to see each device\'s status and last-seen time, plus live uplink latency/loss sparklines for every site.') : ''}
      </section>`;
  }

  // ---- Pricing -------------------------------------------------------------
  function viewPricing() {
    const cur = MTK.plan.id();
    const cards = MTK.plan.all().map((p) => {
      const isCur = p.id === cur;
      return `
        <div class="card price-card ${p.highlight ? 'featured' : ''} ${isCur ? 'current' : ''}">
          ${p.highlight ? '<div class="ribbon">Most popular</div>' : ''}
          <h3>${esc(p.name)}</h3>
          <div class="price">${p.price === 0 ? 'Free' : '$' + p.price}<span class="muted small">${p.price === 0 ? '' : '/mo'}</span></div>
          <p class="muted small period">${esc(p.period)}</p>
          <p class="blurb">${esc(p.blurb)}</p>
          <ul class="sell">${p.sell.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
          ${isCur ? '<button class="btn current-btn" disabled>✓ Current plan</button>' : `<button class="btn ${p.highlight ? 'primary' : ''}" data-upgrade="${p.id}">${planCta(cur, p.id)}</button>`}
        </div>`;
    }).join('');
    return `
      <section>
        <div class="card pricing-head">
          <h2>Plans &amp; pricing</h2>
          <p class="muted">Start free. Upgrade when you want deeper troubleshooting. Cancel anytime. Prices are per organization; demo lets you switch plans instantly to compare.</p>
        </div>
        <div class="price-grid">${cards}</div>
        <div class="card faq">
          <h3>Common questions</h3>
          <details><summary>Is there really a free plan?</summary><p>Yes. Free covers the health score, your top insights, and a capped view of clients and apps — enough to know if something is wrong. No credit card needed.</p></details>
          <details><summary>What does “per organization” mean?</summary><p>Each Meraki organization (your whole company in the dashboard) is billed separately. Enterprise lets you manage and switch between several organizations from one place.</p></details>
          <details><summary>How is my data handled?</summary><p>MerakiScope runs in your browser and talks only to Meraki through your own connection. We don\'t store your network data on a server.</p></details>
          <details><summary>Can I change plans later?</summary><p>Anytime. Upgrades take effect immediately; downgrades apply at the end of the billing period.</p></details>
        </div>
      </section>`;
  }
  function planCta(cur, target) {
    const order = MTK.plan.ORDER;
    return order.indexOf(target) > order.indexOf(cur) ? 'Upgrade to ' + MTK.plan.PLANS[target].name : 'Switch to ' + MTK.plan.PLANS[target].name;
  }

  // ---- Help / Glossary -----------------------------------------------------
  function viewHelp() {
    const terms = Object.keys(GLOSSARY).map((k) => `<div class="gloss-item"><strong>${esc(GLOSSARY[k][0])}</strong><p class="muted">${esc(GLOSSARY[k][1])}</p></div>`).join('');
    return `
      <section>
        <div class="card">
          <h2>Help &amp; glossary</h2>
          <p class="muted">MerakiScope is built for managers, not network engineers. Here\'s what the terms mean and how to get the most out of the app. Underlined ${gloss('latency', 'terms')} anywhere in the app are tappable for a quick definition.</p>
        </div>
        <div class="card">
          <h3>Getting started</h3>
          <ol class="help-steps">
            <li><strong>Read the health score first.</strong> It\'s your one-glance summary. Green is good; orange or red means open the Insights tab.</li>
            <li><strong>Work the Insights top-down.</strong> They\'re sorted by urgency, and each tells you what to do — no networking degree required.</li>
            <li><strong>Check Clients &amp; Applications</strong> when users complain. Weak signal, high latency, or a struggling app usually explains it.</li>
            <li><strong>Install it on your phone.</strong> Use your browser\'s “Add to Home Screen” to get alerts on the go.</li>
          </ol>
        </div>
        <div class="card">
          <h3>Glossary</h3>
          <div class="gloss-grid">${terms}</div>
        </div>
        <div class="card">
          <h3>About</h3>
          <p class="muted">MerakiScope ${esc(MTK.VERSION || '')} — an independent troubleshooting companion for Cisco Meraki. Not affiliated with Cisco. Demo data is fictional.</p>
        </div>
      </section>`;
  }

  // ========================================================================
  // Client detail modal
  // ========================================================================
  function openClientDetail(id) {
    const d = MTK.state.data;
    const c = (d.clients || []).find((x) => x.id === id);
    if (!c) return;
    const tips = [];
    if (c.rssi != null && c.rssi <= -72) tips.push({ s: 'warning', t: 'Weak Wi-Fi signal', d: `At ${c.rssi} dBm this device is on the edge of coverage. Move closer to an access point or add coverage where it sits.` });
    if (c.avgLatencyMs != null && c.avgLatencyMs >= 100) tips.push({ s: 'warning', t: 'High latency', d: `${c.avgLatencyMs} ms round-trip will feel laggy in calls and cloud apps. Check the access point and site uplink this device uses.` });
    if (c.failedConnection) tips.push({ s: 'warning', t: 'Recent connection failures', d: 'This device failed to connect recently — often weak signal, a full DHCP pool, or a wrong saved password.' });
    if (c.usageTotalBytes > 8e9) tips.push({ s: 'info', t: 'Heavy data user', d: `Moved ${fmtBytes(c.usageTotalBytes)} in 24h. If that\'s unexpected, check for backups, streaming, or updates.` });
    if (!tips.length) tips.push({ s: 'good', t: 'Looks healthy', d: 'No signal, latency, or connection problems detected for this device.' });

    const rows = [
      ['Device', c.description], ['Manufacturer', c.manufacturer], ['Operating system', c.os],
      ['MAC address', c.mac], ['IP address', c.ip], ['Site', netName(c.networkId)],
      ['Connection', c.connectionType === 'wireless' ? 'Wi-Fi · ' + (c.ssid || '—') : 'Wired'],
      ['Signal (RSSI)', c.rssi != null ? c.rssi + ' dBm' : 'n/a'],
      ['Signal-to-noise', c.snr != null ? c.snr + ' dB' : 'n/a'],
      ['VLAN', c.vlan], ['Avg latency', c.avgLatencyMs != null ? c.avgLatencyMs + ' ms' : 'n/a'],
      ['Sent', fmtBytes(c.usageSentBytes)], ['Received', fmtBytes(c.usageRecvBytes)],
      ['Total usage (24h)', fmtBytes(c.usageTotalBytes)], ['Status', c.status], ['Last seen', timeAgo(c.lastSeen)],
    ];
    const html = `
      <div class="modal-head"><h2>${esc(c.description)}</h2><button class="icon-btn" data-close-modal>✕</button></div>
      <div class="modal-body">
        <div class="detail-grid">${rows.map((r) => `<div class="dkv"><span class="muted small">${esc(r[0])}</span><strong>${esc(r[1] == null || r[1] === '' ? '—' : r[1])}</strong></div>`).join('')}</div>
        <h3>What we\'d check for this device</h3>
        ${tips.map((t) => `<div class="finding ${t.s} mini-finding"><span class="sev ${t.s}">${SEV_LABEL[t.s]}</span> <strong>${esc(t.t)}</strong><p>${esc(t.d)}</p></div>`).join('')}
      </div>`;
    openModal(html);
  }

  function openModal(html) {
    const root = el('modal-root');
    root.innerHTML = `<div class="modal-backdrop" data-close-modal></div><div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    root.classList.remove('hidden');
    root.querySelectorAll('[data-close-modal]').forEach((x) => x.onclick = closeModal);
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    const root = el('modal-root');
    root.classList.add('hidden'); root.innerHTML = '';
    document.body.style.overflow = '';
  }

  // ========================================================================
  // Printable report (Pro+)
  // ========================================================================
  function printReport() {
    const d = MTK.state.data, a = MTK.state.analysis;
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = a.findings.map((f) => `<tr><td class="s ${f.severity}">${SEV_LABEL[f.severity]}</td><td><strong>${esc(f.title)}</strong><br><span class="m">${esc(f.detail)}</span><br><em>Action:</em> ${esc(f.action || '—')}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>MerakiScope report — ${esc(d.org.name || '')}</title>
      <style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#13202e;margin:32px;}
      h1{margin:0;} .sub{color:#666;margin:4px 0 18px;} .score{font-size:42px;font-weight:800;}
      table{width:100%;border-collapse:collapse;margin-top:12px;} td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;font-size:13px;}
      .m{color:#555;} .s{font-weight:700;white-space:nowrap;} .s.critical{color:#c0392b;} .s.warning{color:#b9770e;} .s.info{color:#2471a3;} .s.good{color:#1e8449;}
      .kpis{display:flex;gap:24px;margin:12px 0;} .kpi b{display:block;font-size:22px;}
      @media print{button{display:none;}}</style></head><body>
      <button onclick="window.print()" style="float:right;padding:8px 14px;">Print / Save PDF</button>
      <h1>MerakiScope health report</h1>
      <div class="sub">${esc(d.org.name || 'Organization')} · generated ${new Date().toLocaleString()}</div>
      <div class="score">${a.score}/100 — ${esc(a.grade)}</div>
      <div class="kpis">
        <div class="kpi"><b>${(d.networks || []).length}</b>networks</div>
        <div class="kpi"><b>${(d.deviceStatuses || []).filter((s) => s.status === 'online').length}/${(d.deviceStatuses || []).length}</b>devices online</div>
        <div class="kpi"><b>${a.counts.critical}</b>critical</div>
        <div class="kpi"><b>${a.counts.warning}</b>warnings</div>
      </div>
      <h2>Findings &amp; recommendations</h2>
      <table><tbody>${rows}</tbody></table>
      <p class="m" style="margin-top:24px;">Generated by MerakiScope. Independent tool, not affiliated with Cisco Meraki.</p>
      </body></html>`);
    w.document.close();
  }

  // ========================================================================
  // Router + events
  // ========================================================================
  const VIEWS = { overview: viewOverview, insights: viewInsights, clients: viewClients, apps: viewApps, networks: viewNetworks, pricing: viewPricing, help: viewHelp };

  function render(route) {
    MTK.state.route = route;
    const fn = VIEWS[route] || viewOverview;
    el('view').innerHTML = fn();
    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.toggle('active', t.dataset.route === route));
    el('view').scrollTop = 0;
    bindViewEvents();
  }

  function bindViewEvents() {
    document.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => MTK.go(b.dataset.nav));
    document.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { MTK.state.insightFilter = b.dataset.filter; render('insights'); });
    document.querySelectorAll('[data-filter-nav]').forEach((b) => b.onclick = () => { MTK.state.insightFilter = b.dataset.filterNav; MTK.go('insights'); });
    document.querySelectorAll('[data-csort]').forEach((b) => b.onclick = () => { MTK.state.clientSort = b.dataset.csort; render('clients'); });
    document.querySelectorAll('[data-upgrade]').forEach((b) => b.onclick = () => MTK.subscribe(b.dataset.upgrade));
    document.querySelectorAll('[data-client]').forEach((r) => { if (r.classList.contains('clickable')) r.onclick = () => openClientDetail(r.dataset.client); });
    document.querySelectorAll('.gloss-term').forEach((g) => {
      g.onclick = (e) => { e.stopPropagation(); showGloss(g, g.dataset.term); };
      g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showGloss(g, g.dataset.term); } };
    });
    const cs = el('client-search');
    if (cs) cs.oninput = MTK.debounce(() => { MTK.state.clientQuery = cs.value; render('clients'); const x = el('client-search'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 250);
  }

  function showGloss(anchor, key) {
    const g = GLOSSARY[key]; if (!g) return;
    let pop = el('gloss-pop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'gloss-pop'; document.body.appendChild(pop); }
    pop.innerHTML = `<strong>${esc(g[0])}</strong><p>${esc(g[1])}</p>`;
    pop.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + window.scrollY + 6;
    let left = r.left + window.scrollX;
    pop.style.top = top + 'px';
    pop.style.left = Math.min(left, window.scrollX + window.innerWidth - 280) + 'px';
    const close = (ev) => { if (ev.target !== anchor && !pop.contains(ev.target)) { pop.style.display = 'none'; document.removeEventListener('click', close); } };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  global.MTK = global.MTK || {};
  global.MTK.ui = { render, esc, closeModal, printReport, openModal };
})(window);
