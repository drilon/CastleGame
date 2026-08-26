import type { Archetype, BlockSpec, MaterialId, PersonSpec } from '../core/types';
import type { Rng } from '../core/rng';
import { pick, randInt, randRange } from '../core/rng';
import { wallColumn, wallColumnWithFloors, platform, peopleOnFloor, BLOCK_W, BLOCK_H } from './blocks';

export interface Structure {
  blocks: BlockSpec[];
  people: PersonSpec[];
}

/** Clearance between a floor's top surface and a standing person's centre. */
const STAND_OFFSET = 0.56;
const FLOOR_THICKNESS = 0.25;
/** Horizontal clearance kept between a standing person's centre and any
 * wall/support they're placed next to (person radius 0.22 plus a buffer). */
const WALL_CLEARANCE = 0.32;

function wallMaterial(rng: Rng): MaterialId {
  return pick(rng, ['stone', 'stone', 'stone', 'ice'] as const);
}

/** [2, 4, 6, ...] up to (but not including) `height`. */
function everyOtherRow(height: number): number[] {
  const rows: number[] = [];
  for (let r = 2; r < height; r += 2) rows.push(r);
  return rows;
}

/** Interior placement span between two walls centred at `leftX` and
 * `rightX` (each `wallHalfW` wide), clear of both by `WALL_CLEARANCE`. */
function interiorSpan(leftX: number, rightX: number, wallHalfW: number): [number, number] {
  const x0 = leftX + wallHalfW + WALL_CLEARANCE;
  const x1 = rightX - wallHalfW - WALL_CLEARANCE;
  return x1 > x0 ? [x0, x1] : [(x0 + x1) / 2, (x0 + x1) / 2];
}

/** A narrow shell of two walls, a couple of internal floors, and a pitched
 * roof — the simplest archetype and the one the validator sees most often. */
function tower(rng: Rng): Structure {
  const height = randInt(rng, 4, 7);
  const gap = randRange(rng, 2.2, 3.0);
  const mat = wallMaterial(rng);
  const floorRows = everyOtherRow(height);
  const left = wallColumnWithFloors(0, BLOCK_W, BLOCK_H, height, mat, floorRows, FLOOR_THICKNESS);
  const right = wallColumnWithFloors(gap, BLOCK_W, BLOCK_H, height, mat, floorRows, FLOOR_THICKNESS);
  const blocks: BlockSpec[] = [...left.blocks, ...right.blocks];
  const people: PersonSpec[] = [];
  const [px0, px1] = interiorSpan(0, gap, BLOCK_W / 2);
  // Only the lowest floor gets occupants — a castle with people spread
  // across every storey needs a multi-shot combinatorial search to verify,
  // which is future work (see README); concentrating them keeps a single
  // well-aimed shot capable of clearing the level.
  for (const supportY of left.floorSupportYs.slice(0, 1)) {
    const floor = platform(-0.4, gap + 0.4, supportY, FLOOR_THICKNESS, 'wood');
    blocks.push(...floor.blocks);
    const count = randInt(rng, 1, 2);
    people.push(...peopleOnFloor(px0, px1, floor.topY + STAND_OFFSET, count));
  }
  for (const supportY of left.floorSupportYs.slice(1)) {
    blocks.push(...platform(-0.4, gap + 0.4, supportY, FLOOR_THICKNESS, 'wood').blocks);
  }
  blocks.push(...platform(-0.6, gap + 0.6, left.topY, 0.3, 'wood').blocks);
  return { blocks, people };
}

/** A wider, thicker-walled hall: two blocks deep per side, more floors, more
 * occupants — the same grammar as `tower` scaled up. */
function keep(rng: Rng): Structure {
  const height = randInt(rng, 5, 8);
  const gap = randRange(rng, 3.4, 4.2);
  const mat = wallMaterial(rng);
  const floorRows = everyOtherRow(height);
  const cols = [0, BLOCK_W, gap, gap + BLOCK_W].map((x) =>
    wallColumnWithFloors(x, BLOCK_W, BLOCK_H, height, mat, floorRows, FLOOR_THICKNESS),
  );
  const blocks: BlockSpec[] = cols.flatMap((c) => c.blocks);
  const people: PersonSpec[] = [];
  const [px0, px1] = interiorSpan(BLOCK_W, gap, BLOCK_W / 2);
  for (const supportY of cols[0]!.floorSupportYs.slice(0, 1)) {
    const floor = platform(BLOCK_W + 0.5 - 0.4, gap - 0.5 + 0.4, supportY, FLOOR_THICKNESS, 'wood');
    blocks.push(...floor.blocks);
    const count = randInt(rng, 1, 2);
    people.push(...peopleOnFloor(px0, px1, floor.topY + STAND_OFFSET, count));
  }
  for (const supportY of cols[0]!.floorSupportYs.slice(1)) {
    blocks.push(...platform(BLOCK_W + 0.5 - 0.4, gap - 0.5 + 0.4, supportY, FLOOR_THICKNESS, 'wood').blocks);
  }
  blocks.push(...platform(-0.6, gap + BLOCK_W + 0.6, cols[0]!.topY, 0.3, 'stone').blocks);
  return { blocks, people };
}

/** Two support towers with a plank bridge strung between them — occupants
 * stand exposed on top rather than sheltered inside. */
function bridge(rng: Rng): Structure {
  const supportHeight = randInt(rng, 3, 5);
  const span = randRange(rng, 4, 6);
  const mat = wallMaterial(rng);
  const blocks: BlockSpec[] = [
    ...wallColumn(0, 0, BLOCK_W, BLOCK_H, supportHeight, mat),
    ...wallColumn(span, 0, BLOCK_W, BLOCK_H, supportHeight, mat),
  ];
  const deck = platform(-0.4, span + 0.4, supportHeight * BLOCK_H, 0.3, 'wood');
  blocks.push(...deck.blocks);
  const count = randInt(rng, 2, 3);
  const people = peopleOnFloor(0.3, span - 0.3, deck.topY + STAND_OFFSET, count);
  return { blocks, people };
}

/** Two flanking towers around an open gate, joined at the top by a stone
 * lintel — knocking either tower drops the lintel and whoever's on it. */
function gatehouse(rng: Rng): Structure {
  const height = randInt(rng, 5, 7);
  const gateWidth = randRange(rng, 2.6, 3.4);
  const mat = wallMaterial(rng);
  const midRow = randInt(rng, 2, Math.max(2, height - 2));
  const left = wallColumnWithFloors(0, BLOCK_W, BLOCK_H, height, mat, [midRow], FLOOR_THICKNESS);
  const right = wallColumnWithFloors(gateWidth, BLOCK_W, BLOCK_H, height, mat, [midRow], FLOOR_THICKNESS);
  const blocks: BlockSpec[] = [...left.blocks, ...right.blocks];
  const [px0, px1] = interiorSpan(0, gateWidth, BLOCK_W / 2);
  const midFloor = platform(-0.4, gateWidth + 0.4, left.floorSupportYs[0]!, FLOOR_THICKNESS, 'wood');
  blocks.push(...midFloor.blocks);
  const people: PersonSpec[] = peopleOnFloor(px0, px1, midFloor.topY + STAND_OFFSET, randInt(rng, 1, 2));
  const lintel = platform(-0.4, gateWidth + 0.4, left.topY, 0.3, 'stone');
  blocks.push(...lintel.blocks);
  const towerTopY = lintel.topY + STAND_OFFSET;
  const towerTopX = pick(rng, [0, gateWidth] as const);
  people.push(...peopleOnFloor(towerTopX, towerTopX, towerTopY, 1));
  return { blocks, people };
}

/** A cantilevered shelf jutting out from a single tall column, propped by a
 * single strut near its outer edge — knock the strut out and the shelf is
 * held by nothing but the joint welding it into the column. */
function hanging(rng: Rng): Structure {
  const height = randInt(rng, 5, 8);
  const mat = wallMaterial(rng);
  const shelfRow = randInt(rng, Math.floor(height / 2), height - 1);
  const column = wallColumnWithFloors(0, BLOCK_W, BLOCK_H, height, mat, [shelfRow], FLOOR_THICKNESS);
  const blocks: BlockSpec[] = [...column.blocks];
  const shelfSupportY = column.floorSupportYs[0]!;
  const reach = randRange(rng, 2.5, 3.5);
  const shelf = platform(-0.4, reach, shelfSupportY, FLOOR_THICKNESS, 'wood');
  blocks.push(...shelf.blocks);
  // A vertical prop near the shelf's outer edge, from the ground up to its
  // underside.
  const strutX = reach - 0.4;
  blocks.push({ x: strutX, y: shelfSupportY / 2, w: 0.3, h: shelfSupportY, angle: 0, material: 'wood' });
  const [px0, px1] = interiorSpan(0, strutX, BLOCK_W / 2);
  const people = peopleOnFloor(px0, px1, shelf.topY + STAND_OFFSET, randInt(rng, 1, 2));
  return { blocks, people };
}

export const ARCHETYPES: Record<Archetype, (rng: Rng) => Structure> = {
  tower,
  keep,
  bridge,
  gatehouse,
  hanging,
};

export const ARCHETYPE_LIST: Archetype[] = ['tower', 'keep', 'bridge', 'gatehouse', 'hanging'];
