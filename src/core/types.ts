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
  /** Mass of the beam itself. This is the main brake on how violently the
   * machine swings: a real trebuchet is slow and stately because its beam
   * carries enormous rotational inertia against the counterweight's torque.
   * Leaving the beam near-weightless (as an early version did) produces a
   * whip-crack swing that is over before the player can read it. */
  armMass: number;
  slingLength: number;
  slingSegments: number;
  payloadRadius: number;
  payloadMass: number;
}

/**
 * Tuned by sweeping release timing and measuring throw distance from the
 * machine (see git history for the harness). Measured curve:
 *
 *   tick  176  184  192  196  204  212  216
 *   dist   10m  19m  23m  23m  20m  15m  13m
 *
 * Three properties matter and are easy to lose when retuning:
 *  - SLOW: the beam takes ~0.8s to come round, so the swing is readable.
 *    A near-weightless beam whip-cracks in 0.25s and feels broken.
 *  - GENTLE GRADIENT: ~0.5m per tick near the peak, so small timing errors
 *    cost metres, not tens of metres.
 *  - MONOTONIC either side of the peak, so "early" reliably means "short".
 *
 * The beam is deliberately heavy relative to the counterweight (1000 vs
 * 2500) — roughly a real trebuchet's proportions, and the reason the swing
 * is stately rather than violent.
 */
export const DEFAULT_TREBUCHET_CONFIG: Omit<TrebuchetConfig, 'x' | 'y'> = {
  counterweightMass: 2500,
  armMass: 1000,
  armRatio: 4.5,
  armLength: 10,
  slingLength: 4.5,
  slingSegments: 1,
  payloadRadius: 0.45,
  payloadMass: 60,
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
