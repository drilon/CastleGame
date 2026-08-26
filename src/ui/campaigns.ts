import type { CampaignPack } from '../gen/campaign';

export interface CampaignIndexEntry {
  id: string;
  theme: string;
  levelCount: number;
}

const base = import.meta.env.BASE_URL;

export async function loadCampaignIndex(): Promise<CampaignIndexEntry[]> {
  const res = await fetch(`${base}campaigns/index.json`);
  if (!res.ok) throw new Error(`loadCampaignIndex: ${res.status}`);
  return res.json();
}

export async function loadCampaignPack(id: string): Promise<CampaignPack> {
  const res = await fetch(`${base}campaigns/${id}.json`);
  if (!res.ok) throw new Error(`loadCampaignPack(${id}): ${res.status}`);
  return res.json();
}
