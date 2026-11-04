import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { scrape } from '../../scraper/engine.js';
import { type HttpClient, type SourceResponse } from '../../../types.js';
import { readSnapshot } from '../storage.js';
import {getDefaultCrawlOptions} from "../../scraper/scraper-utils.js";

const fixture = (name: string): string => readFileSync(resolve('src/__fixtures__', name), 'utf8');
const root = resolve('tmp_rovodev_engine_test');
const source = 'https://lineage2wiki.org/c1/';

function response(
  url: string,
  body: string,
  status = 200,
  headers: Record<string, string | undefined> = {},
): SourceResponse {
  return { url, body, status, headers };
}

function fixtureClient(calls: string[], broken = false): HttpClient {
  const pages: Record<string, string> = {
    'https://lineage2wiki.org/robots.txt': 'User-agent: *\nAllow: /c1/\n',
    [`${source}monster/`]: broken
      ? '<script>var monsterList = [];</script>'
      : fixture('monster-list.html'),
    [`${source}item/`]: fixture('item-list.html'),
    [`${source}class/`]: fixture('class-list.html'),
    [`${source}class/fighter/`]: fixture('class-detail.html'),
    [`${source}monster/1/test-monster/`]: fixture('monster-detail.html'),
    [`${source}skill/3/power-strike/`]: fixture('skill-detail.html'),
    [`${source}skill/4/magic-arrow/`]: fixture('skill-detail.html'),
  };
  return {
    get: async (url) => {
      calls.push(url);
      const body = pages[url];
      return response(url, body ?? 'missing', body === undefined ? 404 : 200);
    },
  };
}

describe('offline crawl integration', () => {
  beforeEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('publishes a complete staged snapshot, reuses cache, and supports full refresh', async () => {
    const waits: number[] = [];
    const firstCalls: string[] = [];
    const options = getDefaultCrawlOptions(root);
    const first = await scrape(options, fixtureClient(firstCalls), async (milliseconds) => {
      waits.push(milliseconds);
    });
    expect(first.published).toBe(true);
    expect(first.dataset.monsterDrops).toHaveLength(1);
    expect(first.dataset.monsterSpoils).toHaveLength(1);
    expect(first.dataset.skillLevels).toHaveLength(4);
    expect(firstCalls[0]).toBe('https://lineage2wiki.org/robots.txt');
    expect(waits.some((wait) => wait > 0)).toBe(true);
    const raw = await readSnapshot(root);
    expect(raw?.monsters).toHaveLength(1);
    const cachedCalls: string[] = [];
    await scrape(options, fixtureClient(cachedCalls), async () => undefined);
    expect(cachedCalls).toEqual(['https://lineage2wiki.org/robots.txt']);
    const refreshedCalls: string[] = [];
    await scrape(
      { ...options, fullRefresh: true },
      fixtureClient(refreshedCalls),
      async () => undefined,
    );
    expect(refreshedCalls.length).toBeGreaterThan(1);
  });

  test('does not replace a prior canonical snapshot when staged crawling fails', async () => {
    const options = getDefaultCrawlOptions(root);
    await scrape(options, fixtureClient([]), async () => undefined);
    const original = readFileSync(resolve(root, 'data/raw/monsters.csv'), 'utf8');
    await expect(
      scrape({ ...options, fullRefresh: true }, fixtureClient([], true), async () => undefined),
    ).rejects.toThrow('Listing has no records');
    expect(readFileSync(resolve(root, 'data/raw/monsters.csv'), 'utf8')).toBe(original);
  });

  test('honors Retry-After for transient listing failures', async () => {
    const calls: string[] = [];
    const waits: number[] = [];
    const client = fixtureClient(calls);
    const base = client.get;
    let retried = false;
    client.get = async (url) =>
      url === `${source}monster/` && !retried
        ? ((retried = true), response(url, '', 429, { 'retry-after': '2' }))
        : base(url);
    await scrape(
      { ...getDefaultCrawlOptions(root), fullRefresh: true },
      client,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );
    expect(waits).toContain(2000);
  });
});
