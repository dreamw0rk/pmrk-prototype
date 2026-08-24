import { useMemo, useRef, useState } from 'react';
import { Button } from '@consta/uikit/Button';
import { Modal } from '@consta/uikit/Modal';
import { IconQuestion } from '@consta/icons/IconQuestion';
import type { AffiliationGraph, AffiliationNode, AffiliationLinkType } from '@/shared/mock/types';

/* Диаграмма связей (ФТ-4.2). SVG (не canvas): нужны клики, тултипы, доступность.
   Компоновка — ЯРУСНАЯ ИЕРАРХИЯ (как в СПАРК): анализируемая компания слева,
   справа — ярусы-полосы по типу связи (собственник / бенефициар / дочернее /
   аффилированное), внутри полосы — карточки сеткой; стрелки от корня к полосам.
   - доля владения вынесена в «пилюлю» в углу карточки (белая — прямое, жёлтая —
     косвенное), чтобы не налезать на наименование (ФТ-4.2);
   - оранжевая обводка + клик, если ИНН есть в реестре (→ профиль связанного);
   - красная полоса слева — под санкциями; легенда — НАД диаграммой;
   - подсветка результата поиска — оранжевым (ФТ-4.3). */

export interface DiagramFilters {
  types: Set<AffiliationLinkType>;
  minDirect: number;
  maxLevel: number;
}

const TIERS: { type: AffiliationLinkType; label: string }[] = [
  { type: 'owner', label: 'СОБСТВЕННИК (УЧАСТНИК / АКЦИОНЕР)' },
  { type: 'beneficiary', label: 'КОНЕЧНЫЙ БЕНЕФИЦИАР' },
  { type: 'subsidiary', label: 'ДОЧЕРНЕЕ / ЗАВИСИМОЕ ОБЩЕСТВО' },
  { type: 'affiliate', label: 'АФФИЛИРОВАННОЕ ЛИЦО' },
];

const ROLE_SHORT: Record<AffiliationLinkType, string> = {
  owner: 'Собственник',
  beneficiary: 'Конечный бенефициар',
  subsidiary: 'Дочернее / зависимое',
  affiliate: 'Аффилированное лицо',
};

// Геометрия: корень слева, ярусы-полосы справа
const W = 1040;
const ROOT_X = 22;
const ROOT_W = 214;
const ROOT_H = 74;
const BAND_X = 270;
const BAND_W = W - BAND_X - 18; // 752
const BAND_PAD = 14;
const BAND_HEADER_H = 30;
const CARD_W = 226;
const CARD_H = 74;
const CARD_GAP = 14;
const BAND_GAP = 16;
const COLS = Math.max(1, Math.floor((BAND_W - 2 * BAND_PAD + CARD_GAP) / (CARD_W + CARD_GAP)));

interface Placed extends AffiliationNode {
  _x: number;
  _y: number;
}
interface Band {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Перенос наименования в две строки: выбираем самый поздний удобный разрыв
// (пробел или дефис) в пределах max; дефис оставляем в конце первой строки.
function wrap2(s: string, max: number): [string, string?] {
  if (s.length <= max) return [s];
  const sp = s.lastIndexOf(' ', max);
  const hy = s.lastIndexOf('-', max);
  let l1: string;
  let l2: string;
  if (Math.max(sp, hy) >= max * 0.42) {
    if (hy >= sp) {
      l1 = s.slice(0, hy + 1); // дефис остаётся на первой строке
      l2 = s.slice(hy + 1);
    } else {
      l1 = s.slice(0, sp);
      l2 = s.slice(sp + 1);
    }
  } else {
    l1 = s.slice(0, max);
    l2 = s.slice(max);
  }
  l1 = l1.trim();
  l2 = l2.trim();
  if (l2.length > max) l2 = l2.slice(0, max - 1) + '…';
  return [l1, l2];
}

export function AffiliationDiagram(props: {
  graph: AffiliationGraph;
  search?: string;
  filters: DiagramFilters;
  onOpenCounterparty?: (uid: string) => void;
  onOpenGeneral?: () => void;
  height?: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<Placed | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const moved = useRef(false); // подавление клика после перетаскивания

  const { placed, bands, rootCy, totalH } = useMemo(() => {
    const visible = props.graph.nodes.filter(
      (n) =>
        props.filters.types.has(n.linkType) &&
        n.level <= props.filters.maxLevel &&
        (props.filters.minDirect === 0 || (n.directShare ?? n.indirectShare ?? 0) >= props.filters.minDirect),
    );
    const placed: Placed[] = [];
    const bands: Band[] = [];
    let y = 16;
    for (const tier of TIERS) {
      const list = visible.filter((n) => n.linkType === tier.type).sort((a, b) => a.level - b.level);
      if (!list.length) continue;
      const rows = Math.ceil(list.length / COLS);
      const h = BAND_HEADER_H + rows * CARD_H + (rows - 1) * CARD_GAP + BAND_PAD;
      list.forEach((n, i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        placed.push({ ...n, _x: BAND_X + BAND_PAD + c * (CARD_W + CARD_GAP), _y: y + BAND_HEADER_H + r * (CARD_H + CARD_GAP) });
      });
      bands.push({ label: tier.label, x: BAND_X, y, w: BAND_W, h });
      y += h + BAND_GAP;
    }
    const totalH = Math.max(y - BAND_GAP + 16, 220);
    return { placed, bands, rootCy: totalH / 2, totalH };
  }, [props.graph, props.filters]);

  const matches = (n: AffiliationNode) => {
    const q = (props.search ?? '').trim().toLowerCase();
    if (!q) return false;
    return n.name.toLowerCase().includes(q) || (n.inn ?? '').includes(q);
  };

  const H = props.height ?? Math.min(900, totalH);
  const rootY = rootCy - ROOT_H / 2;

  return (
    <div>
      {/* управление */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Button size="xs" view="ghost" label="–" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} />
        <Button size="xs" view="ghost" label="Сброс" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} />
        <Button size="xs" view="ghost" label="+" onClick={() => setZoom((z) => Math.min(2, z + 0.15))} />
        <span className="pmrk-muted" style={{ fontSize: 12, marginLeft: 8 }}>
          Колесо — зум, перетаскивание фона — панорама · {placed.length} связей
        </span>
      </div>

      {/* ЛЕГЕНДА — сверху над диаграммой */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 18px', marginBottom: 10, fontSize: 12, padding: '10px 14px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-bg-border)', borderRadius: 'var(--pmrk-radius)' }}>
        <Legend swatch="#ffffff" border="#cfd6e0" label="Владение (доля): прямое / косвенное" pill />
        <Legend swatch="#ffffff" border="#ff7a00" label="Есть в реестре — кликабельно" thick />
        <Legend swatch="#ffffff" border="var(--pmrk-risk-4)" label="Под санкциями" thick />
        <Button
          size="xs"
          view="ghost"
          onlyIcon
          iconLeft={IconQuestion as never}
          title="Что означают обозначения на диаграмме"
          onClick={() => setHelpOpen(true)}
        />
      </div>

      {/* style.zIndex — без него окно оказывается ниже липкой шапки профиля
          контрагента (position:sticky; z-index:3): у той z-index явно задан
          и положительный, а у портала модалки — auto, и по правилам стекинга
          он рисуется под позиционированными элементами с z-index > 0. */}
      <Modal isOpen={helpOpen} onClickOutside={() => setHelpOpen(false)} onEsc={() => setHelpOpen(false)} style={{ zIndex: 1000 }}>
        <div style={{ padding: 20, width: 460, maxWidth: '92vw' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Как читать диаграмму связей</h3>
            <Button size="xs" view="clear" label="✕" onClick={() => setHelpOpen(false)} />
          </div>
          <div className="pmrk-stack" style={{ gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ width: 24, height: 14, borderRadius: 9, background: '#ffffff', border: '1px solid #cfd6e0', flex: 'none', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Владение (доля)</div>
                <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Пилюля с процентом в углу карточки — размер доли владения. Прямое — лицо владеет долей в анализируемой компании напрямую, без промежуточных звеньев. Косвенное — через одну или несколько промежуточных компаний; процент — эффективная (расчётная) доля по всей цепочке. На диаграмме отличаются цветом пилюли: прямое — белым, косвенное — жёлтым.</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ width: 18, height: 14, borderRadius: 3, background: '#ffffff', border: '2px solid #ff7a00', flex: 'none', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Есть в реестре — кликабельно</div>
                <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>У этого лица есть собственная карточка в реестре ПМРК. Клик по карточке открывает его профиль.</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ width: 18, height: 14, borderRadius: 3, background: '#ffffff', border: '2px solid var(--pmrk-risk-4)', flex: 'none', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Под санкциями</div>
                <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Лицо включено в один из санкционных списков (см. вкладку «Внешняя информация» его карточки).</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-bg-border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Ярусы диаграммы</div>
            <div className="pmrk-muted" style={{ fontSize: 12.5 }}>
              Связанные лица сгруппированы по типу связи с анализируемой компанией — собственники и акционеры, конечный бенефициар, дочерние/зависимые общества, аффилированные лица. Оранжевая подсветка карточки — совпадение с поисковым запросом.
            </div>
          </div>
        </div>
      </Modal>

      <div
        style={{ position: 'relative', border: '1px solid var(--color-bg-border)', borderRadius: 'var(--pmrk-radius-lg)', overflow: 'hidden', background: 'var(--color-bg-secondary)', height: H, cursor: drag.current ? 'grabbing' : 'grab' }}
        onWheel={(e) => setZoom((z) => Math.max(0.5, Math.min(2, z - Math.sign(e.deltaY) * 0.08)))}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; moved.current = false; }}
        onMouseMove={(e) => { if (drag.current) { moved.current = true; setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) }); } }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => { drag.current = null; setHover(null); }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
          <defs>
            <marker id="aff-arr" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
              <path d="M0,0 L6.5,3 L0,6 Z" fill="#9aa7b8" />
            </marker>
            <linearGradient id="aff-card" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fcfdff" />
              <stop offset="1" stopColor="#e9edf4" />
            </linearGradient>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* шина связей: корень → вертикальный ствол → ответвления-стрелки к полосам */}
            {bands.length > 0 && (() => {
              const stubX = ROOT_X + ROOT_W;
              const trunkX = stubX + 14;
              const cys = bands.map((b) => b.y + b.h / 2);
              const top = Math.min(rootCy, ...cys);
              const bot = Math.max(rootCy, ...cys);
              return (
                <g stroke="#9aa7b8" strokeWidth={1.6} fill="none" opacity={0.9}>
                  <path d={`M ${stubX} ${rootCy} H ${trunkX}`} />
                  <path d={`M ${trunkX} ${top} V ${bot}`} />
                  {bands.map((b, i) => (
                    <path key={`c-${i}`} d={`M ${trunkX} ${b.y + b.h / 2} H ${b.x - 6}`} markerEnd="url(#aff-arr)" />
                  ))}
                </g>
              );
            })()}

            {/* ярусы-полосы (фон + заголовок) */}
            {bands.map((b, i) => (
              <g key={`b-${i}`}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} fill="var(--color-bg-default)" stroke="var(--color-bg-border)" />
                <text x={b.x + 16} y={b.y + 20} fontSize={11} fontWeight={700} letterSpacing={0.5} fill="var(--color-typo-secondary)">
                  {b.label}
                </text>
              </g>
            ))}

            {/* анализируемая компания (корень) — слева */}
            <g style={{ cursor: 'pointer' }} onClick={() => { if (!moved.current) props.onOpenGeneral?.(); }}>
              <rect x={ROOT_X - 4} y={rootY - 4} width={ROOT_W + 8} height={ROOT_H + 8} rx={13} fill="none" stroke="var(--color-bg-brand)" strokeOpacity={0.22} strokeWidth={2} />
              <rect x={ROOT_X} y={rootY} width={ROOT_W} height={ROOT_H} rx={10} fill="var(--color-bg-brand)" />
              <text x={ROOT_X + 18} y={rootY + 28} fontSize={13.5} fontWeight={700} fill="#fff">
                {clip(props.graph.rootName, 22)}
              </text>
              <text x={ROOT_X + 18} y={rootY + 47} fontSize={11} fill="rgba(255,255,255,0.88)">
                ИНН {props.graph.rootInn}
              </text>
              <text x={ROOT_X + 18} y={rootY + 63} fontSize={10} fill="rgba(255,255,255,0.65)">
                анализируемая компания
              </text>
            </g>

            {/* карточки связанных лиц */}
            {placed.map((n) => {
              const hl = matches(n);
              const clickable = n.inRegistry && !!n.uid;
              const border = hl ? '#ff7a00' : n.inRegistry ? '#ff7a00' : n.underSanctions ? 'var(--pmrk-risk-4)' : '#d4dae3';
              const bw = hl ? 2.5 : n.inRegistry || n.underSanctions ? 2 : 1;
              const share = n.directShare ?? n.indirectShare;
              const [l1, l2] = wrap2(n.name, 19);
              const pillFill = n.directShare != null ? '#ffffff' : '#fff3c4';
              const pillStroke = n.directShare != null ? '#cfd6e0' : '#e6cf6a';
              const sub = n.isPerson ? 'Физ. лицо' : n.inn ? `ИНН ${n.inn}` : 'Юр. лицо';
              return (
                <g
                  key={n.id}
                  style={{ cursor: clickable ? 'pointer' : 'default' }}
                  onClick={() => { if (clickable && !moved.current) props.onOpenCounterparty?.(n.uid!); }}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(null)}
                >
                  <rect x={n._x} y={n._y} width={CARD_W} height={CARD_H} rx={11} fill="url(#aff-card)" stroke={border} strokeWidth={bw} />
                  <text x={n._x + 15} y={n._y + 25} fontSize={12.5} fontWeight={700} fill="#15233b">{l1}</text>
                  {l2 && <text x={n._x + 15} y={n._y + 42} fontSize={12.5} fontWeight={700} fill="#15233b">{l2}</text>}
                  <text x={n._x + 15} y={n._y + 62} fontSize={10.5} fill="#6b7689">{sub}</text>
                  {share != null && (
                    <>
                      <rect x={n._x + CARD_W - 68} y={n._y + CARD_H - 30} width={56} height={20} rx={10} fill={pillFill} stroke={pillStroke} />
                      <text x={n._x + CARD_W - 40} y={n._y + CARD_H - 16} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#15233b">{share}%</text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {hover && (
          <div style={{ position: 'absolute', right: 16, top: 16, background: 'var(--color-bg-default)', border: '1px solid var(--color-bg-border)', borderRadius: 8, boxShadow: 'var(--pmrk-shadow-2)', padding: '8px 12px', fontSize: 12, maxWidth: 268, pointerEvents: 'none' }}>
            <b>{hover.name}</b>
            <div className="pmrk-muted" style={{ marginTop: 4 }}>
              {ROLE_SHORT[hover.linkType]}{hover.inn ? ` · ИНН ${hover.inn}` : hover.isPerson ? ' · физлицо' : ''}
            </div>
            {(hover.directShare != null || hover.indirectShare != null) && (
              <div style={{ marginTop: 4 }}>
                {hover.directShare != null ? `Доля прямого владения в % — ${hover.directShare}%` : `Доля косвенного владения в % — ${hover.indirectShare}%`}
              </div>
            )}
            {hover.inRegistry && <div style={{ color: '#ff7a00', marginTop: 4 }}>Есть в реестре ПМРК → клик откроет профиль</div>}
            {hover.underSanctions && <div style={{ color: 'var(--pmrk-risk-4)', marginTop: 4 }}>Под санкциями</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, border, label, thick, pill }: { swatch: string; border: string; label: string; thick?: boolean; pill?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: pill ? 24 : 18, height: 14, borderRadius: pill ? 9 : 3, background: swatch, border: `${thick ? 2 : 1}px solid ${border}` }} />
      {label}
    </span>
  );
}
