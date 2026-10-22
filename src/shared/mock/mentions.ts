import type { Counterparty, NewsItem } from './types';

/* Лента упоминаний контрагента (вкладка «Новости», правая колонка): новости из
   статичных источников карточки (c.news) вперемешку с упоминаниями в СМИ,
   агрегаторах и Telegram-каналах. Упоминания детерминированы по uid — у
   контрагента всегда одна и та же лента. Отсортирована по дате, свежие сверху. */

export interface MentionItem {
  id: string;
  date: string;
  source: string;
  title: string;
  summary: string;
  sentiment: NewsItem['sentiment'];
}

function seedOf(str: string): number {
  return str.split('').reduce((sum, ch) => sum + ch.charCodeAt(0) * 31, 0) >>> 0;
}

type Template = { source: string; sentiment: MentionItem['sentiment']; title: (n: string) => string; summary: (n: string) => string };

const TEMPLATES: Template[] = [
  { source: 'Интерфакс', sentiment: 'neutral', title: (n) => `${n} раскрыла отчётность за I полугодие`, summary: () => 'Выручка и операционные показатели опубликованы в соответствии с графиком раскрытия информации.' },
  { source: 'РБК', sentiment: 'positive', title: (n) => `${n} вошла в рейтинг крупнейших компаний региона`, summary: (n) => `По итогам года ${n} поднялась в отраслевом рейтинге по объёму выручки.` },
  { source: 'Коммерсантъ', sentiment: 'negative', title: (n) => `Контрагенты ${n} жалуются на задержки оплаты`, summary: () => 'Несколько поставщиков сообщили о переносе сроков расчётов по договорам поставки.' },
  { source: 'ТАСС', sentiment: 'positive', title: (n) => `${n} подписала соглашение о сотрудничестве с регионом`, summary: () => 'Соглашение предусматривает расширение логистической инфраструктуры и создание рабочих мест.' },
  { source: 'Ведомости', sentiment: 'neutral', title: (n) => `${n} сменила генерального директора`, summary: () => 'Совет директоров утвердил кандидатуру нового руководителя; стратегия компании сохраняется.' },
  { source: 'Neftegaz.RU', sentiment: 'positive', title: (n) => `${n} нарастила отгрузки нефтепродуктов на внутренний рынок`, summary: () => 'Рост отгрузок связан с увеличением спроса в сезон дорожно-строительных работ.' },
  { source: 'Прайм', sentiment: 'neutral', title: (n) => `${n} разместила облигации`, summary: () => 'Выпуск размещён по открытой подписке; средства направят на рефинансирование долга.' },
  { source: 'Telegram · «Нефтяной вестник»', sentiment: 'negative', title: (n) => `ФАС проверяет ценообразование ${n}`, summary: () => 'По данным канала, антимонопольная служба запросила документы о формировании цен на топливо.' },
  { source: 'Известия', sentiment: 'neutral', title: (n) => `${n} рассматривает выход на новые рынки сбыта`, summary: () => 'Компания изучает возможность поставок в страны ЕАЭС.' },
  { source: 'Telegram · «Банкротство и долги»', sentiment: 'negative', title: (n) => `К ${n} предъявлен иск о взыскании задолженности`, summary: () => 'Иск зарегистрирован в арбитражном суде, предварительное заседание назначено на следующий месяц.' },
  { source: 'Интерфакс', sentiment: 'positive', title: (n) => `Агентство подтвердило кредитный рейтинг ${n}`, summary: () => 'Прогноз по рейтингу — «стабильный»; агентство отметило устойчивую ликвидность.' },
  { source: 'РИА Новости', sentiment: 'neutral', title: (n) => `${n} провела годовое собрание акционеров`, summary: () => 'Акционеры утвердили годовой отчёт и избрали новый состав совета директоров.' },
];

export function buildMentionsFeed(cp: Counterparty): MentionItem[] {
  const seed = seedOf(cp.uid);
  const name = cp.shortName;
  // плохие контрагенты чаще фигурируют в негативных упоминаниях
  const pool = cp.group >= 3 ? TEMPLATES : TEMPLATES.filter((t, i) => t.sentiment !== 'negative' || i % 2 === 0);
  const count = Math.min(pool.length, 8 + (seed % 4));
  // детерминированная перестановка шаблонов (без повторов) — у каждого
  // контрагента свой набор и порядок упоминаний
  const order = pool
    .map((t, i) => ({ t, k: seedOf(`${cp.uid}-${i}-${t.source}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.t);
  const base = new Date('2026-06-15');

  const generated: MentionItem[] = Array.from({ length: count }, (_, i) => {
    const t = order[i];
    const d = new Date(base);
    d.setDate(d.getDate() - (3 + i * 13 + ((seed >> i) % 9)));
    return {
      id: `${cp.uid}-m${i}`,
      date: d.toISOString().slice(0, 10),
      source: t.source,
      title: t.title(name),
      summary: t.summary(name),
      sentiment: t.sentiment,
    };
  });

  const own: MentionItem[] = cp.news.map((n) => ({ id: n.id, date: n.date, source: n.source, title: n.title, summary: n.summary, sentiment: n.sentiment }));
  return [...own, ...generated].sort((a, b) => b.date.localeCompare(a.date));
}
