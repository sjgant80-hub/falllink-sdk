// falllink SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from falllink/index.html · 7209 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

import { FallLink } from './falllink.js';
const ownId = 'demo-' + Math.random().toString(36).slice(2, 8);
const link = new FallLink({ ownId });
function log(msg, kind='info') {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const div = document.createElement('div');
  div.className = 'l ' + kind;
  div.innerHTML = `<span class="t">${t}</span><span class="m">${escapeHtml(msg)}</span>`;
  el.insertBefore(div, el.firstChild);
  while (el.children.length > 80) el.removeChild(el.lastChild);
}
function escapeHtml(s) { return String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }
function shortId(id) { return String(id || '').slice(0, 10); }
function renderAll() {
  const peers = link.getPeers();
  const connected = peers.filter(p => p.state === 'connected').length;
  b1.textContent = link._broadcasting ? 'Broadcasting…' : '▸ Start same-origin broadcast';
  b2.textContent = link._broadcasting ? 'Broadcasting…' : 'Start broadcasting';
  if (!peers.length) {
    el.innerHTML = '<div class="empty">No peers yet. Open another tab and click "Start broadcasting" on both.</div>';
    return;
  }
  el.innerHTML = peers.map(p => {
    const lat = p.latency == null ? '—' : p.latency + 'ms';
    const latCls = p.latency == null ? '' : (p.latency < 60 ? 'good' : p.latency < 180 ? 'mid' : 'bad');
    return `<div class="peer ${p.state}">
      <span class="dot"></span>
      <span class="id"><span class="short">${escapeHtml(shortId(p.peerId))}</span>${escapeHtml((p.peerId||'').slice(10))}</span>
      <span class="state">${escapeHtml(p.state)}</span>
      <span class="latency ${latCls}">${escapeHtml(lat)}</span>
      <button class="kick" data-id="${escapeHtml(p.peerId)}">Kick</button>
    </div>`;
  }).join('');
  el.querySelectorAll('.kick').forEach(b => b.onclick = () => {
    const w = link.peers.get(b.dataset.id);
    if (w) { w.close(); log('Kicked ' + shortId(b.dataset.id), 'amber'); renderAll(); }
  });
}
// tabs
  t.onclick = () => {
    t.classList.add('on');
  };
});
// events
link.on('peer', ({ peerId }) => { log('Peer up · ' + shortId(peerId), 'sage'); renderAll(); });
link.on('message', ({ peerId, data }) => {
  const preview = typeof data === 'string' ? data : JSON.stringify(data);
});
link.on('disconnect', ({ peerId }) => { log('Disconnect · ' + shortId(peerId), 'coral'); renderAll(); });
link.on('latency', () => renderAll());
link.on('broadcast', ({ on }) => { log('Broadcast ' + (on ? 'started' : 'stopped'), on ? 'sage' : 'amber'); renderAll(); });
link.on('error', ({ where, error }) => log('Error · ' + where + ' · ' + error, 'coral'));
// buttons
  const peers = link.getPeers();
  if (!peers.length) { log('No peers to ping', 'amber'); return; }
  for (const p of peers) {
    const lat = await link.ping(p.peerId);
    log('Ping ' + shortId(p.peerId) + ' → ' + (lat == null ? 'timeout' : lat + 'ms'), lat == null ? 'coral' : 'sage');
  }
};
  const msg = inp.value.trim();
  if (!msg) return;
  const n = link.broadcast({ __app: 'falllink-demo', text: msg, from: ownId });
  log('Broadcast → ' + n + ' peer(s): ' + msg, 'sage');
  inp.value = '';
};
let pendingOfferPeerId = null;
  btn.textContent = 'Gathering ICE…'; btn.disabled = true;
  try {
    const { bundle, peerId } = await link.createOffer();
    pendingOfferPeerId = peerId;
    ta.value = bundle;
    btn.textContent = 'Ready · offer above'; btn.disabled = false;
    log('Offer bundle created · share with peer', 'amber');
  } catch (e) { btn.textContent = 'Create offer bundle'; btn.disabled = false; log('Offer failed: ' + e.message, 'coral'); }
};
  if (!raw) { alert('Paste an answer bundle first.'); return; }
  try {
    await link.acceptAnswer(raw);
    log('Answer applied · handshake sealed', 'sage');
  } catch (e) { alert('Bad answer: ' + e.message); }
};
  if (!raw) { alert('Paste an offer bundle first.'); return; }
  btn.textContent = 'Gathering ICE…'; btn.disabled = true;
  try {
    const { bundle } = await link.acceptOffer(raw);
    outTa.value = bundle;
    btn.textContent = 'Ready · answer above'; btn.disabled = false;
    log('Answer bundle created · send back to inviter', 'amber');
  } catch (e) { btn.textContent = 'Generate answer'; btn.disabled = false; alert('Bad offer: ' + e.message); }
};
  ta.select(); document.execCommand('copy'); log('Offer copied', 'sage');
};
  ta.select(); document.execCommand('copy'); log('Answer copied', 'sage');
};
log('FallLink demo ready · node ' + ownId, 'sage');
log('Open a second tab and click Broadcast on both', 'amber');
renderAll();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Named exports for the primary API surface
export { log };
export { escapeHtml };
export { shortId };
export { renderAll };


