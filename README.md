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
the first click — that's what lets the player choose *when* the swing starts); the second releases the payload
as a free CCD-enabled projectile. Release timing alone determines the arc.

Three things about this rig are load-bearing and easy to break by accident:

- **The sling is a rope joint, not a jointed rigid link.** A rope can only pull. A rigid link can also push,
  which makes arm+sling a double pendulum — the textbook chaotic system. With a rigid link the landing point
  jumped tens of metres between adjacent release ticks, which is unplayable and unvalidatable.
- **The base carries no collider.** In 2D a support column sits squarely in the payload's swing path and the
  machine shoots itself. Real frames straddle the sling in the third dimension, which we don't have.
- **The cocked angle points the long arm down and slightly *forward*.** The arm is a straight lever, so the tip
  and counterweight are always on opposite sides of the pivot. Gravity on a counterweight at offset `r` gives
  torque `-rₓmg`, so the weight must start *behind* the pivot to sweep the tip downrange. Cocking it the
  intuitive-looking other way throws over the back of the machine.

The rig is tuned by sweeping release timing and measuring throw distance from the machine. The shipped
configuration produces this curve (trebuchet at x=-13, castle spanning roughly x=0..6):

| release tick | 184 | 188 | 192 | 196 | 200 | 204 | 208 | 212 | 216 | 220 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| impact x (m) | -0.2 | 3.1 | 5.1 | 6.2 | **6.4** | 5.8 | 4.7 | 3.4 | 1.9 | 0.3 |

That is a ~36-tick (150 ms) window covering the castle footprint, monotonic either side of the peak, on a beam
that takes ~0.8 s to come round. Apex height also rises across the window (0.8 m → 10 m), so a flat shot into
the walls and a high lob onto the roof are both available — different releases are tactically different, not
just "more or less far".

Three properties are load-bearing. Preserve them if you retune:

- **Slow.** The beam is deliberately heavy relative to the counterweight (1000 vs 2500 — roughly real
  proportions). Rotational inertia is what makes a trebuchet stately; a near-weightless beam whip-cracks
  through its arc in 0.25 s, which reads as broken rather than as skill.
- **Gentle gradient.** ~0.5 m per tick near the peak, so a small timing error costs metres, not tens of metres.
- **Standoff matched to reach.** The machine's peak throw is ~19.5 m, so the castle sits 13–19 m out. Pushed
  further back, most release timings fall short of the walls and the level becomes unwinnable no matter how
  well timed.

## Calibration: everything is measured, not assumed

The single largest bug in the first pass was inventing physical constants in a vacuum. Break thresholds were
set 20–50× above any impulse the simulation actually produces, so no joint could ever fail and castles toppled
as one welded rigid body — the exact failure mode the design forbids.

The impulse scale this simulation really produces, measured:

| Regime | Peak per-tick impulse |
| --- | --- |
| A healthy structure settling | ~1 N·s |
| Masonry falling a few metres | ~27 N·s |
| A direct projectile strike | 64–91 N·s |

Break thresholds (`src/core/materials.ts`) live inside that band, and `tests/physics.test.ts` asserts they stay
there. If you add a material, measure — don't guess.

The kill model has the same character. It thresholds on **velocity change, not impulse**: impulse scales with
the victim's mass, and a person body here masses well under a kilogram, so an absolute newton-second threshold
is physically unreachable no matter how hard they're hit. That's why an earlier absolute threshold left people
standing unharmed inside collapsing towers. Δv is mass-independent and the better injury proxy. Idle settling
peaks at 0.83 m/s against a threshold of 10 — a 12× margin, with zero spurious deaths measured across every
archetype.

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

`src/gen/evaluate.ts` sweeps release timing against a candidate level. Zero winning timings → reject. Over
half the grid winning on shot one → reject as trivial. The winning fraction, inverted, is the difficulty score.

It sweeps **only release timing**, deliberately: that is the sole control the player has at the moment of a
shot. Counterweight mass is a level-authoring knob, not an in-game control, so sweeping it would credit the
player with agency they don't have and overstate solvability.

Shots are searched as genuinely *independent* choices rather than one shot repeated. Every opening shot is
scored on its own; the most damaging few are carried forward as a beam and extended with the full grid of
follow-ups. This matters because a castle with occupants on several floors generally cannot be cleared by
firing the same shot twice — the second shot has to go somewhere else. Rapier worlds can't be cheaply cloned,
so each follow-up replays its opening from scratch; that cost is why the search is a narrow beam of two-shot
sequences rather than an exhaustive product. A level that validates is solvable in two shots and ships with a
spare round on top.

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
