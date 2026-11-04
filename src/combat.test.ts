import {
  CombatValidationError,
  calculateMagicalDamage,
  calculatePhysicalDamage,
  type CombatValidationIssue,
  type MagicalDamageInput,
  type PhysicalDamageInput,
} from './combat.js';

const physical = (overrides: Partial<PhysicalDamageInput> = {}): PhysicalDamageInput => ({
  physicalAttack: 100,
  skillPower: 0,
  monsterPhysicalDefense: 50,
  shotType: 'none',
  ...overrides,
});

const magical = (overrides: Partial<MagicalDamageInput> = {}): MagicalDamageInput => ({
  magicalAttack: 100,
  skillPower: 20,
  monsterMagicalDefense: 50,
  shotType: 'none',
  ...overrides,
});

function expectIssue(action: () => unknown, expected: Partial<CombatValidationIssue>): void {
  expect(action).toThrow(CombatValidationError);
  try {
    action();
  } catch (error) {
    expect((error as CombatValidationError).issues).toEqual(
      expect.arrayContaining([expect.objectContaining(expected)]),
    );
  }
}

describe('approved physical damage', () => {
  test('golden: calculates an uncharged basic attack without rounding', () => {
    expect(calculatePhysicalDamage(physical())).toEqual({ damage: 140 });
  });

  test('golden: includes skill power and doubles the complete result for Soulshot', () => {
    expect(
      calculatePhysicalDamage(
        physical({
          physicalAttack: 80,
          skillPower: 20,
          monsterPhysicalDefense: 70,
          shotType: 'soulshot',
        }),
      ),
    ).toEqual({ damage: 200 });
  });

  test('uses approved no-Soulshot and Soulshot multipliers', () => {
    expect(
      calculatePhysicalDamage(physical({ physicalAttack: 10, monsterPhysicalDefense: 20 })),
    ).toEqual({
      damage: 35,
    });
    expect(
      calculatePhysicalDamage(
        physical({ physicalAttack: 10, monsterPhysicalDefense: 20, shotType: 'soulshot' }),
      ),
    ).toEqual({ damage: 70 });
  });

  test('retains decimal precision for later presentation', () => {
    expect(
      calculatePhysicalDamage(
        physical({ physicalAttack: 10.5, skillPower: 0.25, monsterPhysicalDefense: 8 }),
      ),
    ).toEqual({ damage: 94.0625 });
  });
});

describe('approved magical damage', () => {
  test('golden: calculates no-shot magical damage', () => {
    expect(calculateMagicalDamage(magical())).toEqual({ damage: 364 });
  });

  test('golden: applies Spiritshot and Blessed Spiritshot multipliers', () => {
    expect(calculateMagicalDamage(magical({ shotType: 'spiritshot' }))).toEqual({ damage: 514 });
    expect(calculateMagicalDamage(magical({ shotType: 'blessed_spiritshot' }))).toEqual({
      damage: 728,
    });
  });

  test('truncates only after the complete calculation rather than rounding', () => {
    // 91 * 1 * sqrt(4) / 100 = 1.82: approved result is 1, not rounded 2.
    expect(
      calculateMagicalDamage(
        magical({ magicalAttack: 4, skillPower: 1, monsterMagicalDefense: 100 }),
      ),
    ).toEqual({ damage: 1 });
  });
});

describe('combat input contracts', () => {
  test('allows zero-valued stats and skill power where the formulas permit them', () => {
    expect(
      calculatePhysicalDamage(
        physical({ physicalAttack: 0, skillPower: 0, monsterPhysicalDefense: 1 }),
      ),
    ).toEqual({ damage: 0 });
    expect(
      calculateMagicalDamage(
        magical({ magicalAttack: 0, skillPower: 0, monsterMagicalDefense: 1 }),
      ),
    ).toEqual({ damage: 0 });
  });

  test.each([
    [
      'physicalAttack',
      () => calculatePhysicalDamage(physical({ physicalAttack: -1 })),
      'negative_value',
    ],
    [
      'physical skillPower',
      () => calculatePhysicalDamage(physical({ skillPower: -1 })),
      'negative_value',
    ],
    [
      'magicalAttack',
      () => calculateMagicalDamage(magical({ magicalAttack: -1 })),
      'negative_value',
    ],
    [
      'magical skillPower',
      () => calculateMagicalDamage(magical({ skillPower: -1 })),
      'negative_value',
    ],
  ])('rejects negative %s', (field, action, code) => {
    expectIssue(action, {
      field: String(field).replace('physical ', '').replace('magical ', ''),
      code: code as CombatValidationIssue['code'],
    });
  });

  test.each([
    [
      'zero physical defense',
      () => calculatePhysicalDamage(physical({ monsterPhysicalDefense: 0 })),
      'monsterPhysicalDefense',
    ],
    [
      'negative physical defense',
      () => calculatePhysicalDamage(physical({ monsterPhysicalDefense: -1 })),
      'monsterPhysicalDefense',
    ],
    [
      'zero magical defense',
      () => calculateMagicalDamage(magical({ monsterMagicalDefense: 0 })),
      'monsterMagicalDefense',
    ],
    [
      'negative magical defense',
      () => calculateMagicalDamage(magical({ monsterMagicalDefense: -1 })),
      'monsterMagicalDefense',
    ],
  ])('rejects %s', (_name, action, field) => {
    expectIssue(action, { code: 'nonpositive_defense', field });
  });

  test('rejects unsupported shot types with calculation and field context', () => {
    expectIssue(() => calculatePhysicalDamage({ ...physical(), shotType: 'spiritshot' } as never), {
      code: 'unsupported_shot_type',
      calculation: 'physical_damage',
      field: 'shotType',
    });
    expectIssue(() => calculateMagicalDamage({ ...magical(), shotType: 'soulshot' } as never), {
      code: 'unsupported_shot_type',
      calculation: 'magical_damage',
      field: 'shotType',
    });
  });

  test.each([
    [
      'NaN',
      () => calculatePhysicalDamage(physical({ physicalAttack: Number.NaN })),
      'physicalAttack',
    ],
    [
      'infinite',
      () => calculateMagicalDamage(magical({ magicalAttack: Infinity })),
      'magicalAttack',
    ],
    ['missing input', () => calculatePhysicalDamage(undefined as never), 'input'],
  ])('rejects other invalid formula input: %s', (_name, action, field) => {
    expectIssue(action, { code: field === 'input' ? 'invalid_input' : 'invalid_number', field });
  });

  test('is deterministic, does not mutate inputs, and needs no runtime data access', () => {
    const input = Object.freeze(physical({ physicalAttack: 12.5, skillPower: 3.5 }));
    const snapshot = { ...input };
    const first = calculatePhysicalDamage(input);
    const second = calculatePhysicalDamage(input);

    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
    expect(first).toEqual({ damage: 22.4 });
  });
});
