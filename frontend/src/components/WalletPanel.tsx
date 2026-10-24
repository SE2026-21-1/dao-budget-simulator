import { useWallet, formatGOV, sendTokenTransaction } from "../chain/wallet";
import { deployment } from "../chain/config";
import { useTransaction } from "../chain/useTransaction";
import TransactionStatus from "./TransactionStatus";

export default function WalletPanel() {
  const wallet = useWallet();
  const transaction = useTransaction();
  const correctNetwork = Boolean(wallet.account && deployment && wallet.chainId === deployment.chainId);
  return <div className="wallet-panel">
    <p className="sidebar__label">VÍ & QUYỀN BIỂU QUYẾT</p>
    {!wallet.account ? <button type="button" className="button-secondary" onClick={() => void wallet.connect()} disabled={wallet.busy}>Kết nối ví</button> : <>
      <p className="wallet-address" title={wallet.account}>{wallet.account.slice(0, 7)}…{wallet.account.slice(-5)}</p>
      <p className="wallet-meta">Chain: {wallet.chainId ?? "—"} {correctNetwork ? "✓" : "· Sai mạng"}</p>
      {!correctNetwork && deployment && <button type="button" className="button-secondary" onClick={() => void wallet.switchNetwork()} disabled={wallet.busy}>Chuyển sang {deployment.chain.name}</button>}
      {correctNetwork && <>
        <p className="wallet-meta">Số dư: {formatGOV(wallet.balance)}</p>
        <p className="wallet-meta">Voting power: {formatGOV(wallet.votingPower)}</p>
        <p className="wallet-meta">Delegate: {wallet.delegatee ? `${wallet.delegatee.slice(0, 7)}…${wallet.delegatee.slice(-5)}` : "—"}</p>
        <button type="button" className="button-secondary" disabled={transaction.phase === "signing" || transaction.phase === "confirming" || wallet.delegatee?.toLowerCase() === wallet.account.toLowerCase()}
          onClick={() => void transaction.run(() => sendTokenTransaction("delegate", [wallet.account!], wallet.account!), wallet.refresh)}>
          Self-delegate
        </button>
      </>}
      <button type="button" className="wallet-disconnect" onClick={wallet.disconnect}>Ẩn tài khoản</button>
    </>}
    {!deployment && <p className="wallet-meta">Chưa cấu hình chain/deployment thật.</p>}
    {wallet.error && <p className="wallet-error" role="alert">{wallet.error}</p>}
    <TransactionStatus {...transaction} />
  </div>;
}
