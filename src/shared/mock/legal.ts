import type { Counterparty } from './types';

/* Претензионно-исковая работа (ФТ-1.11) — 4 раздела с детальными атрибутами.
   Источник — КЮРАСАО 2.0 (CuracaoClient, ТИ-4). Срежиссировано из courtCases. */

export interface ClaimItem {
  id: string; applicant: string; activity: string; contractNo: string; claimNo: string; sentDate: string;
  subject: string; total: number; principal: number; penalty: number; other: number; satisfied: number;
  event: string; eventDate: string; status: string; comment: string; lawsuitLink: string; lawyer: string;
}
export interface LawsuitItem {
  id: string; plaintiff: string; caseNo: string; regDate: string; currentClaim: number; satisfied: number;
  instance: string; nextHearing: string; status: string; courtResult: string; outcome: string;
  enforcementLink: string; bankruptcyLink: string; lawyer: string;
}
export interface EnforcementItem {
  id: string; claimant: string; caseName: string; createDate: string; writDate: string; writSerial: string;
  sumByDoc: number; received: number; lastPaymentDate: string; plannedEvent: string; plannedDate: string;
  eventComment: string; completed: string; completionDate: string;
}
export interface BankruptcyItem {
  id: string; creditor: string; caseName: string; stage: string; claimInRegistry: number; execution: number;
  lastPaymentDate: string; lastPaymentSum: number; plannedEvent: string; plannedDate: string;
  eventDescription: string; comment: string; archiveDate: string;
}

const LAWYERS = ['Морозова А.К.', 'Лебедев Д.С.', 'Орлова Т.В.'];

const BANKRUPTCY_EVENT: Record<string, string> = {
  'Наблюдение': 'Введена процедура наблюдения, назначен временный управляющий',
  'Финансовое оздоровление': 'Введена процедура финансового оздоровления по плану погашения задолженности',
  'Внешнее управление': 'Введено внешнее управление, назначен внешний управляющий',
  'Конкурсное производство': 'Открыто конкурсное производство, формируется конкурсная масса',
  'Мировое соглашение': 'Утверждено мировое соглашение между должником и кредиторами',
};

export function buildLegal(cp: Counterparty) {
  const cc = cp.courtCases;
  const claims: ClaimItem[] = cc.filter((c) => c.kind === 'claim').map((c, i) => ({
    id: c.id, applicant: c.role === 'истец' ? cp.shortName : 'ООО «ТЭК-Снаб»', activity: 'Поставка нефтепродуктов', contractNo: `ДП-2024/${317 + i}`,
    claimNo: `ПР-2026/${44 + i}`, sentDate: c.date, subject: c.subject, total: c.amount, principal: Math.round(c.amount * 0.82),
    penalty: Math.round(c.amount * 0.15), other: Math.round(c.amount * 0.03), satisfied: c.status === 'Урегулировано' ? c.amount : 0,
    event: c.status === 'Урегулировано' ? 'Претензия удовлетворена' : 'Ожидается ответ на претензию', eventDate: c.date, status: c.status,
    comment: c.status === 'Урегулировано' ? 'Оплата поступила в полном объёме' : 'Срок ответа — 30 дней', lawsuitLink: c.status === 'Претензия направлена' ? 'А56-10000/2026' : '—', lawyer: LAWYERS[i % LAWYERS.length],
  }));

  const lawsuits: LawsuitItem[] = cc.filter((c) => c.kind === 'lawsuit').map((c, i) => ({
    id: c.id, plaintiff: c.role === 'ответчик' ? 'ООО «ТЭК-Снаб»' : cp.shortName, caseNo: `А56-${10000 + i * 137}/2026`, regDate: c.date,
    currentClaim: c.amount, satisfied: 0, instance: 'Арбитражный суд первой инстанции', nextHearing: '2026-07-14', status: c.status,
    courtResult: '—', outcome: 'рассматривается', enforcementLink: '—', bankruptcyLink: '—', lawyer: LAWYERS[i % LAWYERS.length],
  }));

  const enforcement: EnforcementItem[] = cc.filter((c) => c.kind === 'enforcement').map((c, i) => ({
    id: c.id, claimant: 'ФНС России (МИФНС № 23)', caseName: c.subject, createDate: c.date, writDate: c.date, writSerial: `ФС № 0${42910 + i}`,
    sumByDoc: c.amount, received: Math.round(c.amount * 0.3), lastPaymentDate: '2026-05-20', plannedEvent: 'Списание со счёта должника', plannedDate: '2026-07-01',
    eventComment: 'Постановление направлено в банк', completed: 'Частично', completionDate: '—',
  }));

  const bankruptcy: BankruptcyItem[] = cc.filter((c) => c.kind === 'bankruptcy').map((c, i) => {
    const archived = /завершен/i.test(c.status);
    return {
      id: c.id, creditor: 'ООО «Газпромнефть-Региональные продажи»', caseName: c.subject, stage: c.status, claimInRegistry: c.amount,
      execution: 0, lastPaymentDate: '—', lastPaymentSum: 0, plannedEvent: 'Включение в реестр требований кредиторов', plannedDate: '2026-07-20',
      eventDescription: BANKRUPTCY_EVENT[c.status] ?? `Введена процедура: ${c.status.toLowerCase()}`,
      comment: 'Требование включено в реестр кредиторов третьей очереди', archiveDate: archived ? '2026-08-01' : '—',
    };
  });

  return { claims, lawsuits, enforcement, bankruptcy };
}
