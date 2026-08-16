# noeticsynthesis.com — source

The live site: a hand-written static `index.html` + `offerings.html` plus two
serverless functions, deployed on Vercel. Canonical host is
`https://www.noeticsynthesis.com` (the apex 308-redirects to www).

## History

These files were originally **recovered from the live Vercel deployment**
(`dpl_6kzXb4o5ax5PX5X7MuFuWoesxvdf`, production, 2026-08-15) after the local
source folder was lost. The source now lives in git at
`bryanengel72/noetic-synthesis-new` — the deployment is no longer the only copy.

The older React/Vite version of the site
(`bryanengel72/noetic-synthesis-cb1a4ca7`, in the sibling folder) is **not**
what is live; it's a dormant earlier direction.

## Files

| file | what it is |
| --- | --- |
| `index.html` | the live page. The hero closes on an inline SVG braid band (formerly a separate `index-braid.html`; the band was merged in and the CloudFront hero photo it replaced is gone from production) |
| `offerings.html` | the offerings page |
| `api/ask.js` | Art of the Question endpoint — **excluded from deployment** via `.vercelignore` until the public demo ships, because it bills Opus tokens and nothing on the site calls it. It has a per-IP rate limiter for when it comes back. |
| `api/contact.js` | contact form handler (Resend, mailto fallback). Deployed but unreferenced by the site. |
| `og.png` | 1200×630 social share card, referenced by `og:image` on both pages |
| `generate-og-image.py` | regenerates `og.png` (needs Pillow) |
| `generate-hero-band.py` | regenerates the SVG braid band artwork |
| `llms.txt`, `robots.txt`, `sitemap.xml` | crawler/AI-agent files |
| `vercel.json`, `package.json` | deploy config |

## The hero band

The braid: one channel in, many paths through, one out. ~6 KB inline SVG,
strokes inherit `currentColor` so it themes with the page, sharp at any width.

To regenerate or reshape:

```bash
python3 generate-hero-band.py
```

Change `seed` in `braid()` for a different braid; `depth` controls how many
times channels subdivide.

## Deploying

Push to git first, then deploy. Deploy the whole folder — `api/contact.js`
lives in `api/` and a deploy from a folder without it removes it from
production. (`api/ask.js` is deliberately excluded by `.vercelignore`.)

```bash
vercel deploy --prod
```

**Note the Vercel project name:** this folder is linked (`.vercel/project.json`)
to the Vercel project **`noetic-synthesis-cb1a4ca7`** — the same name as the
dormant React app, because the static site was deployed over the top of that
existing project. Despite the name, it is the production project serving
noeticsynthesis.com. Don't create a new Vercel project for this site, and don't
assume that project contains the React code.

To re-enable the ask endpoint: remove the `api/ask.js` line from
`.vercelignore` and make sure `ANTHROPIC_API_KEY` is set in the Vercel
project's environment variables.
