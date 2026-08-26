import { initPhysics } from '../core/rapier-init';
import type { RapierModule } from '../core/rapier-init';
import { loadAtlas, type Atlas } from '../render/atlas';
import { onRouteChange, navigate, type Route } from './router';
import { loadCampaignIndex, loadCampaignPack, type CampaignIndexEntry } from './campaigns';
import { loadProgress } from './progress';
import { mountGame, type GameHandle } from './game';
import { buildDailyLevel } from '../gen/daily';
import type { Level } from '../core/types';

export async function bootApp(root: HTMLDivElement): Promise<void> {
  root.innerHTML = `<div class="screen"><h1>Loading the siege...</h1></div>`;

  const [RAPIER, atlas] = await Promise.all([initPhysics(), loadAtlas()]);

  let activeGame: GameHandle | null = null;
  function teardownGame(): void {
    activeGame?.destroy();
    activeGame = null;
  }

  onRouteChange(async (route) => {
    teardownGame();
    try {
      await renderRoute(root, RAPIER, atlas, route, (g) => (activeGame = g));
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="screen"><h1>Something broke</h1><p>${String(err)}</p><button class="btn" data-action="home">Back to menu</button></div>`;
      root.querySelector('[data-action="home"]')?.addEventListener('click', () => navigate({ name: 'menu' }));
    }
  });
}

async function renderRoute(
  root: HTMLDivElement,
  RAPIER: RapierModule,
  atlas: Atlas,
  route: Route,
  setGame: (g: GameHandle) => void,
): Promise<void> {
  if (route.name === 'menu') {
    return renderMenu(root);
  }
  if (route.name === 'levelSelect') {
    return renderLevelSelect(root, route.packId);
  }
  if (route.name === 'campaign') {
    const pack = await loadCampaignPack(route.packId);
    const level = pack.levels[route.levelIndex];
    if (!level) {
      root.innerHTML = `<div class="screen"><h1>No such level</h1></div>`;
      return;
    }
    const g = await mountGame(root, RAPIER, atlas, level, {
      packId: route.packId,
      levelIndex: route.levelIndex,
      onExit: () => navigate({ name: 'levelSelect', packId: route.packId }),
    });
    setGame(g);
    return;
  }
  if (route.name === 'daily') {
    root.innerHTML = `<div class="screen"><h1>Baking today's castle...</h1></div>`;
    const { level } = buildDailyLevel(RAPIER, new Date());
    const g = await mountGame(root, RAPIER, atlas, level, {
      packId: 'daily',
      levelIndex: 0,
      onExit: () => navigate({ name: 'menu' }),
    });
    setGame(g);
    return;
  }
}

async function renderMenu(root: HTMLDivElement): Promise<void> {
  root.innerHTML = `<div class="screen"><h1>Loading campaigns...</h1></div>`;
  let packs: CampaignIndexEntry[];
  try {
    packs = await loadCampaignIndex();
  } catch {
    packs = [];
  }

  root.innerHTML = `
    <div class="screen">
      <h1>Crush the Castle</h1>
      <h2>Pick a campaign, or try today's siege</h2>
      <div class="card-grid" id="pack-list"></div>
      <button class="btn" data-action="daily">Today's Siege</button>
    </div>
  `;
  const list = root.querySelector('#pack-list')!;
  if (packs.length === 0) {
    list.innerHTML = `<p style="color:var(--muted)">No campaigns found. Run <code>npm run gen:campaigns</code>.</p>`;
  }
  for (const pack of packs) {
    const progress = loadProgress(pack.id);
    const card = document.createElement('button');
    card.className = 'card' + (progress.clearedLevels.length >= pack.levelCount ? ' done' : '');
    card.innerHTML = `<div>${pack.theme}</div><div class="difficulty">${progress.clearedLevels.length}/${pack.levelCount} cleared</div>`;
    card.addEventListener('click', () => navigate({ name: 'levelSelect', packId: pack.id }));
    list.appendChild(card);
  }
  root.querySelector('[data-action="daily"]')!.addEventListener('click', () => navigate({ name: 'daily' }));
}

async function renderLevelSelect(root: HTMLDivElement, packId: string): Promise<void> {
  root.innerHTML = `<div class="screen"><h1>Loading pack...</h1></div>`;
  const pack = await loadCampaignPack(packId);
  const progress = loadProgress(packId);

  root.innerHTML = `
    <div class="screen">
      <h1>${pack.theme}</h1>
      <div class="card-grid" id="level-list"></div>
      <button class="btn secondary" data-action="back">Back</button>
    </div>
  `;
  const list = root.querySelector('#level-list')!;
  pack.levels.forEach((level: Level, i: number) => {
    const cleared = progress.clearedLevels.includes(i);
    const stars = progress.starsByLevel[i] ?? 0;
    const card = document.createElement('button');
    card.className = 'card' + (cleared ? ' done' : '');
    card.innerHTML = `<div>Level ${i + 1}</div><div class="difficulty">${level.archetype} · difficulty ${(level.difficulty * 100).toFixed(0)}%${cleared ? ` · ${'★'.repeat(stars)}` : ''}</div>`;
    card.addEventListener('click', () => navigate({ name: 'campaign', packId, levelIndex: i }));
    list.appendChild(card);
  });
  root.querySelector('[data-action="back"]')!.addEventListener('click', () => navigate({ name: 'menu' }));
}
