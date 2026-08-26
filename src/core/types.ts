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

export const DEFAULT_TREBUCHET_CONFIG: Omit<TrebuchetConfig, 'x' | 'y'> = {
  counterweightMass: 450,
  armRatio: 3,
  armLength: 3.2,
  slingLength: 1.7,
  // A single link, not several: a multi-link sling chain turns out to whip
  // chaotically (its landing point is wildly, unpredictably sensitive to
  // release timing, to the point that a headless parameter sweep can't
  // find a reliable window). One link keeps the "sling" character while
  // making the release timing → landing spot relationship something a
  // player — and a grid search — can actually learn.
  slingSegments: 1,
  payloadRadius: 0.3,
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
