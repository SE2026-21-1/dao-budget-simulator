import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
} from "react-router";

import DashboardPage from "./pages/DashboardPage";
import ProposalListPage from "./pages/ProposalListPage";
import ProposalDetailPage from "./pages/ProposalDetailPage";
import CreateProposalPage from "./pages/CreateProposalPage";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100">

        {/* Header */}
        <header className="bg-slate-900 px-6 py-5 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">

            <h1 className="text-2xl font-bold">
              DAO Budget Simulator
            </h1>

            <button
              disabled
              className="cursor-not-allowed rounded-lg bg-blue-600 px-5 py-2 font-medium opacity-70"
            >
              Kết nối ví
            </button>

          </div>
        </header>

        <main className="mx-auto max-w-6xl p-6">

          {/* Menu điều hướng */}
          <nav className="mb-6 flex flex-wrap gap-3">

            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `rounded-lg px-5 py-3 font-medium ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-700"
                }`
              }
            >
              Dashboard
            </NavLink>

            <NavLink
              to="/proposals"
              className={({ isActive }) =>
                `rounded-lg px-5 py-3 font-medium ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-700"
                }`
              }
            >
              Danh sách đề xuất
            </NavLink>

            <NavLink
              to="/proposals/new"
              className={({ isActive }) =>
                `rounded-lg px-5 py-3 font-medium ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-700"
                }`
              }
            >
              Tạo đề xuất
            </NavLink>

          </nav>

          {/* Các màn hình */}
          <Routes>
            <Route
              path="/"
              element={<DashboardPage />}
            />

            <Route
              path="/proposals"
              element={<ProposalListPage />}
            />

            <Route
              path="/proposals/new"
              element={<CreateProposalPage />}
            />

            <Route
              path="/proposals/:id"
              element={<ProposalDetailPage />}
            />
          </Routes>

        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;