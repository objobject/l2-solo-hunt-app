import { createHash } from 'node:crypto';
import {
  C1_BASE_URL,
  CrawlError,
  type CrawlOptions,
  type HttpClient,
  type RawDataset,
  type RawRecord,
  type Sleeper,
  type SourceResponse,
} from './types.js';
import { assertC1Url, requireC1Allowed, retry, retryAfterMilliseconds } from './policy.js';
import {
  parseClassSkills,
  parseClassUrls,
  parseItemDetail,
  parseItemListing,
  parseMonsterDetail,
  parseMonsterListing,
  parseSkillDetail,
} from './parsers.js';
import { assertValidDataset, TABLE_COLUMNS } from './schema.js';
import { createManifest, publish, readCache, stagedDiff, writeCache } from './storage.js';

const USER_AGENT =
  'L2RebornLegacyLayer1Scraper/0.1 (+https://github.com/l2-reborn-legacy-solo-hunt-calc; contact: project-maintainer@example.invalid)';
const sleep: Sleeper = async (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

class RetryableHttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly retryAfter: number | undefined,
  ) {
    super(`Transient HTTP ${status}`);
  }
}

export function nodeHttpClient(timeoutMs: number): HttpClient {
  return {
    get: async (url) => {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return {
        url: response.url,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      };
    },
  };
}

function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw new CrawlError(`Cannot derive a source slug from ${name}`);
  return slug;
}

function detailUrl(kind: 'monster' | 'item' | 'skill', id: string, name: string): string {
  return `${C1_BASE_URL}${kind}/${id}/${slugify(name)}/`;
}

async function cachedGet(
  client: HttpClient,
  options: CrawlOptions,
  url: string,
  fingerprints: Record<string, string>,
  sleeper: Sleeper,
): Promise<SourceResponse> {
  assertC1Url(url);
  if (!options.fullRefresh) {
    const cached = await readCache(options.rootDir, url);
    if (cached !== undefined && cached.status >= 200 && cached.status < 300) {
      fingerprints[url] = cached.contentHash;
      return cached;
    }
  }
  const response = await retry(
    async () => {
      let result: SourceResponse;
      try {
        result = await client.get(url);
      } catch {
        throw new RetryableHttpError(0, undefined);
      }
      if (result.status === 429 || result.status >= 500)
        throw new RetryableHttpError(
          result.status,
          retryAfterMilliseconds(result.headers['retry-after']),
        );
      if (result.status < 200 || result.status >= 300)
        throw new CrawlError(`Permanent HTTP ${result.status} for ${url}`);
      return result;
    },
    (error) => (error instanceof RetryableHttpError ? (error.retryAfter ?? 0) : undefined),
    sleeper,
    options.maxRetries,
  );
  const contentHash = createHash('sha256').update(response.body).digest('hex');
  fingerprints[url] = contentHash;
  await writeCache(options.rootDir, {
    ...response,
    retrievedAt: new Date().toISOString(),
    contentHash,
  });
  return response;
}

async function detailPages<T>(
  entries: T[],
  options: CrawlOptions,
  sleeper: Sleeper,
  action: (entry: T) => Promise<void>,
): Promise<void> {
  const workers = Math.max(1, options.concurrency);
  let cursor = 0;
  let lastStart = 0;
  const next = async (): Promise<T | undefined> => {
    const entry = entries[cursor];
    cursor += 1;
    if (!entry) return undefined;
    const wait = Math.max(0, lastStart + options.detailDelayMs - Date.now());
    lastStart = Date.now() + wait;
    if (wait) await sleeper(wait);
    return entry;
  };
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const entry = await next();
        if (!entry) return;
        await action(entry);
      }
    }),
  );
}

function dedupeRecords(records: RawRecord[], columns: string[]): RawRecord[] {
  const rows = new Map<string, RawRecord>();
  for (const record of records) {
    const key = columns.map((column) => record[column] ?? '').join('\u0000');
    rows.set(key, record);
  }
  return [...rows.values()];
}

function mergeSkill(records: RawRecord[]): RawRecord[] {
  const combined = new Map<string, RawRecord>();
  for (const record of records) {
    const id = record.skill_id;
    if (!id) throw new CrawlError('Skill without skill_id');
    const prior = combined.get(id);
    if (!prior || (prior.name === null && record.name !== null)) {
      combined.set(id, {
        skill_id: id,
        name: record.name ?? null,
        source_url: record.source_url ?? null,
      });
    }
  }
  return [...combined.values()];
}

export async function scrape(
  options: CrawlOptions,
  client = nodeHttpClient(options.timeoutMs),
  sleeper: Sleeper = sleep,
): Promise<{ dataset: RawDataset; published: boolean }> {
  if (options.detailDelayMs < 1000)
    throw new CrawlError('detailDelayMs must be at least 1000 milliseconds');
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1)
    throw new CrawlError('concurrency must be at least one');
  const robotsUrl = new URL('/robots.txt', C1_BASE_URL).toString();
  const robots = await client.get(robotsUrl);
  if (robots.status < 200 || robots.status >= 300)
    throw new CrawlError(`Cannot retrieve robots.txt: HTTP ${robots.status}`);
  requireC1Allowed(robots.body, USER_AGENT);
  const fingerprints: Record<string, string> = {
    [robotsUrl]: createHash('sha256').update(robots.body).digest('hex'),
  };
  const monsterResponse = await cachedGet(
    client,
    options,
    `${C1_BASE_URL}monster/`,
    fingerprints,
    sleeper,
  );
  const itemResponse = await cachedGet(
    client,
    options,
    `${C1_BASE_URL}item/`,
    fingerprints,
    sleeper,
  );
  const classResponse = await cachedGet(
    client,
    options,
    `${C1_BASE_URL}class/`,
    fingerprints,
    sleeper,
  );
  const dataset: RawDataset = {
    monsters: parseMonsterListing(monsterResponse.body, monsterResponse.url),
    items: parseItemListing(itemResponse.body, itemResponse.url),
    monsterDrops: [],
    monsterSpoils: [],
    monsterSkills: [],
    monsterLocations: [],
    skills: [],
    skillLevels: [],
    skillAttributes: [],
  };
  const classUrls = parseClassUrls(classResponse.body, classResponse.url);
  const skillSources = new Map<string, RawRecord>();
  await detailPages(classUrls, options, sleeper, async (url) => {
    const page = await cachedGet(client, options, url, fingerprints, sleeper);
    for (const skill of parseClassSkills(page.body, page.url)) {
      const id = skill.skill_id;
      if (!id) throw new CrawlError('Class skill link lacks skill_id');
      skillSources.set(id, skill);
    }
  });
  await detailPages(dataset.monsters, options, sleeper, async (monster) => {
    const id = monster.npc_id;
    const name = monster.name;
    if (!id || !name) throw new CrawlError('Monster listing lacks identity');
    const url = detailUrl('monster', id, name);
    const page = await cachedGet(client, options, url, fingerprints, sleeper);
    const detail = parseMonsterDetail(page.body, monster, page.url);
    dataset.monsterDrops.push(...detail.drops);
    dataset.monsterSpoils.push(...detail.spoils);
    dataset.monsterSkills.push(...detail.skills);
    dataset.monsterLocations.push(...detail.locations);
    for (const skill of detail.skillSources) {
      const skillId = skill.skill_id;
      if (!skillId) throw new CrawlError('Monster skill link lacks skill_id');
      skillSources.set(skillId, skill);
    }
  });
  const itemSources = new Map<string, string>();
  for (const relation of [...dataset.monsterDrops, ...dataset.monsterSpoils]) {
    const itemId = relation.item_id;
    const itemUrl = relation.item_source_url;
    if (!itemId || !itemUrl) throw new CrawlError('Item relationship lacks identity or source URL');
    itemSources.set(itemId, itemUrl);
  }
  const listedItemIds = new Set(dataset.items.map((item) => item.item_id));
  await detailPages(
    [...itemSources.entries()].filter(([itemId]) => !listedItemIds.has(itemId)),
    options,
    sleeper,
    async ([itemId, itemUrl]) => {
      const page = await cachedGet(client, options, itemUrl, fingerprints, sleeper);
      const parsed = parseItemDetail(page.body, page.url);
      if (parsed.item_id !== itemId) throw new CrawlError(`Item detail ID mismatch for ${itemId}`);
      dataset.items.push(
        Object.fromEntries(TABLE_COLUMNS.items.map((column) => [column, parsed[column] ?? null])),
      );
    },
  );
  for (const relation of dataset.monsterSkills) {
    const skillId = relation.skill_id;
    if (!skillId || !skillSources.has(skillId))
      throw new CrawlError(`No verified C1 detail URL for monster skill ${skillId}`);
  }
  dataset.skills = mergeSkill([...skillSources.values()]);
  await detailPages(dataset.skills, options, sleeper, async (skill) => {
    const skillId = skill.skill_id;
    const sourceUrl = skill.source_url;
    if (!skillId || !sourceUrl) throw new CrawlError('Skill lacks identity or source URL');
    const page = await cachedGet(client, options, sourceUrl, fingerprints, sleeper);
    const detail = parseSkillDetail(page.body, skillId, page.url);
    skill.name = detail.name;
    dataset.skillLevels.push(...detail.levels);
    dataset.skillAttributes.push(...detail.attributes);
  });
  dataset.skillLevels = dedupeRecords(dataset.skillLevels, ['skill_id', 'skill_level']);
  dataset.skillAttributes = dedupeRecords(dataset.skillAttributes, [
    'skill_id',
    'skill_level',
    'attribute_name',
    'attribute_value',
  ]);
  assertValidDataset(dataset);
  const manifest = createManifest(dataset, robots.body, fingerprints);
  const report = await stagedDiff(options.rootDir, dataset);
  await publish(options.rootDir, dataset, manifest, report);
  return { dataset, published: true };
}
