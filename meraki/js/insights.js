/*
 * insights.js — the analysis brain of MerakiScope.
 *
 * Takes the normalized data model (from mock.js or api.js) and runs a series of
 * rules over it. Each rule returns zero or more "findings". A finding is written
 * for an amateur technology manager: it says, in plain English, what was found,
 * why it matters, and what to do about it.
 *
 * Severity scale: 'good' | 'info' | 'warning' | 'critical'
 */
(function (global) {
  'use strict';

  function fmtBytes(n) {
    if (n == null) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0; let v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + ' ' + u[i];
  }

  function finding(o) {
    return Object.assign({
      severity: 'info', area: 'General', title: '', detail: '', impact: '', action: '', evidence: [],
    }, o);
  }

  // ---- Rules ---------------------------------------------------------------

  function ruleDeviceAvailability(d) {
    const out = [];
    const statuses = d.deviceStatuses || [];
    const offline = statuses.filter((s) => s.status === 'offline');
    const alerting = statuses.filter((s) => s.status === 'alerting');
    const total = statuses.length || 1;

    if (offline.length === 0 && alerting.length === 0) {
      out.push(finding({
        severity: 'good', area: 'Device health',
        title: 'All hardware is online',
        detail: `Every one of your ${total} Meraki device${total === 1 ? '' : 's'} is reporting in to the cloud.`,
        impact: 'A fully online fleet means no site is running blind or relying on a backup path.',
        action: 'No action needed. Keep an eye on the dashboard for new alerts.',
      }));
    } else {
      if (offline.length) {
        out.push(finding({
          severity: 'critical', area: 'Device health',
          title: `${offline.length} device${offline.length === 1 ? ' is' : 's are'} offline`,
          detail: `These devices have stopped reporting to Meraki and are likely down or disconnected.`,
          impact: 'Users behind an offline switch or access point lose connectivity; an offline appliance can take a whole site offline.',
          action: 'Check power and the upstream link for each device. If it has a cellular/secondary uplink, confirm traffic failed over. Visit the site if it stays down.',
          evidence: offline.map((s) => `${s.name || s.serial} (${s.model || '?'}) — last seen ${timeAgo(s.lastReportedAt)}`),
        }));
      }
      if (alerting.length) {
        out.push(finding({
          severity: 'warning', area: 'Device health',
          title: `${alerting.length} device${alerting.length === 1 ? ' is' : 's are'} in an alerting state`,
          detail: 'These devices are online but reporting a problem (for example a bad port, PoE issue, or failed uplink).',
          impact: 'Performance may be degraded even though the device still appears connected.',
          action: 'Open each device in the Meraki dashboard and review its alert details.',
          evidence: alerting.map((s) => `${s.name || s.serial} (${s.model || '?'})`),
        }));
      }
    }
    return out;
  }

  function ruleUplinkLossLatency(d) {
    const out = [];
    const rows = d.uplinkLossLatency || [];
    const netName = byId(d.networks, 'id', 'name');

    const bad = rows.filter((r) => (r.avgLossPercent != null && r.avgLossPercent >= 1) || (r.avgLatencyMs != null && r.avgLatencyMs >= 100));
    const great = rows.filter((r) => (r.avgLossPercent != null && r.avgLossPercent < 1) && (r.avgLatencyMs != null && r.avgLatencyMs < 60));

    bad.forEach((r) => {
      const reasons = [];
      if (r.avgLossPercent >= 1) reasons.push(`${r.avgLossPercent}% packet loss`);
      if (r.avgLatencyMs >= 100) reasons.push(`${r.avgLatencyMs} ms latency`);
      out.push(finding({
        severity: r.avgLossPercent >= 3 || r.avgLatencyMs >= 150 ? 'critical' : 'warning',
        area: 'Internet uplink',
        title: `${netName(r.networkId) || 'A site'} has an unhealthy internet connection (${r.uplink})`,
        detail: `The link to the internet is showing ${reasons.join(' and ')}.`,
        impact: 'Packet loss and high latency cause choppy video calls, laggy cloud apps, and dropped VoIP — the problems users complain about most.',
        action: 'Run a cable/modem check, reboot the ISP modem, and open a ticket with the internet provider citing the loss/latency figures. If a secondary uplink exists, consider failing critical traffic over to it.',
        evidence: [`${r.uplink}: loss ${r.avgLossPercent}%, latency ${r.avgLatencyMs} ms (5-min average)`],
      }));
    });

    if (great.length && !bad.length) {
      out.push(finding({
        severity: 'good', area: 'Internet uplink',
        title: 'Internet connections are healthy',
        detail: `All measured uplinks show low packet loss and low latency.`,
        impact: 'Low loss and latency are the foundation of good call quality and snappy cloud apps.',
        action: 'No action needed.',
      }));
    }
    return out;
  }

  function ruleUplinkStatus(d) {
    const out = [];
    const failed = (d.uplinks || []).filter((u) => u.status === 'failed');
    if (failed.length) {
      out.push(finding({
        severity: 'warning', area: 'Internet uplink',
        title: `${failed.length} WAN link${failed.length === 1 ? ' is' : 's are'} down`,
        detail: 'One or more internet uplinks are in a failed state.',
        impact: 'If a site is running on a single remaining link, there is no backup left — the next failure takes the site offline.',
        action: 'Confirm whether the site has already failed over to a backup link, then restore the failed link (ISP, modem, or cabling).',
        evidence: failed.map((u) => `${u.serial} ${u.interface} (${u.provider || 'unknown ISP'})`),
      }));
    }
    return out;
  }

  function ruleChannelUtilization(d) {
    const out = [];
    const rows = d.channelUtilization || [];
    const hot = rows.filter((r) => r.utilizationTotal != null && r.utilizationTotal >= 50);
    if (hot.length) {
      out.push(finding({
        severity: hot.some((r) => r.utilizationTotal >= 70) ? 'critical' : 'warning',
        area: 'Wi-Fi airtime',
        title: `${hot.length} radio${hot.length === 1 ? ' is' : 's are'} congested`,
        detail: 'These access-point radios are busy more than half the time. Wi-Fi is a shared medium — when the airtime fills up, everyone nearby slows down.',
        impact: 'Users in these areas see slow Wi-Fi, buffering, and dropped calls even when the internet itself is fine.',
        action: 'Reduce 2.4 GHz usage (it is the most crowded band), enable band steering, add an access point in busy areas, or check for non-Meraki interference. Move high-bandwidth clients to 5/6 GHz.',
        evidence: hot.map((r) => `${r.name || r.serial} — ${r.band} GHz at ${r.utilizationTotal}% airtime`),
      }));
    } else if (rows.length) {
      out.push(finding({
        severity: 'good', area: 'Wi-Fi airtime',
        title: 'Wi-Fi airwaves have plenty of headroom',
        detail: 'No access-point radio is heavily congested.',
        impact: 'Clear airtime means the Wi-Fi can absorb busy periods without slowing down.',
        action: 'No action needed.',
      }));
    }
    return out;
  }

  function ruleWirelessConnection(d) {
    const out = [];
    (d.wirelessHealth || []).forEach((w) => {
      const failures = (w.auth || 0) + (w.dhcp || 0) + (w.assoc || 0) + (w.dns || 0);
      const rate = w.failureRatePct;
      if (rate != null && rate >= 8) {
        const culprits = [];
        if (w.auth >= 10) culprits.push('authentication (password / RADIUS)');
        if (w.dhcp >= 10) culprits.push('DHCP (handing out IP addresses)');
        if (w.assoc >= 10) culprits.push('association (signal / capacity)');
        if (w.dns >= 10) culprits.push('DNS lookups');
        out.push(finding({
          severity: rate >= 15 ? 'critical' : 'warning',
          area: 'Client experience',
          title: `${w.networkName}: ${rate}% of Wi-Fi connection attempts are failing`,
          detail: `Out of every 100 join attempts, about ${Math.round(rate)} do not complete${culprits.length ? '. The main stage failing is ' + culprits.join(', ') + '.' : '.'}`,
          impact: 'Users experience "it won\'t connect" or "it keeps asking for the password" — one of the most common help-desk complaints.',
          action: culprits.length
            ? 'Focus on the failing stage above: verify the Wi-Fi password/RADIUS server for auth, check the DHCP scope is not exhausted for DHCP, and add coverage for association problems.'
            : 'Review the network\'s wireless health page in Meraki to pinpoint which stage fails.',
          evidence: [`Successful: ${w.success}, failed: ${failures} (assoc ${w.assoc}, auth ${w.auth}, DHCP ${w.dhcp}, DNS ${w.dns})`],
        }));
      } else if (rate != null) {
        out.push(finding({
          severity: 'good', area: 'Client experience',
          title: `${w.networkName}: Wi-Fi connections are succeeding`,
          detail: `Only about ${rate}% of join attempts fail, which is within a healthy range.`,
          impact: 'Reliable joins mean fewer "I can\'t get on the Wi-Fi" tickets.',
          action: 'No action needed.',
        }));
      }
    });
    return out;
  }

  function ruleWeakSignalClients(d) {
    const out = [];
    const wireless = (d.clients || []).filter((c) => c.connectionType === 'wireless' && c.rssi != null);
    if (!wireless.length) return out;
    const weak = wireless.filter((c) => c.rssi <= -72);
    const pct = Math.round((weak.length / wireless.length) * 100);
    if (pct >= 12) {
      out.push(finding({
        severity: pct >= 25 ? 'warning' : 'info',
        area: 'Client experience',
        title: `${pct}% of Wi-Fi clients have a weak signal`,
        detail: `${weak.length} of ${wireless.length} wireless clients are connected at -72 dBm or worse. At that signal level devices drop to slower speeds and retransmit a lot.`,
        impact: 'Weak-signal clients feel slow even on a fast network, and they drag down airtime for everyone else on the same access point.',
        action: 'Look at where these clients are. You likely have coverage gaps — add or reposition an access point, or reduce obstructions. Encourage 5/6 GHz where signal allows.',
        evidence: weak.slice(0, 6).map((c) => `${c.description} on ${c.ssid || 'Wi-Fi'} — ${c.rssi} dBm`),
      }));
    } else {
      out.push(finding({
        severity: 'good', area: 'Client experience',
        title: 'Wi-Fi signal strength looks healthy',
        detail: `Only ${pct}% of wireless clients have a weak signal.`,
        impact: 'Strong signal keeps devices on fast data rates and off the air quickly.',
        action: 'No action needed.',
      }));
    }
    return out;
  }

  function ruleHighLatencyClients(d) {
    const out = [];
    const measured = (d.clients || []).filter((c) => c.avgLatencyMs != null);
    if (!measured.length) return out;
    const laggy = measured.filter((c) => c.avgLatencyMs >= 100);
    if (laggy.length >= Math.max(3, measured.length * 0.05)) {
      out.push(finding({
        severity: 'warning', area: 'Client experience',
        title: `${laggy.length} clients are seeing high latency`,
        detail: 'These devices have round-trip times of 100 ms or more to the network.',
        impact: 'High latency makes everything feel sluggish — typing in cloud apps, voice calls, and screen sharing all suffer.',
        action: 'Cross-check whether these clients share an access point (Wi-Fi problem) or a site (uplink problem). The Insights here usually point to the common cause.',
        evidence: laggy.slice(0, 6).map((c) => `${c.description} — ${c.avgLatencyMs} ms`),
      }));
    }
    return out;
  }

  function ruleFailedConnections(d) {
    const out = [];
    const fails = (d.clients || []).filter((c) => c.failedConnection);
    const total = (d.clients || []).length || 1;
    const pct = Math.round((fails.length / total) * 100);
    if (fails.length && pct >= 5) {
      out.push(finding({
        severity: 'warning', area: 'Client experience',
        title: `${pct}% of clients hit a failed connection recently`,
        detail: `${fails.length} clients recorded at least one failed connection attempt.`,
        impact: 'Repeated failures are what users describe as "it keeps dropping" or "I have to reconnect all the time."',
        action: 'Group these clients by access point and SSID. A cluster on one AP points to that radio; a spread across one SSID points to its settings (auth/DHCP).',
        evidence: fails.slice(0, 6).map((c) => `${c.description} (${c.manufacturer || '?'})`),
      }));
    }
    return out;
  }

  function ruleApplicationExperience(d) {
    const out = [];
    const apps = (d.applications || []).filter((a) => a.avgLatencyMs != null || a.lossPercent != null);
    const stressed = apps.filter((a) => (a.avgLatencyMs != null && a.avgLatencyMs >= 120) || (a.lossPercent != null && a.lossPercent >= 1.5));
    stressed.forEach((a) => {
      const reasons = [];
      if (a.avgLatencyMs != null && a.avgLatencyMs >= 120) reasons.push(`${a.avgLatencyMs} ms latency`);
      if (a.lossPercent != null && a.lossPercent >= 1.5) reasons.push(`${a.lossPercent}% loss`);
      out.push(finding({
        severity: a.lossPercent >= 3 ? 'critical' : 'warning',
        area: 'Application experience',
        title: `${a.name} is performing poorly`,
        detail: `This ${a.category || 'application'} is showing ${reasons.join(' and ')} for the ~${a.numClients || 'several'} people using it.`,
        impact: a.category && /video|conferenc/i.test(a.category)
          ? 'For real-time apps this means frozen video, robotic audio, and dropped calls.'
          : 'Users will see spinning loaders, timeouts, and slow saves in this app.',
        action: 'Confirm whether the problem is the network path (check the site uplink) or the app/SaaS provider itself. Consider a traffic-shaping rule to prioritize this app if it is business-critical.',
        evidence: [`${a.name}: latency ${a.avgLatencyMs ?? '—'} ms, loss ${a.lossPercent ?? '—'}%, ~${fmtBytes(a.usageTotalBytes)} used`],
      }));
    });
    if (apps.length && !stressed.length) {
      out.push(finding({
        severity: 'good', area: 'Application experience',
        title: 'Top applications are performing well',
        detail: 'None of your most-used applications show high latency or loss.',
        impact: 'Smooth app performance is what end users actually notice day to day.',
        action: 'No action needed.',
      }));
    }
    return out;
  }

  function ruleLicensing(d) {
    const out = [];
    const lic = d.licenses || {};
    if (lic.daysToExpiration != null) {
      if (lic.daysToExpiration <= 0) {
        out.push(finding({
          severity: 'critical', area: 'Licensing',
          title: 'Your Meraki license has expired',
          detail: 'Devices may stop passing traffic or lose dashboard management when a license lapses.',
          impact: 'An expired license can disable the network — this is urgent.',
          action: 'Renew immediately through your Meraki reseller or Cisco account team.',
        }));
      } else if (lic.daysToExpiration <= 45) {
        out.push(finding({
          severity: 'warning', area: 'Licensing',
          title: `License expires in ${lic.daysToExpiration} days`,
          detail: 'Meraki is subscription-based; hardware needs an active license to keep working.',
          impact: 'Letting it lapse risks losing management and, eventually, traffic.',
          action: 'Start the renewal now so it is approved before the deadline. Confirm device counts match what you own.',
        }));
      } else {
        out.push(finding({
          severity: 'good', area: 'Licensing',
          title: `Licensing is in good standing (${lic.daysToExpiration} days remaining)`,
          detail: 'Your subscription has comfortable runway.',
          impact: 'No risk of a license-driven outage in the near term.',
          action: 'Set a calendar reminder ~60 days before expiry.',
        }));
      }
    }
    return out;
  }

  function ruleTopTalkers(d) {
    const out = [];
    const clients = (d.clients || []).slice().sort((a, b) => (b.usageTotalBytes || 0) - (a.usageTotalBytes || 0));
    if (clients.length < 5) return out;
    const totalUsage = clients.reduce((a, c) => a + (c.usageTotalBytes || 0), 0) || 1;
    const top5 = clients.slice(0, 5);
    const top5Usage = top5.reduce((a, c) => a + (c.usageTotalBytes || 0), 0);
    const share = Math.round((top5Usage / totalUsage) * 100);
    if (share >= 50) {
      out.push(finding({
        severity: 'info', area: 'Capacity',
        title: `A handful of devices are using ${share}% of all bandwidth`,
        detail: `Your top 5 clients account for ${fmtBytes(top5Usage)} of ${fmtBytes(totalUsage)} total traffic.`,
        impact: 'A few heavy users can crowd out everyone else, especially on a smaller internet connection.',
        action: 'Check what these devices are doing (large backups, streaming, updates). If it is non-essential, schedule it after hours or apply a per-client bandwidth limit.',
        evidence: top5.map((c) => `${c.description} — ${fmtBytes(c.usageTotalBytes)}`),
      }));
    }
    return out;
  }

  // ---- Helpers -------------------------------------------------------------

  function byId(list, key, valKey) {
    const m = {};
    (list || []).forEach((x) => { m[x[key]] = x[valKey]; });
    return (id) => m[id];
  }

  function timeAgo(iso) {
    if (!iso) return 'unknown';
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.round(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min ago';
    const hr = Math.round(min / 60);
    if (hr < 24) return hr + ' hr ago';
    return Math.round(hr / 24) + ' d ago';
  }

  const RULES = [
    ruleDeviceAvailability, ruleUplinkStatus, ruleUplinkLossLatency,
    ruleChannelUtilization, ruleWirelessConnection, ruleWeakSignalClients,
    ruleHighLatencyClients, ruleFailedConnections, ruleApplicationExperience,
    ruleLicensing, ruleTopTalkers,
  ];

  function analyze(d) {
    let findings = [];
    RULES.forEach((r) => {
      try { findings = findings.concat(r(d) || []); }
      catch (e) { console.error('[MerakiScope] rule failed:', r.name, e); }
    });

    const order = { critical: 0, warning: 1, info: 2, good: 3 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);

    const counts = { critical: 0, warning: 0, info: 0, good: 0 };
    findings.forEach((f) => { counts[f.severity]++; });

    // Health score: start at 100 and subtract weighted penalties. Each severity's
    // contribution is capped so a handful of issues doesn't instantly pin the
    // score at 0 — the score stays a meaningful gauge rather than a binary.
    const penalty =
      Math.min(counts.critical, 3) * 16 +
      Math.min(counts.warning, 6) * 7 +
      Math.min(counts.info, 4) * 2;
    const score = Math.max(0, Math.min(100, 100 - penalty));

    let grade = 'Excellent';
    if (score < 50) grade = 'Needs attention';
    else if (score < 70) grade = 'Fair';
    else if (score < 85) grade = 'Good';

    return { findings, counts, score, grade };
  }

  global.MTK = global.MTK || {};
  global.MTK.insights = { analyze, fmtBytes, timeAgo };
})(window);
