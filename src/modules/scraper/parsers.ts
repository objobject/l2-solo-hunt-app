import * as cheerio from 'cheerio';
import { assertC1Url } from './policy.js';
import { CrawlError, type RawRecord } from '../../types.js';

function jsonValueAt(source: string, position: number): unknown {
  const opening = source[position];
  if (opening !== '[' && opening !== '{') throw new CrawlError('Expected embedded JSON value');
  const stack: string[] = [];
  let quote: string | undefined;
  let escaped = false;
  for (let index = position; index < source.length; index += 1) {
    const character = source[index] as string;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"') {
      quote = character;
      continue;
    }
    if (character === '[' || character === '{') stack.push(character);
    else if (character === ']' || character === '}') {
      const openingBracket = stack.pop();
      if (
        (character === ']' && openingBracket !== '[') ||
        (character === '}' && openingBracket !== '{')
      )
        throw new CrawlError('Malformed embedded JSON payload');
      if (stack.length === 0) {
        try {
          return JSON.parse(source.slice(position, index + 1));
        } catch {
          throw new CrawlError('Malformed embedded JSON payload');
        }
      }
    }
  }
  throw new CrawlError('Unterminated embedded JSON payload');
}

export function extractJsonVariable(source: string, name: string): unknown {
  const match = new RegExp(`\\b(?:var|let|const)\\s+${name}\\s*=\\s*`).exec(source);
  if (!match || match.index === undefined) throw new CrawlError(`Missing embedded ${name} payload`);
  const start = match.index + match[0].length;
  return jsonValueAt(source, start);
}

function scalar(value: unknown): string | null {
  return value === undefined || value === null ? null : String(value);
}

function recordsFromListing(payload: unknown, identity: string, sourceUrl: string): RawRecord[] {
  if (!Array.isArray(payload)) throw new CrawlError('Listing payload is not an array');
  const records = payload.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new CrawlError('Listing contains non-record entry');
    const record = Object.fromEntries(
      Object.entries(entry).map(([key, value]) => [key, scalar(value)]),
    );
    if (!record[identity] || !/^\d+$/.test(record[identity] ?? ''))
      throw new CrawlError(`Listing has invalid ${identity}`);
    return record;
  });
  if (records.length === 0) throw new CrawlError('Listing has no records');
  return records.map((record) => ({ ...record, source_url: sourceUrl }));
}

export function parseMonsterListing(html: string, sourceUrl: string): RawRecord[] {
  assertC1Url(sourceUrl);
  return recordsFromListing(extractJsonVariable(html, 'monsterList'), 'npc_id', sourceUrl);
}

export function parseItemListing(html: string, sourceUrl: string): RawRecord[] {
  assertC1Url(sourceUrl);
  return recordsFromListing(extractJsonVariable(html, 'itemsList'), 'item_id', sourceUrl);
}

function detailItemLink(
  row: ReturnType<ReturnType<typeof cheerio.load>>,
): { id: string; name: string | null; url: string } | undefined {
  const link = row.find('a[href*="/c1/item/"]').first();
  const href = link.attr('href');
  if (!href) return undefined;
  const match = /\/c1\/item\/(\d+)\//.exec(href);
  return match
    ? { id: match[1] as string, name: link.text().trim() || null, url: href }
    : undefined;
}

function relationshipRows(
  html: string,
  tab: 'drops' | 'spoils',
  monsterId: string,
  sourceUrl: string,
): RawRecord[] {
  const $ = cheerio.load(html);
  const selector = `div[v-show*="${tab}"] .drops_row, section[data-kind="${tab}"] .drops_row`;
  const rows: RawRecord[] = [];
  $(selector).each((index, element) => {
    const row = $(element);
    const item = detailItemLink(row);
    if (!item) throw new CrawlError(`${tab} row does not contain a C1 item link`);
    const text = row.text().replace(/\s+/g, ' ').trim();
    const chance =
      /(?:chance|rate)\s*[:]?\s*([\d.]+%)/i.exec(text)?.[1] ??
      /\b([\d.]+%)\b/.exec(text)?.[1] ??
      null;
    const quantity = /\b(\d+\s*-\s*\d+)\b/.exec(text)?.[1]?.replace(/\s+/g, '') ?? null;
    rows.push({
      monster_id: monsterId,
      relationship_index: String(index),
      item_id: item.id,
      item_name: item.name,
      item_source_url: new URL(item.url, sourceUrl).toString(),
      quantity_text: quantity,
      chance_text: chance,
      raw_text: text,
      source_url: sourceUrl,
    });
  });
  return rows;
}

export function parseMonsterDetail(
  html: string,
  monster: RawRecord,
  sourceUrl: string,
): {
  drops: RawRecord[];
  spoils: RawRecord[];
  skills: RawRecord[];
  locations: RawRecord[];
  skillSources: RawRecord[];
} {
  assertC1Url(sourceUrl);
  const monsterId = monster.npc_id;
  if (!monsterId) throw new CrawlError('Monster without npc_id');
  const skills = (monster.skills ?? '')
    .split(/[;,]/)
    .filter(Boolean)
    .map((entry) => {
      const match = /^(\d+):(\d+)$/.exec(entry);
      if (!match) throw new CrawlError(`Malformed monster skill relationship: ${entry}`);
      return {
        monster_id: monsterId,
        skill_id: match[1] as string,
        skill_level: match[2] as string,
        source_url: sourceUrl,
      };
    });
  let spawn: unknown;
  try {
    spawn = extractJsonVariable(html, 'spawn');
  } catch (error) {
    if (error instanceof CrawlError && error.message === 'Missing embedded spawn payload')
      spawn = [];
    else throw error;
  }
  if (!Array.isArray(spawn)) throw new CrawlError('Monster spawn payload is not an array');
  const locations = spawn.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new CrawlError('Malformed monster spawn entry');
    const value = entry as Record<string, unknown>;
    return {
      monster_id: monsterId,
      location_index: String(index),
      spawn_location: scalar(value.spawn_location),
      count: scalar(value.count),
      territory_location: scalar(value.territory_location),
      source_url: sourceUrl,
    };
  });
  const skillSources: RawRecord[] = [];
  const $ = cheerio.load(html);
  $('a[href*="/c1/skill/"]').each((_index, element) => {
    const href = $(element).attr('href') ?? '';
    const match = /\/c1\/skill\/(\d+)\//.exec(href);
    if (match)
      skillSources.push({
        skill_id: match[1] as string,
        name:
          $(element)
            .text()
            .replace(/\s+/g, ' ')
            .replace(/\s*Lv\.\s*\d+\s*$/i, '')
            .trim() || null,
        source_url: new URL(href, sourceUrl).toString(),
      });
  });
  return {
    drops: relationshipRows(html, 'drops', monsterId, sourceUrl),
    spoils: relationshipRows(html, 'spoils', monsterId, sourceUrl),
    skills,
    locations,
    skillSources,
  };
}

export function parseItemDetail(html: string, sourceUrl: string): RawRecord {
  assertC1Url(sourceUrl);
  const payload = extractJsonVariable(html, 'item');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new CrawlError('Item detail payload is not a record');
  const record = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, scalar(value)]),
  );
  if (!record.item_id || !/^\d+$/.test(record.item_id))
    throw new CrawlError('Item detail has invalid item_id');
  return { ...record, source_url: sourceUrl };
}

export function parseClassUrls(html: string, sourceUrl: string): string[] {
  assertC1Url(sourceUrl);
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href^="/c1/class/"]').each((_index, element) => {
    const href = $(element).attr('href');
    if (href && href !== '/c1/class/') urls.add(new URL(href, sourceUrl).toString());
  });
  if (urls.size === 0) throw new CrawlError('Class listing contains no class detail URLs');
  return [...urls].sort();
}

export function parseClassSkills(html: string, sourceUrl: string): RawRecord[] {
  assertC1Url(sourceUrl);
  const $ = cheerio.load(html);
  const records: RawRecord[] = [];
  $('a[href*="/c1/skill/"]').each((_index, element) => {
    const link = $(element);
    const href = link.attr('href') ?? '';
    const match = /\/c1\/skill\/(\d+)\//.exec(href);
    if (!match) return;
    const display = link.text().replace(/\s+/g, ' ').trim();
    const level = /\bLv\.\s*(\d+)\b/i.exec(display)?.[1] ?? null;
    const name = display.replace(/\s*Lv\.\s*\d+\s*$/i, '').trim() || null;
    records.push({
      skill_id: match[1] as string,
      skill_level: level,
      name,
      source_url: new URL(href, sourceUrl).toString(),
    });
  });
  if (records.length === 0) throw new CrawlError('Class detail contains no skill links');
  return records;
}

export function parseSkillDetail(
  html: string,
  skillId: string,
  sourceUrl: string,
): { name: string; levels: RawRecord[]; attributes: RawRecord[] } {
  assertC1Url(sourceUrl);
  if (!/^\d+$/.test(skillId)) throw new CrawlError(`Invalid skill_id ${skillId}`);
  const $ = cheerio.load(html);
  const name = $('h1').first().text().replace(/\s+/g, ' ').trim();
  if (!name) throw new CrawlError(`Skill detail ${skillId} has no H1 name`);
  const levels: RawRecord[] = [];
  const attributes: RawRecord[] = [];
  $('.skill-row').each((_index, element) => {
    const row = $(element);
    const heading = row.find('.txt_table_6').first().text().replace(/\s+/g, ' ').trim();
    const level = /\bLv\.\s*(\d+)\b/i.exec(heading)?.[1];
    if (!level) throw new CrawlError(`Skill detail ${skillId} contains a row without a level`);
    levels.push({ skill_id: skillId, skill_level: level, name, source_url: sourceUrl });
    row.children('div').each((columnIndex, column) => {
      const value = $(column).text().replace(/\s+/g, ' ').trim();
      if (!value) return;
      const classes = ($(column).attr('class') ?? '').split(/\s+/).filter(Boolean);
      const attributeName = classes.length > 0 ? classes.sort().join('.') : `column_${columnIndex}`;
      attributes.push({
        skill_id: skillId,
        skill_level: level,
        attribute_name: attributeName,
        attribute_value: value,
        source_url: sourceUrl,
      });
    });
  });
  if (levels.length === 0) throw new CrawlError(`Skill detail ${skillId} contains no level rows`);
  return { name, levels, attributes };
}
