import { Link, useParams } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { formatBUD } from "../data/formatBUD";
import { useProposalFixtures } from "../data/useProposalFixtures";

function ProposalDetailPage() {
  const { id } = useParams();
  const { state, retry, simulateError } = useProposalFixtures();
  const proposal = state.status === "success" ? state.collection.proposals.find((item) => item.proposalId === id) : undefined;

  if (state.status !== "success") {
    return <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} />;
  }

  if (!proposal) {
    return (
      <div className="panel">
        <p className="page-heading__eyebrow">Đề xuất · Màn hình 03</p>
        <h1>Không tìm thấy đề xuất</h1>
        <p className="muted">Proposal ID này không tồn tại trong bộ dữ liệu fixture BE01.</p>
        <Link to="/proposals" className="button-primary">Quay lại danh sách</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/proposals" className="back-link">← Danh sách đề xuất</Link>
      <div className="page-heading">
        <div>
          <p className="page-heading__eyebrow">Đề xuất · Màn hình 03</p>
          <h1 className="proposal-id">Proposal #{proposal.proposalId.slice(0, 8)}…{proposal.proposalId.slice(-5)}</h1>
          <p className="proposal-full-id">ID đầy đủ: {proposal.proposalId}</p>
          <p className="page-heading__description">Thông tin khoản chi và tiến trình quản trị · Fixture BE01 tại block {state.collection.context.asOfBlock}.</p>
        </div>
      </div>

      <div className="detail-grid">
        <section className="panel">
          <div className="detail-title">
            <h2>{proposal.title}</h2>
            <span className={`status-pill status-pill--${proposal.state.toLowerCase()}`}>{proposal.state}</span>
          </div>
          <p className="eyebrow">Số tiền đề xuất</p>
          <p className="detail-amount">{formatBUD(proposal.amount)}</p>
          <dl className="detail-fields">
            <div><dt>Người tạo</dt><dd>{proposal.proposer}</dd></div>
            <div><dt>Địa chỉ nhận</dt><dd>{proposal.recipient}</dd></div>
            <div><dt>Mô tả</dt><dd className="description-text">{proposal.body}</dd></div>
          </dl>
        </section>

        <aside className="panel">
          <div className="panel__header"><h2>Tiến trình đề xuất</h2></div>
          <div className="empty-state">Snapshot, deadline, quorum, ETA và transaction sẽ hiện ở đây khi có API và contract.</div>
          <p className="notice" style={{ marginTop: 18 }}>Đây là dữ liệu mô phỏng. Vote, cancel, queue và execute chưa được tích hợp.</p>
        </aside>
      </div>
    </div>
  );
}

export default ProposalDetailPage;
