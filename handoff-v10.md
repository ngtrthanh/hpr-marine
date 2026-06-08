# HPRadar Marine – Handoff v10
**Date:** 2026-06-07  
**Tag:** v1.2.2 (commit 094523b on main)

---

## What was done this session

### 1. R2 Photo Pipeline — Complete
- **CORS fix:** R2 bucket `hpr-photos` was missing CORS headers → browser blocked `fetch()` of `photos-index.txt`. Fixed via Cloudflare API (`PUT /r2/buckets/hpr-photos/cors`), now returns `Access-Control-Allow-Origin: *`.
- **Normalize:** Built pipeline that takes curated photos from `/home/ubuntu/hpr/hpr-photo/{aton,cargo,container,tanker,hires}/` → resizes to 1200px wide JPEG q80 → renames to `Prefix-NN.jpg` (zero-padded, dashes, no spaces).
- **Upload:** Deleted all 43 old objects (un-normalized, spaces in names), uploaded 98 clean photos + `photos-index.txt`.
- **Result:** 98 photos across 17 vessel categories. All PREFIX_MAP entries have ≥1 R2 photo. AtoN subcategories (lighthouse, beacon, lightvessel, platform_aton) fall back to SVG icons.

### 2. Removed external binmsgs.json polling
- Deleted `pollBinMsgs()` and the `BINMSG_ENDPOINTS` array (was hitting `m3.hpradar.com/api/binmsgs.json` which returns 502).
- Meteo/hydro data now handled entirely by backend.

### 3. Ship card relocated to top-right
- Moved `#vcard` from `bottom: 12px; left: calc(50%+20px)` to `top-right`, beside (left of) zoom/fullscreen/globe controls with ~15px gap.
- Slides in from right instead of from bottom.

### 4. Fixed Noto Sans font 404
- `tiles.openfreemap.org/fonts/` returns 404 for all font PBFs.
- Switched glyphs URL to `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=nRYox0R1ZyZ6XqSStq4S` in:
  - `mapstyles/light-minimal.json`
  - `mapstyles/dark-minimal.json`
  - `transformStyle` callback on Map init (catches external styles like Positron/Liberty/Bright)

---

## Current Architecture

### Photo System
```
Browser loads:
  photos-index.txt → groups files by prefix → random pick per vessel type
  
  Vessel photo: typePhotos[cat] → R2 CDN URL
  Vessel fallback: ./photos/{Prefix}.jpg (local, deployed with site)
  AtoN photo: atonPhotos[cat] → R2 CDN URL  
  AtoN fallback: ./icons/{aton_icon_type}.svg (4:3 padded container)
  
  Cache: per MMSI per session (only after index loads)
```

### R2 Bucket (`hpr-photos`)
- CDN: `https://pub-655e10ff87f24bd69eff6c98a4a7fb64.r2.dev`
- Account: `6fda41cc193438941c7e2b58de0127a2`
- CORS: `*` for GET/HEAD
- 99 objects (98 photos + 1 index)

### Photo counts on R2
| Prefix | Count |
|--------|-------|
| Cargo-vessel | 38 |
| Buoy | 19 |
| Platform | 7 |
| Pleasure-craft | 7 |
| Other-vessel-type | 6 |
| Tanker | 4 |
| Medical-transport | 4 |
| Fishing-vessel | 3 |
| Tug | 2 |
| Dive-vessel | 1 |
| Dredging-or-underwater-ops | 1 |
| High-speed-craft | 1 |
| Law-enforcement | 1 |
| Military | 1 |
| Passenger | 1 |
| Pilot-vessel | 1 |
| Search-and-rescue | 1 |

### Key Files
| File | Purpose |
|------|---------|
| `js/app.js` | Main FE (~2070 lines) |
| `css/style.css` | All styles |
| `mapstyles/*.json` | Light/Dark minimal map styles |
| `photos/*.jpg` | Local fallback photos (36) |
| `icons/*.svg` | AtoN SVG icons (47) |

### Pipeline (for future photo additions)
```bash
# On server:
cd /home/ubuntu/hpr/hpr-photo
# 1. Add photos to appropriate folder
# 2. Run normalize (outputs to staging/)
bash normalize.sh
# 3. Upload + reindex
bash reindex.sh
```

---

## Pending / Known Issues
- **AtoN classification incomplete:** All 19 aton photos went to Buoy. Images 06-19 were never visually classified (lighthouse vs beacon vs buoy). Could be re-sorted later.
- **Categories with only 1 photo:** dive, dredging, hsc, law, military, passenger, pilot, sar — need more variety.
- **p1/ icons (20 PNGs):** Not yet uploaded to R2. These are type-icon illustrations (cargo-vessel.png, tug.png, etc.) — could replace local `./photos/` fallbacks.
- **hires/ folder:** Some duplicates with different filenames may exist.
- **`transformStyle` for fonts:** Works but is a MapLibre-specific API. If upgrading MapLibre version, verify it's still supported.

---

## Git State
- Repo: `github.com/ngtrthanh/hpr-marine`
- Branch: `main`
- Latest tag: `v1.2.2`
- Clean working tree
