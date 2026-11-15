# Working on Tone Tower

## Architecture

- Keep the vanilla DOM/canvas application. TypeScript application contracts live in src/types.ts; game rules belong in src/game/game-core.ts. Keep rules independent of DOM, audio and timers.
- The controller owns playback, deadlines and lifecycle. Game markup lives in src/game/game-markup.ts; credits behavior lives in src/ui/credits-dialog.ts. Canvas renderers consume snapshots and do not own scoring or navigation.
- Language profiles own transcription, tones and answer rules. Pass a profile explicitly; keep Cantonese and Mandarin progress isolated.
- Use src/site-root.ts for runtime URLs. Never derive deployed asset locations from a source module URL. Keep controls mounted when preserving keyboard focus or composition.

## Content and compatibility

- Source inventories, dictionary evidence, corrections and listening reviews live in data/. Catalogs and dist/ are generated; never edit them directly. Preserve recording IDs, attribution and licences.
- Mandarin dictionary Pinyin and estimated/reviewed spoken tones are separate. Do not describe automatic estimates as human review. Manual review remains optional for the beta.
- Use the content commands for corrections. Curation operations use their own lock; audio downloads use a separate lock. Do not bypass locks, silently merge conflicting writers or run two curation/build commands concurrently.
- Preserve storage keys, save version, catalog version, public routes and gameplay unless a task explicitly requests a compatibility change. Validate external JSON; TypeScript types do not validate runtime data.

## Tooling and checks

- Use Node 22.12 or later and npm ci. Install Chromium with npx playwright install chromium; tooling tests also require FFmpeg and FFprobe.
- npm start builds catalogs and runs Vite. npm run build generates language HTML in temporary staging, bundles source with Vite and copies only selected public content.
- Run npm run typecheck, npm run format:check, npm run test:all, npm run build and npm run check:dist for substantial changes. Run npm run test:browser for UI or publishing changes; it builds first, then tests development and production routes.
- Game tests use Vitest. Controller tests run in real Chromium DOM through Vitest Browser Mode; do not restore an artificial DOM harness. Importer/tooling tests keep Node's test runner and inherit the tsx loader.
- Keep strict TypeScript checking. Narrow unknown values and use explicit boundary types; do not hide errors with blanket any, unchecked casts or suppression comments.
- Never publish source, caches, archive-only audio or review files. Build commands must leave data/audio and data/content unchanged. Retain root and nested-path distribution checks.
- Use the OS temporary directory for screenshots and one-off artifacts. Remove superseded implementations. Do not commit, push or deploy unless requested.
