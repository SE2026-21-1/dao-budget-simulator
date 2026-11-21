import FixtureLoadState from "../components/FixtureLoadState";
import TreasurySection from "../components/TreasurySection";
import SnapshotInfo from "../components/SnapshotInfo";
import { useProposalFixtures } from "../data/useProposalFixtures";

export default function TreasuryPage() {
  const { state, retry, simulateError, refreshing, refreshError, snapshotSignal, invalidateSnapshot } = useProposalFixtures();
  return <div className="editorial-page-view">
    <header className="editorial-page-header"><div><h1 className="editorial-title">Treasury</h1><p className="editorial-description">Số dư và dòng tiền BUD tại cùng snapshot đã xuất bản.</p></div></header>
    {refreshing && <p role="status">Đang tải snapshot mới nhất…</p>}
    {refreshError && <p className="wallet-error" role="alert">{refreshError}</p>}
    {state.status === "success" ? <>
      <button type="button" className="button-secondary" onClick={retry}>Tải dữ liệu mới nhất</button>
      <SnapshotInfo context={state.collection.context} />
      <TreasurySection context={state.collection.context} snapshotSignal={snapshotSignal!} onConfirmed={retry} onSnapshotError={invalidateSnapshot} />
    </> :
      <FixtureLoadState status={state.status} message={state.status === "error" ? state.message : undefined} retry={retry} simulateError={simulateError} />}
  </div>;
}
