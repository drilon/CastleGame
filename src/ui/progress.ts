/** Progress is per-pack, in localStorage — no accounts, no server. */
export interface PackProgress {
  clearedLevels: number[];
  starsByLevel: Record<number, number>;
}

const KEY_PREFIX = 'castlegame:progress:';

function key(packId: string): string {
  return KEY_PREFIX + packId;
}

export function loadProgress(packId: string): PackProgress {
  try {
    const raw = localStorage.getItem(key(packId));
    if (!raw) return { clearedLevels: [], starsByLevel: {} };
    const parsed = JSON.parse(raw) as PackProgress;
    return { clearedLevels: parsed.clearedLevels ?? [], starsByLevel: parsed.starsByLevel ?? {} };
  } catch {
    return { clearedLevels: [], starsByLevel: {} };
  }
}

export function recordClear(packId: string, levelIndex: number, shotsUsed: number, par: number): void {
  const progress = loadProgress(packId);
  if (!progress.clearedLevels.includes(levelIndex)) progress.clearedLevels.push(levelIndex);
  const stars = shotsUsed <= par ? 3 : shotsUsed <= par + 1 ? 2 : 1;
  progress.starsByLevel[levelIndex] = Math.max(progress.starsByLevel[levelIndex] ?? 0, stars);
  try {
    localStorage.setItem(key(packId), JSON.stringify(progress));
  } catch {
    // Storage unavailable (private browsing, quota) — progress just won't persist.
  }
}
