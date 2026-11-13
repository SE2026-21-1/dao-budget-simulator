import { useState } from "react";
import { Link } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { formatCompactBUD, formatBUD } from "../data/formatBUD";
import { proposalStatuses } from "../data/proposals";
import { useProposalFixtures } from "../data/useProposalFixtures";
import SnapshotInfo from "../components/SnapshotInfo";

const PAGE_SIZE = 20;
const dateTime = (seconds: string) => new Date(Number(BigInt(seconds)) * 1000).toLocaleString("vi-VN");

function ProposalListPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const { state, retry, simulateError, refreshing, refreshError } = useProposalFixtures();

  const filteredProposals = state.status === "success" ? state.collection.proposals.filter((proposal) =>
    (search.trim() === "" || [proposal.proposalId, proposal.title ?? "", proposal.body ?? "", proposal.description, proposal.proposer, proposal.recipient].some((value) => value.toLowerCase().includes(search.trim().toLowerCase()))) &&
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
            <label className="field-label" htmlFor="proposal-search">Tìm đề xuất</label>
            <input id="proposal-search" className="field-control" type="search" placeholder="ID, nội dung, người tạo hoặc người nhận"
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
      <button type="button" className="button-secondary" onClick={retry}>Tải dữ liệu mới nhất</button>

      {refreshing && <p role="status">Đang tải snapshot mới nhất; số liệu hiện tại vẫn ở block đã ghi.</p>}
      {refreshError && <p className="wallet-error" role="alert">{refreshError}</p>}
      {state.status === "success" && <p className="result-count" aria-live="polite">
        {filteredProposals.length} đề xuất · {state.collection.context.dataKind === "chain" ? "Dữ liệu API" : "Fixture TV2 BE01"} · Block {state.collection.context.asOfBlock}
      </p>}
      {state.status === "success" && <SnapshotInfo context={state.collection.context} />}
      {state.status !== "success" ? <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} /> : <>
      {currentProposals.length === 0 ? <div className="empty-state">Không tìm thấy đề xuất phù hợp. Thử từ khóa hoặc trạng thái khác.</div> :
        <div className="proposal-table-wrap"><table className="proposal-table"><thead><tr><th scope="col">Đề xuất</th><th scope="col">Người tạo</th><th scope="col">Người nhận</th><th scope="col">Số tiền</th><th scope="col">Deadline</th><th scope="col">Trạng thái</th></tr></thead><tbody>
          {currentProposals.map((proposal) => <tr key={proposal.proposalId}>
            <td data-label="Đề xuất"><Link to={`/proposals/${proposal.proposalId}`} className="proposal-table__title">{proposal.title || `Proposal ${proposal.proposalId}`}</Link><small title={proposal.proposalId}>#{proposal.proposalId.slice(0, 8)}…{proposal.proposalId.slice(-5)}</small></td>
            <td data-label="Người tạo" title={proposal.proposer}><code>{proposal.proposer.slice(0, 7)}…{proposal.proposer.slice(-5)}</code></td>
            <td data-label="Người nhận" title={proposal.recipient}><code>{proposal.recipient.slice(0, 7)}…{proposal.recipient.slice(-5)}</code></td>
            <td data-label="Số tiền" title={formatBUD(proposal.amount)} className="proposal-table__amount">{formatCompactBUD(proposal.amount)}</td>
            <td data-label="Deadline" title={proposal.deadline}>{dateTime(proposal.deadline)}</td>
            <td data-label="Trạng thái"><span className={`status-pill status-pill--${proposal.state.toLowerCase()}`}>{proposal.state}</span></td>
          </tr>)}
        </tbody></table></div>}

      <nav className="pagination" aria-label="Phân trang đề xuất">
        <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Trang trước</button>
        <span aria-live="polite">Trang {currentPage} / {totalPages}</span>
        <button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Trang sau</button>
      </nav>
      </>}
    </div>
  );
}

export default ProposalListPage;
