import type { RapierModule } from '../core/rapier-init';
import { Sim, FIXED_DT } from '../core/sim';
import type { BlockSpec, Level, PersonSpec } from '../core/types';
import { rectCorners, rectsNearOrOverlap, type Rect } from '../core/geometry';
import { PERSON_RADIUS, PERSON_CAPSULE_HALF_HEIGHT } from '../core/world';

const SETTLE_SECONDS = 2;
export const SETTLE_TICKS = Math.round(SETTLE_SECONDS / FIXED_DT);
/** Rapier's joints have a little compliance under load (a tall stack of
 * dense stone visibly settles a few centimetres before going fully rigid),
 * so this is looser than "didn't move at all" — it's tuned to pass a
 * genuine settle and fail an actual collapse, which differ by an order of
 * magnitude or more in practice. */
const MAX_DRIFT = 0.15;
/** Fraction of the smaller block's area two blocks are allowed to share.
 * Grammar pieces are routinely built to embed a little into their neighbour
 * (a floor's edge sunk into the wall it rests in) — those pairs get welded
 * together by a fixed joint with contacts disabled in `world.ts`, so mild
 * overlap is normal, not a bug. This only catches genuinely broken
 * placements (two pieces stacked on top of each other by mistake). */
const MAX_OVERLAP_FRACTION = 0.6;
const PERSON_HALF_W = PERSON_RADIUS;
const PERSON_HALF_H = PERSON_CAPSULE_HALF_HEIGHT + PERSON_RADIUS;

function aabb(r: Rect): { x0: number; x1: number; y0: number; y1: number } {
  const corners = rectCorners(r);
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function overlapFraction(a: Rect, b: Rect): number {
  const boxA = aabb(a);
  const boxB = aabb(b);
  const ox = Math.max(0, Math.min(boxA.x1, boxB.x1) - Math.max(boxA.x0, boxB.x0));
  const oy = Math.max(0, Math.min(boxA.y1, boxB.y1) - Math.max(boxA.y0, boxB.y0));
  const overlapArea = ox * oy;
  const minArea = Math.min(a.w * a.h, b.w * b.h);
  return minArea > 0 ? overlapArea / minArea : 0;
}

/** Rejects genuinely broken placements: people spawning inside solid blocks
 * or each other, and blocks stacked substantially on top of one another
 * (as opposed to the mild, intentional embedding joints are built for). */
export function hasBadOverlaps(blocks: BlockSpec[], people: PersonSpec[]): boolean {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (overlapFraction(blocks[i]!, blocks[j]!) > MAX_OVERLAP_FRACTION) return true;
    }
  }
  const personRect = (p: PersonSpec): Rect => ({ x: p.x, y: p.y, w: PERSON_HALF_W * 2, h: PERSON_HALF_H * 2, angle: 0 });
  for (const p of people) {
    for (const b of blocks) {
      if (rectsNearOrOverlap(personRect(p), b, 0)) return true;
    }
  }
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      if (rectsNearOrOverlap(personRect(people[i]!), personRect(people[j]!), 0)) return true;
    }
  }
  return false;
}

export interface SettleResult {
  stable: boolean;
  maxDrift: number;
}

/** Runs the raw structure for 2 simulated seconds with no shots fired and
 * checks that nothing moved more than a small epsilon. A castle that
 * collapses under its own weight is not a level. */
export function checkSettles(RAPIER: RapierModule, blocks: BlockSpec[], people: PersonSpec[]): SettleResult {
  const level: Level = {
    id: 'settle-check',
    seed: 'settle-check',
    archetype: 'tower',
    blocks,
    people,
    ammo: 0,
    par: 0,
    difficulty: 0,
  };
  const sim = new Sim(RAPIER, level, { maxTicks: SETTLE_TICKS + 1 });
  sim.stepN(SETTLE_TICKS);
  let maxDrift = 0;
  sim.world.blocks.forEach((b, i) => {
    const spec = blocks[i]!;
    const t = b.body.translation();
    const drift = Math.hypot(t.x - spec.x, t.y - spec.y);
    if (drift > maxDrift) maxDrift = drift;
  });
  return { stable: maxDrift <= MAX_DRIFT, maxDrift };
}
