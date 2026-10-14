# जीवित कक्षा · Live Teacher Studio

Nepali-first, timeline-driven 3D teaching studio for PSC theory subjects. The front end is **Vite + TypeScript + Three.js**, provider-agnostic, and designed to build as one self-contained `dist/index.html` for free static hosting or direct `file://` use.

> **Demo warning:** all included Governance System material is labelled **DEMO — verify before use**. It is not authoritative legal, constitutional, or PSC exam guidance. Confirm all facts against the current official syllabus, Constitution, laws and official publications before teaching or publishing a recording.

## Requirements

- Windows 11 or another desktop OS
- Node.js 22 LTS/current LTS and npm
- A modern browser with WebGL 2D canvas support

## Run on Windows 11

Open PowerShell in this folder:

```powershell
npm install
npm run dev
```

Use the local URL Vite prints. For the fully local adapter/demo path, no backend or API key is needed. To test the HTTP contracts, open a second PowerShell window:

```powershell
npm run mock-server
```

The mock server listens on `http://localhost:8787`. In **Settings → API providers**, select HTTP providers individually and use that base URL. Keep the other providers on Mock/Browser if desired.

## Production single-file build

```powershell
npm run build
npm test
```

The expected build artifact is `dist/index.html`. It contains the JS, CSS, Devanagari fonts, and demo syllabus; no CDN or runtime asset file is intended. Serve the file as a static artifact or open it locally. The size check is performed after build; if it exceeds roughly 5 MB, inspect font subsets and Three.js features before adding assets.

## Modes

- **Studio/control:** `/?` (or open `dist/index.html`). Use the start button to run. The panel provides topic selection, play/pause, repeat/skip, comment injection, status, logs and a scrub-able timeline preview.
- **Settings:** `/?mode=settings` or `/settings` on a host with SPA fallback. Edit topics/notes, providers, endpoint paths, TTS settings and resolution. Import/export the editable course JSON. Settings/API tokens are stored in browser `localStorage` and are never injected at build time.
- **Broadcast/capture:** `/?mode=broadcast&autostart=1&lesson=gov-01&quality=high&lang=ne`. This renders the stage without control-panel chrome. For Puppeteer/capture, set the browser viewport to the desired stream resolution (default 1920×1080) and pass the URL flags. The page also exposes `window.__liveClass` and a small `postMessage` command interface. Without `autostart=1`, the stage waits for the capture controller to call `window.__liveClass.start()`.

URL `lesson` accepts a topic ID such as `gov-03`; `quality` accepts `low`, `medium` or `high`; `lang` accepts `ne` or `en`. Example IDs are listed in `src/data/demo/course.ts`. URL language is a capture hint; saved settings are the default provider configuration.

### Capture controller API

```js
await page.evaluate(() => window.__liveClass.start('gov-01'));
await page.evaluate(() => window.__liveClass.pause()); // toggles pause/resume
await page.evaluate(() => window.__liveClass.next());
await page.evaluate(() => window.__liveClass.pushComment({
  id: 'capture-1', author: 'दर्शक', text: 'सुशासन के हो?',
  ts: Date.now(), platform: 'youtube'
}));
const state = await page.evaluate(() => window.__liveClass.getState());
```

Equivalent parent-window messages: `{ target: 'liveClass', command: 'start', topic: 'gov-01' }`, `pause`, `next`, `stop`, and `{ target: 'liveClass', command: 'pushComment', comment: {...} }`. Only commands are accepted; message contents are never evaluated as code.

## Provider architecture

The stage only consumes validated `ActionTimeline` JSON. Replace implementations under `src/providers/` without modifying Three.js scene code. Planner, Director, TTS, CommentResponder and CommentSource each have Mock and/or HTTP adapters. HTTP calls use configurable paths and auth header/value, 12-second timeout, one retry with exponential backoff, schema validation, and safe mock fallback. Keep endpoint-specific differences inside adapters.

- `src/contracts/`: Zod request/response and action schemas
- `src/providers/`: Mock + HTTP endpoint adapters, Browser TTS, audio routing
- `src/orchestrator/`: state machine, prefetch, comment dedupe/filter/batching, pause/skip/resume, watchdog
- `src/stage/`: procedural Three.js stage, teacher, board texture, camera shots, gestures, props
- `src/ui/`: control panel and local settings/content editor
- `src/data/demo/`: six-topic Nepali demo course and prewritten timelines
- `server/mock-server.ts`: Express mock endpoints
- `docs/ENDPOINTS.md`: HTTP payload contracts and adapter rules
- `docs/DIRECTOR_PROMPTS.md`: ready-to-use prompts and few-shot examples

## Running tests

```powershell
npm test
npm run typecheck
```

Tests cover timeline anchor resolution/fallback, comment filtering/deduplication/batching/priorities, and the orchestrator state machine.

## Replacing mock endpoints

Set the base URL in Settings and switch only the desired adapter to HTTP. Keep the backend response compatible with the Zod schemas in `src/contracts/index.ts`. If your endpoint payload differs, update only the corresponding adapter in `src/providers/index.ts` (and its validation mapping). Never commit production keys or put them in `.env` files consumed by Vite. This is a static front-end; tokens entered in Settings remain available to the browser and can be inspected by a machine owner, so prefer a short-lived token or backend proxy for production.

## Model support

A procedural low-poly teacher is always available. An optional `.glb`, `.gltf` or `.vrm` file can be loaded through `StudioStage.loadModel(fileOrUrl)`. Base GLTF animations are played if present; VRM-specific expression/viseme retargeting is a documented extension point, not a guarantee of this prototype. See `docs/MODEL_RIGGING.md`.

## Known limitations

1. Nepali voice availability is browser/OS-specific. Browser `speechSynthesis` is used where possible, with a Hindi voice fallback; for stable long broadcasts use the HTTP expressive TTS provider.
2. Browser `speechSynthesis` audio cannot reliably be routed into a page `MediaStream`; HTTP audio can be routed with the shared `AudioContext` and its exposed `window.__liveAudioStream` stream. Capture pipelines must validate their audio path.
3. Speech boundary timestamps differ by browser; estimated character-rate timings keep gestures and board sync moving when boundary events are missing, but drift is possible.
4. Comment prioritization and reply text are deterministic demo heuristics until the responder endpoint is connected. Real Facebook/YouTube ingestion/post-back requires your server credentials and platform-compliant APIs.
5. Long unattended sessions should be monitored at the capture layer. A watchdog advances a stuck segment and provider failures fall back to demo actions, but no browser app can prevent an OS/browser crash.
6. The procedural body has simple gestures and expressions, not production-grade retargeting. VRM morph targets and a full phoneme/viseme rig need model-specific mapping.
7. Course persistence uses localStorage; the interface is isolated behind `src/utils/storage.ts` so IndexedDB/Firestore/backend storage can be substituted later.

## License

Private project scaffold. Add a license appropriate to your intended distribution and any model/font assets you later include.
