import { useEffect, useRef, useState } from 'react';

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
        {/* подписи X (разрежённые): шаг отсчитывается от последней точки, чтобы
            она всегда была подписана и не налезала на соседнюю подпись */}
        {props.labels.map((l, i) =>
          (n - 1 - i) % Math.ceil(n / 6) === 0 ? (
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

/* ======================================================================
   График вкладки «Данные по ДЗ и КЗ» — по образцу исходной системы:
   заголовок по центру, шкала Y в млн руб. (0 / середина / максимум),
   сглаженные линии с точками без заливки, подпись каждой даты по оси X,
   легенда точками снизу. Ширина viewBox = фактической ширине блока
   (ResizeObserver), поэтому шрифт подписей — в реальных пикселях. Если даты
   по оси X не помещаются в ряд, они поворачиваются наискосок: подписана
   каждая точка, но подписи не слипаются.
   ====================================================================== */

/** «Круглый» шаг шкалы: 1 / 2 / 5 × 10^k, чтобы деления были 0, 1 000, 2 000… */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow;
}

/** Сглаженная линия через точки (Catmull-Rom → кубические Безье). */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const fmtMln = (v: number) => (v / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: v / 1_000_000 < 10 ? 1 : 0 });

export function DebtChart(props: { title: string; labels: string[]; series: Series[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(480);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = props.labels.length;
  // подпись «31.08.2025» ≈ 56px при 10px; если шаг точек меньше — наискосок
  const LABEL_W = 58;
  const tilt = (W - 60) / Math.max(n - 1, 1) < LABEL_W;
  const H = tilt ? 250 : 220;
  const padL = 44;
  const padR = tilt ? 10 : 30;
  const padT = 12;
  const padB = tilt ? 58 : 26;
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(...props.series.flatMap((s) => s.points), 0);
  const step = niceStep(max / 2);
  const top = Math.max(step * 2, step);
  const ticks = [0, step, top];
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (innerW * i) / Math.max(n - 1, 1);
  const y = (v: number) => padT + innerH - (innerH * v) / (top || 1);

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth: 0 }}>
      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-typo-secondary)', marginBottom: 6 }}>{props.title}</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        style={{ display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((rel - padL) / innerW) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, idx)));
        }}
      >
        {/* сетка и шкала Y, млн руб. */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--color-bg-border)" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} fontSize={10} fill="var(--color-typo-secondary)" textAnchor="end">{fmtMln(t)}</text>
          </g>
        ))}
        <line x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke="var(--color-bg-border)" strokeWidth={1} />
        {/* серии: сглаженная линия + точки */}
        {props.series.map((s, si) => (
          <g key={si}>
            <path d={smoothPath(s.points.map((v, i) => [x(i), y(v)]))} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />)}
          </g>
        ))}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--color-typo-ghost)" strokeDasharray="3 3" />
        )}
        {/* подпись каждой точки по оси X */}
        {props.labels.map((l, i) => (
          tilt
            ? <text key={i} x={x(i)} y={padT + innerH + 12} fontSize={10} fill="var(--color-typo-secondary)" textAnchor="end" transform={`rotate(-40 ${x(i)} ${padT + innerH + 12})`}>{l}</text>
            : <text key={i} x={x(i)} y={H - 8} fontSize={10} fill="var(--color-typo-secondary)" textAnchor="middle">{l}</text>
        ))}
      </svg>

      {hover != null && (
        <div
          style={{
            position: 'absolute', left: `${(x(hover) / W) * 100}%`, top: 24, transform: 'translateX(-50%)',
            background: 'var(--color-bg-default)', border: '1px solid var(--color-bg-border)', borderRadius: 8,
            boxShadow: 'var(--pmrk-shadow-2)', padding: '8px 10px', pointerEvents: 'none', fontSize: 12, whiteSpace: 'nowrap', zIndex: 5,
          }}
        >
          <div className="pmrk-muted" style={{ marginBottom: 4 }}>{props.labels[hover]}</div>
          {props.series.map((s, si) => (
            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
              <span style={{ flex: 1 }}>{s.name}</span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMln(s.points[hover])} млн руб.</b>
            </div>
          ))}
        </div>
      )}

      {/* легенда — точками по центру под графиком */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
        {props.series.map((s, si) => (
          <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------- Динамика группы кредитоспособности ---------------------- */

const MONTH_SHORT = ['янв.', 'февр.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];

export interface GroupPoint { date: string; group: 1 | 2 | 3 | 4; score: number }

/** Динамика оценки кредитоспособности: по вертикали — группа 1–4 (1 сверху,
    это лучшая), по горизонтали — последние 12 месяцев до даты `end`. На графике
    только месяцы, в которых проводилась оценка; при нескольких оценках в одном
    месяце берётся последняя. Количество баллов — в подсказке точки. */
export function GroupDynamicsChart({ points, end, height = 220 }: { points: GroupPoint[]; end: Date; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const N = 12;
  const months = Array.from({ length: N }, (_, i) => new Date(end.getFullYear(), end.getMonth() - (N - 1 - i), 1));
  const monthIdx = (iso: string) => {
    const d = new Date(iso);
    return (d.getFullYear() - months[0].getFullYear()) * 12 + d.getMonth() - months[0].getMonth();
  };
  const byMonth = new Map<number, GroupPoint>();
  [...points].sort((a, b) => a.date.localeCompare(b.date)).forEach((p) => {
    const i = monthIdx(p.date);
    if (i >= 0 && i < N) byMonth.set(i, p);
  });
  const pts = [...byMonth].map(([i, p]) => ({ i, p }));

  const padL = 44, padR = 12, padT = 10, padB = 26;
  const innerW = Math.max(width - padL - padR, 1);
  const innerH = height - padT - padB;
  const px = (i: number) => padL + (innerW * (i + 0.5)) / N;
  const py = (g: number) => padT + (innerH * (g - 0.5)) / 4;
  // плавные «ступеньки»: горизонтальные касательные в каждой точке
  const path = pts.map(({ i, p }, k) => {
    const x = px(i), y = py(p.group);
    if (k === 0) return `M ${x} ${y}`;
    const x0 = px(pts[k - 1].i), y0 = py(pts[k - 1].p.group), mx = (x0 + x) / 2;
    return `C ${mx} ${y0}, ${mx} ${y}, ${x} ${y}`;
  }).join(' ');
  const step = innerW / N < 40 ? 2 : 1;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg width="100%" height={height} style={{ display: 'block' }} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((t) => (
          <line key={t} x1={padL} x2={width - padR} y1={padT + (innerH * t) / 4} y2={padT + (innerH * t) / 4} stroke="var(--color-bg-border)" strokeWidth={1} />
        ))}
        {[1, 2, 3, 4].map((g) => (
          <g key={g}>
            <rect x={4} y={py(g) - 11} width={24} height={22} rx={6} fill="var(--color-bg-brand)" />
            <text x={16} y={py(g) + 4.5} fontSize={13} fontWeight={700} fill="#fff" textAnchor="middle">{g}</text>
          </g>
        ))}
        {pts.length > 1 && <path d={path} fill="none" stroke="var(--color-bg-brand)" strokeWidth={2.5} strokeLinecap="round" />}
        {pts.map(({ i, p }) => (
          <circle
            key={i}
            cx={px(i)}
            cy={py(p.group)}
            r={hover === i ? 6 : 4.5}
            fill="var(--color-bg-brand)"
            stroke="var(--color-bg-default)"
            strokeWidth={1.5}
            onMouseEnter={() => setHover(i)}
            style={{ cursor: 'default' }}
          />
        ))}
        {months.map((m, i) =>
          (N - 1 - i) % step === 0 ? (
            <text key={i} x={px(i)} y={height - 8} fontSize={10.5} fill="var(--color-typo-secondary)" textAnchor="middle">
              {MONTH_SHORT[m.getMonth()]} {String(m.getFullYear()).slice(2)}
            </text>
          ) : null,
        )}
      </svg>

      {hover != null && byMonth.get(hover) && (
        <div
          style={{
            position: 'absolute', left: Math.min(Math.max(px(hover), 70), Math.max(width - 70, 70)), top: py(byMonth.get(hover)!.group) - 8,
            transform: 'translate(-50%, -100%)', background: 'var(--color-bg-default)', border: '1px solid var(--color-bg-border)',
            borderRadius: 8, boxShadow: 'var(--pmrk-shadow-2)', padding: '6px 10px', pointerEvents: 'none', fontSize: 12, whiteSpace: 'nowrap', zIndex: 5,
          }}
        >
          <div className="pmrk-muted" style={{ marginBottom: 2 }}>{byMonth.get(hover)!.date.split('-').reverse().join('.')}</div>
          Группа {byMonth.get(hover)!.group} · {byMonth.get(hover)!.score} баллов
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-bg-brand)' }} />
        Группа кредитоспособности (кол-во баллов)
      </div>
    </div>
  );
}
