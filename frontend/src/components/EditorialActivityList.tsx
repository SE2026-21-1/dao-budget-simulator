import { Link } from "react-router";

interface Activity {
  id: string;
  type: "success" | "danger" | "info" | "deposit";
  title: string;
  subtitle: string;
  timeAgo: string;
  link?: string;
}

const defaultActivities: Activity[] = [
  {
    id: "127",
    type: "success",
    title: "Đề xuất #127 đã được thông qua",
    subtitle: "Phát triển công cụ phân tích on-chain",
    timeAgo: "1 ngày trước",
    link: "/proposals",
  },
  {
    id: "124",
    type: "danger",
    title: "Bỏ phiếu kết thúc cho đề xuất #124",
    subtitle: "Chiến dịch truyền thông Q2/2025",
    timeAgo: "2 ngày trước",
    link: "/proposals",
  },
  {
    id: "126",
    type: "info",
    title: "Đề xuất #126 đang được thảo luận",
    subtitle: "Chương trình tài trợ dự án khí hậu",
    timeAgo: "2 ngày trước",
    link: "/proposals",
  },
  {
    id: "grant",
    type: "deposit",
    title: "Kho bạc nhận 500,000 USDC",
    subtitle: "Từ Ethereum Foundation Grant",
    timeAgo: "4 ngày trước",
    link: "/proposals",
  },
  {
    id: "125",
    type: "success",
    title: "Đề xuất #125 đã được thông qua",
    subtitle: "Audit bảo mật cho smart contract",
    timeAgo: "3 ngày trước",
    link: "/proposals",
  },
];

export default function EditorialActivityList({ activities = defaultActivities }: { activities?: Activity[] }) {
  return (
    <div className="editorial-card activity-card">
      <div className="editorial-card__header">
        <h2 className="editorial-card__title">Hoạt động quản trị</h2>
        <Link to="/proposals" className="editorial-card__action">
          Xem tất cả <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="activity-list">
        {activities.map((act) => {
          let iconBg = "#DEF7EC";
          let iconColor = "#0E7759";
          let iconSvg = (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          );

          if (act.type === "danger") {
            iconBg = "#FDE8E8";
            iconColor = "#E02424";
            iconSvg = (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            );
          } else if (act.type === "info") {
            iconBg = "#E1EFFE";
            iconColor = "#2563EB";
            iconSvg = (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            );
          } else if (act.type === "deposit") {
            iconBg = "#EBF8F2";
            iconColor = "#0E7759";
            iconSvg = (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            );
          }

          return (
            <div key={`${act.id}-${act.title}`} className="activity-item">
              <div
                className="activity-item__icon"
                style={{ backgroundColor: iconBg, color: iconColor }}
              >
                {iconSvg}
              </div>
              <div className="activity-item__content">
                <p className="activity-item__title">{act.title}</p>
                <p className="activity-item__subtitle">{act.subtitle}</p>
              </div>
              <span className="activity-item__time">{act.timeAgo}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
