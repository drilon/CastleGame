import { Sim } from '../core/sim';
import type { Level } from '../core/types';
import type { RapierModule } from '../core/rapier-init';
import type { Atlas } from '../render/atlas';
import { createStage } from '../render/stage';
import { interpolateSnapshot } from '../render/interpolate';
import { levelBounds } from '../render/camera';
import { recordClear } from './progress';
import type { RenderSnapshot } from '../core/snapshot';

export interface GameHandle {
  destroy(): void;
}

export interface GameOptions {
  packId: string;
  levelIndex: number;
  onExit(): void;
}

type ShotPhase = 'ready' | 'swinging' | 'flight' | 'over';

const REST_SPEED = 0.08;
const REST_GRACE_TICKS = 90;

export async function mountGame(root: HTMLElement, RAPIER: RapierModule, atlas: Atlas, level: Level, options: GameOptions): Promise<GameHandle> {
  root.innerHTML = '';
  const canvasMount = document.createElement('div');
  canvasMount.id = 'game-canvas-mount';
  root.appendChild(canvasMount);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div>
      <div class="stat-label">Ammo</div>
      <div class="stat-value" data-hud="ammo"></div>
    </div>
    <div>
      <button class="btn secondary" data-action="exit">Menu</button>
    </div>
    <div>
      <div class="stat-label">Remaining</div>
      <div class="stat-value" data-hud="alive"></div>
    </div>
  `;
  root.appendChild(hud);

  const banner = document.createElement('div');
  banner.id = 'overlay-banner';
  banner.innerHTML = `
    <h2 data-banner="title"></h2>
    <div style="display:flex; gap:0.75rem;">
      <button class="btn" data-action="retry">Retry</button>
      <button class="btn secondary" data-action="exit2">Menu</button>
    </div>
  `;
  root.appendChild(banner);

  const stage = await createStage(canvasMount, atlas);
  const bounds = levelBounds(level);

  let sim = new Sim(RAPIER, level, { maxTicks: 240 * 60 });
  let prevSnapshot: RenderSnapshot = sim.snapshot();
  let currSnapshot: RenderSnapshot = sim.snapshot();
  let phase: ShotPhase = 'ready';
  let ammoLeft = level.ammo;
  let shotsUsed = 0;
  let ticksSinceRelease = 0;
  let destroyed = false;

  const ammoEl = hud.querySelector('[data-hud="ammo"]')!;
  const aliveEl = hud.querySelector('[data-hud="alive"]')!;

  function updateHud(): void {
    ammoEl.textContent = String(ammoLeft);
    aliveEl.textContent = `${sim.aliveCount}/${level.people.length}`;
  }

  function showBanner(title: string): void {
    banner.querySelector('[data-banner="title"]')!.textContent = title;
    banner.classList.add('visible');
  }

  function maxBodySpeed(): number {
    let max = 0;
    for (const b of sim.world.blocks) {
      const v = b.body.linvel();
      const s = Math.hypot(v.x, v.y);
      if (s > max) max = s;
    }
    const pv = sim.rig.payload.linvel();
    const ps = Math.hypot(pv.x, pv.y);
    if (ps > max) max = ps;
    return max;
  }

  function onSettled(): void {
    if (sim.allDead) {
      phase = 'over';
      recordClear(options.packId, options.levelIndex, shotsUsed, level.par);
      showBanner('Castle cleared!');
      return;
    }
    if (ammoLeft <= 0) {
      phase = 'over';
      showBanner('Out of ammo');
      return;
    }
    sim.reloadTrebuchet();
    phase = 'ready';
  }

  function handleClick(): void {
    if (phase === 'ready') {
      sim.dropCounterweight();
      phase = 'swinging';
    } else if (phase === 'swinging') {
      sim.releaseSling();
      ammoLeft--;
      shotsUsed++;
      ticksSinceRelease = 0;
      phase = 'flight';
    }
  }

  canvasMount.addEventListener('pointerdown', handleClick);
  hud.querySelector('[data-action="exit"]')!.addEventListener('click', options.onExit);
  banner.querySelector('[data-action="exit2"]')!.addEventListener('click', options.onExit);
  banner.querySelector('[data-action="retry"]')!.addEventListener('click', () => {
    banner.classList.remove('visible');
    sim = new Sim(RAPIER, level, { maxTicks: 240 * 60 });
    prevSnapshot = sim.snapshot();
    currSnapshot = sim.snapshot();
    phase = 'ready';
    ammoLeft = level.ammo;
    shotsUsed = 0;
  });

  let lastTime = performance.now();
  function frame(now: number): void {
    if (destroyed) return;
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (phase !== 'over') {
      const tickBefore = sim.tick;
      sim.advance(dt);
      if (sim.tick !== tickBefore) {
        prevSnapshot = currSnapshot;
        currSnapshot = sim.snapshot();
      }

      if (phase === 'flight') {
        ticksSinceRelease += sim.tick - tickBefore;
        if (ticksSinceRelease > REST_GRACE_TICKS && (maxBodySpeed() < REST_SPEED || sim.allDead)) {
          onSettled();
        }
      }
    }

    const alpha = phase === 'over' ? 1 : sim.interpolationAlpha;
    stage.render(interpolateSnapshot(prevSnapshot, currSnapshot, alpha), bounds);
    updateHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    destroy(): void {
      destroyed = true;
      canvasMount.removeEventListener('pointerdown', handleClick);
      stage.destroy();
    },
  };
}
