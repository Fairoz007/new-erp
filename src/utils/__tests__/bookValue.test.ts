import { describe, expect, it } from 'vitest';
import { calculateCurrentBookValue } from '../financial';
import type { Vehicle } from '../../types/vehicle';

const v = (purchaseDate: string) => ({
  purchase: { purchaseDate, purchaseValue: 9800 },
  registrationDate: purchaseDate,
  depreciation: { depreciationMethod: 'Straight-Line', usefulLifeYears: 5, salvageValue: 0, annualRatePercentage: 20 },
}) as unknown as Vehicle;

describe('calculateCurrentBookValue', () => {
  it('charges nothing for a vehicle bought this year until 31 December', () => {
    expect(calculateCurrentBookValue(v('2026-11-12'), new Date(2026, 10, 12))).toEqual({ bookValue: 9800, accumulatedDepreciation: 0 });
  });
  it('charges the first year on 31 December', () => {
    expect(calculateCurrentBookValue(v('2026-11-12'), new Date(2026, 11, 31))).toEqual({ bookValue: 7840, accumulatedDepreciation: 1960 });
  });
  it('counts only completed years', () => {
    expect(calculateCurrentBookValue(v('2023-03-01'), new Date(2026, 5, 1))).toEqual({ bookValue: 3920, accumulatedDepreciation: 5880 });
  });
});
