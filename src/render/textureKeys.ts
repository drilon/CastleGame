import type { MaterialId } from '../core/types';

/** Every place a renderable body needs a texture, it goes through one of
 * these — never a switch statement inline in the render loop. Dropping in
 * new art means updating the atlas + these key strings, nothing else. */
export const textureKeyForBlock = (material: MaterialId): string => `block:${material}`;
export const textureKeyForPerson = (alive: boolean): string => (alive ? 'person:alive' : 'person:dead');
export const TEXTURE_KEY_PROJECTILE = 'projectile';
export const TEXTURE_KEY_GROUND = 'ground';
export const textureKeyForTrebuchetPart = (part: 'base' | 'arm' | 'counterweight' | 'sling'): string => `treb:${part}`;
