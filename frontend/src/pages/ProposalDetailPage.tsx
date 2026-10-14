import { Link, useParams } from "react-router";

import { mockProposals } from "../data/mockProposals";

// Hàm chuyển số tiền BUD từ đơn vị nhỏ nhất
// sang dạng dễ đọc cho người dùng.
function formatBUD(rawAmount: string) {
  const decimals = 10n ** 18n;
  const amount = BigInt(rawAmount);

  const whole = amount / decimals;
  const remainder = amount % decimals;

  const fraction = remainder
    .toString()
    .padStart(18, "0")
    .replace(/0+$/, "");

  const wholeText = whole.toLocaleString("vi-VN");

  return (
    wholeText +
    (fraction ? "," + fraction : "") +
    " BUD"
  );
}

// Hàm rút gọn địa chỉ ví để hiển thị.
function shortAddress(address: string) {
  return (
    address.slice(0, 8) +
    "..." +
    address.slice(-6)
  );
}

function ProposalDetailPage() {

  // Lấy Proposal ID từ đường dẫn URL.
  const { id } = useParams();

  // Tìm proposal tương ứng trong danh sách.
  const proposal = mockProposals.find(
    (item) => item.proposalId === id
  );

  // Nếu không tìm thấy proposal.
  if (!proposal) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm">

        <h2 className="text-2xl font-bold text-red-600">
          Không tìm thấy đề xuất
        </h2>

        <p className="mt-3 text-gray-500">
          Proposal ID không tồn tại trong hệ thống.
        </p>

        <Link
          to="/proposals"
          className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-3 text-white"
        >
          Quay lại danh sách
        </Link>

      </div>
    );
  }

  // Nếu tìm thấy, hiển thị thông tin proposal.
  return (
    <div>

      {/* Nút quay lại */}
      <Link
        to="/proposals"
        className="mb-5 inline-block text-blue-600 hover:underline"
      >
        ← Quay lại danh sách
      </Link>

      {/* Tiêu đề */}
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-slate-800">
          Chi tiết đề xuất #{proposal.proposalId}
        </h2>

        <p className="mt-2 text-gray-500">
          Thông tin chi tiết của Proposal
        </p>
      </div>

      {/* Thông tin Proposal */}
      <div className="rounded-xl bg-white p-6 shadow-sm">

        <div className="flex flex-wrap items-center justify-between gap-3">

          <h3 className="text-2xl font-bold">
            {proposal.title}
          </h3>

          <span className="rounded-lg bg-blue-100 px-4 py-2 font-medium text-blue-700">
            {proposal.status}
          </span>

        </div>

        <hr className="my-6 border-gray-200" />

        {/* Số tiền */}
        <div className="mb-6">
          <p className="text-gray-500">
            Số tiền đề xuất
          </p>

          <p className="mt-2 text-3xl font-bold text-blue-600">
            {formatBUD(proposal.amount)}
          </p>
        </div>

        {/* Người tạo */}
        <div className="mb-6">
          <p className="font-medium text-gray-500">
            Người tạo đề xuất
          </p>

          <p
            className="mt-2 break-all font-medium"
            title={proposal.proposer}
          >
            {shortAddress(proposal.proposer)}
          </p>
        </div>

        {/* Người nhận */}
        <div className="mb-6">
          <p className="font-medium text-gray-500">
            Địa chỉ nhận BUD
          </p>

          <p
            className="mt-2 break-all font-medium"
            title={proposal.recipient}
          >
            {shortAddress(proposal.recipient)}
          </p>
        </div>

        {/* Mô tả */}
        <div className="mb-6">
          <p className="font-medium text-gray-500">
            Mô tả đề xuất
          </p>

          <p className="mt-2 whitespace-pre-wrap text-gray-700">
            {proposal.description}
          </p>
        </div>

        <hr className="my-6 border-gray-200" />

        {/* Thông báo dữ liệu giả */}
        <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">

          Đây là dữ liệu mô phỏng.

          <p className="mt-2">
            Chức năng bỏ phiếu, Queue, Execute và Cancel
            sẽ được tích hợp với blockchain ở các bước sau.
          </p>

        </div>

      </div>
    </div>
  );
}

export default ProposalDetailPage;