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

  const arm = makeSprite(atlas, textureKeyForTrebuchetPart('arm'));
  const counterweight = makeSprite(atlas, textureKeyForTrebuchetPart('counterweight'));
  const payload = makeSprite(atlas, TEXTURE_KEY_PROJECTILE);
  counterweight.width = counterweight.height = 0.9;
  payload.width = payload.height = 0.6;
  trebuchetLayer.addChild(arm, counterweight, payload);

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
    arm.width = 2;
    arm.height = 0.22;
    arm.position.set(t.arm.x, t.arm.y);
    arm.rotation = t.arm.angle;

    counterweight.position.set(t.counterweight.x, t.counterweight.y);
    counterweight.rotation = t.counterweight.angle;

    payload.position.set(t.payload.x, t.payload.y);
    payload.rotation = t.payload.angle;

    while (slingSprites.length < t.sling.length) {
      const s = makeSprite(atlas, textureKeyForTrebuchetPart('sling'));
      s.width = 1;
      s.height = 0.08;
      trebuchetLayer.addChild(s);
      slingSprites.push(s);
    }
    t.sling.forEach((segment, i) => {
      const s = slingSprites[i]!;
      s.position.set(segment.x, segment.y);
      s.rotation = segment.angle;
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
