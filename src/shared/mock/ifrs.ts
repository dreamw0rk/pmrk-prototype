import type { Counterparty } from './types';
import type { StatementsData, StatementsBlock, StatementRow } from './statements';

/* Отчётность по МСФО (IFRS). В отличие от РСБУ, СПАРК/ГИР БО её не отдаёт —
   публичные компании раскрывают МСФО сами, остальным она нужна, когда
   контрагент ведёт консолидированный учёт. Поэтому единственный источник —
   «Данные компании»: сотрудник вносит показатели вручную (форма «Внести
   отчётность по МСФО»), а система по введённым статьям сама считает итоги,
   проверяет баланс и формирует таблицы отчётов по периодам.
   Все суммы — тыс. руб.; расходы вводятся со знаком «минус», как в РСБУ-формах. */

export type IfrsKey =
  // отчёт о финансовом положении — активы
  | 'ppe' | 'rou' | 'intang' | 'invest' | 'dta' | 'ncOther'
  | 'inv' | 'rec' | 'stFin' | 'cash' | 'curOther'
  // капитал
  | 'shareCap' | 'reserves' | 'retained' | 'nci'
  // обязательства
  | 'ltDebt' | 'ltLease' | 'dtl' | 'ltProv' | 'ltOther'
  | 'stDebt' | 'stLease' | 'pay' | 'taxPay' | 'stProv' | 'stOther'
  // прибыль или убыток и ПСД
  | 'revenue' | 'cos' | 'sga' | 'opOther' | 'finInc' | 'finCost' | 'assoc' | 'tax' | 'oci'
  // движение денежных средств
  | 'cfOp' | 'cfInv' | 'cfFin' | 'fx' | 'cashBegin';

export interface IfrsField { key: IfrsKey; label: string }
export interface IfrsSection { id: string; title: string; hint?: string; fields: IfrsField[] }

/** Структура формы ввода — и одновременно порядок строк в отчёте. */
export const IFRS_SECTIONS: IfrsSection[] = [
  {
    id: 'nca', title: 'Внеоборотные активы',
    fields: [
      { key: 'ppe', label: 'Основные средства' },
      { key: 'rou', label: 'Активы в форме права пользования' },
      { key: 'intang', label: 'Нематериальные активы и гудвил' },
      { key: 'invest', label: 'Инвестиции в ассоциированные и совместные предприятия' },
      { key: 'dta', label: 'Отложенные налоговые активы' },
      { key: 'ncOther', label: 'Прочие внеоборотные активы' },
    ],
  },
  {
    id: 'ca', title: 'Оборотные активы',
    fields: [
      { key: 'inv', label: 'Запасы' },
      { key: 'rec', label: 'Торговая и прочая дебиторская задолженность' },
      { key: 'stFin', label: 'Краткосрочные финансовые активы' },
      { key: 'cash', label: 'Денежные средства и их эквиваленты' },
      { key: 'curOther', label: 'Прочие оборотные активы' },
    ],
  },
  {
    id: 'eq', title: 'Капитал',
    fields: [
      { key: 'shareCap', label: 'Акционерный капитал' },
      { key: 'reserves', label: 'Прочие резервы' },
      { key: 'retained', label: 'Нераспределённая прибыль' },
      { key: 'nci', label: 'Неконтролирующие доли участия' },
    ],
  },
  {
    id: 'ltl', title: 'Долгосрочные обязательства',
    fields: [
      { key: 'ltDebt', label: 'Долгосрочные кредиты и займы' },
      { key: 'ltLease', label: 'Долгосрочные обязательства по аренде' },
      { key: 'dtl', label: 'Отложенные налоговые обязательства' },
      { key: 'ltProv', label: 'Долгосрочные оценочные обязательства' },
      { key: 'ltOther', label: 'Прочие долгосрочные обязательства' },
    ],
  },
  {
    id: 'stl', title: 'Краткосрочные обязательства',
    fields: [
      { key: 'stDebt', label: 'Краткосрочные кредиты и займы' },
      { key: 'stLease', label: 'Краткосрочные обязательства по аренде' },
      { key: 'pay', label: 'Торговая и прочая кредиторская задолженность' },
      { key: 'taxPay', label: 'Задолженность по налогам' },
      { key: 'stProv', label: 'Краткосрочные оценочные обязательства' },
      { key: 'stOther', label: 'Прочие краткосрочные обязательства' },
    ],
  },
  {
    id: 'pl', title: 'Прибыль или убыток и прочий совокупный доход',
    hint: 'Расходы вводите со знаком «минус»',
    fields: [
      { key: 'revenue', label: 'Выручка' },
      { key: 'cos', label: 'Себестоимость продаж' },
      { key: 'sga', label: 'Коммерческие и управленческие расходы' },
      { key: 'opOther', label: 'Прочие операционные доходы (расходы), нетто' },
      { key: 'finInc', label: 'Финансовые доходы' },
      { key: 'finCost', label: 'Финансовые расходы' },
      { key: 'assoc', label: 'Доля в результатах ассоциированных компаний' },
      { key: 'tax', label: 'Расход по налогу на прибыль' },
      { key: 'oci', label: 'Прочий совокупный доход (за вычетом налога)' },
    ],
  },
  {
    id: 'cf', title: 'Движение денежных средств',
    fields: [
      { key: 'cfOp', label: 'Денежные потоки от операционной деятельности' },
      { key: 'cfInv', label: 'Денежные потоки от инвестиционной деятельности' },
      { key: 'cfFin', label: 'Денежные потоки от финансовой деятельности' },
      { key: 'fx', label: 'Влияние изменения валютных курсов' },
      { key: 'cashBegin', label: 'Денежные средства на начало периода' },
    ],
  },
];

/** Значения по ключам статей: ключи статей баланса — «ключ строки» из `IfrsLine`,
    остальные — фиксированные статьи прибыли/убытка и денежных потоков. */
export type IfrsValues = Record<string, number>;

export type BalanceSectionId = 'nca' | 'ca' | 'eq' | 'ltl' | 'stl';
export const BALANCE_SECTION_IDS: BalanceSectionId[] = ['nca', 'ca', 'eq', 'ltl', 'stl'];
export const BALANCE_SECTIONS = IFRS_SECTIONS.filter((s) => BALANCE_SECTION_IDS.includes(s.id as BalanceSectionId));
export const FLOW_SECTIONS = IFRS_SECTIONS.filter((s) => !BALANCE_SECTION_IDS.includes(s.id as BalanceSectionId));

/** Статья баланса конкретной компании. Набор статей у каждой компании свой
    (отраслевая специфика, учётная политика): стандартные можно переименовать
    или убрать, свои — добавить в любой раздел. Хранится в записи периода. */
export interface IfrsLine { key: string; label: string; section: BalanceSectionId }

/** Типовой набор статей баланса — отправная точка для компании без истории. */
export const defaultIfrsLines = (): IfrsLine[] =>
  BALANCE_SECTIONS.flatMap((sec) => sec.fields.map((f) => ({ key: f.key, label: f.label, section: sec.id as BalanceSectionId })));

export interface IfrsEntry {
  id: string;
  /** отчётная дата (ISO) */
  date: string;
  consolidated: boolean;
  /** «Черновик» не попадает в таблицы отчётности, пока не сформирован */
  status: 'Черновик' | 'Сформирована';
  /** набор статей баланса именно этого периода */
  lines: IfrsLine[];
  values: IfrsValues;
}

/** Фиксированные статьи прибыли/убытка и денежных потоков. */
export const emptyIfrsValues = (): IfrsValues =>
  Object.fromEntries(FLOW_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, 0])));

const sumLines = (e: Pick<IfrsEntry, 'lines' | 'values'>, section: BalanceSectionId) =>
  e.lines.filter((l) => l.section === section).reduce((a, l) => a + (e.values[l.key] || 0), 0);

/** Итоги и контрольные суммы по введённым статьям — одни и те же для формы
    (живой пересчёт) и для таблиц отчёта. */
export function computeIfrs(e: Pick<IfrsEntry, 'lines' | 'values'>) {
  const v = e.values;
  const g = (k: string) => v[k] || 0;
  const nonCurrent = sumLines(e, 'nca');
  const current = sumLines(e, 'ca');
  const assets = nonCurrent + current;
  const equity = sumLines(e, 'eq');
  const ltl = sumLines(e, 'ltl');
  const stl = sumLines(e, 'stl');
  const liabilities = ltl + stl;
  const liabAndEquity = equity + liabilities;
  const gross = g('revenue') + g('cos');
  const operating = gross + g('sga') + g('opOther');
  const beforeTax = operating + g('finInc') + g('finCost') + g('assoc');
  const net = beforeTax + g('tax');
  const totalCI = net + g('oci');
  const cfNet = g('cfOp') + g('cfInv') + g('cfFin');
  const cashEnd = g('cashBegin') + cfNet + g('fx');
  // «Денежные средства» в балансе у разных компаний называются по-разному —
  // сверяем с ОДДС только когда в разделе есть статья с таким названием
  const cashLine = e.lines.find((l) => l.section === 'ca' && /денежн/i.test(l.label));
  return {
    nonCurrent, current, assets, equity, ltl, stl, liabilities, liabAndEquity,
    /** баланс сходится, когда активы = капитал + обязательства */
    balanceDiff: assets - liabAndEquity,
    gross, operating, beforeTax, net, totalCI, cfNet, cashEnd,
    /** остаток денежных средств по ОДДС должен совпадать со статьёй баланса */
    cashDiff: cashLine ? cashEnd - g(cashLine.key) : 0,
  };
}

/** Таблицы отчётов по формированным периодам (от свежего к старому). */
export function buildIfrsStatements(entries: IfrsEntry[]): StatementsData {
  const formed = entries.filter((e) => e.status === 'Сформирована').sort((a, b) => b.date.localeCompare(a.date));
  const calc = formed.map((e) => computeIfrs(e));
  const col = (k: string) => formed.map((e) => e.values[k] || 0);
  const f = (key: string, label: string): StatementRow => ({ label, values: col(key), indent: true });
  const total = (label: string, values: number[], strong = true): StatementRow => ({ label, values, strong });

  // Статьи баланса — объединение по всем периодам (сопоставляем по названию
  // внутри раздела): если в одном году статья была, а в другом нет — в этом
  // столбце у неё 0. Порядок — как в самом свежем периоде, затем остальные.
  const norm = (l: string) => l.trim().toLowerCase();
  const sectionRows = (section: BalanceSectionId): StatementRow[] => {
    const labels = new Map<string, string>();
    for (const e of formed) for (const l of e.lines) if (l.section === section && l.label.trim() && !labels.has(norm(l.label))) labels.set(norm(l.label), l.label.trim());
    return [...labels].map(([n, label]) => ({
      label, indent: true,
      values: formed.map((e) => e.lines.filter((l) => l.section === section && norm(l.label) === n).reduce((a, l) => a + (e.values[l.key] || 0), 0)),
    }));
  };

  const position: StatementRow[] = [
    total('Внеоборотные активы', calc.map((c) => c.nonCurrent)),
    ...sectionRows('nca'),
    total('Оборотные активы', calc.map((c) => c.current)),
    ...sectionRows('ca'),
    total('ИТОГО АКТИВЫ', calc.map((c) => c.assets)),
    total('Капитал', calc.map((c) => c.equity)),
    ...sectionRows('eq'),
    total('Долгосрочные обязательства', calc.map((c) => c.ltl)),
    ...sectionRows('ltl'),
    total('Краткосрочные обязательства', calc.map((c) => c.stl)),
    ...sectionRows('stl'),
    total('ИТОГО КАПИТАЛ И ОБЯЗАТЕЛЬСТВА', calc.map((c) => c.liabAndEquity)),
  ];

  const pl: StatementRow[] = [
    { label: 'Выручка', values: col('revenue'), strong: true },
    f('cos', 'Себестоимость продаж'),
    total('Валовая прибыль', calc.map((c) => c.gross), false),
    f('sga', 'Коммерческие и управленческие расходы'),
    f('opOther', 'Прочие операционные доходы (расходы), нетто'),
    total('Операционная прибыль', calc.map((c) => c.operating), false),
    f('finInc', 'Финансовые доходы'),
    f('finCost', 'Финансовые расходы'),
    f('assoc', 'Доля в результатах ассоциированных компаний'),
    total('Прибыль до налогообложения', calc.map((c) => c.beforeTax), false),
    f('tax', 'Расход по налогу на прибыль'),
    total('Прибыль за период', calc.map((c) => c.net)),
    f('oci', 'Прочий совокупный доход (за вычетом налога)'),
    total('Итого совокупный доход за период', calc.map((c) => c.totalCI)),
  ];

  const cf: StatementRow[] = [
    { label: 'Денежные потоки от операционной деятельности', values: col('cfOp') },
    { label: 'Денежные потоки от инвестиционной деятельности', values: col('cfInv') },
    { label: 'Денежные потоки от финансовой деятельности', values: col('cfFin') },
    total('Чистое изменение денежных средств', calc.map((c) => c.cfNet), false),
    f('fx', 'Влияние изменения валютных курсов'),
    f('cashBegin', 'Денежные средства на начало периода'),
    total('Денежные средства на конец периода', calc.map((c) => c.cashEnd)),
  ];

  const blocks: StatementsBlock[] = [
    { title: 'Отчёт о финансовом положении', rows: position },
    { title: 'Отчёт о прибыли или убытке и прочем совокупном доходе', rows: pl },
    { title: 'Отчёт о движении денежных средств', rows: cf },
  ];

  return {
    periods: formed.map((e) => e.date),
    sources: formed.map(() => 'Данные компании'),
    blocks,
    balanceCheck: calc.length > 0 && calc.every((c) => c.balanceDiff === 0),
    note: 'Отчётность по МСФО внесена вручную (источник — «Данные компании»): СПАРК и ГИР БО ФНС отчётность по МСФО не передают. Итоги и контрольные суммы рассчитываются автоматически по введённым статьям. Валюта — рубль, единицы измерения — тыс. руб.',
  };
}

/* ------------------------- хранилище прототипа ------------------------- */
// Бэкенда нет — внесённая отчётность живёт в памяти вкладки браузера и не
// теряется при переключении разделов карточки.
const STORE: Record<string, IfrsEntry[]> = {};

function splitRound(total: number, weights: number[]): number[] {
  const raw = weights.map((w) => Math.round(total * w));
  const drift = Math.round(total) - raw.reduce((a, b) => a + b, 0);
  if (drift && raw.length) raw[raw.indexOf(Math.max(...raw))] += drift;
  return raw;
}

/** Согласованный набор статей из итогов — для демо-карточки с МСФО. */
function seedValues(rev: number, np: number, ta: number, eq: number): IfrsValues {
  const v: IfrsValues = emptyIfrsValues();
  const nc = Math.round(ta * 0.62);
  const [ppe, rou, intang, invest, dta, ncOther] = splitRound(nc, [0.6, 0.04, 0.06, 0.2, 0.05, 0.05]);
  const [inv, rec, stFin, cash, curOther] = splitRound(ta - nc, [0.18, 0.3, 0.12, 0.3, 0.1]);
  const reserves = Math.round(eq * 0.06);
  const nci = Math.round(eq * 0.08);
  const shareCap = 10;
  const retained = eq - shareCap - reserves - nci;
  const liab = ta - eq;
  const lt = Math.round(liab * 0.55);
  const [ltDebt, ltLease, dtl, ltProv, ltOther] = splitRound(lt, [0.6, 0.1, 0.15, 0.1, 0.05]);
  const [stDebt, stLease, pay, taxPay, stProv, stOther] = splitRound(liab - lt, [0.2, 0.05, 0.5, 0.1, 0.05, 0.1]);

  const pbt = Math.round(np / 0.8);
  const cos = -Math.round(rev * 0.78);
  const sga = -Math.round(rev * 0.07);
  const finInc = Math.round(rev * 0.01);
  const assoc = Math.round(rev * 0.005);
  const finCost = -Math.round(rev * 0.02);
  const opOther = pbt - (rev + cos + sga + finInc + finCost + assoc);
  const cfOp = Math.round(np * 1.5);
  const cfInv = -Math.round(nc * 0.07);
  const cfFin = -Math.round(np * 0.3);
  const fx = Math.round(np * 0.01);

  Object.assign(v, {
    ppe, rou, intang, invest, dta, ncOther, inv, rec, stFin, cash, curOther,
    shareCap, reserves, retained, nci,
    ltDebt, ltLease, dtl, ltProv, ltOther, stDebt, stLease, pay, taxPay, stProv, stOther,
    revenue: rev, cos, sga, opOther, finInc, finCost, assoc, tax: np - pbt, oci: Math.round(np * 0.05),
    cfOp, cfInv, cfFin, fx, cashBegin: cash - (cfOp + cfInv + cfFin + fx),
  });
  return v;
}

/* У ПАО «Газпром нефть» консолидированная МСФО-отчётность публикуется самой
   компанией — это единственная демо-карточка с уже внесёнными периодами. */
const SEED: Record<string, { date: string; rev: number; np: number; ta: number; eq: number }[]> = {
  'cp-gpn': [
    { date: '2025-12-31', rev: 2_873_070_000, np: 281_826_000, ta: 3_137_000_000, eq: 773_800_000 },
    { date: '2024-12-31', rev: 3_261_000_000, np: 432_000_000, ta: 2_945_000_000, eq: 733_400_000 },
    { date: '2023-12-31', rev: 3_303_000_000, np: 415_300_000, ta: 3_223_000_000, eq: 640_100_000 },
  ],
};

export function getIfrsEntries(cp: Counterparty): IfrsEntry[] {
  if (!STORE[cp.uid]) {
    STORE[cp.uid] = (SEED[cp.uid] ?? []).map((s) => ({
      id: `ifrs-${cp.uid}-${s.date}`,
      date: s.date,
      consolidated: true,
      status: 'Сформирована',
      lines: defaultIfrsLines(),
      values: seedValues(s.rev, s.np, s.ta, s.eq),
    }));
  }
  return STORE[cp.uid];
}

export function saveIfrsEntry(cp: Counterparty, entry: IfrsEntry): void {
  const list = getIfrsEntries(cp).filter((e) => e.id !== entry.id);
  STORE[cp.uid] = [...list, entry].sort((a, b) => b.date.localeCompare(a.date));
}

export function deleteIfrsEntry(cp: Counterparty, id: string): void {
  STORE[cp.uid] = getIfrsEntries(cp).filter((e) => e.id !== id);
}
