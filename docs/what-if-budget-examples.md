# Ví dụ What-if Budget Simulator

Tất cả balance/eligibility dưới đây là giả định. Không đọc chain, không ký hoặc gửi
giao dịch. Chạy ở repository root sau `npm ci` với Node >=24.

## Đảo thứ tự hai proposal

```sh
node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { compareExecutionOrders, parseBUD, stringifySimulation } from './simulator/index.ts';

const recipient = '0x2222222222222222222222222222222222222222';
const definition = {
  treasuryAddress: '0x1111111111111111111111111111111111111111',
  initialBalance: parseBUD('1000'),
  proposals: [
    { proposalId: 'A', executionAllowed: true,
      request: { requestId: '0x' + '01'.repeat(32), recipient, amount: parseBUD('800') } },
    { proposalId: 'B', executionAllowed: true,
      request: { requestId: '0x' + '02'.repeat(32), recipient, amount: parseBUD('400') } },
  ],
};
const result = compareExecutionOrders(definition, [
  { name: 'A trước', proposalIds: ['A', 'B'] },
  { name: 'B trước', proposalIds: ['B', 'A'] },
]);
assert.deepEqual(result.variants.map(v => v.result.executedProposalIds), [['A'], ['B']]);
assert.equal(result.variants[0].result.finalBalance, parseBUD('200'));
assert.equal(result.variants[1].result.finalBalance, parseBUD('600'));
console.log(stringifySimulation(result));
JS
```

| Kế hoạch | Thành công | Thiếu quỹ | Tổng chi | Còn lại |
| --- | --- | --- | --- | --- |
| A → B | A | B | 800 BUD | 200 BUD |
| B → A | B | A | 400 BUD | 600 BUD |

Không thể kết luận B được ưu tiên trên chain: `executionAllowed: true` là giả định,
không thay kiểm Governor/Timelock và ETA. Delta của phương án B so baseline A là
−400 BUD chi và +400 BUD remaining, không dùng số dấu phẩy động.

## Top-up và retry một request chưa được trả

```sh
node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { simulateBudget, parseBUD, stringifySimulation } from './simulator/index.ts';

const result = simulateBudget({
  treasuryAddress: '0x1111111111111111111111111111111111111111',
  initialBalance: parseBUD('100'),
  proposals: [{ proposalId: 'P', executionAllowed: true, request: {
    requestId: '0x' + '03'.repeat(32), recipient: '0x2222222222222222222222222222222222222222',
    amount: parseBUD('1000'),
  } }],
  steps: [
    { kind: 'execute', proposalId: 'P' },
    { kind: 'top-up', amount: parseBUD('900') },
    { kind: 'execute', proposalId: 'P' },
    { kind: 'execute', proposalId: 'P' },
  ],
});
assert.deepEqual(result.trace.map(t => t.outcome), [
  'insufficient-budget', 'applied', 'executed', 'proposal-already-executed',
]);
assert.equal(result.totalDisbursed, parseBUD('1000'));
assert.equal(result.finalBalance, 0n);
assert.equal(result.paidRequestIds.length, 1);
console.log(stringifySimulation(result));
JS
```

Lần thất bại đầu không tiêu requestId. Top-up không phải mint hoặc giao dịch có thật.
Nếu proposal khác dùng cùng requestId sau thành công, outcome là `request-already-paid`.
Nếu `executionAllowed` false thì top-up không làm nó đủ điều kiện.

## JSON và độ chính xác

```json
{
  "treasuryAddress": "0x1111111111111111111111111111111111111111",
  "initialBalance": "1000000000000000000",
  "proposals": [],
  "steps": []
}
```

Dùng `parseScenarioJSON` cho payload trên; initialBalance là **1 BUD**, không phải
10^18 BUD. Dùng `stringifySimulation` cho result, không dùng `JSON.stringify` trực tiếp
với bigint. `parseBUD('0.000000000000000001')` là 1 base unit; 19 decimals bị từ chối,
không làm tròn. Signed delta được serialize thành chuỗi như `"-400000000000000000000"`.

`initialPaidRequestIds` có thể seed trạng thái đã trả: request đó luôn bị từ chối
trong simulation, kể cả balance còn đủ. Cần bảo đảm dữ liệu này đầy đủ tại snapshot
thật khi xây adapter; không lấy danh sách API chưa đủ trang để suy paid state.
