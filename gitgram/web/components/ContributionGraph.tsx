'use client';

import { useState, useRef, useEffect } from 'react';

interface Contribution {
  date: string;
  count: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  date: string;
  count: number;
}

interface ContributionGraphProps {
  contributions: Contribution[];
  year?: number;
  showLegend?: boolean;
  maxCount?: number;
  onDayClick?: (date: string, count: number) => void;
}

type ColorLevel = 0 | 1 | 2 | 3 | 4;

const CELL_SIZE = 11;
const CELL_GAP = 3;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const LEFT_OFFSET = 32;
const TOP_OFFSET = 22;
const BOTTOM_PADDING = 10;

const COLORS: Record<ColorLevel, string> = {
  0: 'var(--contribution-empty, #161b22)',
  1: '#0e4429',
  2: '#006d32',
  3: '#26a641',
  4: '#39d353',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' };

function getColorLevel(count: number, max: number): ColorLevel {
  if (count === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function formatTooltipDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildWeekGrid(contributions: Contribution[], year: number): Contribution[][] {
  const lookup = new Map<string, number>();
  for (const c of contributions) {
    lookup.set(c.date, c.count);
  }

  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  // Pad back to the Sunday before Jan 1
  const startDay = startDate.getDay(); // 0=Sun
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - startDay);

  const weeks: Contribution[][] = [];
  const cursor = new Date(gridStart);

  while (cursor <= endDate) {
    const week: Contribution[] = [];
    for (let d = 0; d < 7; d++) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const day = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const isCurrentYear = cursor.getFullYear() === year;
      week.push({
        date: dateStr,
        count: isCurrentYear ? (lookup.get(dateStr) ?? 0) : -1,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function buildMonthLabels(weeks: Contribution[][]): Array<{ label: string; colIndex: number }> {
  const labels: Array<{ label: string; colIndex: number }> = [];
  let lastMonth = -1;

  for (let w = 0; w < weeks.length; w++) {
    const week = weeks[w];
    // Use the first valid (current-year) cell in the week
    const firstValid = week.find((c) => c.count >= 0);
    if (!firstValid) continue;
    const month = Number(firstValid.date.split('-')[1]) - 1;
    if (month !== lastMonth) {
      labels.push({ label: MONTHS[month], colIndex: w });
      lastMonth = month;
    }
  }

  return labels;
}

export function ContributionGraph({
  contributions,
  year,
  showLegend = true,
  maxCount,
  onDayClick,
}: ContributionGraphProps) {
  const currentYear = year ?? new Date().getFullYear();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    date: '',
    count: 0,
  });

  const weeks = buildWeekGrid(contributions, currentYear);
  const monthLabels = buildMonthLabels(weeks);

  const derivedMax =
    maxCount ??
    Math.max(1, ...contributions.map((c) => c.count));

  const svgWidth = LEFT_OFFSET + weeks.length * CELL_STEP;
  const svgHeight = TOP_OFFSET + 7 * CELL_STEP + BOTTOM_PADDING;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerWidth = entry.contentRect.width;
        if (containerWidth > 0 && containerWidth < svgWidth) {
          setScale(containerWidth / svgWidth);
        } else {
          setScale(1);
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [svgWidth]);

  function handleMouseEnter(e: React.MouseEvent<SVGRectElement>, date: string, count: number) {
    if (count < 0) return;
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setTooltip({
      visible: true,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
      date,
      count,
    });
  }

  function handleMouseLeave() {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }

  function handleClick(date: string, count: number) {
    if (count >= 0 && onDayClick) {
      onDayClick(date, count);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden">
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{
          display: 'block',
          transformOrigin: 'top left',
          transform: scale < 1 ? `scale(${scale})` : undefined,
        }}
        aria-label={`Contribution graph for ${currentYear}`}
        role="img"
      >
        {/* Day labels */}
        {Object.entries(DAY_LABELS).map(([dayIndex, label]) => {
          const di = Number(dayIndex);
          return (
            <text
              key={label}
              x={LEFT_OFFSET - 6}
              y={TOP_OFFSET + di * CELL_STEP + CELL_SIZE - 1}
              fontSize={9}
              fill="var(--foreground-secondary, #8b949e)"
              textAnchor="end"
              dominantBaseline="auto"
            >
              {label}
            </text>
          );
        })}

        {/* Month labels */}
        {monthLabels.map(({ label, colIndex }) => (
          <text
            key={`${label}-${colIndex}`}
            x={LEFT_OFFSET + colIndex * CELL_STEP}
            y={TOP_OFFSET - 6}
            fontSize={9}
            fill="var(--foreground-secondary, #8b949e)"
          >
            {label}
          </text>
        ))}

        {/* Cells */}
        {weeks.map((week, wi) =>
          week.map((cell, di) => {
            if (cell.count < 0) return null;
            const level = getColorLevel(cell.count, derivedMax);
            const x = LEFT_OFFSET + wi * CELL_STEP;
            const y = TOP_OFFSET + di * CELL_STEP;
            return (
              <rect
                key={cell.date}
                x={x}
                y={y}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                ry={2}
                fill={COLORS[level]}
                stroke="rgba(27,31,35,0.06)"
                strokeWidth={0.5}
                style={{ cursor: onDayClick ? 'pointer' : 'default' }}
                onMouseEnter={(e) => handleMouseEnter(e, cell.date, cell.count)}
                onMouseLeave={handleMouseLeave}
                onClick={() => handleClick(cell.date, cell.count)}
                aria-label={`${cell.count} contribution${cell.count !== 1 ? 's' : ''} on ${formatTooltipDate(cell.date)}`}
              />
            );
          })
        )}
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded px-2 py-1 text-xs shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'var(--surface-secondary, #21262d)',
            color: 'var(--foreground, #c9d1d9)',
            border: '1px solid var(--border, #30363d)',
          }}
        >
          <strong>{tooltip.count}</strong>{' '}
          contribution{tooltip.count !== 1 ? 's' : ''} on {formatTooltipDate(tooltip.date)}
        </div>
      )}

      {/* Legend */}
      {showLegend && (
        <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: 'var(--foreground-secondary, #8b949e)' }}>
          <span>Less</span>
          {([0, 1, 2, 3, 4] as ColorLevel[]).map((level) => (
            <svg key={level} width={CELL_SIZE} height={CELL_SIZE} style={{ display: 'block' }}>
              <rect
                x={0}
                y={0}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                ry={2}
                fill={COLORS[level]}
                stroke="rgba(27,31,35,0.06)"
                strokeWidth={0.5}
              />
            </svg>
          ))}
          <span>More</span>
        </div>
      )}
    </div>
  );
}

export default ContributionGraph;
