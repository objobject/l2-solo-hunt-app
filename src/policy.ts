import { C1_BASE_URL, CrawlError, type Sleeper } from './types.js';

const SOURCE = new URL(C1_BASE_URL);

export function assertC1Url(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CrawlError(`Invalid source URL: ${value}`);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== SOURCE.hostname ||
    !url.pathname.startsWith('/c1/')
  ) {
    throw new CrawlError(`Non-C1 source URL rejected: ${value}`);
  }
  return url;
}

export function parseRobots(robots: string, userAgent: string): (path: string) => boolean {
  const groups = new Map<string, string[]>();
  let agents: string[] = [];
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const directive = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (directive === 'user-agent') {
      const agent = value.toLowerCase();
      agents = [agent];
      if (!groups.has(agent)) groups.set(agent, []);
    } else if ((directive === 'allow' || directive === 'disallow') && agents.length > 0) {
      for (const agent of agents) groups.get(agent)?.push(`${directive}:${value}`);
    }
  }
  const candidate = userAgent.toLowerCase().split(/[ /]/)[0] ?? '*';
  const rules = groups.get(candidate) ?? groups.get('*') ?? [];
  return (path: string): boolean => {
    const matching = rules
      .map((rule) => {
        const [directive, pattern = ''] = rule.split(':');
        return { directive, pattern };
      })
      .filter(({ pattern }) => pattern !== '' && path.startsWith(pattern));
    if (matching.length === 0) return true;
    matching.sort(
      (a, b) => b.pattern.length - a.pattern.length || (a.directive === 'allow' ? -1 : 1),
    );
    return matching[0]?.directive === 'allow';
  };
}

export function requireC1Allowed(robots: string, userAgent: string): void {
  const allowed = parseRobots(robots, userAgent);
  for (const path of ['/c1/', '/c1/monster/', '/c1/item/', '/c1/class/']) {
    if (!allowed(path)) throw new CrawlError(`robots.txt disallows required path ${path}`);
  }
}

export function retryAfterMilliseconds(
  value: string | undefined,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export async function retry<T>(
  action: () => Promise<T>,
  shouldRetry: (error: unknown) => number | undefined,
  sleep: Sleeper,
  maxRetries: number,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      const requested = shouldRetry(error);
      if (requested === undefined) throw error;
      await sleep(Math.max(requested, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}
