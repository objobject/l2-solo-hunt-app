import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fingerprint, parseCsv, toCsv } from './csv.js';
import {
  NORMALIZED_SCHEMA_VERSION,
  NORMALIZED_TABLE_COLUMNS,
  normalizedFilename,
  type NormalizedDataset,
  type NormalizedTable,
} from './normalized-schema.js';
import { OVERRIDE_COLUMNS, type Override } from './overrides.js';

const normalizedDir = (root: string): string => join(root, 'data', 'normalized');
const overrideFile = (root: string): string =>
  join(root, 'data', 'overrides', 'semantic_overrides.csv');
const stagingRoot = (root: string): string => join(root, 'data', '.staging');

export type NormalizedManifest = {
  schemaVersion: string;
  rawDatasetFingerprint: string;
  overridesFingerprint: string;
  datasetFingerprint: string;
  counts: Record<string, number>;
};

export function emptyNormalizedDataset(): NormalizedDataset {
  return Object.fromEntries(
    Object.keys(NORMALIZED_TABLE_COLUMNS).map((table) => [table, []]),
  ) as unknown as NormalizedDataset;
}

export function normalizedContents(dataset: NormalizedDataset): string {
  return (Object.keys(NORMALIZED_TABLE_COLUMNS) as NormalizedTable[])
    .map((table) => toCsv(dataset[table], [...NORMALIZED_TABLE_COLUMNS[table]]))
    .join('');
}

export function createNormalizedManifest(
  dataset: NormalizedDataset,
  rawDatasetFingerprint: string,
  overridesContent: string,
): NormalizedManifest {
  return {
    schemaVersion: NORMALIZED_SCHEMA_VERSION,
    rawDatasetFingerprint,
    overridesFingerprint: fingerprint(overridesContent),
    datasetFingerprint: fingerprint(normalizedContents(dataset)),
    counts: Object.fromEntries(
      Object.entries(dataset).map(([table, rows]) => [table, rows.length]),
    ),
  };
}

export async function readOverrides(root: string): Promise<{ rows: Override[]; content: string }> {
  const content = await readFile(overrideFile(root), 'utf8');
  return {
    content,
    rows: parseCsv(content).map(
      (row) =>
        Object.fromEntries(
          OVERRIDE_COLUMNS.map((column) => [column, row[column] ?? null]),
        ) as Override,
    ),
  };
}

export async function readNormalizedDataset(
  root: string,
): Promise<{ dataset: NormalizedDataset; manifest: NormalizedManifest } | undefined> {
  try {
    const dataset = emptyNormalizedDataset();
    for (const table of Object.keys(NORMALIZED_TABLE_COLUMNS) as NormalizedTable[]) {
      const columns = NORMALIZED_TABLE_COLUMNS[table];
      dataset[table] = parseCsv(
        await readFile(join(normalizedDir(root), normalizedFilename(table)), 'utf8'),
      ).map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
    }
    const manifest = JSON.parse(
      await readFile(join(normalizedDir(root), 'manifest.json'), 'utf8'),
    ) as NormalizedManifest;
    return { dataset, manifest };
  } catch {
    return undefined;
  }
}

export async function publishNormalizedDataset(
  root: string,
  dataset: NormalizedDataset,
  manifest: NormalizedManifest,
): Promise<void> {
  const stage = join(stagingRoot(root), `normalized-${randomUUID()}`);
  const destination = normalizedDir(root);
  const backup = `${destination}.previous`;
  await mkdir(stage, { recursive: true });
  for (const table of Object.keys(NORMALIZED_TABLE_COLUMNS) as NormalizedTable[])
    await writeFile(
      join(stage, normalizedFilename(table)),
      toCsv(dataset[table], [...NORMALIZED_TABLE_COLUMNS[table]]),
    );
  await writeFile(join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(backup, { recursive: true, force: true });
  let moved = false;
  try {
    await rename(destination, backup);
    moved = true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await rename(stage, destination);
  } catch (error) {
    if (moved) await rename(backup, destination);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}
