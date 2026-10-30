# Riptide — website

A static site. No monthly platform fee, no database, no plugins to keep patched.
Content lives in plain files; a free editor at `/admin/` lets anyone in the company
change it without touching code.

- **Eleventy** turns the content files into HTML.
- **Cloudflare Pages** hosts it, free, and rebuilds every time content changes.
- **Sveltia CMS** is the editing interface at `/admin/`.
- **Ticket Tailor** handles tickets and money. The site never touches card details.

---

## The one idea to understand

Every show has a **status**. The status decides the badge colour, the badge text,
and what the button says — on the homepage, on What's On and on the show's own page,
all at once.

| Status | Badge | Button |
|---|---|---|
| `on-sale` | On sale (coral) | Book tickets → your Ticket Tailor link |
| `coming-soon` | Coming soon (amber) | Join the waiting list |
| `anytime` | Anytime (teal) | Start now |
| `touring` | Available to tour | Enquire |
| `podcast` | Podcast | Listen |
| `past` | moves to the archive | Read more |

So when Project Intimacy goes on sale you change one dropdown and paste one link.
You never edit a page.

---

## Running it on your own machine

You need Node 20 or newer.

```bash
npm install
npm start          # http://localhost:8080, reloads as you save
npm run build      # writes the finished site to _site/
```

---

## Putting it live

### 1. Put the code on GitHub

Create a repository (private is fine) and push this folder to it.

### 2. Connect Cloudflare Pages

1. Sign up at dash.cloudflare.com — the free plan is enough.
2. **Workers & Pages → Create → Pages → Connect to Git**, pick the repository.
3. Build command: `npm run build`. Output directory: `_site`. Framework preset: none.
4. Deploy. You get a `something.pages.dev` address within a minute.

### 3. Point the domain at it

In Pages → your project → **Custom domains**, add `theriptide.co.uk` and
`www.theriptide.co.uk`. Cloudflare tells you which DNS records to change at
your registrar. HTTPS is automatic and free.

**Do this last, and keep Squarespace running until the new site is live and checked.**
Swapping DNS is the only irreversible step, and it takes a few hours to propagate.

### 4. Turn on the editor

1. Open `src/admin/config.yml` and replace `REPLACE-ME/riptide-site` with your
   GitHub owner and repository name.
2. Visit `yoursite.com/admin/` and sign in with GitHub.
3. Anyone you add as a collaborator on the repository can now edit the site.
   They need a free GitHub account; they never need to see any code.

Saving in the editor commits to the repository, which triggers a rebuild.
Changes are live in about a minute, and every edit is a revision you can roll back.

---

## Adding a show

In the editor: **Shows and projects → New Show**. Fill in the fields and save.

Or as a file: copy `src/shows/project-intimacy.md`, rename it, change the front
matter. The filename becomes the web address, so `sonder.md` is at `/sonder/`.

`order: 1` puts a show in the homepage hero. `featured: true` puts it in the
homepage row. `status: past` moves it to the archive.

---

## Putting real water behind the hero

The hero falls back to the drawn currents when there is no media. Give a show a
`heroVideo` (and ideally `heroVideoWebm` and `heroPoster`) and the footage takes over.
A scrim sits on top automatically so the type stays readable.

What to shoot or source:

- **Dark water, shot from above, at dusk or in shade.** It stays near-black, which is
  what the palette needs. Bright blue daytime sea fights the design and makes the type
  hard to read.
- **Slow.** Crashing waves read as a stock-footage cliché. A current moving under the
  surface reads as Riptide.
- **Loopable.** Eight to twelve seconds, no cuts, nothing entering or leaving frame.
- **No horizon, no people, no boats.** Abstract water is timeless; a recognisable
  beach dates the site and ties it to a place you are not.

Specs: 1920 wide, under 3 MB for the mp4, H.264. Supply a webm (VP9) alongside it —
smaller, and some browsers prefer it. The poster frame is a jpg of the first frame,
which is what shows while the video loads and what anyone with reduced motion sees.

Compressing a clip you already have:

```bash
ffmpeg -i source.mov -t 10 -vf "scale=1920:-2,eq=brightness=-0.06:saturation=0.75" \
  -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -an src/assets/img/hero.mp4
ffmpeg -i src/assets/img/hero.mp4 -c:v libvpx-vp9 -b:v 900k -an src/assets/img/hero.webm
ffmpeg -i src/assets/img/hero.mp4 -vframes 1 -q:v 4 src/assets/img/hero-poster.jpg
```

The `eq` filter darkens and desaturates so the footage sits inside the palette rather
than shouting over it.

## Connecting Ticket Tailor

1. Create the event in Ticket Tailor, with a date range or timed slots.
2. Copy the public event URL.
3. In the editor, paste it into the show's **Ticket Tailor link** and set the
   status to **On sale**.

The button becomes "Book tickets" everywhere automatically. Leave the link empty
while a show is coming soon — the button falls back to the waiting list, which is
where your mailing list signups come from.

For Intermission's one-to-one slots, use Ticket Tailor's time-slot events so
capacity per session and the door list are handled for you.

---

## Connecting the newsletter

The sign-up form does nothing until you give it somewhere to post. Get a form
endpoint from Mailchimp, Buttondown or whichever list you use, then paste it into
**Site settings → Newsletter form action URL** in the editor.

---

## What still needs filling in

Search the project for `[` and you will find every gap. The main ones:

- `src/_data/team.json` — bios for Molly, Joe and Chris
- `src/work-with-us.njk` — what you actually sell, and who you have sold it to
- `src/team.njk` — the venues and companies you have worked with
- `src/privacy.njk` — your existing policy, plus what happens to Project Intimacy
  questionnaire data
- `src/shows/the-lucky-ones.md` and `an-odyssey.md` — archive entries, currently skeletons
- Real photographs in place of the dashed placeholders in `src/assets/img/`

Image sizes: landscape `1200 × 675`, portrait `880 × 1104`, headshots `400 × 400`.

---

## Things worth knowing

**The registered office is in the footer on purpose.** UK company law requires your
company name, number and registered office on the website. It is worded as post-only
so nobody turns up expecting a venue.

**`src/_redirects`** maps your old Squarespace URLs to the new ones, so existing links
and Google results keep working. Add to it if you find others.

**Accessibility** is built in: real buttons and links, keyboard focus rings, a skip
link, alt text on every image, 44px touch targets, and the FAQ uses native
`<details>` so it works without JavaScript. Keep that up when you add content —
the main thing is writing real alt text on photos.

**No cookies, no tracking, no analytics.** If you want visitor numbers, Cloudflare
Web Analytics is free, needs no cookie banner, and is one toggle in the dashboard.

---

## If something breaks

The site is plain files in Git. Every change is a commit, so any breakage can be
undone by reverting it. Cloudflare keeps previous deployments and you can roll back
to one in two clicks from the dashboard.

---

## Reset

Reset (the 21-day retreat) has its own booking, sign-in and members area. See **README-RESET.md**.
