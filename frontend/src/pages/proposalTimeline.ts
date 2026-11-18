import type { Proposal } from "../data/proposals";

export interface TimelineMilestone {
  label: string;
  detail: string;
  phase: "complete" | "current" | "upcoming" | "terminal";
}

const timestamp = (raw?: string) => raw ? new Date(Number(BigInt(raw)) * 1000).toLocaleString("vi-VN") : "—";

export function proposalTimeline(proposal: Proposal): TimelineMilestone[] {
  const { state, transactions, operation } = proposal;
  const voteClosed = ["Succeeded", "Defeated", "Queued", "Executed"].includes(state) || Boolean(transactions?.queued || transactions?.executed);
  const succeeded = ["Succeeded", "Queued", "Executed"].includes(state) || Boolean(transactions?.queued || transactions?.executed);
  const queued = Boolean(transactions?.queued || (operation?.eta && ["Queued", "Executed"].includes(state)));
  const executed = Boolean(transactions?.executed && state === "Executed");
  const canceled = Boolean(transactions?.canceled && state === "Canceled");

  return [
    { label: "Đề xuất", detail: transactions?.created ? "Đã ghi nhận giao dịch tạo đề xuất" : "Chưa có giao dịch tạo trong snapshot", phase: transactions?.created ? "complete" : "upcoming" },
    { label: "Bỏ phiếu", detail: state === "Pending" ? `Chờ mở tại snapshot ${timestamp(proposal.snapshot)}` : state === "Active" ? `Đang diễn ra · deadline ${timestamp(proposal.deadline)}` : voteClosed ? `Đã kết thúc · deadline ${timestamp(proposal.deadline)}` : state === "Canceled" ? "Đã hủy; không có bằng chứng hoàn tất biểu quyết" : "Chưa kết thúc", phase: voteClosed ? "complete" : state === "Active" ? "current" : "upcoming" },
    { label: state === "Defeated" ? "Không thông qua" : "Thông qua", detail: state === "Defeated" ? "Đề xuất bị từ chối" : succeeded ? "Đạt điều kiện biểu quyết" : "Chưa có kết quả thông qua", phase: state === "Defeated" ? "terminal" : succeeded ? "complete" : "upcoming" },
    { label: "Xếp hàng", detail: queued ? `Đã xếp hàng · ETA ${timestamp(operation?.eta)}` : "Chưa xếp hàng", phase: queued ? "complete" : "upcoming" },
    { label: "Thực thi", detail: executed ? "Đã ghi nhận giao dịch thực thi" : "Chưa có giao dịch thực thi", phase: executed ? "complete" : "upcoming" },
    ...(state === "Canceled" ? [{ label: "Đã hủy", detail: canceled ? "Đã ghi nhận giao dịch hủy" : "Trạng thái hủy trong snapshot; chưa có hash giao dịch", phase: canceled ? "terminal" as const : "current" as const }] : []),
  ];
}
