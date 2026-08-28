import type { BodyPose, RenderSnapshot } from '../core/snapshot';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest-path angle interpolation, so a body spinning past +-pi doesn't
 * visibly snap backwards. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
  return a + diff * t;
}

function lerpPose(a: BodyPose, b: BodyPose, t: number): BodyPose {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), angle: lerpAngle(a.angle, b.angle, t) };
}

/**
 * Renders read simulation state each frame but the fixed-step sim advances
 * in coarser increments than the display refreshes — this interpolates
 * between the last two physics snapshots so motion reads as smooth at any
 * frame rate, decoupled from the 1/240s tick.
 */
export function interpolateSnapshot(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number): RenderSnapshot {
  const t = Math.max(0, Math.min(1, alpha));
  return {
    tick: curr.tick,
    blocks: curr.blocks.map((b, i) => {
      const p = prev.blocks[i];
      return p && p.id === b.id ? { ...b, ...lerpPose(p, b, t) } : b;
    }),
    people: curr.people.map((p, i) => {
      const prevP = prev.people[i];
      return prevP && prevP.id === p.id ? { ...p, ...lerpPose(prevP, p, t) } : p;
    }),
    trebuchet: {
      arm: lerpPose(prev.trebuchet.arm, curr.trebuchet.arm, t),
      counterweight: lerpPose(prev.trebuchet.counterweight, curr.trebuchet.counterweight, t),
      sling: curr.trebuchet.sling.map((s, i) => {
        const p = prev.trebuchet.sling[i];
        return p ? { ...s, ...lerpPose(p, s, t), length: lerp(p.length, s.length, t) } : s;
      }),
      payload: lerpPose(prev.trebuchet.payload, curr.trebuchet.payload, t),
      phase: curr.trebuchet.phase,
    },
  };
}
