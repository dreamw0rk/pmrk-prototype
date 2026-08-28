import type { Counterparty } from './types';
import { buildAdditionalOkveds } from './okved';

/* «Взаимодействие контрагента с ГК Газпром нефть» + смежные блоки на вкладке
   «Общие сведения» (номер в SAP, статус контрагента, деловая репутация,
   платформа деловых отзывов) — поля сверены с реальным порталом. Это derived
   мок (как buildDoLinks/buildCreditLimitsByDo): не хранится на Counterparty,
   считается детерминированно по uid и уже известным полям контрагента. */

export interface InteractionInfo {
  sapNumber: string;
  /** Статус контрагента в ПМРК (Потенциальный/Действующий) — отдельно от
      статуса по данным СПАРК (c.status), который про само юрлицо, а не про
      факт работы с ГК. */
  pmrkStatus: 'Потенциальный' | 'Действующий';
  gpnAffiliationFlag: string;
  hasCollateral: boolean;
  hasNegativeSecurityInfo: boolean;
  experience: string;
  paymentDiscipline: string;
  reviews: {
    orgType: string;
    activities: string;
    region: string;
    reviewsCount: number;
    avgRating: number;
    link: string;
    updatedAt: string;
  };
}

const EXPERIENCE = ['менее 1 года', 'от 1 до 3-х лет', 'более 3-х лет'];
const DISCIPLINE = ['Без нарушений', 'Единичные случаи возникновения ПДЗ', 'Неоднократное возникновение ПДЗ'];

function seedOf(str: string): number {
  return str.split('').reduce((sum, ch) => sum + ch.charCodeAt(0) * 31, 0) >>> 0;
}

export function buildInteractionInfo(c: Counterparty): InteractionInfo {
  const seed = seedOf(c.uid);
  const experience = c.group <= 2 ? EXPERIENCE[2] : EXPERIENCE[seed % EXPERIENCE.length];
  const paymentDiscipline = c.group === 1 ? DISCIPLINE[0] : c.group === 2 ? DISCIPLINE[seed % 2] : DISCIPLINE[2];

  return {
    sapNumber: String(1_000_000 + (seed % 8_999_999)),
    pmrkStatus: c.creditLimit > 0 ? 'Действующий' : 'Потенциальный',
    gpnAffiliationFlag: seed % 5 === 0 ? 'ВЗЛ ГПН' : 'Не аффилирован',
    hasCollateral: seed % 4 === 0,
    hasNegativeSecurityInfo: c.group === 4 && seed % 2 === 0,
    experience,
    paymentDiscipline,
    reviews: {
      orgType: c.isForeign ? 'Иностранная организация' : 'Российская организация',
      // Платформа «Мнения» показывает не только основной ОКВЭД, а все виды
      // деятельности контрагента (как на реальном портале — там это часто
      // десятки строк) — используем тот же справочник допОКВЭД, что и на
      // вкладке «Общие сведения».
      activities: [c.okved, ...buildAdditionalOkveds(c).map((o) => o.name)].join(', '),
      region: c.region,
      reviewsCount: seed % 6,
      avgRating: seed % 6 === 0 ? 0 : Math.round((2.5 + ((seed >> 3) % 25) / 10) * 100) / 100,
      link: `https://mnenia.gazprom-neft.ru/company/?ID=${1000 + (seed % 9000)}`,
      updatedAt: c.asOf.general ?? '',
    },
  };
}
