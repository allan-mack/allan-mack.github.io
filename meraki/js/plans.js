/*
 * plans.js — subscription tiers and feature entitlements for MerakiScope.
 *
 * MerakiScope is a static PWA, so this module models the *product* side of a
 * subscription (tiers, prices, and which capabilities each unlocks) and gates
 * the UI accordingly. Wiring it to a real billing provider (Stripe, Apple/
 * Google in-app purchase) only requires setting MTK.plan.set(tier) from the
 * billing callback — every gate in the app already reads from here.
 */
(function (global) {
  'use strict';

  // Capability flags. The UI asks MTK.plan.can('flag') before showing depth.
  const PLANS = {
    free: {
      id: 'free',
      name: 'Free',
      price: 0,
      period: 'forever',
      blurb: 'See whether anything is broken, for one organization.',
      highlight: false,
      limits: { insights: 6, clients: 25, networks: 3 },
      features: new Set([
        'overview', 'insights_core', 'clients_basic', 'apps_summary', 'networks_summary', 'glossary',
      ]),
      sell: [
        'Health score & overview dashboard',
        'Top 6 prioritized insights',
        'Up to 25 clients & 3 networks',
        'Application usage summary',
        'Plain-English glossary & guidance',
      ],
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      price: 29,
      period: 'per org / month',
      blurb: 'Everything a hands-on manager needs to find and fix problems.',
      highlight: true,
      limits: { insights: Infinity, clients: Infinity, networks: Infinity },
      features: new Set([
        'overview', 'insights_core', 'insights_all', 'clients_basic', 'clients_all', 'client_detail',
        'apps_summary', 'apps_metrics', 'networks_summary', 'networks_detail', 'trends', 'export',
        'glossary', 'search_all',
      ]),
      sell: [
        'Everything in Free, plus:',
        'Unlimited insights, clients & networks',
        'Per-client deep-dive with tailored advice',
        'Application latency & loss metrics',
        '7-day trends & sparklines',
        'One-click printable health report',
      ],
    },
    enterprise: {
      id: 'enterprise',
      name: 'Enterprise',
      price: 99,
      period: 'per org / month',
      blurb: 'Multi-site oversight, automation, and reporting for larger fleets.',
      highlight: false,
      limits: { insights: Infinity, clients: Infinity, networks: Infinity },
      features: new Set([
        'overview', 'insights_core', 'insights_all', 'clients_basic', 'clients_all', 'client_detail',
        'apps_summary', 'apps_metrics', 'networks_summary', 'networks_detail', 'trends', 'export',
        'glossary', 'search_all', 'multi_org', 'scheduled_reports', 'audit_log', 'sla', 'white_label',
        'priority_support',
      ]),
      sell: [
        'Everything in Pro, plus:',
        'Multi-organization switching & rollup',
        'Scheduled email/PDF reports',
        'Configuration change audit log',
        'Uptime / SLA tracking',
        'White-label branding & priority support',
      ],
    },
  };

  const ORDER = ['free', 'pro', 'enterprise'];

  let current = 'pro'; // demo previews Pro so all depth is visible
  try {
    const saved = localStorage.getItem('mtk_plan');
    if (saved && PLANS[saved]) current = saved;
  } catch (e) {}

  function get() { return PLANS[current]; }
  function id() { return current; }
  function all() { return ORDER.map((k) => PLANS[k]); }

  function can(flag) { return PLANS[current].features.has(flag); }
  function limit(key) { const l = PLANS[current].limits; return l && key in l ? l[key] : Infinity; }

  // The cheapest plan that unlocks a capability (used by upgrade nudges).
  function requiredPlan(flag) {
    for (const k of ORDER) if (PLANS[k].features.has(flag)) return PLANS[k];
    return PLANS.enterprise;
  }

  function set(tier) {
    if (!PLANS[tier]) return;
    current = tier;
    try { localStorage.setItem('mtk_plan', tier); } catch (e) {}
    if (global.MTK && MTK.onPlanChange) MTK.onPlanChange();
  }

  global.MTK = global.MTK || {};
  global.MTK.plan = { get, id, all, can, limit, requiredPlan, set, PLANS, ORDER };
})(window);
