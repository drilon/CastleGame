import type { MaterialId } from './types';

export interface MaterialDef {
  id: MaterialId;
  /** kg / m^2 (2D "density" — Rapier treats colliders as unit-depth). */
  density: number;
  friction: number;
  restitution: number;
  /**
   * Newton-seconds a joint between two blocks of this material can absorb
   * before snapping. Where two different materials meet, the lower of the
   * two thresholds governs (the weaker material fails first).
   *
   * These are calibrated against the impulse scale this simulation
   * actually produces, measured rather than assumed:
   *   - a healthy structure settling peaks around  1 N*s
   *   - masonry falling a few metres lands at     ~27 N*s
   *   - a direct projectile strike delivers    64-91 N*s
   * Anything much above that top figure is unbreakable in practice, which
   * is what made earlier castles topple as one welded mass instead of
   * failing locally. Keep new values inside this band.
   */
  breakImpulse: number;
  /** Flat colour used by the placeholder atlas generator. */
  color: number;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  wood: {
    id: 'wood',
    density: 0.6,
    friction: 0.6,
    restitution: 0.15,
    breakImpulse: 15,
    color: 0x9a6b3f,
  },
  stone: {
    id: 'stone',
    density: 2.4,
    friction: 0.75,
    restitution: 0.05,
    breakImpulse: 40,
    color: 0x8a8a8a,
  },
  ice: {
    id: 'ice',
    density: 0.9,
    friction: 0.05,
    restitution: 0.02,
    breakImpulse: 5,
    color: 0xbfe3f0,
  },
  steel: {
    id: 'steel',
    density: 7.8,
    friction: 0.4,
    restitution: 0.1,
    breakImpulse: 5000,
    color: 0x5c6570,
  },
};

export function jointBreakImpulse(a: MaterialId, b: MaterialId): number {
  return Math.min(MATERIALS[a].breakImpulse, MATERIALS[b].breakImpulse);
}
