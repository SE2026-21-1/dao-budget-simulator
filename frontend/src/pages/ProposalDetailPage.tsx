import { Link, useParams } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { formatBUD } from "../data/formatBUD";
import { useProposalFixtures } from "../data/useProposalFixtures";
import ProposalActions from "../components/ProposalActions";
import { formatGOV } from "../chain/wallet";
import { transactionUrl } from "../chain/config";

const timestamp = (raw?: string) => raw ? new Date(Number(BigInt(raw)) * 1000).toLocaleString("vi-VN") : "—";

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
          <dl className="detail-fields">
            <div><dt>Snapshot</dt><dd>{timestamp(proposal.snapshot)}</dd></div>
            <div><dt>Deadline</dt><dd>{timestamp(proposal.deadline)}</dd></div>
            <div><dt>ETA</dt><dd>{timestamp(proposal.operation?.eta)}</dd></div>
            <div><dt>For / Against / Abstain</dt><dd>{proposal.votes ? `${formatGOV(BigInt(proposal.votes.for))} / ${formatGOV(BigInt(proposal.votes.against))} / ${formatGOV(BigInt(proposal.votes.abstain))}` : "—"}</dd></div>
            <div><dt>Quorum tại snapshot</dt><dd>{proposal.votes?.quorum ? formatGOV(BigInt(proposal.votes.quorum)) : "Chưa xác định"}</dd></div>
          </dl>
          {proposal.transactions && <div className="transaction-list"><h3>Giao dịch</h3>{Object.entries(proposal.transactions).filter(([, hash]) => hash).map(([kind, hash]) => {
            const url = transactionUrl(hash!);
            return <p key={kind}>{kind}: {url ? <a href={url} target="_blank" rel="noreferrer">{hash}</a> : <code>{hash}</code>}</p>;
          })}</div>}
          <ProposalActions proposal={proposal} context={state.collection.context} />
        </aside>
      </div>
    </div>
  );
}

export default ProposalDetailPage;
