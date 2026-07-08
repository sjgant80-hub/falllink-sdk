// FallLink SDK · reusable WebRTC P2P library
// MIT · AI-Native Solutions · https://github.com/sjgant80-hub/falllink-sdk
//
// One connection layer every tool imports.
// STUN NAT traversal + BroadcastChannel (same-origin auto) + manual offer/answer paste (cross-network).
//
// Browser primary. In Node 20+, provide an RTCPeerConnection polyfill (e.g. @roamhq/wrtc) on globalThis.

const DEFAULT_STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];
const DEFAULT_SIGNAL_CHANNEL = 'fall-signal';
const DEFAULT_BOOTSTRAP = [];

function _randId(prefix = 'peer') {
  return prefix + '-' + Math.random().toString(36).slice(2, 10);
}

function _b64encode(obj) {
  const json = JSON.stringify(obj);
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(json)));
  return Buffer.from(json, 'utf8').toString('base64');
}
function _b64decode(str) {
  const s = String(str).trim();
  if (typeof atob === 'function') return JSON.parse(decodeURIComponent(escape(atob(s))));
  return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
}

function _waitForIce(pc, timeoutMs = 4000) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    let done = false;
    const finish = () => { if (!done) { done = true; res(); } };
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') finish();
    });
    setTimeout(finish, timeoutMs);
  });
}

// Minimal EventTarget shim for environments without one.
const _ET = typeof EventTarget === 'function' ? EventTarget : class {
  constructor() { this._l = new Map(); }
  addEventListener(t, fn) { if (!this._l.has(t)) this._l.set(t, new Set()); this._l.get(t).add(fn); }
  removeEventListener(t, fn) { this._l.get(t)?.delete(fn); }
  dispatchEvent(ev) { this._l.get(ev.type)?.forEach(fn => fn(ev)); return true; }
};
const _CE = typeof CustomEvent === 'function' ? CustomEvent : class {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};

export class FallLink extends _ET {
  constructor(opts = {}) {
    super();
    this.stunServers = opts.stunServers || DEFAULT_STUN;
    this.bootstrapPeers = opts.bootstrapPeers || DEFAULT_BOOTSTRAP;
    this.signalChannel = opts.signalChannel || DEFAULT_SIGNAL_CHANNEL;
    this.ownId = opts.ownId || _randId('self');
    this.peers = new Map();
    this._bc = null;
    this._broadcasting = false;
    this._pingIntervalMs = opts.pingIntervalMs || 3000;
  }

  // ---- events ----
  on(type, fn) {
    const handler = (ev) => fn(ev.detail);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }
  _emit(type, detail) {
    this.dispatchEvent(new _CE(type, { detail }));
  }

  // ---- peer wrapper ----
  _wrap(peerId, pc, initiator) {
    const self = this;
    const wrapper = {
      peerId,
      state: 'connecting',
      latency: null,
      dataChannel: null,
      _pc: pc,
      _pingIv: null,
      initiator,
      addedAt: Date.now(),
      send(msg) {
        const dc = this.dataChannel;
        if (!dc || dc.readyState !== 'open') return false;
        const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
        try { dc.send(payload); return true; } catch { return false; }
      },
      close() {
        try { this._pingIv && clearInterval(this._pingIv); } catch {}
        try { this.dataChannel && this.dataChannel.close(); } catch {}
        try { this._pc && this._pc.close(); } catch {}
        self.peers.delete(this.peerId);
        this.state = 'closed';
        self._emit('disconnect', { peerId: this.peerId });
      }
    };
    this.peers.set(peerId, wrapper);

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') wrapper.state = 'connected';
      else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
        wrapper.state = 'failed';
        self._emit('disconnect', { peerId: wrapper.peerId });
      } else wrapper.state = 'connecting';
    };
    pc.ondatachannel = (ev) => this._wireDataChannel(wrapper, ev.channel);
    if (initiator) {
      const dc = pc.createDataChannel('falllink', { ordered: true });
      this._wireDataChannel(wrapper, dc);
    }
    return wrapper;
  }

  _wireDataChannel(wrapper, dc) {
    wrapper.dataChannel = dc;
    dc.onopen = () => {
      wrapper.state = 'connected';
      try { dc.send(JSON.stringify({ __fl: 'hello', id: this.ownId })); } catch {}
      this._startPing(wrapper);
      this._emit('peer', { peerId: wrapper.peerId, wrapper });
    };
    dc.onclose = () => {
      wrapper.state = 'failed';
      this._emit('disconnect', { peerId: wrapper.peerId });
    };
    dc.onmessage = (ev) => this._handleMessage(wrapper, ev.data);
  }

  _startPing(wrapper) {
    wrapper._pingIv = setInterval(() => {
      const dc = wrapper.dataChannel;
      if (!dc || dc.readyState !== 'open') { clearInterval(wrapper._pingIv); return; }
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      try { dc.send(JSON.stringify({ __fl: 'ping', t })); } catch {}
    }, this._pingIntervalMs);
  }

  _handleMessage(wrapper, data) {
    let parsed = data;
    try { parsed = JSON.parse(data); } catch {}
    if (parsed && parsed.__fl === 'ping') {
      try { wrapper.dataChannel.send(JSON.stringify({ __fl: 'pong', t: parsed.t })); } catch {}
      return;
    }
    if (parsed && parsed.__fl === 'pong') {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      wrapper.latency = Math.round(now - parsed.t);
      this._emit('latency', { peerId: wrapper.peerId, latency: wrapper.latency });
      return;
    }
    if (parsed && parsed.__fl === 'hello') {
      wrapper.remoteId = parsed.id;
      return;
    }
    this._emit('message', { peerId: wrapper.peerId, data: parsed, wrapper });
  }

  // ---- public API ----
  async connect(peerId, offer) {
    const pc = new RTCPeerConnection({ iceServers: this.stunServers });
    const wrapper = this._wrap(peerId || _randId('peer'), pc, !offer);
    if (offer) {
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
    } else {
      const ofr = await pc.createOffer();
      await pc.setLocalDescription(ofr);
    }
    return wrapper;
  }

  async createOffer() {
    const peerId = _randId('offer');
    const pc = new RTCPeerConnection({ iceServers: this.stunServers });
    const wrapper = this._wrap(peerId, pc, true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await _waitForIce(pc);
    const bundle = _b64encode({
      __fl: 'offer',
      from: this.ownId,
      peerId,
      sdp: pc.localDescription
    });
    return { bundle, peerId, wrapper };
  }

  async acceptOffer(offerBundle) {
    const payload = _b64decode(offerBundle);
    if (payload.__fl !== 'offer') throw new Error('Not a FallLink offer bundle');
    const pc = new RTCPeerConnection({ iceServers: this.stunServers });
    const wrapper = this._wrap(payload.peerId || _randId('peer'), pc, false);
    wrapper.remoteId = payload.from;
    await pc.setRemoteDescription(payload.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await _waitForIce(pc);
    const bundle = _b64encode({
      __fl: 'answer',
      from: this.ownId,
      peerId: wrapper.peerId,
      sdp: pc.localDescription
    });
    return { bundle, peerId: wrapper.peerId, wrapper };
  }

  async acceptAnswer(answerBundle) {
    const payload = _b64decode(answerBundle);
    if (payload.__fl !== 'answer') throw new Error('Not a FallLink answer bundle');
    const wrapper = this.peers.get(payload.peerId);
    if (!wrapper) throw new Error('No pending offer with peerId ' + payload.peerId);
    wrapper.remoteId = payload.from;
    await wrapper._pc.setRemoteDescription(payload.sdp);
    return wrapper;
  }

  broadcast(msg) {
    let sent = 0;
    for (const w of this.peers.values()) {
      if (w.send(msg)) sent++;
    }
    return sent;
  }

  getPeers() {
    return [...this.peers.values()].map(w => ({
      peerId: w.peerId,
      remoteId: w.remoteId || null,
      state: w.state,
      latency: w.latency,
      initiator: w.initiator,
      addedAt: w.addedAt
    }));
  }

  async ping(peerId) {
    const w = this.peers.get(peerId);
    if (!w || !w.dataChannel || w.dataChannel.readyState !== 'open') return null;
    return new Promise((res) => {
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const timeout = setTimeout(() => { off(); res(null); }, 5000);
      const off = this.on('latency', (d) => {
        if (d.peerId === peerId) {
          clearTimeout(timeout);
          off();
          res(d.latency);
        }
      });
      try { w.dataChannel.send(JSON.stringify({ __fl: 'ping', t })); } catch { clearTimeout(timeout); off(); res(null); }
    });
  }

  // ---- BroadcastChannel auto-discovery (same origin) ----
  startBroadcast() {
    if (this._broadcasting) return;
    try {
      this._bc = new BroadcastChannel(this.signalChannel);
      this._broadcasting = true;
      this._bc.onmessage = (ev) => this._handleBc(ev.data);
      const announce = () => {
        if (this._broadcasting) this._bc.postMessage({ __fl: 'announce', from: this.ownId, ts: Date.now() });
      };
      announce();
      this._bcIv = setInterval(announce, 5000);
      this._emit('broadcast', { on: true });
    } catch (e) {
      this._emit('error', { where: 'startBroadcast', error: e.message });
    }
  }

  stopBroadcast() {
    if (!this._broadcasting) return;
    this._broadcasting = false;
    try { clearInterval(this._bcIv); } catch {}
    try { this._bc && this._bc.close(); } catch {}
    this._bc = null;
    this._emit('broadcast', { on: false });
  }

  async _handleBc(msg) {
    if (!msg || !msg.from || msg.from === this.ownId) return;
    if (msg.__fl === 'announce') {
      if (this._peerByRemote(msg.from)) return;
      // deterministic initiator: lower ownId wins
      if (this.ownId < msg.from) {
        const pc = new RTCPeerConnection({ iceServers: this.stunServers });
        const wrapper = this._wrap(msg.from, pc, true);
        wrapper.remoteId = msg.from;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await _waitForIce(pc);
        this._bc.postMessage({ __fl: 'bc-offer', from: this.ownId, to: msg.from, sdp: pc.localDescription });
      }
    } else if (msg.__fl === 'bc-offer' && msg.to === this.ownId) {
      if (this._peerByRemote(msg.from)) return;
      const pc = new RTCPeerConnection({ iceServers: this.stunServers });
      const wrapper = this._wrap(msg.from, pc, false);
      wrapper.remoteId = msg.from;
      await pc.setRemoteDescription(msg.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await _waitForIce(pc);
      this._bc.postMessage({ __fl: 'bc-answer', from: this.ownId, to: msg.from, sdp: pc.localDescription });
    } else if (msg.__fl === 'bc-answer' && msg.to === this.ownId) {
      const wrapper = this.peers.get(msg.from);
      if (!wrapper) return;
      await wrapper._pc.setRemoteDescription(msg.sdp);
    }
  }

  _peerByRemote(remoteId) {
    for (const w of this.peers.values()) if (w.remoteId === remoteId || w.peerId === remoteId) return w;
    return null;
  }

  destroy() {
    this.stopBroadcast();
    for (const w of [...this.peers.values()]) w.close();
    this.peers.clear();
  }
}

// Signaling helpers exposed for API/MCP wrappers that do not run a browser session.
export function encodeBundle(obj) { return _b64encode(obj); }
export function decodeBundle(str) { return _b64decode(str); }
export const DEFAULTS = { STUN: DEFAULT_STUN, SIGNAL_CHANNEL: DEFAULT_SIGNAL_CHANNEL };

export default FallLink;
