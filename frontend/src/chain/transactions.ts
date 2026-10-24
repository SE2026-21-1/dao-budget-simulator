import { decodeErrorResult, decodeEventLog, decodeFunctionData, encodeFunctionData, isAddress, keccak256, parseUnits, toHex, type Abi, type Address, type Hash, type Hex } from "viem";
import governorAbiJson from "../abi/BudgetGovernor.json";
import treasuryAbiJson from "../abi/Treasury.json";
import type { Proposal, FixtureContext } from "../data/proposals";
import { deployment } from "./config";
import { publicClient, walletClient } from "./wallet";

export const governorAbi = governorAbiJson as Abi;
export const treasuryAbi = treasuryAbiJson as Abi;

export type TransactionPhase = "idle" | "signing" | "submitted" | "confirming" | "success" | "reverted" | "error";

export function assertWritable(account: Address | null, chainId: number | null, context?: FixtureContext) {
  if (!deployment || !publicClient) throw new Error("Chưa cấu hình deployment thật trong .env.");
  if (!account) throw new Error("Hãy kết nối ví trước.");
  if (chainId !== deployment.chainId) throw new Error("Ví đang ở sai mạng.");
  if (!context || context.dataKind !== "chain") throw new Error("Dữ liệu fixture không cho phép gửi giao dịch.");
  if (context.chainId !== String(deployment.chainId) || context.deploymentId !== deployment.deploymentId) {
    throw new Error("Dữ liệu API không khớp deployment đã cấu hình.");
  }
}

export async function sendGovernor(account: Address, functionName: string, args: readonly unknown[]): Promise<Hash> {
  await verifyDeployment();
  if (!deployment) throw new Error("Thiếu cấu hình deployment.");
  const data = encodeFunctionData({ abi: governorAbi, functionName, args });
  return walletClient().sendTransaction({ account, to: deployment.governor, data });
}

export async function verifyDeployment(): Promise<void> {
  if (!deployment || !publicClient) throw new Error("Thiếu cấu hình deployment.");
  const [rpcChainId, governorCode, treasuryCode, govCode, budCode, governorTreasury, governorToken, treasuryToken] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBytecode({ address: deployment.governor }),
    publicClient.getBytecode({ address: deployment.treasury }),
    publicClient.getBytecode({ address: deployment.govToken }),
    publicClient.getBytecode({ address: deployment.budToken }),
    publicClient.readContract({ address: deployment.governor, abi: governorAbi, functionName: "treasury" }),
    publicClient.readContract({ address: deployment.governor, abi: governorAbi, functionName: "token" }),
    publicClient.readContract({ address: deployment.treasury, abi: treasuryAbi, functionName: "budgetToken" }),
  ]);
  if (rpcChainId !== deployment.chainId || !governorCode || governorCode === "0x" || !treasuryCode || treasuryCode === "0x" || !govCode || govCode === "0x" || !budCode || budCode === "0x" ||
      String(governorTreasury).toLowerCase() !== deployment.treasury.toLowerCase() ||
      String(governorToken).toLowerCase() !== deployment.govToken.toLowerCase() ||
      String(treasuryToken).toLowerCase() !== deployment.budToken.toLowerCase()) {
    throw new Error("RPC hoặc địa chỉ contract không khớp deployment đã cấu hình.");
  }
}

export async function waitForReceipt(hash: Hash): Promise<void> {
  if (!publicClient) throw new Error("Thiếu RPC để kiểm tra giao dịch.");
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Giao dịch đã lên chain nhưng bị revert.");
}

export async function currentProposalState(proposalId: string): Promise<number> {
  if (!publicClient || !deployment) throw new Error("Thiếu RPC để kiểm tra trạng thái proposal.");
  const state = await publicClient.readContract({ address: deployment.governor, abi: governorAbi, functionName: "state", args: [BigInt(proposalId)] });
  return Number(state);
}

export function originalActions(proposal: Proposal): [Address[], bigint[], Hex[], Hex] {
  if (!deployment || proposal.targets?.length !== 1 || proposal.values?.length !== 1 || proposal.calldatas?.length !== 1 ||
      !isAddress(proposal.targets[0]) || proposal.targets[0].toLowerCase() !== deployment.treasury.toLowerCase() ||
      proposal.values[0] !== "0" || !/^0x[0-9a-f]+$/i.test(proposal.calldatas[0]) ||
      proposal.descriptionHash !== keccak256(toHex(proposal.description))) {
    throw new Error("Payload proposal không khớp Treasury/description gốc. Không thể gửi giao dịch.");
  }
  try {
    const decoded = decodeFunctionData({ abi: treasuryAbi, data: proposal.calldatas[0] as Hex });
    if (decoded.functionName !== "disburse" || !decoded.args || decoded.args[0] !== proposal.requestId ||
        String(decoded.args[1]).toLowerCase() !== proposal.recipient.toLowerCase() || String(decoded.args[2]) !== proposal.amount) {
      throw new Error("Payload disburse không khớp proposal.");
    }
  } catch { throw new Error("Payload disburse không khớp proposal."); }
  return [[proposal.targets[0]], [0n], [proposal.calldatas[0] as Hex], proposal.descriptionHash as Hex];
}

export function validateProposalForm(title: string, body: string, recipient: string, amount: string, treasury?: string): string | null {
  const titleLength = Array.from(title).length;
  const bodyLength = Array.from(body).length;
  if (titleLength < 5 || titleLength > 120) return "Tiêu đề cần 5–120 ký tự.";
  if (bodyLength < 20 || bodyLength > 2000) return "Mô tả cần 20–2.000 ký tự.";
  if (!isAddress(recipient) || /^0x0{40}$/i.test(recipient) || recipient.toLowerCase() === treasury?.toLowerCase()) return "Địa chỉ nhận không hợp lệ.";
  if (!/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(amount)) return "Số BUD cần tối đa 18 chữ số thập phân, không dùng ký hiệu khoa học.";
  try { if (parseUnits(amount, 18) <= 0n) return "Số BUD phải lớn hơn 0."; }
  catch { return "Số BUD cần tối đa 18 chữ số thập phân, không dùng ký hiệu khoa học."; }
  return null;
}

export function buildProposal(title: string, body: string, recipient: Address, amount: string, requestId: Hex, treasury: Address) {
  const error = validateProposalForm(title, body, recipient, amount, treasury);
  if (error) throw new Error(error);
  const description = JSON.stringify({ version: 1, title, body });
  const calldata = encodeFunctionData({ abi: treasuryAbi, functionName: "disburse", args: [requestId, recipient, parseUnits(amount, 18)] });
  return { targets: [treasury], values: [0n], calldatas: [calldata], description };
}

export function newRequestId(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function proposalIdFromReceipt(logs: readonly { data: Hex; topics: readonly Hex[] }[]): string | null {
  for (const log of logs) {
    try {
      const event = decodeEventLog({ abi: governorAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (event.eventName === "ProposalCreated" && event.args && typeof event.args === "object" && "proposalId" in event.args) {
        return String(event.args.proposalId);
      }
    } catch { /* Unrelated contract log. */ }
  }
  return null;
}

export function transactionErrorMessage(cause: unknown): string {
  let current: unknown = cause;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const error = current as { code?: number; data?: unknown; cause?: unknown; shortMessage?: string; message?: string };
    if (error.code === 4001 || /user rejected|user denied/i.test(error.shortMessage ?? error.message ?? "")) return "Bạn đã từ chối ký trong ví. Nội dung form vẫn được giữ lại.";
    if (typeof error.data === "string" && /^0x[0-9a-f]{8,}$/i.test(error.data)) {
      try {
        const decoded = decodeErrorResult({ abi: [...governorAbi, ...treasuryAbi], data: error.data as Hex });
        const messages: Record<string, string> = {
          InvalidTarget: "Proposal phải gửi tới Treasury đã cấu hình.",
          InvalidNativeValue: "Proposal không được gửi native token.",
          InvalidCalldata: "Calldata disburse không hợp lệ.",
          InvalidRecipient: "Địa chỉ nhận không hợp lệ.",
          InvalidAmount: "Số BUD không hợp lệ.",
          InsufficientBudget: "Treasury chưa đủ BUD. Có thể nạp thêm rồi thử lại.",
          RequestAlreadyPaid: "Khoản chi này đã được thanh toán.",
        };
        return messages[decoded.errorName] ?? `Contract từ chối giao dịch: ${decoded.errorName}.`;
      } catch { /* The wallet may return an undecodable provider error. */ }
    }
    current = error.cause;
  }
  const error = cause as { shortMessage?: string; message?: string } | null;
  return error?.shortMessage ?? error?.message ?? "Giao dịch không thành công.";
}
