import {
  DataValidationError,
  NORMALIZED_ENUMS,
  NORMALIZED_TABLE_COLUMNS,
  type NormalizedDataset,
  type NormalizedTable,
  stableId,
  type ValidationIssue,
} from './normalized-schema.js';

export const OVERRIDE_COLUMNS = [
  'entity_type',
  'stable_id',
  'field',
  'original_value',
  'replacement_value',
  'reason',
  'approval_note',
] as const;
export type Override = Record<(typeof OVERRIDE_COLUMNS)[number], string | null>;

function invalid(row: Override, field: string, message: string): DataValidationError {
  const issue: ValidationIssue = {
    code: 'invalid_override',
    table: row.entity_type ?? 'overrides',
    id: row.stable_id ?? '(unknown)',
    field,
    message,
  };
  return new DataValidationError([issue]);
}

function required(row: Override, field: (typeof OVERRIDE_COLUMNS)[number]): string {
  const value = row[field]?.trim();
  if (!value) throw invalid(row, field, 'Override audit field is required.');
  return value;
}

function cell(value: string): string | null {
  return value === 'NULL' ? null : value;
}

/** Applies only explicit, fully-audited semantic corrections to normalized copies. */
export function applyOverrides(dataset: NormalizedDataset, rows: Override[]): NormalizedDataset {
  const result = Object.fromEntries(
    Object.entries(dataset).map(([table, data]) => [table, data.map((row) => ({ ...row }))]),
  ) as NormalizedDataset;
  for (const row of rows) {
    const entityType = required(row, 'entity_type');
    const id = required(row, 'stable_id');
    const field = required(row, 'field');
    const original = cell(required(row, 'original_value'));
    const replacement = cell(required(row, 'replacement_value'));
    required(row, 'reason');
    required(row, 'approval_note');
    if (!(entityType in NORMALIZED_TABLE_COLUMNS))
      throw invalid(row, 'entity_type', 'Unknown normalized entity type.');
    const table = entityType as NormalizedTable;
    if (!NORMALIZED_TABLE_COLUMNS[table].includes(field as never))
      throw invalid(row, 'field', 'Unknown normalized field.');
    const enumValues: Partial<Record<NormalizedTable, Record<string, ReadonlySet<string>>>> = {
      monsters: { race: NORMALIZED_ENUMS.monsterRace, monster_type: NORMALIZED_ENUMS.monsterType },
      items: {
        item_type: NORMALIZED_ENUMS.itemType,
        slot_bit_type: NORMALIZED_ENUMS.slotBitType,
        weapon_type: NORMALIZED_ENUMS.weaponType,
        armor_type: NORMALIZED_ENUMS.armorType,
        crystal_type: NORMALIZED_ENUMS.crystalType,
      },
    };
    if (
      replacement !== null &&
      enumValues[table]?.[field] &&
      !enumValues[table][field].has(replacement)
    )
      throw invalid(row, 'replacement_value', 'Unknown enum value.');
    if (
      field === 'monster_id' ||
      field === 'item_id' ||
      field === 'skill_id' ||
      field === 'relationship_index' ||
      field === 'location_index' ||
      field === 'skill_level'
    )
      throw invalid(row, 'field', 'Identity fields cannot be overridden.');
    const target = result[table].find((candidate) => stableId(table, candidate) === id);
    if (!target) throw invalid(row, 'stable_id', 'Unknown normalized entity.');
    if ((target[field] ?? null) !== original)
      throw invalid(row, 'original_value', 'Original value does not match the normalized dataset.');
    target[field] = replacement;
  }
  return result;
}
