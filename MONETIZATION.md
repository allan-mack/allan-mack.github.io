# 💰 Florida Insider Guide — How to make this store live

This site now has a working digital-product storefront (`store.html`) that can
take real payments **without any backend server** — perfect for GitHub Pages.
It sells a downloadable PDF travel guide. Everything is wired up; you just paste
in three values and upload your PDF.

## How the money flows

```
Visitor → store.html → Stripe Payment Link (hosted checkout)
        → pays with card/Apple Pay → Stripe deposits to your bank
        → redirected to success.html → downloads the PDF
```

Stripe handles cards, taxes, receipts, and security. You keep the revenue minus
Stripe's fee (~2.9% + 30¢). No monthly cost.

---

## Setup (about 15 minutes)

### 1. Create the product (the PDF)
You need something to sell. Options:
- Write the guide yourself, or assemble it from the Florida content already on
  this site, and export to PDF.
- Host the PDF somewhere with a public download link: a **GitHub Release asset**
  on this repo is free and reliable, or Google Drive ("Anyone with the link").

### 2. Set up Stripe (takes the payment)
1. Sign up at [stripe.com](https://stripe.com) (free).
2. Go to **Product catalog → Payment Links → New**.
3. Create a product: *The Florida Insider Guide*, price **$19**.
4. Under **After payment**, choose **Redirect to a page** and enter:
   `https://allan-mack.github.io/success.html`
5. Copy the payment link (looks like `https://buy.stripe.com/xxxxxxxx`).
6. Open `store.html`, find `STORE_CONFIG`, and paste it:
   ```js
   stripePaymentLink: "https://buy.stripe.com/xxxxxxxx",
   ```

### 3. Wire up the download page
Open `success.html` and set the public URL of your PDF:
```js
const GUIDE_DOWNLOAD_URL = "https://github.com/allan-mack/allan-mack.github.io/releases/download/v1/florida-guide.pdf";
```

### 4. (Optional) Email capture for the free cheat sheet
The page offers a free 1-page PDF to collect emails (great for marketing later).
1. Sign up at [formspree.io](https://formspree.io) (free tier is fine).
2. Create a form, copy its endpoint (`https://formspree.io/f/xxxxxxx`).
3. Paste it into `STORE_CONFIG` in `store.html`:
   ```js
   formspreeEndpoint: "https://formspree.io/f/xxxxxxx",
   ```

### 5. Commit & push
GitHub Pages redeploys automatically. Visit
`https://allan-mack.github.io/store.html` and test with Stripe's test card
`4242 4242 4242 4242` (in test mode) before going live.

---

## Make it actually sell

- **Drive traffic.** The product only earns if people see it. Share the Florida
  content on Reddit (r/florida, r/travel), Pinterest, and TikTok, linking back
  to the guide.
- **Capture emails first.** Most visitors won't buy on day one. The free
  cheat-sheet form builds a list you can sell to later.
- **Add affiliate links** to hotels/tours/Amazon gear inside the free Florida
  pages — a second, passive revenue stream alongside the guide.
- **Raise the price** once you have a few reviews. $19 is a launch price; $29–39
  is reasonable for a thorough guide.

## What's safe to know
- No secret keys live in this repo — Stripe Payment Links are public by design
  and safe to commit.
- Never put a Stripe **secret key** (`sk_...`) in any file here; it's not needed
  for this setup.
