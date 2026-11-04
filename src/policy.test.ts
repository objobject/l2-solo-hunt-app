import { CrawlError } from './types.js';
import {
  assertC1Url,
  parseRobots,
  requireC1Allowed,
  retry,
  retryAfterMilliseconds,
} from './policy.js';

describe('crawl policy', () => {
  test('honors robots allow and disallow rules', () => {
    const robots = 'User-agent: *\nDisallow: /c1/private/\nAllow: /c1/private/allowed/\n';
    const allowed = parseRobots(robots, 'L2RebornLegacyLayer1Scraper/0.1');
    expect(allowed('/c1/monster/')).toBe(true);
    expect(allowed('/c1/private/data')).toBe(false);
    expect(allowed('/c1/private/allowed/data')).toBe(true);
    expect(() => requireC1Allowed('User-agent: *\nDisallow: /c1/\n', 'agent')).toThrow(CrawlError);
  });

  test('rejects non-C1 URLs', () => {
    expect(() => assertC1Url('http://lineage2wiki.org/c1/monster/')).toThrow('Non-C1');
    expect(() => assertC1Url('https://lineage2wiki.org/c4/monster/')).toThrow('Non-C1');
    expect(assertC1Url('https://lineage2wiki.org/c1/monster/')).toBeInstanceOf(URL);
  });

  test('parses Retry-After seconds and HTTP dates', () => {
    expect(retryAfterMilliseconds('2')).toBe(2000);
    expect(
      retryAfterMilliseconds(
        'Wed, 04 Nov 2026 07:00:01 GMT',
        Date.parse('Wed, 04 Nov 2026 07:00:00 GMT'),
      ),
    ).toBe(1000);
    expect(retryAfterMilliseconds('nonsense')).toBeUndefined();
  });

  test('uses bounded exponential backoff and does not retry permanent errors', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await retry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      () => 0,
      async (milliseconds) => {
        waits.push(milliseconds);
      },
      3,
    );
    expect(result).toBe('ok');
    expect(waits).toEqual([250, 500]);
    await expect(
      retry(
        async () => {
          throw new Error('permanent');
        },
        () => undefined,
        async () => undefined,
        3,
      ),
    ).rejects.toThrow('permanent');
  });
});
