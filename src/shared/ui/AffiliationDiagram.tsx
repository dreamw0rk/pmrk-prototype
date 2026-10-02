import { useMemo, useRef, useState } from 'react';
import { Button } from '@consta/uikit/Button';
import { IconQuestion } from '@consta/icons/IconQuestion';
import { SimpleOverlay } from '@/shared/ui/kit';
import type { AffiliationGraph, AffiliationNode } from '@/shared/mock/types';
import { AFFILIATION_KINDS, AFFILIATION_KIND_BY_ID, kindOrder } from '@/shared/mock/affiliationKinds';
import { BY_UID } from '@/shared/mock/data';

/* Диаграмма связей (ФТ-4.2). SVG (не canvas): нужны клики, тултипы, доступность.
   Компоновка — как в исходной системе: анализируемая компания слева, правее —
   полосы по ТИПАМ АФФИЛИРОВАННОСТИ из справочника (19 типов, см.
   affiliationKinds.ts), в каждой полосе — карточки лиц этого типа, а справа от
   полосы — синий ярлык с названием типа (оно длинное, поэтому переносится).
   Показываются только типы, по которым у компании есть связи. Одно лицо может
   иметь несколько типов сразу (руководитель и совладелец) — тогда его карточка
   стоит в каждой из этих полос.
   - доля владения вынесена в «пилюлю» в углу карточки (белая — прямое, жёлтая —
     косвенное), чтобы не налезать на наименование (ФТ-4.2);
   - синяя обводка + клик, если у лица есть опыт сотрудничества с ГК ГПН
     (карточка в реестре ПМРК → профиль связанного);
   - красная обводка — под санкциями; легенда — НАД диаграммой;
   - подсветка результата поиска — оранжевым (ФТ-4.3). */

export interface DiagramFilters {
  /** выбранные в фильтре типы аффилированности; пусто — показаны все типы,
      выбраны один и более — только они */
  selected: Set<number>;
  minDirect: number;
  maxLevel: number;
}

/** Цвет значка «руководитель» (ЕИО) — отдельный от orange/red (реестр/санкции),
    чтобы три признака не путались друг с другом на карточке. */
export const DIRECTOR_COLOR = '#7c5cff';

const fmtPct = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

/** Размер доли владения словами — для подсказки и таблицы связей. */
export function describeShare(n: AffiliationNode): string | null {
  if (n.directShare != null) return `Прямая доля владения — ${fmtPct(n.directShare)}%`;
  if (n.indirectShare != null) return `Косвенная доля владения (по цепочке) — ${fmtPct(n.indirectShare)}%`;
  return null;
}

/** Названия типов аффилированности лица (для ПМРК), в порядке справочника. */
export function kindNames(n: AffiliationNode): string[] {
  return [...n.kinds]
    .sort((a, b) => kindOrder(a) - kindOrder(b))
    .map((id) => AFFILIATION_KIND_BY_ID[id]?.pmrk ?? `Тип ${id}`);
}

/** Тип лица различается цветом карточки (подписи на карточке нет, как в ПМРК):
    юридическое лицо — голубоватая заливка, физическое — зеленоватая. Те же
    цвета — в пунктах легенды. */
const LEGAL_COLORS = { from: '#f5f9ff', to: '#d9e8fb', border: '#b7cde9', swatch: '#d9e8fb' };
const PERSON_COLORS = { from: '#f6fbf6', to: '#d8eedc', border: '#aed3b6', swatch: '#d8eedc' };

/** Синяя обводка карточки — «имеется опыт сотрудничества с ГК ГПН» (карточка в
    реестре ПМРК). Оранжевый оставлен под подсветку результатов поиска, чтобы два
    разных признака не делили один цвет. */
export const EXPERIENCE_COLOR = '#1f5fd1';

/** Цвет маркера «высокий риск по экспресс-оценке» (группа 4). */
export const HIGH_RISK_COLOR = 'var(--pmrk-risk-4)';

/** Высокий риск по результату экспресс-оценки связанного лица: у него есть
    карточка в реестре ПМРК и последняя оценка относит его к группе 4 (тот же
    порог, что и «Высокий риск» на главной). Лица без карточки не оценивались —
    для них маркера нет. */
export function highRiskInfo(n: AffiliationNode): { group: number; score: number } | null {
  const c = n.uid ? BY_UID.get(n.uid) : undefined;
  return c && c.group === 4 ? { group: c.group, score: c.score } : null;
}

// Геометрия: корень слева, полосы с карточками, справа от каждой — ярлык типа
const ROOT_X = 22;
const ROOT_W = 214;
const ROOT_H = 74;
const BAND_X = 270;
const CARDS_W = 752; // ширина области карточек (3 колонки)
const LABEL_GAP = 10;
const LABEL_W = 206;
const LABEL_X = BAND_X + CARDS_W + LABEL_GAP;
const W = LABEL_X + LABEL_W + 18;
const BAND_PAD = 14;
const CARD_W = 226;
const CARD_H = 76; // имя (до 2 строк) + строка ИНН; тип лица — цветом заливки, без подписи
const CARD_GAP = 14;
const BAND_GAP = 14;
const COLS = Math.max(1, Math.floor((CARDS_W - 2 * BAND_PAD + CARD_GAP) / (CARD_W + CARD_GAP)));
const LABEL_CHARS = 27; // знаков в строке ярлыка при шрифте 11.5 и ширине LABEL_W
const LABEL_LINE_H = 15;

interface Placed extends AffiliationNode {
  _x: number;
  _y: number;
  _kind: number;
}
interface Band {
  kind: number;
  lines: string[];
  y: number;
  h: number;
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Перенос по словам в строки не длиннее max знаков (длинное слово не режем). */
function wrapWords(s: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    if (cur && (cur + ' ' + word).length > max) { lines.push(cur); cur = word; }
    else cur = cur ? cur + ' ' + word : word;
  }
  if (cur) lines.push(cur);
  return lines;
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
  /** клик по карточке связанного лица: есть в реестре → его профиль, нет →
      заявка на создание карточки (решает вызывающая сторона) */
  onOpenNode?: (n: AffiliationNode) => void;
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
        n.level <= props.filters.maxLevel &&
        (props.filters.minDirect === 0 || (n.directShare ?? n.indirectShare ?? 0) >= props.filters.minDirect),
    );
    const placed: Placed[] = [];
    const bands: Band[] = [];
    let y = 16;
    for (const kind of AFFILIATION_KINDS) {
      if (props.filters.selected.size && !props.filters.selected.has(kind.id)) continue;
      const list = visible.filter((n) => n.kinds.includes(kind.id)).sort((a, b) => a.level - b.level);
      if (!list.length) continue;
      const lines = wrapWords(kind.pmrk, LABEL_CHARS);
      const rows = Math.ceil(list.length / COLS);
      const cardsH = 2 * BAND_PAD + rows * CARD_H + (rows - 1) * CARD_GAP;
      // полоса не ниже ярлыка: длинное название занимает до 6 строк
      const h = Math.max(cardsH, 2 * 14 + lines.length * LABEL_LINE_H);
      list.forEach((n, i) => {
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        placed.push({ ...n, _kind: kind.id, _x: BAND_X + BAND_PAD + c * (CARD_W + CARD_GAP), _y: y + BAND_PAD + r * (CARD_H + CARD_GAP) });
      });
      bands.push({ kind: kind.id, lines, y, h });
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
  const uniqueCount = new Set(placed.map((p) => p.id)).size;

  return (
    <div>
      {/* управление */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Button size="xs" view="ghost" label="–" onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} />
        <Button size="xs" view="ghost" label="Сброс" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} />
        <Button size="xs" view="ghost" label="+" onClick={() => setZoom((z) => Math.min(2, z + 0.15))} />
        <span className="pmrk-muted" style={{ fontSize: 12, marginLeft: 8 }}>
          Колесо — зум, перетаскивание фона — панорама · {uniqueCount} связей в {bands.length} группах
        </span>
      </div>

      {/* ЛЕГЕНДА — сверху над диаграммой */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 18px', marginBottom: 10, fontSize: 12, padding: '10px 14px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-bg-border)', borderRadius: 'var(--pmrk-radius)' }}>
        <Legend swatch={LEGAL_COLORS.swatch} border={LEGAL_COLORS.border} label="Юридическое лицо" />
        <Legend swatch={PERSON_COLORS.swatch} border={PERSON_COLORS.border} label="Физическое лицо" />
        <Legend swatch="#ffffff" border="#cfd6e0" label="Владение (доля): прямое / косвенное" pill />
        <Legend swatch={DIRECTOR_COLOR} border={DIRECTOR_COLOR} label="Руководитель (ЕИО)" dot />
        <Legend swatch="#ffffff" border={EXPERIENCE_COLOR} label="Имеется опыт сотрудничества с ГК ГПН" thick />
        <Legend swatch="#ffffff" border="var(--pmrk-risk-4)" label="Под санкциями" thick />
        <Legend swatch={HIGH_RISK_COLOR} border={HIGH_RISK_COLOR} label="Высокий риск по экспресс-оценке" dot glyph="!" />
        <Button
          size="xs"
          view="ghost"
          onlyIcon
          iconLeft={IconQuestion as never}
          title="Что означают обозначения на диаграмме"
          onClick={() => setHelpOpen(true)}
        />
      </div>

      {helpOpen && (
        <SimpleOverlay onClose={() => setHelpOpen(false)} maxWidth="min(92vw, 500px)">
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Как читать диаграмму связей</h3>
              <Button size="xs" view="clear" label="✕" onClick={() => setHelpOpen(false)} />
            </div>
            <div className="pmrk-stack" style={{ gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ display: 'flex', gap: 3, flex: 'none', marginTop: 2 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: LEGAL_COLORS.swatch, border: `1px solid ${LEGAL_COLORS.border}` }} />
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: PERSON_COLORS.swatch, border: `1px solid ${PERSON_COLORS.border}` }} />
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Юридическое и физическое лицо</div>
                  <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Тип лица на карточке не подписывается — он виден по цвету заливки: голубоватая — юридическое лицо, зеленоватая — физическое лицо.</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 24, height: 14, borderRadius: 9, background: '#ffffff', border: '1px solid #cfd6e0', flex: 'none', marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Владение (доля)</div>
                  <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Пилюля с процентом в углу карточки — размер доли владения. Прямое — лицо владеет долей в анализируемой компании напрямую, без промежуточных звеньев. Косвенное — через одну или несколько промежуточных компаний; процент — эффективная (расчётная) доля по всей цепочке. На диаграмме отличаются цветом пилюли: прямое — белым, косвенное — жёлтым.</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: DIRECTOR_COLOR, flex: 'none', marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Руководитель (ЕИО)</div>
                  <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Лицо — единоличный исполнительный орган (директор, генеральный директор) анализируемой компании или другого лица в цепочке. Может одновременно быть совладельцем — тогда значок стоит на той же карточке, что и доля владения.</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 18, height: 14, borderRadius: 3, background: '#ffffff', border: `2px solid ${EXPERIENCE_COLOR}`, flex: 'none', marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Имеется опыт сотрудничества с ГК ГПН</div>
                  <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>У этого лица есть опыт сотрудничества с ГК «Газпром нефть» и собственная карточка в реестре ПМРК — клик по карточке открывает его профиль.</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 18, height: 14, borderRadius: 3, background: '#ffffff', border: '2px solid var(--pmrk-risk-4)', flex: 'none', marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Под санкциями</div>
                  <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Лицо включено в один из санкционных списков (см. вкладку «Внешняя информация» его карточки).</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: HIGH_RISK_COLOR, color: '#fff', fontSize: 10, fontWeight: 800, lineHeight: '14px', textAlign: 'center', flex: 'none', marginTop: 2 }}>!</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Высокий риск по экспресс-оценке</div>
                  <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>У связанного лица есть карточка в реестре ПМРК, и по результату экспресс-оценки оно отнесено к группе 4 (высокий риск). Карточка подсвечена красным, значок «!» — в верхнем углу. У лиц без карточки оценки нет — маркера они не получают.</div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-bg-border)' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Группы диаграммы — типы аффилированности</div>
              <div className="pmrk-muted" style={{ fontSize: 12.5 }}>
                Связанные лица сгруппированы по типу аффилированности с анализируемой компанией (справочник из {AFFILIATION_KINDS.length} типов: владельцы, руководитель, члены правления и совета директоров, дочерние и контролируемые общества, управляющая компания и др.). Название типа — в синем блоке справа от группы; показываются только те типы, по которым есть связи. Одно лицо может иметь несколько типов (например, руководитель и совладелец) — тогда его карточка есть в каждой из этих групп. Оранжевая рамка карточки — совпадение с поисковым запросом.
              </div>
            </div>
          </div>
        </SimpleOverlay>
      )}

      <div
        style={{ position: 'relative', border: '1px solid var(--color-bg-border)', borderRadius: 'var(--pmrk-radius-lg)', overflow: 'hidden', background: 'var(--color-bg-secondary)', height: H, cursor: drag.current ? 'grabbing' : 'grab' }}
        onWheel={(e) => setZoom((z) => Math.max(0.5, Math.min(2, z - Math.sign(e.deltaY) * 0.08)))}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; moved.current = false; }}
        onMouseMove={(e) => { if (drag.current) { moved.current = true; setPan({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) }); } }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => { drag.current = null; setHover(null); }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMinYMin meet">
          <defs>
            <marker id="aff-arr" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto">
              <path d="M0,0 L6.5,3 L0,6 Z" fill="#9aa7b8" />
            </marker>
            <linearGradient id="aff-card-legal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={LEGAL_COLORS.from} />
              <stop offset="1" stopColor={LEGAL_COLORS.to} />
            </linearGradient>
            <linearGradient id="aff-card-person" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={PERSON_COLORS.from} />
              <stop offset="1" stopColor={PERSON_COLORS.to} />
            </linearGradient>
            <linearGradient id="aff-card-risk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff7f7" />
              <stop offset="1" stopColor="#fbe3e3" />
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
                    <path key={`c-${i}`} d={`M ${trunkX} ${b.y + b.h / 2} H ${BAND_X - 6}`} markerEnd="url(#aff-arr)" />
                  ))}
                </g>
              );
            })()}

            {/* полосы типов: область карточек + справа синий ярлык с названием типа */}
            {bands.map((b) => (
              <g key={`b-${b.kind}`}>
                <rect x={BAND_X} y={b.y} width={CARDS_W} height={b.h} rx={12} fill="var(--color-bg-default)" stroke="var(--color-bg-border)" />
                <rect x={LABEL_X} y={b.y} width={LABEL_W} height={b.h} rx={12} fill="var(--color-bg-brand)" />
                {b.lines.map((line, li) => (
                  <text
                    key={li}
                    x={LABEL_X + 14}
                    y={b.y + b.h / 2 - ((b.lines.length - 1) * LABEL_LINE_H) / 2 + li * LABEL_LINE_H + 4}
                    fontSize={11.5}
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    {line}
                  </text>
                ))}
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
              const tc = n.isPerson ? PERSON_COLORS : LEGAL_COLORS;
              const border = hl ? '#ff7a00' : n.inRegistry ? EXPERIENCE_COLOR : n.underSanctions ? 'var(--pmrk-risk-4)' : tc.border;
              const bw = hl ? 2.5 : n.inRegistry || n.underSanctions ? 2 : 1;
              const share = n.directShare ?? n.indirectShare;
              const [l1, l2] = wrap2(n.name, 19);
              const pillFill = n.directShare != null ? '#ffffff' : '#fff3c4';
              const pillStroke = n.directShare != null ? '#cfd6e0' : '#e6cf6a';
              const risk = highRiskInfo(n);
              return (
                <g
                  key={`${n.id}:${n._kind}`}
                  style={{ cursor: 'pointer' }} // кликабельны все карточки: профиль или заявка на карточку
                  onClick={() => { if (!moved.current) props.onOpenNode?.(n); }}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(null)}
                >
                  <rect x={n._x} y={n._y} width={CARD_W} height={CARD_H} rx={11} fill={risk ? 'url(#aff-card-risk)' : n.isPerson ? 'url(#aff-card-person)' : 'url(#aff-card-legal)'} stroke={border} strokeWidth={bw} />
                  <text x={n._x + 15} y={n._y + 25} fontSize={12.5} fontWeight={700} fill="#15233b">{l1}</text>
                  {l2 && <text x={n._x + 15} y={n._y + 42} fontSize={12.5} fontWeight={700} fill="#15233b">{l2}</text>}
                  {n.inn && <text x={n._x + 15} y={n._y + 62} fontSize={10.5} fill="#6b7689">ИНН {n.inn}</text>}
                  {risk && (
                    // значок «!» — высокий риск по экспресс-оценке; левее значка
                    // руководителя, если он есть на той же карточке
                    <>
                      <circle cx={n._x + CARD_W - (n.isDirector ? 38 : 15)} cy={n._y + 15} r={9} fill={HIGH_RISK_COLOR} />
                      <text x={n._x + CARD_W - (n.isDirector ? 38 : 15)} y={n._y + 19} textAnchor="middle" fontSize={12} fontWeight={800} fill="#ffffff">!</text>
                    </>
                  )}
                  {n.isDirector && (
                    <>
                      <circle cx={n._x + CARD_W - 15} cy={n._y + 15} r={9} fill={DIRECTOR_COLOR} />
                      <text x={n._x + CARD_W - 15} y={n._y + 18.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#ffffff">Р</text>
                    </>
                  )}
                  {share != null && (
                    <>
                      <rect x={n._x + CARD_W - 68} y={n._y + CARD_H - 30} width={56} height={20} rx={10} fill={pillFill} stroke={pillStroke} />
                      <text x={n._x + CARD_W - 40} y={n._y + CARD_H - 16} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#15233b">{fmtPct(share)}%</text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {hover && (
          <div style={{ position: 'absolute', right: 16, top: 16, background: 'var(--color-bg-default)', border: '1px solid var(--color-bg-border)', borderRadius: 8, boxShadow: 'var(--pmrk-shadow-2)', padding: '8px 12px', fontSize: 12, maxWidth: 300, pointerEvents: 'none' }}>
            <b>{hover.name}</b>
            <div className="pmrk-muted" style={{ marginTop: 4 }}>
              {hover.isPerson ? 'Физическое лицо' : hover.inn ? `Юридическое лицо · ИНН ${hover.inn}` : 'Юридическое лицо'}
            </div>
            <div style={{ marginTop: 6, fontWeight: 600 }}>Тип аффилированности</div>
            <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
              {kindNames(hover).map((name) => <li key={name}>{name}</li>)}
            </ul>
            {describeShare(hover) && <div style={{ marginTop: 6 }}>{describeShare(hover)}</div>}
            {hover.isDirector && <div style={{ marginTop: 4 }}>Руководитель (единоличный исполнительный орган)</div>}
            {hover.inRegistry
              ? <div style={{ color: EXPERIENCE_COLOR, marginTop: 4 }}>Имеется опыт сотрудничества с ГК ГПН → клик откроет карточку компании</div>
              : <div className="pmrk-muted" style={{ marginTop: 4 }}>Карточки в ПМРК нет → клик откроет заявку на её создание</div>}
            {hover.underSanctions && <div style={{ color: 'var(--pmrk-risk-4)', marginTop: 4 }}>Под санкциями</div>}
            {(() => {
              const r = highRiskInfo(hover);
              return r ? <div style={{ color: HIGH_RISK_COLOR, marginTop: 4 }}>Высокий риск по экспресс-оценке — группа {r.group}, {r.score} баллов</div> : null;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, border, label, thick, pill, dot, dashed, glyph }: { swatch: string; border: string; label: string; thick?: boolean; pill?: boolean; dot?: boolean; dashed?: boolean; glyph?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {dot ? (
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: swatch, color: '#fff', fontSize: 10, fontWeight: 800, lineHeight: '14px', textAlign: 'center', flex: 'none' }}>{glyph}</span>
      ) : (
        <span style={{ width: pill ? 24 : 18, height: 14, borderRadius: pill ? 9 : 3, background: swatch, border: `${thick ? 2 : 1}px solid ${border}`, borderStyle: dashed ? 'dashed' : 'solid' }} />
      )}
      {label}
    </span>
  );
}
