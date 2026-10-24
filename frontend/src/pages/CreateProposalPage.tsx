import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { type Address } from "viem";
import { deployment } from "../chain/config";
import { useWallet, publicClient } from "../chain/wallet";
import { assertWritable, buildProposal, newRequestId, proposalIdFromReceipt, sendGovernor, validateProposalForm } from "../chain/transactions";
import { useTransaction } from "../chain/useTransaction";
import TransactionStatus from "../components/TransactionStatus";
import { loadSummary, type Summary } from "../data/api";

function CreateProposalPage() {
  const wallet = useWallet();
  const transaction = useTransaction();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [requestId] = useState(newRequestId);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadSummary().then((value) => { if (mounted) setSummary(value); }, (cause: unknown) => { if (mounted) setLoadError(cause instanceof Error ? cause.message : "Không tải được summary."); });
    return () => { mounted = false; };
  }, []);

  const validation = validateProposalForm(title, body, recipient, amount, deployment?.treasury);
  const ready = Boolean(summary?.context.dataKind === "chain" && deployment && wallet.account && wallet.chainId === deployment.chainId);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setFormError(null); setSubmittedId(null);
    try {
      assertWritable(wallet.account, wallet.chainId, summary?.context);
      if (validation) throw new Error(validation);
      const payload = buildProposal(title, body, recipient as Address, amount, requestId, deployment!.treasury);
      await transaction.run(
        () => sendGovernor(wallet.account!, "propose", [payload.targets, payload.values, payload.calldatas, payload.description]),
        async (hash) => {
          const receipt = await publicClient!.getTransactionReceipt({ hash });
          setSubmittedId(proposalIdFromReceipt(receipt.logs));
        },
      );
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "Không thể tạo đề xuất."); }
  };

  return <div>
    <Link to="/proposals" className="back-link">← Danh sách đề xuất</Link>
    <div className="page-heading"><div><p className="page-heading__eyebrow">Tạo đề xuất · Màn hình 04</p><h1>Đề xuất chi ngân sách</h1><p className="page-heading__description">Một đề xuất tương ứng với một khoản chi BUD tới một địa chỉ nhận.</p></div></div>
    <form className="panel proposal-form" onSubmit={(event) => void submit(event)}>
      <div className="panel__header"><h2>Thông tin khoản chi</h2></div>
      {loadError && <p className="wallet-error" role="alert">{loadError}</p>}
      {!ready && <p className="notice">Có thể chuẩn bị nội dung tại đây. Để gửi proposal, cần API dữ liệu chain, deployment thật và ví ở đúng mạng.</p>}
      <label className="field-label" htmlFor="proposal-title">Tiêu đề · 5–120 ký tự</label>
      <input id="proposal-title" className="field-control" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
      <label className="field-label" htmlFor="proposal-body">Mô tả · 20–2.000 ký tự</label>
      <textarea id="proposal-body" className="field-control" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} required rows={6} />
      <label className="field-label" htmlFor="proposal-recipient">Địa chỉ nhận</label>
      <input id="proposal-recipient" className="field-control" value={recipient} onChange={(event) => setRecipient(event.target.value)} autoComplete="off" spellCheck={false} required />
      <label className="field-label" htmlFor="proposal-amount">Số tiền BUD</label>
      <input id="proposal-amount" className="field-control" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="1000.5" required />
      <div className="proposal-review"><h3>Kiểm tra trước khi ký</h3><p>Người nhận: <code>{recipient || "—"}</code></p><p>Số tiền: {amount || "—"} BUD</p><p>Request ID: <code>{requestId}</code></p><p>Native value: 0 ETH</p></div>
      {formError && <p className="wallet-error" role="alert">{formError}</p>}
      {submittedId && <p role="status">Proposal ID: <Link to={`/proposals/${submittedId}`}>{submittedId}</Link>. API có thể cần thời gian để index giao dịch.</p>}
      <TransactionStatus {...transaction} />
      <button className="button-primary" type="submit" disabled={!ready || Boolean(validation) || transaction.phase === "signing" || transaction.phase === "confirming"}>Tạo đề xuất</button>
    </form>
  </div>;
}

export default CreateProposalPage;
