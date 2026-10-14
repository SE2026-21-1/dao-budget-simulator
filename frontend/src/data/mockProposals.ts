// Các trạng thái của Proposal
export const proposalStatuses = [
  "Pending",
  "Active",
  "Succeeded",
  "Defeated",
  "Queued",
  "Executed",
  "Canceled",
] as const;

// Kiểu dữ liệu cho một Proposal
export interface Proposal {
  proposalId: string;
  title: string;
  description: string;
  amount: string;
  status: string;
  proposer: string;
  recipient: string;
}

// Các tiêu đề mẫu
const titles = [
  "Mua thiết bị cho nhóm",
  "Chi phí Marketing",
  "Phát triển website DAO",
  "Tổ chức sự kiện cộng đồng",
  "Nâng cấp hệ thống",
];

// Tạo 45 Proposal giả
export const mockProposals: Proposal[] = Array.from(
  { length: 45 },
  (_, index) => {
    const id = index + 101;

    const amountBUD = (index % 5 + 1) * 100;

    return {
      proposalId: id.toString(),

      title: titles[index % titles.length],

      description:
        "Đề xuất sử dụng ngân sách cho các hoạt động của DAO.",

      // BUD có 18 decimals.
      // Lưu số tiền bằng chuỗi số nguyên.
      amount: (
        BigInt(amountBUD) * 10n ** 18n
      ).toString(),

      status:
        proposalStatuses[index % proposalStatuses.length],

      proposer:
        "0x2222222222222222222222222222222222222222",

      recipient:
        "0x1111111111111111111111111111111111111111",
    };
  }
);