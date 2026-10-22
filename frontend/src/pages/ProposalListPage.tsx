import { useState } from "react";
import { Link } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { formatCompactBUD, formatBUD } from "../data/formatBUD";
import { proposalStatuses } from "../data/proposals";
import { useProposalFixtures } from "../data/useProposalFixtures";

const PAGE_SIZE = 20;

function ProposalListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const { state, retry, simulateError } = useProposalFixtures();

  const filteredProposals = state.status === "success" ? state.collection.proposals.filter((proposal) =>
    (search.trim() === "" || proposal.proposalId === search.trim()) &&
    (status === "ALL" || proposal.state === status)
  ) : [];
  const totalPages = Math.max(1, Math.ceil(filteredProposals.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const currentProposals = filteredProposals.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="page-heading__eyebrow">Đề xuất · Màn hình 02</p>
          <h1>Danh sách đề xuất</h1>
          <p className="page-heading__description">Tra cứu các yêu cầu chi BUD theo mã và trạng thái.</p>
        </div>
        <Link to="/proposals/new" className="button-primary">Tạo đề xuất</Link>
      </div>

      <section className="panel" aria-label="Bộ lọc đề xuất">
        <div className="filters">
          <div>
            <label className="field-label" htmlFor="proposal-search">Proposal ID</label>
            <input id="proposal-search" className="field-control" type="search" inputMode="numeric" placeholder="Nhập đúng Proposal ID (số thập phân)"
              value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          </div>
          <div>
            <label className="field-label" htmlFor="proposal-status">Trạng thái</label>
            <select id="proposal-status" className="field-control" value={status}
              onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="ALL">Tất cả trạng thái</option>
              {proposalStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>
      </section>

      {state.status === "success" && <p className="result-count" aria-live="polite">
        {filteredProposals.length} đề xuất · Fixture TV2 BE01 · Block {state.collection.context.asOfBlock}
      </p>}
      {state.status !== "success" ? <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} /> : <>
      <div className="proposal-list">
        {currentProposals.map((proposal) => (
          <article className="proposal-row" key={proposal.proposalId}>
            <div className="proposal-row__main">
              <span className="eyebrow" title={proposal.proposalId}>Proposal #{proposal.proposalId.slice(0, 8)}…{proposal.proposalId.slice(-5)}</span>
              <h2 className="proposal-row__title">{proposal.title}</h2>
              <p className="proposal-row__meta">Người nhận: {proposal.recipient}</p>
            </div>
            <div className="proposal-row__side">
              <span className={`status-pill status-pill--${proposal.state.toLowerCase()}`}>{proposal.state}</span>
              <span className="proposal-row__amount" title={formatBUD(proposal.amount)}>{formatCompactBUD(proposal.amount)}</span>
              <Link to={`/proposals/${proposal.proposalId}`} className="button-secondary" aria-label={`Xem đề xuất ${proposal.proposalId}`}>Xem chi tiết</Link>
            </div>
          </article>
        ))}
        {currentProposals.length === 0 && <div className="empty-state">Không tìm thấy đề xuất phù hợp. Proposal ID phải khớp chính xác.</div>}
      </div>

      <nav className="pagination" aria-label="Phân trang đề xuất">
        <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trang trước</button>
        <span>Trang {currentPage} / {totalPages}</span>
        <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Trang sau</button>
      </nav>
      </>}
    </div>
  );
}

export default ProposalListPage;
