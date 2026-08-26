/** Minimal 2D oriented-rectangle overlap test (SAT), used to infer which
 * blocks in a level are touching so they can be joined, and by the settle
 * pass to reject overlapping placements. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

type Vec2 = [number, number];

function corners(r: Rect): Vec2[] {
  const hw = r.w / 2;
  const hh = r.h / 2;
  const c = Math.cos(r.angle);
  const s = Math.sin(r.angle);
  const local: Vec2[] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  return local.map(([px, py]): Vec2 => [r.x + px * c - py * s, r.y + px * s + py * c]);
}

function edgeNormals(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    const ex = x2 - x1;
    const ey = y2 - y1;
    const len = Math.hypot(ex, ey) || 1;
    out.push([-ey / len, ex / len]);
  }
  return out;
}

function project(pts: Vec2[], axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of pts) {
    const p = x * axis[0] + y * axis[1];
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

/** True if two oriented rectangles overlap, or the gap between them along
 * every separating axis is within `epsilon`. */
export function rectsNearOrOverlap(a: Rect, b: Rect, epsilon: number): boolean {
  const pa = corners(a);
  const pb = corners(b);
  const axes = [...edgeNormals(pa), ...edgeNormals(pb)];
  for (const axis of axes) {
    const [aMin, aMax] = project(pa, axis);
    const [bMin, bMax] = project(pb, axis);
    if (aMax + epsilon < bMin || bMax + epsilon < aMin) return false;
  }
  return true;
}

export function rectCorners(r: Rect): Vec2[] {
  return corners(r);
}
