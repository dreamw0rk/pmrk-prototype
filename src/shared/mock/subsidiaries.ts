import type { Counterparty } from './types';
import { SUBS, blockOf, doInn, type BlockCode } from './data';
import { buildCreditLimitsByDo } from './creditLimits';

/* Состав ДО ГК «Газпром нефть», работающих с контрагентом (поле «Работает с ДО»,
   ФТ-19.1). Связь шире кредитного лимита: лимит открывают не под каждое ДО, а
   работа (поставки, услуги, закупки) идёт и без него — поэтому состав строится
   из двух источников: ДО с лимитами (реестр КЛ) плюс детерминированный добор из
   общего справочника. Добор идёт шагом по справочнику, а не подряд, чтобы в
   выборку попадали ДО разных блоков — иначе группировка по блокам вырождалась бы
   в одну группу. В проде состав приходит из справочника договорных отношений. */

const SEGMENTS = [
  'Нефтепродукты (внутренний рынок)',
  'Логистика и транспорт',
  'МТР и закупки',
  'Смазочные материалы',
  'Авиатопливообеспечение',
  'Сервисы и подряд',
];

export interface DoLink {
  subsidiary: string;
  inn: string;
  /** блок ГК, к которому относится ДО; undefined — ДО вне справочника */
  block?: BlockCode;
  /** направление работы с контрагентом */
  segment: string;
  /** основное ДО карточки — значение поля «Работает с ДО» */
  primary: boolean;
}

function seedOf(str: string): number {
  return str.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

export function buildDoLinks(cp: Counterparty): DoLink[] {
  const seed = seedOf(cp.uid);
  const names: string[] = [cp.subsidiary];

  // ДО, по которым открыт кредитный лимит, работают с контрагентом по определению
  buildCreditLimitsByDo(cp).forEach((row) => {
    if (!names.includes(row.subsidiary)) names.push(row.subsidiary);
  });

  // Добор до 3–6 ДО. Сумма кодов символов uid у соседних контрагентов почти
  // одинакова, поэтому старт и шаг обхода берём не из неё напрямую, а из
  // перемешанного значения — иначе у всех карточек добирались бы одни и те же
  // первые позиции справочника. Шаг по справочнику (а не подряд) разносит выборку
  // по блокам: иначе группировка вырождалась бы в одну группу.
  const mixed = (seed * 1103515245 + 12345) >>> 0;
  const target = 3 + (mixed % 4);
  const step = 1 + (Math.floor(mixed / 64) % (SUBS.length - 1));
  for (let i = 0; names.length < target && i < SUBS.length; i++) {
    const name = SUBS[(mixed + i * step) % SUBS.length];
    if (!names.includes(name)) names.push(name);
  }

  return names.map((name) => ({
    subsidiary: name,
    inn: name === cp.subsidiary && !SUBS.includes(name) ? cp.inn : doInn(name),
    block: blockOf(name),
    segment: SEGMENTS[(seedOf(name) + seed) % SEGMENTS.length],
    primary: name === cp.subsidiary,
  }));
}
