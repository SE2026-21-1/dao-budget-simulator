import { useEffect, useState } from "react";
import { parseAbi, type Address } from "viem";
import { deployment } from "../chain/config";
import { useWallet, pastVotingPower, publicClient, formatGOV } from "../chain/wallet";
import { assertWritable, governorAbi, sendGovernor, treasuryAbi } from "../chain/transactions";
import { preflightGovernanceAction, verifyGovernanceOutcome, type GovernanceAction, type GovernanceReads } from "../chain/governanceActions";
import { useTransaction } from "../chain/useTransaction";
import type { FixtureContext, Proposal } from "../data/proposals";
import TransactionStatus from "./TransactionStatus";

const timelockAbi = parseAbi([
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function getOperationState(bytes32 operationId) view returns (uint8)",
  "function getTimestamp(bytes32 operationId) view returns (uint256)",
]);

const reads: GovernanceReads = {
  state: async (id, blockNumber) => Number(await publicClient!.readContract({ address: deployment!.governor, abi: governorAbi, functionName: "state", args: [id], blockNumber })),
  hasVoted: async (id, account, blockNumber) => Boolean(await publicClient!.readContract({ address: deployment!.governor, abi: governorAbi, functionName: "hasVoted", args: [id, account], blockNumber })),
  votingPower: (account, snapshot) => pastVotingPower(account, String(snapshot)),
  timestamp: async () => (await publicClient!.getBlock()).timestamp,
  role: async (contract, role, account) => Boolean(await publicClient!.readContract({ address: deployment![contract], abi: contract === "treasury" ? treasuryAbi : timelockAbi, functionName: "hasRole", args: [role, account] })),
  operationState: async (id, blockNumber) => Number(await publicClient!.readContract({ address: deployment!.timelock, abi: timelockAbi, functionName: "getOperationState", args: [id], blockNumber })),
  operationTimestamp: async (id, blockNumber) => BigInt(String(await publicClient!.readContract({ address: deployment!.timelock, abi: timelockAbi, functionName: "getTimestamp", args: [id], blockNumber }))),
  proposalEta: async (id, blockNumber) => BigInt(String(await publicClient!.readContract({ address: deployment!.governor, abi: governorAbi, functionName: "proposalEta", args: [id], blockNumber }))),
  paid: async (id, blockNumber) => Boolean(await publicClient!.readContract({ address: deployment!.treasury, abi: treasuryAbi, functionName: "paidRequests", args: [id], blockNumber })),
};

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

  const act = async (kind: GovernanceAction) => {
    await transaction.run(async () => {
      assertWritable(wallet.account, wallet.chainId, context);
      const action = await preflightGovernanceAction(kind, proposal, wallet.account!, support, deployment!, reads);
      return sendGovernor(wallet.account!, action.functionName, action.args);
    }, onConfirmed, (receipt) => verifyGovernanceOutcome(kind, proposal, wallet.account!, support, deployment!, reads, receipt));
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
