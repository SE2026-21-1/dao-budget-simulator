import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import DashboardPage from "./pages/DashboardPage";
import ProposalListPage from "./pages/ProposalListPage";
import ProposalDetailPage from "./pages/ProposalDetailPage";
import CreateProposalPage from "./pages/CreateProposalPage";

const navigation = [
  { to: "/", label: "Tổng quan", end: true },
  { to: "/proposals", label: "Đề xuất", end: true },
  { to: "/proposals/new", label: "Tạo đề xuất", end: true },
];

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>
        <header className="site-header">
          <div className="site-header__inner">
            <div className="brand">
              <span className="brand__mark" aria-hidden="true">D</span>
              <div>
                <p className="brand__name">DAO Budget Simulator</p>
                <p className="brand__caption">Bảng điều khiển ngân sách</p>
              </div>
            </div>
            <div className="header-status" aria-label="Trạng thái kết nối">
              <span className="header-status__dot" aria-hidden="true" />
              <span>Chưa kết nối ví</span>
            </div>
          </div>
        </header>

        <div className="navigation-wrap">
          <nav className="navigation" aria-label="Điều hướng chính">
            {navigation.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}
                className={({ isActive }) => `navigation__link${isActive ? " navigation__link--active" : ""}`}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="page-container" id="main-content" tabIndex={-1}>
          <div className="demo-banner" role="note">
            <strong>Môi trường mô phỏng</strong>
            <span>Dữ liệu hiện là fixture. Chưa kết nối API, ví hay blockchain.</span>
          </div>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/proposals" element={<ProposalListPage />} />
            <Route path="/proposals/new" element={<CreateProposalPage />} />
            <Route path="/proposals/:id" element={<ProposalDetailPage />} />
            <Route path="*" element={<div className="panel"><h1>Không tìm thấy trang</h1><p>Đường dẫn này không tồn tại.</p></div>} />
          </Routes>
        </main>
        <footer className="site-footer">DAO Budget Simulator · Bản giao diện đang phát triển</footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
