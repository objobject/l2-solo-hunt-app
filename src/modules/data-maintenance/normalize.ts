import type { RawDataset, RawRecord } from '../../types.js';
import {
  DataValidationError,
  NORMALIZED_ENUMS,
  NORMALIZED_TABLE_COLUMNS,
  type NormalizedDataset,
  type NormalizedTable,
  stableId,
  type ValidationIssue,
} from './normalized-schema.js';

function issue(table: string, id: string, field: string, code: string, message: string): never {
  throw new DataValidationError([{ table, id, field, code, message }]);
}

/** Display text is intentionally not trimmed or rewritten. */
function display(value: string | null | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

/** Non-display source cells are mechanically trimmed; empty cells become unknown/null. */
function clean(value: string | null | undefined): string | null {
  const result = value?.trim() ?? '';
  return result === '' ? null : result;
}

export function searchKey(value: string | null): string | null {
  if (value === null) return null;
  const key = value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return key || null;
}

function requiredDisplay(
  value: string | null | undefined,
  table: string,
  id: string,
  field: string,
): string {
  const result = display(value);
  return result ?? issue(table, id, field, 'required_value', 'A display value is required.');
}

function integer(
  value: string | null | undefined,
  table: string,
  id: string,
  field: string,
): string | null {
  const result = clean(value);
  if (result === null) return null;
  if (!/^\d+$/.test(result))
    issue(table, id, field, 'invalid_integer', 'Expected a non-negative integer.');
  return result;
}

function signedInteger(
  value: string | null | undefined,
  table: string,
  id: string,
  field: string,
): string | null {
  const result = clean(value);
  if (result === null) return null;
  if (!/^-?\d+$/.test(result)) issue(table, id, field, 'invalid_integer', 'Expected an integer.');
  return result;
}

function decimal(
  value: string | null | undefined,
  table: string,
  id: string,
  field: string,
): string | null {
  const result = clean(value);
  if (result === null) return null;
  if (!/^\d+(?:\.\d+)?$/.test(result))
    issue(table, id, field, 'invalid_decimal', 'Expected a non-negative decimal.');
  return result;
}

function enumValue(
  value: string | null | undefined,
  allowed: ReadonlySet<string>,
  table: string,
  id: string,
  field: string,
): string | null {
  const result = clean(value);
  if (result === null) return null;
  if (!allowed.has(result))
    issue(table, id, field, 'unknown_enum', `Unknown enum value ${JSON.stringify(result)}.`);
  return result;
}

function bool(
  value: string | null | undefined,
  table: string,
  id: string,
  field: string,
): string | null {
  const result = clean(value);
  if (result === null) return null;
  if (result === '0') return 'false';
  if (result === '1') return 'true';
  return issue(table, id, field, 'invalid_boolean', 'Expected source boolean 0 or 1.');
}

function sourceUrl(value: string | null | undefined, table: string, id: string): string {
  const result = clean(value);
  if (!result?.startsWith('https://lineage2wiki.org/c1/'))
    return issue(table, id, 'source_url', 'invalid_source_url', 'Expected a C1 source URL.');
  return result;
}

function numericRow(
  raw: RawRecord,
  table: string,
  id: string,
  definitions: readonly [string, string, 'integer' | 'signed_integer' | 'decimal'][],
): RawRecord {
  return Object.fromEntries(
    definitions.map(([target, source, kind]) => [
      target,
      kind === 'integer'
        ? integer(raw[source], table, id, source)
        : kind === 'signed_integer'
          ? signedInteger(raw[source], table, id, source)
          : decimal(raw[source], table, id, source),
    ]),
  );
}

function monster(raw: RawRecord): RawRecord {
  const id =
    integer(raw.npc_id, 'monsters', '(unknown)', 'npc_id') ??
    issue('monsters', '(unknown)', 'npc_id', 'required_value', 'Monster ID is required.');
  const name = requiredDisplay(raw.name, 'monsters', id, 'name');
  return {
    monster_id: id,
    name,
    name_search_key: searchKey(name),
    title: display(raw.title),
    title_search_key: searchKey(display(raw.title)),
    race: enumValue(raw.race, NORMALIZED_ENUMS.monsterRace, 'monsters', id, 'race'),
    monster_type: enumValue(raw.type, NORMALIZED_ENUMS.monsterType, 'monsters', id, 'type'),
    ...numericRow(raw, 'monsters', id, [
      ['level', 'level', 'integer'],
      ['xp_reward', 'exp', 'decimal'],
      ['sp_reward', 'sp', 'decimal'],
      ['hp', 'org_hp', 'integer'],
      ['hp_regen', 'hp_reg', 'decimal'],
      ['mp', 'mp', 'integer'],
      ['mp_regen', 'hp_reg', 'decimal'],
      ['dexterity', 'dex', 'integer'],
      ['strength', 'str', 'integer'],
      ['mental', 'men', 'integer'],
      ['wit', 'wit', 'integer'],
      ['intelligence', 'int', 'integer'],
      ['magic_attack', 'm_atk', 'integer'],
      ['magic_defense', 'm_def', 'integer'],
      ['physical_defense', 'p_def', 'integer'],
      ['physical_attack', 'p_atk', 'integer'],
      ['accuracy', 'accuracy', 'integer'],
      ['critical', 'critical', 'integer'],
      ['cast_speed', 'cast_speed', 'integer'],
      ['speed', 'speed', 'integer'],
      ['attack_range', 'base_attack_range', 'integer'],
    ]),
    ground_high_text: display(raw.ground_high),
    ground_low_text: display(raw.ground_low),
    is_aggressive: bool(raw.is_aggressive, 'monsters', id, 'is_aggressive'),
    skills_text: display(raw.skills),
    herbs_text: display(raw.herbs),
    sa_text: display(raw.sa),
    source_url: sourceUrl(raw.source_url, 'monsters', id),
  };
}

function item(raw: RawRecord): RawRecord {
  const id =
    integer(raw.item_id, 'items', '(unknown)', 'item_id') ??
    issue('items', '(unknown)', 'item_id', 'required_value', 'Item ID is required.');
  const name = requiredDisplay(raw.name, 'items', id, 'name');
  const title = display(raw.title);
  return {
    item_id: id,
    name,
    name_search_key: searchKey(name),
    item_type: enumValue(raw.item_type, NORMALIZED_ENUMS.itemType, 'items', id, 'item_type'),
    slot_bit_type: enumValue(
      raw.slot_bit_type,
      NORMALIZED_ENUMS.slotBitType,
      'items',
      id,
      'slot_bit_type',
    ),
    weapon_type: enumValue(
      raw.weapon_type,
      NORMALIZED_ENUMS.weaponType,
      'items',
      id,
      'weapon_type',
    ),
    armor_type: enumValue(raw.armor_type, NORMALIZED_ENUMS.armorType, 'items', id, 'armor_type'),
    crystal_type: enumValue(
      raw.crystal_type,
      NORMALIZED_ENUMS.crystalType,
      'items',
      id,
      'crystal_type',
    ),
    crystal_count: integer(raw.crystal_count, 'items', id, 'crystal_count'),
    title,
    title_search_key: searchKey(title),
    description: display(raw.description),
    ...numericRow(raw, 'items', id, [
      ['default_price_adena', 'default_price', 'integer'],
      ['physical_damage', 'physical_damage', 'integer'],
      ['magical_damage', 'magical_damage', 'integer'],
      ['soulshot_count', 'soulshot_count', 'integer'],
      ['spiritshot_count', 'spiritshot_count', 'integer'],
      ['mp_consume', 'mp_consume', 'integer'],
      ['random_damage', 'random_damage', 'integer'],
      ['critical', 'critical', 'integer'],
      ['hit_modifier', 'hit_modify', 'signed_integer'],
      ['attack_speed', 'attack_speed', 'integer'],
    ]),
    icon: display(raw.icon),
    is_drop: bool(raw.is_drop, 'items', id, 'is_drop'),
    is_trade: bool(raw.is_trade, 'items', id, 'is_trade'),
    source_url: sourceUrl(raw.source_url, 'items', id),
  };
}

function skill(raw: RawRecord): RawRecord {
  const id =
    integer(raw.skill_id, 'skills', '(unknown)', 'skill_id') ??
    issue('skills', '(unknown)', 'skill_id', 'required_value', 'Skill ID is required.');
  const name = requiredDisplay(raw.name, 'skills', id, 'name');
  return {
    skill_id: id,
    name,
    name_search_key: searchKey(name),
    source_url: sourceUrl(raw.source_url, 'skills', id),
  };
}

function skillLevel(raw: RawRecord): RawRecord {
  const skillId =
    integer(raw.skill_id, 'skill_levels', '(unknown)', 'skill_id') ??
    issue('skill_levels', '(unknown)', 'skill_id', 'required_value', 'Skill ID is required.');
  const level =
    integer(raw.skill_level, 'skill_levels', skillId, 'skill_level') ??
    issue('skill_levels', skillId, 'skill_level', 'required_value', 'Skill level is required.');
  const name = requiredDisplay(raw.name, 'skill_levels', `${skillId}:${level}`, 'name');
  return {
    skill_id: skillId,
    skill_level: level,
    name,
    name_search_key: searchKey(name),
    source_url: sourceUrl(raw.source_url, 'skill_levels', `${skillId}:${level}`),
  };
}

function skillAttribute(raw: RawRecord): RawRecord {
  const skillId =
    integer(raw.skill_id, 'skill_attributes', '(unknown)', 'skill_id') ??
    issue('skill_attributes', '(unknown)', 'skill_id', 'required_value', 'Skill ID is required.');
  const level =
    integer(raw.skill_level, 'skill_attributes', skillId, 'skill_level') ??
    issue('skill_attributes', skillId, 'skill_level', 'required_value', 'Skill level is required.');
  const name = requiredDisplay(
    raw.attribute_name,
    'skill_attributes',
    `${skillId}:${level}`,
    'attribute_name',
  );
  return {
    skill_id: skillId,
    skill_level: level,
    attribute_name: name,
    attribute_value: display(raw.attribute_value),
    source_url: sourceUrl(raw.source_url, 'skill_attributes', `${skillId}:${level}:${name}`),
  };
}

function loot(raw: RawRecord, table: 'monster_drops' | 'monster_spoils'): RawRecord {
  const monsterId =
    integer(raw.monster_id, table, '(unknown)', 'monster_id') ??
    issue(table, '(unknown)', 'monster_id', 'required_value', 'Monster ID is required.');
  const index =
    integer(raw.relationship_index, table, monsterId, 'relationship_index') ??
    issue(
      table,
      monsterId,
      'relationship_index',
      'required_value',
      'Relationship index is required.',
    );
  const id = `${monsterId}:${index}`;
  const itemId =
    integer(raw.item_id, table, id, 'item_id') ??
    issue(table, id, 'item_id', 'required_value', 'Item ID is required.');
  const itemName = requiredDisplay(raw.item_name, table, id, 'item_name');
  const text = requiredDisplay(raw.raw_text, table, id, 'raw_text');
  const match = /\b(\d+(?:\.\d+)?)\s*%\s*(\d+)(?:\s*-\s*(\d+))?\b/.exec(text);
  if (!match)
    issue(
      table,
      id,
      'raw_text',
      'malformed_probability_or_range',
      'Expected <probability> % <quantity[-quantity]> in raw text.',
    );
  const probability = Number(match[1]) / 100;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1)
    issue(
      table,
      id,
      'raw_text',
      'invalid_probability',
      'Probability must be in the inclusive range [0, 1].',
    );
  const min = match[2] as string;
  const max = (match[3] as string | undefined) ?? min;
  if (BigInt(min) > BigInt(max))
    issue(table, id, 'raw_text', 'invalid_range', 'Quantity minimum exceeds maximum.');
  return {
    monster_id: monsterId,
    relationship_index: index,
    item_id: itemId,
    item_name: itemName,
    item_name_search_key: searchKey(itemName),
    item_source_url: sourceUrl(raw.item_source_url, table, id),
    quantity_min: min,
    quantity_max: max,
    probability: probability.toString(),
    source_quantity_text: clean(raw.quantity_text),
    source_chance_text: clean(raw.chance_text),
    raw_text: text,
    source_url: sourceUrl(raw.source_url, table, id),
  };
}

function monsterSkill(raw: RawRecord): RawRecord {
  const monsterId =
    integer(raw.monster_id, 'monster_skills', '(unknown)', 'monster_id') ??
    issue('monster_skills', '(unknown)', 'monster_id', 'required_value', 'Monster ID is required.');
  const skillId =
    integer(raw.skill_id, 'monster_skills', monsterId, 'skill_id') ??
    issue('monster_skills', monsterId, 'skill_id', 'required_value', 'Skill ID is required.');
  const level =
    integer(raw.skill_level, 'monster_skills', `${monsterId}:${skillId}`, 'skill_level') ??
    issue(
      'monster_skills',
      `${monsterId}:${skillId}`,
      'skill_level',
      'required_value',
      'Skill level is required.',
    );
  return {
    monster_id: monsterId,
    skill_id: skillId,
    skill_level: level,
    source_url: sourceUrl(raw.source_url, 'monster_skills', `${monsterId}:${skillId}:${level}`),
  };
}

function monsterLocation(raw: RawRecord): RawRecord {
  const monsterId =
    integer(raw.monster_id, 'monster_locations', '(unknown)', 'monster_id') ??
    issue(
      'monster_locations',
      '(unknown)',
      'monster_id',
      'required_value',
      'Monster ID is required.',
    );
  const index =
    integer(raw.location_index, 'monster_locations', monsterId, 'location_index') ??
    issue(
      'monster_locations',
      monsterId,
      'location_index',
      'required_value',
      'Location index is required.',
    );
  const id = `${monsterId}:${index}`;
  const spawn = display(raw.spawn_location);
  const territory = clean(raw.territory_location);
  let coordinates: unknown = null;
  let points: unknown;
  try {
    if (spawn !== null && /^\[\s*-?\d+(?:\.\d+)?\s*,/.test(spawn)) coordinates = JSON.parse(spawn);
    points = territory === null ? null : JSON.parse(territory);
  } catch {
    issue(
      'monster_locations',
      id,
      'spawn_location',
      'malformed_json',
      'Expected JSON coordinate arrays when a spawn location begins with [.',
    );
  }
  if (
    coordinates !== null &&
    (!Array.isArray(coordinates) ||
      coordinates.length !== 4 ||
      !coordinates.every((value) => typeof value === 'number'))
  )
    issue(
      'monster_locations',
      id,
      'spawn_location',
      'malformed_coordinates',
      'Expected [x,y,z,heading] numeric coordinates.',
    );
  if (
    !Array.isArray(points) ||
    !points.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 4 &&
        point.every((value) => typeof value === 'number'),
    )
  )
    issue(
      'monster_locations',
      id,
      'territory_location',
      'malformed_territory',
      'Expected territory coordinate arrays.',
    );
  return {
    monster_id: monsterId,
    location_index: index,
    spawn_location_text: spawn,
    spawn_x: coordinates === null ? null : String(coordinates[0]),
    spawn_y: coordinates === null ? null : String(coordinates[1]),
    spawn_z: coordinates === null ? null : String(coordinates[2]),
    spawn_heading: coordinates === null ? null : String(coordinates[3]),
    count: integer(raw.count, 'monster_locations', id, 'count'),
    territory_points_json: JSON.stringify(points),
    source_url: sourceUrl(raw.source_url, 'monster_locations', id),
  };
}

export function normalizeDataset(raw: RawDataset): NormalizedDataset {
  const normalized: NormalizedDataset = {
    monsters: raw.monsters.map(monster),
    items: raw.items.map(item),
    skills: raw.skills.map(skill),
    skill_levels: raw.skillLevels.map(skillLevel),
    skill_attributes: raw.skillAttributes.map(skillAttribute),
    monster_drops: raw.monsterDrops.map((row) => loot(row, 'monster_drops')),
    monster_spoils: raw.monsterSpoils.map((row) => loot(row, 'monster_spoils')),
    monster_skills: raw.monsterSkills.map(monsterSkill),
    monster_locations: raw.monsterLocations.map(monsterLocation),
  };
  assertValidNormalizedDataset(normalized);
  return normalized;
}

function addIssue(
  issues: ValidationIssue[],
  table: NormalizedTable,
  row: RawRecord,
  field: string,
  code: string,
  message: string,
): void {
  issues.push({ table, id: stableId(table, row), field, code, message });
}

export function validateNormalizedDataset(dataset: NormalizedDataset): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const table of Object.keys(NORMALIZED_TABLE_COLUMNS) as NormalizedTable[]) {
    const columns = NORMALIZED_TABLE_COLUMNS[table];
    const seen = new Set<string>();
    for (const row of dataset[table]) {
      const id = stableId(table, row);
      for (const column of columns)
        if (!(column in row))
          addIssue(
            issues,
            table,
            row,
            column,
            'missing_column',
            'Normalized row is missing schema column.',
          );
      for (const column of Object.keys(row))
        if (!columns.includes(column as never))
          addIssue(
            issues,
            table,
            row,
            column,
            'unknown_column',
            'Normalized row has an unknown schema column.',
          );
      if (seen.has(id))
        addIssue(issues, table, row, '(row)', 'duplicate_id', 'Duplicate canonical identifier.');
      seen.add(id);
      if ((row.source_url ?? '').startsWith('https://lineage2wiki.org/c1/') === false)
        addIssue(
          issues,
          table,
          row,
          'source_url',
          'invalid_source_url',
          'Expected a C1 source URL.',
        );
    }
  }
  const ids = (table: NormalizedTable, field: string): Set<string> =>
    new Set(
      dataset[table]
        .map((row) => row[field])
        .filter((value): value is string => value !== null && value !== undefined),
    );
  const monsterIds = ids('monsters', 'monster_id');
  const itemIds = ids('items', 'item_id');
  const skillIds = ids('skills', 'skill_id');
  const skillLevelIds = new Set(
    dataset.skill_levels.map((row) => `${row.skill_id}:${row.skill_level}`),
  );
  for (const table of [
    'monster_drops',
    'monster_spoils',
    'monster_skills',
    'monster_locations',
  ] as const)
    for (const row of dataset[table])
      if (!monsterIds.has(row.monster_id ?? ''))
        addIssue(
          issues,
          table,
          row,
          'monster_id',
          'orphan_foreign_key',
          'Monster ID does not exist.',
        );
  for (const table of ['monster_drops', 'monster_spoils'] as const)
    for (const row of dataset[table])
      if (!itemIds.has(row.item_id ?? ''))
        addIssue(issues, table, row, 'item_id', 'orphan_foreign_key', 'Item ID does not exist.');
  for (const table of ['skill_levels', 'skill_attributes', 'monster_skills'] as const)
    for (const row of dataset[table])
      if (!skillIds.has(row.skill_id ?? ''))
        addIssue(issues, table, row, 'skill_id', 'orphan_foreign_key', 'Skill ID does not exist.');
  for (const row of dataset.monster_skills)
    if (!skillLevelIds.has(`${row.skill_id}:${row.skill_level}`))
      addIssue(
        issues,
        'monster_skills',
        row,
        'skill_level',
        'orphan_foreign_key',
        'Skill level does not exist.',
      );
  return issues;
}

export function assertValidNormalizedDataset(dataset: NormalizedDataset): void {
  const issues = validateNormalizedDataset(dataset);
  if (issues.length) throw new DataValidationError(issues);
}
