/*
 * mock.js — Demo data generator for MerakiScope.
 *
 * Produces a fully-populated, normalized data model identical in shape to what
 * api.js returns from the live Meraki Dashboard API. The numbers are seeded so
 * the same demo always looks the same, and they are deliberately tuned to
 * surface a realistic *mix* of healthy and unhealthy findings so the Insights
 * engine has something meaningful to say.
 */
(function (global) {
  'use strict';

  // Tiny seeded PRNG (mulberry32) so demo data is stable between reloads.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
  function between(rand, lo, hi) { return lo + rand() * (hi - lo); }
  function round(n, d) { const f = Math.pow(10, d || 0); return Math.round(n * f) / f; }
  // A gently wandering series around `base`, optionally rising toward the end.
  function series(rand, base, jitter, n, trend) {
    const out = []; let v = base;
    for (let i = 0; i < n; i++) {
      v += between(rand, -jitter, jitter) + (trend || 0);
      out.push(round(Math.max(0, v), 1));
    }
    return out;
  }

  const MANUFACTURERS = ['Apple', 'Dell', 'Samsung', 'HP', 'Lenovo', 'Intel', 'Google', 'Microsoft', 'Cisco', 'Sonos'];
  const OS = ['macOS', 'Windows 11', 'iOS 17', 'Android 14', 'Windows 10', 'iPadOS 17', 'ChromeOS'];
  const SSIDS = ['Corp-WiFi', 'Guest', 'IoT-Devices'];
  const APP_CATALOG = [
    { name: 'Microsoft 365', category: 'Productivity', baseLat: 35, baseLoss: 0.2 },
    { name: 'Zoom', category: 'Video conferencing', baseLat: 60, baseLoss: 0.6 },
    { name: 'Salesforce', category: 'Business', baseLat: 80, baseLoss: 0.4 },
    { name: 'YouTube', category: 'Video & music', baseLat: 45, baseLoss: 0.3 },
    { name: 'Windows Update', category: 'Software updates', baseLat: 70, baseLoss: 0.5 },
    { name: 'Slack', category: 'Collaboration', baseLat: 40, baseLoss: 0.2 },
    { name: 'Google Drive', category: 'Cloud storage', baseLat: 55, baseLoss: 0.3 },
    { name: 'Spotify', category: 'Video & music', baseLat: 50, baseLoss: 0.4 },
  ];

  function isoMinutesAgo(min) { return new Date(Date.now() - min * 60000).toISOString(); }

  function build() {
    const rand = rng(20240615);
    // Separate stream for trend/sparkline data so adding charts never perturbs
    // the primary demo (keeps the health score & findings stable).
    const srand = rng(77003311);

    const org = {
      id: '549236',
      name: 'Northwind Trading Co.',
      url: 'https://dashboard.meraki.com/o/demo/manage/organization/overview',
    };

    // ---- Networks ----------------------------------------------------------
    const networkDefs = [
      { name: 'HQ — Seattle', types: ['appliance', 'switch', 'wireless'] },
      { name: 'Branch — Portland', types: ['appliance', 'switch', 'wireless'] },
      { name: 'Branch — Boise', types: ['appliance', 'wireless'] },
      { name: 'Warehouse — Tacoma', types: ['appliance', 'switch'] },
    ];
    const networks = networkDefs.map((n, i) => ({
      id: 'N_' + (100 + i),
      name: n.name,
      productTypes: n.types,
      timeZone: 'America/Los_Angeles',
    }));

    // ---- Devices -----------------------------------------------------------
    const devices = [];
    const deviceStatuses = [];
    const uplinks = [];
    const uplinkLossLatency = [];
    const channelUtilization = [];

    let apCount = 0;
    networks.forEach((net, ni) => {
      const apsPerNet = net.productTypes.includes('wireless') ? (ni === 0 ? 6 : 3) : 0;
      const switchesPerNet = net.productTypes.includes('switch') ? (ni === 0 ? 3 : 1) : 0;
      const mxPerNet = 1;

      // Security appliance (MX)
      for (let i = 0; i < mxPerNet; i++) {
        const serial = `Q2MX-${ni}${i}-${1000 + ni}`;
        // Boise branch appliance is offline in the demo to drive an insight.
        const offline = ni === 2;
        devices.push({ serial, name: `${net.name} MX67`, model: 'MX67', networkId: net.id, productType: 'appliance', lanIp: `10.${ni}.0.1` });
        deviceStatuses.push({ serial, name: `${net.name} MX67`, model: 'MX67', networkId: net.id, productType: 'appliance', status: offline ? 'offline' : 'online', lastReportedAt: offline ? isoMinutesAgo(47) : isoMinutesAgo(1), publicIp: `203.0.113.${10 + ni}` });

        const wan1Loss = ni === 1 ? between(rand, 2.5, 5.5) : between(rand, 0, 0.6);
        const wan1Lat = ni === 1 ? between(rand, 120, 240) : between(rand, 8, 35);
        uplinks.push({ serial, networkId: net.id, interface: 'wan1', status: offline ? 'failed' : 'active', ip: `203.0.113.${10 + ni}`, provider: pick(rand, ['Comcast', 'CenturyLink', 'AT&T']) });
        uplinks.push({ serial, networkId: net.id, interface: 'wan2', status: ni === 1 ? 'ready' : (offline ? 'failed' : 'ready'), ip: `198.51.100.${10 + ni}`, provider: pick(rand, ['Verizon LTE', 'T-Mobile']) });
        uplinkLossLatency.push({
          serial, networkId: net.id, uplink: 'wan1',
          avgLossPercent: round(wan1Loss, 2), avgLatencyMs: round(wan1Lat, 1),
          latencySeries: series(srand, wan1Lat, ni === 1 ? 28 : 6, 24, ni === 1 ? 3 : 0),
          lossSeries: series(srand, wan1Loss, ni === 1 ? 0.8 : 0.15, 24, ni === 1 ? 0.12 : 0),
        });
      }

      // Switches (MS)
      for (let i = 0; i < switchesPerNet; i++) {
        const serial = `Q2SW-${ni}${i}-${2000 + ni}`;
        devices.push({ serial, name: `${net.name} SW${i + 1}`, model: 'MS225-48', networkId: net.id, productType: 'switch', lanIp: `10.${ni}.0.${10 + i}` });
        deviceStatuses.push({ serial, name: `${net.name} SW${i + 1}`, model: 'MS225-48', networkId: net.id, productType: 'switch', status: 'online', lastReportedAt: isoMinutesAgo(1) });
      }

      // Access points (MR)
      for (let i = 0; i < apsPerNet; i++) {
        apCount++;
        const serial = `Q2AP-${ni}${i}-${3000 + apCount}`;
        // One AP at HQ is congested; one at Portland is offline.
        const offline = ni === 1 && i === 2;
        const congested = ni === 0 && i === 4;
        devices.push({ serial, name: `${net.name} AP${i + 1}`, model: 'MR46', networkId: net.id, productType: 'wireless', lanIp: `10.${ni}.0.${30 + i}` });
        deviceStatuses.push({ serial, name: `${net.name} AP${i + 1}`, model: 'MR46', networkId: net.id, productType: 'wireless', status: offline ? 'offline' : 'online', lastReportedAt: offline ? isoMinutesAgo(63) : isoMinutesAgo(1) });

        const util24 = congested ? between(rand, 62, 78) : between(rand, 8, 30);
        const util5 = congested ? between(rand, 55, 70) : between(rand, 5, 25);
        channelUtilization.push({ serial, name: `${net.name} AP${i + 1}`, networkId: net.id, band: '2.4', utilizationTotal: round(util24, 0) });
        channelUtilization.push({ serial, name: `${net.name} AP${i + 1}`, networkId: net.id, band: '5', utilizationTotal: round(util5, 0) });
      }
    });

    // ---- Clients -----------------------------------------------------------
    const clients = [];
    const totalClients = 180;
    for (let i = 0; i < totalClients; i++) {
      const net = pick(rand, networks);
      const wireless = net.productTypes.includes('wireless') ? rand() > 0.25 : false;
      const ssid = wireless ? pick(rand, SSIDS) : null;
      // Signal: most clients are fine, a tail is weak.
      const weak = rand() < 0.16;
      const rssi = wireless ? (weak ? Math.round(between(rand, -85, -73)) : Math.round(between(rand, -67, -48))) : null;
      const snr = rssi == null ? null : Math.max(5, rssi + 95 + Math.round(between(rand, -3, 6)));
      const sent = Math.round(between(rand, 5, 4200)) * 1e6;
      const recv = Math.round(between(rand, 10, 9000)) * 1e6;
      const latency = wireless ? round(between(rand, 6, weak ? 160 : 45), 0) : round(between(rand, 2, 20), 0);
      const failedConn = rand() < 0.08;
      clients.push({
        id: 'k_' + i,
        description: `${pick(rand, ['Laptop', 'Phone', 'Tablet', 'Desktop', 'Printer', 'VoIP'])}-${1000 + i}`,
        mac: `aa:bb:cc:${(i & 255).toString(16).padStart(2, '0')}:${((i * 7) & 255).toString(16).padStart(2, '0')}:11`,
        ip: `10.${networks.indexOf(net)}.${20 + (i % 200)}.${i % 254}`,
        networkId: net.id,
        status: rand() > 0.18 ? 'Online' : 'Offline',
        manufacturer: pick(rand, MANUFACTURERS),
        os: pick(rand, OS),
        ssid,
        vlan: wireless ? pick(rand, [10, 20, 30]) : pick(rand, [1, 100]),
        connectionType: wireless ? 'wireless' : 'wired',
        rssi, snr,
        usageSentBytes: sent,
        usageRecvBytes: recv,
        usageTotalBytes: sent + recv,
        avgLatencyMs: latency,
        failedConnection: failedConn,
        lastSeen: isoMinutesAgo(Math.round(between(rand, 0, 240))),
      });
    }

    // ---- Wireless connection stats (per network) ---------------------------
    const wirelessHealth = networks
      .filter((n) => n.productTypes.includes('wireless'))
      .map((n, idx) => {
        // Portland (idx 1) has elevated auth/DHCP failures in the demo.
        const trouble = idx === 1;
        const assoc = Math.round(between(rand, 200, 600));
        const auth = Math.round(between(rand, trouble ? 40 : 2, trouble ? 90 : 12));
        const dhcp = Math.round(between(rand, trouble ? 30 : 1, trouble ? 70 : 8));
        const dns = Math.round(between(rand, 1, 10));
        const success = Math.round(between(rand, 4000, 9000));
        const failures = assoc + auth + dhcp + dns;
        return {
          networkId: n.id, networkName: n.name,
          assoc, auth, dhcp, dns, success,
          failureRatePct: round((failures / (failures + success)) * 100, 1),
        };
      });

    // ---- Applications ------------------------------------------------------
    const applications = APP_CATALOG.map((a, i) => {
      const stressed = a.name === 'Zoom' || a.name === 'Salesforce';
      return {
        name: a.name,
        category: a.category,
        usageTotalBytes: Math.round(between(rand, 2, 280)) * 1e9,
        numClients: Math.round(between(rand, 20, 160)),
        avgLatencyMs: round(a.baseLat + (stressed ? between(rand, 70, 140) : between(rand, -5, 25)), 0),
        lossPercent: round(a.baseLoss + (stressed ? between(rand, 1.5, 4) : between(rand, 0, 0.5)), 2),
        recvBytes: Math.round(between(rand, 1, 200)) * 1e9,
      };
    }).sort((a, b) => b.usageTotalBytes - a.usageTotalBytes);

    // ---- Alerts ------------------------------------------------------------
    const alerts = [
      { type: 'Appliance went down', severity: 'critical', networkId: networks[2].id, networkName: networks[2].name, occurredAt: isoMinutesAgo(47), message: 'MX67 stopped reporting to the Meraki cloud.' },
      { type: 'AP went down', severity: 'critical', networkId: networks[1].id, networkName: networks[1].name, occurredAt: isoMinutesAgo(63), message: 'Access point AP3 is offline.' },
      { type: 'High packet loss on uplink', severity: 'warning', networkId: networks[1].id, networkName: networks[1].name, occurredAt: isoMinutesAgo(22), message: 'WAN1 packet loss exceeded 2% for 15 minutes.' },
      { type: 'High channel utilization', severity: 'warning', networkId: networks[0].id, networkName: networks[0].name, occurredAt: isoMinutesAgo(14), message: 'AP5 2.4 GHz channel utilization above 60%.' },
      { type: 'License expiring soon', severity: 'warning', networkId: null, networkName: 'Organization', occurredAt: isoMinutesAgo(600), message: 'Co-termination license expires in 38 days.' },
      { type: 'Configuration change', severity: 'info', networkId: networks[0].id, networkName: networks[0].name, occurredAt: isoMinutesAgo(120), message: 'Firewall rule added by admin@northwind.example.' },
    ];

    // ---- Licensing ---------------------------------------------------------
    const licenses = {
      status: 'OK',
      licensedDeviceCounts: { MX: 4, MS: 6, MR: 12 },
      expirationDate: new Date(Date.now() + 38 * 86400000).toISOString(),
      daysToExpiration: 38,
    };

    // ---- Trends (for sparklines / history) ---------------------------------
    const trends = {
      healthHistory: series(srand, 42, 5, 14, -1.2).map((v) => Math.max(0, Math.min(100, Math.round(v)))),
      usageHistoryBytes: series(srand, 40, 18, 24, 0).map((v) => Math.round(v * 1e9)),
      clientsOnlineHistory: series(srand, 150, 22, 24, 0).map((v) => Math.round(v)),
    };

    return {
      generatedAt: new Date().toISOString(),
      demo: true,
      org,
      trends,
      networks,
      devices,
      deviceStatuses,
      uplinks,
      uplinkLossLatency,
      channelUtilization,
      clients,
      wirelessHealth,
      applications,
      alerts,
      licenses,
    };
  }

  global.MTK = global.MTK || {};
  global.MTK.mock = { build };
})(window);
