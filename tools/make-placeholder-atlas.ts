#!/usr/bin/env tsx
/**
 * Placeholder art pipeline: draws flat coloured shapes with material labels
 * into a real atlas (SVG, sliced by public/atlas/atlas.json) so nothing in
 * `src/render/` ever falls back to a hardcoded primitive shape. When real
 * art arrives, replace atlas.svg + atlas.json with the same key set and
 * `src/render/` needs zero changes.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIALS } from '../src/core/materials';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'atlas');

const CELL = 128;
const COLS = 4;

interface Cell {
  key: string;
  color: number;
  label: string;
  shape: 'rect' | 'circle';
}

const cells: Cell[] = [
  ...Object.values(MATERIALS).map((m) => ({ key: `block:${m.id}`, color: m.color, label: m.id[0]!.toUpperCase(), shape: 'rect' as const })),
  { key: 'person:alive', color: 0xe0455f, label: 'P', shape: 'circle' },
  { key: 'person:dead', color: 0x6b6b6b, label: 'X', shape: 'circle' },
  { key: 'projectile', color: 0x2b2b2b, label: 'O', shape: 'circle' },
  { key: 'treb:base', color: 0x5a4632, label: 'B', shape: 'rect' },
  { key: 'treb:frame', color: 0x3f2f21, label: 'F', shape: 'rect' },
  { key: 'treb:arm', color: 0x7a5c3e, label: 'A', shape: 'rect' },
  { key: 'treb:counterweight', color: 0x3a3a3a, label: 'W', shape: 'rect' },
  { key: 'treb:sling', color: 0x2f2f2f, label: 'S', shape: 'rect' },
  { key: 'ground', color: 0x4a7c3a, label: '', shape: 'rect' },
];

function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

function cellSvg(cell: Cell, x: number, y: number): string {
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const shape =
    cell.shape === 'circle'
      ? `<circle cx="${cx}" cy="${cy}" r="${CELL / 2 - 4}" fill="${hex(cell.color)}" stroke="#000" stroke-opacity="0.25" stroke-width="2" />`
      : `<rect x="${x + 4}" y="${y + 4}" width="${CELL - 8}" height="${CELL - 8}" fill="${hex(cell.color)}" stroke="#000" stroke-opacity="0.25" stroke-width="2" />`;
  const label = cell.label
    ? `<text x="${cx}" y="${cy + 8}" font-family="monospace" font-size="40" font-weight="bold" fill="#fff" fill-opacity="0.85" text-anchor="middle">${cell.label}</text>`
    : '';
  return shape + label;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const rows = Math.ceil(cells.length / COLS);
  const width = COLS * CELL;
  const height = rows * CELL;

  const keyMap: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const shapes: string[] = [];

  cells.forEach((cell, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * CELL;
    const y = row * CELL;
    keyMap[cell.key] = { x, y, w: CELL, h: CELL };
    shapes.push(cellSvg(cell, x, y));
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#1a1a1a" />
  ${shapes.join('\n  ')}
</svg>
`;

  await writeFile(path.join(OUT_DIR, 'atlas.svg'), svg);
  await writeFile(path.join(OUT_DIR, 'atlas.json'), JSON.stringify({ width, height, frames: keyMap }, null, 2) + '\n');
  process.stdout.write(`Wrote placeholder atlas: ${cells.length} keys, ${width}x${height}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
