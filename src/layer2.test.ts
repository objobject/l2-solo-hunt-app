import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { generateData, generatedDataDrift, generatedFiles } from './generate.js';
import { normalizeDataset, searchKey, validateNormalizedDataset } from './normalize.js';
import { createNormalizedManifest } from './normalized-storage.js';
import { applyOverrides, type Override } from './overrides.js';
import { DataValidationError } from './normalized-schema.js';
import { emptyDataset } from './storage.js';
import type { RawDataset } from './types.js';

const url = 'https://lineage2wiki.org/c1/monster/1/test/';

function fixture(): RawDataset {
  const data = emptyDataset();
  data.monsters.push({
    npc_id: '1',
    name: '  Café Wolf  ',
    title: '',
    race: 'animal',
    type: 'warrior',
    level: '10',
    acquire_exp_rate: '1.234500',
    acquire_sp: '2',
    org_hp: '100',
    dex: '1',
    str: '2',
    men: '3',
    wit: '4',
    int: '5',
    base_magic_attack: '6',
    base_defend: '7',
    base_physical_attack: '8',
    physical_hit_modify: '0',
    ground_high: '',
    ground_low: '',
    base_attack_range: '40',
    is_aggressive: '0',
    skills: '',
    herbs: '',
    sa: '',
    source_url: url,
  });
  data.items.push({
    item_id: '2',
    name: 'Drop Item',
    item_type: 'etcitem',
    slot_bit_type: 'none',
    weapon_type: 'none',
    armor_type: 'none',
    crystal_type: 'none',
    crystal_count: '0',
    title: '',
    description: '',
    default_price: '0',
    icon: '',
    physical_damage: '0',
    magical_damage: '0',
    soulshot_count: '0',
    spiritshot_count: '0',
    mp_consume: '0',
    random_damage: '0',
    critical: '0',
    hit_modify: '-3',
    attack_speed: '0',
    is_drop: '1',
    is_trade: '0',
    source_url: 'https://lineage2wiki.org/c1/item/2/test/',
  });
  data.skills.push({
    skill_id: '3',
    name: 'Skill',
    source_url: 'https://lineage2wiki.org/c1/skill/3/test/',
  });
  data.skillLevels.push({
    skill_id: '3',
    skill_level: '1',
    name: 'Skill',
    source_url: 'https://lineage2wiki.org/c1/skill/3/test/',
  });
  data.skillAttributes.push({
    skill_id: '3',
    skill_level: '1',
    attribute_name: 'power',
    attribute_value: '',
    source_url: 'https://lineage2wiki.org/c1/skill/3/test/',
  });
  const loot = {
    monster_id: '1',
    relationship_index: '0',
    item_id: '2',
    item_name: 'Drop Item',
    item_source_url: 'https://lineage2wiki.org/c1/item/2/test/',
    quantity_text: '2-4',
    chance_text: '',
    raw_text: 'Drop Item 12.3456 % 2 - 4 Etcitem',
    source_url: url,
  };
  data.monsterDrops.push(loot);
  data.monsterSpoils.push({ ...loot, raw_text: 'Drop Item 1 % 1 Etcitem' });
  data.monsterSkills.push({ monster_id: '1', skill_id: '3', skill_level: '1', source_url: url });
  data.monsterLocations.push({
    monster_id: '1',
    location_index: '0',
    spawn_location: '[1,2,3,4]',
    count: '1',
    territory_location: '[[1,2,3,4]]',
    source_url: url,
  });
  return data;
}

function override(fields: Partial<Override>): Override {
  return {
    entity_type: 'monsters',
    stable_id: '1',
    field: 'title',
    original_value: 'NULL',
    replacement_value: 'Alpha',
    reason: 'Approved correction',
    approval_note: 'PO approved',
    ...fields,
  };
}

describe('Layer 2 normalization', () => {
  test('preserves display text, nulls, decimal precision, ranges, and separate spoil rows', () => {
    const data = normalizeDataset(fixture());
    expect(data.monsters[0]).toMatchObject({
      name: '  Café Wolf  ',
      name_search_key: 'cafe wolf',
      title: null,
      xp_reward: '1.234500',
    });
    expect(data.items[0]).toMatchObject({ description: null, hit_modifier: '-3', is_drop: 'true' });
    expect(data.monster_drops[0]).toMatchObject({
      quantity_min: '2',
      quantity_max: '4',
      probability: '0.123456',
    });
    expect(data.monster_spoils[0]).toMatchObject({
      quantity_min: '1',
      quantity_max: '1',
      probability: '0.01',
    });
    expect(searchKey('  Café Wolf  ')).toBe('cafe wolf');
  });

  test.each([
    [
      'bad probability',
      (data: RawDataset) => {
        data.monsterDrops[0]!.raw_text = 'Drop Item many % 1';
      },
    ],
    [
      'bad range',
      (data: RawDataset) => {
        data.monsterDrops[0]!.raw_text = 'Drop Item 1 % 4 - 2';
      },
    ],
    [
      'unknown enum',
      (data: RawDataset) => {
        data.monsters[0]!.race = 'unreviewed';
      },
    ],
  ])('rejects %s with contextual machine-readable errors', (_name, mutate) => {
    const data = fixture();
    mutate(data);
    expect(() => normalizeDataset(data)).toThrow(DataValidationError);
    try {
      normalizeDataset(data);
    } catch (error) {
      expect((error as DataValidationError).issues[0]).toMatchObject({
        table: expect.any(String),
        field: expect.any(String),
        code: expect.any(String),
      });
    }
  });

  test('validates duplicate IDs and orphan foreign keys', () => {
    const data = normalizeDataset(fixture());
    data.monsters.push({ ...data.monsters[0]! });
    data.monster_drops[0]!.item_id = '999';
    expect(validateNormalizedDataset(data).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['duplicate_id', 'orphan_foreign_key']),
    );
  });
});

describe('Layer 2 overrides and generation', () => {
  test('applies only audited matching overrides and rejects bad rows', () => {
    const data = normalizeDataset(fixture());
    expect(applyOverrides(data, [override({})]).monsters[0]!.title).toBe('Alpha');
    for (const row of [
      override({ original_value: 'wrong' }),
      override({ field: 'missing' }),
      override({ entity_type: 'unknown' }),
      override({ field: 'race', original_value: 'animal', replacement_value: 'unreviewed' }),
      override({ approval_note: '' }),
    ])
      expect(() => applyOverrides(data, [row])).toThrow(DataValidationError);
  });

  test('generates deterministic readonly modules and stable-ID lookup indexes', () => {
    const data = normalizeDataset(fixture());
    const manifest = createNormalizedManifest(data, 'raw', 'overrides');
    const first = generatedFiles(data, manifest);
    expect(first).toEqual(generatedFiles(data, manifest));
    expect(first['indexes.ts']).toContain('"1"');
    expect(first['indexes.ts']).toContain('"3:1"');
    data.monsters[0]!.name = 'Changed';
    expect(
      generatedFiles(data, createNormalizedManifest(data, 'raw', 'overrides'))['monsters.ts'],
    ).not.toBe(first['monsters.ts']);
  });

  test('detects generated-data drift after normalized input changes', async () => {
    const root = join(import.meta.dirname, '..', 'data', '.staging', 'tmp_rovodev_layer2_drift');
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    try {
      const data = normalizeDataset(fixture());
      const manifest = createNormalizedManifest(data, 'raw', 'overrides');
      await generateData(root, data, manifest);
      expect(await generatedDataDrift(root, data, manifest)).toEqual([]);
      data.monsters[0]!.name = 'Changed normalized name';
      const changed = createNormalizedManifest(data, 'raw', 'overrides');
      expect(await generatedDataDrift(root, data, changed)).toEqual(
        expect.arrayContaining(['monsters.ts', 'indexes.ts']),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
