import type { Counterparty } from './types';

/* История изменений наименования и ОПФ (ЕГРЮЛ, разд. «Сведения об учёте в
   налоговом органе» / история юрлица). У большинства карточек изменений нет —
   блок показывает их только когда они реально были. */

export interface NameChangeItem {
  date: string; // ISO, дата регистрации изменения
  name: string; // наименование, ставшее актуальным с этой даты
  inn: string;
  ogrn: string;
  okopf: string;
}

/* Реальные записи ЕГРЮЛ для карточек-«героев». Остальные карточки по-прежнему
   обслуживает детерминированный генератор ниже. */

const REAL: Record<string, NameChangeItem[]> = {
  // ПАО «Газпром нефть»: создано в 1995 году как ОАО «Сибирская нефтяная
  // компания» («Сибнефть»), ОГРН присвоен 21.08.2002 при внесении сведений о
  // юрлице, зарегистрированном до 01.07.2002. Переименование в «Газпром нефть»
  // и перерегистрация из Омска в Санкт-Петербург — по решению внеочередного
  // собрания акционеров 13.05.2006. Смена ОПФ на публичное АО — по уставу в
  // новой редакции от 30.09.2015, запись в ЕГРЮЛ от 13.10.2015.
  'cp-gpn': [
    {
      date: '2002-08-21',
      name: 'ОТКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СИБИРСКАЯ НЕФТЯНАЯ КОМПАНИЯ"',
      inn: '5504036333',
      ogrn: '1025501701686',
      okopf: 'Открытые акционерные общества',
    },
    {
      date: '2006-05-13',
      name: 'ОТКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "ГАЗПРОМ НЕФТЬ"',
      inn: '5504036333',
      ogrn: '1025501701686',
      okopf: 'Открытые акционерные общества',
    },
    {
      date: '2015-10-13',
      name: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "ГАЗПРОМ НЕФТЬ"',
      inn: '5504036333',
      ogrn: '1025501701686',
      okopf: 'Публичные акционерные общества',
    },
  ],
};

const LONG_FORM: Record<string, string> = {
  ПАО: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО',
  ОАО: 'ОТКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО',
  АО: 'АКЦИОНЕРНОЕ ОБЩЕСТВО',
  ЗАО: 'ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО',
  ООО: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ',
};

const OKOPF_BY_FORM: Record<string, string> = {
  ПАО: 'Публичные акционерные общества',
  ОАО: 'Публичные акционерные общества',
  АО: 'Непубличные акционерные общества',
  ЗАО: 'Непубличные акционерные общества',
  ООО: 'Общества с ограниченной ответственностью',
};

function parseForm(name: string): keyof typeof LONG_FORM {
  const m = name.match(/^(ПАО|ОАО|ЗАО|АО|ООО)\s/);
  return (m ? m[1] : 'ООО') as keyof typeof LONG_FORM;
}

function coreName(name: string): string {
  const m = name.match(/«([^»]+)»/);
  return (m ? m[1] : name).toUpperCase();
}

function seedOf(str: string): number {
  return str.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

/** Детерминированная по uid история: примерно у четверти карточек — одна запись
    о переименовании/смене ОПФ, у остальных — пусто. */
export function buildNameChanges(cp: Counterparty): NameChangeItem[] {
  const real = REAL[cp.uid];
  if (real) return real;

  const seed = seedOf(cp.uid);
  if (seed % 4 !== 0) return [];

  const form = parseForm(cp.name);
  const daysAgo = 200 + (seed % 900);
  const date = new Date(Date.UTC(2026, 5, 15));
  date.setUTCDate(date.getUTCDate() - daysAgo);

  return [{
    date: date.toISOString().slice(0, 10),
    name: `${LONG_FORM[form]} "${coreName(cp.name)}"`,
    inn: cp.inn,
    ogrn: cp.ogrn,
    okopf: OKOPF_BY_FORM[form],
  }];
}
