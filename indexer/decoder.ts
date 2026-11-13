import type { ParamType } from 'ethers';
import { getAbi } from './abi-registry.js';
import type { DecodeResult, JsonObject, JsonValue, NormalizedLog } from './types.js';

function jsonValue(parameter: ParamType, value: unknown): JsonValue {
  if (parameter.baseType === 'array' && parameter.arrayChildren) {
    return Array.from(value as readonly unknown[], (child) => jsonValue(parameter.arrayChildren!, child));
  }
  if (parameter.baseType === 'tuple' && parameter.components) {
    return Object.fromEntries(parameter.components.map((child, index) => [
      child.name || String(index), jsonValue(child, (value as readonly unknown[])[index]),
    ]));
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') {
    // Solidity strings may contain NUL, but PostgreSQL JSONB cannot represent
    // it. Keep such events raw-only instead of losing the entire storage batch.
    if (parameter.type === 'string' && value.includes('\0')) {
      throw new Error('Decoded string contains a NUL character unsupported by PostgreSQL JSONB');
    }
    return parameter.type === 'address' ? value.toLowerCase() : value;
  }
  if (typeof value === 'boolean') return value;
  throw new Error(`Unsupported decoded value for ABI type ${parameter.type}`);
}

/** The caller retains the NormalizedLog, including all original RPC fields. */
export function decodeLog(log: NormalizedLog): DecodeResult {
  const abiVersion = log.contract.abiVersion;
  try {
    const registration = getAbi(log.contract);
    if (log.topics.length < 1 || log.topics.length > 4 || log.topics.some((topic) => !/^0x[0-9a-fA-F]{64}$/.test(topic))) {
      throw new Error('Log topics must contain one to four 32-byte values');
    }
    if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(log.data)) throw new Error('Log data must be an even-length hex byte string');
    const fragment = registration.interface.getEvent(log.topics[0]!);
    if (!fragment) {
      return { status: 'unknown_topic', code: 'UNKNOWN_TOPIC', message: `No supported event for topic ${log.topics[0]}`, abiVersion };
    }
    if (log.topics.length !== 1 + fragment.inputs.filter((input) => input.indexed).length) {
      throw new Error(`Incorrect indexed topic count for ${fragment.name}`);
    }

    const values = registration.interface.decodeEventLog(fragment, log.data, log.topics);
    // ethers defers some field errors until access. Building the payload and then
    // round-tripping forces evaluation and rejects trailing data, bad padding,
    // truncated dynamic fields, and noncanonical scalar encodings.
    const payload: JsonObject = Object.fromEntries(fragment.inputs.map((input, index) => [input.name, jsonValue(input, values[index])]));
    const encoded = registration.interface.encodeEventLog(fragment, values);
    if (encoded.data.toLowerCase() !== log.data.toLowerCase() || encoded.topics.some((topic, index) => topic.toLowerCase() !== log.topics[index]!.toLowerCase())) {
      throw new Error(`Noncanonical ABI encoding for ${fragment.name}`);
    }
    return { status: 'decoded', eventName: fragment.name, payload, abiVersion };
  } catch (error) {
    // Only decoder-owned messages leave this boundary; ethers errors can contain
    // the entire source value, which is still available in the preserved raw log.
    const message = error instanceof Error && (
      error.message.startsWith('Unsupported ABI version ') ||
      error.message.startsWith('Log ') ||
      error.message.startsWith('Decoded string ') ||
      error.message.startsWith('Incorrect indexed topic count ') ||
      error.message.startsWith('Noncanonical ABI encoding ')
    ) ? error.message : 'Log does not match the configured event ABI';
    return { status: 'decode_error', code: 'DECODE_ERROR', message, abiVersion };
  }
}
