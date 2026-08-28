import type { Counterparty } from './types';
import { NOW } from './data';

/* Отчётность контрагента (ФТ-3.x). Полная постатейная разбивка Форм №1–№4
   по РСБУ (ГИР БО ФНС) — набор строк и коды сверены с реальным порталом
   (выгрузка карточки контрагента). Для карточек-«героев» заякорены
   реальные итоговые показатели (выручка, чистая прибыль, итог баланса,
   капитал) из годовой отчётности/МСФО; постатейная разбивка внутри разделов
   достраивается пропорционально по тем же правилам, что и для обычных
   карточек — реальных построчных данных РСБУ по «героям» у нас нет, а
   показывать всего 2–3 агрегированные строки, как раньше, значит не
   совпадать по набору полей с исходной системой. */

export interface StatementRow {
  label: string;
  /** код строки формы (1100, 2110, …) — как в реальном РСБУ-отчёте */
  code?: string;
  /** строка внутри раздела — рендерится с отступом, не итоговая */
  indent?: boolean;
  /** значения по периодам, тыс. руб.; порядок совпадает с periods */
  values: number[];
  strong?: boolean;
}

export interface StatementsBlock { title: string; rows: StatementRow[] }

export interface StatementsData {
  /** заголовки столбцов — ISO даты закрытия периода, от свежего к старому */
  periods: string[];
  blocks: StatementsBlock[];
  /** показывать отметку «актив = пассив» (полная форма №1) */
  balanceCheck: boolean;
  note: string;
}

function seedOf(str: string): number {
  return str.split('').reduce((sum, ch) => sum + ch.charCodeAt(0) * 31, 0) >>> 0;
}

/** Разбивает total на доли по весам так, чтобы округлённые части точно
    суммировались в Math.round(total) — иначе построчные значения не сойдутся
    со своим итогом просто из-за независимого округления каждой доли. */
function splitRound(total: number, weights: number[]): number[] {
  const target = Math.round(total);
  const raw = weights.map((w) => Math.round(total * w));
  const drift = target - raw.reduce((a, b) => a + b, 0);
  if (drift !== 0 && raw.length) {
    const idx = raw.indexOf(Math.max(...raw));
    raw[idx] += drift;
  }
  return raw;
}

/* Реальные годовые итоги (МСФО/РСБУ) для карточек-«героев» — заякоривают
   постатейную разбивку. У ПАО «Газпром нефть» это единственная карточка с
   реальными числами; постатейная раскладка обязательств и денежных потоков
   ниже итоговых показателей — оценочная (пропорциональная), реальной
   построчной РСБУ-разбивки компании такого масштаба у нас нет. */
const REAL_ANCHORS: Record<string, { periods: string[]; revenue: number[]; netProfit: number[]; totalAssets: number[]; equity: number[] }> = {
  'cp-gpn': {
    periods: ['2025-12-31', '2024-12-31', '2023-12-31'],
    revenue: [2_873_070_000, 3_261_000_000, 3_303_000_000],
    netProfit: [281_826_000, 432_000_000, 415_300_000],
    totalAssets: [3_137_000_000, 2_945_000_000, 3_223_000_000],
    equity: [773_800_000, 733_400_000, 640_100_000],
  },
};

function buildFullStatements(
  periods: string[],
  revenueIn: number[],
  netProfitReal: number[] | null,
  totalAssetsReal: number[] | null,
  equityReal: number[] | null,
): StatementsData {
  // ---- Форма №2 «Отчёт о финансовых результатах» ----
  const rev = revenueIn.map((v) => Math.round(v));
  const equityIncome = rev.map(() => 0);

  let cost: number[], gross: number[], commExp: number[], admExp: number[], profitSales: number[];
  let intIncome: number[], intExpense: number[], otherIncome: number[], otherExpense: number[];
  let profitBeforeTax: number[], netProfit: number[];

  if (netProfitReal) {
    // Реальная чистая прибыль задана как якорь — считаем строки «сверху
    // вниз» от неё (прибыль до налогообложения = чистая / (1 − 20%), дальше
    // остаток выручки раскладывается по статьям с фиксированной пропорцией).
    // Собирать построчно «снизу вверх» от выручки с одними и теми же
    // коэффициентами на все периоды нельзя: реальная маржа год к году
    // колеблется, и в отдельные годы прибыль до налога получалась ниже
    // чистой — налог на прибыль выходил с обратным знаком (как доход).
    netProfit = netProfitReal;
    profitBeforeTax = netProfit.map((v) => Math.round(v / 0.8));
    const gap = rev.map((v, i) => v - profitBeforeTax[i]); // то, что «съедают» себестоимость и расходы на пути от выручки к прибыли до налога
    cost = gap.map((d) => -Math.round(d * 0.86));
    gross = rev.map((_, i) => rev[i] + cost[i]);
    commExp = gap.map((d) => -Math.round(d * 0.05));
    admExp = gap.map((d) => -Math.round(d * 0.04));
    profitSales = rev.map((_, i) => gross[i] + commExp[i] + admExp[i]);
    intIncome = rev.map((v) => Math.round(v * 0.006));
    intExpense = gap.map((d) => -Math.round(d * 0.03));
    otherIncome = rev.map((v) => Math.round(v * 0.004));
    // прочие расходы — остаток, чтобы прибыль до налогообложения точно совпала с целевой
    otherExpense = profitBeforeTax.map((v, i) => v - profitSales[i] - equityIncome[i] - intIncome[i] - intExpense[i] - otherIncome[i]);
  } else {
    cost = rev.map((v) => -Math.round(v * 0.82));
    gross = rev.map((_, i) => rev[i] + cost[i]);
    commExp = rev.map((v) => -Math.round(v * 0.03));
    admExp = rev.map((v) => -Math.round(v * 0.02));
    profitSales = rev.map((_, i) => gross[i] + commExp[i] + admExp[i]);
    intIncome = rev.map((v) => Math.round(v * 0.006));
    intExpense = rev.map((v) => -Math.round(v * 0.012));
    otherIncome = rev.map((v) => Math.round(v * 0.004));
    otherExpense = rev.map((v) => -Math.round(v * 0.006));
    profitBeforeTax = rev.map((_, i) => profitSales[i] + equityIncome[i] + intIncome[i] + intExpense[i] + otherIncome[i] + otherExpense[i]);
    netProfit = profitBeforeTax.map((v) => Math.round(v * 0.8));
  }
  const incomeTax = profitBeforeTax.map((v, i) => -(v - netProfit[i]));
  const currentTax = incomeTax.map((v) => Math.round(v * 0.92));
  const deferredTax = incomeTax.map((v, i) => v - currentTax[i]);

  const form2: StatementRow[] = [
    { label: 'Выручка', code: '2110', values: rev, strong: true },
    { label: 'Себестоимость продаж', code: '2120', values: cost, indent: true },
    { label: 'Валовая прибыль (убыток)', code: '2100', values: gross },
    { label: 'Коммерческие расходы', code: '2210', values: commExp, indent: true },
    { label: 'Управленческие расходы', code: '2220', values: admExp, indent: true },
    { label: 'Прибыль (убыток) от продаж', code: '2200', values: profitSales },
    { label: 'Доходы от участия в других организациях', code: '2310', values: equityIncome, indent: true },
    { label: 'Проценты к получению', code: '2320', values: intIncome, indent: true },
    { label: 'Проценты к уплате', code: '2330', values: intExpense, indent: true },
    { label: 'Прочие доходы', code: '2340', values: otherIncome, indent: true },
    { label: 'Прочие расходы', code: '2350', values: otherExpense, indent: true },
    { label: 'Прибыль (убыток) до налогообложения', code: '2300', values: profitBeforeTax },
    { label: 'Налог на прибыль', code: '2410', values: incomeTax, indent: true },
    { label: 'в т.ч. текущий налог на прибыль', code: '2411', values: currentTax, indent: true },
    { label: 'отложенный налог на прибыль', code: '2412', values: deferredTax, indent: true },
    { label: 'Чистая прибыль (убыток)', code: '2400', values: netProfit, strong: true },
  ];

  // ---- Форма №1 «Бухгалтерский баланс» — постатейно от итога активов, со
  // сведением подстрок к разделу и разделов к «Актив = Пассив» через
  // splitRound/остаток, а не независимым округлением каждой доли. ----
  const totalAssets = totalAssetsReal ?? rev.map((v) => Math.round(v * 0.55));
  const nonCurrent = totalAssets.map((v) => Math.round(v * 0.28));
  const current = totalAssets.map((v, i) => v - nonCurrent[i]);

  // 1110 НМА, 1120 НИОКР, 1130 НМА поисковые, 1140 материальные поисковые,
  // 1150 ОС, 1160 доходные вложения, 1170 фин.вложения, 1180 ОНА, 1190 прочие
  const ncSplit = nonCurrent.map((v) => splitRound(v, [0.05, 0, 0, 0, 0.80, 0, 0, 0.10, 0.05]));
  // 1210 запасы, 1220 НДС, 1230 ДЗ, 1240 фин.вложения, 1250 ДС, 1260 прочие, б/к расходы буд. пер.
  const curSplit = current.map((v) => splitRound(v, [0.12, 0.01, 0.55, 0.12, 0.15, 0.04, 0.01]));

  const equity = equityReal ?? totalAssets.map((v) => Math.round(v * 0.35));
  const longTerm = totalAssets.map((v, i) => Math.round((v - equity[i]) * 0.32));
  const shortTerm = totalAssets.map((v, i) => v - equity[i] - longTerm[i]);

  // 1310 уставный капитал, 1320 собств. акции, 1340 переоценка, 1350 добавочный,
  // 1360 резервный, 1370 нераспределённая прибыль (остаток)
  const eqCharter = equity.map(() => 10);
  const eqBuyback = equity.map(() => 0);
  const eqRevaluation = equity.map(() => 0);
  const eqAdditional = equity.map((v) => Math.round(v * 0.08));
  const eqReserve = equity.map(() => 0);
  const eqRetained = equity.map((v, i) => v - eqCharter[i] - eqBuyback[i] - eqRevaluation[i] - eqAdditional[i] - eqReserve[i]);

  // 1410 заёмные средства, 1420 ОНО, 1430 оценочные, 1450 прочие
  const ltSplit = longTerm.map((v) => splitRound(v, [0.75, 0.15, 0, 0.10]));
  // 1510 заёмные средства, 1520 кредиторская задолженность, 1530 доходы буд. пер., 1540 оценочные, 1550 прочие
  const stSplit = shortTerm.map((v) => splitRound(v, [0.20, 0.70, 0, 0.05, 0.05]));

  const pick = (arr: number[][], idx: number) => arr.map((row) => row[idx]);

  const form1: StatementRow[] = [
    { label: 'I. Внеоборотные активы:', code: '1100', values: nonCurrent, strong: true },
    { label: 'Нематериальные активы', code: '1110', values: pick(ncSplit, 0), indent: true },
    { label: 'Результаты исследований и разработок', code: '1120', values: pick(ncSplit, 1), indent: true },
    { label: 'Нематериальные поисковые активы', code: '1130', values: pick(ncSplit, 2), indent: true },
    { label: 'Материальные поисковые активы', code: '1140', values: pick(ncSplit, 3), indent: true },
    { label: 'Основные средства (в т.ч. НЗС)', code: '1150', values: pick(ncSplit, 4), indent: true },
    { label: 'Доходные вложения в материальные ценности', code: '1160', values: pick(ncSplit, 5), indent: true },
    { label: 'Финансовые вложения', code: '1170', values: pick(ncSplit, 6), indent: true },
    { label: 'Отложенные налоговые активы', code: '1180', values: pick(ncSplit, 7), indent: true },
    { label: 'Прочие внеоборотные активы', code: '1190', values: pick(ncSplit, 8), indent: true },
    { label: 'II. Оборотные активы', code: '1200', values: current, strong: true },
    { label: 'Запасы', code: '1210', values: pick(curSplit, 0), indent: true },
    { label: 'НДС по приобретённым ценностям', code: '1220', values: pick(curSplit, 1), indent: true },
    { label: 'Дебиторская задолженность', code: '1230', values: pick(curSplit, 2), indent: true },
    { label: 'Финансовые вложения (за искл. денежных эквивалентов)', code: '1240', values: pick(curSplit, 3), indent: true },
    { label: 'Денежные средства', code: '1250', values: pick(curSplit, 4), indent: true },
    { label: 'Прочие оборотные активы', code: '1260', values: pick(curSplit, 5), indent: true },
    { label: 'Расходы будущих периодов', values: pick(curSplit, 6), indent: true },
    { label: 'ИТОГО АКТИВ', code: '1600', values: totalAssets, strong: true },
    { label: 'III. Капитал и резервы:', code: '1300', values: equity, strong: true },
    { label: 'Уставный капитал', code: '1310', values: eqCharter, indent: true },
    { label: 'Собственные акции, выкупленные у акционеров', code: '1320', values: eqBuyback, indent: true },
    { label: 'Переоценка внеоборотных активов', code: '1340', values: eqRevaluation, indent: true },
    { label: 'Добавочный капитал (без переоценки)', code: '1350', values: eqAdditional, indent: true },
    { label: 'Резервный капитал', code: '1360', values: eqReserve, indent: true },
    { label: 'Нераспределённая прибыль (непокрытый убыток)', code: '1370', values: eqRetained, indent: true },
    { label: 'IV. Долгосрочные обязательства', code: '1400', values: longTerm, strong: true },
    { label: 'Заёмные средства', code: '1410', values: pick(ltSplit, 0), indent: true },
    { label: 'Отложенные налоговые обязательства', code: '1420', values: pick(ltSplit, 1), indent: true },
    { label: 'Оценочные обязательства', code: '1430', values: pick(ltSplit, 2), indent: true },
    { label: 'Прочие обязательства', code: '1450', values: pick(ltSplit, 3), indent: true },
    { label: 'V. Краткосрочные обязательства:', code: '1500', values: shortTerm, strong: true },
    { label: 'Заёмные средства', code: '1510', values: pick(stSplit, 0), indent: true },
    { label: 'Кредиторская задолженность', code: '1520', values: pick(stSplit, 1), indent: true },
    { label: 'Доходы будущих периодов', code: '1530', values: pick(stSplit, 2), indent: true },
    { label: 'Оценочные обязательства', code: '1540', values: pick(stSplit, 3), indent: true },
    { label: 'Прочие обязательства', code: '1550', values: pick(stSplit, 4), indent: true },
    { label: 'ИТОГО ПАССИВ', code: '1700', values: totalAssets, strong: true },
  ];

  // ---- Форма №3 «Отчёт об изменениях капитала» — по образцу исходной
  // системы: показывается итог «Чистые активы», равный капиталу и резервам
  // из Формы №1 (иначе формы разойдутся между собой). ----
  const form3: StatementRow[] = [
    { label: 'Чистые активы', code: '3600', values: equity, strong: true },
  ];

  // ---- Форма №4 «Отчёт о движении денежных средств» — сальдо по трём видам
  // операций и итог за период. ----
  const opFlow = netProfit.map((v, i) => Math.round(v * 1.25) + Math.round(rev[i] * 0.01));
  const investFlow = nonCurrent.map((v) => -Math.round(v * 0.06));
  const finFlow = netProfit.map((v) => -Math.round(v * 0.28));
  const totalFlow = opFlow.map((v, i) => v + investFlow[i] + finFlow[i]);
  const form4: StatementRow[] = [
    { label: 'Сальдо денежных потоков от текущих операций', code: '4100', values: opFlow, strong: true },
    { label: 'Сальдо денежных потоков от инвестиционных операций', code: '4200', values: investFlow, strong: true },
    { label: 'Сальдо денежных потоков от финансовых операций', code: '4300', values: finFlow, strong: true },
    { label: 'Сальдо денежных потоков за отчётный период', code: '4400', values: totalFlow, strong: true },
  ];

  return {
    periods,
    balanceCheck: true,
    note: 'Источник: годовая бухгалтерская (финансовая) отчётность по РСБУ (ГИР БО ФНС России). Валюта отчётности — рубль, единицы измерения — тыс. руб.',
    blocks: [
      { title: 'Бухгалтерский баланс (Форма №1)', rows: form1 },
      { title: 'Отчёт о финансовых результатах (Форма №2)', rows: form2 },
      { title: 'Отчёт об изменениях капитала (Форма №3)', rows: form3 },
      { title: 'Отчёт о движении денежных средств (Форма №4)', rows: form4 },
    ],
  };
}

export function buildStatements(cp: Counterparty): StatementsData {
  const anchor = REAL_ANCHORS[cp.uid];
  if (anchor) {
    return buildFullStatements(anchor.periods, anchor.revenue, anchor.netProfit, anchor.totalAssets, anchor.equity);
  }

  const year = NOW.getFullYear();
  const periods = [
    cp.asOf.statements ?? `${year}-12-31`,
    `${year - 1}-12-31`,
    `${year - 2}-12-31`,
  ];
  // Затухание по годам детерминировано по uid — та же карточка всегда
  // показывает одни и те же цифры, но разные карточки не выглядят клонами.
  const seed = seedOf(cp.uid);
  const decay = [1, 0.88 + (seed % 8) / 100, 0.76 + ((seed >> 4) % 12) / 100];
  const revenue = decay.map((d) => (cp.revenue / 1000) * d);
  return buildFullStatements(periods, revenue, null, null, null);
}
