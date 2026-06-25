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

## Pages

- **`index.html`** — the marketing landing page (hero, who-it's-for,
  features, screenshots, pricing, FAQ). The front door for visitors.
- **`app.html`** — the application itself (connect screen + dashboard). The
  landing CTAs link here; `app.html?demo=1` opens straight into the demo, and
  the installed PWA uses `app.html` as its start URL.

## Try it instantly (Demo mode)

Open `index.html`, click **Launch live demo** (or open `app.html?demo=1`
directly). No API key, no account. The demo is a realistic four-site company
("Northwind Trading Co.")
with problems deliberately baked in — an offline appliance, a congested access
point, a flaky uplink, Wi-Fi auth failures, a struggling Zoom — so you can see
how the Insights engine reasons about good *and* bad conditions.

## Connect to a real organization (Live mode)

1. In the Meraki dashboard, create a **dedicated read-only organization
   administrator**, then generate an API key while signed in as that admin
   (*My profile → API access*). A Meraki API key inherits the **full
   permissions of the admin who created it** — there is no inherently
   "read-only" key — so generating it under a read-only admin is what makes it
   safe to use here. Rotate the key periodically and revoke it if it leaks.
2. Open MerakiScope → expand **Connect to your real Meraki organization**.
3. Paste your API key, set a **CORS proxy URL** (see below), click
   **Connect & list organizations**, pick your org, and **Load**.

Your API key lives only in the browser tab for the session — it is never
written to disk, and **Disconnect** wipes it from memory and the form. Only the
non-secret base/proxy URLs are remembered for convenience. Note that the key
**is** transmitted to the proxy URL you configure on every request, so point
that field only at a relay you operate and trust (and always over HTTPS — the
app refuses non-HTTPS base/proxy URLs).

### Why a CORS proxy is required in a browser

The Meraki Dashboard API does **not** send the `Access-Control-Allow-Origin`
header, so browsers block direct calls to `api.meraki.com` from another origin.
This is a Meraki/browser security behavior, not a limitation of this app. The
fix is a tiny relay you control that forwards the request and adds the CORS
header.

Minimal **Cloudflare Worker** example:

Minimal **Cloudflare Worker** example. It is locked down two ways: it only
forwards to `api.meraki.com`, and it only answers your app's origin (so it is
not an open relay that anyone who learns the URL can abuse):

```js
const ALLOWED_ORIGIN = 'https://allan-mack.github.io'; // your app's origin

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response('forbidden', { status: 403 });
    }
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    const target = new URL(request.url).searchParams.get('url');
    if (!target || !target.startsWith('https://api.meraki.com/')) {
      return new Response('blocked', { status: 400 });
    }
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        Authorization: request.headers.get('Authorization'),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    const res = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
    return res;
  },
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}
```

Deploy it, then paste its URL (e.g. `https://meraki-proxy.you.workers.dev/?url=`)
into the **CORS proxy URL** field. The app appends `url=<encoded endpoint>`
automatically.

> **The strongest option** is to not pass the key through the browser at all:
> store it as a Worker/server secret and have the relay attach the
> `Authorization` header itself, so the key never leaves your infrastructure.
> The browser then sends no credential. Use this if you can; the example above
> is the minimum for the browser-enters-the-key model.

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

## One tool for non-technical *and* technical users

A top-bar **Guided / Expert** toggle reshapes the whole app for the person using
it (the choice is remembered per device):

| | **Guided** (non-technical) | **Expert** (technical) |
|---|---|---|
| Insight language | Plain English: what / why / what to do | Same, **plus** a `measured vs. threshold` line and the rule id on every finding |
| Client table | Friendly columns (signal, latency, usage) | Adds SSID, SNR, VLAN, MAC, IP (monospace) |
| Device table | Name, model, status | Adds serial, firmware, LAN IP, per-device deep-link |
| Thresholds | Sensible defaults | **⚙ Tune thresholds** — RSSI, utilization, loss, latency, join-failure %, license window… applied instantly and saved locally |
| Export | — | **CSV export** of all clients |
| Remediation | “Open in Meraki ↗” on every issue | Same, plus per-device links |

This is the core of the product: the same engine, presented so a non-technical
manager isn't overwhelmed and a network engineer isn't condescended to. The
**“Open in Meraki ↗”** deep-links turn it from read-only into a starting point
for action; the **tunable thresholds** let technical users stop the false
alarms that generic, hard-coded limits cause.

> Deep-links use the dashboard URL the Meraki API provides for each
> network/device when available, falling back to the organization URL.

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
├── index.html              Marketing landing page
├── app.html                App shell (connect screen + dashboard)
├── manifest.webmanifest    PWA manifest (start_url = app.html)
├── sw.js                   Service worker (offline shell)
├── img/                    Landing-page screenshots
├── css/
│   ├── app.css             Responsive dark dashboard theme
│   └── landing.css         Marketing landing styles
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

## Security

How MerakiScope protects the app and your data:

- **Credential handling.** The API key is held only in memory for the session,
  never written to `localStorage` or disk, and is wiped from memory and the
  form on **Disconnect**. Only non-secret base/proxy URLs are remembered.
- **HTTPS enforced.** The app rejects any base or proxy URL that isn't
  `https://`, so the key can't be sent in cleartext.
- **Least privilege.** Use a dedicated **read-only** Meraki admin to mint the
  key, and rotate it. See *Live mode* above.
- **Output encoding.** All data rendered from the API or from devices on the
  network (client names, SSIDs, hostnames — any of which an end user could set
  to a malicious string) is HTML-escaped before display, preventing stored XSS.
- **Content-Security-Policy.** A strict CSP (`script-src 'self'`, no inline
  script, `object-src 'none'`, `frame-ancestors 'none'`, etc.) is set via meta
  tag as defense-in-depth. For full effect (and clickjacking protection via
  response headers) host behind something that can set HTTP headers; GitHub
  Pages cannot.
- **No third-party runtime code.** The app loads only its own scripts — no CDN,
  no trackers — minimizing supply-chain risk. The generated report opens in an
  isolated tab (`noopener`, Blob URL) that cannot read back into the app.
- **Service worker** never caches API responses or anything carrying the key
  (requests to `api.meraki.com` and proxied `url=` requests are excluded).

### Not a security boundary

Subscription tiers (`js/plans.js`) are enforced **client-side only** and are
trivially editable by the user — fine for the current static demo, but if real
billing or paid data tiers are added, entitlements **must** be enforced
server-side. Treat `plans.js` as UI presentation, not access control.
