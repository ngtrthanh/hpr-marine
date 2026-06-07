// ═══════════════════════════════════════════════════════════════
// DECODER VIEW — Full AIS bit-slice decoder (all 27 types)
// ITU-R M.1371-5 compliant. Shares payloadToBits from app.js.
// ═══════════════════════════════════════════════════════════════

const SPEC_ATLAS = {
  1:{name:"Position Report (Class A)",cat:"position",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},
    {name:"Nav Status",len:4,type:"enum",key:"nav_status",map:{0:"Under way",1:"At anchor",2:"Not under command",3:"Restricted",4:"Constrained by draught",5:"Moored",6:"Aground",7:"Engaged in fishing",8:"Sailing",14:"AIS-SART",15:"Undefined"}},
    {name:"ROT",len:8,type:"rot",key:"rot"},{name:"SOG",len:10,type:"scaled",key:"sog",scale:10,unit:"kn"},
    {name:"Pos Accuracy",len:1,type:"int",key:"pos_acc"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
    {name:"COG",len:12,type:"scaled",key:"cog",scale:10,unit:"°"},
    {name:"True Heading",len:9,type:"int",key:"heading"},{name:"Timestamp",len:6,type:"int",key:"ts_sec"},
    {name:"Maneuver",len:2,type:"int",key:"maneuver"},{name:"Spare",len:3,type:"int",key:"spare"},
    {name:"RAIM",len:1,type:"int",key:"raim"},{name:"Radio",len:19,type:"int",key:"radio"},
  ]},
  2:{name:"Position Report (Assigned)",cat:"position",inherit:1},
  3:{name:"Position Report (Special)",cat:"position",inherit:1},
  4:{name:"Base Station Report",cat:"infra",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Year",len:14,type:"int",key:"year"},
    {name:"Month",len:4,type:"int",key:"month"},{name:"Day",len:5,type:"int",key:"day"},
    {name:"Hour",len:5,type:"int",key:"hour"},{name:"Minute",len:6,type:"int",key:"minute"},
    {name:"Second",len:6,type:"int",key:"second"},{name:"Fix Quality",len:1,type:"int",key:"fix"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
    {name:"EPFD",len:4,type:"int",key:"epfd"},{name:"Spare",len:10,type:"int",key:"spare"},
    {name:"RAIM",len:1,type:"int",key:"raim"},{name:"Radio",len:19,type:"int",key:"radio"},
  ]},
  5:{name:"Static & Voyage Data",cat:"static",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"AIS Version",len:2,type:"int",key:"ais_ver"},{name:"MMSI",len:30,type:"int",key:"mmsi"},
    {name:"IMO",len:30,type:"int",key:"imo"},{name:"Call Sign",len:42,type:"text6",key:"callsign"},
    {name:"Vessel Name",len:120,type:"text6",key:"shipname"},{name:"Ship Type",len:8,type:"int",key:"shiptype"},
    {name:"To Bow",len:9,type:"int",key:"to_bow"},{name:"To Stern",len:9,type:"int",key:"to_stern"},
    {name:"To Port",len:6,type:"int",key:"to_port"},{name:"To Starboard",len:6,type:"int",key:"to_stbd"},
    {name:"EPFD",len:4,type:"int",key:"epfd"},
    {name:"ETA Month",len:4,type:"int",key:"eta_month"},{name:"ETA Day",len:5,type:"int",key:"eta_day"},
    {name:"ETA Hour",len:5,type:"int",key:"eta_hour"},{name:"ETA Minute",len:6,type:"int",key:"eta_min"},
    {name:"Draught",len:8,type:"scaled",key:"draught",scale:10,unit:"m"},
    {name:"Destination",len:120,type:"text6",key:"destination"},{name:"DTE",len:1,type:"int",key:"dte"},
  ]},
  6:{name:"Binary Addressed",cat:"binary",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"Src MMSI",len:30,type:"int",key:"src_mmsi"},{name:"Seq No",len:2,type:"int",key:"seq"},
    {name:"Dest MMSI",len:30,type:"int",key:"dest_mmsi"},{name:"Retransmit",len:1,type:"int",key:"retrans"},
    {name:"Spare",len:1,type:"int",key:"spare"},{name:"DAC",len:10,type:"int",key:"dac"},
    {name:"FI",len:6,type:"int",key:"fi"},{name:"Data",len:"REMAINING",type:"hex",key:"data"},
  ]},
  7:{name:"Binary Ack",cat:"binary",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"MMSI 1",len:30,type:"int",key:"mmsi1"},{name:"Seq 1",len:2,type:"int",key:"seq1"},
  ]},
  8:{name:"Binary Broadcast",cat:"binary",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"DAC",len:10,type:"int",key:"dac"},{name:"FI",len:6,type:"int",key:"fi"},
    {name:"Data",len:"REMAINING",type:"hex",key:"data"},
  ]},
  9:{name:"SAR Aircraft Position",cat:"safety",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Altitude",len:12,type:"int",key:"altitude"},
    {name:"SOG",len:10,type:"int",key:"sog"},{name:"Pos Accuracy",len:1,type:"int",key:"accuracy"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
    {name:"COG",len:12,type:"scaled",key:"cog",scale:10,unit:"°"},
    {name:"Timestamp",len:6,type:"int",key:"ts"},{name:"Reserved",len:8,type:"int",key:"reserved"},
    {name:"DTE",len:1,type:"int",key:"dte"},{name:"Spare",len:3,type:"int",key:"spare"},
    {name:"Assigned",len:1,type:"int",key:"assigned"},{name:"RAIM",len:1,type:"int",key:"raim"},
    {name:"Radio",len:19,type:"int",key:"radio"},
  ]},
  10:{name:"UTC/Date Inquiry",cat:"mgmt",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"Dest MMSI",len:30,type:"int",key:"dest_mmsi"},{name:"Spare2",len:2,type:"int",key:"spare2"},
  ]},
  11:{name:"UTC/Date Response",cat:"infra",inherit:4},
  12:{name:"Addressed Safety Msg",cat:"safety",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Seq",len:2,type:"int",key:"seq"},
    {name:"Dest MMSI",len:30,type:"int",key:"dest_mmsi"},{name:"Retransmit",len:1,type:"int",key:"retrans"},
    {name:"Spare",len:1,type:"int",key:"spare"},{name:"Text",len:"REMAINING",type:"text6",key:"text"},
  ]},
  13:{name:"Safety Ack",cat:"safety",inherit:7},
  14:{name:"Safety Broadcast",cat:"safety",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"Text",len:"REMAINING",type:"text6",key:"text"},
  ]},
  15:{name:"Interrogation",cat:"mgmt",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"MMSI 1",len:30,type:"int",key:"mmsi1"},{name:"Type 1",len:6,type:"int",key:"type1"},
    {name:"Offset 1",len:12,type:"int",key:"offset1"},
  ]},
  16:{name:"Assignment Mode",cat:"mgmt",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"MMSI 1",len:30,type:"int",key:"mmsi1"},{name:"Offset",len:12,type:"int",key:"offset"},
    {name:"Increment",len:10,type:"int",key:"increment"},
  ]},
  17:{name:"DGNSS Corrections",cat:"infra",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"Longitude",len:18,type:"coord",key:"lon",div:600},
    {name:"Latitude",len:17,type:"coord",key:"lat",div:600},
    {name:"Spare2",len:5,type:"int",key:"spare2"},
    {name:"Data",len:"REMAINING",type:"hex",key:"data"},
  ]},
  18:{name:"Class B Position",cat:"position",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Reserved",len:8,type:"int",key:"reserved"},
    {name:"SOG",len:10,type:"scaled",key:"sog",scale:10,unit:"kn"},
    {name:"Pos Accuracy",len:1,type:"int",key:"accuracy"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
    {name:"COG",len:12,type:"scaled",key:"cog",scale:10,unit:"°"},
    {name:"Heading",len:9,type:"int",key:"heading"},{name:"Timestamp",len:6,type:"int",key:"ts"},
    {name:"Regional",len:2,type:"int",key:"regional"},{name:"CS Unit",len:1,type:"int",key:"cs"},
    {name:"Display",len:1,type:"int",key:"display"},{name:"DSC",len:1,type:"int",key:"dsc"},
    {name:"Band",len:1,type:"int",key:"band"},{name:"Message22",len:1,type:"int",key:"msg22"},
    {name:"Assigned",len:1,type:"int",key:"assigned"},{name:"RAIM",len:1,type:"int",key:"raim"},
    {name:"Radio",len:20,type:"int",key:"radio"},
  ]},
  19:{name:"Extended Class B",cat:"position",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Reserved",len:8,type:"int",key:"reserved"},
    {name:"SOG",len:10,type:"scaled",key:"sog",scale:10,unit:"kn"},
    {name:"Pos Accuracy",len:1,type:"int",key:"accuracy"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
    {name:"COG",len:12,type:"scaled",key:"cog",scale:10,unit:"°"},
    {name:"Heading",len:9,type:"int",key:"heading"},{name:"Timestamp",len:6,type:"int",key:"ts"},
    {name:"Regional",len:4,type:"int",key:"regional"},
    {name:"Name",len:120,type:"text6",key:"name"},{name:"Ship Type",len:8,type:"int",key:"shiptype"},
    {name:"To Bow",len:9,type:"int",key:"to_bow"},{name:"To Stern",len:9,type:"int",key:"to_stern"},
    {name:"To Port",len:6,type:"int",key:"to_port"},{name:"To Starboard",len:6,type:"int",key:"to_stbd"},
    {name:"EPFD",len:4,type:"int",key:"epfd"},{name:"RAIM",len:1,type:"int",key:"raim"},
    {name:"DTE",len:1,type:"int",key:"dte"},{name:"Assigned",len:1,type:"int",key:"assigned"},
  ]},
  20:{name:"Data Link Management",cat:"mgmt",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"Offset 1",len:12,type:"int",key:"offset1"},{name:"Slots 1",len:4,type:"int",key:"slots1"},
    {name:"Timeout 1",len:3,type:"int",key:"timeout1"},{name:"Increment 1",len:11,type:"int",key:"incr1"},
  ]},
  21:{name:"Aids to Navigation",cat:"static",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"AtoN Type",len:5,type:"int",key:"aton_type"},
    {name:"Name",len:120,type:"text6",key:"name"},{name:"Accuracy",len:1,type:"int",key:"accuracy"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
    {name:"To Bow",len:9,type:"int",key:"to_bow"},{name:"To Stern",len:9,type:"int",key:"to_stern"},
    {name:"To Port",len:6,type:"int",key:"to_port"},{name:"To Starboard",len:6,type:"int",key:"to_stbd"},
    {name:"EPFD",len:4,type:"int",key:"epfd"},{name:"UTC Second",len:6,type:"int",key:"utc_sec"},
    {name:"Off Position",len:1,type:"int",key:"off_pos"},{name:"Regional",len:8,type:"int",key:"regional"},
    {name:"RAIM",len:1,type:"int",key:"raim"},{name:"Virtual AtoN",len:1,type:"int",key:"virtual"},
    {name:"Assigned",len:1,type:"int",key:"assigned"},{name:"Spare",len:1,type:"int",key:"spare"},
    {name:"Name Ext",len:"REMAINING",type:"text6",key:"name_ext"},
  ]},
  22:{name:"Channel Management",cat:"mgmt",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"Channel A",len:12,type:"int",key:"chan_a"},{name:"Channel B",len:12,type:"int",key:"chan_b"},
    {name:"Tx Mode",len:4,type:"int",key:"tx_mode"},
    {name:"Power High",len:1,type:"int",key:"power"},
    {name:"Lon 1",len:18,type:"coord",key:"lon1",div:600},
    {name:"Lat 1",len:17,type:"coord",key:"lat1",div:600},
    {name:"Lon 2",len:18,type:"coord",key:"lon2",div:600},
    {name:"Lat 2",len:17,type:"coord",key:"lat2",div:600},
  ]},
  23:{name:"Group Assignment",cat:"mgmt",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:2,type:"int",key:"spare"},
    {name:"Lon 1",len:18,type:"coord",key:"lon1",div:600},
    {name:"Lat 1",len:17,type:"coord",key:"lat1",div:600},
    {name:"Lon 2",len:18,type:"coord",key:"lon2",div:600},
    {name:"Lat 2",len:17,type:"coord",key:"lat2",div:600},
    {name:"Station Type",len:4,type:"int",key:"station_type"},
    {name:"Ship Type",len:8,type:"int",key:"ship_type"},
    {name:"Tx/Rx Mode",len:2,type:"int",key:"txrx"},
    {name:"Interval",len:4,type:"int",key:"interval"},{name:"Quiet",len:4,type:"int",key:"quiet"},
  ]},
  24:{name:"Class B Static",cat:"static",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Part",len:2,type:"int",key:"part"},
    {name:"Name",len:120,type:"text6",key:"name"},
  ]},
  25:{name:"Single Slot Binary",cat:"binary",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Addressed",len:1,type:"int",key:"addressed"},
    {name:"Structured",len:1,type:"int",key:"structured"},
    {name:"Data",len:"REMAINING",type:"hex",key:"data"},
  ]},
  26:{name:"Multi Slot Binary",cat:"binary",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Addressed",len:1,type:"int",key:"addressed"},
    {name:"Structured",len:1,type:"int",key:"structured"},
    {name:"Data",len:"REMAINING",type:"hex",key:"data"},
  ]},
  27:{name:"Long Range Broadcast",cat:"position",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Pos Accuracy",len:1,type:"int",key:"accuracy"},
    {name:"RAIM",len:1,type:"int",key:"raim"},{name:"Nav Status",len:4,type:"int",key:"nav_status"},
    {name:"Longitude",len:18,type:"coord",key:"lon",div:600},
    {name:"Latitude",len:17,type:"coord",key:"lat",div:600},
    {name:"SOG",len:6,type:"scaled",key:"sog",scale:2,unit:"kn"},
    {name:"COG",len:9,type:"scaled",key:"cog",scale:2,unit:"°"},
    {name:"GNSS",len:1,type:"int",key:"gnss"},{name:"Spare",len:1,type:"int",key:"spare"},
  ]},
};

// Resolve inheritance
for (const [id, spec] of Object.entries(SPEC_ATLAS)) {
  if (spec.inherit) spec.fields = SPEC_ATLAS[spec.inherit].fields.map(f=>({...f}));
}

const SAMPLES = {
  1:"!AIVDM,1,1,,A,18SK4D@P00W`P1<;tDs9qOvN20Ro,0*45",
  2:"!AIVDM,1,1,,A,28SK4D@P00W`P1<;tDs9qOvN20Ro,0*46",
  3:"!AIVDM,1,1,,A,38SK4D@P00W`P1<;tDs9qOvN20Ro,0*47",
  4:"!AIVDM,1,1,,A,402u4`iuiS000000000000000000,0*15",
  5:"!AIVDM,2,1,1,B,55?HFl02B9>I=H@@@@@d4v0F@DUI10th000000160hJ220eed00000000000,0*26",
  18:"!AIVDM,1,1,,B,239N6b0001P6vptN4I5`00000000,0*3D",
  21:"!AIVDM,1,1,,B,E1mg=b021`@000000000000000000000000000000000,0*60",
  24:"!AIVDM,1,1,,A,839N6b0000H`P000,4*59",
  27:"!AIVDM,1,1,,A,KC5E2b@e=h0000000,0*16",
};

const DEC_CATS = {position:"Position & Tracking",static:"Static / Voyage",safety:"Safety & SAR",binary:"Binary Messages",mgmt:"Management",infra:"Infrastructure"};

// ─── State ──────────────────────────────────────────────────
let decState = {bits:"",spec:null,fields:[],stepIdx:0,offset:0,decoded:{}};
let decInited = false;
let decLiveActive = false, decLiveTimer = null, decLiveQueue = [];
let decAutoTimer = null;

function decInit() {
  if (decInited) return;
  decInited = true;
  decBuildSidebar();
  decIngest();
}

// ─── Sidebar ────────────────────────────────────────────────
function decBuildSidebar() {
  const el = document.getElementById('decTypeTree');
  const cats = {};
  for (const [id, spec] of Object.entries(SPEC_ATLAS)) {
    const c = spec.cat || 'other';
    if (!cats[c]) cats[c] = [];
    cats[c].push([+id, spec]);
  }
  let html = '';
  for (const [cat, types] of Object.entries(cats)) {
    html += `<div class="dec-cat-label">${DEC_CATS[cat]||cat}</div>`;
    for (const [id, spec] of types.sort((a,b)=>a[0]-b[0])) {
      html += `<div class="dec-type-row" data-t="${id}" onclick="decLoadSample(${id})"><span class="dec-type-num">${id}</span><span>${spec.name}</span></div>`;
    }
  }
  el.innerHTML = html;
}

function decLoadSample(typeId) {
  const s = SAMPLES[typeId] || SAMPLES[1];
  document.getElementById('decNmeaField').value = s;
  decIngest(typeId);
}

// ─── Ingest ─────────────────────────────────────────────────
function decIngest(forceType) {
  if (decAutoTimer) { clearTimeout(decAutoTimer); decAutoTimer = null; }
  const raw = document.getElementById('decNmeaField').value.trim();
  const parts = raw.split(',');
  if (parts.length < 6) return;
  const payload = parts[5];
  const bits = payloadToBits(payload);
  if (bits.length < 6) return;
  const msgType = forceType || parseInt(bits.substring(0, 6), 2);
  const spec = SPEC_ATLAS[msgType];
  if (!spec) return;

  // Envelope
  const headers = ["Talker","Frags","Part","ID","Chan","Payload","Fill*CS"];
  let envHtml = '';
  for (let i = 0; i < Math.min(7, parts.length); i++) {
    const v = i===6 ? parts[i].split('*').join(' *') : parts[i];
    envHtml += `<div class="dec-env-card${i===5?' hl':''}"><div class="dec-env-label">${headers[i]||''}</div><div class="dec-env-value">${v}</div></div>`;
  }
  document.getElementById('decEnvelope').innerHTML = envHtml;

  decState = {bits, spec, fields:spec.fields.map(f=>({...f})), stepIdx:0, offset:0, decoded:{}};
  document.getElementById('decFieldLog').innerHTML = '<div class="dec-empty">Press Step or Space</div>';
  document.getElementById('decJson').textContent = '{}';
  document.getElementById('decStepBtn').disabled = false;
  decUpdateStatus();
  decRenderCharmap(payload);
  decUpdateBitTape();
  document.querySelectorAll('.dec-type-row').forEach(r => r.classList.toggle('active', +r.dataset.t === msgType));
}

// ─── Step / Run ─────────────────────────────────────────────
function decStep() {
  const s = decState;
  if (!s.spec || s.stepIdx >= s.fields.length) { decFinish(); return false; }
  const field = s.fields[s.stepIdx];
  let len = field.len === 'REMAINING' ? s.bits.length - s.offset : field.len;
  if (s.offset + len > s.bits.length) len = s.bits.length - s.offset;
  if (len <= 0) { decFinish(); return false; }
  const seg = s.bits.substr(s.offset, len);
  const value = decDecodeField(field, seg);
  s.decoded[field.key] = value;
  s.offset += len;
  s.stepIdx++;
  decRenderFieldCard(field, len, value, seg);
  document.getElementById('decJson').innerHTML = decSyntaxJson(JSON.stringify(s.decoded, null, 2));
  decUpdateStatus();
  decUpdateBitTape();
  if (s.stepIdx >= s.fields.length) { decFinish(); return false; }
  return true;
}

function decRunAll() { if (decAutoTimer) { clearTimeout(decAutoTimer); decAutoTimer = null; } while (decState.stepIdx < decState.fields.length) decStep(); }

function decFinish() {
  document.getElementById('decStepBtn').disabled = true;
  const pill = document.getElementById('decStatusPill');
  pill.textContent = '✓ Complete'; pill.className = 'dec-pill complete';
  document.getElementById('decProgressFill').style.width = '100%';
}

// ─── Field decode ───────────────────────────────────────────
function decDecodeField(field, bits) {
  const raw = parseInt(bits, 2);
  switch (field.type) {
    case 'int': return raw;
    case 'rot': return raw > 127 ? raw - 256 : raw;
    case 'scaled': { const v = raw / (field.scale||1); return field.unit ? v.toFixed(1)+' '+field.unit : +v.toFixed(1); }
    case 'coord': { let v = raw; if (bits[0]==='1') v -= (1<<bits.length); return +(v/(field.div||600000)).toFixed(6); }
    case 'text6': { let t=''; for(let i=0;i<bits.length;i+=6){if(i+6>bits.length)break;const c=parseInt(bits.substr(i,6),2);t+=ASCII6[c]||'';} return t.replace(/@+$/,'').trim(); }
    case 'hex': return '0x'+raw.toString(16).toUpperCase().padStart(Math.ceil(bits.length/4),'0');
    case 'enum': return (field.map||{})[raw] ?? `${raw}`;
    default: return raw;
  }
}

// ─── UI renders ─────────────────────────────────────────────
function decUpdateStatus() {
  const s = decState;
  if (!s.spec) return;
  const pill = document.getElementById('decStatusPill');
  pill.textContent = `Type ${parseInt(s.bits.substring(0,6),2)} · ${s.spec.name}`;
  pill.className = 'dec-pill active';
  const pct = s.fields.length ? (s.stepIdx / s.fields.length * 100).toFixed(0) : 0;
  document.getElementById('decProgressFill').style.width = pct + '%';
  document.getElementById('decFieldCount').textContent = `${s.stepIdx}/${s.fields.length}`;
}

function decRenderCharmap(payload) {
  const el = document.getElementById('decCharmap');
  let html = '';
  for (let i = 0; i < payload.length; i++) {
    const ch = payload[i];
    let c = ch.charCodeAt(0) - 48; if (c > 40) c -= 8;
    html += `<div class="dec-char-cell" data-i="${i}"><span class="dec-cc-char">${ch}</span><span class="dec-cc-bits">${c.toString(2).padStart(6,'0')}</span></div>`;
  }
  el.innerHTML = html;
}

function decUpdateBitTape() {
  const s = decState;
  if (!s.bits) return;
  const field = s.fields[s.stepIdx];
  const curLen = field ? (field.len === 'REMAINING' ? s.bits.length - s.offset : Math.min(field.len, s.bits.length - s.offset)) : 0;
  document.getElementById('decBitTape').innerHTML =
    `<span class="dec-bit-done">${s.bits.slice(0,s.offset)}</span>` +
    `<span class="dec-bit-current">${s.bits.slice(s.offset,s.offset+curLen)}</span>` +
    `<span class="dec-bit-ahead">${s.bits.slice(s.offset+curLen)}</span>`;
  document.getElementById('decBitLabel').textContent = field ? `▸ ${field.name} (${curLen}b)` : '';
  document.querySelectorAll('.dec-char-cell').forEach(cell => {
    const i = +cell.dataset.i, cS = i*6, cE = cS+6;
    cell.classList.toggle('consumed', cE <= s.offset);
    cell.classList.toggle('field-active', cS >= s.offset && cS < s.offset+curLen);
  });
}

function decRenderFieldCard(field, len, value, bits) {
  const log = document.getElementById('decFieldLog');
  if (log.querySelector('.dec-empty')) log.innerHTML = '';
  const preview = bits.length > 36 ? bits.substring(0, 36) + '…' : bits;
  log.insertAdjacentHTML('beforeend',
    `<div class="dec-field-card"><div class="dec-fc-top"><span class="dec-fc-name">${field.name}</span><span class="dec-fc-len">${len}b</span></div><div class="dec-fc-value">${String(value)}</div><div class="dec-fc-bits">${preview}</div></div>`);
  log.lastElementChild.scrollIntoView({block:'nearest'});
}

function decCopyJson() {
  navigator.clipboard?.writeText(JSON.stringify(decState.decoded, null, 2));
  flash('JSON copied');
}

function decSyntaxJson(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"([^"]+)":/g,'<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g,': <span class="json-str">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g,': <span class="json-num">$1</span>');
}

// ═══════════════════════════════════════════════════════════════
// LIVE STREAM — taps into main app's NMEA WebSocket
// Throttled: decodes one message every N ms with auto-step animation
// ═══════════════════════════════════════════════════════════════
function decToggleLive() {
  decLiveActive = !decLiveActive;
  const btn = document.getElementById('decLiveBtn');
  if (decLiveActive) {
    btn.textContent = '■ Stop'; btn.classList.add('btn-primary');
    decStartLive();
  } else {
    btn.textContent = '● Live'; btn.classList.remove('btn-primary');
    decStopLive();
  }
}

function decStartLive() {
  // Connect to the same WS as the map but in NMEA mode for raw sentences
  const wsUrl = 'wss://stream.hpradar.com/ws1';
  const liveWs = new WebSocket(wsUrl);
  decState._liveWs = liveWs;
  liveWs.onmessage = (ev) => {
    const lines = ev.data.split('\n');
    for (const line of lines) {
      const l = line.trim();
      if (l.startsWith('!AIVDM') || l.startsWith('!BSVDM')) {
        // Only single-part for live demo
        const p = l.split(',');
        if (p[1] === '1') decLiveQueue.push(l);
        if (decLiveQueue.length > 100) decLiveQueue.shift();
      }
    }
  };
  liveWs.onerror = () => flash('Live WS error');
  liveWs.onclose = () => { if (decLiveActive) flash('Live disconnected'); };
  decLiveDispatch();
}

function decStopLive() {
  if (decState._liveWs) { decState._liveWs.close(); decState._liveWs = null; }
  if (decLiveTimer) { clearTimeout(decLiveTimer); decLiveTimer = null; }
  if (decAutoTimer) { clearTimeout(decAutoTimer); decAutoTimer = null; }
  decLiveQueue = [];
}

function decLiveDispatch() {
  if (!decLiveActive) return;
  if (decLiveQueue.length > 0) {
    const sentence = decLiveQueue.shift();
    document.getElementById('decNmeaField').value = sentence;
    decIngest();
    // Auto-step through fields with animation
    decAutoStep();
  }
  decLiveTimer = setTimeout(decLiveDispatch, 3000); // one message every 3s
}

function decAutoStep() {
  if (decAutoTimer) clearTimeout(decAutoTimer);
  function tick() {
    const cont = decStep();
    if (cont && decLiveActive) decAutoTimer = setTimeout(tick, 180);
  }
  decAutoTimer = setTimeout(tick, 300);
}

// ─── Keyboard ───────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (typeof currentView === 'undefined' || currentView !== 'decoder') return;
  const focused = document.activeElement === document.getElementById('decNmeaField');
  if (e.key === ' ' && !focused) { e.preventDefault(); decStep(); }
  else if (e.key === 'Enter' && focused && !e.shiftKey) { e.preventDefault(); decIngest(); }
  else if (e.key === 'Enter' && focused && e.shiftKey) { e.preventDefault(); decRunAll(); }
});
