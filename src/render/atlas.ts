import { Assets, Rectangle, Texture } from 'pixi.js';

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasManifest {
  width: number;
  height: number;
  frames: Record<string, AtlasFrame>;
}

export interface Atlas {
  manifest: AtlasManifest;
  /** Every renderable body reads its texture key from its material or
   * entity type and looks it up here — nothing in render/ ever branches on
   * "what kind of thing is this" to decide how to draw it. An unknown key
   * falls back to Pixi's own white texture rather than crashing, so a
   * typo shows up as a visible pale square instead of an exception. */
  get(key: string): Texture;
}

const ATLAS_BASE = 'atlas/atlas';

export async function loadAtlas(base = ATLAS_BASE): Promise<Atlas> {
  const [manifest, baseTexture] = await Promise.all([
    fetch(`${base}.json`).then((r) => r.json() as Promise<AtlasManifest>),
    Assets.load(`${base}.svg`) as Promise<Texture>,
  ]);

  const cache = new Map<string, Texture>();
  for (const [key, frame] of Object.entries(manifest.frames)) {
    cache.set(
      key,
      new Texture({
        source: baseTexture.source,
        frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
      }),
    );
  }

  return {
    manifest,
    get(key: string): Texture {
      return cache.get(key) ?? Texture.WHITE;
    },
  };
}
