import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRpcPort, validateRpcAllocation, validateRpcUrl } from '../scripts/be09-rpc.mjs';

test('RPC port defaults only when unset and normalizes leading zeros', () => {
  assert.equal(parseRpcPort(undefined), 18545);
  for (const [raw, expected] of [['1', 1], ['65535', 65535], ['28545', 28545], ['00028545', 28545],
    ['00001', 1], ['0'.repeat(16) + '18545', 18545]]) {
    assert.equal(parseRpcPort(raw), expected);
  }
});

test('RPC port rejects empty, nondecimal, out-of-range and service-collision values', () => {
  for (const raw of ['', ' ', ' 28545', '28545 ', '28545\n', '28545\r', '28\t545', '+28545', '-1',
    '1.0', '1e3', '0x6f81', 'NaN', 'Infinity', '0', '00000', '65536', '99999', '100000',
    '18446744073709551617', '9'.repeat(1000), '0'.repeat(1000) + '1', '3300', '03300', '55432', '055432', '5173', '05173',
    null, 28545, true, {}, []]) {
    assert.throws(() => parseRpcPort(raw), undefined, JSON.stringify(raw));
  }
});

test('RPC URL accepts only literal canonical loopback HTTP URLs', () => {
  for (const port of ['1', '18545', '28545', '65535']) {
    const url = `http://127.0.0.1:${port}`;
    assert.equal(validateRpcUrl(url), url);
  }
  for (const url of [undefined, null, '', 28545, 'http://localhost:28545', 'http://127.1:28545',
    'http://2130706433:28545', 'http://[::1]:28545', 'https://127.0.0.1:28545', 'HTTP://127.0.0.1:28545',
    'http://user@127.0.0.1:28545', 'http://user:password@127.0.0.1:28545', 'http://127.0.0.1',
    'http://127.0.0.1:', 'http://127.0.0.1:0', 'http://127.0.0.1:028545', 'http://127.0.0.1:65536',
    'http://127.0.0.1:28545/', 'http://127.0.0.1:28545/path', 'http://127.0.0.1:28545?',
    'http://127.0.0.1:28545?x=1', 'http://127.0.0.1:28545#', 'http://127.0.0.1:28545#fragment',
    'http://127.0.0.1:28545\n', ' http://127.0.0.1:28545', 'http://127.0.0.1:28545 ',
    'http://127.0.0.1:3300', 'http://127.0.0.1:55432', 'http://127.0.0.1:5173',
    `http://127.0.0.1:${'9'.repeat(1000)}`]) {
    assert.throws(() => validateRpcUrl(url), undefined, String(url));
  }
});

test('RPC allocation validates scope and fences issue40 to port 28545', () => {
  const allocated = 'http://127.0.0.1:28545';
  assert.equal(validateRpcAllocation(allocated, 'issue40'), allocated);
  assert.equal(validateRpcAllocation(allocated), allocated);
  assert.equal(validateRpcAllocation('http://127.0.0.1:18545'), 'http://127.0.0.1:18545');
  for (const port of [1, 18545, 13300, 55442, 28546, 65535]) {
    assert.throws(() => validateRpcAllocation(`http://127.0.0.1:${port}`, 'issue40'));
  }
  for (const scope of ['', 'other', 'ISSUE40', 'issue40 ', null, 0]) {
    assert.throws(() => validateRpcAllocation(allocated, scope));
  }
  assert.throws(() => validateRpcAllocation(`${allocated}/`, 'issue40'));
  assert.throws(() => validateRpcAllocation('http://127.0.0.1:3300', 'ordinary'));
});
