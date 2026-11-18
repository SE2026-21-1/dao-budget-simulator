import { transactionUrl } from "../chain/config";
import type { TransactionPhase } from "../chain/transactions";

const labels: Record<TransactionPhase, string> = {
  idle: "", signing: "Đang chờ ký trong ví…", submitted: "Đã gửi giao dịch…",
  confirming: "Đang chờ xác nhận trên chain…", success: "Giao dịch đã được xác nhận.",
  reverted: "Giao dịch bị revert.", error: "Không gửi được giao dịch.",
};

export default function TransactionStatus({ phase, hash, error }: { phase: TransactionPhase; hash: string | null; error: string | null }) {
  if (phase === "idle") return null;
  const url = hash ? transactionUrl(hash) : null;
  return <div className={`transaction-status transaction-status--${phase}`} role="status" aria-live="polite">
    <strong>{labels[phase]}</strong>
    {error && <p>{error}</p>}
    {hash && <p>Tx: {url ? <a href={url} target="_blank" rel="noreferrer">{hash}</a> : <code>{hash}</code>}</p>}
  </div>;
}
