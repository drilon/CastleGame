import { Application, Container, Sprite } from 'pixi.js';
import type { RenderSnapshot } from '../core/snapshot';
import type { MaterialId } from '../core/types';
import type { Atlas } from './atlas';
import { textureKeyForBlock, textureKeyForPerson, textureKeyForTrebuchetPart, TEXTURE_KEY_PROJECTILE, TEXTURE_KEY_GROUND } from './textureKeys';
import { fitCamera, type WorldBounds } from './camera';

export interface Stage {
  app: Application;
  world: Container;
  /** Draws one (already-interpolated) frame. */
  render(snapshot: RenderSnapshot, bounds: WorldBounds): void;
  destroy(): void;
}

function makeSprite(atlas: Atlas, key: string): Sprite {
  const sprite = new Sprite(atlas.get(key));
  sprite.anchor.set(0.5);
  return sprite;
}

export async function createStage(mount: HTMLElement, atlas: Atlas): Promise<Stage> {
  const app = new Application();
  await app.init({
    resizeTo: mount,
    preference: 'webgpu',
    antialias: true,
    background: 0x8fc7e8,
  });
  mount.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const ground = makeSprite(atlas, TEXTURE_KEY_GROUND);
  ground.anchor.set(0.5, 1);
  ground.width = 4000;
  ground.height = 40;
  ground.position.set(0, 0);
  world.addChild(ground);

  const blockLayer = new Container();
  const personLayer = new Container();
  const trebuchetLayer = new Container();
  world.addChild(blockLayer, trebuchetLayer, personLayer);

  const blockSprites = new Map<string, Sprite>();
  const personSprites = new Map<string, Sprite>();
  const slingSprites: Sprite[] = [];

  // The frame is decorative (the physics base has no collider — a column in
  // the swing path would make the machine shoot itself), but without it the
  // beam appears to float and reads as nothing like a trebuchet.
  const frameLeft = makeSprite(atlas, textureKeyForTrebuchetPart('frame'));
  const frameRight = makeSprite(atlas, textureKeyForTrebuchetPart('frame'));
  const frameBrace = makeSprite(atlas, textureKeyForTrebuchetPart('frame'));
  const arm = makeSprite(atlas, textureKeyForTrebuchetPart('arm'));
  const counterweight = makeSprite(atlas, textureKeyForTrebuchetPart('counterweight'));
  const payload = makeSprite(atlas, TEXTURE_KEY_PROJECTILE);
  trebuchetLayer.addChild(frameLeft, frameRight, frameBrace, arm, counterweight, payload);
  let frameBuilt = false;

  /** Two splayed legs meeting at the pivot, plus a low cross-brace. */
  function buildFrame(t: RenderSnapshot['trebuchet']): void {
    if (frameBuilt) return;
    frameBuilt = true;
    const spread = t.pivot.y * 0.42;
    const legLen = Math.hypot(spread, t.pivot.y);
    const legThickness = Math.max(t.armThickness * 0.9, 0.12);
    for (const [sprite, side] of [[frameLeft, -1], [frameRight, 1]] as const) {
      sprite.width = legLen;
      sprite.height = legThickness;
      sprite.position.set(t.pivot.x + (side * spread) / 2, t.pivot.y / 2);
      // Leg runs from its foot on the ground up to the pivot.
      sprite.rotation = Math.atan2(t.pivot.y, -side * spread);
    }
    frameBrace.width = spread * 2;
    frameBrace.height = legThickness * 0.8;
    frameBrace.position.set(t.pivot.x, t.pivot.y * 0.28);
    frameBrace.rotation = 0;
  }

  function syncBlocks(snapshot: RenderSnapshot): void {
    const seen = new Set<string>();
    for (const b of snapshot.blocks) {
      seen.add(b.id);
      let sprite = blockSprites.get(b.id);
      if (!sprite) {
        sprite = makeSprite(atlas, textureKeyForBlock(b.material as MaterialId));
        blockLayer.addChild(sprite);
        blockSprites.set(b.id, sprite);
      }
      sprite.width = b.w;
      sprite.height = b.h;
      sprite.position.set(b.x, b.y);
      sprite.rotation = b.angle;
      sprite.alpha = b.detached ? 0.85 : 1;
    }
    for (const [id, sprite] of blockSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        blockSprites.delete(id);
      }
    }
  }

  function syncPeople(snapshot: RenderSnapshot): void {
    for (const p of snapshot.people) {
      let sprite = personSprites.get(p.id);
      const key = textureKeyForPerson(p.alive);
      if (!sprite) {
        sprite = makeSprite(atlas, key);
        sprite.width = sprite.height = 0.55;
        personLayer.addChild(sprite);
        personSprites.set(p.id, sprite);
      }
      if (sprite.label !== key) {
        sprite.texture = atlas.get(key);
        sprite.label = key;
      }
      sprite.position.set(p.x, p.y);
      sprite.rotation = p.angle;
    }
  }

  function syncTrebuchet(snapshot: RenderSnapshot): void {
    const t = snapshot.trebuchet;
    buildFrame(t);

    // The beam's local origin is the pivot, but it spans -shortArm..+longArm,
    // so its visual centre is offset along its own axis.
    arm.width = t.armLength;
    arm.height = t.armThickness;
    const beamOffset = (t.longArm - t.shortArm) / 2;
    arm.position.set(
      t.arm.x + Math.cos(t.arm.angle) * beamOffset,
      t.arm.y + Math.sin(t.arm.angle) * beamOffset,
    );
    arm.rotation = t.arm.angle;

    counterweight.width = counterweight.height = t.counterweightSize;
    counterweight.position.set(t.counterweight.x, t.counterweight.y);
    counterweight.rotation = t.counterweight.angle;

    payload.width = payload.height = t.armLength * 0.09;
    payload.position.set(t.payload.x, t.payload.y);
    payload.rotation = t.payload.angle;

    while (slingSprites.length < t.sling.length) {
      const s = makeSprite(atlas, textureKeyForTrebuchetPart('sling'));
      s.height = 0.05;
      trebuchetLayer.addChild(s);
      slingSprites.push(s);
    }
    slingSprites.forEach((s, i) => {
      const segment = t.sling[i];
      s.visible = segment !== undefined;
      if (!segment) return;
      s.position.set(segment.x, segment.y);
      s.rotation = segment.angle;
      s.width = segment.length;
    });
  }

  function render(snapshot: RenderSnapshot, bounds: WorldBounds): void {
    fitCamera(world, bounds, app.renderer.width, app.renderer.height);
    syncBlocks(snapshot);
    syncPeople(snapshot);
    syncTrebuchet(snapshot);
  }

  function destroy(): void {
    app.destroy(true, { children: true });
  }

  return { app, world, render, destroy };
}
