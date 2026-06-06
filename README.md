# HPRadar Marine

Real-time AIS vessel tracking web app. Live at [marine.hpradar.com](https://marine.hpradar.com).

## Structure

```
index.html       — App shell (HTML only)
css/style.css    — All styles
js/app.js        — Application logic
icons/           — SVG vessel type icons
mapstyles/       — Self-hosted map styles (light/dark)
```

## Features

- Real-time binary AIS stream (WebSocket)
- MapLibre GL map with density-aware rendering (dots → icons → hulls)
- Ship card with Wikimedia Commons photo lookup
- Integrated NMEA decoder
- Source trust states (live/aging/stale)
- ASEAN region presets
- RainViewer rain radar overlay
- IndexedDB persistence for offline-fast reload
- Full mobile responsive (FR24-style bottom bar)

## Deploy

Auto-deploys to Cloudflare Pages on push to `main`.
