// ═══════════════════════════════════════════════════════════════
// DECODER VIEW — Full AIS bit-slice decoder (SPA view)
// Shares payloadToBits, bitsToInt, bitsToText from app.js
// ═══════════════════════════════════════════════════════════════

const SPEC_ATLAS = {
  1:{name:"Position Report (Class A)",cat:"position",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Nav Status",len:4,type:"int",key:"nav_status"},
    {name:"ROT",len:8,type:"rot",key:"rot"},{name:"SOG",len:10,type:"scaled",key:"sog",scale:10,unit:"kn"},
    {name:"Pos Accuracy",len:1,type:"int",key:"pos_acc"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
    {name:"COG",len:12,type:"scaled",key:"cog",scale:10,unit:"°"},
    {name:"Heading",len:9,type:"int",key:"heading"},{name:"Timestamp",len:6,type:"int",key:"ts_sec"},
  ]},
  2:{name:"Position Report (Assigned)",cat:"position",inherit:1},
  3:{name:"Position Report (Special)",cat:"position",inherit:1},
  5:{name:"Static & Voyage Data",cat:"static",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"IMO",len:30,type:"int",key:"imo"},
    {name:"Call Sign",len:42,type:"text6",key:"callsign"},{name:"Name",len:120,type:"text6",key:"name"},
    {name:"Ship Type",len:8,type:"int",key:"shiptype"},
    {name:"To Bow",len:9,type:"int",key:"to_bow"},{name:"To Stern",len:9,type:"int",key:"to_stern"},
    {name:"To Port",len:6,type:"int",key:"to_port"},{name:"To Starboard",len:6,type:"int",key:"to_stbd"},
    {name:"Draught",len:8,type:"scaled",key:"draught",scale:10,unit:"m"},
    {name:"Destination",len:120,type:"text6",key:"destination"},
  ]},
  18:{name:"Class B Position",cat:"position",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Spare",len:8,type:"int",key:"spare"},
    {name:"SOG",len:10,type:"scaled",key:"sog",scale:10,unit:"kn"},
    {name:"Pos Accuracy",len:1,type:"int",key:"accuracy"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
    {name:"COG",len:12,type:"scaled",key:"cog",scale:10,unit:"°"},
    {name:"Heading",len:9,type:"int",key:"heading"},{name:"Timestamp",len:6,type:"int",key:"ts"},
  ]},
  21:{name:"Aids to Navigation",cat:"static",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"AtoN Type",len:5,type:"int",key:"aton_type"},
    {name:"Name",len:120,type:"text6",key:"name"},{name:"Accuracy",len:1,type:"int",key:"accuracy"},
    {name:"Longitude",len:28,type:"coord",key:"lon",div:600000},
    {name:"Latitude",len:27,type:"coord",key:"lat",div:600000},
  ]},
  24:{name:"Class B Static",cat:"static",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Part",len:2,type:"int",key:"part"},
    {name:"Name/Type",len:120,type:"text6",key:"data"},
  ]},
  27:{name:"Long Range",cat:"position",fields:[
    {name:"Message ID",len:6,type:"int",key:"msg_id"},{name:"Repeat",len:2,type:"int",key:"repeat"},
    {name:"MMSI",len:30,type:"int",key:"mmsi"},{name:"Accuracy",len:1,type:"int",key:"accuracy"},
    {name:"RAIM",len:1,type:"int",key:"raim"},{name:"Nav Status",len:4,type:"int",key:"nav_status"},
    {name:"Longitude",len:18,type:"coord",key:"lon",div:600},
    {name:"Latitude",len:17,type:"coord",key:"lat",div:600},
    {name:"SOG",len:6,type:"scaled",key:"sog",scale:2,unit:"kn"},
    {name:"COG",len:9,type:"scaled",key:"cog",scale:2,unit:"°"},
  ]},
};
// Inherit types 2,3
for (const t of [2,3]) SPEC_ATLAS[t].fields = SPEC_ATLAS[1].fields.map(f=>({...f}));

const SAMPLES = {
  1:"!AIVDM,1,1,,A,18SK4D@P00W`P1<;tDs9qOvN20Ro,0*45",
  5:"!AIVDM,2,1,1,B,55?HFl02B9>I=H@@@@@d4v0F@DUI10th000000160hJ220eed00000000000,0*26",
  18:"!AIVDM,1,1,,B,239N6b0001P6vptN4I5`00000000,0*3D",
  21:"!AIVDM,1,1,,B,E1mg=b021`@000000000000000000000000000000000,0*60",
  24:"!AIVDM,1,1,,A,839N6b0000H`P000,4*59",
  27:"!AIVDM,1,1,,A,KC5E2b@e=h0000000,0*16",
};

const DEC_CATS = { position:"Position", static:"Static/Voyage" };

let decState = { bits:"", spec:null, fields:[], stepIdx:0, offset:0, decoded:{} };
let decInited = false;
let decLiveActive = false, decLiveTimer = null;

function decInit() {
  if (decInited) return;
  decInited = true;
  decBuildSidebar();
  decIngest();
}

function decBuildSidebar() {
  const el = document.getElementById('decTypeTree');
  let html = '';
  const cats = {};
  for (const [id, spec] of Object.entries(SPEC_ATLAS)) {
    const c = spec.cat || 'other';
    if (!cats[c]) cats[c] = [];
    cats[c].push([id, spec]);
  }
  for (const [cat, types] of Object.entries(cats)) {
    html += `<div class="dec-cat-label">${DEC_CATS[cat] || cat}</div>`;
    for (const [id, spec] of types) {
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

function decIngest(forceType) {
  const raw = document.getElementById('decNmeaField').value.trim();
  const parts = raw.split(',');
  if (parts.length < 6) return;
  const payload = parts[5];
  const bits = payloadToBits(payload);
  const msgType = forceType || parseInt(bits.substring(0, 6), 2);
  const spec = SPEC_ATLAS[msgType];
  if (!spec) return;

  // Envelope
  const headers = ["Talker","Frags","Part","ID","Chan","Payload"];
  let envHtml = '';
  for (let i = 0; i < Math.min(6, parts.length); i++) {
    envHtml += `<div class="dec-env-card${i===5?' hl':''}"><div class="dec-env-label">${headers[i]}</div><div class="dec-env-value">${parts[i]}</div></div>`;
  }
  document.getElementById('decEnvelope').innerHTML = envHtml;

  // State
  decState = { bits, spec, fields: spec.fields.map(f=>({...f})), stepIdx: 0, offset: 0, decoded: {} };
  document.getElementById('decFieldLog').innerHTML = '<div class="dec-empty">Press Step or Space</div>';
  document.getElementById('decJson').textContent = '{}';
  document.getElementById('decStepBtn').disabled = false;
  decUpdateStatus();
  decRenderCharmap(payload);
  decUpdateBitTape();
  // Highlight sidebar
  document.querySelectorAll('.dec-type-row').forEach(r => r.classList.toggle('active', r.dataset.t == msgType));
}

function decStep() {
  const s = decState;
  if (!s.spec || s.stepIdx >= s.fields.length) { decFinish(); return false; }
  const field = s.fields[s.stepIdx];
  let len = field.len === 'REMAINING' ? s.bits.length - s.offset : field.len;
  if (s.offset + len > s.bits.length) len = s.bits.length - s.offset;
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

function decRunAll() { while (decState.stepIdx < decState.fields.length) decStep(); }

function decFinish() {
  document.getElementById('decStepBtn').disabled = true;
  const pill = document.getElementById('decStatusPill');
  pill.textContent = '✓ Complete'; pill.className = 'dec-pill complete';
  document.getElementById('decProgressFill').style.width = '100%';
}

function decDecodeField(field, bits) {
  const raw = parseInt(bits, 2);
  switch (field.type) {
    case 'int': return raw;
    case 'rot': return raw > 127 ? raw - 256 : raw;
    case 'scaled': { const v = raw / (field.scale||1); return field.unit ? v.toFixed(1)+' '+field.unit : +v.toFixed(1); }
    case 'coord': { let v = raw; if (bits[0]==='1') v -= (1<<bits.length); return +(v/(field.div||600000)).toFixed(6); }
    case 'text6': { let t=''; for(let i=0;i<bits.length;i+=6){const c=parseInt(bits.substr(i,6),2);t+=ASCII6[c]||'';} return t.replace(/@+$/,'').trim(); }
    default: return raw;
  }
}

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
    const bits = c.toString(2).padStart(6, '0');
    html += `<div class="dec-char-cell" data-i="${i}"><span class="dec-cc-char">${ch}</span><span class="dec-cc-bits">${bits}</span></div>`;
  }
  el.innerHTML = html;
}

function decUpdateBitTape() {
  const s = decState;
  if (!s.bits) return;
  const field = s.fields[s.stepIdx];
  const curLen = field ? (field.len === 'REMAINING' ? s.bits.length - s.offset : field.len) : 0;
  document.getElementById('decBitTape').innerHTML =
    `<span class="dec-bit-done">${s.bits.slice(0,s.offset)}</span>` +
    `<span class="dec-bit-current">${s.bits.slice(s.offset,s.offset+curLen)}</span>` +
    `<span class="dec-bit-ahead">${s.bits.slice(s.offset+curLen)}</span>`;
  document.getElementById('decBitLabel').textContent = field ? `▸ ${field.name} (${curLen}b)` : '';
  // Highlight charmap
  document.querySelectorAll('.dec-char-cell').forEach(cell => {
    const i = +cell.dataset.i, cS = i*6, cE = cS+6;
    cell.classList.toggle('consumed', cE <= s.offset);
    cell.classList.toggle('field-active', cS >= s.offset && cE <= s.offset+curLen);
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

function decCopyJson() { navigator.clipboard?.writeText(JSON.stringify(decState.decoded, null, 2)); }

function decSyntaxJson(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"([^"]+)":/g,'<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g,': <span class="json-str">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g,': <span class="json-num">$1</span>');
}

// Live stream: tap into main WS for raw NMEA (only works in NMEA mode)
function decToggleLive() {
  decLiveActive = !decLiveActive;
  const btn = document.getElementById('decLiveBtn');
  btn.classList.toggle('btn-primary', decLiveActive);
  btn.textContent = decLiveActive ? '■ Stop' : '● Live';
  if (decLiveActive) {
    decLiveTimer = setInterval(() => {
      // Grab latest NMEA from msgBuf if available
      if (typeof msgBuf !== 'undefined' && msgBuf.length) {
        const line = msgBuf[msgBuf.length - 1].split('\n').find(l => l.startsWith('!AIVDM'));
        if (line) { document.getElementById('decNmeaField').value = line.trim(); decIngest(); decRunAll(); }
      }
    }, 2000);
  } else {
    clearInterval(decLiveTimer); decLiveTimer = null;
  }
}

// Keyboard: Space=step, Enter=decode in decoder view
document.addEventListener('keydown', e => {
  if (currentView !== 'decoder') return;
  const focused = document.activeElement === document.getElementById('decNmeaField');
  if (e.key === ' ' && !focused) { e.preventDefault(); decStep(); }
  else if (e.key === 'Enter' && focused) { e.preventDefault(); decIngest(); }
});
