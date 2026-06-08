    // ═══════════════════════════════════════════════════════════════
    // CONFIG
    // ═══════════════════════════════════════════════════════════════
    const urlParams = new URLSearchParams(location.search);
    // Units (persisted)
    const units = {
      speed: localStorage.getItem('unitSpeed') || 'kn',
      dist: localStorage.getItem('unitDist') || 'm',
    };
    function setUnit(kind, val) {
      units[kind] = val;
      localStorage.setItem(kind === 'speed' ? 'unitSpeed' : 'unitDist', val);
      buildSettingsMenu();
      if (selectedMmsi) { const v = vessels.get(selectedMmsi); if (v) showPanel(selectedMmsi, v); }
    }
    function fmtSpeed(kn) {
      if (kn === undefined) return null;
      if (units.speed === 'kmh') return (kn * 1.852).toFixed(1) + ' km/h';
      if (units.speed === 'mph') return (kn * 1.15078).toFixed(1) + ' mph';
      return kn.toFixed(1) + ' kn';
    }
    function fmtLen(m) {
      if (m === undefined || m === null) return null;
      if (units.dist === 'ft') return Math.round(m * 3.28084) + ' ft';
      return Math.round(m) + ' m';
    }
    function esc(val) {
      const el = document.createElement('span');
      el.textContent = val ?? '';
      return el.innerHTML;
    }
    const STALE_MS = 86400000; // 24h → remove vessel (matches MarineTraffic)
    // Source trust age states (Phase 5 shares this)
    function ageState(ts) {
      const a = (Date.now() - ts) / 1000; // seconds
      if (a <= 30) return 'live';
      if (a <= 120) return 'aging';
      if (a <= 600) return 'stale';
      return 'hidden';
    }
    function fmtAge(ts) {
      const a = Math.round((Date.now() - ts) / 1000);
      if (a < 60) return a + 's ago';
      if (a < 3600) return Math.floor(a / 60) + 'm ' + (a % 60) + 's ago';
      return Math.floor(a / 3600) + 'h ago';
    }
    const TYPE_COLORS = {
      cargo: '#56A752', tanker: '#4D4C4E', passenger: '#60a5fa',
      fishing: '#FFA800', tug: '#E32913', sailing: '#2dd4bf',
      pilot: '#15375D', hsc: '#60a5fa', pleasure: '#C8C8D1',
      sar: '#EBE32B', law: '#ECE42B', medical: '#EBE32B',
      military: '#7B9A68', dive: '#22d3ee', dredging: '#56A752',
      sar_aircraft: '#f59e0b', helicopter: '#f59e0b',
      seismic: '#a78bfa', platform: '#78716c', unknown: '#98989B'
    };

    function shipCategory(type, mmsi) {
      // SAR aircraft: MMSI starts with 111
      if (mmsi && String(mmsi).startsWith('111')) return 'sar_aircraft';
      // Helicopter/SART: MMSI starts with 970
      if (mmsi && String(mmsi).startsWith('970')) return 'helicopter';
      if (type == null || type === 0) return 'unknown';
      if (type >= 70 && type <= 79) return 'cargo';
      if (type >= 80 && type <= 89) return 'tanker';
      if (type >= 60 && type <= 69) return 'passenger';
      if (type >= 40 && type <= 49) return 'hsc';
      if (type >= 20 && type <= 29) return 'hsc'; // WIG craft
      if (type === 30) return 'fishing';
      if (type === 31 || type === 32) return 'tug';
      if (type === 33) return 'dredging';
      if (type === 34) return 'dive';
      if (type === 35) return 'military';
      if (type === 36) return 'sailing';
      if (type === 37) return 'pleasure';
      if (type === 38) return 'seismic';
      if (type === 50) return 'pilot';
      if (type === 51) return 'sar';
      if (type === 52) return 'tug';
      if (type === 53) return 'tug'; // port tender
      if (type === 54) return 'platform'; // anti-pollution / platform
      if (type === 55) return 'law';
      if (type === 56) return 'platform'; // spare - local vessel
      if (type === 57) return 'platform'; // spare - local vessel
      if (type === 58) return 'medical';
      if (type === 59) return 'platform'; // other type
      if (type >= 90 && type <= 99) return 'platform'; // other
      return 'unknown';
    }

    // Icon size factor at a given zoom — MUST match the vessels-symbol layer's icon-size stops
    function iconSizeAtZoom(z) {
      const stops = [[5, 0.4], [9, 0.45], [12, 0.5], [16, 0.6]];
      if (z <= stops[0][0]) return stops[0][1];
      if (z >= stops[stops.length-1][0]) return stops[stops.length-1][1];
      for (let i = 0; i < stops.length-1; i++) {
        const [z0, s0] = stops[i], [z1, s1] = stops[i+1];
        if (z >= z0 && z <= z1) return s0 + (z - z0) / (z1 - z0) * (s1 - s0);
      }
      return stops[stops.length-1][1];
    }

    // ═══════════════════════════════════════════════════════════════
    // AIS DECODER (from i2-reference)
    // ═══════════════════════════════════════════════════════════════
    const ASCII6 = "@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_ !\"#$%&'()*+,-./0123456789:;<=>?";

    function payloadToBits(payload) {
      let bits = '';
      for (let i = 0; i < payload.length; i++) {
        let c = payload.charCodeAt(i) - 48;
        if (c > 40) c -= 8;
        bits += (c >>> 0).toString(2).padStart(6, '0');
      }
      return bits;
    }

    function bitsToInt(bits, off, len) {
      let v = 0;
      for (let i = 0; i < len; i++) v = (v << 1) | (bits.charCodeAt(off + i) - 48);
      return v;
    }

    function bitsToSignedInt(bits, off, len) {
      let v = bitsToInt(bits, off, len);
      if (bits[off] === '1') v -= (1 << len);
      return v;
    }

    function bitsToText(bits, off, len) {
      let t = '';
      for (let i = 0; i < len; i += 6) {
        const c = bitsToInt(bits, off + i, 6);
        t += ASCII6[c] || '';
      }
      return t.replace(/@+$/, '').trim();
    }

    // ═══════════════════════════════════════════════════════════════
    // VESSEL STORE
    // ═══════════════════════════════════════════════════════════════
    const vessels = new Map(); // mmsi → {lon,lat,cog,sog,hdg,name,shiptype,callsign,destination,imo,ts}

    // Spatial grid index (1° cells) for viewport-filtered iteration
    const GRID_RES = 1;
    const spatialGrid = new Map(); // "lat,lon" → Set<mmsi>
    function gridKey(lon, lat) { return (Math.floor(lat / GRID_RES)) + ',' + (Math.floor(lon / GRID_RES)); }
    function gridAdd(mmsi, lon, lat) {
      const k = gridKey(lon, lat);
      let cell = spatialGrid.get(k);
      if (!cell) { cell = new Set(); spatialGrid.set(k, cell); }
      cell.add(mmsi);
    }
    function gridRemove(mmsi, lon, lat) {
      if (lon === undefined || lat === undefined) return;
      const k = gridKey(lon, lat);
      const cell = spatialGrid.get(k);
      if (cell) { cell.delete(mmsi); if (!cell.size) spatialGrid.delete(k); }
    }
    function gridQuery(bounds) {
      const result = [];
      const minLat = Math.floor(bounds.getSouth() / GRID_RES);
      const maxLat = Math.floor(bounds.getNorth() / GRID_RES);
      const minLon = Math.floor(bounds.getWest() / GRID_RES);
      const maxLon = Math.floor(bounds.getEast() / GRID_RES);
      for (let lat = minLat; lat <= maxLat; lat++) {
        for (let lon = minLon; lon <= maxLon; lon++) {
          const cell = spatialGrid.get(lat + ',' + lon);
          if (cell) for (const mmsi of cell) result.push(mmsi);
        }
      }
      return result;
    }

    const TRAIL_MAX = 100;
    let dirtySet = new Set(); // MMSIs changed since last render

    function updateVessel(data) {
      if (!data.mmsi || data.mmsi === 0) return;
      if (data.lon !== undefined && (data.lon > 180 || data.lon < -180 || data.lon === 181)) return;
      if (data.lat !== undefined && (data.lat > 90 || data.lat < -90 || data.lat === 91)) return;
      if (data.lon === 0 && data.lat === 0) return; // Null Island — invalid GPS

      let merged = vessels.get(data.mmsi);
      if (merged) {
        const oldLon = merged.lon, oldLat = merged.lat;
        for (const k in data) merged[k] = data[k];
        merged.ts = Date.now();
        // Update spatial grid
        if (data.lon !== undefined && data.lat !== undefined) {
          if (oldLon !== undefined) gridRemove(data.mmsi, oldLon, oldLat);
          gridAdd(data.mmsi, merged.lon, merged.lat);
        }
      } else {
        merged = { ...data, ts: Date.now() };
        vessels.set(data.mmsi, merged);
        if (data.lon !== undefined && data.lat !== undefined) {
          gridAdd(data.mmsi, merged.lon, merged.lat);
        }
      }

      // Store trail (skip during snapshot loading for perf)
      if (!snapshotProcessing && data.lon !== undefined && data.lat !== undefined && !data.isAton) {
        if (!merged.trail) merged.trail = [];
        if (!merged.trailTs) merged.trailTs = 0;
        const last = merged.trail[merged.trail.length - 1];
        const now = Date.now();
        let dominated = false;
        if (last) {
          const dLon = Math.abs(data.lon - last[0]);
          const dLat = Math.abs(data.lat - last[1]);
          if (dLon > 0.5 || dLat > 0.5) { merged.trail = []; } // ~50km jump = reset
          else if (dLon < 0.0003 && dLat < 0.0003 && (now - merged.trailTs) < 10000) { dominated = true; } // <30m and <10s — skip
        }
        if (!dominated && (!last || last[0] !== data.lon || last[1] !== data.lat)) {
          merged.trail.push([data.lon, data.lat]);
          merged.trailTs = now;
          if (merged.trail.length > TRAIL_MAX) merged.trail.shift();
          trailsDirty.add(data.mmsi);
        }
      }

      // Coordinate quantization: only mark dirty if pixel-equivalent position changed
      if (snapshotProcessing) {
        // Skip per-vessel dirty tracking during snapshot — bulk rebuild at end
      } else {
        const Q = 0.0005;
        const isNew = !featureCache.has(data.mmsi);
        const posChanged = data.lon !== undefined;
        const staticChanged = data.name !== undefined || data.shiptype !== undefined;
        if (isNew || posChanged || staticChanged) {
          dirtySet.add(data.mmsi);
        }
      }
      // Mark for IDB save if static data arrived
      if (data.name !== undefined || data.shiptype !== undefined || data.callsign !== undefined) {
        staticDirty.add(data.mmsi);
      }
    }

    function pruneStale() {
      const now = Date.now();
      for (const [mmsi, v] of vessels) {
        if (now - v.ts > STALE_MS) {
          if (v.lon !== undefined) gridRemove(mmsi, v.lon, v.lat);
          vessels.delete(mmsi);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WEBSOCKET CLIENT
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // INDEXEDDB CACHE — persist static data + trails across reloads
    // ═══════════════════════════════════════════════════════════════
    let idb = null;
    const IDB_NAME = 'aiscope', IDB_VER = 2;
    const TRAIL_IDB_MAX = 200; // max trail points stored per vessel
    const TRAIL_MAX_AGE = 86400000; // 24h — purge older trails on load

    function openIDB() {
      return new Promise((resolve) => {
        const req = indexedDB.open(IDB_NAME, IDB_VER);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('static')) db.createObjectStore('static', { keyPath: 'mmsi' });
          if (!db.objectStoreNames.contains('trails')) db.createObjectStore('trails', { keyPath: 'mmsi' });
        };
        req.onsuccess = (e) => { idb = e.target.result; resolve(); };
        req.onerror = () => resolve();
      });
    }

    function loadCachedStatic() {
      if (!idb) return;
      const tx = idb.transaction('static', 'readonly');
      tx.objectStore('static').getAll().onsuccess = (e) => {
        for (const row of e.target.result) {
          const existing = vessels.get(row.mmsi) || {};
          if (row.isAton) {
            // Restore AtoN with position (they never move)
            if (!existing.isAton) {
              existing.isAton = true; existing.atonType = row.atonType;
              existing.lon = row.lon; existing.lat = row.lat;
              existing.name = row.name; existing.ts = row.ts || Date.now();
              vessels.set(row.mmsi, existing);
              dirtySet.add(row.mmsi);
            }
          } else {
            if (!existing.name && row.name) existing.name = row.name;
            if (existing.shiptype === undefined && row.shiptype !== undefined) existing.shiptype = row.shiptype;
            if (!existing.callsign && row.callsign) existing.callsign = row.callsign;
            if (!existing.imo && row.imo) existing.imo = row.imo;
            if (!existing.destination && row.destination) existing.destination = row.destination;
            if (Object.keys(existing).length > 0) vessels.set(row.mmsi, existing);
          }
        }
      };
    }

    function loadCachedTrails() {
      if (!idb) return;
      const now = Date.now();
      const tx = idb.transaction('trails', 'readonly');
      tx.objectStore('trails').getAll().onsuccess = (e) => {
        for (const row of e.target.result) {
          if (now - row.ts > TRAIL_MAX_AGE) continue; // skip stale
          const existing = vessels.get(row.mmsi) || {};
          if (!existing.trail || existing.trail.length === 0) {
            existing.trail = row.trail;
            vessels.set(row.mmsi, existing);
          }
        }
      };
    }

    // Batch save dirty static data every 30s
    let staticDirty = new Set();
    function saveStaticBatch() {
      if (!idb || staticDirty.size === 0) return;
      const tx = idb.transaction('static', 'readwrite');
      const store = tx.objectStore('static');
      for (const mmsi of staticDirty) {
        const v = vessels.get(mmsi);
        if (v && v.isAton) {
          store.put({ mmsi, name: v.name, isAton: true, atonType: v.atonType, lon: v.lon, lat: v.lat, ts: v.ts });
        } else if (v && (v.name || v.shiptype !== undefined)) {
          store.put({ mmsi, name: v.name, shiptype: v.shiptype, callsign: v.callsign, imo: v.imo, destination: v.destination, ts: v.ts });
        }
      }
      staticDirty.clear();
    }

    // Batch save trails every 60s
    let trailsDirty = new Set();
    function saveTrailsBatch() {
      if (!idb || trailsDirty.size === 0) return;
      const tx = idb.transaction('trails', 'readwrite');
      const store = tx.objectStore('trails');
      for (const mmsi of trailsDirty) {
        const v = vessels.get(mmsi);
        if (v && v.trail && v.trail.length > 1) {
          // Store up to TRAIL_IDB_MAX points
          const trail = v.trail.length > TRAIL_IDB_MAX ? v.trail.slice(-TRAIL_IDB_MAX) : v.trail;
          store.put({ mmsi, trail, ts: Date.now() });
        }
      }
      trailsDirty.clear();
    }

    // ═══════════════════════════════════════════════════════════════
    // WEBSOCKET CLIENT
    // ═══════════════════════════════════════════════════════════════
    let ws = null;
    let msgCount = 0;
    let lastMsgCount = 0;
    let wsStatus = 'connecting';
    let wsRetries = 0;
    let wsBackoff = 1000;

    function getWsUrl() {
      if (urlParams.get('ws')) return urlParams.get('ws');
      return 'wss://stream.hpradar.com/ws1?mode=binary';
    }

    function showWsBanner(msg) {
      let b = document.getElementById('ws-banner');
      if (!b) { b = document.createElement('div'); b.id = 'ws-banner'; document.body.appendChild(b); }
      b.textContent = msg; b.classList.add('show');
    }
    function hideWsBanner() { const b = document.getElementById('ws-banner'); if (b) b.classList.remove('show'); }

    function connectWs() {
      const url = getWsUrl();
      try { ws = new WebSocket(url); } catch (e) { wsStatus = 'err'; updateDot(); scheduleReconnect(); return; }
      ws.binaryType = 'arraybuffer';
      wsStatus = 'connecting';
      showWsBanner('Connecting…');
      ws.onopen = () => { wsStatus = 'ok'; wsRetries = 0; wsBackoff = 1000; updateDot(); hideWsBanner(); hideSkeleton(); };
      ws.onmessage = onBinaryMsg;
      ws.onerror = () => { wsStatus = 'err'; updateDot(); };
      ws.onclose = () => { wsStatus = 'err'; updateDot(); scheduleReconnect(); };
    }

    function scheduleReconnect() {
      wsRetries++;
      wsBackoff = Math.min(wsBackoff * 1.5, 30000);
      showWsBanner(`Reconnecting in ${Math.round(wsBackoff/1000)}s… (attempt ${wsRetries})`);
      setTimeout(connectWs, wsBackoff);
    }

    function hideSkeleton() {
      const sk = document.getElementById('loading-skeleton');
      if (sk && !sk.classList.contains('hidden')) { sk.classList.add('hidden'); setTimeout(() => sk.remove(), 500); }
    }

    // Binary frame parser (zero NMEA decode — frames are pre-parsed by server)
    function onBinaryMsg(ev) {
      if (paused) return;
      snapshotQueue.push(ev.data);
      if (!snapshotProcessing) drainSnapshot();
    }

    const snapshotQueue = [];
    let snapshotProcessing = false;
    let sqOff = 0; // offset within current buffer

    function drainSnapshot() {
      snapshotProcessing = true;
      sqOff = 0;
      requestAnimationFrame(processTick);
    }

    function processTick() {
      const deadline = performance.now() + 8; // 8ms budget per frame
      while (snapshotQueue.length && performance.now() < deadline) {
        const buf = snapshotQueue[0];
        sqOff = parseBinaryChunk(buf, sqOff, 200);
        if (sqOff >= buf.byteLength) {
          snapshotQueue.shift();
          sqOff = 0;
        }
      }
      if (snapshotQueue.length) {
        requestAnimationFrame(processTick);
      } else {
        snapshotProcessing = false;
        // Force full feature rebuild after snapshot
        lastFilterText = null; // triggers filterChanged path in renderVessels
        scheduleRender();
      }
    }

    // Parse up to maxFrames frames starting at 'start'. Returns new offset.
    function parseBinaryChunk(buf, start, maxFrames) {
      const view = new DataView(buf);
      let off = start, count = 0;
      while (off < buf.byteLength && count < maxFrames) {
        const ft = view.getUint8(off);
        if (ft === 0x01 && off + 19 <= buf.byteLength) {
          const mmsi = view.getUint32(off + 1, true);
          const lonRaw = view.getInt32(off + 5, true);
          const latRaw = view.getInt32(off + 9, true);
          const sog = view.getUint16(off + 13, true) / 10;
          const cog = view.getUint16(off + 15, true) / 10;
          const hdg = view.getUint16(off + 17, true);
          updateVessel({ mmsi, lon: lonRaw / 600000, lat: latRaw / 600000, sog, cog, hdg: hdg < 511 ? hdg : undefined });
          off += 19;
        } else if (ft === 0x05 && off + 44 <= buf.byteLength) {
          const mmsi = view.getUint32(off + 1, true);
          const shiptype = view.getUint8(off + 5);
          const name = decodeFixedStr(buf, off + 6, 20);
          const callsign = decodeFixedStr(buf, off + 26, 7);
          const imo = view.getUint32(off + 33, true);
          const bow = view.getUint16(off + 37, true);
          const stern = view.getUint16(off + 39, true);
          const to_port = view.getUint8(off + 41);
          const to_starboard = view.getUint8(off + 42);
          const data = { mmsi };
          if (shiptype) data.shiptype = shiptype;
          if (name) data.name = name;
          if (callsign) data.callsign = callsign;
          if (imo) data.imo = imo;
          if (bow) { data.to_bow = bow; data.to_stern = stern; data.to_port = to_port; data.to_starboard = to_starboard; }
          updateVessel(data);
          off += 44;
        } else if (ft === 0x15 && off + 34 <= buf.byteLength) {
          const mmsi = view.getUint32(off + 1, true);
          const atonType = view.getUint8(off + 5);
          const lon = view.getInt32(off + 6, true) / 600000;
          const lat = view.getInt32(off + 10, true) / 600000;
          const name = decodeFixedStr(buf, off + 14, 20);
          updateVessel({ mmsi, atonType, name, lon, lat, isAton: true });
          off += 34;
        } else if (ft === 0x08 && off + 12 <= buf.byteLength) {
          const mmsi = view.getUint32(off + 1, true);
          const dac = view.getUint16(off + 5, true);
          const fid = view.getUint8(off + 7);
          const dataLen = view.getUint16(off + 8, true);
          const subtype = view.getUint8(off + 10);
          if (off + 12 + dataLen > buf.byteLength) break;
          handleBinaryFrame(mmsi, dac, fid, subtype, new DataView(buf, off + 12, dataLen));
          off += 12 + dataLen;
        } else {
          off = buf.byteLength; break;
        }
        msgCount++; count++;
      }
      return off;
    }

    const textDec = new TextDecoder();
    function decodeFixedStr(buf, off, len) {
      const slice = new Uint8Array(buf, off, len);
      let end = len;
      while (end > 0 && slice[end - 1] === 0) end--;
      if (end === 0) return '';
      return textDec.decode(slice.subarray(0, end));
    }

    // RAF-batched message processing
    let paused = false;
    let renderTimer = 0, trailTimer = 0;
    function scheduleRender() {
      if (!renderTimer && !paused) renderTimer = setTimeout(() => { renderTimer = 0; renderVessels(); }, 250);
    }
    function scheduleTrails() {
      if (!trailTimer && !paused) trailTimer = setTimeout(() => { trailTimer = 0; renderTrails(); }, 2000);
    }

    // ═══════════════════════════════════════════════════════════════

    function reconnect() {
      if (ws) { ws.onclose = null; ws.close(); }
      connectWs();
    }

    function updateDot() {
      const dot = document.getElementById('sDot');
      dot.className = 'dot ' + wsStatus;
    }

    // ═══════════════════════════════════════════════════════════════
    // MAP
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // MAP STYLES (from hpradar-meteo)
    // ═══════════════════════════════════════════════════════════════
    const MAP_STYLES = {
      'Light': 'mapstyles/light-minimal.json',
      'Dark': 'mapstyles/dark-minimal.json',
      'Light (MapTiler)': 'https://api.maptiler.com/maps/019e782a-93e8-7354-92cb-60df18c76624/style.json?key=nRYox0R1ZyZ6XqSStq4S',
      'Positron': 'https://tiles.openfreemap.org/styles/positron',
      'Liberty': 'https://tiles.openfreemap.org/styles/liberty',
      'Bright': 'https://tiles.openfreemap.org/styles/bright',
      'ESRI Satellite': { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri' },
      'ESRI Ocean': { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri' },
      'CartoDB Dark': { url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png', attribution: '© CartoDB © OSM' },
    };
    let curStyle = localStorage.getItem('aiscopeStyle') || 'Light';

    function getMapStyle(name) {
      const s = MAP_STYLES[name];
      if (typeof s === 'string') return s;
      return {
        version: 8,
        sources: { base: { type: 'raster', tiles: [s.url], tileSize: 256, attribution: s.attribution } },
        layers: [{ id: 'base', type: 'raster', source: 'base' }]
      };
    }

    // Deep-link: ?z=&lat=&lon=&mmsi=
    const initZoom = parseFloat(urlParams.get('z')) || 4;
    const initLat = parseFloat(urlParams.get('lat')) || 20.8;
    const initLon = parseFloat(urlParams.get('lon')) || 106.7;
    const initMmsi = parseInt(urlParams.get('mmsi')) || null;

    const map = new maplibregl.Map({
      container: 'map',
      style: getMapStyle(curStyle),
      center: [initLon, initLat],
      zoom: initZoom,
      attributionControl: false,
      transformStyle: (prev, next) => { if(next) next.glyphs = 'https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=nRYox0R1ZyZ6XqSStq4S'; return next; }
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');
    map.addControl(new maplibregl.GlobeControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('style.load', () => { map.setProjection({ type: 'globe' }); });

    // Update URL on map move (debounced)
    let urlTimer = 0, selectedMmsi = initMmsi, followMode = false;

    function updateSelected() {
      const src = map.getSource('selected');
      if (!src) return;
      if (!selectedMmsi) { src.setData({ type: 'FeatureCollection', features: [] }); return; }
      const v = vessels.get(selectedMmsi);
      if (!v || v.lon === undefined) { src.setData({ type: 'FeatureCollection', features: [] }); return; }
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] }, properties: {} }] });
      if (followMode) map.easeTo({ center: [v.lon, v.lat], duration: 500 });
    }
    function updateUrl() {
      const c = map.getCenter(), z = map.getZoom().toFixed(1);
      const p = new URLSearchParams();
      p.set('z', z); p.set('lat', c.lat.toFixed(4)); p.set('lon', c.lng.toFixed(4));
      if (selectedMmsi) p.set('mmsi', selectedMmsi);
      if (urlParams.get('mode')) p.set('mode', urlParams.get('mode'));
      if (urlParams.get('ws')) p.set('ws', urlParams.get('ws'));
      history.replaceState(null, '', '?' + p.toString());
    }
    map.on('moveend', () => { clearTimeout(urlTimer); urlTimer = setTimeout(updateUrl, 500); });

    // Coordinate + zoom display (bottom-left)
    const coordEl = document.createElement('div');
    coordEl.id = 'coord-display';
    coordEl.style.cssText = 'position:absolute;bottom:8px;left:8px;background:rgba(8,17,31,.8);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:4px 10px;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#93a4bd;pointer-events:none;z-index:2;backdrop-filter:blur(4px)';
    document.getElementById('map').appendChild(coordEl);
    function updateCoord(lng, lat) {
      const z = map.getZoom().toFixed(1);
      const ns = lat >= 0 ? 'N' : 'S';
      const ew = lng >= 0 ? 'E' : 'W';
      coordEl.textContent = `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lng).toFixed(4)}°${ew}  Z${z}`;
    }
    map.on('mousemove', e => updateCoord(e.lngLat.lng, e.lngLat.lat));
    map.on('move', () => { const c = map.getCenter(); updateCoord(c.lng, c.lat); });


    // Populate style selector
    function buildMapMenu() {
      document.getElementById('mapPop').innerHTML = Object.keys(MAP_STYLES).map(k =>
        `<button class="pop-item${k === curStyle ? ' active' : ''}" onclick="switchStyle('${k}')">${k}</button>`).join('');
    }
    buildMapMenu();

    function switchStyle(name) {
      curStyle = name;
      localStorage.setItem('aiscopeStyle', name);
      map.setStyle(getMapStyle(name));
      buildMapMenu();
      map.once('style.load', () => { addVesselLayers(); addStationLayers(); if (weatherOn) loadWeatherFrame(); });
    }

    function addVesselLayers() {
      map.addSource('vessels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addSource('trails', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addSource('vectors', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addSource('hulls', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
      map.addSource('antennas', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      // Trail lines
      map.addLayer({
        id: 'trails-line', type: 'line', source: 'trails', minzoom: 8,
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.5 }
      });

      // Speed vectors
      map.addLayer({
        id: 'vectors-line', type: 'line', source: 'vectors', minzoom: 9,
        paint: { 'line-color': '#00e5ff', 'line-width': 1.5, 'line-opacity': 0.7, 'line-dasharray': [2, 2] }
      });

      // Hull outlines (real ship dimensions at high zoom)
      map.addLayer({
        id: 'hulls-fill', type: 'fill', source: 'hulls', minzoom: 12,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.3 }
      });
      map.addLayer({
        id: 'hulls-outline', type: 'line', source: 'hulls', minzoom: 12,
        paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.3, 15, 1, 18, 2], 'line-opacity': 0.8 }
      });
      // GPS antenna circle
      // GPS antenna dot (green blip)
      map.addLayer({
        id: 'antennas-pulse', type: 'circle', source: 'antennas', minzoom: 12,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 3, 15, 6, 18, 10], 'circle-color': '#41d392', 'circle-opacity': 0, 'circle-stroke-width': 0 }
      });
      map.addLayer({
        id: 'antennas-circle', type: 'circle', source: 'antennas', minzoom: 12,
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 15, 3.5, 18, 5], 'circle-color': '#41d392', 'circle-stroke-color': '#0a2a1a', 'circle-stroke-width': 1 }
      });

      // Vessel names at high zoom (hull view — for vessels with dimensions)

      // Dots at low zoom
      map.addLayer({
        id: 'vessels-circle', type: 'circle', source: 'vessels', maxzoom: 5,
        paint: {
          // z0-4 density dots, z5+ icons
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 1.3, 4.99, 2.5],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['match', ['get', 'trust'], 'live', 0.9, 'aging', 0.6, 'stale', 0.35, 0.9],
          'circle-stroke-width': 0.5,
          'circle-stroke-color': ['get', 'color']
        }
      });

      // Ship icons — from z5+
      map.addLayer({
        id: 'vessels-symbol', type: 'symbol', source: 'vessels', minzoom: 5,
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 9, 0.45, 12, 0.5, 16, 0.6],
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-optional': true,
          'text-field': ['step', ['zoom'], '', 12, ['get', 'label']],
          'text-font': ['Noto Sans Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
          'text-offset': [0, 1.8],
          'text-anchor': 'top',
          'text-allow-overlap': ['step', ['zoom'], false, 16, true]
        },
        paint: {
          'text-color': labelColors().text,
          'text-halo-color': labelColors().halo,
          'text-halo-width': 1.6,
          'icon-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 1, 15, 0],
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 1, 15, 0]
        }
      });

      // Selected vessel highlight ring
      map.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'selected-ring', type: 'circle', source: 'selected',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 8, 12, 16, 16, 24],
          'circle-color': 'transparent', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#00e5ff' }
      });

      loadShipIcons();
    }

    // Ship type → icon file mapping
    const ICON_MAP = {
      cargo: 'cargo_vessel', tanker: 'tanker', passenger: 'passenger',
      fishing: 'fishing_vessel', tug: 'tug', sailing: 'sailing_vessel',
      pilot: 'pilot_vessel', hsc: 'high_speed_craft', pleasure: 'pleasure_craft',
      sar: 'search_and_rescue', law: 'law_enforcement', medical: 'medical_transport',
      military: 'military', dive: 'dive_vessel', dredging: 'dredging_or_underwater_ops',
      unknown: 'other_vessel_type'
    };

    // Load an SVG, rasterize at SS× its native size for crisp scaling, add with pixelRatio.
    // MapLibre stores bitmaps for icons; super-sampling keeps them sharp when scaled up.
    const ICON_SS = 4;
    function addSvgIcon(name, file) {
      if (map.hasImage(name)) return;
      const img = new Image();
      img.onload = () => {
        if (map.hasImage(name)) return;
        const w = (img.naturalWidth || 20) * ICON_SS;
        const h = (img.naturalHeight || 20) * ICON_SS;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try {
          map.addImage(name, ctx.getImageData(0, 0, w, h), { pixelRatio: ICON_SS });
        } catch (e) { /* image may have been added by a concurrent load */ }
      };
      img.src = 'icons/' + file + '.svg';
    }

    function loadShipIcons() {
      Object.entries(ICON_MAP).forEach(([key, file]) => addSvgIcon('icon-' + key, file));
      Object.entries(ATON_ICON_MAP).forEach(([key, file]) => addSvgIcon('aton-' + key, file));
    }

    // AtoN type (5 bits) → icon file
    const ATON_ICON_MAP = {
      0: 'default_type_of_aton_not_specified',
      1: 'reference_point', 2: 'racon', 3: 'fixed_structures_off_shore_such_as_oil_platforms_wind_farms_note_1_this_code_should_identify_an_obstruction_that_is_fitted_with_an_aton_ais_station',
      4: 'light', 5: 'light', 6: 'light', 7: 'light',
      8: 'light_vessellanbyrigs', 9: 'light_vessellanbyrigs', 10: 'light_vessellanbyrigs',
      11: 'light_vessellanbyrigs', 12: 'light_vessellanbyrigs',
      13: 'beacon_cardinal_n', 14: 'beacon_cardinal_e', 15: 'beacon_cardinal_s', 16: 'beacon_cardinal_w',
      17: 'beacon_port_hand', 18: 'beacon_starboard_hand',
      19: 'beacon_isolated_danger', 20: 'beacon_safe_water', 21: 'beacon_special_mark',
      22: 'light', 23: 'light',
      24: 'cardinal_mark_n', 25: 'cardinal_mark_e', 26: 'beacon_cardinal_s', 27: 'cardinal_mark_w',
      28: 'port_hand_mark', 29: 'starboard_hand_lateral_mark_buoy',
      30: 'isolated_danger', 31: 'safe_water',
    };

    function atonIcon(atonType) {
      return 'aton-' + (ATON_ICON_MAP[atonType] !== undefined ? atonType : 0);
    }

    // ═══════════════════════════════════════════════════════════════
    // RENDERER — GeoJSON source updated on timer
    // ═══════════════════════════════════════════════════════════════
    map.on('load', () => {
      addVesselLayers();
      addStationLayers();

      // Click handler
      map.on('click', 'vessels-circle', onVesselClick);
      map.on('click', 'vessels-symbol', onVesselClick);
      map.on('click', 'antennas-circle', onVesselClick);
      map.on('mouseenter', 'vessels-circle', (e) => { map.getCanvas().style.cursor = 'pointer'; showPopup(e); });
      map.on('mouseleave', 'vessels-circle', () => { map.getCanvas().style.cursor = ''; hidePopup(); });
      map.on('mouseenter', 'vessels-symbol', (e) => { map.getCanvas().style.cursor = 'pointer'; showPopup(e); });
      map.on('mouseleave', 'vessels-symbol', () => { map.getCanvas().style.cursor = ''; hidePopup(); });
      map.on('mouseenter', 'antennas-circle', (e) => { map.getCanvas().style.cursor = 'pointer'; showPopup(e); });
      map.on('mouseleave', 'antennas-circle', () => { map.getCanvas().style.cursor = ''; hidePopup(); });

      // Green blip animation on antenna pulse layer
      let blipPhase = 0;
      function animateBlip() {
        blipPhase = (blipPhase + 0.02) % 1;
        const r = 1 + blipPhase * 8;
        const opacity = 0.6 * (1 - blipPhase);
        map.setPaintProperty('antennas-pulse', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 12, r, 15, r * 1.5, 18, r * 2.5]);
        map.setPaintProperty('antennas-pulse', 'circle-opacity', opacity);
        requestAnimationFrame(animateBlip);
      }
      animateBlip();

      // ── Event-driven render ──
      document.addEventListener('visibilitychange', () => {
        paused = document.hidden;
        if (!paused && dirtySet.size) scheduleRender();
      });

      map.on('moveend', () => { if (!paused) { renderTrails(); renderVesselList(); } });

      // Stats/prune/save on intervals (but skip when hidden)
      setInterval(() => { if (!paused) updateStats(); }, 1000);
      setInterval(() => { if (!paused) pruneStale(); }, 30000);
      setInterval(saveStaticBatch, 30000);
      setInterval(saveTrailsBatch, 60000);
      setInterval(autoSaveBin, 600000);

      // Enrichment API — resolve unknowns from TSDB (skip in binary mode — server enriches)
      const enrichCache = new Set();
      let enrichBusy = false;
      openIDB().then(() => {
        return loadBinFromIDB();
      }).finally(connectWs);

      // Open vessel from ?mmsi= once data arrives
      if (initMmsi) {
        const mmsiCheck = setInterval(() => {
          const v = vessels.get(initMmsi);
          if (v && v.lon !== undefined) {
            clearInterval(mmsiCheck);
            map.flyTo({ center: [v.lon, v.lat], zoom: Math.max(map.getZoom(), 10) });
            showPanel(initMmsi, v);
          }
        }, 1000);
        setTimeout(() => clearInterval(mmsiCheck), 30000); // give up after 30s
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // FILTER
    // ═══════════════════════════════════════════════════════════════
    let filterText = '', filterCats = new Set();
    const CHIP_DEFS = [
      ['cargo', 'Cargo'], ['tanker', 'Tanker'], ['passenger', 'Passenger'], ['fishing', 'Fishing'],
      ['tug', 'Tug'], ['sailing', 'Sailing'], ['hsc', 'HSC'], ['pilot', 'Pilot'],
      ['sar', 'SAR'], ['aton', 'AtoN'], ['unknown', 'Unknown'],
    ];
    function renderChips() {
      const box = document.getElementById('chips');
      const counts = {};
      for (const [mmsi, v] of vessels) {
        const cat = v.isAton ? 'aton' : shipCategory(v.shiptype, mmsi);
        counts[cat] = (counts[cat] || 0) + 1;
      }
      // Only rebuild DOM if chips don't exist yet
      if (!box.children.length) {
        box.innerHTML = '';
        CHIP_DEFS.forEach(([cat, label]) => {
          const b = document.createElement('button');
          b.className = 'chip' + (filterCats.has(cat) ? ' on' : '');
          b.title = label;
          b.dataset.cat = cat;
          const iconFile = cat === 'aton' ? 'default_type_of_aton_not_specified' : (ICON_MAP[cat] || ICON_MAP.unknown);
          b.innerHTML = `<img class="chip-ico${cat === 'aton' ? ' aton' : ''}" src="icons/${iconFile}.svg" alt=""><b>0</b>`;
          const c = TYPE_COLORS[cat] || (cat === 'aton' ? '#e879f9' : TYPE_COLORS.unknown);
          b.style.setProperty('--chip-c', c);
          b.onclick = () => { filterCats.has(cat) ? filterCats.delete(cat) : filterCats.add(cat); renderChips(); applyFilter(); updateFilterBadge(); scheduleRender(); };
          box.appendChild(b);
        });
      }
      // Update counts only (no DOM rebuild)
      for (const b of box.children) {
        const cat = b.dataset.cat;
        const n = counts[cat] || 0;
        const bEl = b.querySelector('b');
        if (bEl && bEl.textContent !== n.toLocaleString('en-US')) bEl.textContent = n.toLocaleString('en-US');
        b.classList.toggle('on', filterCats.has(cat));
      }
    }
    function applyFilter() {
      filterText = document.getElementById('searchInput').value.toLowerCase();
    }

    let searchIdx = -1;
    function onSearchInput() {
      applyFilter();
      const q = filterText;
      const box = document.getElementById('searchResults');
      if (!q || q.length < 2) { box.style.display = 'none'; return; }
      const results = [];
      for (const [mmsi, v] of vessels) {
        if (v.lon === undefined || v.lat === undefined) continue;
        const hay = ((v.name||'')+(v.callsign||'')+(v.destination||'')+(v.flagCountry||'')+mmsi+(v.imo||'')).toLowerCase();
        if (hay.includes(q)) results.push([mmsi, v]);
        if (results.length >= 10) break;
      }
      if (!results.length) { box.innerHTML = `<div class="vlist-empty" style="padding:10px">No matches for ${esc(q)}</div>`; box.style.display = 'block'; return; }
      searchIdx = -1;
      box.innerHTML = results.map(([mmsi, v], i) => {
        const cat = shipCategory(v.shiptype, mmsi);
        return `<div class="search-item" data-i="${i}" onmousedown="flyToVessel(${mmsi})" style="padding:6px 10px;cursor:pointer;font-size:11px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between"><span>${esc(v.name || ("MMSI " + mmsi))}</span><span style="color:var(--text3)">${cat}</span></div>`;
      }).join('');
      box.style.display = 'block';
    }
    function onSearchKey(e) {
      const box = document.getElementById('searchResults');
      const items = box.querySelectorAll('.search-item');
      if (e.key === 'ArrowDown') { searchIdx = Math.min(searchIdx + 1, items.length - 1); highlightItem(items); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { searchIdx = Math.max(searchIdx - 1, 0); highlightItem(items); e.preventDefault(); }
      else if (e.key === 'Enter' && searchIdx >= 0 && items[searchIdx]) { items[searchIdx].onmousedown(); hideSearchResults(); }
      else if (e.key === 'Escape') { hideSearchResults(); }
    }
    function highlightItem(items) { items.forEach((el, i) => el.style.background = i === searchIdx ? 'var(--surface-3)' : ''); }
    function hideSearchResults() { document.getElementById('searchResults').style.display = 'none'; }
    function flyToVessel(mmsi) {
      const v = vessels.get(mmsi);
      if (!v || v.lon === undefined || v.lat === undefined) return;
      selectedMmsi = mmsi;
      map.flyTo({ center: [v.lon, v.lat], zoom: Math.max(map.getZoom(), 12) });
      showPanel(mmsi, v);
      updateUrl();
      hideSearchResults();
      renderVesselList();
    }

    // ── Right smart vessel list ──
    let listTab = 'visible', unknownExpanded = false;
    function toggleVList() {
      const vl = document.getElementById('vlist');
      vl.classList.toggle('open');
      document.getElementById('railListBtn').classList.toggle('on', vl.classList.contains('open'));
      document.documentElement.classList.toggle('vlist-open', vl.classList.contains('open'));
      if (vl.classList.contains('open')) {
        if (window.innerWidth <= 600) { document.getElementById('vcard').classList.remove('open'); }
        lastVlistRender = 0; renderVesselList();
      }
    }
    function setListTab(t) {
      listTab = t; unknownExpanded = false;
      document.querySelectorAll('#vlistTabs .vtab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
      lastVlistRender = 0; renderVesselList();
    }
    function vrowHtml(mmsi, v) {
      const st = ageState(v.ts);
      const cat = v.isAton ? 'aton' : shipCategory(v.shiptype, mmsi);
      const name = v.name || (v.isAton ? 'AtoN ' + mmsi : 'MMSI ' + mmsi);
      const typeTxt = v.isAton ? 'AtoN' : (v.classDesc || cat.charAt(0).toUpperCase() + cat.slice(1));
      const spd = (!v.isAton && v.sog !== undefined) ? ' · ' + fmtSpeed(v.sog) : '';
      const sel = mmsi === selectedMmsi ? ' sel' : '';
      return `<div class="vrow${sel}" onclick="flyToVessel(${mmsi})">`
        + `<span class="vdot ${st}"></span>`
        + `<span class="vflag">${flagHtml(mmsi)}</span>`
        + `<div class="vmain"><div class="vname">${esc(name)}</div>`
        + `<div class="vmeta">${esc(typeTxt)}${esc(spd)} · ${fmtAge(v.ts)}</div></div></div>`;
    }
    let lastVlistRender = 0;
    function renderVesselList() {
      const panel = document.getElementById('vlist');
      if (!panel.classList.contains('open')) return;
      const now = Date.now();
      if (now - lastVlistRender < 3000) return; // throttle: max once per 3s
      lastVlistRender = now;
      const rowsEl = document.getElementById('vlistRows');
      const bounds = map.getBounds();
      const inView = new Set(gridQuery(bounds));

      // collect candidates per tab
      let items = [];
      for (const [mmsi, v] of vessels) {
        if (v.lon === undefined) continue;
        const st = ageState(v.ts);
        const moving = !v.isAton && v.sog !== undefined && v.sog > 0.5;
        if (listTab === 'visible' && !inView.has(mmsi)) continue;
        if (listTab === 'moving' && !moving) continue;
        if (listTab === 'anchored' && (v.isAton || moving)) continue;
        if (listTab === 'aton' && !v.isAton) continue;
        if (listTab === 'stale' && st !== 'stale') continue;
        if (listTab !== 'stale' && st === 'hidden') continue;
        items.push([mmsi, v, st, moving]);
      }

      // default sort: selected → named moving → recent → named stationary → unknown → stale
      const rank = ([mmsi, v, st, moving]) => {
        if (mmsi === selectedMmsi) return 0;
        if (v.name && moving) return 1;
        if (st === 'stale') return 5;
        if (v.name) return 3;
        return 4; // unknown
      };
      items.sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        return b[1].ts - a[1].ts; // recent first within rank
      });

      // separate named vs unknown (unknown grouped, collapsed)
      const named = items.filter(it => it[1].name || it[1].isAton);
      const unknown = items.filter(it => !it[1].name && !it[1].isAton);

      const MAX = 200; // cap render for perf
      let html = '';
      if (!items.length) {
        html = vessels.size === 0
          ? `<div class="vlist-empty">Waiting for AIS traffic...</div>`
          : `<div class="vlist-empty">No vessels in this view.</div>`;
      } else {
        html = named.slice(0, MAX).map(it => vrowHtml(it[0], it[1])).join('');
        if (unknown.length) {
          html += `<div class="vgroup" onclick="unknownExpanded=!unknownExpanded;lastVlistRender=0;renderVesselList()"><span>Unknown vessels</span><span>${unknown.length} ${unknownExpanded ? '▴' : '▾'}</span></div>`;
          if (unknownExpanded) html += unknown.slice(0, MAX).map(it => vrowHtml(it[0], it[1])).join('');
        }
      }
      rowsEl.innerHTML = html;
    }
    function matchesFilter(mmsi, v) {
      const cat = v.isAton ? 'aton' : shipCategory(v.shiptype, mmsi);
      if (filterCats.size && !filterCats.has(cat)) return false;
      if (!filterText) return true;
      return String(mmsi).includes(filterText) || (v.name||'').toLowerCase().includes(filterText) || cat.includes(filterText) || (v.callsign||'').toLowerCase().includes(filterText) || (v.destination||'').toLowerCase().includes(filterText) || (v.flagCountry||'').toLowerCase().includes(filterText) || (v.imo ? String(v.imo).includes(filterText) : false);
    }
    function toggleSettings() { railToggle('settingsPop'); }
    // one-at-a-time popover system for rail
    let currentPop = null;
    function closeAllPopovers() {
      document.querySelectorAll('.rail-pop.open').forEach(p => p.classList.remove('open'));
      currentPop = null;
    }
    function railToggle(id) {
      const el = document.getElementById(id);
      if (currentPop === id) { closeAllPopovers(); return; }
      closeAllPopovers();
      el.classList.add('open');
      currentPop = id;
    }
    document.addEventListener('click', (e) => {
      if (currentPop && !e.target.closest('#rail')) closeAllPopovers();
    });
    // ── Phase 7: RainViewer rain radar overlay ──
    let weatherOn = false, weatherTimer = 0, weatherHost = '', weatherPath = '';
    async function loadWeatherFrame() {
      try {
        const r = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' });
        const j = await r.json();
        const past = j.radar && j.radar.past;
        if (!past || !past.length) return false;
        weatherHost = j.host;
        weatherPath = past[past.length - 1].path; // most recent frame
        // tile: {host}{path}/{size}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png  (color 2 = universal blue, smooth 1, snow 1)
        const tiles = [`${weatherHost}${weatherPath}/256/{z}/{x}/{y}/2/1_1.png`];
        if (map.getSource('rainviewer')) {
          map.getSource('rainviewer').setTiles(tiles);
        } else {
          map.addSource('rainviewer', { type: 'raster', tiles, tileSize: 256, maxzoom: 7, attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Weather data by Rain Viewer</a>' });
          // insert below vessels so ships stay on top
          const before = map.getLayer('vessels-circle') ? 'vessels-circle' : undefined;
          map.addLayer({ id: 'rainviewer-layer', type: 'raster', source: 'rainviewer', paint: { 'raster-opacity': 0.6 } }, before);
        }
        return true;
      } catch (e) { console.warn('RainViewer load failed', e); return false; }
    }
    async function toggleWeather() {
      const btn = document.getElementById('railWeatherBtn');
      if (weatherOn) {
        weatherOn = false;
        clearInterval(weatherTimer);
        if (map.getLayer('rainviewer-layer')) map.setLayoutProperty('rainviewer-layer', 'visibility', 'none');
        btn.classList.remove('on');
        flash('Rain radar off');
      } else {
        flash('Loading rain radar…');
        const ok = await loadWeatherFrame();
        if (!ok) { flash('Rain radar unavailable'); return; }
        if (map.getLayer('rainviewer-layer')) map.setLayoutProperty('rainviewer-layer', 'visibility', 'visible');
        weatherOn = true;
        btn.classList.add('on');
        weatherTimer = setInterval(loadWeatherFrame, 300000); // refresh every 5 min
        flash('Rain radar on');
      }
    }

    // ── ASEAN region presets ──
    const REGIONS = [
      { name: 'Global', center: [20, 10], zoom: 2 },
      { name: 'Vietnam', center: [107.5, 16.0], zoom: 5.4 },
      { name: 'Gulf of Tonkin', center: [107.8, 20.2], zoom: 7 },
      { name: 'Haiphong', center: [106.8, 20.78], zoom: 10.5 },
      { name: 'Vung Tau', center: [107.08, 10.34], zoom: 11 },
      { name: 'Singapore Strait', center: [103.8, 1.25], zoom: 10.5 },
      { name: 'South China Sea', center: [114, 14], zoom: 4.6 },
    ];
    function buildRegionMenu() {
      document.getElementById('regionPop').innerHTML = REGIONS.map((r, i) =>
        `<button class="pop-item" onclick="gotoRegion(${i})">${r.name}</button>`).join('');
    }
    function gotoRegion(i) {
      const r = REGIONS[i];
      map.flyTo({ center: r.center, zoom: r.zoom, speed: 1.4 });
      closeAllPopovers();
    }
    function buildSettingsMenu() {
      const speeds = [{v:'kn',l:'Knots'},{v:'kmh',l:'km/h'},{v:'mph',l:'mph'}];
      const dists = [{v:'m',l:'Meters'},{v:'ft',l:'Feet'}];
      document.getElementById('settingsPop').innerHTML =
        `<div style="font-size:var(--fs-xs);color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 10px">Speed</div>` +
        speeds.map(s => `<button class="pop-item${s.v===units.speed?' active':''}" onclick="setUnit('speed','${s.v}')">${s.l}</button>`).join('') +
        `<div style="font-size:var(--fs-xs);color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:8px 10px 2px;border-top:1px solid var(--border);margin-top:var(--s2)">Distance</div>` +
        dists.map(d => `<button class="pop-item${d.v===units.dist?' active':''}" onclick="setUnit('dist','${d.v}')">${d.l}</button>`).join('') +
        `<div style="border-top:1px solid var(--border);margin-top:var(--s2);padding-top:var(--s2)"><button class="pop-item${autoShowCard?' active':''}" onclick="toggleAutoCard()">Auto-show card</button></div>` +
        `<div style="border-top:1px solid var(--border);margin-top:var(--s2);padding-top:var(--s2)"></div>`;
    }
    function toggleAutoCard() { autoShowCard = !autoShowCard; localStorage.setItem('autoShowCard', autoShowCard); buildSettingsMenu(); }
    // setStatus removed — list tabs handle status filtering
    function selectAllTypes() {
      // Select every type chip as active = narrow to all known types
      filterCats = new Set(CHIP_DEFS.map(d => d[0]));
      renderChips(); applyFilter(); updateFilterBadge(); scheduleRender();
    }
    function clearTypes() {
      // Clear selection → no type filter (show all)
      filterCats.clear();
      renderChips(); applyFilter(); updateFilterBadge(); scheduleRender();
    }
    function updateFilterBadge() {} // badge removed — chips are visible in list header
    function toggleLayer(id, on) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    }
    function toggleLabels(on) {
      if (map.getLayer('vessels-symbol')) {
        map.setLayoutProperty('vessels-symbol', 'text-field', on ? ['step', ['zoom'], '', 11, ['get', 'label']] : '');
      }
    }
    renderChips();

    // ═══════════════════════════════════════════════════════════════
    // RENDER (optimized: cached features, split trails to 5s)
    // ═══════════════════════════════════════════════════════════════
    const featureCache = new Map(); // mmsi → Feature object (reused)
    let lastFilterText = '', lastFilterCat = '';

    function buildFeature(mmsi, v) {
      // Reuse existing feature object if available (mutate in-place)
      let f = featureCache.get(mmsi);
      const cat = v.isAton ? 'aton' : shipCategory(v.shiptype, mmsi);
      const color = v.isAton ? '#e879f9' : (TYPE_COLORS[cat] || TYPE_COLORS.unknown);
      const icon = v.isAton ? atonIcon(v.atonType) : 'icon-' + cat;
      const heading = v.isAton ? 0 : (v.hdg !== undefined && v.hdg < 360 ? v.hdg : (v.cog !== undefined && v.cog < 360 ? v.cog : 0));
      const hasDim = v.to_bow > 0 && v.to_stern > 0 && v.to_port > 0 && v.to_starboard > 0 ? 1 : 0;
      const trust = ageState(v.ts); // live | aging | stale | hidden
      if (f) {
        f.geometry.coordinates[0] = v.lon;
        f.geometry.coordinates[1] = v.lat;
        const p = f.properties;
        p.color = color; p.heading = heading; p.label = v.name || ''; p.icon = icon; p.cat = cat; p.hasDim = hasDim; p.trust = trust;
        return f;
      }
      return {
        type: 'Feature', geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
        properties: { mmsi, color, heading, label: v.name || '', icon, cat, hasDim, trust }
      };
    }

    // Persistent array ref to avoid Array.from() allocation each frame
    let featureArray = [];

    function renderVessels() {
      const catKey = [...filterCats].sort().join(',');
      const filterChanged = filterText !== lastFilterText || catKey !== lastFilterCat;
      lastFilterText = filterText; lastFilterCat = catKey;

      // Only rebuild dirty features (or all if filter changed)
      if (filterChanged) {
        featureCache.clear();
        for (const [mmsi, v] of vessels) {
          if (v.lon === undefined || v.lat === undefined) continue;
          if (!matchesFilter(mmsi, v)) continue;
          featureCache.set(mmsi, buildFeature(mmsi, v));
        }
      } else if (dirtySet.size > 0) {
        for (const mmsi of dirtySet) {
          const v = vessels.get(mmsi);
          if (!v || v.lon === undefined || v.lat === undefined || !matchesFilter(mmsi, v)) {
            featureCache.delete(mmsi);
          } else {
            featureCache.set(mmsi, buildFeature(mmsi, v));
          }
        }
      }
      dirtySet.clear();

      // Remove pruned vessels from cache
      for (const mmsi of featureCache.keys()) {
        if (!vessels.has(mmsi)) featureCache.delete(mmsi);
      }

      // Reuse array — rebuild only when size changes
      if (featureArray.length !== featureCache.size) featureArray = Array.from(featureCache.values());
      else { let i = 0; for (const f of featureCache.values()) featureArray[i++] = f; }

      const src = map.getSource('vessels');
      if (src) src.setData({ type: 'FeatureCollection', features: featureArray });
      if (selectedMmsi) updateSelected();
    }

    function renderTrails() {
      const bounds = map.getBounds();
      const visible = gridQuery(bounds);
      const trails = [], vectors = [];

      // Trail only for selected vessel
      if (selectedMmsi) {
        const v = vessels.get(selectedMmsi);
        if (v && v.trail && v.trail.length > 1) {
          const cat = shipCategory(v.shiptype, mmsi);
          const color = TYPE_COLORS[cat] || TYPE_COLORS.unknown;
          let seg = [v.trail[0]];
          for (let i = 1; i < v.trail.length; i++) {
            const p = v.trail[i], prev = v.trail[i-1];
            const dLon = Math.abs(p[0] - prev[0]), dLat = Math.abs(p[1] - prev[1]);
            if (dLon > 0.5 || dLat > 0.5) {
              if (seg.length > 1) trails.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: seg }, properties: { color } });
              seg = [];
            }
            seg.push(p);
          }
          if (seg.length > 1) trails.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: seg }, properties: { color } });
        }
      }

      // Vectors for all visible
      for (let i = 0; i < visible.length; i++) {
        const mmsi = visible[i];
        const v = vessels.get(mmsi);
        if (!v || v.lon === undefined || v.lat === undefined || v.isAton) continue;
        if (!matchesFilter(mmsi, v)) continue;
        if (v.sog > 0.5 && v.cog !== undefined && v.cog < 360) {
          const dist = v.sog * 1852 * (2 / 60), rad = v.cog * Math.PI / 180;
          const dLat = (dist * Math.cos(rad)) / 111320;
          const dLon = (dist * Math.sin(rad)) / (111320 * Math.cos(v.lat * Math.PI / 180));
          vectors.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[v.lon, v.lat], [v.lon + dLon, v.lat + dLat]] }, properties: {} });
        }
      }
      const ts = map.getSource('trails'); if (ts) ts.setData({ type: 'FeatureCollection', features: trails });
      const vc = map.getSource('vectors'); if (vc) vc.setData({ type: 'FeatureCollection', features: vectors });

      // Hull polygons (real dimensions, rendered only when larger than the icon)
      const zoom = map.getZoom();
      if (zoom >= 12) {
        const centerLat = map.getCenter().lat;
        const cosLat = Math.cos(centerLat * Math.PI / 180);
        const mLat = 1 / 111320, mLon = 1 / (111320 * cosLat);
        // meters-per-pixel at this zoom/lat → used to size-gate hulls
        const mPerPx = 156543.03 * cosLat / Math.pow(2, zoom);
        // Icon on-screen width (px) at this zoom — hull beam must exceed 1.5× this to render
        const iconWpx = iconSizeAtZoom(zoom) * 13.4;
        const hulls = [], antennas = [];
        const hullPresets = {
          cargo: [0.78, 0.82, 0.65], tanker: [0.76, 0.84, 0.76],
          tug: [0.68, 0.92, 0.90], fishing: [0.65, 0.78, 0.58],
          passenger: [0.84, 0.90, 0.72], hsc: [0.84, 0.90, 0.72]
        };
        const hullVis = gridQuery(bounds);
        for (let i = 0; i < hullVis.length; i++) {
          const mmsi = hullVis[i];
          const v = vessels.get(mmsi);
          if (!v || v.lon === undefined || v.isAton) continue;
          const A = v.to_bow, B = v.to_stern, C = v.to_port, D = v.to_starboard;
          if (!A || !B || !C || !D) continue;
          const L = A + B, W = C + D;
          // Dimension validation
          if (L < 5 || L > 500 || W < 2 || W > 100) continue;
          const ratio = L / W;
          if (ratio < 1.5 || ratio > 12) continue;
          // Size gate: render hull only when its beam exceeds 4px on screen
          if ((W / mPerPx) < 4) continue;
          if (!matchesFilter(mmsi, v)) continue;
          // Heading
          const hdgDeg = v.hdg !== undefined && v.hdg < 360 ? v.hdg : (v.cog !== undefined && v.cog < 360 && v.sog > 1 ? v.cog : undefined);
          if (hdgDeg === undefined) continue;
          const rad = hdgDeg * Math.PI / 180;
          const sin = Math.sin(rad), cos = Math.cos(rad);
          const pt = (x, y) => [v.lon + (x*cos + y*sin)*mLon, v.lat + (-x*sin + y*cos)*mLat];
          // Shape by type
          const cat = shipCategory(v.shiptype, mmsi);
          const p = hullPresets[cat] || hullPresets.cargo;
          // Center hull on ship's longitudinal axis (antenna offset from centerline)
          const halfW = (C + D) / 2;
          const cx = (D - C) / 2;
          // 7-point hull: pointed bow, parallel sides, tapered stern
          const coords = [[
            pt(cx, A), pt(cx + halfW, A * p[0]), pt(cx + halfW, -B * p[1]),
            pt(cx + halfW * p[2], -B), pt(cx - halfW * p[2], -B),
            pt(cx - halfW, -B * p[1]), pt(cx - halfW, A * p[0]), pt(cx, A)
          ]];
          const color = TYPE_COLORS[cat] || TYPE_COLORS.unknown;
          hulls.push({ type:'Feature', geometry:{type:'Polygon', coordinates:coords}, properties:{color} });
          // GPS antenna point
          antennas.push({ type:'Feature', geometry:{type:'Point', coordinates:[v.lon,v.lat]}, properties:{} });
        }
        const hs = map.getSource('hulls'); if (hs) hs.setData({ type:'FeatureCollection', features:hulls });
        const as = map.getSource('antennas'); if (as) as.setData({ type:'FeatureCollection', features:antennas });
      } else {
        const hs = map.getSource('hulls'); if (hs) hs.setData({ type:'FeatureCollection', features:[] });
        const as = map.getSource('antennas'); if (as) as.setData({ type:'FeatureCollection', features:[] });
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WEATHER STATIONS (binary message types 6/8, IMO236/289)
    // ═══════════════════════════════════════════════════════════════
    const stations = new Map(); // mmsi → {lon, lat, wspeed, wgust, wdir, temp, pressure, humidity, waveHeight, seaState, ts}
    const areaNotices = []; // [{lon, lat, notice, duration, ts}]

    function handleBinaryFrame(mmsi, dac, fid, subtype, dv) {
      if (subtype === 0x01 || subtype === 0x02) {
        // Met/Hydro — 24 bytes
        if (dv.byteLength < 24) return;
        const lonRaw = dv.getInt32(0, true);
        const latRaw = dv.getInt32(4, true);
        const lon = lonRaw / 1000 / 60;
        const lat = latRaw / 1000 / 60;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return;
        const wspeed = dv.getUint8(11);
        const wdir = dv.getUint16(13, true);
        const airtemp = dv.getInt16(15, true);
        const humidity = dv.getUint8(17);
        const pressure = dv.getUint16(18, true);
        const wlRaw = dv.getInt16(20, true);
        stations.set(mmsi, {
          lon, lat,
          day: dv.getUint8(8), hour: dv.getUint8(9), min: dv.getUint8(10),
          wspeed: wspeed < 127 ? Math.round(wspeed * 1.94384) : null,
          wgust: dv.getUint8(12) < 127 ? Math.round(dv.getUint8(12) * 1.94384) : null,
          wdir: wdir < 360 ? wdir : null,
          temp: airtemp > -1024 ? airtemp / 10 : null,
          humidity: humidity <= 100 ? humidity : null,
          pressure: pressure < 1311 ? pressure : null,
          waterLevel: wlRaw > 0 && wlRaw < 4001 ? (wlRaw - 1000) / 100 : null,
          waveHeight: dv.getUint8(22) < 251 ? dv.getUint8(22) / 10 : null,
          seaState: dv.getUint8(23) < 13 ? dv.getUint8(23) : null,
          ts: Date.now(), mmsi
        });
        renderStations();
      } else if (subtype === 0x03) {
        // Area Notice — 18 bytes
        if (dv.byteLength < 18) return;
        const notice = dv.getUint8(2);
        const lon = dv.getInt32(10, true) / 1000 / 60;
        const lat = dv.getInt32(14, true) / 1000 / 60;
        if (lon === 0 && lat === 0) return;
        areaNotices.push({ lon, lat, notice, mmsi, ts: Date.now() });
        if (areaNotices.length > 50) areaNotices.shift();
        renderAreaNotices();
      }
    }



    function renderStations() {
      const src = map.getSource('wx-stations');
      if (!src) return;
      const features = [];
      for (const [mmsi, s] of stations) {
        if (Date.now() - s.ts > 3600000) continue;
        const label = s.wspeed != null ? s.wspeed + 'kn' : s.waterLevel != null ? s.waterLevel.toFixed(1) + 'm' : '';
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
          properties: { mmsi, label }
        });
      }
      src.setData({ type: 'FeatureCollection', features });
      document.getElementById('sStations').textContent = features.length;
    }

    function renderAreaNotices() {
      const src = map.getSource('area-notices');
      if (!src) return;
      const features = [];
      const now = Date.now();
      for (const n of areaNotices) {
        if (now - n.ts > 3600000) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
          properties: { notice: n.notice, mmsi: n.mmsi }
        });
      }
      src.setData({ type: 'FeatureCollection', features });
    }

    function addStationLayers() {
      map.addSource('wx-stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('area-notices', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      // Area notice circles (orange, semi-transparent)
      map.addLayer({
        id: 'area-notice-circle', type: 'circle', source: 'area-notices',
        paint: { 'circle-radius': 12, 'circle-color': '#f59e0b', 'circle-opacity': 0.4, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#f59e0b' }
      });

      // Weather station markers (wind rose icon)
      map.addLayer({
        id: 'wx-station-symbol', type: 'symbol', source: 'wx-stations',
        layout: {
          'icon-image': 'wx-rose',
          'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 8, 0.5, 12, 0.7],
          'icon-allow-overlap': true,
          'text-field': ['get', 'label'],
          'text-size': 9, 'text-offset': [0, 1.4], 'text-anchor': 'top',
          'text-font': ['Noto Sans Medium']
        },
        paint: { 'text-color': '#00e5ff', 'text-halo-color': '#000', 'text-halo-width': 1 }
      });

      // Click handler for stations
      map.on('click', 'wx-station-symbol', e => {
        if (!e.features?.length) return;
        const mmsi = e.features[0].properties.mmsi;
        const s = stations.get(mmsi);
        if (!s) return;
        showStationPopup(s);
      });
      map.on('mouseenter', 'wx-station-symbol', e => {
        map.getCanvas().style.cursor = 'pointer';
        if (!e.features?.length) return;
        const mmsi = e.features[0].properties.mmsi;
        const s = stations.get(mmsi);
        if (!s) return;
        const label = s.wspeed != null ? `${s.wspeed}kn` : s.waterLevel != null ? `WL ${s.waterLevel.toFixed(1)}m` : '';
        const type = stationType(s);
        popup.setLngLat([s.lon, s.lat]).setHTML(
          `<div class="pop-title">${type}</div>` +
          (label ? `<div class="pop-row"><span class="v">${label}</span></div>` : '')
        ).addTo(map);
      });
      map.on('mouseleave', 'wx-station-symbol', () => { map.getCanvas().style.cursor = ''; popup.remove(); });

      // Register wind rose icon
      const roseImg = new Image();
      roseImg.onload = () => {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64;
        const ctx = c.getContext('2d'); ctx.drawImage(roseImg, 0, 0, 64, 64);
        if (!map.hasImage('wx-rose')) map.addImage('wx-rose', ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
      };
      // Inline wind rose SVG as data URL
      roseImg.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="%2300e5ff" stroke-width="2"><circle cx="32" cy="32" r="20" opacity="0.3" fill="%2300e5ff"/><circle cx="32" cy="32" r="20"/><path d="M32 12v8M32 44v8M12 32h8M44 32h8" stroke-width="2.5"/><path d="M18 18l6 6M40 40l6 6M18 46l6-6M40 24l6-6" stroke-width="1.5" opacity="0.6"/><circle cx="32" cy="32" r="3" fill="%2300e5ff"/></svg>');
    }

    function stationType(s) {
      const hasWind = s.wspeed != null;
      const hasHydro = s.waterLevel != null;
      if (hasWind && hasHydro) return 'Met-Hydro';
      if (hasWind) return 'Met Station';
      if (hasHydro) return 'Tide Gauge';
      return 'AIS Station';
    }

    function showStationPopup(s) {
      const type = stationType(s);
      const sections = [];

      // Wind section
      if (s.wspeed != null || s.wgust != null) {
        let wind = '';
        if (s.wspeed != null) wind += `<span class="wx-val">${s.wspeed}</span><span class="wx-unit">kn</span>`;
        if (s.wgust != null) wind += ` <span class="wx-dim">gust</span> <span class="wx-val">${s.wgust}</span><span class="wx-unit">kn</span>`;
        if (s.wdir != null) wind += ` <span class="wx-dim">from</span> <span class="wx-val">${s.wdir}°</span>`;
        sections.push(`<div class="wx-row">${wind}</div>`);
      }

      // Conditions
      const conds = [];
      if (s.temp != null) conds.push(`${s.temp.toFixed(1)}°C`);
      if (s.pressure != null) conds.push(`${s.pressure} hPa`);
      if (s.humidity != null) conds.push(`${s.humidity}%`);
      if (conds.length) sections.push(`<div class="wx-row wx-dim">${conds.join(' · ')}</div>`);

      // Sea state
      const sea = [];
      if (s.waveHeight != null) sea.push(`Waves ${s.waveHeight}m`);
      if (s.seaState != null) sea.push(`Bf ${s.seaState}`);
      if (sea.length) sections.push(`<div class="wx-row wx-dim">${sea.join(' · ')}</div>`);

      // Water level
      if (s.waterLevel != null) {
        sections.push(`<div class="wx-row"><span class="wx-val">${s.waterLevel.toFixed(2)}</span><span class="wx-unit">m</span> <span class="wx-dim">water level</span></div>`);
      }

      const time = s.hour != null ? `${String(s.hour).padStart(2,'0')}:${String(s.min).padStart(2,'0')} UTC` : fmtAge(s.ts);
      const html = `<div class="wx-popup">
        <div class="wx-head"><span class="wx-type">${type}</span><span class="wx-time">${time}</span></div>
        <div class="wx-mmsi">${s.country ? s.country+' · ' : ''}${s.mmsi}</div>
        ${sections.join('')}
      </div>`;
      new maplibregl.Popup({ maxWidth: '240px' }).setLngLat([s.lon, s.lat]).setHTML(html).addTo(map);
    }

    function updateStats() {
      const mps = msgCount - lastMsgCount;
      lastMsgCount = msgCount;
      document.getElementById('sVessels').textContent = vessels.size.toLocaleString();
      document.getElementById('sMps').textContent = mps;
      updateDot();
      renderChips();
      renderVesselList();
    }

    // ═══════════════════════════════════════════════════════════════
    // VESSEL PANEL
    // ═══════════════════════════════════════════════════════════════
    function onVesselClick(e) {
      if (!e.features || !e.features.length) return;
      const mmsi = e.features[0].properties.mmsi;
      const v = vessels.get(mmsi);
      if (!v) return;
      selectedMmsi = mmsi;
      updateUrl();
      showPopup(e);
      const cardOpen = document.getElementById('vcard').classList.contains('open');
      if (autoShowCard || cardOpen) showPanel(mmsi, v);
      updateSelected();
      renderTrails();
      renderVesselList();
    }

    function showPanel(mmsi, v) {
      const panel = document.getElementById('vcard');
      // Header
      document.getElementById('pFlag').innerHTML = flagHtml(mmsi);
      document.getElementById('pName').textContent = v.name || 'MMSI ' + mmsi;
      const st = ageState(v.ts);
      const dot = document.getElementById('pState');
      dot.className = 'trust-dot ' + st;

      const f = (k, val) => val ? `<div class="sf"><span class="k">${esc(k)}</span><span class="v">${esc(val)}</span></div>` : '';
      const sec = (title, content) => content.trim() ? `<div class="sc-section"><div class="st">${title}</div>${content}</div>` : '';
      let html = `<div class="sc-photo" id="pPhoto"><div class="sc-photo-skeleton"></div></div>`;

      if (v.isAton) {
        document.getElementById('pType').textContent = 'AtoN';
        document.getElementById('pStatus').textContent = fmtAge(v.ts);
        html += `<div class="sc-motion"><div class="mc"><span class="mv">${v.lat.toFixed(4)}°</span><span class="ml">Lat</span></div><div class="mc"><span class="mv">${v.lon.toFixed(4)}°</span><span class="ml">Lon</span></div><div class="mc"><span class="mv">${fmtAge(v.ts)}</span><span class="ml">Age</span></div></div>`
          + `<div class="sc-id"><div class="ic"><span class="iv">${mmsi}</span><span class="il">MMSI</span></div><div class="ic"><span class="iv">—</span><span class="il">Type</span></div><div class="ic"><span class="iv">${v.atonType||0}</span><span class="il">AtoN ID</span></div></div>`;
      } else {
        const cat = shipCategory(v.shiptype, mmsi);
        const moving = v.sog !== undefined && v.sog > 0.5;
        const typeTxt = v.classDesc || cat.charAt(0).toUpperCase() + cat.slice(1);
        document.getElementById('pType').textContent = typeTxt;
        document.getElementById('pStatus').innerHTML = `<span style="color:${moving?'#34d399':'#fbbf24'}">${moving ? 'Underway' : 'Moored'}</span> · ${fmtAge(v.ts)}`;

        const sog = fmtSpeed(v.sog) || '—';
        const cog = (v.cog !== undefined && v.cog < 360) ? v.cog.toFixed(0) + '°' : '—';
        const hdg = (v.hdg !== undefined && v.hdg < 360) ? v.hdg + '°' : '—';
        const dim = v.to_bow && v.to_stern ? `${fmtLen(v.to_bow+v.to_stern)} × ${fmtLen((v.to_port||0)+(v.to_starboard||0))}` : null;
        const conf = (v.name && v.shiptype) ? 'High' : (v.shiptype || v.name) ? 'Medium' : 'Low';

        // Motion dashboard
        html += `<div class="sc-motion"><div class="mc"><span class="mv">${sog}</span><span class="ml">Speed</span></div><div class="mc"><span class="mv">${cog}</span><span class="ml">Course</span></div><div class="mc"><span class="mv">${hdg}</span><span class="ml">Heading</span></div></div>`;
        // Identity 3-col
        html += `<div class="sc-id"><div class="ic"><span class="iv">${mmsi}</span><span class="il">MMSI</span></div><div class="ic"><span class="iv">${esc(v.callsign||'—')}</span><span class="il">Callsign</span></div><div class="ic"><span class="iv">${esc(v.imo||'—')}</span><span class="il">IMO</span></div></div>`;
        // Sections
        html += sec('Position & Voyage',
          f('Position', v.lat.toFixed(5) + ', ' + v.lon.toFixed(5)) +
          f('Destination', v.destination) + f('ETA', v.eta)
        ) + sec('Vessel',
          f('Dimensions', dim) + f('Draught', v.draught ? fmtLen(v.draught) : null) +
          f('Tonnage', v.grossTonnage ? v.grossTonnage.toLocaleString() + ' GT' : '—')
        ) + sec('Source',
          f('Freshness', st.charAt(0).toUpperCase()+st.slice(1) + ' · ' + fmtAge(v.ts)) +
          f('Confidence', conf)
        );
      }
      document.getElementById('pBody').innerHTML = html;
      fetchVesselPhoto(v.imo, mmsi);
      document.getElementById('pActions').innerHTML =
        `<button class="act${followMode?' on':''}" id="actFollow" onclick="toggleFollow()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>Follow</button>` +
        `<button class="act" onclick="copyMMSI(${mmsi})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</button>` +
        `<button class="act" onclick="shareVessel(${mmsi})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>Share</button>` +
        `<a class="act" href="https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}" target="_blank" rel="noopener">MT</a>` +
        `<a class="act" href="https://www.vesselfinder.com/vessels/details/${mmsi}" target="_blank" rel="noopener">VF</a>`;
      if (window.innerWidth <= 600) { document.getElementById('vlist').classList.remove('open'); document.getElementById('railListBtn').classList.remove('on'); document.documentElement.classList.remove('vlist-open'); }
      panel.classList.add('open');
    }

    let autoShowCard = localStorage.getItem('autoShowCard') !== 'false';
    function closePanel() { document.getElementById('vcard').classList.remove('open'); selectedMmsi = null; followMode = false; updateUrl(); updateSelected(); renderTrails(); }
    function copyMMSI(mmsi) { navigator.clipboard?.writeText(String(mmsi)); flash('MMSI copied'); }
    function shareVessel(mmsi) {
      const url = location.origin + location.pathname + `?mmsi=${mmsi}`;
      navigator.clipboard?.writeText(url); flash('Link copied');
    }
    let flashTimer = 0;
    function flash(msg) {
      let el = document.getElementById('toast');
      if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el);
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:60;background:var(--text);color:var(--surface);padding:8px 16px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:var(--e2);opacity:0;transition:opacity .2s;pointer-events:none'; }
      el.textContent = msg; el.style.opacity = '1';
      clearTimeout(flashTimer); flashTimer = setTimeout(() => el.style.opacity = '0', 1600);
    }
    function toggleFollow() {
      followMode = !followMode;
      const a = document.getElementById('actFollow'); if (a) a.classList.toggle('on', followMode);
      updateSelected();
    }

    // Photo system — loads flat file list from R2, groups by prefix
    const photoCache = new Map();
    const PHOTO_CDN = 'https://pub-655e10ff87f24bd69eff6c98a4a7fb64.r2.dev';
    const typePhotos = {}; // shipCategory → [url, ...]
    const atonPhotos = {}; // atonCat → [url, ...]
    const PREFIX_MAP = [
      ['Platform-aton','aton','platform_aton'],['Lighthouse','aton','lighthouse'],
      ['Lightvessel','aton','lightvessel'],['Beacon','aton','beacon'],['Buoy','aton','buoy'],
      ['Cargo-vessel','type','cargo'],['Tanker','type','tanker'],['Passenger','type','passenger'],
      ['Fishing-vessel','type','fishing'],['Tug','type','tug'],['Pilot-vessel','type','pilot'],
      ['High-speed-craft','type','hsc'],['Search-and-rescue','type','sar'],
      ['Law-enforcement','type','law'],['Medical-transport','type','medical'],
      ['Military','type','military'],['Dive-vessel','type','dive'],
      ['Dredging-or-underwater-ops','type','dredging'],['Platform','type','platform'],
      ['Other-vessel-type','type','unknown'],['Pleasure-craft','type','sailing'],
    ];
    let photoIndexReady = false;
    fetch(`${PHOTO_CDN}/photos-index.txt`).then(r=>r.text()).then(txt=>{
      for (const line of txt.split('\n')) {
        const file = line.trim();
        if (!file) continue;
        for (const [pfx,group,cat] of PREFIX_MAP) {
          if (file.startsWith(pfx)) {
            const target = group==='aton' ? atonPhotos : typePhotos;
            (target[cat]=target[cat]||[]).push(`${PHOTO_CDN}/${file}`);
            break;
          }
        }
      }
      photoIndexReady = true;
    }).catch(()=>{ photoIndexReady = true; });
    function atonPhotoCategory(t) {
      if (t>=4&&t<=7||t>=22&&t<=23) return 'lighthouse';
      if (t>=8&&t<=12) return 'lightvessel';
      if (t>=13&&t<=21) return 'beacon';
      if (t>=24&&t<=31) return 'buoy';
      if (t===3) return 'platform_aton';
      return 'buoy';
    }
    const FALLBACK_PREFIX = {
      fishing:'Fishing-vessel',sar:'Search-and-rescue',tanker:'Tanker',
      passenger:'Passenger',hsc:'High-speed-craft',dive:'Dive-vessel',
      medical:'Medical-transport',cargo:'Cargo-vessel',helicopter:'Helicopter',
      tug:'Tug',law:'Law-enforcement',pilot:'Pilot-vessel',platform:'Platform',
      sar_aircraft:'Aircraft',military:'Military',seismic:'Seismic-survey-vessel',
      pleasure:'Pleasure-craft-0',sailing:'Pleasure-craft-0',
      dredging:'Dredging-or-underwater-ops',unknown:'Other-vessel-type',
    };
    const ATON_FALLBACK_SVG = null; // uses ATON_ICON_MAP directly
    function fetchVesselPhoto(imo, mmsi) {
      const el = document.getElementById('pPhoto');
      if (!el) return;
      const cached = photoCache.get(mmsi);
      if (cached) { el.innerHTML = cached; return; }
      const v = vessels.get(mmsi);
      let html;
      const pick = arr => arr[Math.floor(Math.random()*arr.length)];
      if (v && v.isAton) {
        const cat = atonPhotoCategory(v.atonType||0);
        const p = atonPhotos[cat];
        if (p&&p.length) {
          const url = pick(p);
          html = `<img src="${url}" alt="" loading="lazy"><span class="photo-disclaimer">Illustration only</span>`;
        } else {
          const svg = ATON_ICON_MAP[v.atonType||0] || 'default_type_of_aton_not_specified';
          html = `<div class="aton-photo-fallback"><img src="./icons/${svg}.svg" alt=""></div>`;
        }
      } else {
        const cat = shipCategory(v?.shiptype, mmsi);
        const p = typePhotos[cat];
        const url = p&&p.length ? pick(p) : `./photos/${FALLBACK_PREFIX[cat]||'Other-vessel-type'}.jpg`;
        html = `<img src="${url}" alt="" loading="lazy"><span class="photo-disclaimer">Illustration only</span>`;
      }
      if (photoIndexReady) photoCache.set(mmsi, html);
      el.innerHTML = html;
    }


    // Auto-save binary snapshots to IDB every 10 min — fully automatic, no manual export needed
    function autoSaveBin() {
      if (!idb || vessels.size < 50) return;
      const tx = idb.transaction('trails', 'readwrite');
      const store = tx.objectStore('trails');
      store.put({ mmsi: -1, _binVessels: buildVesselsBuf(), _binTrails: buildTrailsBuf(), ts: Date.now() });
    }

    // Load binary snapshot from IDB on startup (faster than per-vessel IDB reads)
    function loadBinFromIDB() {
      if (!idb) return Promise.resolve();
      return new Promise(resolve => {
        const tx = idb.transaction('trails', 'readonly');
        const req = tx.objectStore('trails').get(-1);
        req.onsuccess = () => {
          const row = req.result;
          if (!row) return resolve();
          if (row._binVessels) parseBinVessels(row._binVessels);
          if (row._binTrails) parseBinTrails(row._binTrails);
          resolve();
        };
        req.onerror = () => resolve();
      });
    }

    function parseBinVessels(buf) {
      const view = new DataView(buf);
      if (buf.byteLength < 8) return;
      const count = view.getUint32(4, true);
      const dec = new TextDecoder();
      for (let i = 0; i < count; i++) {
        const off = 8 + i * 36;
        const mmsi = view.getUint32(off, true);
        const shiptype = view.getUint8(off + 4);
        const name = dec.decode(new Uint8Array(buf, off + 5, 20)).replace(/\0+$/, '');
        const callsign = dec.decode(new Uint8Array(buf, off + 25, 7)).replace(/\0+$/, '');
        const imo = view.getUint32(off + 32, true);
        const existing = vessels.get(mmsi) || {};
        if (!existing.name && name) existing.name = name;
        if (existing.shiptype === undefined && shiptype) existing.shiptype = shiptype;
        if (!existing.callsign && callsign) existing.callsign = callsign;
        if (!existing.imo && imo) existing.imo = imo;
        vessels.set(mmsi, existing);
      }
    }

    function parseBinTrails(buf) {
      const view = new DataView(buf);
      if (buf.byteLength < 8) return;
      const vesselCount = view.getUint32(4, true);
      let offset = 8;
      for (let i = 0; i < vesselCount; i++) {
        const mmsi = view.getUint32(offset, true);
        const pointCount = view.getUint16(offset + 4, true);
        offset += 6;
        const existing = vessels.get(mmsi) || {};
        if (!existing.trail) existing.trail = [];
        for (let j = 0; j < pointCount; j++) {
          existing.trail.push([view.getFloat32(offset, true), view.getFloat32(offset + 4, true)]);
          offset += 10;
        }
        if (existing.trail.length > TRAIL_MAX) existing.trail = existing.trail.slice(-TRAIL_MAX);
        vessels.set(mmsi, existing);
      }
    }

    function buildVesselsBuf() {
      const records = [];
      for (const [mmsi, v] of vessels) {
        if (v.name || v.shiptype) records.push({ mmsi, name: v.name || '', shiptype: v.shiptype || 0, callsign: v.callsign || '', imo: v.imo || 0 });
      }
      records.sort((a, b) => a.mmsi - b.mmsi);
      const buf = new ArrayBuffer(8 + records.length * 36);
      const view = new DataView(buf);
      const enc = new TextEncoder();
      view.setUint8(0, 65); view.setUint8(1, 73); view.setUint8(2, 83); view.setUint8(3, 86);
      view.setUint32(4, records.length, true);
      for (let i = 0; i < records.length; i++) {
        const r = records[i], off = 8 + i * 36;
        view.setUint32(off, r.mmsi, true);
        view.setUint8(off + 4, r.shiptype);
        const nb = enc.encode(r.name.substring(0, 20)); new Uint8Array(buf, off + 5, 20).set(nb.slice(0, 20));
        const cb = enc.encode(r.callsign.substring(0, 7)); new Uint8Array(buf, off + 25, 7).set(cb.slice(0, 7));
        view.setUint32(off + 32, r.imo, true);
      }
      return buf;
    }

    function buildTrailsBuf() {
      const entries = [];
      for (const [mmsi, v] of vessels) { if (v.trail && v.trail.length > 1 && !v.isAton) entries.push([mmsi, v.trail]); }
      entries.sort((a, b) => a[0] - b[0]);
      let totalPts = 0; for (const [, t] of entries) totalPts += t.length;
      const buf = new ArrayBuffer(8 + entries.length * 6 + totalPts * 10);
      const view = new DataView(buf);
      view.setUint8(0, 65); view.setUint8(1, 73); view.setUint8(2, 83); view.setUint8(3, 84);
      view.setUint32(4, entries.length, true);
      let offset = 8;
      for (const [mmsi, trail] of entries) {
        view.setUint32(offset, mmsi, true); view.setUint16(offset + 4, trail.length, true); offset += 6;
        for (const pt of trail) { view.setFloat32(offset, pt[0], true); view.setFloat32(offset + 4, pt[1], true); view.setUint16(offset + 8, 0, true); offset += 10; }
      }
      return buf;
    }

    // ═══════════════════════════════════════════════════════════════
    // FLAG FROM MMSI (MID prefix → ISO country code)
    // ═══════════════════════════════════════════════════════════════
    const MID = {
      201: 'gr', 202: 'gr', 203: 'gr', 204: 'pt', 205: 'lu', 206: 'be', 207: 'fr', 208: 'fr', 209: 'fr', 210: 'fr',
      211: 'de', 212: 'cy', 213: 'ge', 214: 'md', 215: 'mt', 216: 'am', 218: 'de', 219: 'dk', 220: 'dk',
      224: 'es', 225: 'es', 226: 'fr', 227: 'fr', 228: 'fr', 229: 'mt', 230: 'fi', 231: 'fo', 232: 'gb',
      233: 'gb', 234: 'gb', 235: 'gb', 236: 'gi', 237: 'gr', 238: 'hr', 239: 'gr', 240: 'gr', 241: 'gr',
      242: 'ma', 243: 'hu', 244: 'nl', 245: 'nl', 246: 'nl', 247: 'it', 248: 'mt', 249: 'mt', 250: 'ie',
      251: 'is', 252: 'li', 253: 'lu', 254: 'mc', 255: 'pt', 256: 'mt', 257: 'no', 258: 'no', 259: 'no',
      261: 'pl', 262: 'me', 263: 'pt', 264: 'ro', 265: 'se', 266: 'se', 267: 'sk', 268: 'sm', 269: 'ch',
      270: 'cz', 271: 'tr', 272: 'ua', 273: 'ru', 274: 'mk', 275: 'lv', 276: 'ee', 277: 'lt', 278: 'si',
      279: 'rs', 301: 'ai', 303: 'us', 304: 'ag', 305: 'ag', 306: 'cw', 307: 'ar', 308: 'bs', 309: 'bs',
      310: 'bm', 311: 'bs', 312: 'bz', 314: 'bb', 316: 'bo', 319: 'ky', 321: 'cr', 323: 'cu', 325: 'dm',
      327: 'do', 329: 'gp', 330: 'gd', 331: 'gl', 332: 'gt', 334: 'hn', 336: 'ht', 338: 'us', 339: 'jm',
      341: 'kn', 343: 'lc', 345: 'mx', 347: 'mq', 348: 'ms', 350: 'ni', 351: 'pa', 352: 'pa', 353: 'pa',
      354: 'pa', 355: 'pa', 356: 'pa', 357: 'pa', 358: 'pr', 359: 'sv', 361: 'pm', 362: 'tt', 364: 'tc',
      366: 'us', 367: 'us', 368: 'us', 369: 'us', 370: 'pa', 371: 'pa', 372: 'pa', 373: 'pa', 374: 'pa',
      375: 'vc', 376: 'vc', 377: 'vc', 378: 'vg', 379: 'vi', 401: 'af', 403: 'sa', 405: 'bd', 408: 'bh',
      410: 'bt', 412: 'cn', 413: 'cn', 414: 'cn', 416: 'tw', 417: 'lk', 419: 'in', 422: 'ir', 423: 'az',
      425: 'iq', 428: 'jo', 431: 'jp', 432: 'jp', 434: 'tm', 436: 'kz', 437: 'uz', 438: 'kg', 440: 'kr',
      441: 'kr', 443: 'ps', 445: 'kp', 447: 'kw', 450: 'lb', 451: 'kg', 453: 'mo', 455: 'mv', 457: 'mn',
      459: 'np', 461: 'om', 463: 'pk', 466: 'qa', 468: 'sy', 470: 'ae', 472: 'tj', 473: 'ye', 475: 'ye',
      477: 'hk', 478: 'ba', 501: 'fr', 503: 'au', 506: 'mm', 508: 'bn', 510: 'fm', 511: 'pw', 512: 'nz',
      514: 'kh', 515: 'kh', 516: 'cx', 518: 'nz', 520: 'nz', 523: 'au', 525: 'id', 529: 'ki', 531: 'la',
      533: 'my', 536: 'mp', 538: 'mh', 540: 'nc', 542: 'nz', 544: 'nr', 546: 'fr', 548: 'nz', 550: 'nz',
      553: 'pg', 555: 'pi', 557: 'ph', 559: 'lk', 561: 'ws', 563: 'sg', 564: 'sg', 565: 'sg', 566: 'sg',
      567: 'th', 570: 'to', 572: 'tv', 574: 'vn', 576: 'vu', 577: 'vu', 578: 'wf', 601: 'za', 603: 'ao',
      605: 'dz', 607: 'fr', 608: 'gb', 609: 'bi', 610: 'bj', 611: 'bw', 612: 'cf', 613: 'cg', 615: 'cd',
      616: 'cm', 617: 'cv', 618: 'km', 619: 'ci', 620: 'km', 621: 'dj', 622: 'eg', 624: 'et', 625: 'er',
      626: 'ga', 627: 'gh', 629: 'gm', 630: 'gw', 631: 'gn', 632: 'gq', 633: 'ke', 634: 'lr', 636: 'lr',
      637: 'lr', 638: 'ss', 642: 'ly', 644: 'ls', 645: 'mu', 647: 'mg', 649: 'ml', 650: 'mz', 654: 'mr',
      655: 'mw', 656: 'ne', 657: 'ng', 659: 'na', 660: 're', 661: 'rw', 662: 'sd', 663: 'sn', 664: 'sc',
      665: 'sh', 666: 'so', 667: 'sl', 668: 'st', 669: 'sz', 670: 'td', 671: 'tg', 672: 'tn', 674: 'tz',
      675: 'ug', 676: 'cd', 677: 'tz', 678: 'zm', 679: 'zw', 701: 'ar', 710: 'br', 720: 'bo', 725: 'cl',
      730: 'co', 735: 'ec', 740: 'fk', 745: 'fr', 750: 'gy', 755: 'py', 760: 'pe', 765: 'sr', 770: 'uy',
      775: 've'
    };
    function mmsiFlag(mmsi) {
      const mid = String(mmsi).substring(0, 3);
      return MID[mid] || null;
    }
    function flagHtml(mmsi) {
      const cc = mmsiFlag(mmsi);
      return cc ? `<span class="fi fi-${cc}"></span>` : '🏳️';
    }

    // ═══════════════════════════════════════════════════════════════
    // HOVER POPUP
    // ═══════════════════════════════════════════════════════════════
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '220px' });

    function showPopup(e) {
      if (!e.features || !e.features.length) return;
      const mmsi = e.features[0].properties.mmsi;
      const v = vessels.get(mmsi);
      if (!v) return;
      const coords = [v.lon, v.lat];
      const cat = v.isAton ? 'AtoN' : shipCategory(v.shiptype, mmsi).toUpperCase();
      popup.setLngLat(coords).setHTML(
        `<div class="pop-title">${flagHtml(mmsi)} ${esc(v.name || mmsi)}</div>` +
        `<div class="pop-row"><span class="l">MMSI</span><span class="v">${mmsi}</span></div>` +
        `<div class="pop-row"><span class="l">Type</span><span class="v">${cat}</span></div>` +
        (v.sog !== undefined ? `<div class="pop-row"><span class="l">SOG</span><span class="v">${esc(fmtSpeed(v.sog))}</span></div>` : '') +
        (v.destination ? `<div class="pop-row"><span class="l">Dest</span><span class="v">${esc(v.destination)}</span></div>` : '')
      ).addTo(map);
    }
    function hidePopup() { popup.remove(); }

    // ═══════════════════════════════════════════════════════════════
    // THEME TOGGLE
    // ═══════════════════════════════════════════════════════════════
    // Theme-aware map label colors
    function labelColors() {
      const dark = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark';
      return dark ? { text: '#e8f0ff', halo: '#05080f' } : { text: '#0f172a', halo: '#ffffff' };
    }
    function setLabelTheme() {
      if (!map.getLayer || !map.getLayer('vessels-symbol')) return;
      const c = labelColors();
      map.setPaintProperty('vessels-symbol', 'text-color', c.text);
      map.setPaintProperty('vessels-symbol', 'text-halo-color', c.halo);
    }

    // Lucide sun / moon icons for theme toggle
    const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>';
    const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
    function setThemeIcon(t) {
      document.getElementById('theme-tog').innerHTML = t === 'dark' ? ICON_SUN : ICON_MOON;
      const sw = document.getElementById('themeSwitch'); if (sw) sw.checked = t === 'dark';
    }

    function initTheme() {
      const t = localStorage.getItem('aiscopeTheme') || 'light';
      document.documentElement.setAttribute('data-theme', t);
      setThemeIcon(t);
    }
    function toggleTheme() {
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('aiscopeTheme', next);
      setThemeIcon(next);
      // Switch map style to match the theme
      const matchStyle = next === 'dark' ? 'Dark' : 'Light';
      if (curStyle !== matchStyle && MAP_STYLES[matchStyle]) {
        switchStyle(matchStyle);
        map.once('style.load', setLabelTheme); // re-apply after layers rebuilt
      } else {
        setLabelTheme();
      }
    }
    initTheme();
    // Open vessel list by default on desktop (wide screens)
    if (window.innerWidth > 600) { document.getElementById('vlist').classList.add('open'); document.getElementById('railListBtn').classList.add('on'); document.documentElement.classList.add('vlist-open'); renderVesselList(); }
    buildRegionMenu();
    buildSettingsMenu();
    // ═══════════════════════════════════════════════════════════════
    // SPA ROUTER
    // ═══════════════════════════════════════════════════════════════
    let currentView = 'map';
    function navigate(view) {
      if (view === currentView) return;
      currentView = view;
      location.hash = view === 'map' ? '' : view;
      applyView();
    }
    function applyView() {
      const isDecoder = currentView === 'decoder';
      document.body.classList.toggle('view-decoder', isDecoder);
      document.getElementById('view-map').style.display = isDecoder ? 'none' : '';
      document.getElementById('view-decoder').style.display = isDecoder ? '' : 'none';
      document.getElementById('brandText').textContent = isDecoder ? 'HPRadar Marine › Decoder' : 'HPRadar Marine';
      document.getElementById('railDecodeBtn')?.classList.toggle('on', isDecoder);
      if (isDecoder && typeof decInit === 'function') decInit();
      if (!isDecoder) map.resize();
    }
    window.addEventListener('hashchange', () => {
      currentView = location.hash === '#decoder' ? 'decoder' : 'map';
      applyView();
    });
    // Init from hash on load
    if (location.hash === '#decoder') { currentView = 'decoder'; applyView(); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && currentView === 'decoder') navigate('map'); });

    // ═══════════════════════════════════════════════════════════════
    // AI CHAT
    // ═══════════════════════════════════════════════════════════════
    const CHAT_API = 'https://stream.hpradar.com/api/chat';
    const chatHistory = [];
    let chatOpen = false;

    function initChat() {
      const container = document.createElement('div');
      container.id = 'ai-chat';
      container.innerHTML = `
        <button id="ai-fab" title="AI Assistant">🧭</button>
        <div id="ai-panel" class="ai-hidden">
          <div id="ai-header"><span>HPR Marine AI</span><button id="ai-close">×</button></div>
          <div id="ai-messages"></div>
          <div id="ai-input-row">
            <input id="ai-input" type="text" placeholder="Ask about vessels, traffic, weather..." autocomplete="off">
            <button id="ai-send">→</button>
          </div>
        </div>`;
      document.body.appendChild(container);

      const fab = document.getElementById('ai-fab');
      const panel = document.getElementById('ai-panel');
      const input = document.getElementById('ai-input');
      const sendBtn = document.getElementById('ai-send');
      const closeBtn = document.getElementById('ai-close');
      const msgs = document.getElementById('ai-messages');

      fab.onclick = () => { chatOpen = !chatOpen; panel.classList.toggle('ai-hidden', !chatOpen); fab.classList.toggle('ai-active', chatOpen); if (chatOpen) input.focus(); };
      closeBtn.onclick = () => { chatOpen = false; panel.classList.add('ai-hidden'); fab.classList.remove('ai-active'); };

      async function send() {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        chatHistory.push({ role: 'user', content: text });
        appendMsg('user', text);
        appendMsg('ai', '...');

        try {
          const resp = await fetch(CHAT_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory })
          });
          const data = await resp.json();
          const reply = data.content || data.error || 'No response';
          chatHistory.push({ role: 'assistant', content: reply });
          replaceLastMsg(reply);
        } catch (e) {
          replaceLastMsg('Connection error. Is the AI service running?');
        }
      }

      sendBtn.onclick = send;
      input.onkeydown = e => { if (e.key === 'Enter') send(); };

      function appendMsg(role, text) {
        const div = document.createElement('div');
        div.className = 'ai-msg ai-' + role;
        div.textContent = text;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
      }
      function replaceLastMsg(text) {
        const last = msgs.lastElementChild;
        if (last) { last.textContent = text; msgs.scrollTop = msgs.scrollHeight; }
      }
    }

    // Inject chat styles
    const chatCSS = document.createElement('style');
    chatCSS.textContent = `
      #ai-chat { position:fixed; bottom:16px; right:16px; z-index:9999; font-family:system-ui,sans-serif; }
      #ai-fab { width:48px; height:48px; border-radius:50%; border:none; background:#1e40af; color:white; font-size:22px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.4); transition:transform .2s,background .2s; }
      #ai-fab:hover { transform:scale(1.1); }
      #ai-fab.ai-active { background:#059669; }
      #ai-panel { position:absolute; bottom:60px; right:0; width:360px; max-height:480px; background:#0f172a; border:1px solid rgba(255,255,255,.1); border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,.6); }
      #ai-panel.ai-hidden { display:none; }
      #ai-header { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#1e293b; border-bottom:1px solid rgba(255,255,255,.08); font-size:13px; font-weight:600; color:#e2e8f0; }
      #ai-header button { background:none; border:none; color:#94a3b8; font-size:18px; cursor:pointer; }
      #ai-messages { flex:1; overflow-y:auto; padding:12px; min-height:200px; max-height:340px; }
      .ai-msg { margin-bottom:8px; padding:8px 12px; border-radius:8px; font-size:12px; line-height:1.5; word-wrap:break-word; white-space:pre-wrap; }
      .ai-user { background:#1e3a5f; color:#bfdbfe; margin-left:40px; text-align:right; }
      .ai-ai { background:#1e293b; color:#cbd5e1; margin-right:20px; }
      #ai-input-row { display:flex; gap:6px; padding:10px; border-top:1px solid rgba(255,255,255,.08); background:#0f172a; }
      #ai-input { flex:1; padding:8px 12px; border-radius:8px; border:1px solid #334155; background:#1e293b; color:#e2e8f0; font-size:12px; outline:none; }
      #ai-input:focus { border-color:#3b82f6; }
      #ai-send { padding:8px 12px; border-radius:8px; border:none; background:#2563eb; color:white; font-size:14px; cursor:pointer; }
      #ai-send:hover { background:#1d4ed8; }
      @media(max-width:500px) { #ai-panel { width:calc(100vw - 32px); right:-8px; } }
    `;
    document.head.appendChild(chatCSS);
    initChat();
