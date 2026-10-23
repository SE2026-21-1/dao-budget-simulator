import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import DashboardPage from "./pages/DashboardPage";
import ProposalListPage from "./pages/ProposalListPage";
import ProposalDetailPage from "./pages/ProposalDetailPage";
import CreateProposalPage from "./pages/CreateProposalPage";

const navigation = [
  { to: "/", label: "Tổng quan", number: "01", end: true },
  { to: "/proposals", label: "Đề xuất", number: "02", end: true },
  { to: "/proposals/new", label: "Tạo đề xuất", number: "03", end: true },
];

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
        <header className="topbar">
          <div className="brand" aria-label="DAO Budget Simulator">
            <span className="brand__mark" aria-hidden="true"><span /></span>
            <span>DAO <strong>Budget Simulator</strong></span>
          </div>
          <div className="topbar__right">
            <span className="topbar__context">Bảng điều khiển ngân sách</span>
            <span className="connection-status"><span aria-hidden="true" /> Chưa kết nối ví</span>
          </div>
        </header>
        <aside className="sidebar">
          <div className="workspace-card">
            <span className="workspace-card__avatar" aria-hidden="true">D</span>
            <span><strong>DAO Budget</strong><small>Không gian mô phỏng</small></span>
          </div>
          <p className="sidebar__label">KHÁM PHÁ</p>
          <nav className="navigation" aria-label="Điều hướng chính">
            {navigation.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `navigation__link${isActive ? " navigation__link--active" : ""}`}>
                <span className="navigation__number" aria-hidden="true">{item.number}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar__bottom">
            <div className="sidebar-note">
              <span className="sidebar-note__symbol" aria-hidden="true">✳</span>
              <strong>Minh bạch từng đề xuất.</strong>
              <p>Khám phá dữ liệu ngân sách DAO trong môi trường mô phỏng.</p>
            </div>
          </div>
        </aside>
        <main className="page-container" id="main-content" tabIndex={-1}>
          <div className="demo-banner" role="note">
            <span className="demo-banner__dot" aria-hidden="true" />
            <strong>Dữ liệu mô phỏng</strong>
            <span>Giao diện dùng fixture BE01; API, ví và blockchain chưa kết nối.</span>
          </div>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/proposals" element={<ProposalListPage />} />
            <Route path="/proposals/new" element={<CreateProposalPage />} />
            <Route path="/proposals/:id" element={<ProposalDetailPage />} />
            <Route path="*" element={<div className="panel"><h1>Không tìm thấy trang</h1><p>Đường dẫn này không tồn tại.</p></div>} />
          </Routes>
          <footer className="site-footer">DAO Budget Simulator <span>·</span> Bản giao diện đang phát triển</footer>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
