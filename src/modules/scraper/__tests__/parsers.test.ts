import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CrawlError } from '../../../types.js';
import {
  extractJsonVariable,
  parseClassSkills,
  parseClassUrls,
  parseItemListing,
  parseMonsterDetail,
  parseMonsterListing,
  parseSkillDetail,
} from '../parsers.js';

const fixture = (name: string): string => readFileSync(resolve('src/__fixtures__', name), 'utf8');
const monsterUrl = 'https://lineage2wiki.org/c1/monster/1/test-monster/';

describe('C1 parsers', () => {
  test('extracts embedded monster and item listings', () => {
    const monsters = parseMonsterListing(
      fixture('monster-list.html'),
      'https://lineage2wiki.org/c1/monster/',
    );
    const items = parseItemListing(fixture('item-list.html'), 'https://lineage2wiki.org/c1/item/');
    expect(monsters).toHaveLength(1);
    expect(monsters[0]).toMatchObject({ npc_id: '1', title: 'A, title', skills: '3:1;4:2' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ item_id: '100', description: 'Line 1\nLine 2' });
  });

  test('rejects missing, malformed, or changed embedded listing data', () => {
    expect(() =>
      parseMonsterListing('<script>var monsterList = [{bad}];</script>', monsterUrl),
    ).toThrow(CrawlError);
    expect(() => parseMonsterListing('<script>var changedList = [];</script>', monsterUrl)).toThrow(
      'Missing embedded monsterList payload',
    );
    expect(() => extractJsonVariable('var monsterList = [{"npc_id":"1"}', 'monsterList')).toThrow(
      'Unterminated',
    );
  });

  test('extracts drops, spoils, skills, locations, and exact skill links', () => {
    const monster = parseMonsterListing(
      fixture('monster-list.html'),
      'https://lineage2wiki.org/c1/monster/',
    )[0];
    if (!monster) throw new Error('fixture did not produce monster');
    const detail = parseMonsterDetail(fixture('monster-detail.html'), monster, monsterUrl);
    expect(detail.drops).toEqual([
      expect.objectContaining({ item_id: '100', quantity_text: '1-2', chance_text: '12.5%' }),
    ]);
    expect(detail.spoils).toEqual([
      expect.objectContaining({ item_id: '101', quantity_text: '3-4', chance_text: '1%' }),
    ]);
    expect(detail.skills).toHaveLength(2);
    expect(detail.locations).toEqual([expect.objectContaining({ count: '2' })]);
    expect(detail.skillSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill_id: '3',
          source_url: 'https://lineage2wiki.org/c1/skill/3/power-strike/',
        }),
      ]),
    );
  });

  test('supports both semicolon and comma monster skill separators', () => {
    const monster = parseMonsterListing(
      fixture('monster-list.html'),
      'https://lineage2wiki.org/c1/monster/',
    )[0];
    if (!monster) throw new Error('fixture did not produce monster');
    monster.skills = '3:1,4:2';
    expect(
      parseMonsterDetail(
        '<div v-show="drops"></div><div v-show="spoils"></div>',
        monster,
        monsterUrl,
      ).skills,
    ).toEqual([
      expect.objectContaining({ skill_id: '3', skill_level: '1' }),
      expect.objectContaining({ skill_id: '4', skill_level: '2' }),
    ]);
  });

  test('allows missing optional spawn and empty relationship sections but rejects malformed spawn', () => {
    const monster = parseMonsterListing(
      fixture('monster-list.html'),
      'https://lineage2wiki.org/c1/monster/',
    )[0];
    if (!monster) throw new Error('fixture did not produce monster');
    const empty = parseMonsterDetail(
      '<div v-show="drops"></div><div v-show="spoils"></div>',
      monster,
      monsterUrl,
    );
    expect(empty.drops).toEqual([]);
    expect(empty.spoils).toEqual([]);
    expect(empty.locations).toEqual([]);
    expect(() =>
      parseMonsterDetail('<script>var spawn = [bad];</script>', monster, monsterUrl),
    ).toThrow(CrawlError);
  });

  test('uses C1 class pages and skill detail rows', () => {
    expect(
      parseClassUrls(fixture('class-list.html'), 'https://lineage2wiki.org/c1/class/'),
    ).toEqual(['https://lineage2wiki.org/c1/class/fighter/']);
    expect(
      parseClassSkills(fixture('class-detail.html'), 'https://lineage2wiki.org/c1/class/fighter/'),
    ).toHaveLength(3);
    const skill = parseSkillDetail(
      fixture('skill-detail.html'),
      '3',
      'https://lineage2wiki.org/c1/skill/3/power-strike/',
    );
    expect(skill.name).toBe('Power Strike');
    expect(skill.levels).toHaveLength(2);
    expect(skill.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill_level: '1',
          attribute_name: 'mp.quest3',
          attribute_value: '10',
        }),
      ]),
    );
  });

  test('rejects all non-C1 parser URLs', () => {
    expect(() =>
      parseItemListing(fixture('item-list.html'), 'https://lineage2wiki.org/c4/item/'),
    ).toThrow('Non-C1');
    expect(() =>
      parseClassUrls(fixture('class-list.html'), 'https://example.test/c1/class/'),
    ).toThrow('Non-C1');
  });
});
