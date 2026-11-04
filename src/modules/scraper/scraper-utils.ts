export type CrawlOptions = {
    rootDir: string;
    fullRefresh: boolean;
    detailDelayMs: number;
    concurrency: number;
    timeoutMs: number;
    maxRetries: number;
};

export const getDefaultCrawlOptions = (rootDir: string): CrawlOptions => ({
    rootDir,
    fullRefresh: false,
    detailDelayMs: 1000,
    concurrency: 1,
    timeoutMs: 20_000,
    maxRetries: 3,
});