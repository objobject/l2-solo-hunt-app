import { fingerprint } from './csv.js';
import type { ChangeReport, RawDataset, RawRecord } from '../../types.js';

const identity: Record<keyof RawDataset, string[]> = {
  monsters: ['npc_id'],
  items: ['item_id'],
  skills: ['skill_id'],
  monsterDrops: ['monster_id', 'relationship_index'],
  monsterSpoils: ['monster_id', 'relationship_index'],
  monsterSkills: ['monster_id', 'skill_id', 'skill_level'],
  monsterLocations: ['monster_id', 'location_index'],
  skillLevels: ['skill_id', 'skill_level'],
  skillAttributes: ['skill_id', 'skill_level', 'attribute_name', 'attribute_value'],
};
const entityTables = new Set<keyof RawDataset>(['monsters', 'items', 'skills']);
function recordKey(row: RawRecord, columns: string[]): string {
  return columns.map((column) => row[column] ?? '').join(':');
}
function value(row: RawRecord): string {
  return fingerprint(JSON.stringify(row));
}

export function diffDatasets(previous: RawDataset, current: RawDataset): ChangeReport {
  const report: ChangeReport = {
    added: {},
    removed: {},
    changed: {},
    changedRelationships: {},
    duplicateIds: [],
    orphanedReferences: [],
    warnings: [],
  };
  for (const table of Object.keys(current) as (keyof RawDataset)[]) {
    const before = new Map(previous[table].map((row) => [recordKey(row, identity[table]), row]));
    const after = new Map(current[table].map((row) => [recordKey(row, identity[table]), row]));
    for (const key of after.keys())
      if (!before.has(key))
        (entityTables.has(table) ? report.added : report.changedRelationships)[table] = [
          ...(entityTables.has(table)
            ? (report.added[table] ?? [])
            : (report.changedRelationships[table] ?? [])),
          key,
        ];
    for (const key of before.keys())
      if (!after.has(key)) report.removed[table] = [...(report.removed[table] ?? []), key];
    for (const [key, row] of after)
      if (before.has(key) && value(row) !== value(before.get(key) as RawRecord))
        (entityTables.has(table) ? report.changed : report.changedRelationships)[table] = [
          ...(entityTables.has(table)
            ? (report.changed[table] ?? [])
            : (report.changedRelationships[table] ?? [])),
          key,
        ];
    if (
      previous[table].length > 0 &&
      Math.abs(current[table].length - previous[table].length) / previous[table].length > 0.25
    )
      report.warnings.push(
        `${table} count changed by more than 25% (${previous[table].length} → ${current[table].length})`,
      );
  }
  return report;
}

export function humanDiff(report: ChangeReport): string {
  const lines: string[] = [];
  for (const section of ['added', 'removed', 'changed', 'changedRelationships'] as const)
    for (const [table, values] of Object.entries(report[section]))
      lines.push(`${section} ${table}: ${values.length}`);
  lines.push(
    `duplicate IDs: ${report.duplicateIds.length}`,
    `orphaned references: ${report.orphanedReferences.length}`,
  );
  return `${lines.concat(report.warnings.map((warning) => `warning: ${warning}`)).join('\n')}\n`;
}
