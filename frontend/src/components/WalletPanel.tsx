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
    {wallet.wallets.length > 1 && <div className="wallet-picker"><label className="field-label" htmlFor="wallet-provider">Chọn ví</label><select id="wallet-provider" className="field-control" value={wallet.selectedWalletId ?? ""} onChange={(event) => wallet.selectWallet(event.target.value)} disabled={wallet.busy}>{wallet.wallets.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></div>}
    {wallet.wallets.length === 1 && <p className="wallet-meta">Ví: {wallet.wallets[0].name}</p>}
    {wallet.wallets.length === 0 ? <div className="wallet-help" role="status"><strong>Chưa phát hiện ví</strong><p>Mở web trong Chrome, Edge hoặc trình duyệt đã cài và bật tiện ích ví EVM.</p><p>Nếu đang xem bằng trình duyệt tích hợp, hãy mở cùng địa chỉ web trong trình duyệt có ví.</p><button type="button" className="button-secondary" onClick={wallet.discover}>Tìm lại ví</button></div> : !wallet.account ? <button type="button" className="button-secondary" onClick={() => void wallet.connect()} disabled={wallet.busy}>{wallet.busy ? "Đang chờ ví…" : "Kết nối ví"}</button> : <>
      <p className="wallet-address" title={wallet.account}>{wallet.account.slice(0, 7)}…{wallet.account.slice(-5)}</p>
      <p className="wallet-meta">Chain: {wallet.chainId ?? "Chưa đọc được"} {deployment ? correctNetwork ? "✓" : "· Sai mạng" : "· Chưa cấu hình mạng đích"}</p>
      {!correctNetwork && deployment && <button type="button" className="button-secondary" onClick={() => void wallet.switchNetwork()} disabled={wallet.busy}>Chuyển sang {deployment.chain.name}</button>}
      {correctNetwork && <>
        <p className="wallet-meta">Số dư: {formatGOV(wallet.balance)}</p>
        <p className="wallet-meta">Voting power: {formatGOV(wallet.votingPower)}</p>
        <p className="wallet-meta">Delegate: {wallet.delegatee ? `${wallet.delegatee.slice(0, 7)}…${wallet.delegatee.slice(-5)}` : "—"}</p>
        <button type="button" className="button-secondary" disabled={transaction.busy || wallet.delegatee?.toLowerCase() === wallet.account.toLowerCase()}
          onClick={() => void transaction.run(() => sendTokenTransaction("delegate", [wallet.account!], wallet.account!), wallet.refresh)}>
          Self-delegate
        </button>
      </>}
      <button type="button" className="wallet-disconnect" onClick={wallet.disconnect}>Ẩn tài khoản</button>
    </>}
    {!deployment && <p className="wallet-meta">Có thể kết nối ví để xem địa chỉ. Thao tác on-chain cần cấu hình deployment của nhóm.</p>}
    {wallet.error && <p className="wallet-error" role="alert">{wallet.error}</p>}
    <TransactionStatus {...transaction} />
  </div>;
}
