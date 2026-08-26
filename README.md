# Crush the Castle

A browser physics siege game in the spirit of *Crush the Castle* (Armor Games, 2009): fire a trebuchet at a
procedurally generated castle and clear every occupant. Everything runs client-side — no backend, no database,
no accounts.

## Stack

- TypeScript (strict mode)
- Vite
- PixiJS v8 for rendering (WebGPU with automatic WebGL fallback)
- `@dimforge/rapier2d-compat` (WASM) for physics — runs identically in the browser and in Node
- Vitest for tests
- GitHub Actions → GitHub Pages

No React, no game-engine wrapper, no state-management library.

## Architecture

```
src/
  core/          simulation, physics, trebuchet, kill logic — zero browser deps, runs unchanged in Node
  gen/           grammar-based castle generator, validator/difficulty sweep, campaign + daily-seed pipeline
  render/        Pixi stage, camera, interpolation, sprite/atlas abstraction
  ui/            hash router, menus, level select, HUD, gameplay loop
  main.ts
tools/
  validate.ts               re-sweeps every committed campaign pack; fails CI on any unsolvable level
  gen-campaigns.ts           generates + validates the shipped packs into public/campaigns/
  make-placeholder-atlas.ts  placeholder art pipeline (see below)
tests/
public/
  campaigns/     committed, pre-validated level packs (npm run gen:campaigns writes these)
  atlas/         placeholder texture atlas (npm run gen:atlas writes these)
```

**`src/core` imports nothing from Pixi, the DOM, or `window`.** It's enforced by an ESLint rule
(`eslint.config.js`, scoped to `src/core/**`) that blocks `pixi.js`, `render/`, `ui/`, and browser globals like
`window`/`document`/`localStorage`/`requestAnimationFrame`. This is what lets `tools/validate.ts` and the
generator's settle-pass run headless in Node — the exact same simulation code the browser runs.

Rendering reads simulation state each frame (`Sim.snapshot()`); it never writes to it.

## Determinism

Physics runs on a fixed 1/240s accumulator (`src/core/sim.ts`), decoupled from render frame rate; the renderer
interpolates between the last two snapshots. All simulation-affecting randomness goes through a seeded
`mulberry32` PRNG (`src/core/rng.ts`) — `Math.random` is banned there by lint, reserved for cosmetic-only use.
`tests/determinism.test.ts` runs a fixed shot 50 times and asserts a bit-identical final snapshot.

**Caveat on "identical across browser and Node":** Rapier's own math is WASM, and WASM floating-point
operations are specified to be bit-reproducible everywhere — that part of the determinism story is solid. The
generator and trebuchet setup, however, also do a modest amount of plain-JS trigonometry (`Math.cos`/`sin`) to
place bodies. IEEE 754 guarantees `+ - * / sqrt` are correctly rounded and thus consistent across engines;
transcendental functions like `sin`/`cos` are **not** covered by that guarantee, and different JS engines
(V8 vs. SpiderMonkey vs. JavaScriptCore) can legitimately return results that differ in the last bit. In
practice V8 (Chrome, Edge, and the Node this repo tests in) uses fdlibm for these and is self-consistent, so
the acceptance criterion holds within that engine family; true cross-engine (Firefox/Safari) bit-identity
isn't guaranteed by the current design. If that turns out to matter, the fix is a small portable/table-based
trig implementation shared by `gen/` and `trebuchet.ts`, swapped in for `Math.cos`/`sin` in exactly those two
places — flagging it here now rather than quietly hoping it doesn't bite.

## Trebuchet model

`src/core/trebuchet.ts` builds a real jointed rig: a fixed base, a revolute-jointed arm, a counterweight
hanging freely off the short end, and a sling ending in the payload. Two clicks: the first un-freezes the arm
and counterweight (they start `kinematicPositionBased`, i.e. cocked and motionless, and only become dynamic on
the first click — that's what lets the player choose *when* the swing starts); the second removes the joint
holding the payload to the sling, releasing it as a free CCD-enabled projectile. Release timing alone
determines the arc, exactly as on a real trebuchet.

**Known limitation, called out per the brief's own instruction to flag rather than silently work around:**
early prototyping used a 3-segment sling, which turned out to be chaotically sensitive to release timing —
the landing point could swing by tens of metres for a 1-tick difference in release, badly defeating a headless
grid-search validator. Dropping to a single sling segment (`DEFAULT_TREBUCHET_CONFIG.slingSegments`) cut that
sensitivity a lot but not entirely; the arm–counterweight–sling–payload system is still a compound pendulum
and some residual chaos remains. The generator currently compensates by keeping occupants concentrated (one
floor, 1–2 people) rather than spread across a whole tall castle, and the validator repeats *one* shot up to
`ammo` times rather than searching truly independent shots per volley — both are pragmatic scope cuts for this
pass, not fundamental limits of the architecture. The natural next step, with visual feedback in hand, is
either more joint damping/solver iterations or an actual multi-shot combinatorial search in `evaluateLevel`.

## Level format & generator

A level is JSON (`src/core/types.ts: Level`) and reconstructible from `{ archetype, seed }` alone —
`src/gen/generate.ts` is a pure function of the seed. Both paths (loading committed JSON, or regenerating from
the seed string) produce the identical level; that's what lets the daily seed regenerate client-side while
campaign packs ship pre-generated.

`src/gen/archetypes.ts` builds five archetypes (tower, keep, bridge, gatehouse, hanging) from placement
grammar rather than random block scattering, using shared helpers in `src/gen/blocks.ts`. Every candidate runs
a 2-second headless settle pass (`src/gen/settle.ts`) before being accepted — a structure that visibly creeps
under its own weight beyond a (generous, joint-compliance-aware) tolerance is rejected and regenerated with a
derived seed.

`src/gen/evaluate.ts` sweeps a grid of (release timing, counterweight mass) shot parameters against a
candidate level. Zero winning combinations → reject. Over half the grid winning on shot one → reject as
trivial. The winning fraction, inverted, is the difficulty score.

## Campaign & daily pipeline

- **`npm run gen:campaigns`** runs the generator + validator and writes `public/campaigns/*.json` — three
  packs, difficulty-sorted, committed so the live site never generates anything at request time.
- **Daily seed** (`src/gen/daily.ts`): the client derives a seed from the UTC date, generates one level, and
  runs an abbreviated validation sweep before showing it; on failure it increments a counter into the seed and
  retries — same mechanism the campaign builder uses, so both are provably consistent.
- **Routing** is hash-based (`#/campaign/:packId/:levelIndex`, `#/daily`) — GitHub Pages has no server-side
  rewrite rules.
- **Progress** lives in `localStorage`, keyed by pack id (`src/ui/progress.ts`).

## Sprite pipeline

`tools/make-placeholder-atlas.ts` draws flat coloured shapes with material-letter labels into
`public/atlas/atlas.svg` + `atlas.json` (a plain key → frame-rect map) at build time — nothing in `src/render/`
ever falls back to a hardcoded primitive. Every renderable body reads its texture key from its material or
entity type (`src/render/textureKeys.ts`), never from a switch statement in the render loop. Dropping in real
art later means replacing `atlas.svg`/`atlas.json` with the same key set — zero changes to `src/render/`.

## Deployment / base path

GitHub Pages serves a **project** repo (`github.com/<user>/<repo>`, this one) from `/<repo>/`, but a
**user/org page** repo (`<user>.github.io`) from `/`. `vite.config.ts` reads this from the `VITE_BASE_PATH` env
var, defaulting to `/castlegame/`. Set it as a repository variable (`Settings → Secrets and variables →
Actions → Variables`, `VITE_BASE_PATH`) if this repo is ever renamed or forked under a different name; the
CI workflow (`.github/workflows/deploy.yml`) passes it straight to the build step.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm test` | Vitest (includes the determinism test) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the `src/core` boundary rule |
| `npm run validate` | Re-sweeps every committed campaign pack; exits non-zero on any unsolvable level |
| `npm run gen:campaigns` | Generates + validates `public/campaigns/*.json` |
| `npm run gen:atlas` | Regenerates the placeholder atlas |

## CI

`.github/workflows/deploy.yml` runs on push to `main`: install → typecheck → lint → test → **validate every
committed campaign pack** → build → deploy to Pages. A level regression (a pack that no longer validates)
fails the build before it ever reaches production.

## Out of scope (this pass)

No multiplayer, no accounts, no monetisation, no 3D, no level editor — though the level format doesn't
preclude one later, since a level editor would just be another `gen/` producer writing the same JSON shape.
