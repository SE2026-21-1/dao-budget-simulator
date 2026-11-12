import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { formatBUD } from "../data/formatBUD";
import { useProposalFixtures } from "../data/useProposalFixtures";
import ProposalActions from "../components/ProposalActions";
import { formatGOV } from "../chain/wallet";
import { transactionUrl } from "../chain/config";
import { apiBaseUrl } from "../chain/config";
import { loadProposalSnapshot, type Vote, type Transfer } from "../data/api";
import SnapshotInfo from "../components/SnapshotInfo";
import { proposalTimeline } from "./proposalTimeline";

const timestamp = (raw?: string) => raw ? new Date(Number(BigInt(raw)) * 1000).toLocaleString("vi-VN") : "—";

function ProposalDetailPage() {
  const { id } = useParams();
  const { state, retry, simulateError, refreshing, refreshError, snapshotSignal, invalidateSnapshot } = useProposalFixtures();
  const listProposal = state.status === "success" ? state.collection.proposals.find((item) => item.proposalId === id) : undefined;
  const context = state.status === "success" ? state.collection.context : undefined;
  const key = context && listProposal ? `${context.chainId}:${context.deploymentId}:${context.asOfBlock}:${context.asOfBlockHash}:${context.snapshotRevision}:${listProposal.proposalId}` : "";
  const [verified, setVerified] = useState<{ key: string; context?: typeof context; signal?: AbortSignal; data?: { proposal: typeof listProposal; votes: Vote[]; transfers: Transfer[] }; error?: string }>();

  useEffect(() => {
    if (!apiBaseUrl || !context || !listProposal) return;
    const controller = new AbortController();
    loadProposalSnapshot(listProposal, context, controller.signal).then(
      (data) => { if (!controller.signal.aborted) setVerified({ key, context, signal: snapshotSignal, data }); },
      (cause: unknown) => { if (!controller.signal.aborted) { invalidateSnapshot(cause); setVerified((previous) => ({ ...previous, key: previous?.data ? previous.key : key, error: cause instanceof Error ? cause.message : "Không đối chiếu được chi tiết proposal." })); } },
    );
    return () => controller.abort();
  }, [key, context, listProposal, snapshotSignal, invalidateSnapshot]);

  if (state.status !== "success") {
    return <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} />;
  }

  if (!listProposal) {
    return (
      <div className="panel">
        <p className="page-heading__eyebrow">Đề xuất · Màn hình 03</p>
        <h1>Không tìm thấy đề xuất</h1>
        <p className="muted">Proposal ID này không tồn tại trong snapshot đang xem. Nếu vừa gửi giao dịch, hãy đợi indexer xuất bản dữ liệu mới.</p>
        <SnapshotInfo context={state.collection.context} />
        <button type="button" className="button-secondary" onClick={retry}>Tải dữ liệu mới nhất</button>
        <Link to="/proposals" className="button-primary">Quay lại danh sách</Link>
      </div>
    );
  }

  const current = verified?.key === key ? verified : undefined;
  if (apiBaseUrl && !current?.data && !verified?.data) {
    return <div className="panel"><h1>Đối chiếu đề xuất</h1><p role="status">{current?.error ?? "Đang đối chiếu detail, phiếu và Transfer tại cùng snapshot…"}</p><button type="button" className="button-secondary" onClick={retry}>Tải dữ liệu mới nhất</button></div>;
  }
  const proposal = current?.data?.proposal ?? verified?.data?.proposal ?? listProposal;
  const actionContext = current?.data ? context! : verified?.context ?? context!;
  const actionSignal = current?.data ? snapshotSignal! : verified?.signal ?? snapshotSignal!;
  const forVotes = BigInt(proposal.votes?.for ?? "0");
  const againstVotes = BigInt(proposal.votes?.against ?? "0");
  const abstainVotes = BigInt(proposal.votes?.abstain ?? "0");
  const totalVotes = forVotes + againstVotes + abstainVotes;
  const voteParts = [
    { label: "For", value: forVotes, className: "vote-for" },
    { label: "Against", value: againstVotes, className: "vote-against" },
    { label: "Abstain", value: abstainVotes, className: "vote-abstain" },
  ];
  const milestones = proposalTimeline(proposal);

  return (
    <div>
      <Link to="/proposals" className="back-link">← Danh sách đề xuất</Link>
      <div className="page-heading">
        <div>
          <p className="page-heading__eyebrow">Đề xuất · Màn hình 03</p>
          <h1 className="proposal-id">Proposal #{proposal.proposalId.slice(0, 8)}…{proposal.proposalId.slice(-5)}</h1>
          <p className="proposal-full-id">ID đầy đủ: {proposal.proposalId}</p>
          <p className="page-heading__description">Thông tin khoản chi và tiến trình quản trị · {actionContext.dataKind === "chain" ? "API BE05" : "Fixture BE01"} tại block {actionContext.asOfBlock}.</p>
        </div>
      </div>
      <button type="button" className="button-secondary" onClick={retry}>Tải dữ liệu mới nhất</button>
      <SnapshotInfo context={actionContext} />
      {refreshing && <p role="status">Đang tải snapshot mới nhất; số liệu hiện tại vẫn ở block đã ghi.</p>}
      {refreshError && <p className="wallet-error" role="alert">{refreshError}</p>}

      <div className="detail-grid">
        <section className="panel">
          <div className="detail-title">
            <h2>{proposal.title ?? `Proposal ${proposal.proposalId}`}</h2>
            <span className={`status-pill status-pill--${proposal.state.toLowerCase()}`}>{proposal.state}</span>
          </div>
          <p className="eyebrow">Số tiền đề xuất</p>
          <p className="detail-amount">{formatBUD(proposal.amount)}</p>
          <dl className="detail-fields">
            <div><dt>Người tạo</dt><dd>{proposal.proposer}</dd></div>
            <div><dt>Địa chỉ nhận</dt><dd>{proposal.recipient}</dd></div>
            <div><dt>Mô tả</dt><dd className="description-text">{proposal.body ?? proposal.description}</dd></div>
          </dl>
          {current?.data && <p className="muted">Đã đối chiếu {current.data.votes.length} phiếu và {current.data.transfers.length} Transfer liên kết tại cùng snapshot.</p>}
        </section>

        <aside className="panel">
          <div className="panel__header"><h2>Tiến trình đề xuất</h2></div>
          <div className="vote-chart" aria-label="Kết quả biểu quyết">
            <div className="vote-chart__track" role="img" aria-label={voteParts.map(({ label, value }) => `${label}: ${formatGOV(value)}`).join(", ")}>{voteParts.map(({ label, value, className }) => <span key={label} className={className} style={{ width: `${totalVotes ? Number(value * 10000n / totalVotes) / 100 : 0}%` }} />)}</div>
            <div className="vote-chart__legend">{voteParts.map(({ label, value, className }) => <div key={label}><span className={className} />{label}<strong>{formatGOV(value)}</strong></div>)}</div>
          </div>
          <dl className="detail-fields">
            <div><dt>Snapshot</dt><dd>{timestamp(proposal.snapshot)}</dd></div>
            <div><dt>Deadline</dt><dd>{timestamp(proposal.deadline)}</dd></div>
            <div><dt>ETA</dt><dd>{timestamp(proposal.operation?.eta)}</dd></div>
            <div><dt>For / Against / Abstain</dt><dd>{proposal.votes ? `${formatGOV(BigInt(proposal.votes.for))} / ${formatGOV(BigInt(proposal.votes.against))} / ${formatGOV(BigInt(proposal.votes.abstain))}` : "—"}</dd></div>
            <div><dt>Quorum tại snapshot</dt><dd>{proposal.votes?.quorum ? formatGOV(BigInt(proposal.votes.quorum)) : "Chưa xác định"}</dd></div>
          </dl>
          <div className="governance-timeline"><h3>Hành trình quản trị</h3><ol>{milestones.map(({ label, phase, detail }) => <li key={label} className={`is-${phase}`}><span className="timeline-dot" /><div><strong>{label}</strong><small>{detail}</small></div></li>)}</ol></div>
          {proposal.transactions && <div className="transaction-list"><h3>Giao dịch</h3>{Object.entries(proposal.transactions).filter(([, hash]) => hash).map(([kind, hash]) => {
            const url = transactionUrl(hash!);
            return <p key={kind}>{kind}: {url ? <a href={url} target="_blank" rel="noreferrer">{hash}</a> : <code>{hash}</code>}</p>;
          })}</div>}
          <ProposalActions key={proposal.proposalId} proposal={proposal} context={actionContext} snapshotSignal={actionSignal} onConfirmed={retry} />
        </aside>
      </div>
    </div>
  );
}

export default ProposalDetailPage;
