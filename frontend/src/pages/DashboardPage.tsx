import { Link } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { formatCompactBUD, formatBUD } from "../data/formatBUD";
import { proposalStatuses, type Proposal } from "../data/proposals";
import { useProposalFixtures } from "../data/useProposalFixtures";
import TreasurySection from "../components/TreasurySection";
import { StatWalletIcon, StatAllocatedIcon, StatRemainingIcon, IconAnalytics } from "../components/EditorialIcons";

const shortId = (id: string) => `${id.slice(0, 8)}…${id.slice(-5)}`;
const statusColors = ["#e9b43f", "#078564", "#40bc94", "#b87b35", "#7b9b8c", "#075c49", "#aaa9a3"];

function DashboardContent({ proposals, asOfBlock }: { proposals: Proposal[]; asOfBlock: string }) {
  const totalAmount = proposals.reduce((sum, proposal) => sum + BigInt(proposal.amount), 0n);
  const active = proposals.filter((proposal) => proposal.state === "Active").length;
  const executed = proposals.filter((proposal) => proposal.state === "Executed").length;
  const recent = proposals.slice(0, 5);
  const counts = proposalStatuses.map((state, index) => ({ state, color: statusColors[index], count: proposals.filter((proposal) => proposal.state === state).length }));
  const largestCount = Math.max(1, ...counts.map(({ count }) => count));
  const segments = counts.map(({ count, color }, index) => {
    const previous = counts.slice(0, index).reduce((sum, item) => sum + item.count, 0);
    const start = proposals.length ? previous / proposals.length * 100 : 0;
    const end = proposals.length ? (previous + count) / proposals.length * 100 : 0;
    return `${color} ${start}% ${end}%`;
  });

  return <div className="editorial-dashboard-content">
    <section className="editorial-stats-row" aria-label={`Chỉ số đề xuất tại block ${asOfBlock}`}>
      <div className="editorial-stat-card"><div className="editorial-stat-card__top">
        <div className="editorial-stat-card__icon-wrap bg-amber-50"><StatWalletIcon /></div>
        <div className="editorial-stat-card__meta"><span className="editorial-stat-card__label">Tổng đề xuất</span>
          <div className="editorial-stat-card__val-row"><strong className="editorial-stat-card__value">{proposals.length}</strong></div>
          <span className="editorial-stat-card__sub-hint">Tại block {asOfBlock}</span></div>
      </div></div>
      <div className="editorial-stat-card"><div className="editorial-stat-card__top">
        <div className="editorial-stat-card__icon-wrap bg-amber-50"><StatAllocatedIcon /></div>
        <div className="editorial-stat-card__meta"><span className="editorial-stat-card__label">Đang bỏ phiếu</span>
          <div className="editorial-stat-card__val-row"><strong className="editorial-stat-card__value">{active}</strong></div>
          <span className="editorial-stat-card__sub-hint">Trạng thái Active</span></div>
      </div></div>
      <div className="editorial-stat-card"><div className="editorial-stat-card__top">
        <div className="editorial-stat-card__icon-wrap bg-emerald-50"><StatRemainingIcon /></div>
        <div className="editorial-stat-card__meta"><span className="editorial-stat-card__label">Đã thực thi</span>
          <div className="editorial-stat-card__val-row"><strong className="editorial-stat-card__value">{executed}</strong></div>
          <span className="editorial-stat-card__sub-hint">Trạng thái Executed</span></div>
      </div></div>
      <div className="editorial-stat-card"><div className="editorial-stat-card__top">
        <div className="editorial-stat-card__icon-wrap bg-amber-50"><IconAnalytics className="w-6 h-6" /></div>
        <div className="editorial-stat-card__meta"><span className="editorial-stat-card__label">Tổng BUD được đề xuất</span>
          <div className="editorial-stat-card__val-row"><strong className="editorial-stat-card__value editorial-stat-card__value--amount" title={formatBUD(totalAmount.toString())}>{formatCompactBUD(totalAmount.toString()).replace(/ BUD$/, "")}</strong></div>
          <span className="editorial-stat-card__sub-hint">Không giữ chỗ trong Treasury</span></div>
      </div></div>
    </section>

    <div className="dashboard-chart-grid">
    <section className="editorial-card status-chart-card" aria-labelledby="status-heading">
      <div className="editorial-card__header"><div><h2 id="status-heading" className="editorial-card__title">Trạng thái đề xuất</h2>
        <p className="editorial-card__subtitle">Số lượng tại block {asOfBlock}</p></div></div>
      {proposals.length === 0 ? <p className="empty-state">Chưa có đề xuất.</p> :
        <div className="status-chart" role="img" aria-label={counts.map(({ state, count }) => `${state}: ${count}`).join(", ")}>
          <div className="status-chart__scale" aria-hidden="true"><span>{largestCount}</span><span>{Math.round(largestCount / 2)}</span><span>0</span></div>
          <div className="status-chart__columns" aria-hidden="true">{counts.map(({ state, count, color }) =>
            <div className="status-chart__column" key={state}>
              <div className="status-chart__track"><div className="status-chart__bar" style={{ height: `${count / largestCount * 85}%`, backgroundColor: color }}><strong>{count}</strong></div></div>
              <span>{state}</span>
            </div>
          )}</div>
        </div>}
    </section>
    <section className="editorial-card distribution-card" aria-labelledby="distribution-heading">
      <div className="editorial-card__header"><div><h2 id="distribution-heading" className="editorial-card__title">Phân bổ trạng thái</h2><p className="editorial-card__subtitle">Tỷ trọng các giai đoạn quản trị</p></div></div>
      {proposals.length === 0 ? <p className="empty-state">Chưa có đề xuất.</p> : <div className="status-distribution">
        <div className="status-donut" style={{ background: `conic-gradient(${segments.join(", ")})` }} aria-hidden="true"><div><strong>{proposals.length}</strong><span>đề xuất</span></div></div>
        <ul className="status-legend">{counts.map(({ state, count, color }) => <li key={state}><span><i style={{ backgroundColor: color }} aria-hidden="true" />{state}</span><strong>{(count / proposals.length * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong></li>)}</ul>
      </div>}
    </section>
    </div>

    <section className="editorial-card recent-proposals-card mt-6" aria-labelledby="recent-heading">
      <div className="editorial-card__header"><div><h2 id="recent-heading" className="editorial-card__title">Đề xuất gần đây</h2>
        <p className="editorial-card__subtitle">Dữ liệu từ cùng snapshot tại block {asOfBlock}</p></div>
        <Link to="/proposals" className="editorial-card__action">Xem tất cả <span aria-hidden="true">→</span></Link></div>
      {recent.length === 0 ? <p className="empty-state">Chưa có đề xuất.</p> :
        <div className="editorial-table-wrap"><table className="editorial-table"><thead><tr>
          <th>Proposal ID</th><th>Tiêu đề</th><th>Số tiền</th><th>Trạng thái</th>
        </tr></thead><tbody>{recent.map((proposal) => <tr key={proposal.proposalId}>
          <td className="editorial-table__num" title={proposal.proposalId}>{shortId(proposal.proposalId)}</td>
          <td><Link className="editorial-table__title-link" to={`/proposals/${proposal.proposalId}`}>{proposal.title || "Đề xuất không có tiêu đề"}</Link></td>
          <td className="editorial-table__amount" title={formatBUD(proposal.amount)}>{formatCompactBUD(proposal.amount)}</td>
          <td><span className={`status-pill status-pill--${proposal.state.toLowerCase()}`}>{proposal.state}</span></td>
        </tr>)}</tbody></table></div>}
    </section>
  </div>;
}

export default function DashboardPage() {
  const { state, retry, simulateError } = useProposalFixtures();
  return <div className="editorial-page-view">
    <header className="editorial-page-header"><div className="editorial-page-header__left">
      <p className="editorial-greeting">Chào mừng trở lại,</p>
      <h1 className="editorial-title">Ngân sách DAO</h1>
      <p className="editorial-description">Theo dõi đề xuất và dòng tiền BUD theo snapshot của DAO.</p>
    </div><Link to="/proposals/new" className="button-primary">Tạo đề xuất</Link></header>
    {state.status === "success" ? <>
      <DashboardContent proposals={state.collection.proposals} asOfBlock={state.collection.context.asOfBlock} />
      <div id="treasury" className="mt-8"><TreasurySection context={state.collection.context} /></div>
    </> : <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} />}
  </div>;
}
