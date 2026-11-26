# Treasury snapshot adapter — read-only, opt-in

## Trust boundary và public API

Core `simulator/engine.ts` vẫn pure, không RPC. Import adapter riêng từ
`simulator/snapshot.ts` (sau build: `dist/simulator/snapshot.js`). Adapter không có
URL, signer, wallet, key, signing method hoặc transaction submission. Caller cung
cấp `SnapshotReadRpc`; chỉ bốn method được gọi: `eth_chainId`,
`eth_getBlockByNumber`, `eth_getCode`, `eth_call`. Không sửa API hoặc frontend.

```ts
readPinnedScenario(rpc, {
  snapshot: { chainId, blockNumber, blockHash },
  contracts: {
    treasuryAddress, budgetTokenAddress,
    treasuryCodeHash, budgetTokenCodeHash,
  },
  proposals,
  steps,
}, { signal, timeoutMs: 30_000 })
```

ChainId/blockNumber là bigint uint256; chainId > 0. Hash là `0x` + 64 hex. Hai address
nonzero/khác nhau. Proposals/steps qua cùng validator strict của engine **trước**
network read, giới hạn 1.000 proposals và 10.000 steps. Adapter copy input trước
await đầu để việc sửa object bên ngoài không thay pin hoặc amount giữa lượt đọc.

Caller phải lấy addresses và **Ethereum keccak256 của runtime bytecode thực tế** từ
một deployment đã kiểm độc lập. Không dùng SHA-256 ABI/source fingerprint làm code
hash; không dùng runtime artifact Treasury chưa patch immutable BUD address. Không
lấy expected hash và observed hash từ cùng một RPC không tin cậy rồi gọi đó là
independent identity verification. Proxy/delegatecall implementation không nằm
trong mô hình deployment trực tiếp Treasury/BUD được hỗ trợ ở đây.

## Các guard bắt buộc

1. ChainId và canonical header tại đúng block number phải khớp full pin.
2. Mọi code/state read dùng `{ blockHash, requireCanonical: true }`, theo
   [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898). Không number fallback hoặc latest.
3. Code phải tồn tại và keccak runtime khớp hai expected hashes độc lập.
4. `Treasury.budgetToken()` phải đúng configured BUD; decimals phải là 18.
5. Đọc BUD `balanceOf(treasury)` và Treasury `paidRequests(id)` cho mọi requestId
   distinct của proposals đã cung cấp. Chuẩn hóa casing và đọc zero ID như ID khác.
6. ABI dùng trực tiếp full compiler ABI trong `shared/abi/Treasury.json` và
   `BudgetToken.json`. Return data phải đúng một ABI word, decode/re-encode canonical;
   dirty bool/address, truncation hoặc trailing bytes bị từ chối.
7. Kiểm lại chainId và canonical H/hash sau state reads. Không trả partial scenario
   nếu bất kỳ call, anchor, code hoặc identity check nào lỗi.

Các state reads đều hash-pinned, tránh trộn số dư/paid flags từ các nhánh khi reorg.
Header recheck không thay thế EIP-1898. Provider thiếu EIP-1898 hoặc archive state
phải fail; caller không được đổi sang latest để che lỗi.

Transport là nguồn dữ liệu được tin cậy về việc thực thi EIP-1898 và trả eth_call
trung thực. Đây **không** là light client, proof của state root/consensus, hoặc xác
minh provider độc lập. Pin ở block chưa final không trở thành finalized; reorg sau
khi hàm trả vẫn có thể xảy ra. Caller quyết định finality/staleness policy và phải
đọc/kiểm lại nếu cần snapshot mới, không dùng result làm quyền broadcast.

## Output và phạm vi paid state

Output `kind = hypothetical-budget-input-from-pinned-chain-v1`:

- `source.snapshot`, `source.contracts`: normalized pin và deployment identity.
- `source.paidRequestScope = supplied-proposals-only`.
- `source.queriedRequestIds`: danh sách distinct đầy đủ **cho input đã cho**.
- `scenario`: initialBalance từ BUD, initialPaidRequestIds từ chain cho scope trên;
  proposals, executionAllowed và steps/top-up vẫn là giả định của caller.

`paidRequests` là mapping không thể enumerate qua getter. Adapter không claim đã
đọc mọi paid request trong lịch sử. Với scenario này, mọi request của proposals đã
được kiểm, nên shared IDs không thoát guard. Khi thêm requestId/proposal mới, **đọc
lại adapter với scope mới**; không copy paid list cũ rồi suy ID mới chưa trả. Có thể
so alternative steps/order trên cùng definition đã seed mà không thay scope.

## Deadline, abort và lỗi

Default deadline **30 giây cho toàn lượt**, không reset cho mỗi RPC; giới hạn cấu
hình 1–120.000 ms nguyên. `AbortSignal` của caller có thể hủy lượt đọc trước hoặc
trong call. Sau abort/timeout không bắt đầu query tiếp, không trả kết quả dở dang,
không tự retry. Timer và abort listener được tháo sau từng read.

Adapter không thể ép hủy transport tùy ý đã được inject: call read-only đang chạy
có thể hoàn tất phía provider sau khi adapter đã reject. Caller nên nối cùng signal
với HTTP client's cancellation và cấu hình transport timeout/response size limits.
Tối đa 1.009 RPC reads cho một scope 1.000 IDs distinct; không enumerate lịch sử.

`SnapshotReadError` có code/field an toàn: `INVALID_SNAPSHOT`, `RPC_READ_FAILED`,
`INVALID_RPC_DATA`, `SNAPSHOT_MISMATCH`, `CONTRACT_MISMATCH`, `UNSUPPORTED_TOKEN`,
`READ_TIMEOUT`, `READ_ABORTED`. Không forward provider exception/URL/abort reason
có thể chứa credential. Input scenario invalid giữ `ScenarioValidationError`.

## Tích hợp TV2/TV3 tiếp theo

Adapter dùng lại ABI chung, không phụ thuộc implementation indexer/API hoặc viem UI.
Có thể bọc read client hiện có bằng `(method, params) => client.call(method, [...params])`;
transport phải hỗ trợ EIP-1898/timeout và đúng endpoint được người dùng chọn. Không
có live endpoint hoặc credentials nào được hardcode trong module.

UI nên giữ `{ source, result: simulateBudget(plan.scenario) }` cùng nhau, hiển thị
“giả định từ snapshot H/hash” và tách phần đã đọc (balance/paid) khỏi phần giả định
(eligibility/order/top-up). Chuyển các bigint context thành chuỗi nguyên khi serialize;
`stringifySimulation` hiện hỗ trợ core scenario/result/comparison, không phải source
wrapper của adapter. Không cast số tiền qua Number.

Không suy executionAllowed từ một string `Queued` trong API: roles, timelock ready,
ETA, cancellation, Governor flags, gas và concurrent chain activity vẫn phải được
kiểm riêng cho giao dịch thật. Frontend bundling, adapter endpoint policy, freshness/
finality UX và peer review TV2/TV3 là bước tiếp theo; production UI/API chưa bị đổi.

## Bằng chứng và giới hạn

Snapshot tests là protocol fixtures synthetic, kiểm positive/negative EIP-1898,
identity, canonical anchors, scope, encoding, precision, cancellation và deadline.
Không gọi chúng là headers/receipt từ chain thật. Chưa chạy adapter trên live RPC
vì không có approved deployment/pin được cung cấp trong lượt này.

[Differential và kết quả thực chạy](what-if-budget-verification.md) dùng production
Treasury/BudgetToken trong Foundry VM cho phần semantics, **không** chứng minh live
RPC/provider sẽ hỗ trợ EIP-1898 hoặc deployment bên ngoài đã đúng.
