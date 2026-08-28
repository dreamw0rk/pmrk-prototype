import type { Counterparty, RiskGroup } from './types';
import { groupLabel } from './data';
import { buildStatements } from './statements';

/* Полная модель экспресс-оценки (ФТ-3.5): 3 методики, каждая — со структурой
   1. Финансовые показатели · 2. Деловая репутация · 3. Внешние источники ·
   Итого скоринг-балл · 4. Расчёт КЛ. Числа детерминированы (П-1).

   Класс контрагента/внутренний рейтинг, категория/подразделение и
   постатейный расчёт кредитного лимита (шаги «Внеоборотные активы / Чистые
   активы / Оборотные активы / КО …») сверены с реальным порталом — раньше
   здесь была только итоговая сумма лимита без самого расчёта. Расчёт лимита
   берёт строки прямо из Формы №1 (buildStatements), поэтому «Оценка» и
   «Отчётность» не расходятся в цифрах баланса одной и той же карточки. */

export const STOP_FACTORS = [
  'Нет',
  'Да, контрагент ликвидирован',
  'Да, контрагент находится в состоянии банкротства',
  'Да, отрицательные Чистые активы за последние 2 года',
];

export const CATEGORIES_OIL = ['Авиакомпания', 'Добыча, переработка и транспортировка газа, нефти и нефтепродуктов', 'Производство', 'Прочие', 'Строительство', 'Судовладелец', 'Торговля', 'Транспортировка и хранение'];
export const CATEGORIES_MTR = ['Добыча, переработка и транспортировка газа, нефти и нефтепродуктов', 'Производство', 'Прочие', 'Строительство', 'Торговля', 'Транспортировка и хранение'];
export const CATEGORIES_ADV = ['Добыча, переработка и транспортировка газа, нефти и нефтепродуктов', 'ИТ', 'Производство', 'Прочие', 'Строительство', 'Торговля', 'Транспортировка и хранение'];

export type Direction = 'OIL' | 'MTR' | 'ADVANCE';

export const DIRECTIONS: { key: Direction; label: string; short: string; template: string; method: string }[] = [
  { key: 'OIL', label: 'Покупатели нефти, газа, нефтепродуктов', short: 'Нефть, газ, НП', template: 'Ш-13.08.01-01', method: 'М-13.08.01-01' },
  { key: 'MTR', label: 'Покупатели МТР и логистических услуг', short: 'МТР и логистика', template: 'Ш-13.08.01-03', method: 'М-13.08.01-02' },
  { key: 'ADVANCE', label: 'Лимит авансового платежа', short: 'Авансирование', template: 'Ш-13.08-03', method: 'М-13.08-02' },
];

/** Полное название методики (версия + название документа), точно как в
    исходной системе — используется в подписи «МЕТОДОЛОГИЯ» на вкладке. */
export const METHODOLOGY_TITLE: Record<Direction, string> = {
  OIL: 'М-13.08.01-01 В.3.0 «Методика оценки кредитоспособности контрагентов – покупателей нефти, газа и нефтепродуктов»',
  MTR: 'М-13.08.01-02 В.3.0 «Методика оценки кредитоспособности контрагентов – покупателей МТР и логистических услуг»',
  ADVANCE: 'М-13.08-02 В.1.0 «Методика определения лимита авансового платежа контрагентам при закупке товаров, работ, услуг»',
};

export interface IndicatorRow { name: string; value: string; points: number; max: number }
export interface ScoreBlock { key: string; title: string; rows: IndicatorRow[]; subtotal: number }
export interface LimitStep { label: string; value: number }
export interface DirectionResult {
  direction: Direction;
  label: string;
  short: string;
  template: string;
  method: string;
  date: string;
  category: string;
  department: string;
  group: RiskGroup;
  reliability: string;
  groupText: string;
  contragentClass: 'A' | 'B' | 'C';
  internalRating: string;
  blocks: ScoreBlock[];
  totalScore: number;
  limitSteps: LimitStep[];
  downRatio: number;
  limit: number;
}

const groupFromScore = (s: number): RiskGroup => (s >= 75 ? 1 : s >= 55 ? 2 : s >= 35 ? 3 : 4);
const reliabilityOf = (g: RiskGroup): string => (g === 1 ? 'Высокая' : g === 2 ? 'Приемлемая' : g === 3 ? 'Удовлетворительная' : 'Низкая');

function categoryFor(cp: Counterparty, dir: Direction): string {
  const pool = dir === 'OIL' ? CATEGORIES_OIL : dir === 'MTR' ? CATEGORIES_MTR : CATEGORIES_ADV;
  const okved = cp.okved.toLowerCase();
  const guess =
    okved.includes('торгов') ? 'Торговля' :
    (okved.includes('нефт') || okved.includes('газ')) ? 'Добыча, переработка и транспортировка газа, нефти и нефтепродуктов' :
    okved.includes('строит') ? 'Строительство' :
    (okved.includes('транспорт') || okved.includes('склад') || okved.includes('перевозк')) ? 'Транспортировка и хранение' :
    okved.includes('произв') ? 'Производство' :
    'Прочие';
  return pool.includes(guess) ? guess : 'Прочие';
}

/** Распределяет subtotal по строкам пропорционально весам (последняя добирает остаток). */
function rows(subtotal: number, defs: { name: string; value: string; w: number; max: number }[]): IndicatorRow[] {
  const wsum = defs.reduce((s, d) => s + d.w, 0);
  let acc = 0;
  return defs.map((d, i) => {
    const pts = i === defs.length - 1 ? subtotal - acc : Math.round((subtotal * d.w) / wsum);
    acc += pts;
    return { name: d.name, value: d.value, points: Math.max(0, pts), max: d.max };
  });
}

/** Постатейный расчёт кредитного лимита — по строкам Формы №1 (та же
    отчётность, что и на вкладке «Отчётность»): показатель 1 — наименьшее из
    внеоборотных активов и чистых активов, показатель 2 — оборотные активы
    минус краткосрочные обязательства, база — наибольшее из них, лимит — база
    × понижающий коэффициент (итого баллов / 100). Для направления
    «Авансирование» база дополнительно уполовинивается (лимит авансового
    платежа исторически ниже лимита на поставку). Значения — тыс. руб.,
    как в Форме №1. */
function limitCalc(cp: Counterparty, dir: Direction, g: RiskGroup, totalScore: number): { steps: LimitStep[]; downRatio: number; limitThousands: number } {
  const st = buildStatements(cp);
  const f1 = st.blocks[0]?.rows ?? [];
  const pick = (code: string) => f1.find((r) => r.code === code)?.values[0] ?? 0;
  const fixedAssets = pick('1150');
  const netAssets = pick('1300');
  const currentAssets = pick('1200');
  const shortTermLiab = pick('1500');
  const indicator1 = Math.min(fixedAssets, netAssets);
  const indicator2 = currentAssets - shortTermLiab;
  const baseRaw = Math.max(indicator1, indicator2);
  const base = dir === 'ADVANCE' ? Math.round(baseRaw * 0.5) : baseRaw;
  const downRatio = Math.round((totalScore / 100) * 100) / 100;
  const limitThousands = g === 4 ? 0 : Math.max(0, Math.round(base * downRatio));

  return {
    steps: [
      { label: 'Внеоборотные активы (ОС+НЗС)', value: fixedAssets },
      { label: 'Чистые активы', value: netAssets },
      { label: 'Наименьшее значение (показатель 1)', value: indicator1 },
      { label: 'Оборотные активы (ОА)', value: currentAssets },
      { label: 'Краткосрочные обязательства (КО)', value: shortTermLiab },
      { label: 'ОА − КО (показатель 2)', value: indicator2 },
      { label: 'База для расчёта (наибольшее из показателей 1 и 2)' + (dir === 'ADVANCE' ? ', × 0.5 для авансирования' : ''), value: base },
    ],
    downRatio,
    limitThousands,
  };
}

function buildDirection(cp: Counterparty, dir: Direction, scoreAdj: number): DirectionResult {
  const def = DIRECTIONS.find((d) => d.key === dir)!;
  const total = Math.max(8, Math.min(98, cp.score + scoreAdj));
  // распределение по блокам: фин 45% · репутация 30% · внешние 25%
  const b1 = Math.round(total * 0.45);
  const b2 = Math.round(total * 0.3);
  const b3 = total - b1 - b2;
  const g = groupFromScore(total);
  const pdz = cp.debt.length ? Math.round((cp.debt[cp.debt.length - 1].pdz / cp.debt[cp.debt.length - 1].dz) * 100) : cp.group * 6;

  const finRows = rows(b1, [
    { name: 'Коэффициент текущей ликвидности', value: (1.0 + (4 - cp.group) * 0.35).toFixed(2), w: 3, max: 25 },
    { name: 'Коэффициент автономии', value: (0.2 + (4 - cp.group) * 0.12).toFixed(2), w: 2, max: 20 },
    { name: 'Рентабельность продаж', value: `${(cp.group === 1 ? 11 : cp.group === 2 ? 6 : cp.group === 3 ? 2 : -3).toFixed(1)} %`, w: 2, max: 20 },
    { name: 'Долговая нагрузка (Долг/EBITDA)', value: (1.2 + cp.group * 0.6).toFixed(1), w: 2, max: 20 },
    { name: 'Чистые активы', value: cp.group === 4 ? 'отрицательные' : 'положительные', w: 1, max: 15 },
  ]);
  const repRows = rows(b2, [
    { name: 'Срок деятельности', value: `${new Date().getFullYear() - new Date(cp.registered).getFullYear()} лет`, w: 2, max: 25 },
    { name: 'Платёжная дисциплина (ПДЗ)', value: `${pdz} %`, w: 3, max: 35 },
    { name: 'Судебные дела (ответчик)', value: cp.courtCases.filter((c) => c.role === 'ответчик').length ? `${cp.courtCases.filter((c) => c.role === 'ответчик').length} дел` : 'нет', w: 2, max: 25 },
    { name: 'Исполнительные производства', value: cp.courtCases.some((c) => c.kind === 'enforcement') ? 'есть' : 'нет', w: 1, max: 15 },
  ]);
  const extRows = rows(b3, [
    { name: 'Индекс РБ (СПАРК)', value: `${cp.rbIndex}/14`, w: 3, max: 40 },
    { name: 'Санкционный статус', value: cp.underSanctions ? 'под санкциями' : 'не выявлено', w: 2, max: 35 },
    { name: 'Негативные новости', value: cp.news.some((n) => n.sentiment === 'negative') ? 'есть' : 'нет', w: 1, max: 25 },
  ]);

  const { steps, downRatio, limitThousands } = limitCalc(cp, dir, g, total);
  const contragentClass: 'A' | 'B' | 'C' = total >= 70 ? 'A' : total >= 40 ? 'B' : 'C';

  return {
    direction: dir,
    label: def.label,
    short: def.short,
    template: def.template,
    method: def.method,
    date: cp.assessments[0]?.date || '2026-06-15',
    category: categoryFor(cp, dir),
    department: cp.subsidiary,
    group: g,
    reliability: reliabilityOf(g),
    groupText: groupLabel(g),
    contragentClass,
    internalRating: `${contragentClass}${g}`,
    blocks: [
      { key: 'fin', title: '1. Финансовые показатели', rows: finRows, subtotal: b1 },
      { key: 'rep', title: '2. Показатели деловой репутации', rows: repRows, subtotal: b2 },
      { key: 'ext', title: '3. Показатели из внешних источников', rows: extRows, subtotal: b3 },
    ],
    totalScore: total,
    limitSteps: steps,
    downRatio,
    limit: limitThousands * 1000,
  };
}

export function buildAssessment(cp: Counterparty): Record<Direction, DirectionResult> {
  return {
    OIL: buildDirection(cp, 'OIL', 0),
    MTR: buildDirection(cp, 'MTR', 3),
    ADVANCE: buildDirection(cp, 'ADVANCE', -2),
  };
}
