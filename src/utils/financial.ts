import { Vehicle, DepreciationScheduleRow } from '../types/vehicle';

/**
 * Format currency with proper decimal precision (OMR: 3 decimals, others: 2 decimals)
 */
export function formatCurrency(amount: number | undefined | null, currency: string = 'OMR'): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    amount = 0;
  }
  
  const decimals = currency === 'OMR' ? 3 : 2;
  const formattedNumber = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${currency} ${formattedNumber}`;
}

/**
 * Decimal safe rounding
 */
export function roundToPrecision(value: number, decimals: number = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Generate year-by-year depreciation schedule
 */
export function calculateDepreciationSchedule(vehicle: Vehicle): DepreciationScheduleRow[] {
  const purchaseValue = vehicle.purchase.purchaseValue || 0;
  const salvageValue = vehicle.depreciation.salvageValue || 0;
  const usefulLife = Math.max(vehicle.depreciation.usefulLifeYears || 5, 1);
  const method = vehicle.depreciation.depreciationMethod || 'Straight-Line';
  const ratePercentage = vehicle.depreciation.annualRatePercentage || (100 / usefulLife);
  const purchaseYear = new Date(vehicle.purchase.purchaseDate || vehicle.registrationDate || '2023-01-01').getFullYear();
  
  const schedule: DepreciationScheduleRow[] = [];
  let currentOpening = purchaseValue;
  let accumulated = 0;

  for (let yearIndex = 1; yearIndex <= usefulLife; yearIndex++) {
    const calendarYear = purchaseYear + yearIndex - 1;
    let depAmount = 0;

    if (method === 'Straight-Line') {
      const annualSL = (purchaseValue - salvageValue) / usefulLife;
      depAmount = Math.min(annualSL, Math.max(0, currentOpening - salvageValue));
    } else {
      // Reducing Balance
      const rate = ratePercentage / 100;
      depAmount = currentOpening * rate;
      if (currentOpening - depAmount < salvageValue) {
        depAmount = Math.max(0, currentOpening - salvageValue);
      }
    }

    depAmount = roundToPrecision(depAmount, 3);
    accumulated = roundToPrecision(accumulated + depAmount, 3);
    const closing = roundToPrecision(Math.max(salvageValue, currentOpening - depAmount), 3);

    schedule.push({
      year: calendarYear,
      date: `31 Dec ${calendarYear}`,
      openingValue: roundToPrecision(currentOpening, 3),
      depreciationAmount: depAmount,
      accumulatedDepreciation: accumulated,
      closingValue: closing,
    });

    currentOpening = closing;
    if (currentOpening <= salvageValue) break;
  }

  return schedule;
}

/**
 * Calculate current book value of a vehicle based on elapsed time
 */
export function calculateCurrentBookValue(vehicle: Vehicle): { bookValue: number; accumulatedDepreciation: number } {
  const schedule = calculateDepreciationSchedule(vehicle);
  if (!schedule.length) {
    return { bookValue: vehicle.purchase.purchaseValue || 0, accumulatedDepreciation: 0 };
  }

  const currentYear = new Date().getFullYear();
  let latestRow = schedule[0];

  for (const row of schedule) {
    if (row.year <= currentYear) {
      latestRow = row;
    }
  }

  // If before first year
  if (currentYear < schedule[0].year) {
    return { bookValue: vehicle.purchase.purchaseValue || 0, accumulatedDepreciation: 0 };
  }

  return {
    bookValue: latestRow.closingValue,
    accumulatedDepreciation: latestRow.accumulatedDepreciation,
  };
}

/**
 * Calculate cost per kilometer
 */
export function calculateCostPerKm(totalCost: number, distanceKm: number): number {
  if (!distanceKm || distanceKm <= 0) return 0;
  return roundToPrecision(totalCost / distanceKm, 4);
}
