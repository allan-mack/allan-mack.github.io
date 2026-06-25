/*
 * ui.js — rendering and view router for MerakiScope.
 * Pure DOM rendering; reads from MTK.state, writes into #view.
 */
(function (global) {
  'use strict';

  const fmtBytes = (n) => MTK.insights.fmtBytes(n);
  const timeAgo = (iso) => MTK.insights.timeAgo(iso);
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SEV_LABEL = { critical: 'Critical', warning: 'Warning', info: 'Heads-up', good: 'Healthy' };

  function netName(id) {
    const n = (MTK.state.data.networks || []).find((x) => x.id === id);
    return n ? n.name : (id || '—');
  }

  function statusDot(status) {
    const cls = status === 'online' ? 'ok' : status === 'alerting' ? 'warn' : 'bad';
    return `<span class="dot ${cls}" title="${esc(status)}"></span>`;
  }

  // ---- Views ---------------------------------------------------------------

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

    return `
      <section class="grid-hero">
        <div class="card score-card">
          <div class="score-ring ${scoreClass}"><span>${a.score}</span><small>/100</small></div>
          <div>
            <h2>${esc(a.grade)}</h2>
            <p class="muted">Overall network health for <strong>${esc(d.org.name || 'your organization')}</strong></p>
            <div class="pill-row">
              <span class="pill bad">${a.counts.critical} critical</span>
              <span class="pill warn">${a.counts.warning} warnings</span>
              <span class="pill info">${a.counts.info} heads-up</span>
              <span class="pill ok">${a.counts.good} healthy</span>
            </div>
          </div>
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
      </section>
    `;
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
    const list = a.findings.filter((f) => filter === 'all' || f.severity === filter);
    return `
      <section>
        <div class="card">
          <h2>Insights & recommendations</h2>
          <p class="muted">Plain-English findings about your organization, sorted by urgency. Each one explains what we found, why it matters, and what to do.</p>
          <div class="filter-row">
            ${['all', 'critical', 'warning', 'info', 'good'].map((k) => `<button class="chip ${filter === k ? 'active' : ''}" data-filter="${k}">${k === 'all' ? 'All' : SEV_LABEL[k]} ${k === 'all' ? '(' + a.findings.length + ')' : '(' + a.counts[k] + ')'}</button>`).join('')}
          </div>
        </div>
        ${list.map(findingCard).join('') || '<div class="card"><p class="muted">No findings in this category.</p></div>'}
      </section>`;
  }

  function findingCard(f) {
    return `
      <div class="card finding ${f.severity}">
        <div class="finding-head">
          <span class="sev ${f.severity}">${SEV_LABEL[f.severity]}</span>
          <span class="area-tag">${esc(f.area)}</span>
        </div>
        <h3>${esc(f.title)}</h3>
        <p>${esc(f.detail)}</p>
        ${f.impact ? `<p class="kv"><strong>Why it matters:</strong> ${esc(f.impact)}</p>` : ''}
        ${f.action ? `<p class="kv action"><strong>What to do:</strong> ${esc(f.action)}</p>` : ''}
        ${f.evidence && f.evidence.length ? `<details><summary>Evidence (${f.evidence.length})</summary><ul>${f.evidence.map((e) => '<li>' + esc(e) + '</li>').join('')}</ul></details>` : ''}
      </div>`;
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
    if (q) clients = clients.filter((c) => (c.description + ' ' + c.mac + ' ' + (c.manufacturer || '') + ' ' + (c.ssid || '')).toLowerCase().includes(q));
    clients = clients.slice(0, 120);

    return `
      <section>
        <div class="card">
          <h2>Client experience</h2>
          <p class="muted">Every device on the network, with the signals that predict how good their experience is: signal strength, latency, and usage.</p>
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
              ${clients.map((c) => `
                <tr>
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
          ${clients.length === 0 ? '<p class="muted">No clients match your search.</p>' : ''}
          <p class="muted small">Showing up to 120 clients. Refine with search to narrow down.</p>
        </div>
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
    return `
      <section>
        <div class="card">
          <h2>Application experience</h2>
          <p class="muted">How the apps your people use most are actually performing on the network.</p>
        </div>
        <div class="card table-wrap">
          <table class="data">
            <thead><tr><th>Application</th><th>Category</th><th>Users</th><th>Data (24h)</th><th>Latency</th><th>Loss</th><th>Experience</th></tr></thead>
            <tbody>
              ${apps.map((ap) => {
                const lat = ap.avgLatencyMs, loss = ap.lossPercent;
                const bad = (lat != null && lat >= 120) || (loss != null && loss >= 1.5);
                const meh = !bad && ((lat != null && lat >= 80) || (loss != null && loss >= 0.8));
                const exp = bad ? '<span class="badge bad">Poor</span>' : meh ? '<span class="badge warn">Fair</span>' : '<span class="badge ok">Good</span>';
                return `<tr>
                  <td><strong>${esc(ap.name)}</strong></td>
                  <td class="muted">${esc(ap.category || '—')}</td>
                  <td>${esc(ap.numClients || '—')}</td>
                  <td>${fmtBytes(ap.usageTotalBytes)}</td>
                  <td>${lat != null ? latencyCell(lat) : '<span class="muted">—</span>'}</td>
                  <td>${loss != null ? `<span class="badge ${loss < 1 ? 'ok' : loss < 2 ? 'warn' : 'bad'}">${loss}%</span>` : '<span class="muted">—</span>'}</td>
                  <td>${exp}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function viewNetworks() {
    const d = MTK.state.data;
    return `
      <section>
        <div class="card"><h2>Networks & devices</h2><p class="muted">Each site and the hardware running it.</p></div>
        ${(d.networks || []).map((n) => {
          const devs = (d.deviceStatuses || []).filter((s) => s.networkId === n.id);
          const ups = (d.uplinks || []).filter((u) => u.networkId === n.id);
          const ll = (d.uplinkLossLatency || []).filter((u) => u.networkId === n.id);
          const offline = devs.filter((s) => s.status === 'offline').length;
          return `
            <div class="card">
              <div class="net-head">
                <h3>${esc(n.name)} ${offline ? '<span class="badge bad">' + offline + ' offline</span>' : '<span class="badge ok">all online</span>'}</h3>
                <span class="muted small">${(n.productTypes || []).join(' · ')}</span>
              </div>
              ${ll.length ? `<div class="uplink-strip">${ll.map((u) => `<span class="uplink-chip ${(u.avgLossPercent >= 1 || u.avgLatencyMs >= 100) ? 'bad' : 'ok'}">${esc(u.uplink)}: ${u.avgLatencyMs} ms / ${u.avgLossPercent}% loss</span>`).join('')}</div>` : ''}
              <table class="data compact">
                <thead><tr><th>Device</th><th>Model</th><th>Type</th><th>Status</th><th>Last seen</th></tr></thead>
                <tbody>
                  ${devs.map((s) => `<tr>
                    <td>${esc(s.name || s.serial)}</td>
                    <td class="muted">${esc(s.model || '')}</td>
                    <td>${esc(s.productType || '')}</td>
                    <td>${statusDot(s.status)} ${esc(s.status)}</td>
                    <td class="muted small">${timeAgo(s.lastReportedAt)}</td>
                  </tr>`).join('') || '<tr><td colspan="5" class="muted">No devices reported.</td></tr>'}
                </tbody>
              </table>
            </div>`;
        }).join('')}
      </section>`;
  }

  const VIEWS = { overview: viewOverview, insights: viewInsights, clients: viewClients, apps: viewApps, networks: viewNetworks };

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
    document.querySelectorAll('[data-csort]').forEach((b) => b.onclick = () => { MTK.state.clientSort = b.dataset.csort; render('clients'); });
    const cs = el('client-search');
    if (cs) {
      cs.oninput = MTK.debounce(() => { MTK.state.clientQuery = cs.value; render('clients'); const x = el('client-search'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 250);
    }
  }

  global.MTK = global.MTK || {};
  global.MTK.ui = { render, esc };
})(window);
