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
  { key: 'dzTotal', label: 'Дебиторская Задолженность Общая, руб.', indent: 0, activity: 0.3, base: (t) => t.dz },
  { key: 'dzCurrent', label: 'Задолженность Текущая, руб.', indent: 1, activity: 0.3, base: (t) => t.dz - t.pdz },
  { key: 'dzOverdue', label: 'Задолженность Просроченная, руб.', indent: 1, activity: 0.3, base: (t) => t.pdz },
  { key: 'dzOverdue5', label: 'Задолженность просроченная до 5 дней, руб.', indent: 2, activity: 0.2, base: (t) => Math.round(t.pdz * 0.35) },
  { key: 'dzOverdue30', label: 'Задолженность просроченная от 6 до 30 дней, руб.', indent: 2, activity: 0.2, base: (t) => Math.round(t.pdz * 0.4) },
  { key: 'dzOverdueMore', label: 'Задолженность просроченная более 30 дней, руб.', indent: 2, activity: 0.15, base: (t) => t.pdz - Math.round(t.pdz * 0.35) - Math.round(t.pdz * 0.4) },
  { key: 'claims', label: 'Выставленные претензии и штрафы в адрес контрагента, руб.', indent: 1, activity: 0.08, base: (t) => Math.round(t.pdz * 0.06) },
  { key: 'dzCollateral', label: 'Сумма обеспечения дебиторской задолженности, руб.', indent: 0, activity: 0.1, base: () => 0 },
  { key: 'advanceTotal', label: 'Авансы Сумма на конец периода, руб. (без отрицательных сальдо)', indent: 0, activity: 0.35, base: (t) => t.advance },
  { key: 'advanceCollateral', label: 'Аванс Сумма обеспечения, руб.', indent: 0, activity: 0.05, base: () => 0 },
  { key: 'reserves', label: 'Сумма резервов по сомнительным долгам на конец периода, руб.', indent: 0, activity: 0.1, base: (t) => Math.round(t.pdz * 0.08) },
  { key: 'payable', label: 'Кредиторская задолженность, руб.', indent: 0, activity: 0.4, base: (t) => t.payable },
  { key: 'otherCollateral', label: 'Сумма прочего обеспечения, руб.', indent: 0, activity: 0.05, base: () => 0 },
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
