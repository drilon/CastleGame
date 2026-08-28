export type MaterialId = 'wood' | 'stone' | 'ice' | 'steel';

export interface BlockSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  material: MaterialId;
}

export interface PersonSpec {
  x: number;
  y: number;
}

export type Archetype = 'tower' | 'keep' | 'bridge' | 'gatehouse' | 'hanging';

export interface Level {
  id: string;
  seed: string;
  archetype: Archetype;
  blocks: BlockSpec[];
  people: PersonSpec[];
  ammo: number;
  par: number;
  difficulty: number;
}

/** Trebuchet tunables, exposed as level/config knobs rather than hardcoded. */
export interface TrebuchetConfig {
  x: number;
  y: number;
  counterweightMass: number;
  /** Ratio of long arm length to short arm length. */
  armRatio: number;
  armLength: number;
  slingLength: number;
  slingSegments: number;
  payloadRadius: number;
  payloadMass: number;
}

/**
 * Tuned by sweeping release timing and measuring where the shot first comes
 * back down (see the git history for the harness). This rig gives a ~28-tick
 * window whose impact point rises smoothly from 0m to ~11m and back:
 *
 *   tick  48  52  56  60  64  68  72
 *   land   0   3   5   8  10  11   7
 *
 * At 240Hz that is ~117ms of usable window against roughly +-42ms of human
 * click precision, and the arc is monotonic on each side of the peak — so
 * "released a touch early" reads as "fell short" rather than as noise.
 * Keep that property if you retune: window width and monotonicity are the
 * whole feel of the game.
 */
export const DEFAULT_TREBUCHET_CONFIG: Omit<TrebuchetConfig, 'x' | 'y'> = {
  counterweightMass: 700,
  armRatio: 4,
  armLength: 5,
  slingLength: 2.5,
  slingSegments: 1,
  payloadRadius: 0.3,
  payloadMass: 40,
};

/** A single input event applied to the simulation, timestamped in physics ticks. */
export type SimInput =
  | { tick: number; type: 'dropCounterweight' }
  | { tick: number; type: 'releaseSling' };

/** A recorded shot: the input sequence that reproduces one attempt bit-for-bit. */
export interface ShotInput {
  dropTick: number;
  releaseTick: number;
  counterweightMass?: number;
}
