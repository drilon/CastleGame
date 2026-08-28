import type { Container } from 'pixi.js';
import type { Level } from '../core/types';
import { DEFAULT_TREBUCHET_CONFIG } from '../core/types';
import { TREBUCHET_ORIGIN } from '../core/sim';

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Fits `bounds` into a `viewportW`x`viewportH` screen area and applies the
 * result to `world` (a Container all world-space sprites are children of).
 * Physics is y-up; Pixi is y-down, so this is also where that flip lives —
 * nothing else in render/ needs to know about it.
 */
export function fitCamera(world: Container, bounds: WorldBounds, viewportW: number, viewportH: number, margin = 1.5): void {
  const worldW = Math.max(bounds.maxX - bounds.minX, 1) + margin * 2;
  const worldH = Math.max(bounds.maxY - bounds.minY, 1) + margin * 2;
  const scale = Math.min(viewportW / worldW, viewportH / worldH);

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  world.scale.set(scale, -scale);
  world.position.set(viewportW / 2 - centerX * scale, viewportH / 2 + centerY * scale);
}

/**
 * Frames the whole engagement: the castle, plus the volume the trebuchet
 * actually sweeps through. A level file carries no camera hint, and framing
 * on the castle alone crops the machine — which matters here because the
 * arm and counterweight are the thing the player is timing against.
 */
export function levelBounds(level: Level, trebuchet = TREBUCHET_ORIGIN): WorldBounds {
  // The arm reaches roughly its own length above the pivot at the top of
  // the swing; give the counterweight and payload a little room besides.
  const trebuchetTop = trebuchet.y + DEFAULT_TREBUCHET_CONFIG.armLength * 0.85;
  const xs = [trebuchet.x - 2.5, ...level.blocks.map((b) => b.x), ...level.people.map((p) => p.x)];
  const ys = [0, trebuchetTop, ...level.blocks.map((b) => b.y), ...level.people.map((p) => p.y)];
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
