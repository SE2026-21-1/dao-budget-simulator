import { Link } from "react-router";

interface Props {
  status: "loading" | "error";
  message?: string;
  retry?: () => void;
  simulateError?: boolean;
}

export default function FixtureLoadState({ status, message, retry, simulateError }: Props) {
  if (status === "loading") {
    return <div className="empty-state" role="status">Đang tải dữ liệu đề xuất mô phỏng…</div>;
  }
  return (
    <div className="empty-state empty-state--error" role="alert">
      <strong>Không tải được đề xuất.</strong>
      <p>{message}</p>
      <div className="empty-state__actions">
        <button className="button-secondary" type="button" onClick={retry}>Thử lại</button>
        {simulateError && <Link className="button-secondary" to="?">Tắt mô phỏng lỗi</Link>}
      </div>
    </div>
  );
}
