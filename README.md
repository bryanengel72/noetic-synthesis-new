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
| `index.html` | the live page. The hero plays `hero.mp4` full-bleed behind the headline (see *The hero clip* below). The SVG braid band that used to close the hero is gone. |
| `offerings.html` | the offerings page |
| `api/ask.js` | Art of the Question endpoint — **excluded from deployment** via `.vercelignore` until the public demo ships, because it bills Opus tokens and nothing on the site calls it. It has a per-IP rate limiter for when it comes back. |
| `api/contact.js` | contact form handler (Resend, mailto fallback). Deployed but unreferenced by the site. |
| `og.png` | 1200×630 social share card, referenced by `og:image` on both pages |
| `generate-og-image.py` | regenerates `og.png` (needs Pillow) |
| `hero.mp4`, `hero-poster.jpg` | the hero clip (8 s, 1080p, silent, ~1 MB) and its first-frame poster |
| `generate-hero-band.py` | regenerates the retired SVG braid band. Kept in case the band comes back; nothing references it. |
| `llms.txt`, `robots.txt`, `sitemap.xml` | crawler/AI-agent files |
| `vercel.json`, `package.json` | deploy config |

## The hero clip

Pale ink blooming in black water, generated in Higgsfield (Cinema Studio
2.5 still at 2K, animated with Seedance 2.5 from that still as the start
frame, locked-off camera, 8 s, no audio). The clip opens from a tight drop
and plays once, holding on the open bloom; it does not loop. It rewinds
while the hero is scrolled out of view and plays again when the hero
comes back. Prompts are in the site
enhancement notes; the still and both clip variants are in the Higgsfield
generation history under the account.

How it's wired:

- `.hero-stage` wraps the header; `.hero-media` sits behind it with the
  poster `<img>` and a `<video>` that has no `src` in the HTML.
- The script sets `src` and plays only when `prefers-reduced-motion` is not
  set and Save-Data is off, so those readers get the poster and never
  download the mp4. The poster stays visible until the clip is actually
  playing, so there is no flash on swap.
- One clip serves both themes. Dark uses `mix-blend-mode: screen`, which
  drops the clip's black to the page ground. Light adds `filter: invert(1)`
  with `multiply`, so the ink reads as black on paper.
- A left-to-right gradient keeps the copy on clean ground; on narrow
  screens the bloom is pinned high behind the headline and the ground is
  solid by the paragraph.

To replace the clip, drop in a new `hero.mp4` and a matching
`hero-poster.jpg` (1920 wide, same frame as the clip's first frame). Keep
the bloom in the right third and the rest of the frame pure black or the
blend modes stop working.

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
