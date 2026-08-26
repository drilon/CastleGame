import type { Level } from '../src/core/types';

/** A small hand-built level (no generator dependency) used by core tests:
 * a stack of stone blocks with a wood roof and two people inside. */
export function simpleStackLevel(id = 'test-stack'): Level {
  return {
    id,
    seed: id,
    archetype: 'tower',
    blocks: [
      { x: 3, y: 0.5, w: 1, h: 1, angle: 0, material: 'stone' },
      { x: 3, y: 1.5, w: 1, h: 1, angle: 0, material: 'stone' },
      { x: 6, y: 0.5, w: 1, h: 1, angle: 0, material: 'stone' },
      { x: 6, y: 1.5, w: 1, h: 1, angle: 0, material: 'stone' },
      { x: 4.5, y: 2.15, w: 3.3, h: 0.3, angle: 0, material: 'wood' },
    ],
    people: [
      { x: 4, y: 0.56 },
      { x: 5, y: 0.56 },
    ],
    ammo: 3,
    par: 2,
    difficulty: 0.4,
  };
}
