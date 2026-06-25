/*
 * api.js — Meraki Dashboard API v1 client for MerakiScope.
 *
 * Returns the SAME normalized data model that mock.js produces, so the rest of
 * the app (insights + UI) never has to know whether it is looking at demo data
 * or a live organization.
 *
 * IMPORTANT — browsers & CORS:
 *   The Meraki Dashboard API does not return permissive CORS headers, so a
 *   browser cannot call api.meraki.com directly from another origin. To use
 *   Live mode you must point the app at a CORS-friendly relay (your own small
 *   proxy, a Cloudflare Worker, etc.). The proxy URL is configured on the
 *   Connect screen. Demo mode needs no network access at all.
 */
(function (global) {
  'use strict';

  const DEFAULT_BASE = 'https://api.meraki.com/api/v1';

  function buildUrl(cfg, path) {
    const base = (cfg.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    const target = base + path;
    if (cfg.proxyUrl) {
      // Proxy convention: PROXY?url=<encoded target>. Adjust to match yours.
      return cfg.proxyUrl + (cfg.proxyUrl.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(target);
    }
    return target;
  }

  async function req(cfg, path) {
    const res = await fetch(buildUrl(cfg, path), {
      headers: {
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('Authentication failed (HTTP ' + res.status + '). Check your API key and its permissions.');
    }
    if (res.status === 404) return null; // endpoint not applicable for this org
    if (!res.ok) throw new Error('Meraki API error on ' + path + ': HTTP ' + res.status);
    return res.json();
  }

  // Best-effort: swallow errors on optional endpoints so one missing feature
  // never blanks the whole dashboard.
  async function tryReq(cfg, path) {
    try { return await req(cfg, path); } catch (e) { console.warn('[MerakiScope] optional fetch failed:', path, e.message); return null; }
  }

  async function listOrganizations(cfg) {
    const orgs = await req(cfg, '/organizations');
    return (orgs || []).map((o) => ({ id: o.id, name: o.name, url: o.url }));
  }

  async function load(cfg, orgId) {
    const org = { id: orgId };
    const orgs = await tryReq(cfg, '/organizations');
    const found = (orgs || []).find((o) => String(o.id) === String(orgId));
    if (found) { org.name = found.name; org.url = found.url; }

    const [networks, devices, statuses, uplinks, lossLat, chanUtil, appsByUsage, licenses] = await Promise.all([
      tryReq(cfg, `/organizations/${orgId}/networks`),
      tryReq(cfg, `/organizations/${orgId}/devices`),
      tryReq(cfg, `/organizations/${orgId}/devices/statuses`),
      tryReq(cfg, `/organizations/${orgId}/uplinks/statuses`),
      tryReq(cfg, `/organizations/${orgId}/devices/uplinksLossAndLatency?timespan=300`),
      tryReq(cfg, `/organizations/${orgId}/wireless/devices/channelUtilization/byDevice?timespan=600`),
      tryReq(cfg, `/organizations/${orgId}/summary/top/applications/byUsage?timespan=86400`),
      tryReq(cfg, `/organizations/${orgId}/licenses/overview`),
    ]);

    const netList = (networks || []).map((n) => ({
      id: n.id, name: n.name, productTypes: n.productTypes || [], timeZone: n.timeZone, url: n.url,
    }));
    const nameById = {};
    netList.forEach((n) => { nameById[n.id] = n.name; });

    const deviceList = (devices || []).map((d) => ({
      serial: d.serial, name: d.name || d.mac, model: d.model,
      networkId: d.networkId, productType: d.productType, lanIp: d.lanIp,
    }));

    const statusList = (statuses || []).map((s) => ({
      serial: s.serial, name: s.name, model: s.model, networkId: s.networkId,
      productType: s.productType, status: s.status, lastReportedAt: s.lastReportedAt,
      firmware: s.firmware, lanIp: s.lanIp, publicIp: s.publicIp, url: s.url,
    }));

    const uplinkList = [];
    (uplinks || []).forEach((u) => {
      (u.uplinks || []).forEach((up) => {
        uplinkList.push({
          serial: u.serial, networkId: u.networkId, interface: up.interface,
          status: up.status, ip: up.ip, provider: up.provider,
        });
      });
    });

    const lossLatList = (lossLat || []).map((l) => {
      const ts = l.timeSeries || [];
      const valid = ts.filter((p) => p.lossPercent != null);
      const avgLoss = valid.length ? valid.reduce((a, p) => a + p.lossPercent, 0) / valid.length : null;
      const avgLat = valid.length ? valid.reduce((a, p) => a + (p.latencyMs || 0), 0) / valid.length : null;
      return {
        serial: l.serial, networkId: l.networkId, uplink: l.uplink,
        avgLossPercent: avgLoss == null ? null : Math.round(avgLoss * 100) / 100,
        avgLatencyMs: avgLat == null ? null : Math.round(avgLat * 10) / 10,
      };
    });

    const chanList = [];
    (chanUtil || []).forEach((d) => {
      (d.byBand || []).forEach((b) => {
        chanList.push({
          serial: d.serial, name: d.mac, networkId: d.network && d.network.id,
          band: b.band, utilizationTotal: b.utilization && b.utilization.total,
        });
      });
    });

    // Clients: org-wide listing is paginated/limited; gather per network (cap to
    // keep the request count sane for large orgs).
    const clients = [];
    const netCap = netList.slice(0, 12);
    await Promise.all(netCap.map(async (n) => {
      const rows = await tryReq(cfg, `/networks/${n.id}/clients?perPage=200&timespan=86400`);
      (rows || []).forEach((c) => {
        const sent = (c.usage && c.usage.sent ? c.usage.sent : 0) * 1000; // KB→bytes approx
        const recv = (c.usage && c.usage.recv ? c.usage.recv : 0) * 1000;
        clients.push({
          id: c.id, description: c.description || c.dhcpHostname || c.mac, mac: c.mac, ip: c.ip,
          networkId: n.id, status: c.status, manufacturer: c.manufacturer, os: c.os,
          ssid: c.ssid, vlan: c.vlan,
          connectionType: c.ssid ? 'wireless' : 'wired',
          rssi: null, snr: null,
          usageSentBytes: sent, usageRecvBytes: recv, usageTotalBytes: sent + recv,
          avgLatencyMs: null, failedConnection: false, lastSeen: c.lastSeen,
        });
      });
    }));

    // Wireless connection stats per wireless network.
    const wirelessHealth = [];
    await Promise.all(netList.filter((n) => (n.productTypes || []).includes('wireless')).map(async (n) => {
      const s = await tryReq(cfg, `/networks/${n.id}/wireless/connectionStats?timespan=7200`);
      if (s) {
        const assoc = s.assoc || 0, auth = s.auth || 0, dhcp = s.dhcp || 0, dns = s.dns || 0, success = s.success || 0;
        const failures = assoc + auth + dhcp + dns;
        wirelessHealth.push({
          networkId: n.id, networkName: n.name, assoc, auth, dhcp, dns, success,
          failureRatePct: success + failures ? Math.round((failures / (failures + success)) * 1000) / 10 : 0,
        });
      }
    }));

    const applications = (appsByUsage || []).map((a) => ({
      name: a.name, category: a.category,
      usageTotalBytes: Math.round(((a.total || 0)) * 1e6),
      recvBytes: Math.round(((a.downstream || 0)) * 1e6),
      numClients: a.numClients || 0,
      avgLatencyMs: null, lossPercent: null,
    })).sort((a, b) => b.usageTotalBytes - a.usageTotalBytes);

    let lic = { status: 'unknown' };
    if (licenses) {
      lic = {
        status: licenses.status,
        licensedDeviceCounts: licenses.licensedDeviceCounts,
        expirationDate: licenses.expirationDate,
        daysToExpiration: licenses.expirationDate ? Math.round((new Date(licenses.expirationDate) - Date.now()) / 86400000) : null,
      };
    }

    const alerts = await tryReq(cfg, `/organizations/${orgId}/assurance/alerts?perPage=50`);
    const alertList = (alerts || []).map((a) => ({
      type: a.type, severity: a.severity, networkId: a.network && a.network.id,
      networkName: (a.network && a.network.name) || 'Organization',
      occurredAt: a.startedAt || a.occurredAt, message: a.title || a.type,
    }));

    return {
      generatedAt: new Date().toISOString(),
      demo: false,
      org,
      networks: netList,
      devices: deviceList,
      deviceStatuses: statusList,
      uplinks: uplinkList,
      uplinkLossLatency: lossLatList,
      channelUtilization: chanList,
      clients,
      wirelessHealth,
      applications,
      alerts: alertList,
      licenses: lic,
    };
  }

  global.MTK = global.MTK || {};
  global.MTK.api = { listOrganizations, load, DEFAULT_BASE };
})(window);
