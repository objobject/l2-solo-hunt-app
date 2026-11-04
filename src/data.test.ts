import { createManifest, emptyDataset } from './storage.js';
import { csvEscape, parseCsv, toCsv } from './csv.js';
import { diffDatasets, humanDiff } from './diff.js';
import { validateDataset } from './schema.js';

const source = 'https://lineage2wiki.org/c1/monster/1/test/';

describe('raw data utilities', () => {
  test('escapes CSV and orders records deterministically', () => {
    expect(csvEscape('a,"b"\n')).toBe('"a,""b""\n"');
    const csv = toCsv(
      [
        { id: '2', text: 'z' },
        { id: '1', text: 'a,b' },
      ],
      ['id', 'text'],
    );
    expect(csv).toBe('id,text\n1,"a,b"\n2,z\n');
    expect(parseCsv(csv)).toEqual([
      { id: '1', text: 'a,b' },
      { id: '2', text: 'z' },
    ]);
  });

  test('reports duplicate IDs, orphan references, bad ranges, and non-C1 URLs', () => {
    const data = emptyDataset();
    data.monsters.push({
      npc_id: '1',
      name: 'one',
      title: null,
      race: null,
      level: null,
      type: null,
      acquire_exp_rate: null,
      acquire_sp: null,
      org_hp: null,
      dex: null,
      str: null,
      men: null,
      wit: null,
      int: null,
      base_magic_attack: null,
      base_defend: null,
      base_physical_attack: null,
      physical_hit_modify: null,
      ground_high: null,
      ground_low: null,
      base_attack_range: null,
      is_aggressive: null,
      skills: null,
      herbs: null,
      sa: null,
      source_url: source,
    });
    data.monsters.push({ ...(data.monsters[0] as object) } as Record<string, string | null>);
    data.monsterDrops.push({
      monster_id: '99',
      item_id: '77',
      item_name: 'x',
      quantity_text: '1-to-2',
      chance_text: 'many%',
      raw_text: 'x',
      source_url: source,
    });
    expect(validateDataset(data).join('\n')).toMatch(
      /Duplicate monsters key 1[\s\S]*orphan monster_id 99[\s\S]*orphan item_id 77[\s\S]*malformed/,
    );
  });

  test('produces deterministic manifests and actionable snapshot diffs', () => {
    const before = emptyDataset();
    const after = emptyDataset();
    before.skills.push({
      skill_id: '1',
      name: 'Old',
      source_url: 'https://lineage2wiki.org/c1/skill/1/old/',
    });
    after.skills.push({
      skill_id: '1',
      name: 'New',
      source_url: 'https://lineage2wiki.org/c1/skill/1/new/',
    });
    const one = createManifest(after, 'User-agent: *\n', { b: '2', a: '1' });
    const two = createManifest(after, 'User-agent: *\n', { a: '1', b: '2' });
    expect(one).toEqual(two);
    const diff = diffDatasets(before, after);
    expect(diff.changed.skills).toEqual(['1']);
    expect(humanDiff(diff)).toContain('changed skills: 1');
  });
});
