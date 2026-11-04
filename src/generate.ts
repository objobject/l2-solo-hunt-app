import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fingerprint } from './csv.js';
import {
  NORMALIZED_SCHEMA_VERSION,
  NORMALIZED_TABLE_COLUMNS,
  type NormalizedDataset,
  type NormalizedTable,
} from './normalized-schema.js';
import { normalizedContents, type NormalizedManifest } from './normalized-storage.js';

const numericFields = new Set([
  'monster_id',
  'item_id',
  'skill_id',
  'skill_level',
  'relationship_index',
  'location_index',
  'level',
  'xp_reward',
  'sp_reward',
  'hp',
  'dexterity',
  'strength',
  'mental',
  'wit',
  'intelligence',
  'magic_attack',
  'physical_defense',
  'physical_attack',
  'physical_accuracy_modifier',
  'attack_range',
  'crystal_count',
  'default_price_adena',
  'physical_damage',
  'magical_damage',
  'soulshot_count',
  'spiritshot_count',
  'mp_consume',
  'random_damage',
  'critical',
  'hit_modifier',
  'attack_speed',
  'quantity_min',
  'quantity_max',
  'probability',
  'spawn_x',
  'spawn_y',
  'spawn_z',
  'spawn_heading',
  'count',
]);
const booleanFields = new Set(['is_aggressive', 'is_drop', 'is_trade']);

function typedRow(
  row: Record<string, string | null>,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(row).map(([field, value]) => [
      field,
      value === null
        ? null
        : booleanFields.has(field)
          ? value === 'true'
          : numericFields.has(field)
            ? Number(value)
            : value,
    ]),
  );
}

function ordered(
  table: NormalizedTable,
  dataset: NormalizedDataset,
): Record<string, string | number | boolean | null>[] {
  const columns = NORMALIZED_TABLE_COLUMNS[table];
  return dataset[table].map(typedRow).sort((left, right) =>
    columns
      .map((field) => String(left[field] ?? ''))
      .join('\u0000')
      .localeCompare(columns.map((field) => String(right[field] ?? '')).join('\u0000')),
  );
}

function moduleHeader(manifest: NormalizedManifest): string {
  const schemaFingerprint = fingerprint(JSON.stringify(NORMALIZED_TABLE_COLUMNS));
  return `// GENERATED FILE. DO NOT EDIT. Run npm run generate.\nexport const schemaVersion = ${JSON.stringify(NORMALIZED_SCHEMA_VERSION)} as const;\nexport const schemaFingerprint = ${JSON.stringify(schemaFingerprint)} as const;\nexport const datasetFingerprint = ${JSON.stringify(manifest.datasetFingerprint)} as const;\n\n`;
}

function dataModule(
  manifest: NormalizedManifest,
  names: readonly [NormalizedTable, string][],
  dataset: NormalizedDataset,
): string {
  return (
    moduleHeader(manifest) +
    names
      .map(
        ([table, name]) =>
          `export const ${name} = ${JSON.stringify(ordered(table, dataset), null, 2)} as const;\n`,
      )
      .join('\n')
  );
}

function indexModule(manifest: NormalizedManifest, dataset: NormalizedDataset): string {
  const monsters = ordered('monsters', dataset);
  const items = ordered('items', dataset);
  const skills = ordered('skills', dataset);
  const relationship = (table: NormalizedTable, field: string): string =>
    JSON.stringify(
      Object.fromEntries(
        ordered(table, dataset).map((row) => [
          table === 'skill_levels' ? `${row.skill_id}:${row.skill_level}` : String(row[field]),
          row,
        ]),
      ),
      null,
      2,
    );
  const group = (table: NormalizedTable, field: string): string =>
    JSON.stringify(
      ordered(table, dataset).reduce<
        Record<string, Record<string, string | number | boolean | null>[]>
      >((groups, row) => {
        const id = String(row[field]);
        (groups[id] ??= []).push(row);
        return groups;
      }, {}),
      null,
      2,
    );
  return (
    moduleHeader(manifest) +
    `export const monstersById = ${JSON.stringify(Object.fromEntries(monsters.map((row) => [String(row.monster_id), row])), null, 2)} as const;\n\n` +
    `export const itemsById = ${JSON.stringify(Object.fromEntries(items.map((row) => [String(row.item_id), row])), null, 2)} as const;\n\n` +
    `export const skillsById = ${JSON.stringify(Object.fromEntries(skills.map((row) => [String(row.skill_id), row])), null, 2)} as const;\n\n` +
    `export const dropsByMonsterId = ${group('monster_drops', 'monster_id')} as const;\n\n` +
    `export const spoilsByMonsterId = ${group('monster_spoils', 'monster_id')} as const;\n\n` +
    `export const monsterSkillsByMonsterId = ${group('monster_skills', 'monster_id')} as const;\n\n` +
    `export const locationsByMonsterId = ${group('monster_locations', 'monster_id')} as const;\n\n` +
    `export const skillLevelsByStableId = ${relationship('skill_levels', 'skill_id')} as const;\n`
  );
}

export function generatedFiles(
  dataset: NormalizedDataset,
  manifest: NormalizedManifest,
): Record<string, string> {
  return {
    'schema.ts':
      moduleHeader(manifest) +
      `export const normalizedTableColumns = ${JSON.stringify(NORMALIZED_TABLE_COLUMNS, null, 2)} as const;\n`,
    'monsters.ts': dataModule(manifest, [['monsters', 'monsters']], dataset),
    'items.ts': dataModule(manifest, [['items', 'items']], dataset),
    'skills.ts': dataModule(
      manifest,
      [
        ['skills', 'skills'],
        ['skill_levels', 'skillLevels'],
        ['skill_attributes', 'skillAttributes'],
      ],
      dataset,
    ),
    'relationships.ts': dataModule(
      manifest,
      [
        ['monster_drops', 'monsterDrops'],
        ['monster_spoils', 'monsterSpoils'],
        ['monster_skills', 'monsterSkills'],
        ['monster_locations', 'monsterLocations'],
      ],
      dataset,
    ),
    'indexes.ts': indexModule(manifest, dataset),
  };
}

export async function generateData(
  root: string,
  dataset: NormalizedDataset,
  manifest: NormalizedManifest,
): Promise<void> {
  const output = join(root, 'src', 'generated');
  await mkdir(output, { recursive: true });
  await Promise.all(
    Object.entries(generatedFiles(dataset, manifest)).map(([name, content]) =>
      writeFile(join(output, name), content),
    ),
  );
}

export async function generatedDataDrift(
  root: string,
  dataset: NormalizedDataset,
  manifest: NormalizedManifest,
): Promise<string[]> {
  const expected = generatedFiles(dataset, manifest);
  const differences: string[] = [];
  for (const [name, content] of Object.entries(expected)) {
    try {
      if ((await readFile(join(root, 'src', 'generated', name), 'utf8')) !== content)
        differences.push(name);
    } catch {
      differences.push(name);
    }
  }
  return differences;
}

export function generatedDatasetFingerprint(dataset: NormalizedDataset): string {
  return fingerprint(normalizedContents(dataset));
}
