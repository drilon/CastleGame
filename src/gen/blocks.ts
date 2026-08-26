import type { BlockSpec, MaterialId, PersonSpec } from '../core/types';

export const BLOCK_W = 1;
export const BLOCK_H = 1;

/** A vertical stack of `count` blocks, each `w` x `h`, centered on `x`,
 * bottom sitting on `baseY` (normally 0, the ground line). */
export function wallColumn(
  x: number,
  baseY: number,
  w: number,
  h: number,
  count: number,
  material: MaterialId,
): BlockSpec[] {
  const out: BlockSpec[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ x, y: baseY + h * (i + 0.5), w, h, angle: 0, material });
  }
  return out;
}

export interface ColumnWithFloors {
  blocks: BlockSpec[];
  /** Top-of-support y for each inserted floor, in the order inserted. */
  floorSupportYs: number[];
  /** Top of the whole column, for stacking a roof or lintel on it. */
  topY: number;
}

/** A vertical stack like `wallColumn`, but after each row index listed in
 * `floorAfterRows` (1-based: `2` means after the 2nd block from the bottom)
 * a gap of `floorThickness` is left in the column for a floor plank to
 * occupy — so the floor and the wall blocks above/below it stack flush
 * with zero overlap, rather than a floor plank competing for the same slot
 * as a full-height wall block. */
export function wallColumnWithFloors(
  x: number,
  w: number,
  blockH: number,
  rows: number,
  material: MaterialId,
  floorAfterRows: readonly number[],
  floorThickness: number,
): ColumnWithFloors {
  const floorRows = new Set(floorAfterRows);
  const blocks: BlockSpec[] = [];
  const floorSupportYs: number[] = [];
  let y = 0;
  for (let i = 0; i < rows; i++) {
    blocks.push({ x, y: y + blockH / 2, w, h: blockH, angle: 0, material });
    y += blockH;
    if (floorRows.has(i + 1) && i + 1 < rows) {
      floorSupportYs.push(y);
      y += floorThickness;
    }
  }
  return { blocks, floorSupportYs, topY: y };
}

/** A horizontal span from x0 to x1 resting with its bottom face flush on
 * `topOfSupportY`, split into several segments (rather than one giant beam)
 * so it can fail progressively and locally. Returns the segments plus the
 * y of the platform's own top surface, for stacking something on it. */
export function platform(
  x0: number,
  x1: number,
  topOfSupportY: number,
  thickness: number,
  material: MaterialId,
): { blocks: BlockSpec[]; topY: number } {
  const span = x1 - x0;
  const segCount = Math.max(2, Math.round(span / 1.1));
  const segW = span / segCount;
  const y = topOfSupportY + thickness / 2;
  const blocks: BlockSpec[] = [];
  for (let i = 0; i < segCount; i++) {
    blocks.push({ x: x0 + segW * (i + 0.5), y, w: segW, h: thickness, angle: 0, material });
  }
  return { blocks, topY: topOfSupportY + thickness };
}

/** Places `count` people evenly across [x0, x1] (callers pass the already-
 * clear interior span — this applies no margin of its own, so a person at
 * either endpoint sits exactly there). */
export function peopleOnFloor(x0: number, x1: number, y: number, count: number): PersonSpec[] {
  const out: PersonSpec[] = [];
  if (count <= 0) return out;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push({ x: x0 + (x1 - x0) * t, y });
  }
  return out;
}
