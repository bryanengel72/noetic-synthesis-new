# noeticsynthesis.com — source

The live site: hand-written static pages (`index.html`, `offerings.html`,
`council.html`, `cycle.html`, `insights/`) plus serverless functions, deployed on Vercel. Canonical host is
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
| `cycle.html` | the full Noetic Innovation Cycle, runnable in the browser — six AoQ rounds → What If → Divergence → Foresight → What Now, per `../noetic-cycle-prototype.md`. Live since 2026-09-03; ships together with `api/cycle.js`. |
| `insights/index.html` | the Insights landing page (`/insights/`): a horizontal rail of cover cards. Clicking a card opens the essay in a full-screen reader loaded from the essay's own page (`?read=<slug>` deep-links to it; without JS the card is a plain link). Cover art is generated from `data-cover` (any integer), so no image files. Add a new essay as an `<a class="card">` here, plus `sitemap.xml` and `llms.txt`. |
| `insights/<slug>.html` | one page per essay. Six essays by Julie so far, in the order she sent them (not a numbered series). Source PDFs came from Julie; the text was converted by hand. |
| `insights/_template.html` | the essay template: copy it to `insights/<slug>.html` and replace every `{{TOKEN}}` (the file's header comment lists them). Listed in `.vercelignore`, so it never deploys. |
| `api/cycle.js` | the cycle's five-stage endpoint. All prompts live here server-side, one stage per request, structured outputs, per-IP rate limit (40/hr ≈ four runs). Live since 2026-09-03. |
| `council.html` | The Council: five advisors on five model families, two rounds, a synthesis that ends on the questions they could not resolve (each links into `cycle.html?q=`). Rebuilt on-site 2026-09-04, replacing the MindStudio iframe; ships together with `api/council.js`. |
| `api/council.js` | the Council's endpoint, via OpenRouter (`OPENROUTER_API_KEY`). Three phases per run (round1 / round2 / synthesis), five seats in parallel per round, a seat that fails shows "did not answer". Seat prompts are the MindStudio agent's verbatim (source: `../council-mindstudio-prompts.md`). Per-IP rate limit (30/hr ≈ ten runs). |
| `api/ask.js` | Art of the Question endpoint behind the homepage Ask form. Six rounds: five of questions, then a synthesis. Live since 2026-09-03; per-IP rate limit (10/hr). |
| `api/contact.js` | contact form handler (Resend, mailto fallback). Deployed but unreferenced by the site. |
| `api/_ratelimit.js` | shared per-IP limiter used by the model endpoints. Underscore-prefixed, so Vercel doesn't build it as a function. |
| `og.png` | 1200×630 social share card, referenced by `og:image` on both pages |
| `generate-og-image.py` | regenerates `og.png` (needs Pillow) |
| `hero-hevc.mp4`, `hero.mp4`, `hero-poster.jpg` | the hero clip twice (HEVC 1080p ~1 MB as Higgsfield delivered it; H.264 720p ~2 MB fallback made with macOS `avconvert -p PresetAppleM4V720pHD`) and the first-frame poster. Browsers take the first `<source>` they can decode. |
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

To replace the clip, drop in a new `hero-hevc.mp4` and `hero.mp4` (H.264;
Higgsfield delivers HEVC, which Chrome on Windows, Firefox and most Android
browsers cannot play, so the H.264 fallback is not optional) and a matching
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

Both Claude endpoints (`api/ask.js`, `api/cycle.js`) are live as of
2026-09-03. `ANTHROPIC_API_KEY` is set in the Vercel project's Production
environment. `api/council.js` needs `OPENROUTER_API_KEY` in the same place;
until it is set the endpoint answers 503 and the Council page shows that. `vercel.json` grants `api/*.js` a 60s `maxDuration` because
Opus calls exceed the default window. To take a billing surface out of
production again, add its file to `.vercelignore` (`cycle.html` and
`api/cycle.js` go together; the page is broken without its endpoint).
