import { useEffect, useState } from "react";
import { type Address } from "viem";
import { deployment } from "../chain/config";
import { useWallet, pastVotingPower, publicClient, formatGOV } from "../chain/wallet";
import { assertWritable, currentProposalState, governorAbi, originalActions, sendGovernor } from "../chain/transactions";
import { useTransaction } from "../chain/useTransaction";
import type { FixtureContext, Proposal } from "../data/proposals";
import TransactionStatus from "./TransactionStatus";

export default function ProposalActions({ proposal, context }: { proposal: Proposal; context: FixtureContext }) {
  const wallet = useWallet();
  const transaction = useTransaction();
  const [support, setSupport] = useState("1");
  const [hasVoted, setHasVoted] = useState<boolean | null>(null);
  const [snapshotPower, setSnapshotPower] = useState<bigint | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const writable = Boolean(context.dataKind === "chain" && deployment && wallet.account && wallet.chainId === deployment.chainId);

  useEffect(() => {
    setHasVoted(null); setSnapshotPower(null); setReadError(null);
    if (!writable || !deployment || !publicClient || !wallet.account) return;
    let active = true;
    Promise.all([
      publicClient.readContract({ address: deployment.governor, abi: governorAbi, functionName: "hasVoted", args: [BigInt(proposal.proposalId), wallet.account] }) as Promise<boolean>,
      publicClient.getBlock(),
    ]).then(async ([voted, block]) => {
      if (active) setHasVoted(voted);
      if (block.timestamp > BigInt(proposal.snapshot)) {
        const power = await pastVotingPower(wallet.account as Address, proposal.snapshot);
        if (active) setSnapshotPower(power);
      }
    }).catch(() => { if (active) setReadError("Không đọc được quyền biểu quyết tại snapshot."); });
    return () => { active = false; };
  }, [writable, wallet.account, proposal.proposalId, proposal.snapshot]);

  const act = async (kind: "vote" | "cancel" | "queue" | "execute") => {
    setActionError(null);
    try {
      assertWritable(wallet.account, wallet.chainId, context);
      const expected = { vote: 1, cancel: 0, queue: 4, execute: 5 }[kind];
      if (await currentProposalState(proposal.proposalId) !== expected) throw new Error("Trạng thái on-chain đã thay đổi. Tải lại trang trước khi thao tác.");
      if (kind === "vote") {
        if (hasVoted) throw new Error("Ví này đã bỏ phiếu cho proposal.");
        await transaction.run(() => sendGovernor(wallet.account!, "castVote", [BigInt(proposal.proposalId), Number(support)]));
      } else {
        const args = originalActions(proposal);
        if (kind === "cancel" && proposal.proposer.toLowerCase() !== wallet.account!.toLowerCase()) throw new Error("Chỉ creator được hủy proposal Pending.");
        if (kind === "execute") {
          const block = await publicClient!.getBlock();
          if (!proposal.operation?.eta || block.timestamp < BigInt(proposal.operation.eta)) throw new Error("Chưa tới ETA để execute.");
        }
        await transaction.run(() => sendGovernor(wallet.account!, kind, args));
      }
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Không thể gửi giao dịch."); }
  };

  return <div className="proposal-actions">
    <h3>Thao tác quản trị</h3>
    <p className="muted">Quyền biểu quyết của ví tại snapshot: {formatGOV(snapshotPower)}{hasVoted === true ? " · Đã bỏ phiếu" : ""}</p>
    {readError && <p className="wallet-error" role="alert">{readError}</p>}
    {!writable && <p className="notice">Cần dữ liệu chain, deployment thật và ví đúng mạng để thao tác. Fixture không thể gửi giao dịch.</p>}
    {proposal.state === "Active" && <div className="action-row">
      <label className="field-label" htmlFor="vote-support">Lựa chọn phiếu</label>
      <select id="vote-support" className="field-control" value={support} onChange={(event) => setSupport(event.target.value)}><option value="1">For</option><option value="0">Against</option><option value="2">Abstain</option></select>
      <button className="button-primary" type="button" disabled={!writable || hasVoted !== false || transaction.phase === "signing" || transaction.phase === "confirming"} onClick={() => void act("vote")}>Bỏ phiếu</button>
    </div>}
    {proposal.state === "Pending" && <button className="button-secondary" type="button" disabled={!writable || proposal.proposer.toLowerCase() !== wallet.account?.toLowerCase()} onClick={() => void act("cancel")}>Hủy đề xuất</button>}
    {proposal.state === "Succeeded" && <button className="button-primary" type="button" disabled={!writable} onClick={() => void act("queue")}>Queue</button>}
    {proposal.state === "Queued" && <button className="button-primary" type="button" disabled={!writable || proposal.operation?.status !== "Ready"} onClick={() => void act("execute")}>Execute</button>}
    {actionError && <p className="wallet-error" role="alert">{actionError}</p>}
    <TransactionStatus {...transaction} />
    {transaction.phase === "success" && <p className="notice">Giao dịch đã xác nhận. Tải lại sau khi API index tới block mới để xem trạng thái cập nhật.</p>}
  </div>;
}
