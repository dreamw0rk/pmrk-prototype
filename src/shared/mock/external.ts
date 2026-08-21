import type { Counterparty } from './types';
import { dateRu, money, moneyCompact } from '@/shared/format';

/* Внешняя информация (ФТ-1.3) — 11 разделов по данным СПАРК/ФНС/Госзакупки/ГПБ.
   Матрица Индекса РБ (ФТ-1.3.1). Срежиссированные значения из данных контрагента. */

export const RB_MATRIX: Record<number, { color: 'green' | 'red' | 'yellow'; desc: string }> = (() => {
  const m: Record<number, { color: 'green' | 'red' | 'yellow'; desc: string }> = {
    0: { color: 'green', desc: 'Благонадёжный клиент' },
    1: { color: 'red', desc: 'Организация включена в Перечень экстремистов' },
    8: { color: 'yellow', desc: 'Организация включена в перечень НФО, не предоставляющих отчётность три месяца и более' },
  };
  for (let i = 2; i <= 14; i++) if (!m[i]) m[i] = { color: 'yellow', desc: 'Требуется дополнительная проверка' };
  return m;
})();

export function rbSignal(index: number) {
  return RB_MATRIX[index] ?? { color: 'yellow' as const, desc: 'Требуется дополнительная проверка' };
}

type Level = 'low' | 'medium' | 'high';
export interface Indicator { label: string; value: string; level?: Level; tip?: string }
export interface SanctionDetail {
  category: string; list: string; program: string; reason: string; from: string; to: string; type: string; coOwners: string;
}
export interface CourtCaseDetail {
  plaintiff: string; number: string; category: string; state: string; outcome: string; date: string; claim: number; decision: number;
}
export interface ExternalSection { key: string; title: string; indicators?: Indicator[]; }

const lvl = (g: number, invert = false): Level => {
  const base: Level = g <= 1 ? 'low' : g <= 2 ? 'low' : g === 3 ? 'medium' : 'high';
  return invert ? (base === 'low' ? 'high' : base === 'high' ? 'low' : 'medium') : base;
};

export function buildExternal(cp: Counterparty) {
  const g = cp.group;
  const lastDz = cp.debt.length ? cp.debt[cp.debt.length - 1] : null;
  const pdz = lastDz ? Math.round((lastDz.pdz / lastDz.dz) * 100) : g * 6;
  const lawsuits = cp.courtCases.filter((c) => c.role === 'ответчик');
  const enforcement = cp.courtCases.filter((c) => c.kind === 'enforcement').reduce((s, c) => s + c.amount, 0);

  const section1: Indicator[] = [
    { label: 'Сводный риск', value: g <= 2 ? 'Низкий' : g === 3 ? 'Средний' : 'Высокий', level: lvl(g), tip: 'Сводный индикатор риска по данным СПАРК на основе финансовых и нефинансовых факторов.' },
    { label: 'Индекс должной осмотрительности (ИДО)', value: String(g <= 2 ? 18 + g * 5 : 45 + g * 12), level: lvl(g), tip: 'ИДО — оценка благонадёжности от 1 (низкий риск) до 99 (высокий риск).' },
    { label: 'Индекс финансового риска (ИФР)', value: g <= 2 ? 'Низкий' : g === 3 ? 'Средний' : 'Высокий', level: lvl(g), tip: 'ИФР отражает вероятность финансовых трудностей.' },
    { label: 'Индекс платёжной дисциплины (ИПД)', value: `${100 - pdz} / 100`, level: pdz > 20 ? 'high' : pdz > 8 ? 'medium' : 'low', tip: 'ИПД — средневзвешенный показатель оплаты счетов в срок (Paydex).' },
  ];

  const section2: Indicator[] = [
    { label: 'Факторы риска', value: g >= 3 ? `${g} активных` : 'не выявлено', level: lvl(g) },
    { label: 'Наличие судебного дела о банкротстве', value: cp.courtCases.some((c) => c.kind === 'bankruptcy') ? 'Да' : 'Нет', level: cp.courtCases.some((c) => c.kind === 'bankruptcy') ? 'high' : 'low' },
    { label: 'Сообщения о банкротстве (5 последних)', value: cp.courtCases.some((c) => c.kind === 'bankruptcy') ? '1 сообщение (ЕФРСБ)' : 'нет' },
    { label: 'Важная информация', value: cp.specialControl ? 'на особом контроле ГК ГПН' : 'нет' },
  ];

  const sanctions: SanctionDetail[] = cp.underSanctions
    ? cp.sanctions.map((s) => ({ category: 'Блокирующие санкции', list: s.program, program: s.program, reason: s.basis, from: s.date, to: '—', type: 'Секторальные/блокирующие', coOwners: 'проверяются' }))
    : [];

  const section4: Indicator[] = [
    { label: 'Оценка СПАРК · Кредитный лимит', value: cp.creditLimit ? moneyCompact(cp.creditLimit) : '—' },
    { label: 'Газпромбанк · Индекс Риска бизнеса', value: `${cp.rbIndex} / 14 — ${rbSignal(cp.rbIndex).desc}`, level: rbSignal(cp.rbIndex).color === 'green' ? 'low' : rbSignal(cp.rbIndex).color === 'red' ? 'high' : 'medium', tip: 'Индекс РБ (0…14) от Газпромбанк. Описание сигнала — по матрице РБ (ФТ-1.3.1).' },
    { label: 'АКРА · Рейтинг (прогноз)', value: g <= 2 ? 'A (стабильный)' : g === 3 ? 'BBB (негативный)' : 'нет рейтинга' },
    { label: 'АКРА · Рейтинг региона регистрации', value: 'A+ (стабильный)' },
    { label: 'Эксперт РА · Рейтинг (прогноз)', value: g <= 2 ? 'ruA (стабильный)' : 'отозван / нет' },
    { label: 'Эксперт РА · Дата обновления', value: '12.03.2026' },
  ];

  const section5: Indicator[] = [
    { label: 'Дисквалифицированные лица в составе органов', value: g === 4 ? '1 лицо' : 'не выявлено', level: g === 4 ? 'high' : 'low' },
    { label: 'Дата сведений о недоимке/задолженности', value: '01.06.2026' },
    { label: 'Сумма недоимки по налогам и сборам', value: g >= 3 ? money(enforcement || 1_200_000) : '0 ₽', level: g >= 3 ? 'medium' : 'low' },
    { label: 'Задолженность по пеням и штрафам', value: g >= 3 ? money(340_000) : '0 ₽' },
    { label: 'Сумма штрафов', value: g >= 3 ? money(180_000) : '0 ₽' },
  ];

  const section6: Indicator[] = [
    { label: 'Судебных дел (ответчик), с начала пред. года', value: String(lawsuits.length), level: lawsuits.length ? 'medium' : 'low' },
    { label: 'Сумма исков (ответчик), с начала пред. года', value: money(lawsuits.reduce((s, c) => s + c.amount, 0)) },
    { label: 'Сумма активных исполнительных производств', value: enforcement ? money(enforcement) : '0 ₽', level: enforcement ? 'medium' : 'low' },
    { label: 'Судебные дела о банкротстве (ответчик)', value: cp.courtCases.some((c) => c.kind === 'bankruptcy') ? 'Да' : 'Нет', level: cp.courtCases.some((c) => c.kind === 'bankruptcy') ? 'high' : 'low' },
    { label: 'Залоги выданные', value: g <= 2 ? 'не выявлено' : '1 предмет залога' },
  ];
  const courtCases: CourtCaseDetail[] = lawsuits.map((c, i) => ({
    plaintiff: i === 0 ? 'ООО «ТЭК-Снаб»' : 'ООО «Поставщик-' + (100 + i) + '»', number: `А56-${10000 + i * 137}/2026`, category: 'Экономические споры', state: c.status, outcome: c.status.includes('производ') ? 'рассматривается' : 'в работе', date: c.date, claim: c.amount, decision: 0,
  }));

  const section7: Indicator[] = [
    { label: 'РНП (реестр недобросовестных поставщиков)', value: g === 4 ? 'входит' : 'не входит', level: g === 4 ? 'high' : 'low' },
    { label: 'Количество РНП', value: g === 4 ? '1' : '0' },
    { label: 'РНП: общая стоимость контрактов', value: g === 4 ? money(4_200_000) : '0 ₽' },
  ];

  const section9: Indicator[] = [
    { label: 'Госзакупки · Реестр контрактов', value: '34 контракта' },
    { label: 'Госзакупки · Реестр жалоб', value: g >= 3 ? '2 жалобы' : 'нет' },
    { label: 'ФАС · Реестр субъектов естественных монополий', value: 'не входит' },
    { label: 'МЧС · Реестр лицензий', value: 'не выявлено' },
    { label: 'Единый реестр членов СРО', value: g <= 2 ? 'входит в состав СРО' : 'не входит' },
  ];

  const section10: Indicator[] = [
    { label: 'Уплачено налогов всего', value: money(Math.round(cp.revenue * 0.08)) },
    { label: 'НДС', value: money(Math.round(cp.revenue * 0.04)) },
    { label: 'Налог на прибыль', value: money(Math.round(cp.revenue * 0.02)) },
    { label: 'Страховые взносы', value: money(Math.round(cp.revenue * 0.015)) },
  ];

  const section11: Indicator[] = [
    { label: 'Признаки фирмы-однодневки', value: 'не выявлено', level: 'low' },
    { label: 'Массовый руководитель / учредитель', value: 'не выявлено', level: 'low' },
    { label: 'Адрес массовой регистрации', value: g === 4 ? 'выявлено' : 'не выявлено', level: g === 4 ? 'high' : 'low' },
  ];

  return {
    sections: [
      { key: 's1', title: 'Финансовые индикаторы риска СПАРК', indicators: section1 },
      { key: 's2', title: 'Риск-индикаторы по данным СПАРК', indicators: section2 },
      { key: 's4', title: 'Внешние рейтинги и оценки', indicators: section4 },
      { key: 's5', title: 'Риск-индикаторы по данным ФНС', indicators: section5 },
      { key: 's6', title: 'Судебные дела / Исполнительные производства / Залоги', indicators: section6 },
      { key: 's7', title: 'Реестр недобросовестных поставщиков (РНП)', indicators: section7 },
      { key: 's9', title: 'Реестры государственных служб', indicators: section9 },
      { key: 's10', title: 'Налоги и взносы', indicators: section10 },
      { key: 's11', title: 'Признаки хозяйственной деятельности', indicators: section11 },
    ] as ExternalSection[],
    sanctions,
    courtCases,
  };
}

export { dateRu, money };
