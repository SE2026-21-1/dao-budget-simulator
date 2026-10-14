import { useState } from "react";
import { Link } from "react-router";

import {
  mockProposals,
  proposalStatuses,
} from "../data/mockProposals";

const PAGE_SIZE = 20;

function ProposalListPage() {
  // Trạng thái tìm kiếm
  const [search, setSearch] = useState("");

  // Trạng thái bộ lọc
  const [status, setStatus] = useState("ALL");

  // Trang hiện tại
  const [page, setPage] = useState(1);

  // Lọc dữ liệu
  const filteredProposals = mockProposals.filter(
    (proposal) => {
      const matchSearch = proposal.proposalId.includes(
        search.trim()
      );

      const matchStatus =
        status === "ALL" || proposal.status === status;

      return matchSearch && matchStatus;
    }
  );

  // Tính tổng số trang
  const totalPages = Math.max(
    1,
    Math.ceil(filteredProposals.length / PAGE_SIZE)
  );

  // Xác định vị trí bắt đầu của trang
  const startIndex = (page - 1) * PAGE_SIZE;

  // Lấy 20 proposal cho trang hiện tại
  const currentProposals = filteredProposals.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  return (
    <div>
      <h2 className="text-3xl font-bold text-slate-800">
        Danh sách đề xuất
      </h2>

      <p className="mt-2 text-gray-500">
        Danh sách các đề xuất chi ngân sách DAO.
      </p>

      {/* Khu vực tìm kiếm và lọc */}
      <div className="mt-6 flex flex-wrap gap-4">

        {/* Tìm kiếm */}
        <input
          type="text"
          placeholder="Tìm theo Proposal ID..."
          aria-label="Tìm theo Proposal ID"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-4 py-3"
        />

        {/* Lọc trạng thái */}
        <select
          aria-label="Lọc trạng thái"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 bg-white px-4 py-3"
        >
          <option value="ALL">
            Tất cả trạng thái
          </option>

          {proposalStatuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

      </div>

      {/* Hiển thị số lượng kết quả */}
      <p className="mt-5 text-sm text-gray-500">
        Tìm thấy {filteredProposals.length} đề xuất
      </p>

      {/* Danh sách Proposal */}
      <div className="mt-4 space-y-4">

        {currentProposals.map((proposal) => (
          <div
            key={proposal.proposalId}
            className="rounded-xl bg-white p-6 shadow-sm"
          >

            <h3 className="text-xl font-bold">
              Proposal #{proposal.proposalId}
            </h3>

            <p className="mt-2 text-gray-600">
              {proposal.title}
            </p>

            <p className="mt-2">
              Trạng thái: {proposal.status}
            </p>

            <p className="mt-2">
              Số tiền:{" "}
              {(
                BigInt(proposal.amount) /
                10n ** 18n
              ).toLocaleString("vi-VN")}{" "}
              BUD
            </p>

            <Link
              to={`/proposals/${proposal.proposalId}`}
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Xem chi tiết
            </Link>

          </div>
        ))}

        {/* Danh sách rỗng */}
        {currentProposals.length === 0 && (
          <div className="rounded-xl bg-white p-6 text-gray-500">
            Không tìm thấy đề xuất nào.
          </div>
        )}

      </div>

      {/* Phân trang */}
      <div className="mt-8 flex items-center justify-between gap-4">

        <button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          className="rounded-lg bg-gray-300 px-5 py-3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trang trước
        </button>

        <span className="font-medium">
          Trang {page} / {totalPages}
        </span>

        <button
          disabled={page === totalPages}
          onClick={() => setPage(page + 1)}
          className="rounded-lg bg-blue-600 px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trang sau
        </button>

      </div>
    </div>
  );
}

export default ProposalListPage;