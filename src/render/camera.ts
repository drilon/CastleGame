import type { Container } from 'pixi.js';
import type { Level } from '../core/types';

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

/** Includes the trebuchet's launch point so it's always in frame alongside
 * the castle, since a level file has no explicit camera hint. */
export function levelBounds(level: Level, trebuchetX = -5): WorldBounds {
  const xs = [trebuchetX - 2, ...level.blocks.map((b) => b.x), ...level.people.map((p) => p.x)];
  const ys = [0, ...level.blocks.map((b) => b.y), ...level.people.map((p) => p.y)];
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
