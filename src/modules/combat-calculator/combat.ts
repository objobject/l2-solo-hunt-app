/**
 * Layer 3 pure combat calculations.
 *
 * Only PRD section 7 rules marked Approved belong in this module. It has no
 * terminal, filesystem, network, or runtime-data dependencies.
 */

export type PhysicalShotType = 'none' | 'soulshot';
export type MagicalShotType = 'none' | 'spiritshot' | 'blessed_spiritshot';

export type PhysicalDamageInput = Readonly<{
  playerLevel: number;
  physicalAttack: number;
  skillPower: number;
  monsterPhysicalDefense: number;
  shotType: PhysicalShotType;
}>;

export type MagicalDamageInput = Readonly<{
  magicalAttack: number;
  skillPower: number;
  monsterMagicalDefense: number;
  shotType: MagicalShotType;
}>;

export type PhysicalDamageResult = Readonly<{ damage: number }>;
export type MagicalDamageResult = Readonly<{ damage: number }>;

export type CombatCalculation = 'physical_damage' | 'magical_damage';
export type CombatValidationCode =
  | 'invalid_input'
  | 'invalid_number'
  | 'negative_value'
  | 'nonpositive_defense'
  | 'unsupported_shot_type';

export type CombatValidationIssue = Readonly<{
  code: CombatValidationCode;
  calculation: CombatCalculation;
  field: string;
  received: unknown;
  message: string;
}>;

/** Machine-readable rejection for input outside an approved formula contract. */
export class CombatValidationError extends Error {
  public constructor(public readonly issues: readonly CombatValidationIssue[]) {
    super(JSON.stringify({ issues }));
    this.name = 'CombatValidationError';
  }
}

type InputRecord = Readonly<Record<string, unknown>>;

function issue(
  code: CombatValidationCode,
  calculation: CombatCalculation,
  field: string,
  received: unknown,
  message: string,
): CombatValidationIssue {
  return { code, calculation, field, received, message };
}

function requireInputRecord(input: unknown, calculation: CombatCalculation): InputRecord {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as InputRecord;
  }
  throw new CombatValidationError([
    issue('invalid_input', calculation, 'input', input, 'Input must be an object.'),
  ]);
}

function validateNonNegativeNumber(
  issues: CombatValidationIssue[],
  calculation: CombatCalculation,
  field: string,
  value: unknown,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(
      issue('invalid_number', calculation, field, value, 'Value must be a finite number.'),
    );
  } else if (value < 0) {
    issues.push(issue('negative_value', calculation, field, value, 'Value must not be negative.'));
  }
}

function validatePositiveDefense(
  issues: CombatValidationIssue[],
  calculation: CombatCalculation,
  field: string,
  value: unknown,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(
      issue('invalid_number', calculation, field, value, 'Defense must be a finite number.'),
    );
  } else if (value <= 0) {
    issues.push(
      issue('nonpositive_defense', calculation, field, value, 'Defense must be greater than zero.'),
    );
  }
}

function validateShotType(
  issues: CombatValidationIssue[],
  calculation: CombatCalculation,
  value: unknown,
  supported: readonly string[],
): void {
  if (typeof value !== 'string' || !supported.includes(value)) {
    issues.push(
      issue(
        'unsupported_shot_type',
        calculation,
        'shotType',
        value,
        `Shot type must be one of: ${supported.join(', ')}.`,
      ),
    );
  }
}

function throwIfInvalid(issues: CombatValidationIssue[]): void {
  if (issues.length > 0) throw new CombatValidationError(issues);
}

function physicalShotMultiplier(shotType: PhysicalShotType): 1 | 2 {
  return shotType === 'none' ? 1 : 2;
}

function magicalShotMultiplier(shotType: MagicalShotType): 1 | 2 | 4 {
  switch (shotType) {
    case 'none':
      return 1;
    case 'spiritshot':
      return 2;
    case 'blessed_spiritshot':
      return 4;
  }
}

/**
 * Approved PRD 7.2 physical damage. A basic attack is represented by
 * `skillPower: 0`. Decimal precision is retained: presentation rounding is a
 * later-layer concern.
 */
export function calculatePhysicalDamage(input: PhysicalDamageInput): PhysicalDamageResult {
  const issues: CombatValidationIssue[] = [];
  validateNonNegativeNumber(issues, 'physical_damage', 'physicalAttack', input.physicalAttack);
  validateNonNegativeNumber(issues, 'physical_damage', 'skillPower', input.skillPower);
  validatePositiveDefense(
    issues,
    'physical_damage',
    'monsterPhysicalDefense',
      input.monsterPhysicalDefense,
  );
  validateShotType(issues, 'physical_damage', input.shotType, ['none', 'soulshot']);
  throwIfInvalid(issues);

  return {
    damage: 70 * input.physicalAttack * (input.shotType === 'soulshot' ? 2 : 1) * input.skillPower / Math.max(1, input.monsterPhysicalDefense),
  };
}

/**
 * Approved PRD 7.3 magical damage. Truncation occurs once after the complete
 * calculation; no display rounding is performed here.
 */
export function calculateMagicalDamage(input: MagicalDamageInput): MagicalDamageResult {
  const values = requireInputRecord(input, 'magical_damage');
  const issues: CombatValidationIssue[] = [];
  validateNonNegativeNumber(issues, 'magical_damage', 'magicalAttack', values.magicalAttack);
  validateNonNegativeNumber(issues, 'magical_damage', 'skillPower', values.skillPower);
  validatePositiveDefense(
    issues,
    'magical_damage',
    'monsterMagicalDefense',
    values.monsterMagicalDefense,
  );
  validateShotType(issues, 'magical_damage', values.shotType, [
    'none',
    'spiritshot',
    'blessed_spiritshot',
  ]);
  throwIfInvalid(issues);

  const multiplier = magicalShotMultiplier(values.shotType as MagicalShotType);
  const untruncated =
    (91 *
      (values.skillPower as number) *
      Math.sqrt((values.magicalAttack as number) * multiplier)) /
    (values.monsterMagicalDefense as number);
  return { damage: Math.trunc(untruncated) };
}
