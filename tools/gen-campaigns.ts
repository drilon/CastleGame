#!/usr/bin/env tsx
/**
 * Generates and validates the shipped campaign packs, writing them to
 * public/campaigns/*.json. Committed output means the site build never has
 * to generate anything — everything a player sees was already
 * validated-solvable at commit time.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initPhysics } from '../src/core/rapier-init';
import { buildCampaignPack } from '../src/gen/campaign';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'campaigns');

const PACKS: { id: string; theme: string; seed: string }[] = [
  { id: 'foothills', theme: 'The Foothills', seed: 'castlegame-foothills' },
  { id: 'riverlands', theme: 'The Riverlands', seed: 'castlegame-riverlands' },
  { id: 'highlands', theme: 'The Highlands', seed: 'castlegame-highlands' },
];

async function main() {
  const RAPIER = await initPhysics();
  await mkdir(OUT_DIR, { recursive: true });

  const index: { id: string; theme: string; levelCount: number }[] = [];

  for (const { id, theme, seed } of PACKS) {
    process.stdout.write(`Generating pack "${id}" (${theme})...\n`);
    const t0 = Date.now();
    const { pack, candidatesTried } = buildCampaignPack(RAPIER, id, theme, seed, {
      levelCount: 15,
      maxCandidates: 600,
      onProgress: (tried, found) => {
        if (tried % 20 === 0) process.stdout.write(`  ...${tried} candidates tried, ${found}/15 found\n`);
      },
    });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(
      `  ${pack.levels.length}/15 levels from ${candidatesTried} candidates in ${elapsed}s\n`,
    );
    if (pack.levels.length < 15) {
      throw new Error(
        `gen-campaigns: only found ${pack.levels.length}/15 solvable levels for pack "${id}" after ${candidatesTried} candidates`,
      );
    }
    const outPath = path.join(OUT_DIR, `${id}.json`);
    await writeFile(outPath, JSON.stringify(pack, null, 2) + '\n');
    index.push({ id, theme, levelCount: pack.levels.length });
  }

  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  process.stdout.write(`Wrote ${PACKS.length} packs to ${OUT_DIR}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
