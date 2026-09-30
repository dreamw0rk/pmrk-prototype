import * as XLSX from 'xlsx';
import type { Counterparty } from './types';
import { buildDoLinks } from './subsidiaries';
import { BLOCKS } from './data';
import { dateRu } from '@/shared/format';

/* Детализация ДЗ/КЗ по ДО (вкладка «Данные по ДЗ и КЗ», ФТ-22.3 «Блок → ДО →
   итог», 13 аналитик). Ширина таблицы зависит от количества ДО, с которыми
   связан контрагент (buildDoLinks) — у одних контрагентов их 3–4, у крупных
   внутригрупповых — заметно больше, поэтому таблица скроллится по горизонтали,
   а не переносится. Период (месяц/год) влияет на числа детерминированно —
   переключение даёт другой, но воспроизводимый снимок. */

export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export interface DzKzColumn {
  name: string;
  block?: string;
}

export interface DzKzBlockGroup {
  key: string;
  label: string;
  columns: DzKzColumn[];
}

export interface DzKzRow {
  key: string;
  label: string;
  indent: number;
  values: Record<string, number>;
  total: number;
}

export interface DzKzTable {
  periodDate: string;
  groups: DzKzBlockGroup[];
  activeColumns: Set<string>;
  rows: DzKzRow[];
}

/** Короткая подпись ДО для узкой колонки шапки — как в реальных сводах
    («ГПН-ХАНТОС» вместо «ООО «Газпромнефть-Хантос»»). Полное имя остаётся
    в title-подсказке. */
export function shortDoLabel(name: string): string {
  const core = name.match(/«([^»]+)»/)?.[1] ?? name;
  return core.replace(/^Газпромнефть\s*[-—]\s*/i, 'ГПН-').toUpperCase();
}

function seedOf(str: string): number {
  return str.split('').reduce((sum, ch) => sum + ch.charCodeAt(0) * 31, 0) >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Делит total между колонками случайными, но детерминированными долями —
    сумма строго равна total (остаток уходит в последнюю колонку). */
function splitAmong(total: number, cols: string[], seed: number): Record<string, number> {
  if (!cols.length || !total) return {};
  const rnd = rng(seed);
  const weights = cols.map(() => 0.2 + rnd());
  const sumW = weights.reduce((s, w) => s + w, 0);
  const result: Record<string, number> = {};
  let allocated = 0;
  cols.forEach((col, i) => {
    if (i === cols.length - 1) {
      result[col] = total - allocated;
    } else {
      const v = Math.round((weights[i] / sumW) * total);
      result[col] = v;
      allocated += v;
    }
  });
  return result;
}

interface Totals { dz: number; pdz: number; advance: number; payable: number }

interface MetricDef {
  key: string;
  label: string;
  indent: number;
  /** доля колонок, у которых по этой аналитике вообще есть данные (0..1) */
  activity: number;
  base: (t: Totals) => number;
}

const METRICS: MetricDef[] = [
  { key: 'dzTotal', label: 'Дебиторская Задолженность Общая, ₽', indent: 0, activity: 0.3, base: (t) => t.dz },
  { key: 'dzCurrent', label: 'Задолженность Текущая, ₽', indent: 1, activity: 0.3, base: (t) => t.dz - t.pdz },
  { key: 'dzOverdue', label: 'Задолженность Просроченная, ₽', indent: 1, activity: 0.3, base: (t) => t.pdz },
  { key: 'dzOverdue5', label: 'Задолженность просроченная до 5 дней, ₽', indent: 2, activity: 0.2, base: (t) => Math.round(t.pdz * 0.35) },
  { key: 'dzOverdue30', label: 'Задолженность просроченная от 6 до 30 дней, ₽', indent: 2, activity: 0.2, base: (t) => Math.round(t.pdz * 0.4) },
  { key: 'dzOverdueMore', label: 'Задолженность просроченная более 30 дней, ₽', indent: 2, activity: 0.15, base: (t) => t.pdz - Math.round(t.pdz * 0.35) - Math.round(t.pdz * 0.4) },
  { key: 'claims', label: 'Выставленные претензии и штрафы в адрес контрагента, ₽', indent: 1, activity: 0.08, base: (t) => Math.round(t.pdz * 0.06) },
  { key: 'dzCollateral', label: 'Сумма обеспечения дебиторской задолженности, ₽', indent: 0, activity: 0.1, base: () => 0 },
  { key: 'advanceTotal', label: 'Авансы Сумма на конец периода, ₽ (без отрицательных сальдо)', indent: 0, activity: 0.35, base: (t) => t.advance },
  { key: 'advanceCollateral', label: 'Аванс Сумма обеспечения, ₽', indent: 0, activity: 0.05, base: () => 0 },
  { key: 'reservesDz', label: 'Сумма резервов по сомнительным долгам по ДЗ на конец периода, ₽', indent: 0, activity: 0.1, base: (t) => Math.round(t.pdz * 0.07) },
  { key: 'reservesAdvance', label: 'Сумма резервов по сомнительным долгам по авансам на конец периода, ₽', indent: 0, activity: 0.05, base: (t) => Math.round(t.advance * 0.015) },
  { key: 'payable', label: 'Кредиторская задолженность, ₽', indent: 0, activity: 0.4, base: (t) => t.payable },
  { key: 'otherCollateral', label: 'Сумма прочего обеспечения, ₽', indent: 0, activity: 0.05, base: () => 0 },
];

function fallbackTotals(c: Counterparty): Totals {
  const base = c.revenue * 0.02;
  const pdzRate = c.group === 1 ? 0.02 : c.group === 2 ? 0.05 : c.group === 3 ? 0.16 : 0.5;
  return {
    dz: Math.round(base * 1.1),
    pdz: Math.round(base * 1.1 * pdzRate),
    advance: Math.round(base * 0.2),
    payable: Math.round(base * 0.6),
  };
}

export function buildDzKzTable(c: Counterparty, month: number, year: number): DzKzTable {
  const doLinks = buildDoLinks(c);
  const columns: DzKzColumn[] = doLinks.map((l) => ({ name: l.subsidiary, block: l.block }));

  const byBlock = new Map<string, DzKzColumn[]>();
  columns.forEach((col) => {
    const key = col.block ?? '—';
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key)!.push(col);
  });
  const order = Object.keys(BLOCKS);
  const groups: DzKzBlockGroup[] = [...byBlock.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
    .map(([key, cols]) => ({ key, label: key === '—' ? 'Блок не указан' : (BLOCKS as Record<string, string>)[key], columns: cols }));

  const allCols = groups.flatMap((g) => g.columns.map((col) => col.name));

  const last = c.debt.length ? c.debt[c.debt.length - 1] : fallbackTotals(c);
  const periodMult = 0.85 + 0.3 * rng(seedOf(`${c.uid}-${year}-${month}`))();
  const totals: Totals = {
    dz: Math.round(last.dz * periodMult),
    pdz: Math.round(last.pdz * periodMult),
    advance: Math.round(last.advance * periodMult),
    payable: Math.round(last.payable * periodMult),
  };

  const activeColumns = new Set<string>();
  const rows: DzKzRow[] = METRICS.map((m) => {
    const total = Math.max(0, Math.round(m.base(totals)));
    let values: Record<string, number> = {};
    if (total > 0 && allCols.length) {
      const rowSeed = seedOf(`${c.uid}-${year}-${month}-${m.key}`);
      const rowRnd = rng(rowSeed);
      let active = allCols.filter(() => rowRnd() < m.activity);
      if (!active.length) active = [allCols[Math.floor(rowRnd() * allCols.length)]];
      values = splitAmong(total, active, rowSeed + 1);
      Object.keys(values).forEach((col) => { if (values[col]) activeColumns.add(col); });
    }
    return { key: m.key, label: m.label, indent: m.indent, values, total };
  });

  const periodDate = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  return { periodDate, groups, activeColumns, rows };
}

/* ------------------------------------------------------------------------
   Расшифровка задолженности по договорам (клик по сумме в «Детализации»).
   «Детализация» выше — это агрегат (одна цифра на пару «аналитика × ДО»);
   здесь та же цифра раскладывается на правдоподобный, но детерминированный
   список договоров, суммирующийся ровно в неё — как в исходной системе
   (модальное окно «Дебиторская и кредиторская задолженность»). Договоров,
   обеспечения и т.п. на Counterparty не хранится — это derived-мок по
   значениям из уже построенной DzKzTable. */

export interface DzKzContractRow {
  number: string;
  general: number;
  current: number;
  overdue: number;
  overdue5: number;
  overdue30: number;
  overdueMore: number;
  claims: number;
  reserve: number;
}
export interface DzKzSumRow { number: string; amount: number }
export interface DzKzContractDetail {
  /** название ДО, либо undefined — расшифровка по «Итого» (все ДО) */
  colName?: string;
  periodDate: string;
  dz: DzKzContractRow[];
  advances: DzKzSumRow[];
  payable: DzKzSumRow[];
}

/** Номер договора в формате исходной системы: «ГСН-22/01000/01541/Д». */
function contractNumber(seed: number): string {
  const yy = 21 + (seed % 4);
  const block = 1000 * (1 + ((seed >> 3) % 40));
  const tail = (seed * 7 + 1000) % 100000;
  return `ГСН-${yy}/${String(block).padStart(5, '0')}/${String(tail).padStart(5, '0')}/Д`;
}

/** Делит total на n неотрицательных слагаемых со случайными, но
    детерминированными весами — сумма всегда строго равна total. */
function splitFixed(total: number, n: number, seed: number): number[] {
  if (!n || total <= 0) return Array(n).fill(0);
  const rnd = rng(seed);
  return proportionalSplit(total, Array.from({ length: n }, () => 0.2 + rnd()));
}

/** Делит total пропорционально весам (largest remainder method) — сумма
    результата всегда строго равна total. Веса нулевые/пустые → равные доли. */
function proportionalSplit(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (!n || total <= 0) return Array(n).fill(0);
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (sumW <= 0) return splitFixed(total, n, 1);
  const raw = weights.map((w) => (w / sumW) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder && k < order.length; k++) result[order[k].i] += 1;
  return result;
}

/** Расшифровка по договорам для одной колонки таблицы «Детализация» — ДО по
    имени (`colName`) или сводно «Итого» по всем ДО (`colName` не передан,
    тогда берутся строки `total`, а не `values[col]`). */
export function buildDzKzContractDetail(c: Counterparty, table: DzKzTable, colName?: string): DzKzContractDetail {
  const v = (key: string) => {
    const row = table.rows.find((r) => r.key === key);
    if (!row) return 0;
    return colName ? row.values[colName] ?? 0 : row.total;
  };
  const baseSeed = seedOf(`${c.uid}-${colName ?? 'ИТОГО'}`);

  const generalTotal = v('dzTotal');
  const nDz = generalTotal > 0 ? 2 + Math.floor(rng(baseSeed)() * 7) : 0;
  const generalSplit = splitFixed(generalTotal, nDz, baseSeed + 1);
  const overdueSplit = proportionalSplit(v('dzOverdue'), generalSplit);
  const overdue5Split = proportionalSplit(v('dzOverdue5'), overdueSplit);
  const overdue30Split = proportionalSplit(v('dzOverdue30'), overdueSplit);
  const overdueMoreSplit = proportionalSplit(v('dzOverdueMore'), overdueSplit);
  const claimsSplit = proportionalSplit(v('claims'), overdueSplit);
  const reserveSplit = proportionalSplit(v('reservesDz'), overdueSplit);
  const dz: DzKzContractRow[] = generalSplit
    .map((general, i) => ({
      number: contractNumber(baseSeed + 13 + i * 97),
      general,
      overdue: overdueSplit[i] ?? 0,
      current: Math.max(0, general - (overdueSplit[i] ?? 0)),
      overdue5: overdue5Split[i] ?? 0,
      overdue30: overdue30Split[i] ?? 0,
      overdueMore: overdueMoreSplit[i] ?? 0,
      claims: claimsSplit[i] ?? 0,
      reserve: reserveSplit[i] ?? 0,
    }))
    .filter((r) => r.general > 0);

  const sumRows = (total: number, seedOffset: number): DzKzSumRow[] => {
    const n = total > 0 ? 1 + Math.floor(rng(baseSeed + seedOffset)() * 4) : 0;
    return splitFixed(total, n, baseSeed + seedOffset + 1)
      .map((amount, i) => ({ number: contractNumber(baseSeed + seedOffset + 31 + i * 53), amount }))
      .filter((r) => r.amount > 0);
  };

  return {
    colName,
    periodDate: table.periodDate,
    dz,
    advances: sumRows(v('advanceTotal'), 500),
    payable: sumRows(v('payable'), 900),
  };
}

/** Выгрузка таблицы «Детализация» в .xlsx — та же структура, что на экране:
    шапка «Блок → ДО» с объединёнными ячейками, колонка «Итого», строка «Дата». */
export function exportDzKzToExcel(c: Counterparty, table: DzKzTable, month: number, year: number): void {
  const allCols = table.groups.flatMap((g) => g.columns);

  const header1: (string | null)[] = ['Аналитика / подразделение'];
  table.groups.forEach((g) => {
    header1.push(g.label);
    for (let i = 1; i < g.columns.length; i++) header1.push(null);
  });
  header1.push('Итого');

  const header2: string[] = ['', ...allCols.map((col) => shortDoLabel(col.name)), ''];

  const dateRow = ['Дата', ...allCols.map((col) => (table.activeColumns.has(col.name) ? dateRu(table.periodDate) : '')), dateRu(table.periodDate)];

  const dataRows = table.rows.map((r) => [
    '  '.repeat(r.indent) + r.label,
    ...allCols.map((col) => r.values[col.name] || ''),
    r.total || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header1, header2, dateRow, ...dataRows]);

  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: allCols.length + 1 }, e: { r: 1, c: allCols.length + 1 } },
  ];
  let colIdx = 1;
  table.groups.forEach((g) => {
    if (g.columns.length > 1) merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + g.columns.length - 1 } });
    colIdx += g.columns.length;
  });
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 44 }, ...allCols.map(() => ({ wch: 16 })), { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ДЗ и КЗ');
  const safeName = (c.shortName || c.name).replace(/[«»"/\\:?*[\]]/g, '').trim();
  XLSX.writeFile(wb, `ДЗ-КЗ_${safeName}_${MONTH_NAMES[month]}_${year}.xlsx`);
}
