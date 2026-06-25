# MerakiScope

An all-in-one troubleshooting companion for **Cisco Meraki** organizations,
written for **amateur technology managers** — the people who own the network
but aren't full-time network engineers.

It answers the questions that actually matter:

- **Is anything broken right now, and how bad is it?**
- **How is the experience for the people using the network** (Wi-Fi signal,
  latency, failed connections, heavy users)?
- **How are the apps performing** (Zoom, Microsoft 365, Salesforce, …)?
- **What should I do about it?** — every finding comes with a plain-English
  explanation of *what it is, why it matters, and what to do next.*

## One app, three platforms

MerakiScope is a **Progressive Web App (PWA)**. That means a single codebase
runs as:

- a **web interface** in any modern browser,
- an **Android app** — open the page in Chrome and choose *Add to Home Screen*,
- an **Apple app** (iPhone/iPad) — open in Safari and choose *Add to Home
  Screen*.

Once installed it launches full-screen like a native app, and the demo works
offline.

> Why a PWA instead of separate native builds? GitHub Pages serves static
> files and can't compile native binaries, and a PWA gives genuine
> install-to-home-screen on both Android and iOS from one codebase with zero
> app-store friction. If a true native wrapper is ever needed later, this same
> web app drops straight into Capacitor or a TWA.

## Try it instantly (Demo mode)

Open `index.html` and click **Launch demo organization**. No API key, no
account. The demo is a realistic four-site company ("Northwind Trading Co.")
with problems deliberately baked in — an offline appliance, a congested access
point, a flaky uplink, Wi-Fi auth failures, a struggling Zoom — so you can see
how the Insights engine reasons about good *and* bad conditions.

## Connect to a real organization (Live mode)

1. In the Meraki dashboard, create a **read-only API key**
   (*My profile → API access*).
2. Open MerakiScope → expand **Connect to your real Meraki organization**.
3. Paste your API key, set a **CORS proxy URL** (see below), click
   **Connect & list organizations**, pick your org, and **Load**.

Your API key lives only in the browser tab for the session. It is never stored;
only your non-secret base/proxy URLs are remembered for convenience.

### Why a CORS proxy is required in a browser

The Meraki Dashboard API does **not** send the `Access-Control-Allow-Origin`
header, so browsers block direct calls to `api.meraki.com` from another origin.
This is a Meraki/browser security behavior, not a limitation of this app. The
fix is a tiny relay you control that forwards the request and adds the CORS
header.

Minimal **Cloudflare Worker** example:

```js
export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get('url');
    if (!target || !target.startsWith('https://api.meraki.com/')) {
      return new Response('blocked', { status: 400 });
    }
    const r = await fetch(target, {
      method: request.method,
      headers: {
        Authorization: request.headers.get('Authorization'),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    const res = new Response(r.body, r);
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res;
  },
};
```

Deploy it, then paste its URL (e.g. `https://meraki-proxy.you.workers.dev/?url=`)
into the **CORS proxy URL** field. The app appends `url=<encoded endpoint>`
automatically.

> For production use, lock the proxy down to your own origin and consider
> keeping the API key server-side rather than passing it through the browser.

## Plans & subscription model

MerakiScope ships with a three-tier model so it can be offered as a freemium
product. Tiers and the capabilities they unlock are defined in
[`js/plans.js`](js/plans.js); every gate in the UI reads from there.

| | **Free** — $0 | **Pro** — $29/org/mo | **Enterprise** — $99/org/mo |
|---|---|---|---|
| Health score & overview | ✅ | ✅ | ✅ |
| Prioritized insights | Top 6 | Unlimited | Unlimited |
| Clients | Up to 25 | Unlimited + deep-dive | Unlimited + deep-dive |
| Application metrics (latency/loss) | Usage only | ✅ | ✅ |
| Network & device detail | Summary | Full + uplink sparklines | Full + uplink sparklines |
| 7-day trends & sparklines | — | ✅ | ✅ |
| Printable health report | — | ✅ | ✅ |
| Multi-org switching & rollup | — | — | ✅ |
| Scheduled reports, audit log, SLA, white-label | — | — | ✅ |

In the demo you can switch tiers instantly from the plan badge (top-right) or
the **Plans** tab to feel the difference. The demo defaults to **Pro** so all
depth is visible.

**Connecting real billing:** the in-app "subscribe" is a simulated checkout.
To go live, drop in Stripe Checkout (web) or Apple/Google in-app purchase
(installed app) and call `MTK.plan.set(tier)` from the success callback — no
other code changes are needed because entitlements are already centralized.

## Designed to be understood

Because the audience is technology managers, not network engineers:

- **Every finding is plain-English** with *what it is → why it matters → what
  to do*.
- **Jargon is tappable.** Underlined terms (RSSI, latency, DHCP, channel
  utilization, …) open a one-tap definition, and the **Help** tab has a full
  glossary and getting-started guide.
- **Click any client** for a deep-dive with device-specific advice.
- **Trends & sparklines** show whether things are getting better or worse, not
  just a single snapshot.
- **One-click report** produces a printable / save-as-PDF health summary for
  sharing with leadership.

## What it analyzes

| Area | Signals used |
|------|--------------|
| Device health | online/offline/alerting status, last-seen times |
| Internet uplinks | WAN status, packet loss & latency (5-min averages) |
| Wi-Fi airtime | per-radio channel utilization (2.4 / 5 GHz) |
| Client experience | signal strength (RSSI), latency, failed connections, weak-signal share |
| Wireless joins | association / auth / DHCP / DNS failure rates |
| Application experience | per-app latency, loss, usage, user counts |
| Capacity | top bandwidth talkers vs. everyone else |
| Licensing | days to expiration |

Findings roll up into a single **0–100 health score** and grade so a manager
gets the headline in one glance, then can drill into the details.

## Project layout

```
meraki/
├── index.html              App shell (connect screen + dashboard)
├── manifest.webmanifest    PWA manifest (installable on phones)
├── sw.js                   Service worker (offline shell)
├── css/app.css             Responsive dark dashboard theme
├── icons/                  App icons (SVG, incl. maskable)
└── js/
    ├── plans.js            Subscription tiers & feature entitlements
    ├── mock.js             Seeded demo-organization generator (+ trends)
    ├── api.js              Live Meraki Dashboard API client
    ├── insights.js         Plain-English analysis/recommendation engine
    ├── ui.js               Views, router, glossary, modals, plan gating
    └── app.js              Bootstrap, state, connect flow, subscribe, PWA
```

`mock.js` and `api.js` produce the *same* normalized data model, so the
insights engine and UI are identical whether you're exploring the demo or a
live org.

## Privacy

- Demo mode makes **no** network requests.
- Live mode talks only to your configured proxy → Meraki. No analytics, no
  third-party calls, no telemetry.
