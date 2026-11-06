import { useState } from "react";

export interface AllocationItem {
  name: string;
  percentage: number;
  color: string;
  amount?: string;
}

const defaultAllocations: AllocationItem[] = [
  { name: "Phát triển hệ sinh thái", percentage: 32.1, color: "#0E7759", amount: "$912,471" },
  { name: "Tài trợ cộng đồng", percentage: 24.8, color: "#D97706", amount: "$704,962" },
  { name: "Nghiên cứu & R&D", percentage: 18.6, color: "#B45309", amount: "$528,721" },
  { name: "Marketing & Giáo dục", percentage: 12.4, color: "#475569", amount: "$352,481" },
  { name: "Hoạt động vận hành", percentage: 8.7, color: "#0EA5E9", amount: "$247,305" },
  { name: "Dự phòng", percentage: 3.4, color: "#94A3B8", amount: "$96,650" },
];

export default function EditorialDonutChart({ items = defaultAllocations }: { items?: AllocationItem[] }) {
  const [activeItem, setActiveItem] = useState<AllocationItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Calculate SVG stroke dashes for donut segments
  const size = 160;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Precompute segment offsets without outer mutation
  const segments = items.reduce<Array<AllocationItem & { strokeDasharray: string; strokeDashoffset: number; endPercent: number }>>(
    (acc, item) => {
      const startPercent = acc.length === 0 ? 0 : acc[acc.length - 1].endPercent;
      const strokeDasharray = `${(item.percentage / 100) * circumference} ${circumference}`;
      const strokeDashoffset = -((startPercent / 100) * circumference);
      const endPercent = startPercent + item.percentage;
      acc.push({ ...item, strokeDasharray, strokeDashoffset, endPercent });
      return acc;
    },
    []
  );

  return (
    <div className="editorial-card allocation-card">
      <div className="editorial-card__header">
        <h2 className="editorial-card__title">Phân bổ ngân sách</h2>
      </div>

      <div className="allocation-card__body">
        <div className="allocation-donut-wrap">
          <svg className="allocation-donut-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#F2EFE9"
              strokeWidth={strokeWidth}
            />
            {segments.map((item) => {
              const isHovered = activeItem?.name === item.name;

              return (
                <circle
                  key={item.name}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={item.strokeDasharray}
                  strokeDashoffset={item.strokeDashoffset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  style={{
                    transition: "stroke-width 0.2s ease, opacity 0.2s ease",
                    cursor: "pointer",
                    opacity: activeItem && !isHovered ? 0.6 : 1,
                  }}
                  onMouseEnter={() => setActiveItem(item)}
                  onMouseLeave={() => setActiveItem(null)}
                />
              );
            })}
          </svg>

          {/* Center text */}
          <div className="allocation-donut-center">
            <strong>$2.84M</strong>
            <small>Tổng</small>
          </div>
        </div>

        {/* Legend */}
        <div className="allocation-legend">
          {items.map((item) => (
            <div
              key={item.name}
              className={`allocation-legend__item ${activeItem?.name === item.name ? "allocation-legend__item--active" : ""}`}
              onMouseEnter={() => setActiveItem(item)}
              onMouseLeave={() => setActiveItem(null)}
            >
              <div className="allocation-legend__label">
                <span className="allocation-legend__dot" style={{ backgroundColor: item.color }} />
                <span>{item.name}</span>
              </div>
              <strong className="allocation-legend__val">{item.percentage}%</strong>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="allocation-card__button"
        onClick={() => setIsModalOpen(true)}
      >
        <span>Xem chi tiết phân bổ</span>
        <span aria-hidden="true">›</span>
      </button>

      {/* Detail Modal */}
      {isModalOpen && (
        <div className="editorial-modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="editorial-modal" onClick={(e) => e.stopPropagation()}>
            <div className="editorial-modal__header">
              <h3>Chi tiết phân bổ ngân sách 2025</h3>
              <button type="button" className="editorial-modal__close" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <p className="editorial-modal__desc">Ngân sách hiện tại được phân bổ dựa trên nghị quyết quản trị thường niên của DAO.</p>
            <div className="allocation-detail-list">
              {items.map((it) => (
                <div key={it.name} className="allocation-detail-row">
                  <div>
                    <strong style={{ color: it.color }}>● {it.name}</strong>
                    <small>Tỷ trọng {it.percentage}%</small>
                  </div>
                  <span className="allocation-detail-amount">{it.amount || "—"}</span>
                </div>
              ))}
            </div>
            <button type="button" className="button-primary mt-4 w-full" onClick={() => setIsModalOpen(false)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
