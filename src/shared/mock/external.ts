import type { Counterparty } from './types';
import { dateRu, money, moneyCompact } from '@/shared/format';

/* Внешняя информация (ФТ-1.3) — 12 разделов по данным СПАРК/ФНС/Госзакупки/ГПБ.
   Матрица Индекса РБ (ФТ-1.3.1). Срежиссированные значения из данных контрагента.
   Набор и подписи разделов сверены с реальным порталом (выгрузка карточки
   контрагента): добавлены «Реестры СПАРК» и поля, которых не хватало в каждом
   разделе; «Признаки хозяйственной деятельности» — полностью заменён, в
   реальной системе это закупки/лицензии/сертификаты/ИС/сводная статистика по
   арбитражу и исполнительным производствам/СРО/ЕГРЮЛ, а не флаги
   однодневки/массового руководителя (те в реальном разделе не встречаются). */

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

function seedOf(str: string): number {
  return str.split('').reduce((sum, ch) => sum + ch.charCodeAt(0) * 31, 0) >>> 0;
}

/* Реальные внешние рейтинги карточек-«героев». По остальным карточкам рейтинг
   выводится из группы риска — там нужен правдоподобный порядок величины. */
const REAL_RATINGS: Record<string, Indicator[]> = {
  // ПАО «Газпром нефть»: АКРА подтвердило AAA(RU) 02.04.2026, «Эксперт РА» —
  // ruAAA 16.06.2026; у Санкт-Петербурга как региона регистрации — AAA(RU).
  'cp-gpn': [
    { label: 'АКРА · Рейтинг (прогноз)', value: 'AAA(RU) (стабильный)', level: 'low', tip: 'Максимальный уровень по национальной шкале АКРА. Подтверждён 02.04.2026.' },
    { label: 'АКРА · Дата обновления рейтинга', value: '02.04.2026' },
    { label: 'АКРА · Рейтинг региона регистрации', value: 'AAA(RU) (стабильный)' },
    { label: 'АКРА · Дата обновления регионального рейтинга', value: '02.04.2026' },
    { label: 'Эксперт РА · Рейтинг (прогноз)', value: 'ruAAA (стабильный)', level: 'low', tip: 'Максимальный уровень по национальной шкале «Эксперт РА». Подтверждён 16.06.2026.' },
    { label: 'Эксперт РА · Дата обновления рейтинга', value: '16.06.2026' },
  ],
};

const SRO_POOL = [
  'АССОЦИАЦИЯ СРО «НЕФТЕГАЗСТРОЙ-АЛЬЯНС»',
  'АССОЦИАЦИЯ «СТРОЙСПЕЦПРОЕКТ»',
  'АССОЦИАЦИЯ «ИНЖГЕОСТРОЙ»',
];

export function buildExternal(cp: Counterparty) {
  const g = cp.group;
  const seed = seedOf(cp.uid);
  const lastDz = cp.debt.length ? cp.debt[cp.debt.length - 1] : null;
  const pdz = lastDz ? Math.round((lastDz.pdz / lastDz.dz) * 100) : g * 6;
  const lawsuits = cp.courtCases.filter((c) => c.role === 'ответчик');
  const enforcement = cp.courtCases.filter((c) => c.kind === 'enforcement').reduce((s, c) => s + c.amount, 0);
  const hasBankruptcyCase = cp.courtCases.some((c) => c.kind === 'bankruptcy');

  const section1: Indicator[] = [
    { label: 'Сводный риск', value: g <= 2 ? 'Низкий' : g === 3 ? 'Средний' : 'Высокий', level: lvl(g), tip: 'Сводный индикатор риска по данным СПАРК на основе финансовых и нефинансовых факторов.' },
    { label: 'Индекс должной осмотрительности (ИДО)', value: String(g <= 2 ? 18 + g * 5 : 45 + g * 12), level: lvl(g), tip: 'ИДО — оценка благонадёжности от 1 (низкий риск) до 99 (высокий риск).' },
    { label: 'Индекс финансового риска (ИФР)', value: g <= 2 ? 'Низкий' : g === 3 ? 'Средний' : 'Высокий', level: lvl(g), tip: 'ИФР отражает вероятность финансовых трудностей.' },
    { label: 'Индекс платёжной дисциплины (ИПД)', value: `${100 - pdz} / 100`, level: pdz > 20 ? 'high' : pdz > 8 ? 'medium' : 'low', tip: 'ИПД — средневзвешенный показатель оплаты счетов в срок (Paydex).' },
  ];

  const section2: Indicator[] = [
    { label: 'Факторы риска', value: g >= 3 ? `${g} активных` : 'не выявлено', level: lvl(g) },
    { label: 'Наличие заблокированных счетов', value: g === 4 && seed % 3 === 0 ? 'Да' : 'Нет', level: g === 4 && seed % 3 === 0 ? 'high' : 'low' },
    { label: 'Наличие судебного дела о банкротстве', value: hasBankruptcyCase ? 'Да' : 'Нет', level: hasBankruptcyCase ? 'high' : 'low' },
    { label: 'Сообщения о банкротстве контрагента (5 последних по дате публикации)', value: hasBankruptcyCase ? '1 сообщение (ЕФРСБ)' : 'нет' },
    { label: 'Важная информация', value: cp.specialControl ? 'на особом контроле ГК ГПН' : 'нет' },
  ];

  const sanctions: SanctionDetail[] = cp.underSanctions
    ? cp.sanctions.map((s) => {
        const blocking = /блокиру|sdn|запрет на сделки/i.test(s.program);
        return {
          category: blocking ? 'Блокирующие санкции' : 'Неблокирующие санкции',
          list: s.program,
          program: '—',
          reason: s.basis,
          from: s.date,
          to: '—',
          type: blocking ? 'Блокирующие' : 'Неблокирующие',
          coOwners: 'проверяются',
        };
      })
    : [];

  // «Реестры СПАРК» — отдельный раздел в реальной системе (SparkRisk, статус
  // контрагента по данным СПАРК и нейтральные/рисковые реестры), у нас раньше
  // не выделялся вовсе.
  const section3: Indicator[] = [
    { label: 'Нейтральные/рисковые реестры по данным СПАРК', value: g >= 3 ? 'Реестр экспедиторов; Участник Хартии АПК' : 'не выявлено' },
    { label: 'SparkRisk', value: g <= 2 ? 'Низкий' : g === 3 ? 'Средний' : 'Высокий', level: lvl(g) },
    { label: 'Статус контрагента по данным СПАРК', value: cp.status },
  ];

  const section4: Indicator[] = [
    { label: 'Оценка СПАРК · Кредитный лимит', value: cp.creditLimit ? moneyCompact(cp.creditLimit) : '—' },
    { label: 'Газпромбанк · Индекс Риска бизнеса', value: `${cp.rbIndex} / 14 — ${rbSignal(cp.rbIndex).desc}`, level: rbSignal(cp.rbIndex).color === 'green' ? 'low' : rbSignal(cp.rbIndex).color === 'red' ? 'high' : 'medium', tip: 'Индекс РБ (0…14) от Газпромбанк. Описание сигнала — по матрице РБ (ФТ-1.3.1).' },
    { label: 'Газпромбанк · Дата включения в негативный реестр', value: rbSignal(cp.rbIndex).color === 'red' ? '—' : 'не включён' },
    ...(REAL_RATINGS[cp.uid] ?? [
      { label: 'АКРА · Рейтинг (прогноз)', value: g <= 2 ? 'A (стабильный)' : g === 3 ? 'BBB (негативный)' : 'нет рейтинга' },
      { label: 'АКРА · Дата обновления рейтинга', value: g <= 3 ? '12.03.2026' : 'Нет данных' },
      { label: 'АКРА · Рейтинг региона регистрации', value: 'A+ (стабильный)' },
      { label: 'АКРА · Дата обновления регионального рейтинга', value: '12.03.2026' },
      { label: 'Эксперт РА · Рейтинг (прогноз)', value: g <= 2 ? 'ruA (стабильный)' : 'отозван / нет' },
      { label: 'Эксперт РА · Дата обновления рейтинга', value: g <= 2 ? '12.03.2026' : 'Нет данных' },
    ]),
  ];

  const section5: Indicator[] = [
    { label: 'Дисквалифицированные лица в составе исполнительных органов', value: g === 4 ? '1 лицо' : 'Нет', level: g === 4 ? 'high' : 'low' },
    { label: 'Дата сведений о недоимке и задолженности по пеням и штрафам', value: '01.08.2026' },
    { label: 'Сумма недоимки по налогам и сборам', value: g >= 3 ? money(enforcement || 1_200_000) : '0 ₽', level: g >= 3 ? 'medium' : 'low' },
    { label: 'Задолженность по пеням и штрафам', value: g >= 3 ? money(340_000) : '0 ₽' },
    { label: 'Дата сведений о сумме налоговых правонарушений', value: '31.12.2023' },
    { label: 'Сумма штрафов', value: g >= 3 ? money(180_000) : '0 ₽' },
    { label: 'Руководитель контрагента включён в реестр ФНС как массовый', value: 'Нет', level: 'low' },
  ];

  const section6: Indicator[] = [
    { label: 'Количество судебных дел (ответчик), с начала предыдущего года', value: String(lawsuits.length), level: lawsuits.length ? 'medium' : 'low' },
    { label: 'Отчётная дата', value: cp.asOf.external ? dateRu(cp.asOf.external) : '—' },
    { label: 'Сумма исков (ответчик), с начала предыдущего года', value: money(lawsuits.reduce((s, c) => s + c.amount, 0)) },
    { label: 'Сумма решений по искам за последние 2 года (ответчик)', value: money(Math.round(lawsuits.reduce((s, c) => s + c.amount, 0) * 0.15)) },
    { label: 'Сумма активных исполнительных производств', value: enforcement ? money(enforcement) : '0 ₽', level: enforcement ? 'medium' : 'low' },
    { label: 'Судебные дела о банкротстве (ответчик)', value: hasBankruptcyCase ? 'Да' : 'Нет', level: hasBankruptcyCase ? 'high' : 'low' },
    { label: 'Залоги выданные', value: g <= 2 ? 'Нет' : '1 предмет залога' },
    { label: 'Описание выданных залогов', value: g <= 2 ? '—' : 'Описание отсутствует' },
  ];
  const courtCases: CourtCaseDetail[] = lawsuits.map((c, i) => ({
    plaintiff: i === 0 ? 'ООО «ТЭК-Снаб»' : 'ООО «Поставщик-' + (100 + i) + '»', number: `А56-${10000 + i * 137}/2026`, category: 'Экономические споры', state: c.status, outcome: c.status.includes('производ') ? 'рассматривается' : 'в работе', date: c.date, claim: c.amount, decision: 0,
  }));

  const section7: Indicator[] = [
    { label: 'РНП (реестр недобросовестных поставщиков)', value: g === 4 ? 'входит' : 'не входит', level: g === 4 ? 'high' : 'low' },
    { label: 'Ссылка на реестр', value: g === 4 ? 'zakupki.gov.ru/epz/dishonestsupplier/' : 'Нет данных' },
    { label: 'Количество РНП', value: g === 4 ? '1' : '0' },
    { label: 'РНП: общая стоимость контрактов', value: g === 4 ? money(4_200_000) : '0 ₽' },
    { label: 'Планируемая дата исключения из РНП', value: g === 4 ? '—' : 'Нет данных' },
  ];

  const section9: Indicator[] = [
    { label: 'Привлечение к административной ответственности за незаконное вознаграждение', value: 'Нет', level: 'low' },
    { label: 'Госзакупки · Реестр контрактов', value: '34 контракта' },
    { label: 'Госзакупки · Реестр жалоб', value: g >= 3 ? '2 жалобы' : 'нет' },
    { label: 'ФАС · Реестр субъектов естественных монополий', value: 'не входит' },
    { label: 'МЧС · Реестр лицензий', value: 'не выявлено' },
    { label: 'Единый реестр членов СРО', value: g <= 2 ? 'входит в состав СРО' : 'не входит' },
    { label: 'Реестр лицензий Ростехнадзор', value: 'Нет данных' },
  ];

  const section10: Indicator[] = [
    { label: 'Налоговый период', value: '31.12.2025' },
    { label: 'Уплачено налогов всего', value: money(Math.round(cp.revenue * 0.08)) },
    { label: 'НДС', value: money(Math.round(cp.revenue * 0.04)) },
    { label: 'Налог на прибыль организаций', value: money(Math.round(cp.revenue * 0.02)) },
    { label: 'Страховые взносы на ОПС (ПФР)', value: money(Math.round(cp.revenue * 0.01)) },
    { label: 'Страховые взносы на ОМС', value: money(Math.round(cp.revenue * 0.003)) },
    { label: 'Страховые взносы на соц. страхование', value: money(Math.round(cp.revenue * 0.002)) },
  ];

  // «Признаки хозяйственной деятельности» — в реальной системе это закупки,
  // лицензии/сертификаты, проверки, интеллектуальная собственность, сводная
  // статистика по арбитражу и исполнительным производствам, членство в СРО и
  // исключение из ЕГРЮЛ. Флаги «однодневки»/«массового руководителя», которые
  // раньше стояли здесь, в реальном разделе с этим названием не встречаются.
  const licenses = g <= 1 ? 1 + (seed % 2) : seed % 2;
  const certificates = g <= 2 ? 10 + (seed % 60) : seed % 8;
  const checksTotal = 1 + (seed % 12);
  const trademarks = (seed >> 2) % 3;
  const software = (seed >> 4) % 8;
  const patents = (seed >> 6) % 3;
  const ipUsed = trademarks + software + patents + ((seed >> 8) % 10);
  const arbReviewing = g >= 3 ? 3 + (seed % 30) : seed % 4;
  const arbAppealed = Math.round(arbReviewing * 0.12);
  const arbDecisions = Math.round(arbReviewing * 0.09);
  const arbDone = 5 + (seed % 100);
  const arbWon = Math.round(arbDone * 0.09);
  const enforcementDone = seed % 4;
  const enforcementDoneSum = enforcementDone ? 40_000 + (seed % 700_000) : 0;
  const sroCount = g <= 2 ? seed % 3 : 0;

  const section11: Indicator[] = [
    { label: 'Закупки (сводная информация)', value: g <= 2 && seed % 3 !== 0 ? `${3 + (seed % 40)} контрактов` : 'информация по закупочной деятельности отсутствует' },
    { label: 'Количество действующих лицензий', value: `${licenses} шт.` },
    { label: 'Количество действующих сертификатов', value: `${certificates} шт.` },
    { label: 'Проверки', value: `${checksTotal} проведено всего` },
    { label: 'Интеллектуальная собственность', value: ipUsed > 0 ? `товарные знаки — ${trademarks}; программы для ЭВМ/БД — ${software}; заявки на патенты — ${patents}; объекты в использовании — ${ipUsed}` : 'не выявлено' },
    { label: 'Арбитражные дела в качестве истца и ответчика (сводная информация)', value: arbReviewing + arbDone > 0 ? `${arbReviewing} рассматриваются; ${arbAppealed} обжалуются; ${arbDecisions} решения и постановления; ${arbDone} завершено; ${arbWon} выиграно в роли ответчика` : 'не выявлено' },
    { label: 'Исполнительные производства (сводная информация)', value: enforcementDone ? `${enforcementDone} завершённых на сумму ${money(enforcementDoneSum)}` : 'не выявлено' },
    { label: 'Член СРО', value: sroCount > 0 ? SRO_POOL.slice(0, sroCount).join('; ') : 'не выявлено' },
    { label: 'Исключение из ЕГРЮЛ', value: cp.status === 'Ликвидация' ? 'предстоящее исключение недействующего юрлица' : 'Нет данных' },
  ];

  return {
    sections: [
      { key: 's1', title: 'Финансовые индикаторы риска СПАРК', indicators: section1 },
      { key: 's2', title: 'Риск-индикаторы по данным СПАРК', indicators: section2 },
      { key: 's3', title: 'Реестры СПАРК', indicators: section3 },
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
