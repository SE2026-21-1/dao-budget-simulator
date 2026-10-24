import { useEffect, useState } from "react";
import { isAddress } from "viem";
import { deployment } from "../chain/config";
import { useWallet, sendTokenTransaction } from "../chain/wallet";
import { useTransaction } from "../chain/useTransaction";
import { assertWritable, parseBUD, verifyDeployment } from "../chain/transactions";
import { formatBUD } from "../data/formatBUD";
import { loadSummary, loadTransfers, type Summary, type Transfer } from "../data/api";
import type { FixtureContext } from "../data/proposals";
import TransactionStatus from "./TransactionStatus";

export default function TreasurySection({ context, onConfirmed }: { context: FixtureContext; onConfirmed: () => void }) {
  const wallet = useWallet();
  const transaction = useTransaction();
  const [loaded, setLoaded] = useState<{ context: FixtureContext; summary?: Summary; transfers?: Transfer[]; error?: string }>();
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
    Promise.all([loadSummary(context, controller.signal), loadTransfers(context, controller.signal)]).then(
      ([nextSummary, nextTransfers]) => { if (!controller.signal.aborted) setLoaded({ context, summary: nextSummary, transfers: nextTransfers }); },
      (cause: unknown) => { if (!controller.signal.aborted) setLoaded({ context, error: cause instanceof Error ? cause.message : "Không tải được Treasury." }); },
    );
    return () => controller.abort();
  }, [context]);

  const deposit = async () => {
    setDepositError(null);
    try {
      assertWritable(wallet.account, wallet.chainId, context);
      if (!deployment || !summary || !isAddress(summary.treasury.address) || summary.treasury.address.toLowerCase() !== deployment.treasury.toLowerCase()) throw new Error("Treasury API không khớp deployment.");
      const parsed = parseBUD(amount);
      const treasuryAddress = deployment.treasury;
      await transaction.run(async () => {
        await verifyDeployment();
        return sendTokenTransaction("transfer", [treasuryAddress, parsed], wallet.account!);
      }, onConfirmed);
    } catch (cause) { setDepositError(cause instanceof Error ? cause.message : "Không gửi được BUD."); }
  };

  return <section className="panel treasury-section" aria-label="Ngân quỹ Treasury">
    <div className="panel__header"><div><p className="section-kicker">NGÂN QUỸ</p><h2>Treasury BUD</h2><p>Dữ liệu tại block {context.asOfBlock}. Chỉ Transfer BUD được tính vào dòng tiền.</p></div></div>
    {error && <><p className="wallet-error" role="alert">{error}</p><button type="button" className="button-secondary" onClick={onConfirmed}>Tải dữ liệu mới nhất</button></>}
    {!summary && !error && <p role="status">Đang tải dữ liệu Treasury…</p>}
    {summary && <>
      {context.sync?.status === "lagging" && <p className="notice">Indexer đang đồng bộ chậm; số liệu có thể cũ.</p>}
      <div className="treasury-stats"><div><span>Số dư</span><strong>{formatBUD(summary.treasury.balance)}</strong></div><div><span>Tổng vào</span><strong>{formatBUD(summary.treasury.totalIn)}</strong></div><div><span>Tổng ra</span><strong>{formatBUD(summary.treasury.totalOut)}</strong></div></div>
      <div className="treasury-deposit">
        <h3>Nạp BUD vào quỹ</h3><p>Ví gửi BUD trực tiếp tới Treasury. Sau receipt, giao diện tải snapshot mới nhất đã xuất bản; nếu indexer chưa bắt kịp, bấm Tải dữ liệu mới nhất sau khi index.</p>
        <div className="action-row"><label className="field-label" htmlFor="deposit-amount">Số BUD</label><input id="deposit-amount" className="field-control" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100" /><button type="button" className="button-primary" disabled={transaction.busy || context.dataKind !== "chain" || !deployment || !wallet.account || wallet.chainId !== deployment.chainId} onClick={() => void deposit()}>Nạp quỹ</button></div>
        {depositError && <p className="wallet-error" role="alert">{depositError}</p>}<TransactionStatus {...transaction} />
      </div>
      <div className="treasury-history"><h3>Lịch sử dòng tiền</h3>
        {transfers.length === 0 ? <p>Chưa có Transfer BUD.</p> : <>
          <div className="treasury-history__list">{transfers.slice(page * 10, page * 10 + 10).map((transfer) => <div key={`${transfer.blockNumber}-${transfer.logIndex}`}><span>{transfer.direction === "in" ? "Nạp" : transfer.direction === "out" ? "Chi" : "Chuyển nội bộ"}</span><strong>{formatBUD(transfer.amount)}</strong><small>Block {transfer.blockNumber} · {transfer.transactionHash.slice(0, 10)}…</small></div>)}</div>
          <nav className="pagination" aria-label="Phân trang lịch sử"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button><span aria-live="polite">{page + 1} / {Math.ceil(transfers.length / 10)}</span><button type="button" disabled={(page + 1) * 10 >= transfers.length} onClick={() => setPage(page + 1)}>Sau</button></nav>
        </>}
      </div>
    </>}
  </section>;
}
