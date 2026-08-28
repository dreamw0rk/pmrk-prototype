/* UI-типы доменной модели (уровень рендера). В реальном ПМРК DTO генерируются
   из OpenAPI 3.1; здесь — ручные типы под моки прототипа. */

export type RiskGroup = 1 | 2 | 3 | 4;

export interface DebtPoint {
  /** ISO дата точки (помесячно) */
  date: string;
  dz: number; // дебиторская задолженность
  pdz: number; // просроченная ДЗ
  advance: number; // выданные авансы
  payable: number; // кредиторская задолженность
}

export interface AssessmentRow {
  id: string;
  /** дата проведения оценки */
  date: string;
  /** период отчётности, на данных которого считалась оценка — обычно
      предыдущая закрытая отчётная дата, отличается от даты проведения */
  reportPeriod: string;
  direction: 'OIL' | 'MTR' | 'ADVANCE';
  directionLabel: string;
  group: RiskGroup;
  score: number; // интегральный балл 0..100
  limit: number; // рекомендованный КЛ
  author: string;
}

export interface NewsItem {
  id: string;
  date: string;
  title: string;
  source: string;
  sentiment: 'negative' | 'neutral' | 'positive';
  summary: string;
}

export interface CourtCase {
  id: string;
  kind: 'claim' | 'lawsuit' | 'enforcement' | 'bankruptcy';
  role: 'истец' | 'ответчик' | 'должник' | 'третье лицо';
  amount: number;
  date: string;
  status: string;
  subject: string;
}

export interface SanctionItem {
  program: string;
  authority: string;
  date: string;
  basis: string;
}

export interface Counterparty {
  uid: string;
  name: string;
  shortName: string;
  inn: string;
  kpp: string;
  ogrn: string;
  status: 'Действующее' | 'Ликвидация' | 'Банкротство' | 'Реорганизация';
  okved: string;
  okvedCode: string;
  region: string;
  address: string; // адрес контрагента (ЕГРЮЛ)
  okopf: string; // организационно-правовая форма текстом (ЕГРЮЛ/СПАРК)
  ownershipForm: string; // форма собственности
  website?: string; // рабочий сайт
  director: string; // ФИО и должность руководителя
  companySize: string; // категория по размеру (СПАРК): крупное/среднее/малое/микро
  taxRegime: string; // налоговый режим
  subsidiary: string; // ДО, с которым работает
  group: RiskGroup;
  score: number;
  rbIndex: number; // 0..14
  underSanctions: boolean;
  specialControl: boolean;
  isForeign: boolean;
  registered: string; // дата регистрации
  revenue: number; // выручка, ₽
  employees: number;
  // агрегаты для профиля
  creditLimit: number; // действующий КЛ
  limitUtilization: number; // 0..1 использование
  groupAggregateLimit: number; // совокупный КЛ группы
  debt: DebtPoint[];
  assessments: AssessmentRow[];
  news: NewsItem[];
  courtCases: CourtCase[];
  sanctions: SanctionItem[];
  pdForecast: { horizon: string; pd: number }[]; // прогноз PD 30+/90+/180+
  asOf: Record<string, string>; // дата актуализации по разделам
  flags: string[]; // короткие сигнальные метки для реестра/командного центра
}

export type AffiliationLinkType = 'owner' | 'beneficiary' | 'affiliate' | 'subsidiary';

export interface AffiliationNode {
  id: string;
  name: string;
  inn?: string;
  isPerson: boolean;
  directShare?: number; // % прямого владения (белая заливка)
  indirectShare?: number; // % косвенного (жёлтая заливка)
  inRegistry: boolean; // есть в реестре ПМРК → оранжевая обводка, кликабельно
  uid?: string; // если inRegistry
  underSanctions?: boolean;
  /** руководитель — единоличный исполнительный орган анализируемой компании или лица в цепочке */
  isDirector?: boolean;
  linkType: AffiliationLinkType;
  level: number;
}

export interface AffiliationGraph {
  rootUid: string;
  rootName: string;
  rootInn: string;
  nodes: AffiliationNode[];
  asOf: string;
}

export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Signal {
  id: string;
  date: string;
  category: string; // одна из 12 категорий
  type: string; // один из 58 видов
  severity: SignalSeverity;
  counterpartyUid?: string;
  counterpartyName?: string;
  title: string;
  detail: string;
  read: boolean;
  amount?: number;
}

export type LimitRequestStatus =
  | 'Черновик'
  | 'На проверке'
  | 'На утверждении'
  | 'Подготовлено КК'
  | 'Утверждено'
  | 'Отклонено'
  | 'Возвращено';

export interface ApprovalStep {
  role: string;
  title: string;
  state: 'done' | 'current' | 'upcoming';
  actor?: string;
  at?: string;
  comment?: string;
  adHoc?: boolean;
}

export interface LimitRequest {
  id: string;
  number: string;
  counterpartyUid: string;
  counterpartyName: string;
  inn: string;
  subsidiary: string;
  requestedLimit: number;
  currentLimit: number;
  currency: string;
  action: 'Открытие КЛ' | 'Увеличение КЛ' | 'Снижение КЛ' | 'Закрытие КЛ' | 'Подтверждение КЛ';
  approvalLevel: string;
  status: LimitRequestStatus;
  stage: string; // название этапа (ФТ-6.12)
  group: RiskGroup;
  author: string;
  responsible: string;
  createdAt: string;
  deferralDays: number;
  collateral: string; // обеспечение
  collateralAmount: number;
  aggregateLimit: number; // действующий совокупный КЛ по ГК
  route: ApprovalStep[];
}

export interface Task {
  id: string;
  ref?: string; // номер задачи (КК-2026-0481 …)
  createdAt: string;
  title: string;
  source: string; // раздел-источник (тег)
  subState?: string; // под-статус («Ожидает решения КО», «Согласовать этап»)
  link: string;
  status: 'attention' | 'completed' | 'approval';
  counterpartyName?: string;
  org?: string; // ДО ГК ГПН
  dueInDays?: number; // < 0 — просрочено, > 0 — до срока N дней, 0 — сегодня
}

export interface Kri {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  hint?: string;
}

export interface ReportRequest {
  id: string;
  type: string;
  createdAt: string;
  status: 'Формируется' | 'Готов' | 'Ошибка';
  format: 'pdf' | 'xlsx' | 'csv';
  objects: number;
}
