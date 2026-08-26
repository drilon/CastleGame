#!/usr/bin/env tsx
/**
 * Headless validator, runnable standalone (`npm run validate`) or from CI
 * (`.github/workflows/deploy.yml`). Re-sweeps every level in every
 * committed campaign pack and fails the process if any level has no
 * winning shot sequence — a level regression should never reach main.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initPhysics } from '../src/core/rapier-init';
import { evaluateLevel } from '../src/gen/evaluate';
import type { Level } from '../src/core/types';
import type { CampaignPack } from '../src/gen/campaign';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMPAIGNS_DIR = path.join(__dirname, '..', 'public', 'campaigns');

async function main() {
  const RAPIER = await initPhysics();
  const files = (await readdir(CAMPAIGNS_DIR)).filter((f) => f.endsWith('.json') && f !== 'index.json');

  if (files.length === 0) {
    console.error(`validate: no campaign packs found in ${CAMPAIGNS_DIR} — run \`npm run gen:campaigns\` first`);
    process.exit(1);
  }

  let failures = 0;
  let totalLevels = 0;

  for (const file of files) {
    const raw = await readFile(path.join(CAMPAIGNS_DIR, file), 'utf-8');
    const pack: CampaignPack = JSON.parse(raw);
    process.stdout.write(`${pack.id}: ${pack.levels.length} levels\n`);

    for (const level of pack.levels as Level[]) {
      totalLevels++;
      const result = evaluateLevel(RAPIER, level);
      const status = result.solvable ? 'OK' : 'UNSOLVABLE';
      process.stdout.write(
        `  ${level.id.padEnd(20)} difficulty=${level.difficulty.toFixed(2)} winFrac=${result.winningFraction.toFixed(2)} ${status}\n`,
      );
      if (!result.solvable) failures++;
    }
  }

  process.stdout.write(`\n${totalLevels - failures}/${totalLevels} levels solvable\n`);
  if (failures > 0) {
    console.error(`validate: ${failures} level(s) failed validation`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
