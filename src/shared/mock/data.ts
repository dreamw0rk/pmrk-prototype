import type {
  AffiliationGraph,
  Counterparty,
  DebtPoint,
  LimitRequest,
  ReportRequest,
  RiskGroup,
  Signal,
  Task,
} from './types';

/* ============================================================================
   Срежиссированные моки ПМРК. Детерминированы (seed) — демо стабильно.
   «Текущая дата» зафиксирована, чтобы графики/сроки не плыли.
   ========================================================================== */

export const NOW = new Date('2026-06-15T09:00:00');

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function months(n: number, end = NOW): string[] {
  const res: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    res.push(d.toISOString().slice(0, 10));
  }
  return res;
}

function debtSeries(opts: { base: number; pdzStart: number; pdzEnd: number; advance: number; payable: number }): DebtPoint[] {
  const ms = months(12);
  return ms.map((date, i) => {
    const t = i / 11;
    const dz = Math.round(opts.base * (0.85 + 0.3 * t));
    const pdz = Math.round((opts.pdzStart + (opts.pdzEnd - opts.pdzStart) * t) * dz);
    return {
      date,
      dz,
      pdz,
      advance: Math.round(opts.advance * (0.9 + 0.2 * Math.sin(i))),
      payable: Math.round(opts.payable * (0.8 + 0.4 * t)),
    };
  });
}

const GROUP_LABEL: Record<RiskGroup, string> = {
  1: 'Группа 1 — высокая кредитоспособность',
  2: 'Группа 2 — приемлемая кредитоспособность',
  3: 'Группа 3 — повышенный риск',
  4: 'Группа 4 — критический риск',
};
export function groupLabel(g: RiskGroup): string {
  return GROUP_LABEL[g];
}

// --- Герои: контрагенты с полной детализацией ------------------------------

export const HEROES: Counterparty[] = [
  {
    uid: 'cp-gpn',
    name: 'ПАО «Газпром нефть»',
    shortName: 'Газпром нефть',
    inn: '5504036333',
    kpp: '783801001',
    ogrn: '1025501701686',
    status: 'Действующее',
    okved: 'Производство жидкого топлива',
    okvedCode: '19.20.1',
    region: 'г. Санкт-Петербург',
    address: '190000, г. Санкт-Петербург, наб. реки Мойки, д. 75-79, лит. Д',
    okopf: 'Публичные акционерные общества',
    ownershipForm: 'Частная собственность',
    website: 'gazprom-neft.ru',
    director: 'Дюков Александр Валерьевич, Председатель Правления',
    companySize: 'Крупные предприятия',
    taxRegime: 'ОСН',
    subsidiary: 'ПАО «Газпром нефть» (головная компания ГК)',
    group: 1,
    score: 92,
    rbIndex: 1,
    underSanctions: true,
    specialControl: true,
    isForeign: false,
    registered: '1995-10-06',
    // РСБУ 2025: выручка 2 873,1 млрд ₽ (−11,9% г/г), чистая прибыль 281,8 млрд ₽.
    // Численность — списочная по группе на конец 2025 года (МСФО).
    revenue: 2_873_070_000_000,
    employees: 87_000,
    creditLimit: 5_000_000_000,
    limitUtilization: 0.38,
    groupAggregateLimit: 22_000_000_000,
    debt: debtSeries({ base: 1_700_000_000, pdzStart: 0.004, pdzEnd: 0.009, advance: 380_000_000, payable: 1_150_000_000 }),
    assessments: [
      { id: 'as-gpn1', date: '2026-05-28', direction: 'OIL', directionLabel: 'Покупатели нефти и НП', group: 1, score: 92, limit: 5_000_000_000, author: 'Петрова И.А.' },
      { id: 'as-gpn2', date: '2026-02-20', direction: 'OIL', directionLabel: 'Покупатели нефти и НП', group: 1, score: 90, limit: 5_000_000_000, author: 'Петрова И.А.' },
    ],
    news: [
      { id: 'n-gpn1', date: '2026-06-16', title: '«Эксперт РА» подтвердил рейтинг на уровне ruAAA', source: 'PRIMO / Рейтинговые агентства', sentiment: 'positive', summary: 'Максимальный уровень по национальной шкале, прогноз «стабильный».' },
      { id: 'n-gpn2', date: '2026-05-22', title: 'Совет директоров рекомендовал финальные дивиденды за 2025 год', source: 'PRIMO / Компания', sentiment: 'positive', summary: 'Финальные 28,11 ₽ на акцию, с учётом промежуточных 17,30 ₽ — 45,41 ₽ за год (215,3 млрд ₽). ГОСА 25.06.2026, закрытие реестра 06.07.2026.' },
      { id: 'n-gpn3', date: '2026-04-13', title: 'Результаты за 2025 год по МСФО: выручка 3,61 трлн ₽ (−12%)', source: 'PRIMO / Отчётность', sentiment: 'negative', summary: 'EBITDA −21%, чистая прибыль акционеров 245,8 млрд ₽ против 479,5 млрд ₽ годом ранее — давление санкционного дисконта и крепкого рубля.' },
      { id: 'n-gpn4', date: '2026-04-02', title: 'АКРА подтвердило кредитный рейтинг на уровне AAA(RU)', source: 'PRIMO / Рейтинговые агентства', sentiment: 'positive', summary: 'Прогноз «стабильный»; очень сильный бизнес-профиль — низкая себестоимость добычи, высокие объём и глубина переработки.' },
      { id: 'n-gpn5', date: '2025-10-23', title: 'ЕС ввёл полный запрет на сделки в 19-м пакете санкций', source: 'PRIMO / Санкции', sentiment: 'negative', summary: 'Компания включена в Annex XIX Регламента 833/2014 (ст. 5aa); отменены изъятия для нефтегазовых операций и ряда зарубежных проектов.' },
      { id: 'n-gpn6', date: '2025-01-10', title: 'OFAC включил «Газпром нефть» в SDN-список, Великобритания заморозила активы', source: 'PRIMO / Санкции', sentiment: 'negative', summary: 'Минфин США внёс компанию и ряд дочерних обществ в блокирующий список (Executive Order 14024); в тот же день OFSI ввела заморозку активов.' },
    ],
    courtCases: [
      { id: 'c-gpn1', kind: 'lawsuit', role: 'истец', amount: 1_240_000_000, date: '2026-02-18', status: 'Рассмотрение по существу', subject: 'Взыскание задолженности с подрядчика' },
      { id: 'c-gpn2', kind: 'claim', role: 'ответчик', amount: 320_000_000, date: '2025-12-09', status: 'Претензия получена', subject: 'Спор по договору транспортировки' },
    ],
    sanctions: [
      { program: 'Блокирующие санкции (SDN List)', authority: 'OFAC (США)', date: '2025-01-10', basis: 'Включение в SDN-список (Executive Order 14024)' },
      { program: 'Заморозка активов (UK Sanctions List)', authority: 'OFSI (Великобритания)', date: '2025-01-10', basis: 'Designation в рамках Russia (Sanctions) (EU Exit) Regulations 2019' },
      { program: 'Полный запрет на сделки', authority: 'Евросоюз', date: '2025-10-23', basis: '19-й пакет: ст. 5aa и Annex XIX Регламента (ЕС) 833/2014' },
      { program: 'Секторальные ограничения', authority: 'Евросоюз', date: '2014-09-12', basis: 'Ограничения доступа к финансированию и к технологиям для глубоководной, арктической и сланцевой добычи' },
    ],
    pdForecast: [
      { horizon: '30+ дней', pd: 0.2 },
      { horizon: '90+ дней', pd: 0.5 },
      { horizon: '180+ дней', pd: 0.9 },
    ],
    asOf: {
      general: '2026-06-14', external: '2026-06-13', affiliation: '2026-06-12', debt: '2026-06-14',
      statements: '2026-04-01', assessment: '2026-05-28', news: '2026-06-10', security: '2026-06-05',
      'special-control': '2026-06-05', legal: '2026-06-12', 'credit-limit': '2026-06-14',
    },
    flags: ['Под санкциями (OFAC SDN, ЕС, Великобритания)', 'Контроль ПАО «Газпром» 95,68%', 'АКРА AAA(RU) · Эксперт РА ruAAA'],
  },
  {
    uid: 'cp-balt',
    name: 'ООО «Балтийская Топливная Компания»',
    shortName: 'Балтийская ТК',
    inn: '7842301551',
    kpp: '784201001',
    ogrn: '1147847210999',
    status: 'Действующее',
    okved: 'Торговля оптовая твёрдым, жидким и газообразным топливом',
    okvedCode: '46.71',
    region: 'г. Санкт-Петербург',
    address: '198035, г. Санкт-Петербург, ул. Двинская, д. 10, лит. А, пом. 12-Н',
    okopf: 'Общества с ограниченной ответственностью',
    ownershipForm: 'Частная собственность',
    website: 'baltteko.ru',
    director: 'Кузнецов Артём Игоревич, генеральный директор',
    companySize: 'Средние предприятия',
    taxRegime: 'ОСН',
    subsidiary: 'ООО «Газпромнефть-Региональные продажи»',
    group: 3,
    score: 47,
    rbIndex: 9,
    underSanctions: false,
    specialControl: true,
    isForeign: false,
    registered: '2014-08-12',
    revenue: 8_420_000_000,
    employees: 184,
    creditLimit: 120_000_000,
    limitUtilization: 0.93,
    groupAggregateLimit: 410_000_000,
    debt: debtSeries({ base: 96_000_000, pdzStart: 0.04, pdzEnd: 0.27, advance: 18_000_000, payable: 64_000_000 }),
    assessments: [
      { id: 'as-b1', date: '2026-05-21', direction: 'OIL', directionLabel: 'Покупатели нефти и НП', group: 3, score: 47, limit: 120_000_000, author: 'Соколова Е.В.' },
      { id: 'as-b2', date: '2026-02-18', direction: 'OIL', directionLabel: 'Покупатели нефти и НП', group: 2, score: 58, limit: 150_000_000, author: 'Соколова Е.В.' },
      { id: 'as-b3', date: '2025-11-12', direction: 'OIL', directionLabel: 'Покупатели нефти и НП', group: 2, score: 61, limit: 150_000_000, author: 'Иванов П.С.' },
    ],
    news: [
      { id: 'n-b1', date: '2026-06-08', title: 'Поставщик подал иск о взыскании 34 млн ₽ задолженности', source: 'PRIMO / Картотека', sentiment: 'negative', summary: 'Арбитраж принял к производству иск ООО «ТЭК-Снаб» к Балтийской ТК на 34,2 млн ₽ — просрочка по договору поставки.' },
      { id: 'n-b2', date: '2026-05-30', title: 'Снижение объёмов закупки в Северо-Западном регионе', source: 'PRIMO / Отрасль', sentiment: 'negative', summary: 'По данным отраслевого обзора, у компании сократились отгрузки на 18% кв/кв.' },
      { id: 'n-b3', date: '2026-04-02', title: 'Назначен новый финансовый директор', source: 'PRIMO / Компания', sentiment: 'neutral', summary: 'Финансовый блок возглавил Кузнецов А.И. (ранее — «Трансойл»).' },
    ],
    courtCases: [
      { id: 'c-b1', kind: 'lawsuit', role: 'ответчик', amount: 34_200_000, date: '2026-06-05', status: 'Принято к производству', subject: 'Взыскание задолженности по поставке' },
      { id: 'c-b2', kind: 'claim', role: 'ответчик', amount: 5_100_000, date: '2026-03-19', status: 'Претензия направлена', subject: 'Неустойка за просрочку оплаты' },
      { id: 'c-b3', kind: 'enforcement', role: 'должник', amount: 2_700_000, date: '2026-02-11', status: 'Исполнительное производство', subject: 'Налоговая задолженность' },
    ],
    sanctions: [],
    pdForecast: [
      { horizon: '30+ дней', pd: 6.2 },
      { horizon: '90+ дней', pd: 11.8 },
      { horizon: '180+ дней', pd: 17.4 },
    ],
    asOf: {
      general: '2026-06-14', external: '2026-06-13', affiliation: '2026-06-10', debt: '2026-06-14',
      statements: '2026-04-01', assessment: '2026-05-21', news: '2026-06-08', security: '2026-06-01',
      'special-control': '2026-05-22', legal: '2026-06-12', 'credit-limit': '2026-06-14',
    },
    flags: ['ПДЗ растёт', 'Особый контроль', 'Лимит выбран на 93%'],
  },
  {
    uid: 'cp-sibur',
    name: 'АО «Сибур-Логистика»',
    shortName: 'Сибур-Логистика',
    inn: '7707083893',
    kpp: '770701001',
    ogrn: '1027700132195',
    status: 'Действующее',
    okved: 'Деятельность вспомогательная, связанная с перевозками',
    okvedCode: '52.29',
    region: 'г. Москва',
    address: '119435, г. Москва, ул. Малая Пироговская, д. 1',
    okopf: 'Непубличные акционерные общества',
    ownershipForm: 'Частная собственность',
    website: 'sibur-logistika.ru',
    director: 'Волков Сергей Николаевич, генеральный директор',
    companySize: 'Крупные предприятия',
    taxRegime: 'ОСН',
    subsidiary: 'ООО «Газпромнефть-Логистика»',
    group: 1,
    score: 86,
    rbIndex: 2,
    underSanctions: false,
    specialControl: false,
    isForeign: false,
    registered: '2002-09-30',
    revenue: 41_200_000_000,
    employees: 1240,
    creditLimit: 600_000_000,
    limitUtilization: 0.41,
    groupAggregateLimit: 1_900_000_000,
    debt: debtSeries({ base: 220_000_000, pdzStart: 0.01, pdzEnd: 0.02, advance: 60_000_000, payable: 180_000_000 }),
    assessments: [
      { id: 'as-s1', date: '2026-05-12', direction: 'MTR', directionLabel: 'Покупатели МТР и логистики', group: 1, score: 86, limit: 600_000_000, author: 'Петрова И.А.' },
    ],
    news: [
      { id: 'n-s1', date: '2026-05-28', title: 'Расширение логистического хаба в Усть-Луге', source: 'PRIMO / Компания', sentiment: 'positive', summary: 'Запущена вторая очередь перевалочного комплекса, рост мощности на 25%.' },
    ],
    courtCases: [],
    sanctions: [],
    pdForecast: [
      { horizon: '30+ дней', pd: 0.4 },
      { horizon: '90+ дней', pd: 0.9 },
      { horizon: '180+ дней', pd: 1.6 },
    ],
    asOf: {
      general: '2026-06-14', external: '2026-06-13', affiliation: '2026-06-09', debt: '2026-06-14',
      statements: '2026-04-01', assessment: '2026-05-12', news: '2026-05-28', security: '2026-06-01',
      'special-control': '2026-06-01', legal: '2026-06-12', 'credit-limit': '2026-06-14',
    },
    flags: ['Стабильно', 'Лимит выбран на 41%'],
  },
  {
    uid: 'cp-progress',
    name: 'ООО «Торговый дом Прогресс»',
    shortName: 'ТД Прогресс',
    inn: '5024110234',
    kpp: '502401001',
    ogrn: '1095024004512',
    status: 'Действующее',
    okved: 'Торговля оптовая смазочными материалами',
    okvedCode: '46.71.3',
    region: 'Московская область',
    address: '141400, Московская область, г. Химки, ул. Ленинградская, д. 25',
    okopf: 'Общества с ограниченной ответственностью',
    ownershipForm: 'Частная собственность',
    website: 'td-progress.ru',
    director: 'Морозова Ирина Сергеевна, генеральный директор',
    companySize: 'Средние предприятия',
    taxRegime: 'УСН',
    subsidiary: 'ООО «Газпромнефть — смазочные материалы»',
    group: 2,
    score: 64,
    rbIndex: 5,
    underSanctions: false,
    specialControl: false,
    isForeign: false,
    registered: '2009-06-18',
    revenue: 3_100_000_000,
    employees: 92,
    creditLimit: 75_000_000,
    limitUtilization: 0.68,
    groupAggregateLimit: 75_000_000,
    debt: debtSeries({ base: 52_000_000, pdzStart: 0.03, pdzEnd: 0.06, advance: 9_000_000, payable: 31_000_000 }),
    assessments: [
      { id: 'as-p1', date: '2026-05-19', direction: 'MTR', directionLabel: 'Покупатели МТР и логистики', group: 2, score: 64, limit: 75_000_000, author: 'Соколова Е.В.' },
    ],
    news: [],
    courtCases: [
      { id: 'c-p1', kind: 'claim', role: 'истец', amount: 1_200_000, date: '2026-01-22', status: 'Урегулировано', subject: 'Взыскание с субподрядчика' },
    ],
    sanctions: [],
    pdForecast: [
      { horizon: '30+ дней', pd: 2.1 },
      { horizon: '90+ дней', pd: 4.0 },
      { horizon: '180+ дней', pd: 6.3 },
    ],
    asOf: {
      general: '2026-06-13', external: '2026-06-12', affiliation: '2026-06-08', debt: '2026-06-13',
      statements: '2026-04-01', assessment: '2026-05-19', news: '2026-06-01', security: '2026-06-01',
      'special-control': '2026-06-01', legal: '2026-06-10', 'credit-limit': '2026-06-13',
    },
    flags: ['Стабильно'],
  },
  {
    uid: 'cp-nevsky',
    name: 'ООО «Невские Нефтепродукты»',
    shortName: 'Невские НП',
    inn: '7811556677',
    kpp: '781101001',
    ogrn: '1127847990123',
    status: 'Банкротство',
    okved: 'Торговля оптовая моторным топливом',
    okvedCode: '46.71.2',
    region: 'г. Санкт-Петербург',
    address: '192019, г. Санкт-Петербург, пр. Обуховской Обороны, д. 70, корп. 2',
    okopf: 'Общества с ограниченной ответственностью',
    ownershipForm: 'Частная собственность',
    director: 'Соловьёв Максим Андреевич, конкурсный управляющий',
    companySize: 'Малые предприятия',
    taxRegime: 'ОСН',
    subsidiary: 'ООО «Газпромнефть-Региональные продажи»',
    group: 4,
    score: 21,
    rbIndex: 13,
    underSanctions: true,
    specialControl: true,
    isForeign: false,
    registered: '2012-03-05',
    revenue: 1_900_000_000,
    employees: 47,
    creditLimit: 0,
    limitUtilization: 0,
    groupAggregateLimit: 0,
    debt: debtSeries({ base: 40_000_000, pdzStart: 0.2, pdzEnd: 0.74, advance: 0, payable: 88_000_000 }),
    assessments: [
      { id: 'as-n1', date: '2026-04-30', direction: 'OIL', directionLabel: 'Покупатели нефти и НП', group: 4, score: 21, limit: 0, author: 'Соколова Е.В.' },
    ],
    news: [
      { id: 'n-n1', date: '2026-06-01', title: 'Введена процедура наблюдения', source: 'PRIMO / Банкротства', sentiment: 'negative', summary: 'Арбитражный суд ввёл наблюдение по заявлению кредитора, требования 88 млн ₽.' },
    ],
    courtCases: [
      { id: 'c-n1', kind: 'bankruptcy', role: 'должник', amount: 88_000_000, date: '2026-06-01', status: 'Наблюдение', subject: 'Дело о несостоятельности' },
    ],
    sanctions: [
      { program: 'Блокирующие санкции (SDN)', authority: 'OFAC', date: '2025-12-10', basis: 'Включение в санкционный список' },
    ],
    pdForecast: [
      { horizon: '30+ дней', pd: 38.0 },
      { horizon: '90+ дней', pd: 61.0 },
      { horizon: '180+ дней', pd: 79.0 },
    ],
    asOf: {
      general: '2026-06-12', external: '2026-06-13', affiliation: '2026-06-05', debt: '2026-06-12',
      statements: '2026-01-01', assessment: '2026-04-30', news: '2026-06-01', security: '2026-06-10',
      'special-control': '2026-06-02', legal: '2026-06-12', 'credit-limit': '2026-06-12',
    },
    flags: ['Под санкциями', 'Банкротство', 'Особый контроль'],
  },
  {
    uid: 'cp-rnsnab',
    name: 'ПАО «РН-Снабжение»',
    shortName: 'РН-Снабжение',
    inn: '7706222333',
    kpp: '770601001',
    ogrn: '1037706012345',
    status: 'Действующее',
    okved: 'Торговля оптовая прочая',
    okvedCode: '46.90',
    region: 'г. Москва',
    address: '117997, г. Москва, Софийская наб., д. 26',
    okopf: 'Публичные акционерные общества',
    ownershipForm: 'Частная собственность',
    website: 'rn-snab.ru',
    director: 'Громов Андрей Викторович, генеральный директор',
    companySize: 'Крупные предприятия',
    taxRegime: 'ОСН',
    subsidiary: 'ООО «Газпромнефть-Снабжение»',
    group: 2,
    score: 66,
    rbIndex: 6,
    underSanctions: false,
    specialControl: false,
    isForeign: false,
    registered: '2003-11-21',
    revenue: 28_700_000_000,
    employees: 870,
    creditLimit: 450_000_000,
    limitUtilization: 0.55,
    groupAggregateLimit: 1_250_000_000,
    debt: debtSeries({ base: 180_000_000, pdzStart: 0.02, pdzEnd: 0.05, advance: 40_000_000, payable: 120_000_000 }),
    assessments: [
      { id: 'as-r1', date: '2026-05-05', direction: 'MTR', directionLabel: 'Покупатели МТР и логистики', group: 2, score: 66, limit: 450_000_000, author: 'Петрова И.А.' },
    ],
    news: [],
    courtCases: [],
    sanctions: [],
    pdForecast: [
      { horizon: '30+ дней', pd: 1.8 },
      { horizon: '90+ дней', pd: 3.4 },
      { horizon: '180+ дней', pd: 5.0 },
    ],
    asOf: {
      general: '2026-06-14', external: '2026-06-13', affiliation: '2026-06-11', debt: '2026-06-14',
      statements: '2026-04-01', assessment: '2026-05-05', news: '2026-06-01', security: '2026-06-01',
      'special-control': '2026-06-01', legal: '2026-06-12', 'credit-limit': '2026-06-14',
    },
    flags: ['Крупная группа', 'Совокупный лимит 1,25 млрд'],
  },
  {
    uid: 'cp-yugtrans',
    name: 'ООО «ЮгТрансОйл»',
    shortName: 'ЮгТрансОйл',
    inn: '6164099887',
    kpp: '616401001',
    ogrn: '1116164007766',
    status: 'Действующее',
    okved: 'Деятельность автомобильного грузового транспорта',
    okvedCode: '49.41',
    region: 'Ростовская область',
    address: '344029, Ростовская область, г. Ростов-на-Дону, ул. Извилистая, д. 21',
    okopf: 'Общества с ограниченной ответственностью',
    ownershipForm: 'Частная собственность',
    website: 'yugtransoil.ru',
    director: 'Ткаченко Олег Владимирович, генеральный директор',
    companySize: 'Малые предприятия',
    taxRegime: 'УСН',
    subsidiary: 'ООО «Газпромнефть-Логистика»',
    group: 3,
    score: 44,
    rbIndex: 10,
    underSanctions: false,
    specialControl: false,
    isForeign: false,
    registered: '2011-07-14',
    revenue: 2_300_000_000,
    employees: 130,
    creditLimit: 60_000_000,
    limitUtilization: 0.81,
    groupAggregateLimit: 95_000_000,
    debt: debtSeries({ base: 58_000_000, pdzStart: 0.05, pdzEnd: 0.19, advance: 6_000_000, payable: 44_000_000 }),
    assessments: [
      { id: 'as-y1', date: '2026-05-25', direction: 'ADVANCE', directionLabel: 'Лимит авансирования', group: 3, score: 44, limit: 60_000_000, author: 'Соколова Е.В.' },
    ],
    news: [
      { id: 'n-y1', date: '2026-06-03', title: 'Рост просроченной задолженности перед поставщиками', source: 'PRIMO / Отрасль', sentiment: 'negative', summary: 'Отмечен рост ПДЗ; компания ведёт переговоры о реструктуризации.' },
    ],
    courtCases: [
      { id: 'c-y1', kind: 'claim', role: 'ответчик', amount: 3_400_000, date: '2026-05-10', status: 'Претензия направлена', subject: 'Просрочка оплаты ГСМ' },
    ],
    sanctions: [],
    pdForecast: [
      { horizon: '30+ дней', pd: 5.0 },
      { horizon: '90+ дней', pd: 9.5 },
      { horizon: '180+ дней', pd: 14.2 },
    ],
    asOf: {
      general: '2026-06-13', external: '2026-06-12', affiliation: '2026-06-09', debt: '2026-06-13',
      statements: '2026-04-01', assessment: '2026-05-25', news: '2026-06-03', security: '2026-06-01',
      'special-control': '2026-06-01', legal: '2026-06-11', 'credit-limit': '2026-06-13',
    },
    flags: ['ПДЗ растёт', 'Лимит выбран на 81%'],
  },
];

// --- Реестр: тысячи строк для виртуализации (герои + сгенерированные) -------

const NAME_CORES = [
  'НефтеТрейд', 'ТопливоСбыт', 'РегионОйл', 'ПромРесурс', 'ТрансЛогистик', 'СеверСнаб', 'ЮгТорг',
  'УралНефтепродукт', 'СибПоставка', 'БалтОйл', 'ВолгаТЭК', 'ГазСтройСнаб', 'ТД Меридиан',
  'ПромТоргКомплект', 'ЭнергоСбыт', 'НефтеХимТрейд', 'АвтоГСМ', 'ТрансБункер', 'ОптТопливо', 'ГСМ-Центр',
];
const NAME_FORMS = ['ООО', 'АО', 'ПАО', 'ООО ТД', 'АО ПК'];
const REGIONS = ['г. Москва', 'г. Санкт-Петербург', 'Московская область', 'Свердловская область', 'Краснодарский край', 'Республика Татарстан', 'Новосибирская область', 'Ростовская область', 'Самарская область', 'Тюменская область'];

/* Поля ЕГРЮЛ/СПАРК, которых не было в исходной модели (адрес, ОКОПФ, форма
   собственности, сайт, руководитель, размер предприятия, налоговый режим) —
   добавлены при сверке набора полей с реальным порталом (вкладка «Общие
   сведения»). Для «героев» заданы вручную выше, для остальных 4200 карточек —
   генерируются здесь детерминированно. */
const STREETS = ['Ленина', 'Промышленная', 'Заводская', 'Складская', 'Индустриальная', 'Мира', 'Гагарина', 'Советская', 'Нефтяников', 'Транспортная'];
const LAST_NAMES = ['Иванов', 'Петров', 'Смирнов', 'Кузнецов', 'Соколов', 'Морозов', 'Волков', 'Ткаченко', 'Никитин', 'Фролов'];
const FIRST_NAMES = ['Александр', 'Сергей', 'Дмитрий', 'Андрей', 'Игорь', 'Олег', 'Максим', 'Владимир'];
const MIDDLE_NAMES = ['Александрович', 'Сергеевич', 'Дмитриевич', 'Андреевич', 'Игоревич', 'Олегович', 'Николаевич', 'Владимирович'];
const OKOPF_BY_FORM: Record<string, string> = {
  'ООО': 'Общества с ограниченной ответственностью',
  'ООО ТД': 'Общества с ограниченной ответственностью',
  'АО': 'Непубличные акционерные общества',
  'АО ПК': 'Непубличные акционерные общества',
  'ПАО': 'Публичные акционерные общества',
};
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l',
  м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh',
  щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
function translit(s: string): string {
  return s.toLowerCase().split('').map((ch) => TRANSLIT[ch] ?? (/[a-z0-9]/.test(ch) ? ch : '')).join('');
}
function directorTitle(status: string): string {
  if (status === 'Банкротство') return 'конкурсный управляющий';
  if (status === 'Ликвидация') return 'ликвидатор';
  return 'генеральный директор';
}
function companySizeByEmployees(employees: number): string {
  if (employees < 15) return 'Микропредприятия';
  if (employees < 100) return 'Малые предприятия';
  if (employees < 250) return 'Средние предприятия';
  return 'Крупные предприятия';
}
/* --- Дочерние общества ГК «Газпром нефть» и их принадлежность к блокам --------
   Блоки — верхний уровень управленческой структуры ГК: контрагент, как правило,
   работает не с одним ДО, а с несколькими, и в отчётности они сворачиваются
   именно до блока (ФТ-22.3 «Блок → ДО → итог»). Коды блоков (БРД, БЛПС, …) —
   те же сокращения, что в управленческой отчётности; полные наименования нужны
   в списках выбора области подписки (ФТ-62.4). */

export const BLOCKS = {
  'БРД': 'Блок разведки и добычи',
  'БЛПС': 'Блок логистики, переработки и сбыта',
  'БЭФ': 'Блок экономики и финансов',
  'БЦТ': 'Блок цифровой трансформации',
  'АУ': 'Аппарат управления',
} as const;

export type BlockCode = keyof typeof BLOCKS;

/** Полные наименования блоков — для выпадающих списков области подписки. */
export const BLOCK_NAMES: string[] = Object.values(BLOCKS);

/** ДО → блок. Порядок ключей задаёт и порядок справочника SUBS. */
export const SUB_BLOCK: Record<string, BlockCode> = {
  'ООО «Газпромнефть-Хантос»': 'БРД',
  'АО «Газпромнефть-Ноябрьскнефтегаз»': 'БРД',
  'ООО «Газпромнефть-Восток»': 'БРД',
  'ООО «Газпром нефть шельф»': 'БРД',
  'АО «Газпромнефть-ОНПЗ»': 'БЛПС',
  'АО «Газпромнефть-МНПЗ»': 'БЛПС',
  'ООО «Газпромнефть-Региональные продажи»': 'БЛПС',
  'ООО «Газпромнефть-Центр»': 'БЛПС',
  'ООО «Газпромнефть-Логистика»': 'БЛПС',
  'ООО «Газпромнефть Марин Бункер»': 'БЛПС',
  'ООО «Газпромнефть — смазочные материалы»': 'БЛПС',
  'ООО «Газпромнефть-Снабжение»': 'БЛПС',
  'АО «Газпромнефть-Аэро»': 'БЛПС',
  'ООО «Газпромнефть — Цифровые решения»': 'БЦТ',
  'ООО «Газпромнефть Бизнес-сервис»': 'АУ',
};

/* Реальные ИНН дочерних обществ (ЕГРЮЛ). Наименования в справочнике даны в
   привычном по ГК виде: часть обществ в ЕГРЮЛ уже переименована в сокращённую
   форму (ГПН-Логистика, Газпромнефть-СМ, Газпромнефть-ЦР, Газпромнефть-ННГ),
   но юрлицо и ИНН те же. ДО блока экономики и финансов (БЭФ) в справочнике нет:
   финансовые функции ГК сосредоточены в ПАО и в ОЦО «Газпромнефть Бизнес-сервис». */
const SUB_INN: Record<string, string> = {
  'ООО «Газпромнефть-Хантос»': '8618006063',
  'АО «Газпромнефть-Ноябрьскнефтегаз»': '8905000428',
  'ООО «Газпромнефть-Восток»': '7017126251',
  'ООО «Газпром нефть шельф»': '7725610285',
  'АО «Газпромнефть-ОНПЗ»': '5501041254',
  'АО «Газпромнефть-МНПЗ»': '7723006328',
  'ООО «Газпромнефть-Региональные продажи»': '4703105075',
  'ООО «Газпромнефть-Центр»': '7709359770',
  'ООО «Газпромнефть-Логистика»': '8905039538',
  'ООО «Газпромнефть Марин Бункер»': '7838392447',
  'ООО «Газпромнефть — смазочные материалы»': '7728640182',
  'ООО «Газпромнефть-Снабжение»': '5501072608',
  'АО «Газпромнефть-Аэро»': '7714117720',
  'ООО «Газпромнефть — Цифровые решения»': '7728654530',
  'ООО «Газпромнефть Бизнес-сервис»': '8905044954',
};

export const SUBS = Object.keys(SUB_BLOCK);

/** Блок, к которому относится ДО. Для ДО вне справочника (головная компания ГК
    в роли «ДО» у самой себя) блок неизвестен — возвращаем undefined. */
export function blockOf(subsidiary: string): BlockCode | undefined {
  return SUB_BLOCK[subsidiary];
}

/** ИНН ДО. У обществ из справочника — настоящий ИНН из ЕГРЮЛ; для ДО вне
    справочника (например, головная компания ГК в роли «ДО» у самой себя)
    реквизитов в модели нет, поэтому ИНН генерируется детерминированно от
    наименования — чтобы один и тот же ДО везде показывался одинаково. */
export function doInn(subsidiary: string): string {
  const real = SUB_INN[subsidiary];
  if (real) return real;
  const seed = subsidiary.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const h = seed * 9301 + 49297;
  return `77${String(h % 100_000_000).padStart(8, '0')}`;
}

function makeRegistry(): Counterparty[] {
  const rnd = seeded(424242);
  const rows: Counterparty[] = [...HEROES];
  const total = 4200;
  for (let i = 0; i < total; i++) {
    const core = NAME_CORES[Math.floor(rnd() * NAME_CORES.length)];
    const form = NAME_FORMS[Math.floor(rnd() * NAME_FORMS.length)];
    const suffix = 1000 + Math.floor(rnd() * 8999);
    const name = `${form} «${core}-${suffix}»`;
    const groupRoll = rnd();
    const group: RiskGroup = groupRoll < 0.18 ? 1 : groupRoll < 0.52 ? 2 : groupRoll < 0.84 ? 3 : 4;
    const score = group === 1 ? 78 + rnd() * 20 : group === 2 ? 58 + rnd() * 18 : group === 3 ? 38 + rnd() * 18 : 12 + rnd() * 22;
    const underSanctions = rnd() < 0.03;
    const status = group === 4 && rnd() < 0.25 ? 'Банкротство' : 'Действующее';
    const limit = group === 4 ? 0 : Math.round((10 + rnd() * 240)) * 1_000_000;
    const region = REGIONS[Math.floor(rnd() * REGIONS.length)];
    const employees = 10 + Math.floor(rnd() * 1500);

    // Поля ЕГРЮЛ, добавленные при сверке с реальным порталом (адрес, ОКОПФ,
    // форма собственности, сайт, руководитель, размер предприятия, налоговый режим).
    const postal = 100000 + Math.floor(rnd() * 599999);
    const street = STREETS[Math.floor(rnd() * STREETS.length)];
    const houseNo = 1 + Math.floor(rnd() * 120);
    const address = region.startsWith('г. ') ? `${postal}, ${region}, ул. ${street}, д. ${houseNo}` : `${region}, ул. ${street}, д. ${houseNo}`;
    const okopf = OKOPF_BY_FORM[form] ?? 'Общества с ограниченной ответственностью';
    const website = rnd() < 0.7 ? `${translit(core)}${suffix}.ru` : undefined;
    const director = `${LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)]} ${FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)]} ${MIDDLE_NAMES[Math.floor(rnd() * MIDDLE_NAMES.length)]}, ${directorTitle(status)}`;
    const taxRoll = rnd();
    const taxRegime = employees > 250 ? 'ОСН' : taxRoll < 0.55 ? 'УСН' : taxRoll < 0.9 ? 'ОСН' : 'Нет данных';

    rows.push({
      uid: `cp-${(100000 + i).toString(36)}`,
      name,
      shortName: name.replace(/^(ООО|АО|ПАО)\s«/, '').replace(/»$/, '').slice(0, 26),
      inn: String(5000000000 + Math.floor(rnd() * 4999999999)).slice(0, 10),
      kpp: String(500000000 + Math.floor(rnd() * 499999999)).slice(0, 9),
      ogrn: String(1000000000000 + Math.floor(rnd() * 8999999999999)).slice(0, 13),
      status: status as Counterparty['status'],
      okved: 'Торговля оптовая твёрдым, жидким и газообразным топливом',
      okvedCode: '46.71',
      region,
      address,
      okopf,
      ownershipForm: 'Частная собственность',
      website,
      director,
      companySize: companySizeByEmployees(employees),
      taxRegime,
      subsidiary: SUBS[Math.floor(rnd() * SUBS.length)],
      group,
      score: Math.round(score),
      rbIndex: group === 1 ? Math.floor(rnd() * 3) : group === 2 ? 3 + Math.floor(rnd() * 4) : group === 3 ? 7 + Math.floor(rnd() * 4) : 11 + Math.floor(rnd() * 4),
      underSanctions,
      specialControl: group === 4 ? rnd() < 0.5 : rnd() < 0.05,
      isForeign: rnd() < 0.04,
      registered: `20${String(5 + Math.floor(rnd() * 18)).padStart(2, '0')}-0${1 + Math.floor(rnd() * 8)}-1${Math.floor(rnd() * 9)}`,
      revenue: Math.round((0.3 + rnd() * 40) * 1_000_000_000),
      employees,
      creditLimit: limit,
      limitUtilization: rnd(),
      groupAggregateLimit: limit,
      debt: [],
      assessments: [],
      news: [],
      courtCases: [],
      sanctions: [],
      pdForecast: [],
      asOf: {},
      flags: [],
    });
  }
  return rows;
}

export const REGISTRY: Counterparty[] = makeRegistry();
export const BY_UID = new Map(REGISTRY.map((c) => [c.uid, c]));

// --- Граф аффилированности (герой РН-Снабжение и Балтийская ТК) -------------

export const GRAPHS: Record<string, AffiliationGraph> = {
  'cp-gpn': {
    rootUid: 'cp-gpn',
    rootName: 'ПАО «Газпром нефть»',
    rootInn: '5504036333',
    asOf: '2026-06-12',
    nodes: [
      // Владельцы (вверх по цепочке контроля)
      { id: 'gp-o1', name: 'ПАО «Газпром»', inn: '7736050003', isPerson: false, directShare: 95.68, inRegistry: false, underSanctions: true, linkType: 'owner', level: 1 },
      { id: 'gp-o2', name: 'Миноритарии (free float, MOEX)', isPerson: false, directShare: 4.32, inRegistry: false, linkType: 'owner', level: 1 },
      { id: 'gp-o3', name: 'АО «Роснефтегаз» (10,97% в ПАО «Газпром»)', isPerson: false, indirectShare: 10.50, inRegistry: false, linkType: 'owner', level: 2 },
      // Конечный контролирующий бенефициар: РФ контролирует 50,23% ПАО «Газпром»
      // (Росимущество 38,37%, Роснефтегаз 10,97%, Росгазификация 0,89%), что даёт
      // 48,06% косвенного владения в «Газпром нефти» (50,23% × 95,68%).
      { id: 'gp-b1', name: 'Российская Федерация (Росимущество, Роснефтегаз, Росгазификация)', isPerson: false, indirectShare: 48.06, inRegistry: false, linkType: 'beneficiary', level: 2 },
      // Дочерние общества — добыча
      { id: 'gp-s1', name: 'АО «Газпромнефть-Ноябрьскнефтегаз»', inn: '8905000428', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      { id: 'gp-s2', name: 'ООО «Газпромнефть-Хантос»', inn: '8618006063', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      { id: 'gp-s3', name: 'ООО «Газпромнефть-Ямал»', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      { id: 'gp-s4', name: 'ООО «Газпромнефть-Восток»', inn: '7017126251', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      // Дочерние общества — переработка
      { id: 'gp-s5', name: 'АО «Газпромнефть-ОНПЗ» (Омский НПЗ)', inn: '5501041254', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      { id: 'gp-s6', name: 'АО «Газпромнефть-МНПЗ»', inn: '7723006328', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      // Дочерние общества — сбыт/сервис (ДО, с которыми работают контрагенты реестра)
      { id: 'gp-s7', name: 'АО «Газпромнефть-Аэро»', inn: '7714117720', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      { id: 'gp-s8', name: 'ООО «Газпромнефть — смазочные материалы»', inn: '7728640182', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      { id: 'gp-s9', name: 'ООО «Газпромнефть-Региональные продажи»', inn: '4703105075', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      // Зарубежный актив (под санкциями)
      { id: 'gp-s10', name: 'НИС а.д. Нови-Сад (NIS, Сербия)', isPerson: false, directShare: 44.85, inRegistry: false, underSanctions: true, linkType: 'subsidiary', level: 1 },
      // Совместно контролируемые (метод долевого участия)
      { id: 'gp-a1', name: 'ПАО «НГК «Славнефть»', inn: '7707017509', isPerson: false, directShare: 49.94, inRegistry: false, linkType: 'affiliate', level: 1 },
      { id: 'gp-a2', name: 'АО «Томскнефть» ВНК', isPerson: false, indirectShare: 50, inRegistry: false, linkType: 'affiliate', level: 2 },
    ],
  },
  'cp-rnsnab': {
    rootUid: 'cp-rnsnab',
    rootName: 'ПАО «РН-Снабжение»',
    rootInn: '7706222333',
    asOf: '2026-06-11',
    nodes: [
      { id: 'o1', name: 'АО «Холдинговая компания Ресурс»', inn: '7701445566', isPerson: false, directShare: 75, inRegistry: false, linkType: 'owner', level: 1 },
      { id: 'o2', name: 'Громов Андрей Викторович', isPerson: true, directShare: 15, inRegistry: false, linkType: 'owner', level: 1, isDirector: true },
      { id: 'o3', name: 'ООО «Инвест-Капитал СЗ»', inn: '7842301551', isPerson: false, indirectShare: 10, inRegistry: true, uid: 'cp-balt', linkType: 'owner', level: 2 },
      { id: 'b1', name: 'Громов Андрей Викторович', isPerson: true, inRegistry: false, linkType: 'beneficiary', level: 1, indirectShare: 51 },
      { id: 'b2', name: 'Сидорова Мария Олеговна', isPerson: true, inRegistry: false, linkType: 'beneficiary', level: 2, indirectShare: 12 },
      { id: 'a1', name: 'ООО «РН-Транс Юг»', inn: '6164099887', isPerson: false, inRegistry: true, uid: 'cp-yugtrans', linkType: 'affiliate', level: 1 },
      { id: 'a2', name: 'ООО «Снаб-Сервис М»', inn: '7706998877', isPerson: false, inRegistry: false, linkType: 'affiliate', level: 1 },
      { id: 's1', name: 'ООО «РН-Снабжение Логистика»', inn: '7706112244', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
      { id: 's2', name: 'АО «Балтийская Топливная Компания»', inn: '7842301551', isPerson: false, directShare: 40, inRegistry: true, uid: 'cp-balt', underSanctions: false, linkType: 'subsidiary', level: 1 },
    ],
  },
  'cp-balt': {
    rootUid: 'cp-balt',
    rootName: 'ООО «Балтийская Топливная Компания»',
    rootInn: '7842301551',
    asOf: '2026-06-10',
    nodes: [
      { id: 'bo1', name: 'ПАО «РН-Снабжение»', inn: '7706222333', isPerson: false, directShare: 40, inRegistry: true, uid: 'cp-rnsnab', linkType: 'owner', level: 1 },
      { id: 'bo2', name: 'Кузнецов Артём Игоревич', isPerson: true, directShare: 35, inRegistry: false, linkType: 'owner', level: 1, isDirector: true },
      { id: 'bo3', name: 'ООО «Невские Нефтепродукты»', inn: '7811556677', isPerson: false, indirectShare: 25, inRegistry: true, uid: 'cp-nevsky', underSanctions: true, linkType: 'owner', level: 2 },
      { id: 'bb1', name: 'Кузнецов Артём Игоревич', isPerson: true, inRegistry: false, linkType: 'beneficiary', level: 1, indirectShare: 35 },
      { id: 'ba1', name: 'ООО «БалтОйл Сервис»', inn: '7842556612', isPerson: false, inRegistry: false, linkType: 'affiliate', level: 1 },
      { id: 'bs1', name: 'ООО «БТК-Ритейл»', inn: '7842667711', isPerson: false, directShare: 100, inRegistry: false, linkType: 'subsidiary', level: 1 },
    ],
  },
};

// --- Сигналы (12 категорий × 58 видов — представительная выборка) -----------

export const SIGNALS: Signal[] = [
  { id: 'sg1', date: '2026-06-15', category: 'Претензионно-исковая работа', type: 'Новый судебный иск к контрагенту', severity: 'critical', counterpartyUid: 'cp-balt', counterpartyName: 'ООО «Балтийская Топливная Компания»', title: 'Иск на 34,2 млн ₽ к Балтийской ТК', detail: 'Поставщик подал иск о взыскании задолженности. Лимит выбран на 93%.', read: false, amount: 34_200_000 },
  { id: 'sg2', date: '2026-06-15', category: 'Дебиторская задолженность', type: 'Рост просроченной ДЗ выше порога', severity: 'high', counterpartyUid: 'cp-yugtrans', counterpartyName: 'ООО «ЮгТрансОйл»', title: 'ПДЗ ЮгТрансОйл превысила 19%', detail: 'Просроченная задолженность выросла с 5% до 19% за 12 мес.', read: false, amount: 11_000_000 },
  { id: 'sg3', date: '2026-06-14', category: 'Банкротство', type: 'Введена процедура банкротства', severity: 'critical', counterpartyUid: 'cp-nevsky', counterpartyName: 'ООО «Невские Нефтепродукты»', title: 'Невские НП: введено наблюдение', detail: 'Требования кредитора 88 млн ₽. Контрагент под санкциями.', read: false, amount: 88_000_000 },
  { id: 'sg4', date: '2026-06-13', category: 'Санкции', type: 'Включение в санкционный список', severity: 'high', counterpartyUid: 'cp-nevsky', counterpartyName: 'ООО «Невские Нефтепродукты»', title: 'Обновление по санкционному статусу', detail: 'Подтверждено включение в SDN-список OFAC.', read: true },
  { id: 'sg5', date: '2026-06-12', category: 'Кредитный лимит', type: 'Заявка на согласовании требует решения', severity: 'medium', counterpartyUid: 'cp-progress', counterpartyName: 'ООО «Торговый дом Прогресс»', title: 'Заявка КЛ-2026-0481 ждёт вашей проверки', detail: 'Увеличение лимита до 90 млн ₽. Вы — ответственный на текущем шаге.', read: false },
  { id: 'sg6', date: '2026-06-11', category: 'Особый контроль', type: 'Предложение о включении в особый контроль', severity: 'medium', counterpartyUid: 'cp-balt', counterpartyName: 'ООО «Балтийская Топливная Компания»', title: 'Предложение об особом контроле', detail: 'Контролёр Блока внёс предложение на согласование.', read: true },
  { id: 'sg7', date: '2026-06-10', category: 'Новости', type: 'Значимое негативное событие в СМИ', severity: 'medium', counterpartyUid: 'cp-balt', counterpartyName: 'ООО «Балтийская Топливная Компания»', title: 'Снижение объёмов закупки на 18%', detail: 'Отраслевой обзор PRIMO: сокращение отгрузок кв/кв.', read: true },
  { id: 'sg8', date: '2026-06-09', category: 'Отчётность', type: 'Отчётность старше 12 месяцев', severity: 'low', counterpartyUid: 'cp-yugtrans', counterpartyName: 'ООО «ЮгТрансОйл»', title: 'Требуется обновление отчётности', detail: 'Последняя загруженная отчётность — 4 кв. 2025.', read: false },
];

// --- Заявки на КЛ -----------------------------------------------------------

export const LIMIT_REQUESTS: LimitRequest[] = [
  {
    id: 'lr-481', number: 'КЛ-2026-0481', counterpartyUid: 'cp-progress', counterpartyName: 'ООО «Торговый дом Прогресс»', inn: '5024110234',
    subsidiary: 'ООО «Газпромнефть — смазочные материалы»', requestedLimit: 90_000_000, currentLimit: 75_000_000, currency: 'RUB',
    action: 'Увеличение КЛ', approvalLevel: 'Кредитный контролёр Департамента', status: 'На проверке', stage: 'Проверка КК ДО', group: 2, author: 'Иванов П.С.',
    responsible: 'Соколова Е.В.', createdAt: '2026-06-10', deferralDays: 45, collateral: 'Банковская гарантия', collateralAmount: 90_000_000, aggregateLimit: 75_000_000,
    route: [
      { role: 'ИСП', title: 'Инициатор', state: 'done', actor: 'Иванов П.С.', at: '2026-06-10', comment: 'Заявка сформирована' },
      { role: 'КК-ДО', title: 'Проверка КК ДО', state: 'current', actor: 'Соколова Е.В.' },
      { role: 'КК-Блок', title: 'Согласование КК Блока', state: 'upcoming' },
      { role: 'КО', title: 'Решение кредитного комитета', state: 'upcoming' },
    ],
  },
  {
    id: 'lr-477', number: 'КЛ-2026-0477', counterpartyUid: 'cp-balt', counterpartyName: 'ООО «Балтийская Топливная Компания»', inn: '7842301551',
    subsidiary: 'ООО «Газпромнефть-Региональные продажи»', requestedLimit: 100_000_000, currentLimit: 120_000_000, currency: 'RUB',
    action: 'Снижение КЛ', approvalLevel: 'Кредитный контролёр Блока', status: 'На утверждении', stage: 'Решение кредитного комитета', group: 3, author: 'Соколова Е.В.',
    responsible: 'Петрова И.А.', createdAt: '2026-06-07', deferralDays: 30, collateral: 'Нет', collateralAmount: 0, aggregateLimit: 410_000_000,
    route: [
      { role: 'КК-ДО', title: 'Инициатор (КК ДО)', state: 'done', actor: 'Соколова Е.В.', at: '2026-06-07' },
      { role: 'КК-Блок', title: 'Согласование КК Блока', state: 'done', actor: 'Петрова И.А.', at: '2026-06-09', comment: 'Согласовано со снижением' },
      { role: 'КО', title: 'Решение кредитного комитета', state: 'current' },
    ],
  },
  {
    id: 'lr-470', number: 'КЛ-2026-0470', counterpartyUid: 'cp-sibur', counterpartyName: 'АО «Сибур-Логистика»', inn: '7707083893',
    subsidiary: 'ООО «Газпромнефть-Логистика»', requestedLimit: 600_000_000, currentLimit: 600_000_000, currency: 'RUB',
    action: 'Подтверждение КЛ', approvalLevel: 'Кредитный контролёр ДО', status: 'Утверждено', stage: 'Утверждено', group: 1, author: 'Петрова И.А.',
    responsible: 'Петрова И.А.', createdAt: '2026-05-12', deferralDays: 60, collateral: 'Банковская гарантия', collateralAmount: 600_000_000, aggregateLimit: 1_900_000_000,
    route: [
      { role: 'КК-ДО', title: 'Инициатор (КК ДО)', state: 'done', actor: 'Петрова И.А.', at: '2026-05-12' },
      { role: 'КО', title: 'Решение кредитного комитета', state: 'done', actor: 'Протокол № 18', at: '2026-05-16', comment: 'Лимит подтверждён' },
    ],
  },
];

// --- Задачи и отчёты --------------------------------------------------------

export const TASKS: Task[] = [
  { id: 't1', ref: 'КК-2026-0481', createdAt: '2026-06-12', title: 'Проверить заявку на кредитный лимит', source: 'Согласование КЛ', subState: 'Ожидает проверки КК ДО', link: '/limit-requests/lr-481', status: 'attention', counterpartyName: 'ООО «Торговый дом Прогресс»', org: 'ГПН — смазочные материалы', dueInDays: -1 },
  { id: 't2', ref: 'ОК-2026-012', createdAt: '2026-06-11', title: 'Согласовать предложение об особом контроле', source: 'Особый контроль', subState: 'Ожидает согласования', link: '/counterparties/cp-balt/special-control', status: 'attention', counterpartyName: 'ООО «Балтийская Топливная Компания»', org: 'ГПН — Региональные продажи', dueInDays: -2 },
  { id: 't3', ref: 'АФ-2026-018', createdAt: '2026-06-10', title: 'Проверить связи группы — новый санкционный узел', source: 'Аффилированность', subState: 'Требует анализа', link: '/counterparties/cp-rnsnab/affiliation', status: 'attention', counterpartyName: 'ПАО «РН-Снабжение»', org: 'ГПН — Снабжение', dueInDays: -3 },
  { id: 't4', ref: 'ОТЧ-2026-044', createdAt: '2026-06-09', title: 'Обновить отчётность (старше 12 мес.)', source: 'Контроль актуальности', subState: 'Отчётность устарела', link: '/counterparties/cp-yugtrans/statements', status: 'attention', counterpartyName: 'ООО «ЮгТрансОйл»', org: 'ГПН — Логистика', dueInDays: 1 },
  { id: 't5', ref: 'ОЦ-2026-051', createdAt: '2026-06-08', title: 'Пересмотреть экспресс-оценку', source: 'Оценка', subState: 'Срок оценки истекает', link: '/counterparties/cp-yugtrans/assessment', status: 'attention', counterpartyName: 'ООО «ЮгТрансОйл»', org: 'ГПН — Логистика', dueInDays: 3 },
  { id: 't6', ref: 'КК-2026-0477', createdAt: '2026-06-07', title: 'Подготовить материалы на кредитный комитет', source: 'Согласование КЛ', subState: 'Согласовать этап', link: '/limit-requests/lr-477', status: 'approval', counterpartyName: 'ООО «Балтийская Топливная Компания»', org: 'ГПН — Региональные продажи', dueInDays: 2 },
  { id: 't7', ref: 'КК-2026-0470', createdAt: '2026-06-05', title: 'Подтвердить решение по протоколу № 18', source: 'Согласование КЛ', subState: 'На согласовании', link: '/limit-requests/lr-470', status: 'approval', counterpartyName: 'АО «Сибур-Логистика»', org: 'ГПН — Логистика', dueInDays: 4 },
  { id: 't8', ref: 'ОТ-2026-093', createdAt: '2026-05-30', title: 'Скачать готовый отчёт по аффилированности', source: 'Отчёты', subState: 'Готов к выгрузке', link: '/reports', status: 'completed', counterpartyName: 'ПАО «РН-Снабжение»', org: 'ГПН — Снабжение', dueInDays: 0 },
];

// Ключевые индикаторы риска (KRI) — портрет функции кредитного контроля (ФТ-8 / мониторинг)
export const KRI: import('./types').Kri[] = [
  { label: 'Доля просроченной дебиторской задолженности', value: '4,2 %', tone: 'warn', hint: 'порог 5%' },
  { label: 'Превышение кредитных лимитов покупателей', value: '2 случая', tone: 'bad' },
  { label: 'Средний срок оборачиваемости ДЗ', value: '38 дней', tone: 'neutral' },
  { label: 'Контрагентов под особым контролем', value: '17', tone: 'warn' },
  { label: 'Доля контрагентов без присвоенного лимита', value: '6,1 %', tone: 'good' },
];

export const REPORTING_PERIOD = { module: 'Заявки и оценки КЛ', label: 'Июнь 2026', deadline: '2026-06-25', state: 'открыт' as const };

export const REPORTS: ReportRequest[] = [
  { id: 'r1', type: 'Профиль контрагента (РФ)', createdAt: '2026-06-14', status: 'Готов', format: 'pdf', objects: 1 },
  { id: 'r2', type: 'Выгрузка экспресс-оценок', createdAt: '2026-06-13', status: 'Готов', format: 'xlsx', objects: 42 },
  { id: 'r3', type: 'Отчёт по аффилированности', createdAt: '2026-06-15', status: 'Формируется', format: 'xlsx', objects: 6 },
  { id: 'r4', type: 'Связанные стороны', createdAt: '2026-06-12', status: 'Готов', format: 'xlsx', objects: 14 },
];

export const FAVORITES = ['cp-gpn', 'cp-balt', 'cp-sibur', 'cp-rnsnab'];
