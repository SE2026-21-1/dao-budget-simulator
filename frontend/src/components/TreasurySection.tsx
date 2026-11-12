import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { deployment, transactionUrl } from "../chain/config";
import { useWallet, sendTokenTransaction, walletSession } from "../chain/wallet";
import { useTransaction } from "../chain/useTransaction";
import { assertWritable, parseBUD, verifyDeployment } from "../chain/transactions";
import { formatBUD, formatCompactBUD } from "../data/formatBUD";
import { loadTreasurySnapshot, type Summary, type Transfer } from "../data/api";
import type { FixtureContext } from "../data/proposals";
import TransactionStatus from "./TransactionStatus";

function balancePath(balance: string, transfers: Transfer[]) {
  const ordered = [...transfers].sort((a, b) => BigInt(a.blockNumber) === BigInt(b.blockNumber)
    ? Number(BigInt(b.logIndex) - BigInt(a.logIndex)) : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? -1 : 1);
  let value = BigInt(balance);
  const history = [value];
  for (const transfer of ordered) {
    if (transfer.direction === "in") value -= BigInt(transfer.amount);
    if (transfer.direction === "out") value += BigInt(transfer.amount);
    history.push(value);
  }
  history.reverse();
  const low = history.reduce((a, b) => a < b ? a : b);
  const high = history.reduce((a, b) => a > b ? a : b);
  const span = high - low || 1n;
  return history.map((amount, index) => `${(index * 100 / Math.max(1, history.length - 1)).toFixed(2)},${(84 - Number((amount - low) * 68n / span)).toFixed(2)}`).join(" ");
}

export default function TreasurySection({ context, snapshotSignal, onConfirmed, onSnapshotError }: { context: FixtureContext; snapshotSignal: AbortSignal; onConfirmed: () => void; onSnapshotError: (error: unknown) => void }) {
  const wallet = useWallet();
  const transaction = useTransaction();
  const [loaded, setLoaded] = useState<{ context: FixtureContext; summary?: Summary; transfers?: Transfer[]; signal?: AbortSignal; error?: string }>();
  const [amount, setAmount] = useState("");
  const [pageState, setPageState] = useState({ context, page: 0 });
  const [depositError, setDepositError] = useState<string | null>(null);
  const summary = loaded?.context === context ? loaded.summary ?? null : null;
  const transfers = loaded?.context === context ? loaded.transfers ?? [] : [];
  const error = loaded?.context === context ? loaded.error ?? null : null;
  const page = pageState.context === context ? pageState.page : 0;
  const setPage = (value: number) => setPageState({ context, page: value });

  useEffect(() => {
    const controller = new AbortController();
    loadTreasurySnapshot(context, controller.signal).then(
      ({ summary, transfers }) => { if (!controller.signal.aborted) setLoaded({ context, summary, transfers, signal: controller.signal }); },
      (cause: unknown) => { if (!controller.signal.aborted) { onSnapshotError(cause); setLoaded({ context, error: cause instanceof Error ? cause.message : "Không tải được Treasury." }); } },
    );
    return () => controller.abort();
  }, [context, onSnapshotError]);

  const deposit = async () => {
    setDepositError(null);
    try {
      assertWritable(wallet.account, wallet.chainId, context, snapshotSignal);
      if (!deployment || !summary || !isAddress(summary.treasury.address) || summary.treasury.address.toLowerCase() !== deployment.treasury.toLowerCase()) throw new Error("Treasury API không khớp deployment.");
      const parsed = parseBUD(amount);
      const treasuryAddress = deployment.treasury;
      await transaction.run(async () => {
        const session = walletSession(wallet.account!, AbortSignal.any([snapshotSignal, loaded!.signal!]));
        await verifyDeployment();
        return sendTokenTransaction(session, "transfer", [treasuryAddress, parsed]);
      }, onConfirmed);
    } catch (cause) { setDepositError(cause instanceof Error ? cause.message : "Không gửi được BUD."); }
  };

  return <section className="panel treasury-section" aria-label="Ngân quỹ Treasury">
    <div className="panel__header"><div><p className="section-kicker">NGÂN QUỸ</p><h2>Treasury BUD</h2><p>Dữ liệu tại block {context.asOfBlock}. Chỉ Transfer BUD được tính vào dòng tiền.</p></div></div>
    {error && <><p className="wallet-error" role="alert">{error}</p><button type="button" className="button-secondary" onClick={onConfirmed}>Tải dữ liệu mới nhất</button></>}
    {!summary && !error && <p role="status">Đang tải dữ liệu Treasury…</p>}
    {(snapshotSignal.aborted || context.sync?.status === "not_ready") && <p className="wallet-error" role="alert">Snapshot không còn dùng để ký giao dịch hoặc API chưa sẵn sàng. Receipt/hash vẫn được giữ; tải snapshot canonical mới để nạp quỹ.</p>}
    {summary && <>
      {context.sync?.status === "lagging" && <p className="notice">Indexer đang đồng bộ chậm; số liệu có thể cũ.</p>}
      <div className="treasury-stats"><div><span>Số dư</span><strong title={formatBUD(summary.treasury.balance)}>{formatCompactBUD(summary.treasury.balance)}</strong></div><div><span>Tổng vào</span><strong title={formatBUD(summary.treasury.totalIn)}>{formatCompactBUD(summary.treasury.totalIn)}</strong></div><div><span>Tổng ra</span><strong title={formatBUD(summary.treasury.totalOut)}>{formatCompactBUD(summary.treasury.totalOut)}</strong></div></div>
      {transfers.length > 0 && <div className="treasury-trend"><div><h3>Biến động ngân sách</h3><p>Số dư dựng lại từ {transfers.length} Transfer BUD, kết thúc tại block {context.asOfBlock}.</p></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Biến động số dư Treasury, hiện tại ${formatBUD(summary.treasury.balance)}`}><line x1="0" y1="84" x2="100" y2="84" stroke="#dce6de" strokeWidth=".6" /><line x1="0" y1="50" x2="100" y2="50" stroke="#e6ece8" strokeWidth=".6" /><polyline fill="none" stroke="#087f5b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" points={balancePath(summary.treasury.balance, transfers)} /></svg></div>}
      <div className="treasury-deposit">
        <h3>Nạp BUD vào quỹ</h3><p>Ví gửi BUD trực tiếp tới Treasury. Sau receipt, giao diện tải snapshot mới nhất đã xuất bản; nếu indexer chưa bắt kịp, bấm Tải dữ liệu mới nhất sau khi index.</p>
        <div className="action-row"><label className="field-label" htmlFor="deposit-amount">Số BUD</label><input id="deposit-amount" className="field-control" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100" /><button type="button" className="button-primary" disabled={snapshotSignal.aborted || context.sync?.status === "not_ready" || transaction.busy || context.dataKind !== "chain" || !deployment || !wallet.account || wallet.chainId !== deployment.chainId} onClick={() => void deposit()}>Nạp quỹ</button></div>
        {depositError && <p className="wallet-error" role="alert">{depositError}</p>}
      </div>
      <div className="treasury-history"><h3>Lịch sử dòng tiền</h3>
        {transfers.length === 0 ? <p>Chưa có Transfer BUD.</p> : <>
          <div className="treasury-history__list">{transfers.slice(page * 10, page * 10 + 10).map((transfer) => <div key={`${transfer.blockNumber}-${transfer.logIndex}`}><span>{transfer.direction === "in" ? "Nạp" : transfer.direction === "out" ? "Chi" : "Chuyển nội bộ"}</span><strong>{formatBUD(transfer.amount)}</strong><small>Block {transfer.blockNumber} · {transactionUrl(transfer.transactionHash) ? <a href={transactionUrl(transfer.transactionHash)!} target="_blank" rel="noreferrer" title={transfer.transactionHash}>{transfer.transactionHash.slice(0, 10)}…</a> : <code title={transfer.transactionHash}>{transfer.transactionHash.slice(0, 10)}…</code>}</small></div>)}</div>
          <nav className="pagination" aria-label="Phân trang lịch sử"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button><span aria-live="polite">{page + 1} / {Math.ceil(transfers.length / 10)}</span><button type="button" disabled={(page + 1) * 10 >= transfers.length} onClick={() => setPage(page + 1)}>Sau</button></nav>
        </>}
      </div>
    </>}
    <TransactionStatus {...transaction} />
  </section>;
}
