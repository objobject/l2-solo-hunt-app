import type { RawRecord } from '../../types.js';

/** Layer 2 normalized CSV schemas. Numeric values use the source's game units:
 * levels/counts/stats are points, item prices are adena, probabilities are fractions [0,1],
 * and spawn coordinates/heading retain the wiki's game-coordinate units. */
export const NORMALIZED_TABLE_COLUMNS = {
  monsters: [
    'monster_id',
    'name',
    'name_search_key',
    'title',
    'title_search_key',
    'race',
    'monster_type',
    'level',
    'xp_reward',
    'sp_reward',
    'hp',
    'hp_regen',
    'mp',
    'mp_regen',
    'dexterity',
    'strength',
    'mental',
    'wit',
    'intelligence',
    'magic_attack',
      'magic_defense',
    'physical_defense',
    'physical_attack',
    'accuracy',
    'critical',
      'cast_speed',
      'speed',
    'ground_high_text',
    'ground_low_text',
    'attack_range',
    'is_aggressive',
    'skills_text',
    'herbs_text',
    'sa_text',
    'source_url',
  ],
  items: [
    'item_id',
    'name',
    'name_search_key',
    'item_type',
    'slot_bit_type',
    'weapon_type',
    'armor_type',
    'crystal_type',
    'crystal_count',
    'title',
    'title_search_key',
    'description',
    'default_price_adena',
    'icon',
    'physical_damage',
    'magical_damage',
    'soulshot_count',
    'spiritshot_count',
    'mp_consume',
    'random_damage',
    'critical',
    'hit_modifier',
    'attack_speed',
    'is_drop',
    'is_trade',
    'source_url',
  ],
  skills: ['skill_id', 'name', 'name_search_key', 'source_url'],
  skill_levels: ['skill_id', 'skill_level', 'name', 'name_search_key', 'source_url'],
  skill_attributes: ['skill_id', 'skill_level', 'attribute_name', 'attribute_value', 'source_url'],
  monster_drops: [
    'monster_id',
    'relationship_index',
    'item_id',
    'item_name',
    'item_name_search_key',
    'item_source_url',
    'quantity_min',
    'quantity_max',
    'probability',
    'source_quantity_text',
    'source_chance_text',
    'raw_text',
    'source_url',
  ],
  monster_spoils: [
    'monster_id',
    'relationship_index',
    'item_id',
    'item_name',
    'item_name_search_key',
    'item_source_url',
    'quantity_min',
    'quantity_max',
    'probability',
    'source_quantity_text',
    'source_chance_text',
    'raw_text',
    'source_url',
  ],
  monster_skills: ['monster_id', 'skill_id', 'skill_level', 'source_url'],
  monster_locations: [
    'monster_id',
    'location_index',
    'spawn_location_text',
    'spawn_x',
    'spawn_y',
    'spawn_z',
    'spawn_heading',
    'count',
    'territory_points_json',
    'source_url',
  ],
} as const;

export type NormalizedTable = keyof typeof NORMALIZED_TABLE_COLUMNS;
export type NormalizedDataset = { [T in NormalizedTable]: RawRecord[] };

export const NORMALIZED_SCHEMA_VERSION = '2';

export const NORMALIZED_ENUMS = {
  monsterRace: new Set([
    'animal',
    'beast',
    'bug',
    'castle_guard',
    'construct',
    'darkelf',
    'demonic',
    'dragon',
    'dwarf',
    'elemental',
    'elf',
    'fairy',
    'giant',
    'human',
    'humanoid',
    'monster',
    'orc',
    'plant',
    'undead',
  ]),
  monsterType: new Set([
    'blacksmith',
    'boss',
    'chamberlain',
    'citizen',
    'guard',
    'guild_coach',
    'guild_master',
    'merchant',
    'package_keeper',
    'teleporter',
    'warehouse_keeper',
    'warrior',
    'zzoldagu',
  ]),
  itemType: new Set(['accessary', 'armor', 'asset', 'etcitem', 'weapon']),
  slotBitType: new Set([
    'chest',
    'feet',
    'gloves',
    'head',
    'legs',
    'lhand',
    'lrhand',
    'neck',
    'none',
    'onepiece',
    'rear;lear',
    'rfinger;lfinger',
    'rhand',
  ]),
  weaponType: new Set([
    'blunt',
    'bow',
    'dagger',
    'dual',
    'dualfist',
    'etc',
    'none',
    'pole',
    'sword',
  ]),
  armorType: new Set(['heavy', 'light', 'magic', 'none']),
  crystalType: new Set(['a', 'b', 'c', 'crystal_free', 'd', 'none', 's']),
} as const;

export type ValidationIssue = {
  code: string;
  table: string;
  id: string;
  field: string;
  message: string;
};

export class DataValidationError extends Error {
  public constructor(public readonly issues: ValidationIssue[]) {
    super(JSON.stringify({ issues }));
    this.name = 'DataValidationError';
  }
}

export function stableId(table: NormalizedTable, row: RawRecord): string {
  const part = (name: string): string => row[name] ?? '(null)';
  switch (table) {
    case 'monsters':
      return part('monster_id');
    case 'items':
      return part('item_id');
    case 'skills':
      return part('skill_id');
    case 'skill_levels':
      return `${part('skill_id')}:${part('skill_level')}`;
    case 'skill_attributes':
      return `${part('skill_id')}:${part('skill_level')}:${part('attribute_name')}`;
    case 'monster_drops':
    case 'monster_spoils':
      return `${part('monster_id')}:${part('relationship_index')}`;
    case 'monster_skills':
      return `${part('monster_id')}:${part('skill_id')}:${part('skill_level')}`;
    case 'monster_locations':
      return `${part('monster_id')}:${part('location_index')}`;
  }
}

export const normalizedFilename = (table: NormalizedTable): string => `${table}.csv`;
