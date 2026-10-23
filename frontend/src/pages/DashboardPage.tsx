import { Link } from "react-router";
import FixtureLoadState from "../components/FixtureLoadState";
import { useProposalFixtures } from "../data/useProposalFixtures";

const stats = [
  "Số dư Treasury",
  "Tổng đề xuất",
  "Đã thực thi",
  "Tổng BUD đã chi",
];

function DashboardPage() {
  const { state, retry, simulateError } = useProposalFixtures();
  return (
    <div>
      <div className="page-heading">
        <div>
          <p className="page-heading__eyebrow">Tổng quan · Màn hình 01</p>
          <h1>Ngân sách DAO</h1>
          <p className="page-heading__description">Theo dõi quỹ, đề xuất và hoạt động quản trị tại một nơi.</p>
        </div>
        <Link to="/proposals" className="button-primary">Xem đề xuất</Link>
      </div>

      <div className="stats-grid" aria-label="Các chỉ số tổng quan">
        {stats.map((label) => (
          <div className="stat-card" key={label}>
            <p className="stat-card__label">{label}</p>
            <p className="stat-card__value">—</p>
            <p className="stat-card__hint">Chờ dữ liệu từ API</p>
          </div>
        ))}
      </div>

      <div className="overview-grid">
        <section className="panel">
          <div className="panel__header">
            <h2>Đề xuất gần đây</h2>
            <Link to="/proposals" className="back-link" style={{ marginBottom: 0 }}>Xem tất cả</Link>
          </div>
          <div className="proposal-list">
            {state.status !== "success" ? <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} /> : state.collection.proposals.length === 0 ? <div className="empty-state">Chưa có đề xuất trong dữ liệu fixture.</div> : state.collection.proposals.slice(0, 3).map((proposal) => (
              <Link className="proposal-row" to={`/proposals/${proposal.proposalId}`} key={proposal.proposalId}>
                <div className="proposal-row__main">
                  <span className="eyebrow">#{proposal.proposalId} · Fixture</span>
                  <p className="proposal-row__title">{proposal.title}</p>
                </div>
                <span className="status-pill">{proposal.state}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel__header"><h2>Quy trình một khoản chi</h2></div>
          <ol className="step-list">
            <li>Tạo đề xuất có một khoản chi BUD.</li>
            <li>Thành viên bỏ phiếu trong kỳ voting.</li>
            <li>Đề xuất thành công được queue.</li>
            <li>Sau timelock, gửi giao dịch execute.</li>
          </ol>
          <p className="notice" style={{ marginTop: 20 }}>Queue và hết thời gian chờ không tự chuyển tiền; phải gọi execute qua Governor.</p>
        </section>
      </div>
    </div>
  );
}

export default DashboardPage;
