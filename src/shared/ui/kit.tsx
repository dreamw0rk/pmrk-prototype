import React from 'react';
import { Link } from 'react-router-dom';
import './components.css';
import { useApp } from '@/app/AppContext';
import { useSetPageMeta } from '@/app/PageMeta';
import type { RiskGroup, SignalSeverity, ApprovalStep, Kri } from '@/shared/mock/types';

/* ============================ Базовые примитивы ============================ */

export function PageHeader(props: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: React.ReactNode;
}) {
  const { skin } = useApp();
  // В скине СФК заголовок уезжает в топбар оболочки (топология СФК 1:1).
  useSetPageMeta({ title: props.title, subtitle: props.subtitle, breadcrumbs: props.breadcrumbs, actions: props.actions });
  if (skin === 'sfk') return null;
  return (
    <div className="pmrk-pagehead pmrk-enter">
      <div>
        {props.breadcrumbs && (
          <div className="pmrk-breadcrumbs">
            {props.breadcrumbs.map((b, i) => (
              <span key={i}>
                {i > 0 && ' / '}
                {b.to ? <Link to={b.to}>{b.label}</Link> : b.label}
              </span>
            ))}
          </div>
        )}
        <h1 className="pmrk-pagehead__title" style={{ margin: 0, fontWeight: 700, lineHeight: 1.2 }}>{props.title}</h1>
        {props.subtitle && (
          <div className="pmrk-muted" style={{ marginTop: 4, fontSize: 13 }}>
            {props.subtitle}
          </div>
        )}
      </div>
      {props.actions && <div className="pmrk-row" style={{ gap: 8 }}>{props.actions}</div>}
    </div>
  );
}

export function SectionCard(props: {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  pad?: boolean;
  style?: React.CSSProperties;
  /** заголовок сворачивает содержимое карточки по клику — шеврон слева от
      названия, тот же приём, что у аккордеонов «Внешней информации». Нужен
      второстепенным разделам страницы, которые не всем и не всегда нужны. */
  collapsible?: boolean;
  /** начальное состояние сворачиваемой карточки (по умолчанию — раскрыта) */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(props.defaultOpen ?? true);
  const isOpen = !props.collapsible || open;
  return (
    // overflow: hidden — у свёрнутой карточки плашка шапки становится её нижним
    // краем, и без обрезки её прямые углы вылезали бы за скругление карточки
    <section className={`pmrk-card ${props.pad === false ? '' : 'pmrk-card--pad'}`} style={{ marginBottom: 16, overflow: 'hidden', ...props.style }}>
      {(props.title || props.extra) && (
        <div
          className={`pmrk-card__head${props.collapsible ? ' pmrk-clickable' : ''}`}
          style={props.collapsible ? { cursor: 'pointer', marginBottom: isOpen ? 12 : 0 } : undefined}
          onClick={props.collapsible ? () => setOpen((v) => !v) : undefined}
        >
          <div className="pmrk-card__title" style={props.collapsible ? { display: 'flex', alignItems: 'center', gap: 8 } : undefined}>
            {/* шеврон берёт currentColor — в шапке с брендовой заливкой он
                наследует её белый текст, а не собственный серый */}
            {props.collapsible && (
              <span style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'currentColor', opacity: 0.8, display: 'inline-block' }}>▸</span>
            )}
            {props.title}
          </div>
          {/* клик по содержимому extra (даты, кнопки) не должен сворачивать карточку */}
          {props.extra && (props.collapsible ? <div onClick={(e) => e.stopPropagation()}>{props.extra}</div> : props.extra)}
        </div>
      )}
      {isOpen && props.children}
    </section>
  );
}

export function Stat(props: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'default' | 'risk' | 'good';
  /** дата обновления расчётной величины (ISO) — рисует сноску ↻ */
  asOf?: string;
  /** источник расчёта (scoring / limit-workflow / АРМ КК …) */
  calcSource?: string;
  /** подпись сноски (по умолчанию «рассчитано») */
  calcLabel?: string;
}) {
  const color = props.tone === 'risk' ? 'var(--pmrk-risk-4)' : props.tone === 'good' ? 'var(--pmrk-risk-1)' : undefined;
  return (
    <div className="pmrk-stat">
      <div className="pmrk-stat__label">{props.label}</div>
      <div className="pmrk-stat__value" style={{ color }}>{props.value}</div>
      {props.sub && <div className="pmrk-stat__sub pmrk-muted">{props.sub}</div>}
      {props.asOf && (
        <div className="pmrk-stat__stamp">
          <CalcStamp date={props.asOf} source={props.calcSource} label={props.calcLabel} />
        </div>
      )}
    </div>
  );
}

/** Сноска актуальности РАСЧЁТНОЙ величины. Отличается от DateActuality: помечает
   выведенные/вычисленные значения (оценки, лимиты, доли, агрегаты), чтобы видеть,
   на какие исходные данные опирался расчёт. `date` опускается для live-пересчёта. */
export function CalcStamp({ date, source, label = 'рассчитано', live }: { date?: string; source?: string; label?: string; live?: boolean }) {
  const d = date ? date.split('-').reverse().join('.') : null;
  const title = live
    ? 'Величина пересчитывается в реальном времени по введённым данным'
    : 'Дата обновления расчётной величины — для контроля актуальности выведенной информации';
  return (
    <span className="pmrk-calcstamp" title={title}>
      <span className="pmrk-calcstamp__glyph">↻</span>
      {live ? 'пересчёт в реальном времени' : `${label}${d ? ` на ${d}` : ''}`}
      {source ? ` · ${source}` : ''}
    </span>
  );
}

export function KeyValue({ items, cols = 2 }: { items: { k: string; v: React.ReactNode }[]; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: '10px 24px' }}>
      {items.map((it, i) => (
        <div key={i}>
          <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 2 }}>{it.k}</div>
          <div style={{ fontSize: 14 }}>{it.v}</div>
        </div>
      ))}
    </div>
  );
}

/* ===================== Цветовые индикаторы (ФТ-12.8) ====================== */

const GROUP_COLOR: Record<RiskGroup, { c: string; bg: string; label: string }> = {
  1: { c: 'var(--pmrk-risk-1)', bg: 'var(--pmrk-risk-1-bg)', label: 'Группа 1' },
  2: { c: 'var(--pmrk-risk-2)', bg: 'var(--pmrk-risk-2-bg)', label: 'Группа 2' },
  3: { c: 'var(--pmrk-risk-3)', bg: 'var(--pmrk-risk-3-bg)', label: 'Группа 3' },
  4: { c: 'var(--pmrk-risk-4)', bg: 'var(--pmrk-risk-4-bg)', label: 'Группа 4' },
};

export function GroupBadge({ group, withScore }: { group: RiskGroup; withScore?: number }) {
  const g = GROUP_COLOR[group];
  return (
    <span className="pmrk-chip" style={{ background: g.bg, color: g.c }} title={`Кредитоспособность — ${g.label}`}>
      <span className="pmrk-dot" style={{ background: g.c }} />
      {g.label}
      {withScore != null && <span style={{ opacity: 0.8 }}>· {withScore}</span>}
    </span>
  );
}

/** Светофор Индекса РБ 0–14 (ФТ-1.3.1) */
export function RbIndicator({ value }: { value: number }) {
  const tone = value <= 4 ? 'green' : value <= 9 ? 'yellow' : 'red';
  const color = tone === 'green' ? 'var(--pmrk-rb-green)' : tone === 'yellow' ? 'var(--pmrk-rb-yellow)' : 'var(--pmrk-rb-red)';
  const label = tone === 'green' ? 'низкий' : tone === 'yellow' ? 'средний' : 'высокий';
  return (
    <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-primary)' }} title={`Индекс РБ ${value}/14 — ${label} сигнал`}>
      <span className="pmrk-dot" style={{ background: color }} />
      Индекс РБ {value}/14
    </span>
  );
}

export function SanctionBadge() {
  return (
    <span className="pmrk-chip" style={{ background: 'var(--pmrk-risk-4-bg)', color: 'var(--pmrk-risk-4)' }}>
      <span className="pmrk-dot" style={{ background: 'var(--pmrk-risk-4)' }} />
      Под санкциями
    </span>
  );
}

export function RnpUnscrupulous() {
  return (
    <span className="pmrk-chip" style={{ background: 'var(--pmrk-risk-1-bg)', color: 'var(--pmrk-risk-1)' }}>
      <span className="pmrk-dot" style={{ background: 'var(--pmrk-risk-1)' }} />
      Не выявлено
    </span>
  );
}

const STATUS_TONE: Record<string, string> = {
  'Действующее': 'var(--pmrk-risk-1)',
  'Утверждено': 'var(--pmrk-risk-1)',
  'Готов': 'var(--pmrk-risk-1)',
  'На утверждении': 'var(--pmrk-risk-3)',
  'На проверке': 'var(--pmrk-risk-3)',
  'Формируется': 'var(--pmrk-risk-3)',
  'Подготовлено КК': 'var(--color-bg-brand)',
  'Черновик': 'var(--color-typo-ghost)',
  'Отклонено': 'var(--pmrk-risk-4)',
  'Возвращено': 'var(--pmrk-risk-4)',
  'Банкротство': 'var(--pmrk-risk-4)',
  'Ликвидация': 'var(--pmrk-risk-4)',
  'Ошибка': 'var(--pmrk-risk-4)',
};

export function StatusBadge({ status }: { status: string }) {
  const c = STATUS_TONE[status] ?? 'var(--color-typo-secondary)';
  return (
    <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: c }}>
      <span className="pmrk-dot" style={{ background: c }} />
      {status}
    </span>
  );
}

/** Drag&drop загрузка файлов (вложения протоколов, форм). Перетаскивание + выбор. */
export function FileDrop({ multiple = true, hint, accept }: { multiple?: boolean; hint?: string; accept?: string }) {
  const [files, setFiles] = React.useState<string[]>([]);
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list || !list.length) return;
    setFiles((p) => [...p, ...Array.from(list).map((f) => f.name)]);
  };
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${over ? 'var(--color-bg-brand)' : 'var(--color-bg-border)'}`,
          background: over ? 'var(--color-bg-secondary)' : 'var(--color-bg-default)',
          borderRadius: 10, padding: '16px', textAlign: 'center', cursor: 'pointer',
          color: 'var(--color-typo-secondary)', transition: 'border-color .1s, background .1s', outline: 'none',
        }}
      >
        <div style={{ fontSize: 20, opacity: 0.55, lineHeight: 1 }}>⬆</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          Перетащите файлы сюда или <span style={{ color: 'var(--color-typo-brand)' }}>выберите</span>
        </div>
        {hint && <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>{hint}</div>}
        <input ref={inputRef} type="file" multiple={multiple} accept={accept} style={{ display: 'none' }} onChange={(e) => add(e.target.files)} />
      </div>
      {files.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {files.map((f, i) => (
            <span key={i} className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-primary)' }}>
              📎 {f}
              <span className="pmrk-clickable" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} style={{ marginLeft: 4, opacity: 0.6 }}>✕</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Сегмент-контрол для вкладок-фильтров (паттерн из СФК): капсула + счётчики.
   Для срезов/фильтров; навигация по разделам — подчёркивание (отдельный стиль). */
export function Segmented<T extends string>(props: {
  items: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="pmrk-seg" role="tablist">
      {props.items.map((it) => (
        <div
          key={it.key}
          role="tab"
          aria-selected={props.value === it.key}
          className={`pmrk-seg__item ${props.value === it.key ? 'pmrk-seg__item--active' : ''}`}
          onClick={() => props.onChange(it.key)}
        >
          {it.label}
          {it.count != null && <span className="pmrk-seg__count">{it.count}</span>}
        </div>
      ))}
    </div>
  );
}

/** Список ключевых индикаторов риска (KRI) — портрет функции (идея из СФК). */
export function KriList({ items }: { items: Kri[] }) {
  const dot = (t: Kri['tone']) => (t === 'good' ? 'var(--pmrk-risk-1)' : t === 'warn' ? 'var(--pmrk-risk-3)' : t === 'bad' ? 'var(--pmrk-risk-4)' : 'var(--color-typo-ghost)');
  return (
    <div>
      {items.map((k, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < items.length - 1 ? '1px solid var(--color-bg-border)' : 'none' }}>
          <span className="pmrk-dot" style={{ background: dot(k.tone) }} />
          <span style={{ flex: 1, fontSize: 13 }}>{k.label}{k.hint && <span className="pmrk-muted" style={{ fontSize: 11 }}> · {k.hint}</span>}</span>
          <b className="pmrk-tnum" style={{ fontSize: 14, color: k.tone === 'bad' ? 'var(--pmrk-risk-4)' : undefined, whiteSpace: 'nowrap' }}>{k.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Дата актуализации раздела (требование вкладок ФТ-1) — фича доверия. */
export function DateActuality({ date, source }: { date?: string; source?: string }) {
  if (!date) return null;
  const d = date.split('-').reverse().join('.');
  return (
    <span className="pmrk-muted" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Дата актуализации данных раздела">
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pmrk-risk-1)' }} />
      Актуально на {d}
      {source && <span style={{ opacity: 0.7 }}>· {source}</span>}
    </span>
  );
}

/* ============================ Пусто / Скелетон ============================ */

export function EmptyState({ title, text, action }: { title?: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="pmrk-empty">
      <div style={{ fontSize: 28, opacity: 0.4 }}>◍</div>
      {title && <div style={{ fontWeight: 600, color: 'var(--color-typo-primary)' }}>{title}</div>}
      <div style={{ maxWidth: 360 }}>{text}</div>
      {action}
    </div>
  );
}

export function Skel({ w = '100%', h = 14, r = 6, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) {
  return <div className="pmrk-skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export function SkelLines({ n = 3 }: { n?: number }) {
  return (
    <div className="pmrk-stack" style={{ gap: 10 }}>
      {Array.from({ length: n }).map((_, i) => (
        <Skel key={i} w={`${90 - i * 12}%`} />
      ))}
    </div>
  );
}

/* ============================== Аудит-футер =============================== */

export function AuditFooter(props: { createdBy: string; createdAt: string; modifiedBy: string; modifiedAt: string }) {
  const userLink = (name: string) =>
    name === 'SYSTEM' ? (
      <span title="Системная учетная запись">Системная учетная запись</span>
    ) : (
      <a href="#" onClick={(e) => e.preventDefault()} title="Открыть в Корпоративном поиске">{name}</a>
    );
  return (
    <div className="pmrk-audit">
      <span>Создано: {userLink(props.createdBy)} · {props.createdAt.split('-').reverse().join('.')}</span>
      <span>Изменено: {userLink(props.modifiedBy)} · {props.modifiedAt.split('-').reverse().join('.')}</span>
    </div>
  );
}

/* ===================== Визуализация маршрута согласования ================= */

export function RouteViewer({ steps }: { steps: ApprovalStep[] }) {
  return (
    <div className="pmrk-route">
      {steps.map((s, i) => (
        <div key={i} className={`pmrk-route__step pmrk-route__step--${s.state}`}>
          <div className="pmrk-route__num">
            Шаг {i + 1}{s.adHoc ? ' · ad-hoc' : ''} · {s.role}
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, margin: '2px 0' }}>{s.title}</div>
          {s.actor && <div style={{ fontSize: 12 }}>{s.actor}</div>}
          {s.at && <div className="pmrk-muted" style={{ fontSize: 11 }}>{s.at.split('-').reverse().join('.')}</div>}
          {s.comment && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.85 }}>«{s.comment}»</div>}
        </div>
      ))}
    </div>
  );
}

/* ============================== Строка сигнала =========================== */

export const SEVERITY_LABEL: Record<SignalSeverity, string> = {
  critical: 'Критично',
  high: 'Высокая',
  medium: 'Средняя',
  low: 'Низкая',
};

export function severityColor(s: SignalSeverity): string {
  return s === 'critical' ? 'var(--pmrk-risk-4)' : s === 'high' ? 'var(--pmrk-risk-3)' : s === 'medium' ? 'var(--pmrk-risk-2)' : 'var(--color-typo-ghost)';
}
