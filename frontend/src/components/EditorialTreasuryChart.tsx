import { useState } from "react";

interface DataPoint {
  date: string;
  value: number;
  label: string;
}

const defaultChartData: DataPoint[] = [
  { date: "24 Thg 2", value: 680000, label: "$680,000" },
  { date: "28 Thg 2", value: 1050000, label: "$1,050,000" },
  { date: "4 Thg 3", value: 1420000, label: "$1,420,000" },
  { date: "8 Thg 3", value: 1980000, label: "$1,980,000" },
  { date: "12 Thg 3", value: 1720000, label: "$1,720,000" },
  { date: "16 Thg 3", value: 2450000, label: "$2,450,000" },
  { date: "20 Thg 3", value: 2310000, label: "$2,310,000" },
  { date: "24 Thg 3", value: 2842590, label: "$2,842,590" },
];

export default function EditorialTreasuryChart() {
  const [data] = useState<DataPoint[]>(defaultChartData);
  const [hoverIndex, setHoverIndex] = useState<number>(data.length - 1);
  const [filter, setFilter] = useState("Số dư kho bạc");

  const width = 640;
  const height = 220;
  const paddingLeft = 52;
  const paddingRight = 30;
  const paddingTop = 36;
  const paddingBottom = 34;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;
  const maxY = 4000000;

  const points = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1)) * chartW;
    const y = paddingTop + chartH - (d.value / maxY) * chartH;
    return { x, y, ...d };
  });

  // Construct smooth spline path
  const pathD = points.reduce((acc, pt, i, arr) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = arr[i - 1];
    const cpX1 = prev.x + (pt.x - prev.x) / 2;
    const cpY1 = prev.y;
    const cpX2 = prev.x + (pt.x - prev.x) / 2;
    const cpY2 = pt.y;
    return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${pt.x} ${pt.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${paddingTop + chartH} L ${points[0].x} ${paddingTop + chartH} Z`;
  const activePt = points[hoverIndex] ?? points[points.length - 1];

  const yTicks = [
    { label: "$4.0M", val: 4000000 },
    { label: "$3.0M", val: 3000000 },
    { label: "$2.0M", val: 2000000 },
    { label: "$1.0M", val: 1000000 },
    { label: "$0", val: 0 },
  ];

  return (
    <div className="editorial-card treasury-chart-card">
      <div className="editorial-card__header">
        <div>
          <h2 className="editorial-card__title">Biểu đồ ngân quỹ</h2>
          <p className="editorial-card__subtitle">Biến động số dư kho bạc theo thời gian</p>
        </div>
        <div className="editorial-dropdown">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="editorial-select"
            aria-label="Chọn góc nhìn biểu đồ"
          >
            <option value="Số dư kho bạc">Số dư kho bạc</option>
            <option value="Dòng tiền vào">Dòng tiền vào</option>
            <option value="Dòng tiền ra">Dòng tiền ra</option>
          </select>
        </div>
      </div>

      <div className="treasury-chart__svg-wrap">
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          className="treasury-chart__svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="treasuryAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0E7759" stopOpacity="0.18" />
              <stop offset="70%" stopColor="#10B981" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.00" />
            </linearGradient>
            <filter id="tooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* Grid lines */}
          {yTicks.map((tick) => {
            const y = paddingTop + chartH - (tick.val / maxY) * chartH;
            return (
              <g key={tick.label} className="chart-grid-line">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#E8E4DB"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="chart-axis-text"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaD} fill="url(#treasuryAreaGrad)" />

          {/* Main Spline line */}
          <path
            d={pathD}
            fill="none"
            stroke="#0E7759"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive points */}
          {points.map((pt, i) => (
            <g key={pt.date} onClick={() => setHoverIndex(i)} onMouseEnter={() => setHoverIndex(i)} style={{ cursor: "pointer" }}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r="12"
                fill="transparent"
              />
              <circle
                cx={pt.x}
                cy={pt.y}
                r={hoverIndex === i ? "5.5" : "3.5"}
                fill={hoverIndex === i ? "#0E7759" : "#FFFFFF"}
                stroke="#0E7759"
                strokeWidth={hoverIndex === i ? "2.5" : "2"}
                className="chart-data-dot"
              />
            </g>
          ))}

          {/* Active tooltip badge */}
          {activePt && (
            <g transform={`translate(${Math.min(width - 95, Math.max(70, activePt.x))}, ${Math.max(34, activePt.y - 32)})`}>
              <rect
                x="-46"
                y="-22"
                width="92"
                height="30"
                rx="6"
                fill="#FFFFFF"
                stroke="#E2DDD5"
                strokeWidth="1"
                filter="url(#tooltipShadow)"
              />
              <text x="0" y="-10" textAnchor="middle" className="chart-tooltip-date">
                {activePt.date}, 2025
              </text>
              <text x="0" y="3" textAnchor="middle" className="chart-tooltip-value">
                {activePt.label}
              </text>
            </g>
          )}

          {/* X Axis dates */}
          {points.map((pt) => (
            <text
              key={pt.date}
              x={pt.x}
              y={height - 10}
              textAnchor="middle"
              className="chart-axis-text"
            >
              {pt.date}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
