# noeticsynthesis.com — source

## Where this came from

These files were **recovered from the live Vercel deployment**
(`dpl_6kzXb4o5ax5PX5X7MuFuWoesxvdf`, production, 2026-08-15), not from a repo.

At the time of recovery the site's source existed in no git repository:

- `bryanengel72/noetic-synthesis-new` contains only a README
- `bryanengel72/noetic-synthesis-cb1a4ca7` holds an older React/Vite version of
  the site, unrelated to what is actually live
- no working copy existed anywhere on the Mac

The live site is a hand-written static `index.html` plus two serverless
functions, and it has been shipped with `vercel deploy` from a local folder that
is now gone. Until this is committed somewhere, **the deployment is the only
copy.**

## Files

| file | what it is |
| --- | --- |
| `index.html` | the live page, byte-identical to production |
| `index-braid.html` | same page with the hero photo swapped for a drawn SVG band |
| `offerings.html` | the offerings page |
| `api/ask.js`, `api/contact.js` | the two serverless functions |
| `llms.txt`, `robots.txt`, `sitemap.xml` | as deployed |
| `vercel.json`, `package.json` | as deployed |
| `generate-hero-band.py` | regenerates the SVG band artwork |

## The hero band

The live hero closes on a full-bleed photograph hotlinked from the image
generator's CDN:

```
https://d8j0ntlcm91z4.cloudfront.net/user_.../hf_20260815_213506_39244972-....png
```

That link is a liability — 3.7 MB, a third-party host that can expire, black
letterbox bars baked into the source, and a `grayscale + sepia` filter whose only
job is to beat the photo into the site's palette.

`index-braid.html` replaces it with an inline SVG braided channel: one channel
in, many paths through, one out. About 6 KB, strokes inherit `currentColor` so it
themes with the page, sharp at any width, no second asset for mobile.

To regenerate or reshape the artwork:

```bash
python3 generate-hero-band.py
```

Change `seed` in `braid()` for a different braid; `depth` controls how many
times channels subdivide.

## Deploying

Push to git first, then deploy. Deploy the whole folder — the two functions live
in `api/` and a deploy from a folder without them removes them from production.

```bash
vercel deploy --prod
```
