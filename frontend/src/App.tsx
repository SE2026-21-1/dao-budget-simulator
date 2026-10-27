import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import DashboardPage from "./pages/DashboardPage";
import ProposalListPage from "./pages/ProposalListPage";
import ProposalDetailPage from "./pages/ProposalDetailPage";
import CreateProposalPage from "./pages/CreateProposalPage";
import WalletPanel from "./components/WalletPanel";
import { useWallet } from "./chain/wallet";
import { apiBaseUrl, configurationError, deployment } from "./chain/config";
import ApiHealth from "./components/ApiHealth";
import { LogoPrism, IconHome, IconDocument, IconTreasury } from "./components/EditorialIcons";

const navigation = [
  { to: "/", label: "Tổng quan", icon: IconHome, end: true },
  { to: "/proposals", label: "Đề xuất", icon: IconDocument, end: true },
  { to: "/proposals/new", label: "Tạo đề xuất", icon: IconTreasury, end: true },
];

function AppContent() {
  const wallet = useWallet();
  return (
    <div className="editorial-app-shell">
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      <header className="editorial-topbar">
        <div className="editorial-topbar__left">
          <NavLink to="/" className="editorial-brand" aria-label="DAO Budget Simulator - Trang chủ">
            <LogoPrism className="w-8 h-8" />
            <span className="editorial-brand__text">DAO <strong>Budget Simulator</strong></span>
          </NavLink>
        </div>
        <nav className="editorial-topbar__tabs" aria-label="Điều hướng chính">
          {navigation.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) =>
              `editorial-topbar__tab ${isActive ? "editorial-topbar__tab--active" : ""}`
            }>{label}</NavLink>
          ))}
        </nav>
        <div className="editorial-topbar__right">
          <span className="connection-status"><span aria-hidden="true" />
            {wallet.account ? `${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)}` : "Chưa kết nối ví"}
          </span>
        </div>
      </header>
      <div className="editorial-app-body">
        <aside className="editorial-sidebar">
          <div className="dao-selector-wrapper">
            <div className="dao-selector-card">
              <div className="dao-selector__avatar" aria-hidden="true"><span className="dao-selector__avatar-inner" /></div>
              <div className="dao-selector__info"><strong>DAO Budget Simulator</strong>
                <small>{deployment ? deployment.chain.name : "Dữ liệu mô phỏng"}</small></div>
            </div>
          </div>
          <nav className="editorial-nav" aria-label="Điều hướng sidebar">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) =>
                `editorial-nav__link ${isActive ? "editorial-nav__link--active" : ""}`
              }><Icon className="w-5 h-5 editorial-nav__icon" /><span>{label}</span></NavLink>
            ))}
          </nav>
          <div className="editorial-sidebar__wallet-section"><WalletPanel /></div>
          <div className="editorial-sidebar__bottom"><div className="sidebar-note"><span className="sidebar-note__mark" aria-hidden="true">DAO</span><strong>Minh bạch từng đề xuất.</strong><p>Khám phá ngân sách và cùng cộng đồng đưa ra quyết định.</p></div></div>
        </aside>
        <main className="editorial-main-content" id="main-content" tabIndex={-1}>
          <div className="demo-banner" role="note">
            <span className="demo-banner__dot" aria-hidden="true" />
            <strong>{apiBaseUrl ? "Dữ liệu API" : "Dữ liệu mô phỏng"}</strong>
            <span>{apiBaseUrl
              ? configurationError ?? "Đang đọc API BE05 theo deployment đã cấu hình; không dùng fixture khi API lỗi."
              : "Đang xem fixture BE01; giao dịch với dữ liệu này bị khóa."}</span>
          </div>
          <ApiHealth />
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/proposals" element={<ProposalListPage />} />
            <Route path="/proposals/new" element={<CreateProposalPage />} />
            <Route path="/proposals/:id" element={<ProposalDetailPage />} />
            <Route path="*" element={<div className="panel"><h1>Không tìm thấy trang</h1><p>Đường dẫn này không tồn tại.</p><NavLink to="/">Về tổng quan</NavLink></div>} />
          </Routes>
          <footer className="editorial-footer">DAO Budget Simulator · Giao diện đang phát triển</footer>
        </main>
      </div>
    </div>
  );
}

export default function App() { return <BrowserRouter><AppContent /></BrowserRouter>; }
