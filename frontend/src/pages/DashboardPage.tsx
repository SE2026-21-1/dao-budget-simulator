import { useEffect, useState } from "react";
import { Link } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { formatCompactBUD, formatBUD } from "../data/formatBUD";
import { proposalStatuses, type Proposal } from "../data/proposals";
import { useProposalFixtures } from "../data/useProposalFixtures";
import TreasurySection from "../components/TreasurySection";
import SnapshotInfo from "../components/SnapshotInfo";
import { StatWalletIcon, StatAllocatedIcon, StatRemainingIcon, IconAnalytics } from "../components/EditorialIcons";
import { loadSummary, type Summary } from "../data/api";
import type { FixtureContext } from "../data/proposals";

const shortId = (id: string) => `${id.slice(0, 8)}…${id.slice(-5)}`;
const statusColors = ["#94a3b8", "#087f5b", "#386c98", "#a65a3a", "#c18b2d", "#2d9d85", "#64748b"];
const budBase = 10n ** 18n;

function formatDonutTotal(rawAmount: bigint) {
  const scale = rawAmount >= budBase * 1_000_000_000n ? { unit: budBase * 1_000_000_000n, suffix: "B" }
    : rawAmount >= budBase * 1_000_000n ? { unit: budBase * 1_000_000n, suffix: "M" }
    : rawAmount >= budBase * 1_000n ? { unit: budBase * 1_000n, suffix: "K" } : null;
  if (!scale) return formatCompactBUD(rawAmount.toString()).replace(/ BUD$/, "");
  const rounded = (rawAmount * 100n + scale.unit / 2n) / scale.unit;
  const fraction = (rounded % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `≈ ${ (rounded / 100n).toLocaleString("vi-VN") }${fraction ? `,${fraction}` : ""}${scale.suffix}`;
}

function DashboardContent({ proposals, context }: { proposals: Proposal[]; context: FixtureContext }) {
  const asOfBlock = context.asOfBlock;
  const [treasury, setTreasury] = useState<{ context: FixtureContext; summary?: Summary; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    loadSummary(context, controller.signal).then(
      (summary) => { if (!controller.signal.aborted) setTreasury({ context, summary }); },
      (cause: unknown) => { if (!controller.signal.aborted) setTreasury({ context, error: cause instanceof Error ? cause.message : "Không tải được số dư Treasury." }); },
    );
    return () => controller.abort();
  }, [context]);
  const currentTreasury = treasury?.context === context ? treasury : undefined;
  const totalAmount = proposals.reduce((sum, proposal) => sum + BigInt(proposal.amount), 0n);
  const active = proposals.filter((proposal) => proposal.state === "Active").length;
  const executed = proposals.filter((proposal) => proposal.state === "Executed").length;
  const recent = proposals.slice(0, 5);
  const counts = proposalStatuses.map((state, index) => ({ state, color: statusColors[index], count: proposals.filter((proposal) => proposal.state === state).length,
    amount: proposals.filter((proposal) => proposal.state === state).reduce((sum, proposal) => sum + BigInt(proposal.amount), 0n) }));
  const largestCount = Math.max(1, ...counts.map(({ count }) => count));
  const segments = counts.map(({ amount, color }, index) => {
    const previous = counts.slice(0, index).reduce((sum, item) => sum + item.amount, 0n);
    const start = totalAmount ? Number(previous * 10000n / totalAmount) / 100 : 0;
    const end = totalAmount ? Number((previous + amount) * 10000n / totalAmount) / 100 : 0;
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
        <div className="editorial-stat-card__meta"><span className="editorial-stat-card__label">Treasury BUD</span>
          <div className="editorial-stat-card__val-row"><strong className="editorial-stat-card__value editorial-stat-card__value--amount" title={currentTreasury?.summary ? formatBUD(currentTreasury.summary.treasury.balance) : undefined}>{currentTreasury?.summary ? formatCompactBUD(currentTreasury.summary.treasury.balance) : "—"}</strong></div>
          <span className="editorial-stat-card__sub-hint">{currentTreasury?.error ?? (currentTreasury?.summary ? "Số dư tại cùng snapshot" : "Đang đối chiếu số dư…")}</span></div>
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
      <div className="editorial-card__header"><div><h2 id="distribution-heading" className="editorial-card__title">Phân bổ ngân sách</h2><p className="editorial-card__subtitle">BUD đề xuất theo trạng thái, không phải số dư Treasury</p></div></div>
      {totalAmount === 0n ? <p className="empty-state">Chưa có ngân sách được đề xuất.</p> : <>
        <div className="status-distribution">
          <div className="status-donut" style={{ background: `conic-gradient(${segments.join(", ")})` }} role="img" aria-label={counts.map(({ state, amount }) => `${state}: ${formatBUD(amount.toString())}`).join(", ")}><div><strong>{formatDonutTotal(totalAmount)}</strong><span>BUD đề xuất</span></div></div>
          <ul className="status-legend">{counts.map(({ state, amount, color }) => <li key={state}><span><i style={{ backgroundColor: color }} aria-hidden="true" />{state}</span><strong title={formatBUD(amount.toString())}>{(Number(amount * 10000n / totalAmount) / 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong></li>)}</ul>
        </div>
        <p className="status-distribution__total">Tổng BUD được đề xuất <strong title={formatBUD(totalAmount.toString())}>{formatCompactBUD(totalAmount.toString())}</strong></p>
      </>}
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
  const { state, retry, simulateError, refreshing, refreshError, snapshotSignal, invalidateSnapshot } = useProposalFixtures();
  return <div className="editorial-page-view">
    <header className="editorial-page-header"><div className="editorial-page-header__left">
      <p className="editorial-greeting">Chào mừng trở lại,</p>
      <h1 className="editorial-title">Ngân sách DAO</h1>
      <p className="editorial-description">Theo dõi đề xuất và dòng tiền BUD theo snapshot của DAO.</p>
    </div><Link to="/proposals/new" className="button-primary">Tạo đề xuất</Link></header>
    <button type="button" className="button-secondary" onClick={retry}>Tải dữ liệu mới nhất</button>
    {refreshing && <p role="status">Đang tải snapshot mới nhất; số liệu hiện tại vẫn ở block đã ghi.</p>}
    {refreshError && <p className="wallet-error" role="alert">Không tải được snapshot mới: {refreshError}</p>}
    {state.status === "success" && <SnapshotInfo context={state.collection.context} />}
    {state.status === "success" ? <>
      <DashboardContent proposals={state.collection.proposals} context={state.collection.context} />
      <div id="treasury" className="mt-8"><TreasurySection context={state.collection.context} snapshotSignal={snapshotSignal!} onConfirmed={retry} onSnapshotError={invalidateSnapshot} /></div>
    </> : <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} />}
  </div>;
}
