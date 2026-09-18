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

The rig is tuned by sweeping release timing and measuring throw distance from the machine (the sweep harness
creates an empty level, steps a `Sim`, releases at each candidate tick and records where the payload first
descends through y=1.5). The shipped configuration produces this curve (trebuchet at x=-10.3, castle blocks
spanning roughly x=-0.6..5.8):

| release tick | 332 | 344 | 356 | 368 | 376 | 388 | 400 | 412 | 417 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| impact x (m) | 0.1 | 1.7 | 3.4 | 4.6 | **4.8** | 4.3 | 2.8 | 0.9 | 0.1 |
| apex y (m) | 5.3 | 5.9 | 6.6 | 7.5 | 8.2 | 9.2 | 10.2 | 11.1 | 11.4 |

That is an **86-tick (358 ms) window** of consecutive release ticks landing inside the castle footprint,
monotonic either side of the peak, on a beam that takes ~1.6 s to come round to peak range. Apex height rises
across the window (5.3 m → 11.4 m), so a shallow shot into the walls and a high lob onto the roof are both
available — different releases are tactically different, not just "more or less far".

Three properties are load-bearing. Preserve them if you retune:

- **Slow.** The beam is deliberately heavy relative to the counterweight (1300 vs 4000 — roughly real
  proportions). Rotational inertia is what makes a trebuchet stately; a near-weightless beam whip-cracks
  through its arc in 0.25 s, which reads as broken rather than as skill. Slowness is also what *buys* the wide
  release window: the landing point's curvature against release time falls roughly as the square of the beam's
  angular rate, so slowing the swing by 1.7× widens the window by ~2.4×. The beam cannot go much heavier than
  this — its own centre of mass sits forward of the pivot when cocked, and once `armMass·(longArm−shortArm)/2`
  exceeds `counterweightMass·shortArm` the machine just rocks in place instead of coming round.
- **Gentle gradient.** 0.17 m per tick at the window's steepest, so a small timing error costs decimetres, not
  tens of metres.
- **Standoff matched to reach.** The machine's peak throw is ~15.1 m from the pivot, so the castle sits 10–16 m
  out. Reach and standoff are one tuning decision, not two: pushed further back, most release timings fall
  short of the walls and the level becomes unwinnable no matter how well timed; pulled in, the far half of the
  window overshoots the castle entirely. The rig is also close enough that the payload's own pre-release swing
  passes *over* the near edge of the castle at ~6.5 m up — tall towers can be clipped by the still-slung
  payload, which the validator sees too, since it runs the same physics.

## Calibration: everything is measured, not assumed

The single largest bug in the first pass was inventing physical constants in a vacuum. Break thresholds were
set 20–50× above any impulse the simulation actually produces, so no joint could ever fail and castles toppled
as one welded rigid body — the exact failure mode the design forbids.

The impulse scale this simulation really produces, measured:

| Regime | Peak per-tick impulse |
| --- | --- |
| A healthy structure settling | ~0.8 N·s |
| Masonry falling a few metres | ~27 N·s |
| A direct projectile strike | 20–64 N·s |

Break thresholds (`src/core/materials.ts`) live inside that band, and `tests/physics.test.ts` asserts they stay
there. If you add a material, measure — don't guess. (The strike figure was re-measured after the trebuchet
was retuned — a different rig throws a different impulse, so the number is not a constant of the game. Stone
at 40 N·s still sits where it should: breakable by a good hit, not by a glancing one.)

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

`src/gen/evaluate.ts` sweeps release timing against a candidate level. Zero winning timings → reject. More
than 0.30 of the grid winning on shot one → reject as trivial. The winning fraction, normalised, is the
difficulty score.

**Difficulty is normalised against a measured ceiling, on a log scale** — and both halves of that matter.
`difficulty = 1 − winningFraction` (the first version) silently assumed a level could be won from most of the
release grid. It cannot: sweeping 40 generated candidates, the winning fraction ran min 0.00 · p25 0.03 ·
median 0.07 · p75 0.17 · **max 0.45**, so every shippable level scored 0.55–1.0 and nothing could ever read as
easy. So the score normalises against the achievable ceiling (0.45) rather than against 1, and does it on a
log scale, because the winning fraction is really a *count* of winning timings and that count is heavily
skewed: one winning release versus two is a large difference in the precision demanded of the player, twelve
versus thirteen is imperceptible. The measured population then maps onto a full range — 0.034 → 0.74,
0.069 → 0.59, 0.138 → 0.39, 0.241 → 0.21, 0.45 → 0.00.

The old "trivially easy" cut-off had the same flaw in the other direction: at `firstShotWinFraction > 0.5` it
was unreachable — dead code — since the easiest of those 40 candidates cleared on 0.34 of its opening shots.
It now sits at 0.30, the top of the range the generator actually produces, and it fired on 6 of the 107
candidates the shipped packs were built from.

The shipped packs now read: foothills 0.13 → 0.74, riverlands 0.17 → 0.74, highlands 0.17 → 0.74 (they were
0.71–0.96 before). The top of the shipped range is 0.74 rather than 1.0 on purpose: 1.0 is "exactly one
winning release in the whole grid", which on a 29-point grid is the last value before *unsolvable*, and a
level that hard would not be shipped.

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
  packs, difficulty-sorted, committed so the live site never generates anything at request time. A pack is
  *selected*, not just filled: the builder pools ~2× the pack size in solvable candidates and then takes 15
  spread evenly across that pool by quantile, so level 1 is the gentlest of the pool rather than whichever
  acceptable candidate the generator happened to emit first. Selection is a pure function of the sorted pool,
  and candidate order comes from the pack seed, so the packs stay reproducible.
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

The world `Container` carries a negative y scale (physics is y-up, Pixi is y-down), and that flip mirrors the
*artwork* as well as the coordinates — the atlas's letters rendered upside down. Each sprite therefore
counter-flips its own y scale in `makeSprite`: the two flips cancel for the texture while the world flip still
does its job on positions, and because `diag(1,−1)·R(θ)·diag(1,−1) = R(−θ)` the pair composes to a plain
rotation, so nothing downstream needs a sign fixed up. Pixi's `width`/`height` setters preserve the sign of
`scale`, so sprites resized every frame keep the counter-flip. (The ground slab's anchor moves with it, from
y=1 to y=0, so it still hangs below the horizon.)

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
