import type { Counterparty } from './types';
import { NOW } from './data';

/* Отчётность контрагента (ФТ-3.x). Для карточек-«героев» — реальная годовая
   бухгалтерская отчётность по РСБУ (ГИР БО ФНС), для остальных — прежняя
   синтетика от выручки: там важна форма таблицы и проверка «актив = пассив»,
   а не значения. */

export interface StatementRow {
  label: string;
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

const REAL: Record<string, StatementsData> = {
  // ПАО «Газпром нефть», РСБУ. Итог баланса и капитал — по данным годовой
  // отчётности; обязательства выведены как разница «актив − капитал», поэтому
  // разбивка на долгосрочные и краткосрочные здесь не показывается.
  'cp-gpn': {
    periods: ['2025-12-31', '2024-12-31', '2023-12-31'],
    balanceCheck: false,
    note: 'Источник: годовая бухгалтерская (финансовая) отчётность по РСБУ (ГИР БО ФНС России).',
    blocks: [
      {
        title: 'Форма №1 «Бухгалтерский баланс»',
        rows: [
          { label: 'БАЛАНС (актив)', values: [3_137_000_000, 2_945_000_000, 3_223_000_000], strong: true },
          { label: 'Капитал и резервы', values: [773_800_000, 733_400_000, 640_100_000] },
          { label: 'Обязательства (итого)', values: [2_363_200_000, 2_211_600_000, 2_582_900_000] },
        ],
      },
      {
        title: 'Форма №2 «Отчёт о финансовых результатах»',
        rows: [
          { label: 'Выручка', values: [2_873_070_000, 3_261_000_000, 3_303_000_000], strong: true },
          { label: 'Чистая прибыль', values: [281_826_000, 432_000_000, 415_300_000] },
        ],
      },
    ],
  },
};

/* Синтетика для остальных карточек — ровно та же, что была зашита во вкладку:
   доли от выручки с затуханием по годам. Столбцы: текущий (незавершённый) год
   на дату актуализации отчётности и два предыдущих. */
const SHARES: [string, number][] = [
  ['Внеоборотные активы', 0.3],
  ['Оборотные активы', 0.7],
  ['БАЛАНС (актив)', 1],
  ['Капитал и резервы', 0.35],
  ['Долгосрочные обязательства', 0.2],
  ['Краткосрочные обязательства', 0.45],
  ['БАЛАНС (пассив)', 1],
];
const DECAY = [1, 0.96, 0.9];

export function buildStatements(cp: Counterparty): StatementsData {
  const real = REAL[cp.uid];
  if (real) return real;

  const year = NOW.getFullYear();
  const periods = [
    cp.asOf.statements ?? `${year}-12-31`,
    `${year - 1}-12-31`,
    `${year - 2}-12-31`,
  ];
  return {
    periods,
    balanceCheck: true,
    note: '',
    blocks: [{
      title: 'Форма №1 «Бухгалтерский баланс»',
      rows: SHARES.map(([label, k]) => ({
        label,
        strong: label.includes('БАЛАНС'),
        values: DECAY.map((d) => Math.round((cp.revenue * 0.4 * k * d) / 1000)),
      })),
    }],
  };
}
