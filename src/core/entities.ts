/** Stable string ids for every simulation body, used by the renderer to map
 * bodies to sprites and by tests/tools to address specific entities. */
export type EntityId = string;

export const blockId = (index: number): EntityId => `block:${index}`;
export const personId = (index: number): EntityId => `person:${index}`;
export const groundId = (): EntityId => 'ground';
export const trebuchetId = (
  part: 'base' | 'arm' | 'counterweight' | 'payload' | `sling:${number}`,
): EntityId => `treb:${part}`;

export type EntityShape =
  | { kind: 'cuboid'; hw: number; hh: number }
  | { kind: 'ball'; radius: number }
  | { kind: 'capsule'; halfHeight: number; radius: number };

export type EntityKind = 'ground' | 'block' | 'person' | 'trebuchet' | 'projectile';
