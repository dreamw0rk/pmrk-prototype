import JSZip from 'jszip';
import type { Counterparty } from './types';
import { buildAssessment, creditIndicators } from './assessment';
import { buildStatements } from './statements';
import { buildInteractionInfo } from './interaction';
import { computeIfrs, defaultIfrsLines, getIfrsEntries, type IfrsEntry } from './ifrs';

/* Выгрузка экспресс-оценки по шаблону Ш-13.08.01-01 «Оценка кредитоспособности
   контрагента» (xlsx из методики). Шаблон не пересобирается: берётся исходный файл
   (public/templates), в нём заполняются только «голубые» ячейки ввода — шапка,
   отчётность (РСБУ и, если внесена, МСФО), показатели репутации и внешних
   источников, индикаторы, претензионно-исковая работа. Все формулы шаблона
   (баллы, группа, класс, кредитный лимит и лимит авансового платежа) остаются
   живыми и пересчитываются самим Excel по этим данным, поэтому цифры в файле —
   расчёт по методике на выгруженной отчётности, а не копия экранных моков.
   Кэшированные значения формул из примера в шаблоне вычищаются, иначе в файле
   остались бы чужие числа до первого пересчёта. */

const TEMPLATE_URL = '/templates/sh-13.08.01-01.xlsx';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

type CellValue = number | string | null;
type SheetPatch = Record<string, CellValue>;

/* ---------------------------- вспомогательное ---------------------------- */

const excelDate = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
};

const colIndex = (ref: string) => ref.replace(/\d+/g, '').split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);

/** Колонки периодов в листах отчётности: E — самый свежий, F — предыдущий, G — ещё раньше. */
const PERIOD_COLS = ['E', 'F', 'G'] as const;

/* ------------------------------ данные листов ------------------------------ */

/** Код строки РСБУ → строка листа «РСБУ отчетность». Итоговые строки разделов баланса
    (1100/1200/1300/1400/1500/1600/1700) в шаблоне — формулы, их не трогаем. */
const RSBU_ROW: Record<string, number> = {
  '1110': 8, '1120': 9, '1130': 10, '1140': 11, '1150': 12, '1157': 13, '1160': 14, '1170': 15, '1180': 16, '1185': 17, '1190': 18,
  '1210': 20, '1215': 21, '1220': 22, '1230': 23, '1237': 24, '1240': 25, '1250': 26, '1260': 27,
  '1310': 31, '1320': 32, '1340': 33, '1350': 34, '1360': 35, '1370': 36,
  '1410': 38, '1420': 39, '1430': 40, '1440': 41, '1450': 42, '1460': 43,
  '1510': 45, '1520': 46, '1530': 47, '1540': 48, '1550': 49, '1560': 50,
  '2110': 55, '2120': 56, '2100': 57, '2210': 58, '2220': 59, '2200': 60, '2310': 61, '2320': 62, '2330': 63, '2340': 64, '2350': 65,
  '2300': 66, '2410': 67, '2411': 68, '2412': 69, '2460': 70, '2400': 71,
};
/** В шаблоне расходы и налог вводятся положительными числами (в моках — со знаком «минус»). */
const RSBU_ABS = new Set(['2120', '2210', '2220', '2330', '2350', '2410', '2411']);

function rsbuPatch(c: Counterparty): SheetPatch {
  const st = buildStatements(c);
  const byCode = new Map<string, number[]>();
  for (const block of st.blocks) for (const row of block.rows) if (row.code) byCode.set(row.code, row.values);
  // «Расходы будущих периодов» в моках без кода — в шаблоне такой строки нет, уходит в «Прочие оборотные активы»
  const deferredCosts = st.blocks[0]?.rows.find((r) => r.label === 'Расходы будущих периодов')?.values ?? [];

  const patch: SheetPatch = {};
  PERIOD_COLS.forEach((col, i) => {
    const has = i < st.periods.length;
    patch[`${col}5`] = has ? excelDate(st.periods[i]) : null;
    for (const [code, row] of Object.entries(RSBU_ROW)) {
      if (!has) { patch[`${col}${row}`] = null; continue; }
      let v = byCode.get(code)?.[i] ?? 0;
      if (code === '1260') v += deferredCosts[i] ?? 0;
      if (code === '2412') v = Math.abs(byCode.get('2411')?.[i] ?? 0) - Math.abs(byCode.get('2410')?.[i] ?? 0); // налог = текущий − отложенный
      else if (RSBU_ABS.has(code)) v = Math.abs(v);
      patch[`${col}${row}`] = v;
    }
  });
  return patch;
}

/** Строка листа «МСФО отчетность» ← статьи баланса компании. В шаблоне набор строк
    фиксированный (англ. типовой МСФО-баланс), а у компании статьи свои: стандартные
    ключи раскладываются по соответствующим строкам, собственные — в «прочие» своего раздела. */
function ifrsColumn(e: IfrsEntry): Record<number, number> {
  const defaults = new Set(defaultIfrsLines().map((l) => l.key));
  const v = (k: string) => (e.lines.some((l) => l.key === k) ? e.values[k] || 0 : 0);
  const custom = (section: string) =>
    e.lines.filter((l) => l.section === section && !defaults.has(l.key)).reduce((a, l) => a + (e.values[l.key] || 0), 0);
  const t = computeIfrs(e);
  return {
    8: v('ppe') + v('rou'), 9: v('intang'), 10: v('invest'), 11: 0, 12: 0, 13: v('dta'), 14: v('ncOther') + custom('nca'),
    16: v('cash'), 17: v('stFin'), 18: v('rec'), 20: v('inv'), 21: 0, 22: v('curOther') + custom('ca'),
    26: v('shareCap'), 27: 0, 28: 0, 29: v('reserves') + custom('eq'), 30: 0, 31: v('retained'), 32: v('nci'),
    34: v('ltDebt') + v('ltLease'), 35: 0, 36: v('dtl'), 37: v('ltProv'), 38: 0, 39: v('ltOther') + custom('ltl'),
    41: v('stDebt') + v('stLease'), 42: v('pay'), 43: 0, 44: v('taxPay'), 45: 0, 46: v('stProv'), 47: v('stOther') + custom('stl'), 48: 0,
    53: e.values.revenue || 0, 54: Math.abs(e.values.cos || 0), 55: t.gross, 56: t.operating,
    57: e.values.finInc || 0, 58: Math.abs(e.values.finCost || 0), 59: t.beforeTax, 60: t.net,
  };
}
const IFRS_ROWS = [8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 20, 21, 22, 26, 27, 28, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 48, 53, 54, 55, 56, 57, 58, 59, 60];

function ifrsPatch(entries: IfrsEntry[]): SheetPatch {
  const patch: SheetPatch = { C2: 'тыс.', C3: 'руб.' }; // единицы как в моках (шаблонные mln/$ — пример)
  PERIOD_COLS.forEach((col, i) => {
    const e = entries[i];
    patch[`${col}5`] = e ? excelDate(e.date) : null;
    const vals = e ? ifrsColumn(e) : null;
    for (const row of IFRS_ROWS) patch[`${col}${row}`] = vals ? vals[row] : null;
  });
  return patch;
}

/* ------------------------- значения выпадающих списков ------------------------- */
// Допустимые значения — как в листе «Подложка» шаблона (по ним работают VLOOKUP/IF).

const claimsLabel = (n: number) =>
  n === 0 ? 'Отсутствуют' : n === 1 ? '1 претензия' : n <= 3 ? '2-3 претензии' : n <= 6 ? '4-6 претензии' : '7 и более претензий';

const DISCIPLINE: Record<string, string> = {
  'Без нарушений': 'ПДЗ отсутствовала',
  'Единичные случаи возникновения ПДЗ': 'Разовая ПДЗ продолжительностью менее 30 дней',
  'Неоднократное возникновение ПДЗ': 'Неоднократное возникновение ПДЗ',
};

function stopFactor(c: Counterparty): string {
  if (c.status === 'Банкротство') return 'Да, контрагент находится в состоянии банкротства';
  if (c.status === 'Ликвидация') return 'Да, контрагент ликвидирован';
  return 'Нет';
}

function sparkIndicator(c: Counterparty): string {
  return c.rbIndex <= 4 ? 'Низкий' : c.rbIndex <= 9 ? 'Средний' : 'Высокий';
}

/** Общие ячейки ввода листов «расчет лимита»; адреса в РСБУ- и МСФО-листе отличаются. */
function limitSheetPatch(c: Counterparty, kind: 'rsbu' | 'ifrs'): SheetPatch {
  const r = buildAssessment(c).OIL;
  const last = c.assessments.filter((a) => a.direction === 'OIL').sort((a, b) => b.date.localeCompare(a.date))[0];
  const info = buildInteractionInfo(c);
  const ind = creditIndicators(c, r.group);
  const claims = c.courtCases.filter((x) => x.kind === 'claim').length;
  const lawsuits = c.courtCases.filter((x) => x.kind === 'lawsuit').length;
  const experience = info.experience;
  const discipline = DISCIPLINE[info.paymentDiscipline] ?? 'Информация отсутствует';
  const date = excelDate(last?.date ?? r.date);
  const author = last?.author ?? 'ПМРК';
  const lawsuitLabel = lawsuits ? 'Наличие судебных разбирательств с ГК ГПН' : 'Отсутствуют';

  const common: SheetPatch = {
    L3: date,
    H7: c.name,
    H8: c.inn,
    H11: stopFactor(c),
    J41: experience, L41: experience,
    J42: discipline, L42: discipline,
    L50: excelDate(c.registered),
  };
  if (kind === 'rsbu') {
    return {
      ...common,
      H10: c.okvedCode, // категорию контрагента шаблон определяет по коду ОКВЭД формулой
      J51: sparkIndicator(c),
      J53: c.group === 4 ? 'Включен в реестр' : 'Отсутствует в реестре',
      J61: r.contragentClass, L61: r.contragentClass,
      J67: ind.graph, J68: ind.claim,
      J74: claimsLabel(claims), J75: lawsuitLabel,
      E95: author,
    };
  }
  return {
    ...common,
    H10: r.category, // в МСФО-листе категория выбирается из списка
    J58: r.contragentClass, L58: r.contragentClass,
    J64: ind.graph, J65: ind.claim,
    J71: claimsLabel(claims), J72: lawsuitLabel,
    E92: author,
  };
}

/* --------------------------------- XML --------------------------------- */

function getRow(doc: Document, sheetData: Element, rowNum: number): Element {
  const rows = Array.from(sheetData.getElementsByTagNameNS(MAIN_NS, 'row'));
  const found = rows.find((r) => Number(r.getAttribute('r')) === rowNum);
  if (found) return found;
  const row = doc.createElementNS(MAIN_NS, 'row');
  row.setAttribute('r', String(rowNum));
  const next = rows.find((r) => Number(r.getAttribute('r')) > rowNum);
  sheetData.insertBefore(row, next ?? null);
  return row;
}

function getCell(doc: Document, row: Element, ref: string): Element {
  const cells = Array.from(row.getElementsByTagNameNS(MAIN_NS, 'c'));
  const found = cells.find((x) => x.getAttribute('r') === ref);
  if (found) return found;
  const cell = doc.createElementNS(MAIN_NS, 'c');
  cell.setAttribute('r', ref);
  const next = cells.find((x) => colIndex(x.getAttribute('r')!) > colIndex(ref));
  row.insertBefore(cell, next ?? null);
  return cell;
}

function setCellValue(doc: Document, sheetData: Element, ref: string, value: CellValue) {
  const row = getRow(doc, sheetData, Number(ref.replace(/\D+/g, '')));
  const cell = getCell(doc, row, ref);
  // в ячейке ввода мог быть пример-формула (=18170) или значение — заменяем целиком, стиль (s) сохраняется
  while (cell.firstChild) cell.removeChild(cell.firstChild);
  cell.removeAttribute('t');
  if (value === null || value === '') return;
  if (typeof value === 'number') {
    const v = doc.createElementNS(MAIN_NS, 'v');
    v.textContent = String(value);
    cell.appendChild(v);
  } else {
    cell.setAttribute('t', 'inlineStr');
    const is = doc.createElementNS(MAIN_NS, 'is');
    const t = doc.createElementNS(MAIN_NS, 't');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = value;
    is.appendChild(t);
    cell.appendChild(is);
  }
}

/** У формул убираем кэш значений примера — Excel посчитает их заново. */
function stripFormulaCache(doc: Document) {
  for (const cell of Array.from(doc.getElementsByTagNameNS(MAIN_NS, 'c'))) {
    if (!cell.getElementsByTagNameNS(MAIN_NS, 'f').length) continue;
    for (const v of Array.from(cell.getElementsByTagNameNS(MAIN_NS, 'v'))) cell.removeChild(v);
    cell.removeAttribute('t');
  }
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const serialize = (doc: Document) => XML_DECL + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');

/** Имя листа → путь к его xml внутри архива. */
async function sheetPaths(zip: JSZip): Promise<Record<string, string>> {
  const wb = parse(await zip.file('xl/workbook.xml')!.async('string'));
  const rels = parse(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'));
  const target: Record<string, string> = {};
  for (const r of Array.from(rels.getElementsByTagName('Relationship'))) target[r.getAttribute('Id')!] = r.getAttribute('Target')!;
  const out: Record<string, string> = {};
  for (const s of Array.from(wb.getElementsByTagName('sheet'))) {
    out[s.getAttribute('name')!] = 'xl/' + target[s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')!];
  }
  return out;
}

/* ------------------------------- публичное API ------------------------------- */

export interface AssessmentExportResult { blob: Blob; fileName: string; ifrsIncluded: boolean }

/** Собирает xlsx по шаблону Ш-13.08.01-01 для контрагента. */
export async function buildAssessmentWorkbook(c: Counterparty): Promise<AssessmentExportResult> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) throw new Error(`Шаблон оценки не найден (${res.status})`);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const paths = await sheetPaths(zip);

  const ifrsEntries = getIfrsEntries(c).filter((e) => e.status === 'Сформирована').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const ifrsIncluded = ifrsEntries.length > 0;

  const patches: Record<string, SheetPatch> = {
    'РСБУ расчет лимита': limitSheetPatch(c, 'rsbu'),
    'РСБУ отчетность': rsbuPatch(c),
  };
  if (ifrsIncluded) {
    patches['МСФО расчет лимита'] = limitSheetPatch(c, 'ifrs');
    patches['МСФО отчетность'] = ifrsPatch(ifrsEntries);
  }

  for (const name of Object.keys(paths)) {
    const file = zip.file(paths[name]);
    if (!file) continue;
    const doc = parse(await file.async('string'));
    const sheetData = doc.getElementsByTagNameNS(MAIN_NS, 'sheetData')[0];
    for (const [ref, value] of Object.entries(patches[name] ?? {})) setCellValue(doc, sheetData, ref, value);
    stripFormulaCache(doc);
    zip.file(paths[name], serialize(doc));
  }

  // workbook: пересчёт при открытии; без МСФО-данных его листы скрываем (в них пример из шаблона)
  const wbDoc = parse(await zip.file('xl/workbook.xml')!.async('string'));
  const calcPr = wbDoc.getElementsByTagName('calcPr')[0];
  calcPr?.setAttribute('fullCalcOnLoad', '1');
  if (!ifrsIncluded) {
    for (const s of Array.from(wbDoc.getElementsByTagName('sheet'))) {
      if (s.getAttribute('name')!.startsWith('МСФО')) s.setAttribute('state', 'hidden');
    }
  }
  zip.file('xl/workbook.xml', serialize(wbDoc));

  // calcChain ссылается на ячейки, которые мы превратили из формул в значения, — Excel счёл бы файл повреждённым
  zip.remove('xl/calcChain.xml');
  const relsDoc = parse(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'));
  for (const r of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
    if (r.getAttribute('Target') === 'calcChain.xml') r.parentNode!.removeChild(r);
  }
  zip.file('xl/_rels/workbook.xml.rels', serialize(relsDoc));
  const ctDoc = parse(await zip.file('[Content_Types].xml')!.async('string'));
  for (const o of Array.from(ctDoc.getElementsByTagName('Override'))) {
    if (o.getAttribute('PartName') === '/xl/calcChain.xml') o.parentNode!.removeChild(o);
  }
  zip.file('[Content_Types].xml', serialize(ctDoc));

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  const safeName = (c.shortName || c.name).replace(/[«»"/\\:?*[\]]/g, '').trim();
  const last = c.assessments.filter((a) => a.direction === 'OIL').sort((a, b) => b.date.localeCompare(a.date))[0];
  return { blob, fileName: `Ш-13.08.01-01_Оценка_${safeName}_${(last?.date ?? '').split('-').reverse().join('.')}.xlsx`, ifrsIncluded };
}

/** Собирает файл и скачивает его браузером. */
export async function exportAssessmentToExcel(c: Counterparty): Promise<AssessmentExportResult> {
  const result = await buildAssessmentWorkbook(c);
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return result;
}
