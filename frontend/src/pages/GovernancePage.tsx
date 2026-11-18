import { Link } from "react-router";
import { deployment } from "../chain/config";
import { formatGOV, useWallet } from "../chain/wallet";
import WalletPanel from "../components/WalletPanel";

export default function GovernancePage() {
  const wallet = useWallet();
  const correctNetwork = Boolean(wallet.account && deployment && wallet.chainId === deployment.chainId);
  return <div className="editorial-page-view">
    <header className="editorial-page-header"><div><h1 className="editorial-title">Governance</h1><p className="editorial-description">Theo dõi quyền biểu quyết và quản lý ủy quyền GOV.</p></div></header>
    <div className="governance-grid">
      <section className="panel"><h2>Quyền biểu quyết</h2><div className="governance-metrics">
        <div><span>GOV balance</span><strong>{correctNetwork ? formatGOV(wallet.balance) : "—"}</strong></div>
        <div><span>Voting power</span><strong>{correctNetwork ? formatGOV(wallet.votingPower) : "—"}</strong></div>
      </div><p className="muted">Quyền biểu quyết chỉ hiển thị khi ví kết nối đúng mạng. Có thể self-delegate trong bảng ví.</p>
      <Link className="button-secondary" to="/proposals">Xem đề xuất để bỏ phiếu</Link></section>
      <section className="panel"><h2>Ví và ủy quyền</h2><WalletPanel /></section>
    </div>
  </div>;
}
