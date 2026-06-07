# Adding Photos — TL;DR

## Upload

1. Name file starting with the correct prefix: `Cargo-vessel-*.jpg`, `Buoy-*.png`, etc.
2. Upload to R2 bucket `hpr-photos`
3. Run `reindex.sh` (Linux) or `reindex.bat` (Windows)

Done. No code change needed.

## Prefixes

**Vessels:**
`Cargo-vessel` `Tanker` `Passenger` `Fishing-vessel` `Tug` `Pilot-vessel` `High-speed-craft` `Pleasure-craft` `Search-and-rescue` `Law-enforcement` `Medical-transport` `Military` `Dive-vessel` `Dredging-or-underwater-ops` `Platform` `Other-vessel-type`

**AtoN:**
`Lighthouse` `Lightvessel` `Buoy` `Beacon` `Platform-aton`

## Rules

- Any extension: `.jpg` `.png` `.avif` `.webp`
- Any suffix after prefix: `Cargo-vessel-sunset.avif` ✓
- Reindex after upload — generates `photos-index.txt` on R2
- FE loads index once, groups by prefix, picks random per vessel
- Cached per MMSI per session
- All show "Illustration only" disclaimer (until MMSI-specific photo support)

## Reindex

```bash
# Linux
./reindex.sh

# Windows
set CLOUDFLARE_API_TOKEN=your-token
reindex.bat
```

## How FE Works

```
page load → fetch photos-index.txt → group filenames by prefix
click vessel → shipCategory(type) → pick random from that prefix group → show + cache
```
