# Adding Photos to HPRadar Marine

## Naming Convention

```
{Prefix}-{N}.jpg
```

Photos are served from R2 CDN: `https://pub-655e10ff87f24bd69eff6c98a4a7fb64.r2.dev/{name}.jpg`

## Vessel Type Prefixes

| Category | Prefix | AIS shiptype |
|----------|--------|-------------|
| cargo | `Cargo-vessel` | 70-79 |
| tanker | `Tanker` | 80-89 |
| passenger | `Passenger` | 60-69 |
| fishing | `Fishing-vessel` | 30 |
| tug | `Tug` | 31, 32, 52-54 |
| sailing | `Pleasure-craft` | 36, 37 |
| pilot | `Pilot-vessel` | 50 |
| hsc | `High-speed-craft` | 20-29, 40-49 |
| pleasure | `Pleasure-craft-0{N}` | (via sailing category) |
| sar | `Search-and-rescue` | 51 |
| law | `Law-enforcement` | 55 |
| medical | `Medical-transport` | 58 |
| military | `Military` | 35 |
| dive | `Dive-vessel` | 34 |
| dredging | `Dredging-or-underwater-ops` | 33 |
| platform | `Platform` | (fixed structures) |
| unknown | `Other-vessel-type` | 0, others |

## AtoN Prefixes

| Category | Prefix | AtoN types |
|----------|--------|-----------|
| lighthouse | `Lighthouse` | 4-7, 22-23 |
| lightvessel | `Lightvessel` | 8-12 |
| beacon | `Beacon` | 13-21 |
| buoy | `Buoy` | 24-31 |
| platform_aton | `Platform-aton` | 3 |

## Steps to Add a Photo

1. **Prepare image** — 1200px wide, JPEG quality 80:
   ```bash
   convert input.png -resize 1200x -quality 80 -strip "Prefix-N.jpg"
   ```

2. **Upload to R2:**
   ```bash
   export CLOUDFLARE_API_TOKEN="<your-token>"
   export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
   npx wrangler r2 object put "hpr-photos/Prefix-N.jpg" \
     --file="Prefix-N.jpg" --content-type="image/jpeg" --remote
   ```

3. **Update manifest** — add entry to `photos-manifest.json` and re-upload:
   ```bash
   # Edit photos-manifest.json, add to the appropriate category array:
   # {"file": "Prefix-N.jpg", "source": "...", "credit": "...", "license": "..."}
   npx wrangler r2 object put "hpr-photos/photos-manifest.json" \
     --file="photos-manifest.json" --content-type="application/json" --remote
   ```

4. **Done** — no code change needed. The FE fetches the manifest on load and picks photos dynamically by prefix.

## MMSI-Specific Photos (Future)

When a real vessel photo is uploaded as `{MMSI}.jpg`, set `isReal = true` in `fetchVesselPhoto` to skip the "Illustration only" disclaimer.

## Notes

- Photo must be in **both** R2 and the manifest JSON to appear
- Filename must start with the correct prefix (see tables above)
- Any extension works: `.jpg`, `.png`, `.avif`, `.webp`
- Any suffix after the prefix works: `Cargo-vessel-abc.jpg`, `Tug-harbor-night.avif`
- Random pick is cached per MMSI per session (consistent within visit)
- Different random photo shown on next page load
- All non-MMSI photos show "Illustration only" disclaimer overlay
- No code deploy needed — just update manifest + upload photo to R2
