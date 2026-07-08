# @ai-native-solutions/falllink-sdk

Reusable WebRTC P2P library. **One connection layer every tool imports.**

- STUN NAT traversal (Google + Cloudflare public STUN by default)
- `BroadcastChannel` same-origin auto-discovery
- Manual offer/answer paste for cross-network handshakes (base64 bundles: SDP + ICE)
- Ordered data channels, ping/pong latency, kick, broadcast to all
- Zero server dependencies. Sovereign — state lives in the browser.
- MIT.

## Install

```bash
npm install @ai-native-solutions/falllink-sdk
```

Or vendor as ESM:

```html
<script type="module">
  import { FallLink } from 'https://sjgant80-hub.github.io/falllink-sdk/src/index.js';
</script>
```

## Quick start

```js
import { FallLink } from '@ai-native-solutions/falllink-sdk';

const link = new FallLink({ ownId: 'my-node' });

// same-origin auto-discovery
link.startBroadcast();

link.on('peer', ({ peerId }) => console.log('peer up', peerId));
link.on('message', ({ peerId, data }) => console.log(peerId, data));

link.broadcast({ type: 'hello', from: 'me' });
```

## Cross-network handshake

```js
// Alice
const { bundle: offer, peerId } = await link.createOffer();
// send `offer` to Bob out of band

// Bob
const { bundle: answer } = await link.acceptOffer(offer);
// send `answer` back to Alice

// Alice
await link.acceptAnswer(answer);
```

## API surface

```js
// construction
new FallLink({
  ownId?,                // string, defaults to random
  stunServers?,          // [{ urls }] array; defaults to Google + Cloudflare public STUN
  bootstrapPeers?,       // reserved for future signaling backends
  signalChannel?,        // string, defaults to 'fall-signal'
  pingIntervalMs?        // number, defaults to 3000
});

// discovery
link.startBroadcast();
link.stopBroadcast();

// manual signaling (cross-network paste)
const { bundle, peerId, wrapper } = await link.createOffer();
const { bundle }                  = await link.acceptOffer(offerBundle);
await link.acceptAnswer(answerBundle);

// direct control
const wrapper = await link.connect(peerId, offer?);
link.broadcast(msg);       // -> number of peers reached
link.getPeers();           // -> [{ peerId, state, latency, ... }]
await link.ping(peerId);   // -> latency ms
link.destroy();

// events
link.on('peer',       ({ peerId, wrapper }) => {});
link.on('message',    ({ peerId, data })    => {});
link.on('disconnect', ({ peerId })          => {});
link.on('latency',    ({ peerId, latency }) => {});
link.on('broadcast',  ({ on })              => {});
link.on('error',      ({ where, error })    => {});
```

## Environment

Browser primary target (Chrome 113+ tested). In Node 20+, provide an `RTCPeerConnection` polyfill (e.g. `@roamhq/wrtc`) on `globalThis` before importing.

## Companion packages

- [`@ai-native-solutions/falllink-mcp`](https://github.com/sjgant80-hub/falllink-mcp) — Model Context Protocol server (stdio) wrapping the signaling primitives for agent workflows.
- [`@ai-native-solutions/falllink-api`](https://github.com/sjgant80-hub/falllink-api) — Express HTTP wrapper for services that want to encode/decode bundles or run a headless peer.

## Playground

Open [`docs/index.html`](docs/index.html) locally or at <https://sjgant80-hub.github.io/falllink-sdk/> — same-origin BroadcastChannel demo, open in two tabs.

## License

MIT · AI-Native Solutions · 2026.
