# Reset — how it works on this site

Reset has its own look on purpose: clicking through from the Riptide site should feel
like arriving somewhere. It lives at `/reset/`.

| Address | What it is | Who can see it |
|---|---|---|
| `/reset/` | Public page: what Reset is, choose a start date, book, sign in | Everyone |
| `/reset/welcome` | Where the buyer lands after paying in the embedded Stripe form. Confirms the payment and signs them in | — |
| `/reset/members/` | The 21 days, audio, videos, the Tiny Habits PDF | Signed-in buyers only |

## The files

- `src/reset.md` — the Reset listing (What's On, homepage) and the public page's words.
  It sits outside `src/shows/` so the `/admin/` editor can't strip its layout. Edit it directly.
- `src/_includes/reset-landing.njk` — the public page design.
- `src/_data/reset.json` — the 21 day titles and the seed/tree drawings for the public page.
- `reset-members/` — the members' page, audio and PDF. Copied to `/reset/members/` at build.
- `functions/` — the small amount of server code (Cloudflare Pages Functions):
  - `functions/_lib/reset.js` — shared code: runs, bookings, sign-in, Stripe, email
  - `functions/api/reset/checkout.js` — sends the buyer to Stripe Checkout
  - `functions/reset/welcome.js` — after payment: checks with Stripe, records the booking, signs in
  - `functions/api/reset/webhook.js` — Stripe's backstop if the buyer closes the tab
  - `functions/api/reset/signin.js` + `verify.js` — email sign-in links (one use, 30 minutes)
  - `functions/api/reset/me.js`, `runs.js`, `signout.js`
  - `functions/reset/members/_middleware.js` — the gate in front of everything in the members area

## Rules it follows

- Runs start on the 1st of each month. The booking form offers the next six, never before `FIRST_RUN`.
- Access lasts one year from the start of the run.
- Each day opens on its date; buyers can press "Open all days" at any time.
- Nothing in the members area is served without a valid, signed sign-in cookie — not the page,
  not the audio, not the PDF.
- Card details never touch this site. Stripe handles payment and sends the receipt.

## Settings (Cloudflare Pages → your project → Settings)

**Bindings → KV namespace:** create a namespace called `reset`, bind it as `RESET_KV`.

**Variables and secrets:**

| Name | Type | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | Secret | `sk_test_…` while testing, then `sk_live_…` |
| `STRIPE_PUBLISHABLE_KEY` | Plain | `pk_test_…` while testing, then `pk_live_…` (public by design) |
| `STRIPE_WEBHOOK_SECRET` | Secret | `whsec_…` from the Stripe webhook |
| `RESET_PRICE_ID` | Plain | `price_…` of the £45 Reset product |
| `PI_PRICE_ID` | Plain | `price_…` of the £15 Project Intimacy product |
| `SESSION_SECRET` | Secret | A long random string (e.g. from a password manager). Changing it signs everyone out. |
| `RESEND_API_KEY` | Secret | `re_…` |
| `MAIL_FROM` | Plain | `Riptide Reset <reset@theriptide.co.uk>` |
| `SITE_URL` | Plain | `https://www.theriptide.co.uk` |
| `FIRST_RUN` | Plain | `2027-01-01` |

**Stripe webhook:** Developers → Webhooks → Add endpoint
`https://www.theriptide.co.uk/api/reset/webhook`, events `checkout.session.completed` and
`checkout.session.async_payment_succeeded`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

## Testing locally

```bash
npm install
npx eleventy
npx wrangler pages dev _site --kv RESET_KV \
  --binding SESSION_SECRET=dev STRIPE_WEBHOOK_SECRET=whsec_dev RESET_PRICE_ID=price_dev SITE_URL=http://localhost:8788
```

Without `RESEND_API_KEY`, emails are written to the console instead of sent.

## Media

Audio is in `reset-members/audio/` (compressed AAC, each under 15 MB). Videos are on Vimeo:
set each to **Hide from Vimeo** and, under Embed, **Specific domains → theriptide.co.uk**,
so the films only play inside the members' page.

## Payment: embedded Stripe Checkout

The booking form opens Stripe's secure payment form inside the Reset page (`ui_mode: embedded`),
so buyers never leave theriptide.co.uk. Card details go from the buyer's browser straight to Stripe
in Stripe's own secure frame; this site never sees them. Without JavaScript, the form falls back to
Stripe's hosted page.

Make it match Reset: Stripe Dashboard → Settings → Branding (or Checkout and Payment Links → Branding):
logo/icon, brand colour `#1E2431`, accent `#9A7344`, font close to Hanken Grotesk, rounded corners.

## Project Intimacy booking

The Project Intimacy page has its own embedded Stripe booking (`booking: stripe` in
`src/shows/project-intimacy.md`). Buyers choose a fortnight from the show's `runs` list, pay
without leaving the page, and land on `/project-intimacy/questionnaire/`, which greets them,
fills in their email and start date, and sends the answers to the Google Form.

- `functions/api/pi/checkout.js` — opens the embedded payment form for a chosen run
- `functions/api/pi/session.js` — confirms payment for the questionnaire page; sends the booking email once
- The Reset webhook (`/api/reset/webhook`) also handles Project Intimacy payments as a backstop,
  so one Stripe webhook covers both products.
- A run can be booked until the day it starts. Add or change dates in the show's "Run dates".
- Stripe's own receipt also goes to the buyer if receipts are switched on in Stripe
  (Settings → Customer emails → Successful payments).

## Gifts (Project Intimacy and Reset)

Both booking forms have a **This is a gift** option. The buyer adds the recipient's name, their own name, an optional message, and chooses either to have it emailed to the recipient now or sent to themselves to give in person.

- Gift purchases use the same Stripe prices and the same promotion codes. In the Stripe dashboard they show as "Gift: …" with `gift = 1` in the metadata.
- After paying, the buyer lands on `/gift/`, which shows a gift card they can print (A5 landscape) or forward, and a gift code like `K3MQ-9XD7-P2HT`.
- Emails (these need `RESEND_API_KEY`): the buyer always gets a copy. The recipient gets their own email if the buyer chose that.
- **Project Intimacy recipients** go to the questionnaire with their gift details and start date already filled in. A gift never counts as the buyer's own place.
- **Reset recipients** open their gift, choose a start month and enter their own email. That email then gets a year's access and the usual welcome email. Each gift can be unwrapped once.
- Anyone with a printed card can type the code at **theriptide.co.uk/gift**.
- Gifts are stored in the `RESET_KV` namespace as `gift:<CODE>` for about 13 months.
