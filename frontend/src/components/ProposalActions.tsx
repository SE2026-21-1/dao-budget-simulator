import { useEffect, useState } from "react";
import { type Address } from "viem";
import { deployment } from "../chain/config";
import { useWallet, pastVotingPower, publicClient, formatGOV } from "../chain/wallet";
import { assertWritable, currentProposalState, governorAbi, originalActions, sendGovernor } from "../chain/transactions";
import { useTransaction } from "../chain/useTransaction";
import type { FixtureContext, Proposal } from "../data/proposals";
import TransactionStatus from "./TransactionStatus";

export default function ProposalActions({ proposal, context, onConfirmed }: { proposal: Proposal; context: FixtureContext; onConfirmed: () => void }) {
  const wallet = useWallet();
  const transaction = useTransaction();
  const [support, setSupport] = useState("1");
  const [eligibility, setEligibility] = useState<{ key: string; voted: boolean | null; power: bigint | null; error: string | null }>();
  const writable = Boolean(context.dataKind === "chain" && deployment && context.chainId === String(deployment.chainId) && context.deploymentId === deployment.deploymentId && wallet.account && wallet.chainId === deployment.chainId);
  const readKey = `${wallet.account}:${wallet.chainId}:${proposal.proposalId}:${proposal.snapshot}:${context.asOfBlock}:${transaction.phase === "success" ? transaction.hash : ""}:${writable}`;
  const hasVoted = eligibility?.key === readKey ? eligibility.voted : null;
  const snapshotPower = eligibility?.key === readKey ? eligibility.power : null;
  const readError = eligibility?.key === readKey ? eligibility.error : null;

  useEffect(() => {
    if (!writable || !deployment || !publicClient || !wallet.account) return;
    let active = true;
    Promise.all([
      publicClient.readContract({ address: deployment.governor, abi: governorAbi, functionName: "hasVoted", args: [BigInt(proposal.proposalId), wallet.account] }) as Promise<boolean>,
      publicClient.getBlock(),
    ]).then(async ([voted, block]) => {
      const power = block.timestamp > BigInt(proposal.snapshot) ? await pastVotingPower(wallet.account as Address, proposal.snapshot) : null;
      if (active) setEligibility({ key: readKey, voted, power, error: null });
    }).catch(() => { if (active) setEligibility({ key: readKey, voted: null, power: null, error: "Không đọc được quyền biểu quyết tại snapshot. Kiểm tra RPC rồi tải dữ liệu mới nhất." }); });
    return () => { active = false; };
  }, [writable, wallet.account, proposal.proposalId, proposal.snapshot, readKey]);

  const act = async (kind: "vote" | "cancel" | "queue" | "execute") => {
    await transaction.run(async () => {
      assertWritable(wallet.account, wallet.chainId, context);
      const args = originalActions(proposal, deployment!.treasury);
      const expected = { vote: 1, cancel: 0, queue: 4, execute: 5 }[kind];
      if (await currentProposalState(proposal.proposalId) !== expected) throw new Error("Trạng thái on-chain đã thay đổi. Tải dữ liệu mới nhất trước khi thao tác.");
      if (kind === "vote") {
        const voted = await publicClient!.readContract({ address: deployment!.governor, abi: governorAbi, functionName: "hasVoted", args: [BigInt(proposal.proposalId), wallet.account!] });
        if (voted) throw new Error("Ví này đã bỏ phiếu cho proposal.");
        if (await pastVotingPower(wallet.account!, proposal.snapshot) === 0n) throw new Error("Ví không có voting power tại snapshot.");
        if (!["0", "1", "2"].includes(support)) throw new Error("Lựa chọn phiếu không hợp lệ.");
        return sendGovernor(wallet.account!, "castVote", [BigInt(proposal.proposalId), Number(support)]);
      }
      if (kind === "cancel" && proposal.proposer.toLowerCase() !== wallet.account!.toLowerCase()) throw new Error("Chỉ creator được hủy proposal Pending.");
      if (kind === "execute") {
        const block = await publicClient!.getBlock();
        if (!proposal.operation?.eta || block.timestamp < BigInt(proposal.operation.eta)) throw new Error("Chưa tới ETA để execute.");
      }
      return sendGovernor(wallet.account!, kind, args);
    }, onConfirmed);
  };

  return <div className="proposal-actions">
    <h3>Thao tác quản trị</h3>
    <p className="muted">Quyền biểu quyết của ví tại snapshot: {formatGOV(snapshotPower)}{hasVoted === true ? " · Đã bỏ phiếu" : ""}</p>
    {readError && <p className="wallet-error" role="alert">{readError}</p>}
    {!writable && <p className="notice">Cần dữ liệu chain, deployment thật và ví đúng mạng để thao tác. Fixture không thể gửi giao dịch.</p>}
    {proposal.state === "Active" && <div className="action-row">
      <label className="field-label" htmlFor="vote-support">Lựa chọn phiếu</label>
      <select id="vote-support" className="field-control" value={support} onChange={(event) => setSupport(event.target.value)}><option value="1">For</option><option value="0">Against</option><option value="2">Abstain</option></select>
      <button className="button-primary" type="button" disabled={!writable || hasVoted !== false || snapshotPower === null || snapshotPower === 0n || transaction.busy} onClick={() => void act("vote")}>Bỏ phiếu</button>
    </div>}
    {proposal.state === "Pending" && <button className="button-secondary" type="button" disabled={!writable || transaction.busy || proposal.proposer.toLowerCase() !== wallet.account?.toLowerCase()} onClick={() => void act("cancel")}>Hủy đề xuất</button>}
    {proposal.state === "Succeeded" && <button className="button-primary" type="button" disabled={!writable || transaction.busy} onClick={() => void act("queue")}>Queue</button>}
    {proposal.state === "Queued" && <button className="button-primary" type="button" disabled={!writable || transaction.busy || proposal.operation?.status !== "Ready"} onClick={() => void act("execute")}>Execute</button>}
    <TransactionStatus {...transaction} />
    <p className="notice">Sau receipt, giao diện tải snapshot mới nhất đã xuất bản. Nếu indexer chưa bắt kịp, bấm Tải dữ liệu mới nhất sau khi index.</p>
  </div>;
}
