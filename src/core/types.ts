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
 * machine (see git history for the harness). Measured curve, castle
 * spanning x=-0.6..5.8 with the machine at x=-10.3:
 *
 *   tick   332  344  356  368  376  388  400  412  417
 *   imp x  0.1  1.7  3.4  4.6  4.8  4.3  2.8  0.9  0.1
 *
 * That is an 86-tick (358 ms) window landing inside the castle footprint,
 * monotonic either side of the peak, at 0.17 m per tick at its steepest.
 *
 * Three properties matter and are easy to lose when retuning:
 *  - SLOW: the beam takes ~1.6s to come round to peak range, so the swing
 *    is readable. A near-weightless beam whip-cracks in 0.25s and feels
 *    broken. Slowness is also what buys the wide release window: the
 *    landing point's curvature against release *time* falls roughly as the
 *    square of the angular rate, so halving the rate quadruples the window.
 *  - GENTLE GRADIENT: ~0.17m per tick at the window's steepest, so small
 *    timing errors cost decimetres, not tens of metres.
 *  - MONOTONIC either side of the peak, so "early" reliably means "short".
 *
 * The beam is deliberately heavy relative to the counterweight (1300 vs
 * 4000) — roughly a real trebuchet's proportions, and the reason the swing
 * is stately rather than violent. It cannot go much heavier than this: the
 * beam's own centre of mass sits forward of the pivot when cocked, and once
 * armMass * (longArm - shortArm)/2 exceeds counterweightMass * shortArm the
 * machine simply rocks in place instead of coming round.
 */
export const DEFAULT_TREBUCHET_CONFIG: Omit<TrebuchetConfig, 'x' | 'y'> = {
  counterweightMass: 4000,
  armMass: 1300,
  armRatio: 6,
  armLength: 13,
  slingLength: 3.25,
  slingSegments: 1,
  payloadRadius: 0.45,
  payloadMass: 90,
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
