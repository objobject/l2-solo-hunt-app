export const C1_BASE_URL = 'https://lineage2wiki.org/c1/';
export const SCHEMA_VERSION = '1';
export const SCRAPER_VERSION = '0.1.0';

export type SourceResponse = {
  url: string;
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
};

export interface HttpClient {
  get(url: string): Promise<SourceResponse>;
}

export type Sleeper = (milliseconds: number) => Promise<void>;

export type RawRecord = Record<string, string | null>;
export type RawDataset = {
  monsters: RawRecord[];
  monsterDrops: RawRecord[];
  monsterSpoils: RawRecord[];
  monsterSkills: RawRecord[];
  monsterLocations: RawRecord[];
  items: RawRecord[];
  skills: RawRecord[];
  skillLevels: RawRecord[];
  skillAttributes: RawRecord[];
};

export type CachedResponse = {
  url: string;
  status: number;
  headers: Record<string, string | undefined>;
  retrievedAt: string;
  contentHash: string;
  body: string;
};

export type SnapshotManifest = {
  c1BaseUrl: string;
  schemaVersion: string;
  scraperVersion: string;
  robotsFingerprint: string;
  sourceFingerprints: Record<string, string>;
  counts: Record<string, number>;
  datasetFingerprint: string;
};

export type ChangeReport = {
  added: Record<string, string[]>;
  removed: Record<string, string[]>;
  changed: Record<string, string[]>;
  changedRelationships: Record<string, string[]>;
  duplicateIds: string[];
  orphanedReferences: string[];
  warnings: string[];
};

export class CrawlError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CrawlError';
  }
}

export class ValidationError extends Error {
  public constructor(public readonly issues: string[]) {
    super(issues.join('\n'));
    this.name = 'ValidationError';
  }
}
