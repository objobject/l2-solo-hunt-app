import { assertC1Url } from '../scraper/policy.js';
import { ValidationError, type RawDataset, type RawRecord } from '../../types.js';

export const TABLE_COLUMNS: Record<keyof RawDataset, string[]> = {
  monsters: [
    'npc_id',
    'name',
    'title',
    'race',
    'level',
    'type',
    'acquire_exp_rate',
    'acquire_sp',
    'org_hp',
      'hp',
      'hp_reg',
      'mp',
      'mp_reg',
      'exp',
      'sp',
    'p_atk',
    'p_def',
    'accuracy',
    'critical',
    'atk_speed',
    'atk_type',
    'm_atk',
    'm_def',
    'evasion',
    'speed',
    'cast_speed',
    'atk_range',
    'str',
    'dex',
    'con',
    'int',
    'wit',
    'men',
    'base_magic_attack',
    'base_defend',
    'base_physical_attack',
    'physical_hit_modify',
    'ground_high',
    'ground_low',
    'base_attack_range',
    'is_aggressive',
    'skills',
    'herbs',
    'sa',
    'source_url',
  ],
  monsterDrops: [
    'monster_id',
    'relationship_index',
    'item_id',
    'item_name',
    'item_source_url',
    'quantity_text',
    'chance_text',
    'raw_text',
    'source_url',
  ],
  monsterSpoils: [
    'monster_id',
    'relationship_index',
    'item_id',
    'item_name',
    'item_source_url',
    'quantity_text',
    'chance_text',
    'raw_text',
    'source_url',
  ],
  monsterSkills: ['monster_id', 'skill_id', 'skill_level', 'source_url'],
  monsterLocations: [
    'monster_id',
    'location_index',
    'spawn_location',
    'count',
    'territory_location',
    'source_url',
  ],
  items: [
    'item_id',
    'item_type',
    'slot_bit_type',
    'weapon_type',
    'armor_type',
    'crystal_type',
    'crystal_count',
    'name',
    'title',
    'description',
    'default_price',
    'icon',
    'physical_damage',
    'magical_damage',
    'soulshot_count',
    'spiritshot_count',
    'mp_consume',
    'random_damage',
    'critical',
    'hit_modify',
    'attack_speed',
    'is_drop',
    'is_trade',
    'source_url',
  ],
  skills: ['skill_id', 'name', 'source_url'],
  skillLevels: ['skill_id', 'skill_level', 'name', 'source_url'],
  skillAttributes: ['skill_id', 'skill_level', 'attribute_name', 'attribute_value', 'source_url'],
};

const primaryKeys: Partial<Record<keyof RawDataset, string[]>> = {
  monsters: ['npc_id'],
  items: ['item_id'],
  skills: ['skill_id'],
  monsterDrops: ['monster_id', 'relationship_index'],
  monsterSpoils: ['monster_id', 'relationship_index'],
  monsterSkills: ['monster_id', 'skill_id', 'skill_level'],
  monsterLocations: ['monster_id', 'location_index'],
  skillLevels: ['skill_id', 'skill_level'],
  skillAttributes: ['skill_id', 'skill_level', 'attribute_name', 'attribute_value'],
};

function key(record: RawRecord, columns: string[]): string {
  return columns.map((column) => record[column] ?? '').join('\u0000');
}

function numeric(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && /^\d+$/.test(value);
}

export function validateDataset(dataset: RawDataset): string[] {
  const issues: string[] = [];
  for (const [table, records] of Object.entries(dataset) as [keyof RawDataset, RawRecord[]][]) {
    const columns = TABLE_COLUMNS[table];
    for (const [index, record] of records.entries()) {
      const extra = Object.keys(record).filter((column) => !columns.includes(column));
      if (extra.length) issues.push(`${table}[${index}] has unknown columns: ${extra.join(', ')}`);
      for (const column of columns)
        if (!(column in record)) issues.push(`${table}[${index}] missing schema column ${column}`);
      try {
        if (!record.source_url) throw new Error('missing');
        assertC1Url(record.source_url);
      } catch {
        issues.push(
          `${table}[${index}] has unsupported source_url ${record.source_url ?? '(missing)'}`,
        );
      }
    }
    const keys = primaryKeys[table];
    if (keys) {
      const seen = new Set<string>();
      for (const record of records) {
        const value = key(record, keys);
        if (seen.has(value)) issues.push(`Duplicate ${table} key ${value}`);
        seen.add(value);
      }
    }
  }
  for (const [table, field] of [
    ['monsters', 'npc_id'],
    ['items', 'item_id'],
    ['skills', 'skill_id'],
  ] as const) {
    for (const record of dataset[table])
      if (!numeric(record[field]))
        issues.push(`${table} has invalid ${field}: ${record[field] ?? '(missing)'}`);
  }
  const monsterIds = new Set(dataset.monsters.map((record) => record.npc_id));
  const itemIds = new Set(dataset.items.map((record) => record.item_id));
  const skillIds = new Set(dataset.skills.map((record) => record.skill_id));
  for (const table of [
    'monsterDrops',
    'monsterSpoils',
    'monsterLocations',
    'monsterSkills',
  ] as const)
    for (const record of dataset[table])
      if (!monsterIds.has(record.monster_id))
        issues.push(`${table} orphan monster_id ${record.monster_id}`);
  for (const table of ['monsterDrops', 'monsterSpoils'] as const)
    for (const record of dataset[table])
      if (!itemIds.has(record.item_id)) issues.push(`${table} orphan item_id ${record.item_id}`);
  for (const table of ['monsterSkills', 'skillLevels', 'skillAttributes'] as const)
    for (const record of dataset[table])
      if (!skillIds.has(record.skill_id))
        issues.push(`${table} orphan skill_id ${record.skill_id}`);
  for (const table of ['monsterDrops', 'monsterSpoils'] as const)
    for (const record of dataset[table]) {
      if (record.chance_text && !/^\d+(?:\.\d+)?%$/.test(record.chance_text))
        issues.push(`${table} malformed chance ${record.chance_text}`);
      if (record.quantity_text && !/^\d+-\d+$/.test(record.quantity_text))
        issues.push(`${table} malformed quantity ${record.quantity_text}`);
    }
  return issues;
}

export function assertValidDataset(dataset: RawDataset): void {
  const issues = validateDataset(dataset);
  if (issues.length) throw new ValidationError(issues);
}
