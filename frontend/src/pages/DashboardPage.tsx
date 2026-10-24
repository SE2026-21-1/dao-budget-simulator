import { Link } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { formatCompactBUD, formatBUD } from "../data/formatBUD";
import { proposalStatuses, type Proposal } from "../data/proposals";
import { useProposalFixtures } from "../data/useProposalFixtures";
import TreasurySection from "../components/TreasurySection";

const palette = ["#b8852f", "#0e7759", "#58b99e", "#7892ab", "#d9ae55", "#244369", "#bd6660"];
const shortId = (id: string) => `${id.slice(0, 7)}…${id.slice(-5)}`;

function DashboardContent({ proposals, asOfBlock }: { proposals: Proposal[]; asOfBlock: string }) {
  if (proposals.length === 0) {
    return <div className="empty-state">Chưa có đề xuất trong dữ liệu fixture.</div>;
  }
  const counts = proposalStatuses.map((status, index) => ({
    status, count: proposals.filter((item) => item.state === status).length, color: palette[index],
  })).filter((item) => item.count > 0);
  const largestStatusCount = Math.max(...counts.map((item) => item.count));
  const total = proposals.length;
  const amount = proposals.reduce((sum, item) => sum + BigInt(item.amount), 0n);
  const executed = proposals.filter((item) => item.state === "Executed").length;
  const active = proposals.filter((item) => item.state === "Active").length;
  const featured = proposalStatuses.map((status) => proposals.find((item) => item.state === status)).filter((item): item is Proposal => Boolean(item)).slice(0, 6);
  const segments = counts.reduce<{ offset: number; values: string[] }>((result, { count, color }) => {
    const end = result.offset + count / total * 100;
    return { offset: end, values: [...result.values, `${color} ${result.offset}% ${end}%`] };
  }, { offset: 0, values: [] }).values;

  return <>
    <div className="stats-grid" aria-label="Chỉ số từ dữ liệu fixture">
      <div className="stat-card stat-card--amber"><span className="stat-card__icon" aria-hidden="true">◇</span><p className="stat-card__label">Tổng đề xuất</p><p className="stat-card__value">{total}</p><p className="stat-card__hint">Trong snapshot BE01</p></div>
      <div className="stat-card stat-card--green"><span className="stat-card__icon" aria-hidden="true">↗</span><p className="stat-card__label">Đang bỏ phiếu</p><p className="stat-card__value">{active}</p><p className="stat-card__hint">Trạng thái Active</p></div>
      <div className="stat-card stat-card--blue"><span className="stat-card__icon" aria-hidden="true">✓</span><p className="stat-card__label">Đã thực thi</p><p className="stat-card__value">{executed}</p><p className="stat-card__hint">Trạng thái Executed</p></div>
      <div className="stat-card stat-card--sand"><span className="stat-card__icon" aria-hidden="true">◎</span><p className="stat-card__label">Tổng BUD được đề xuất</p><p className="stat-card__value stat-card__value--amount" title={formatBUD(amount.toString())}>{formatCompactBUD(amount.toString())}</p><p className="stat-card__hint">Không phải số dư Treasury</p></div>
    </div>
    <div className="overview-grid">
      <section className="panel status-panel">
        <div className="panel__header"><div><p className="section-kicker">DỮ LIỆU TỔNG HỢP</p><h2>Trạng thái đề xuất</h2><p>Số lượng theo từng trạng thái tại block {asOfBlock}.</p></div></div>
        <div className="status-bars">
          {counts.map(({ status, count, color }) => <div className="status-bar" key={status}>
            <div className="status-bar__label"><span>{status}</span><strong>{count}</strong></div>
            <div className="status-bar__track"><span style={{ width: `${count / largestStatusCount * 100}%`, backgroundColor: color }} /></div>
          </div>)}
        </div>
      </section>
      <section className="panel distribution-panel">
        <div className="panel__header"><div><p className="section-kicker">SNAPSHOT BE01</p><h2>Phân bổ trạng thái</h2><p>Đếm theo từng giai đoạn quản trị.</p></div></div>
        <div className="distribution-panel__body">
          <div className="donut" style={{ background: `conic-gradient(${segments.join(", ")})` }} role="img" aria-label={counts.map((item) => `${item.status}: ${item.count}`).join(", ")}><span><strong>{total}</strong><small>đề xuất</small></span></div>
          <ul className="donut-legend">{counts.map(({ status, count, color }) => <li key={status}><span className="donut-legend__name"><i style={{ backgroundColor: color }} />{status}</span><strong>{Math.round(count / total * 100)}%</strong></li>)}</ul>
        </div>
      </section>
    </div>
    <div className="bottom-grid">
      <section className="panel recent-panel">
        <div className="panel__header"><div><p className="section-kicker">KHÁM PHÁ</p><h2>Một số đề xuất trong snapshot</h2></div><Link to="/proposals" className="text-link">Xem tất cả <span aria-hidden="true">→</span></Link></div>
        <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>Đề xuất</th><th>Số tiền</th><th>Trạng thái</th><th><span className="sr-only">Mở</span></th></tr></thead><tbody>{featured.map((proposal) => <tr key={proposal.proposalId}><td><Link to={`/proposals/${proposal.proposalId}`}><strong>{proposal.title}</strong><small>#{shortId(proposal.proposalId)}</small></Link></td><td title={formatBUD(proposal.amount)}>{formatCompactBUD(proposal.amount)}</td><td><span className={`status-pill status-pill--${proposal.state.toLowerCase()}`}>{proposal.state}</span></td><td><Link className="table-arrow" to={`/proposals/${proposal.proposalId}`} aria-label={`Xem ${proposal.title}`}>↗</Link></td></tr>)}</tbody></table></div>
      </section>
      <section className="panel process-panel">
        <div className="panel__header"><div><p className="section-kicker">QUY TRÌNH</p><h2>Từ đề xuất tới chi quỹ</h2></div></div>
        <ol className="process-list"><li><span>01</span><div><strong>Tạo đề xuất</strong><p>Nêu khoản chi BUD và địa chỉ nhận.</p></div></li><li><span>02</span><div><strong>Bỏ phiếu</strong><p>Thành viên quyết định trong kỳ voting.</p></div></li><li><span>03</span><div><strong>Queue và execute</strong><p>Giao dịch chỉ chạy sau timelock khi gọi execute.</p></div></li></ol>
        <p className="process-panel__note">Các thao tác on-chain sẽ được tích hợp sau.</p>
      </section>
    </div>
  </>;
}

function DashboardPage() {
  const { state, retry, simulateError } = useProposalFixtures();
  return <div>
    <div className="page-heading page-heading--dashboard"><div><p className="page-heading__eyebrow">TỔNG QUAN / DAO BUDGET</p><h1>Ngân sách DAO</h1><p className="page-heading__description">Theo dõi đề xuất và tiến trình quản trị trong một không gian rõ ràng, minh bạch.</p></div><Link to="/proposals" className="button-primary">Khám phá đề xuất <span aria-hidden="true">↗</span></Link></div>
    {state.status === "success" ? <><DashboardContent proposals={state.collection.proposals} asOfBlock={state.collection.context.asOfBlock} /><TreasurySection context={state.collection.context} /></> : <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} />}
  </div>;
}

export default DashboardPage;
