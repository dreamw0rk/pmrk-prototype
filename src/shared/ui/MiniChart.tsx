import { useState } from 'react';

/* Лёгкие SVG-графики (обёртка с тултипом «дата + значение»). Намеренно не тянем
   тяжёлый charts-пакет: полный контроль над тултипами/доступностью, мгновенный
   рендер. В дизайн-решениях помечено как осознанный выбор (см. 01_decisions). */

export interface Series {
  name: string;
  color: string;
  points: number[];
  area?: boolean;
}

export function LineChart(props: {
  series: Series[];
  labels: string[];
  height?: number;
  format?: (n: number) => string;
  /** Точки на каждое значение серии, не только при наведении (ФТ — «Данные по ДЗ и КЗ»). */
  showPoints?: boolean;
}) {
  const H = props.height ?? 160;
  const W = 640;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 22;
  const [hover, setHover] = useState<number | null>(null);

  const all = props.series.flatMap((s) => s.points);
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const n = props.labels.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (innerW * i) / Math.max(n - 1, 1);
  const y = (v: number) => padT + innerH - (innerH * (v - min)) / Math.max(max - min, 1);
  const fmt = props.format ?? ((v) => String(v));

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((rel - padL) / innerW) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, idx)));
        }}
      >
        {/* сетка */}
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1={padL} x2={W - padR} y1={padT + innerH * t} y2={padT + innerH * t} stroke="var(--color-bg-border)" strokeWidth={1} />
        ))}
        {/* серии */}
        {props.series.map((s, si) => {
          const d = s.points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
          const area = `${d} L ${x(n - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;
          return (
            <g key={si}>
              {s.area && <path d={area} fill={s.color} opacity={0.1} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {props.showPoints && s.points.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="var(--color-bg-default)" strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
        {/* hover */}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--color-typo-ghost)" strokeDasharray="3 3" />
            {props.series.map((s, si) => (
              <circle key={si} cx={x(hover)} cy={y(s.points[hover])} r={5.5} fill={s.color} stroke="var(--color-bg-default)" strokeWidth={1.5} />
            ))}
          </g>
        )}
        {/* подписи X (разрежённые) */}
        {props.labels.map((l, i) =>
          i % Math.ceil(n / 6) === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 6} fontSize={10} fill="var(--color-typo-secondary)" textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
      </svg>

      {hover != null && (
        <div
          style={{
            position: 'absolute',
            left: `calc(${(x(hover) / W) * 100}% )`,
            top: 0,
            transform: 'translateX(-50%)',
            background: 'var(--color-bg-default)',
            border: '1px solid var(--color-bg-border)',
            borderRadius: 8,
            boxShadow: 'var(--pmrk-shadow-2)',
            padding: '8px 10px',
            pointerEvents: 'none',
            fontSize: 12,
            whiteSpace: 'nowrap',
            zIndex: 5,
          }}
        >
          <div className="pmrk-muted" style={{ marginBottom: 4 }}>{props.labels[hover]}</div>
          {props.series.map((s, si) => (
            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
              <span style={{ flex: 1 }}>{s.name}</span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(s.points[hover])}</b>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {props.series.map((s, si) => (
          <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 3, borderRadius: 2, background: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ points, color = 'var(--color-bg-brand)', width = 80, height = 24 }: { points: number[]; color?: string; width?: number; height?: number }) {
  if (!points.length) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const d = points
    .map((v, i) => {
      const x = (width * i) / Math.max(points.length - 1, 1);
      const y = height - (height * (v - min)) / Math.max(max - min, 1);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

/** Горизонтальный индикатор вклада (для декомпозиции оценки AI-3). */
export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color }} />
    </div>
  );
}

/** Кольцевой прогресс — использование лимита и т.п. */
export function Gauge({ value, color, label }: { value: number; color: string; label?: string }) {
  // Крупнее и с более толстым кольцом, чем раньше (было 64px/6px) — на прежнем
  // размере процент и сам прогресс читались мелко; так кольцо и число заметнее,
  // не теряются рядом с крупными цифрами соседних Stat.
  const size = 92;
  const strokeWidth = 9;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  return (
    // Обёртка без фиксированной высоты — иначе длинная подпись (2+ строки) вылезала
    // бы за пределы круга и наслаивалась на то, что идёт после Gauge. Круг с
    // процентом внутри держит фиксированный размер отдельным вложенным блоком.
    <div style={{ width: size }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--color-bg-border)" strokeWidth={strokeWidth} />
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value)}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        </svg>
        {/* Число выделено размером, «%» — мельче рядом, тот же приём, что и у
            сумм соседних Stat (MoneyValue в CreditLimitTab): крупная цифра —
            смысловой центр показателя, единица измерения — вспомогательная. */}
        {/* alignItems: 'center' (не 'baseline') — число и «%» центрируются как
            единый блок относительно центра кольца, а не по базовой линии текста,
            которая при разных кеглях смещала визуальный центр вверх. */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ fontSize: 28, fontWeight: 800 }}>{Math.round(value * 100)}</span>
          <span style={{ fontSize: 15, fontWeight: 600, marginLeft: 1, color: 'var(--color-typo-secondary)' }}>%</span>
        </div>
      </div>
      {label && <div className="pmrk-muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 4 }}>{label}</div>}
    </div>
  );
}
