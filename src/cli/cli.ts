import { resolve } from 'node:path';
import {
  checkGeneratedDataDrift,
  generateNormalizedData,
  normalizeData,
  verifyLayer2Data,
} from '../modules/data-maintenance/data-maintenance.js';
import { diffDatasets, humanDiff } from '../modules/data-maintenance/diff.js';
import { scrape } from '../modules/scraper/engine.js';
import { emptyDataset, readSnapshot } from '../modules/data-maintenance/storage.js';
import {getDefaultCrawlOptions} from "../modules/scraper/scraper-utils.js";

const root = resolve(import.meta.dirname, '..');
const command = process.argv[2];

async function main(): Promise<void> {
  if (command === 'scrape') {
    const options = getDefaultCrawlOptions(root);
    options.fullRefresh = process.argv.includes('--full-refresh');
    const delay = process.argv.find((value) => value.startsWith('--detail-delay-ms='));
    const concurrency = process.argv.find((value) => value.startsWith('--concurrency='));
    if (delay) options.detailDelayMs = Number(delay.split('=')[1]);
    if (concurrency) options.concurrency = Number(concurrency.split('=')[1]);
    await scrape(options);
    console.log('Published complete raw C1 snapshot.');
    return;
  }
  if (command === 'normalize') {
    await normalizeData(root);
    console.log('Normalized CSV data published.');
    return;
  }
  if (command === 'generate') {
    await generateNormalizedData(root);
    console.log('Readonly TypeScript data generated.');
    return;
  }
  if (command === 'generated-data:check') {
    await checkGeneratedDataDrift(root);
    console.log('Generated TypeScript matches normalized data.');
    return;
  }
  const current = await readSnapshot(root);
  if (!current) throw new Error('No canonical raw snapshot exists. Run npm run scrape first.');
  if (command === 'verify-data') {
    await verifyLayer2Data(root);
    console.log('Raw, normalized, overrides, and generated data validate.');
    return;
  }
  if (command === 'diff-data') {
    const previousDir = process.argv[3];
    if (!previousDir) throw new Error('Usage: npm run diff-data -- <previous-snapshot-directory>');
    const previous = (await readSnapshot(resolve(previousDir))) ?? emptyDataset();
    console.log(humanDiff(diffDatasets(previous, current)));
    return;
  }
  throw new Error(
    'Usage: scrape [--full-refresh] [--detail-delay-ms=N] [--concurrency=N] | normalize | generate | verify-data | generated-data:check | diff-data <previous-root>',
  );
}
void main();
