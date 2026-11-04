import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fingerprint, parseCsv, toCsv } from './csv.js';
import { diffDatasets, humanDiff } from './diff.js';
import { TABLE_COLUMNS } from './schema.js';
import {
  C1_BASE_URL,
  SCHEMA_VERSION,
  SCRAPER_VERSION,
  type CachedResponse,
  type ChangeReport,
  type RawDataset,
  type SnapshotManifest,
} from '../../types.js';

const rawDir = (root: string) => join(root, 'data', 'raw');
const cacheDir = (root: string) => join(root, 'data', '.cache', 'responses');
const stagingRoot = (root: string) => join(root, 'data', '.staging');
export const emptyDataset = (): RawDataset => ({
  monsters: [],
  monsterDrops: [],
  monsterSpoils: [],
  monsterSkills: [],
  monsterLocations: [],
  items: [],
  skills: [],
  skillLevels: [],
  skillAttributes: [],
});

export async function readCache(root: string, url: string): Promise<CachedResponse | undefined> {
  try {
    return JSON.parse(
      await readFile(join(cacheDir(root), `${fingerprint(url)}.json`), 'utf8'),
    ) as CachedResponse;
  } catch {
    return undefined;
  }
}
export async function writeCache(root: string, response: CachedResponse): Promise<void> {
  await mkdir(cacheDir(root), { recursive: true });
  await writeFile(
    join(cacheDir(root), `${fingerprint(response.url)}.json`),
    `${JSON.stringify(response)}\n`,
  );
}

export function createManifest(
  dataset: RawDataset,
  robots: string,
  responses: Record<string, string>,
): SnapshotManifest {
  const contents = Object.entries(dataset)
    .map(([table, rows]) => toCsv(rows, TABLE_COLUMNS[table as keyof RawDataset]))
    .join('');
  return {
    c1BaseUrl: C1_BASE_URL,
    schemaVersion: SCHEMA_VERSION,
    scraperVersion: SCRAPER_VERSION,
    robotsFingerprint: fingerprint(robots),
    sourceFingerprints: Object.fromEntries(
      Object.entries(responses).sort(([a], [b]) => a.localeCompare(b)),
    ),
    counts: Object.fromEntries(
      Object.entries(dataset).map(([table, rows]) => [table, rows.length]),
    ),
    datasetFingerprint: fingerprint(contents),
  };
}

export async function readSnapshot(root: string): Promise<RawDataset | undefined> {
  try {
    const result = emptyDataset();
    for (const [table, columns] of Object.entries(TABLE_COLUMNS) as [keyof RawDataset, string[]][])
      result[table] = parseCsv(
        await readFile(
          join(
            rawDir(root),
            `${table.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}.csv`,
          ),
          'utf8',
        ),
      ).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
    return result;
  } catch {
    return undefined;
  }
}

export async function publish(
  root: string,
  dataset: RawDataset,
  manifest: SnapshotManifest,
  report: ChangeReport,
): Promise<void> {
  const stage = join(stagingRoot(root), randomUUID());
  const canonical = rawDir(root);
  const backup = `${canonical}.previous`;
  await mkdir(stage, { recursive: true });
  for (const [table, columns] of Object.entries(TABLE_COLUMNS) as [keyof RawDataset, string[]][])
    await writeFile(
      join(stage, `${table.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}.csv`),
      toCsv(dataset[table], columns),
    );
  await writeFile(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(stage, 'change-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(stage, 'change-report.txt'), humanDiff(report));
  await rm(backup, { recursive: true, force: true });
  let movedCanonical = false;
  try {
    await rename(canonical, backup);
    movedCanonical = true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await rename(stage, canonical);
  } catch (error) {
    if (movedCanonical) await rename(backup, canonical);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

export async function stagedDiff(root: string, dataset: RawDataset): Promise<ChangeReport> {
  return diffDatasets((await readSnapshot(root)) ?? emptyDataset(), dataset);
}
