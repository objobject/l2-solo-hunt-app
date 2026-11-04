import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fingerprint } from './csv.js';
import { generateData, generatedDataDrift } from './generate.js';
import { assertValidNormalizedDataset, normalizeDataset } from './normalize.js';
import { applyOverrides } from './overrides.js';
import {
  createNormalizedManifest,
  publishNormalizedDataset,
  readNormalizedDataset,
  readOverrides,
} from './normalized-storage.js';
import { validateDataset } from './schema.js';
import { readSnapshot } from './storage.js';
import { DataValidationError, type ValidationIssue } from './normalized-schema.js';

async function rawFingerprint(root: string): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(root, 'data', 'raw', 'manifest.json'), 'utf8'),
  ) as { datasetFingerprint?: unknown };
  if (typeof manifest.datasetFingerprint !== 'string')
    throw new Error('Raw manifest has no dataset fingerprint.');
  return manifest.datasetFingerprint;
}

async function normalizedInput(root: string) {
  const source = await readNormalizedDataset(root);
  if (!source) throw new Error('No normalized dataset exists. Run npm run normalize first.');
  const overrides = await readOverrides(root);
  const rawDatasetFingerprint = await rawFingerprint(root);
  const expected = createNormalizedManifest(
    source.dataset,
    rawDatasetFingerprint,
    overrides.content,
  );
  if (JSON.stringify(source.manifest) !== JSON.stringify(expected))
    throw new DataValidationError([
      {
        code: 'manifest_mismatch',
        table: 'normalized',
        id: '(manifest)',
        field: 'manifest.json',
        message: 'Normalized manifest does not match CSV input, raw fingerprint, or overrides.',
      },
    ]);
  assertValidNormalizedDataset(source.dataset);
  return source;
}

export async function normalizeData(root: string): Promise<void> {
  const raw = await readSnapshot(root);
  if (!raw) throw new Error('No canonical raw snapshot exists.');
  const rawIssues = validateDataset(raw);
  if (rawIssues.length) {
    const issues: ValidationIssue[] = rawIssues.map((message) => ({
      code: 'raw_validation',
      table: 'raw',
      id: '(unknown)',
      field: '(unknown)',
      message,
    }));
    throw new DataValidationError(issues);
  }
  const overrides = await readOverrides(root);
  const dataset = applyOverrides(normalizeDataset(raw), overrides.rows);
  assertValidNormalizedDataset(dataset);
  await publishNormalizedDataset(
    root,
    dataset,
    createNormalizedManifest(dataset, await rawFingerprint(root), overrides.content),
  );
}

export async function generateNormalizedData(root: string): Promise<void> {
  const source = await normalizedInput(root);
  await generateData(root, source.dataset, source.manifest);
}

export async function verifyLayer2Data(root: string): Promise<void> {
  const raw = await readSnapshot(root);
  if (!raw) throw new Error('No canonical raw snapshot exists.');
  const rawIssues = validateDataset(raw);
  if (rawIssues.length)
    throw new DataValidationError(
      rawIssues.map((message) => ({
        code: 'raw_validation',
        table: 'raw',
        id: '(unknown)',
        field: '(unknown)',
        message,
      })),
    );
  const source = await normalizedInput(root);
  const drift = await generatedDataDrift(root, source.dataset, source.manifest);
  if (drift.length)
    throw new DataValidationError(
      drift.map((name) => ({
        code: 'generated_drift',
        table: 'generated',
        id: name,
        field: '(file)',
        message: 'Generated output differs from normalized data.',
      })),
    );
}

export async function checkGeneratedDataDrift(root: string): Promise<void> {
  const source = await normalizedInput(root);
  const drift = await generatedDataDrift(root, source.dataset, source.manifest);
  if (drift.length) throw new Error(`Generated data drift: ${drift.join(', ')}`);
}

export async function rawContentFingerprint(root: string): Promise<string> {
  return fingerprint(await readFile(join(root, 'data', 'raw', 'manifest.json'), 'utf8'));
}
