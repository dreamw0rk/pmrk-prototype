import type { Counterparty } from './types';
import { SUBS, NOW } from './data';

/* Распределение кредитного лимита по ДО ГК ГПН (реестр «Кредитные лимиты», выгрузка
   АРМ КК) — источник структуры и состава колонок: экспорт из системы (Название,
   ИНН, Наименование ДО ГК ГПН, Действительность, Сегмент, Утверждённый КЛ (валюта
   и руб.), Утверждённая отсрочка платежа, Коллегиальный орган, Реквизиты документа,
   даты действия, обеспечение, комментарии по обеспечению). Сами суммы по ДО в проде
   подтягиваются из limit-workflow построчно; здесь — детерминированная реконструкция
   по агрегатам контрагента: основной ДО (cp.subsidiary) закрывает действующий КЛ
   (cp.creditLimit), остаток до совокупного КЛ группы (cp.groupAggregateLimit)
   распределён по другим ДО из общего справочника SUBS — те же названия, что уже
   используются в реестре контрагентов, заявках на лимит и протоколах КК-ДО. */

export interface DoLimitRow {
  subsidiary: string;
  subsidiaryInn: string;
  segment: string;
  amountRub: number;
  deferralDays: number;
  approvalBody: string;
  documentRef: string;
  startDate: string;
  endDate: string;
  collateral: string;
}

const SEGMENTS = [
  'B2B (Нефтепродукты внутр. рынок)',
  'B2G (Нефтепродукты внутр. рынок)',
  'B2B (Логистика и МТР)',
  'B2B (Смазочные материалы)',
  'B2B (Авиатопливо)',
];

const DEFERRAL_DAYS = [30, 45, 60];

function seedOf(str: string): number {
  return str.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
}

function docRef(seed: number): string {
  return `ПТ-${330 + (seed % 40)}.00${20 + (seed % 9)}/000${(seed * 137) % 9000}`;
}

/** ИНН ДО — своих реквизитов в модели нет (SUBS — просто список названий),
    поэтому для юрлица ДО генерируем стабильный правдоподобный ИНН (детерминированно
    от названия, префикс 77 — Москва, где зарегистрировано большинство ДО ГК ГПН).
    Исключение — когда «ДО» это сам контрагент (головная компания ГК, см. cp-gpn):
    тогда это один и тот же субъект, берём его настоящий ИНН из карточки. */
function doInn(subsidiary: string, cp: Counterparty): string {
  if (subsidiary === cp.subsidiary && !SUBS.includes(subsidiary)) return cp.inn;
  const h = seedOf(subsidiary) * 9301 + 49297;
  return `77${String(h % 100_000_000).padStart(8, '0')}`;
}

export function buildCreditLimitsByDo(cp: Counterparty): DoLimitRow[] {
  if (cp.creditLimit <= 0) return [];

  const seed = seedOf(cp.uid);
  const others = SUBS.filter((s) => s !== cp.subsidiary);

  const rows: DoLimitRow[] = [{
    subsidiary: cp.subsidiary,
    subsidiaryInn: doInn(cp.subsidiary, cp),
    segment: SEGMENTS[seed % SEGMENTS.length],
    amountRub: cp.creditLimit,
    deferralDays: DEFERRAL_DAYS[seed % DEFERRAL_DAYS.length],
    approvalBody: cp.creditLimit >= 300_000_000 ? 'Кредитный комитет Блока' : 'Кредитный комитет ДО',
    documentRef: docRef(seed),
    startDate: '2025-09-17',
    endDate: '2026-09-16',
    collateral: cp.group >= 3 ? 'Поручительство группы' : 'нет',
  }];

  const remainder = cp.groupAggregateLimit - cp.creditLimit;
  if (remainder > 0 && others.length > 0) {
    const extraCount = Math.min(remainder > cp.creditLimit ? 2 : 1, others.length);
    const shares = extraCount === 2 ? [0.6, 0.4] : [1];
    for (let i = 0; i < extraCount; i++) {
      const s2 = seed + (i + 1) * 31;
      const sub = others[i % others.length];
      // Второй дополнительный ДО (когда он есть) — с уже истёкшим сроком действия:
      // формально утверждён и продолжает считаться в совокупном КЛ группы, но не
      // входит в действующий КЛ, поскольку срок не продлён. Это даёт содержательную
      // разницу между «Действующий КЛ» (только непросроченные лимиты) и
      // «Совокупный КЛ группы» (все утверждённые, включая просроченные).
      const expired = i === 1;
      rows.push({
        subsidiary: sub,
        subsidiaryInn: doInn(sub, cp),
        segment: SEGMENTS[s2 % SEGMENTS.length],
        amountRub: Math.round(remainder * shares[i]),
        deferralDays: DEFERRAL_DAYS[s2 % DEFERRAL_DAYS.length],
        approvalBody: 'Кредитный комитет ДО',
        documentRef: docRef(s2),
        startDate: expired ? '2024-09-01' : '2025-10-01',
        endDate: expired ? '2025-08-31' : '2026-09-30',
        collateral: 'нет',
      });
    }
  }

  return rows;
}

export function isDoLimitActive(row: DoLimitRow): boolean {
  return new Date(row.endDate) >= NOW;
}

/** Действующий КЛ (для группы) — сумма лимитов ДО, у которых срок действия ещё не
    истёк. В отличие от совокупного КЛ группы (сумма всех утверждённых лимитов),
    сюда не попадают лимиты с истёкшим сроком действия, ожидающие продления. */
export function activeCreditLimit(rows: DoLimitRow[]): number {
  return rows.filter(isDoLimitActive).reduce((sum, row) => sum + row.amountRub, 0);
}
