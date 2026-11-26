import type { ScenarioComparison, SimulationResult, TreasuryScenario } from './types.js';
import { invalid, ScenarioValidationError, uint256, validateScenario } from './validation.js';

export const BUD_DECIMALS = 18;
export const BUD_UNIT = 10n ** 18n;
export const MAX_SCENARIO_JSON_LENGTH = 2_000_000;

/** Canonical integer strings at the API/JSON boundary; numbers are never accepted. */
export function parseBaseUnits(value: unknown, path = 'amount'): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) invalid('INVALID_UINT256', path);
  return uint256(BigInt(value), path);
}

/** Exact plain decimal BUD, without signs, whitespace, grouping, exponents or rounding. */
export function parseBUD(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})(\.[0-9]{1,18})?$/.test(value)) {
    invalid('INVALID_UINT256', 'BUD');
  }
  const [whole, fraction = ''] = value.split('.');
  return uint256(BigInt(whole!) * BUD_UNIT + BigInt(fraction.padEnd(BUD_DECIMALS, '0')), 'BUD');
}

/** Locale-independent, lossless decimal representation; no approximate compact display. */
export function formatBUD(value: bigint): string {
  const amount = uint256(value, 'BUD');
  const fraction = (amount % BUD_UNIT).toString().padStart(BUD_DECIMALS, '0').replace(/0+$/, '');
  return `${amount / BUD_UNIT}${fraction ? `.${fraction}` : ''}`;
}

/** All bigint fields (including signed comparison deltas) serialize to integer strings. */
export function stringifySimulation(value: TreasuryScenario | SimulationResult | ScenarioComparison): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item, 2);
}

/** JSON input requires base-unit integer strings, not human decimal BUD strings. */
export function parseScenarioJSON(text: string): TreasuryScenario {
  if (typeof text !== 'string') invalid('INVALID_JSON', 'scenario');
  if (text.length > MAX_SCENARIO_JSON_LENGTH) invalid('LIMIT_EXCEEDED', 'scenarioJSON');
  try {
    const input: unknown = JSON.parse(text, (key, value: unknown) =>
      key === 'initialBalance' || key === 'amount' ? parseBaseUnits(value, key) : value);
    return validateScenario(input);
  } catch (error) {
    if (error instanceof ScenarioValidationError) throw error;
    return invalid('INVALID_JSON', 'scenario');
  }
}
