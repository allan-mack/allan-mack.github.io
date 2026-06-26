# 🦊 InvoiceFox — a money-making invoice generator

A standalone, **100% client-side** invoice generator. It runs entirely in the
browser (perfect for GitHub Pages — no server, no database, no signup), creates
professional invoices with a live preview, and exports a real **PDF**.

Live path once deployed: `https://allan-mack.github.io/invoice/`

## How it makes money (freemium)

| Free | Pro — one-time **$12** |
|------|------------------------|
| Unlimited invoices | Everything in Free |
| Live preview + PDF download | ❌ Removes the "Created with InvoiceFox" line |
| Logo, tax, discount, currency | 🎨 3 templates + custom accent color |
| Saved business profile | 🔓 Unlocked design panel |

The small "Created free with InvoiceFox" line on free PDFs is the hook — it both
nudges upgrades **and** markets the tool to everyone who receives an invoice.

## Why this model works on static hosting
- The whole app is HTML/CSS/JS. No backend to pay for or maintain.
- Payment is handled by a **Stripe Payment Link** (Stripe's hosted checkout).
- "Pro" is unlocked locally via a code + a `localStorage` flag.

### ⚠️ Honest note on the Pro gate
Because there is no server, the Pro unlock is a **soft, client-side gate** — a
determined user could bypass it with dev tools. That's a deliberate, normal
trade-off for indie static tools: the vast majority of users won't bother, and
you keep $0 infrastructure cost. If revenue grows and you want a hard gate,
add a tiny serverless function (Stripe webhook → signed license) later.

## Go live in ~10 minutes

1. **Stripe** → create a Payment Link for **$12** (Payment Links → New).
   - Under *After payment → Redirect*, set:
     `https://allan-mack.github.io/invoice/?unlocked=1`
     (Returning with `?unlocked=1` auto-unlocks Pro for the buyer.)
   - Paste the link into `app.js` → `CONFIG.stripePaymentLink`.
2. **Unlock code** (for buyers who don't auto-redirect, e.g. paid on another
   device): change `CONFIG.unlockCode` in `app.js` to your own secret string,
   and email it on the Stripe receipt / success page.
3. Commit & push. GitHub Pages redeploys automatically.

That's it — you're taking payments.

## Grow it
- **SEO**: "free invoice generator" is a high-intent search. Add a short blurb
  + FAQ to the page and submit a sitemap.
- **The watermark is your ad** — every invoice sent spreads the tool.
- **Upsells later**: recurring invoices, client list, CSV export, branded
  email-send — all natural Pro tiers.

## Files
- `index.html` — markup (editor + live preview + Pro modal)
- `app.css` — styling, templates, print styles
- `app.js` — state, live render, PDF export, Pro unlock (config at top)

No secrets live in this repo. Stripe **Payment Links** are public by design;
never commit a Stripe secret key (`sk_...`) — it isn't needed here.
