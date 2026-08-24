import type { Counterparty } from './types';

/* Справочник дополнительных ОКВЭД (ЕГРЮЛ, разд. «Сведения о видах экономической
   деятельности»). В отличие от основного ОКВЭД (одно значение на карточке),
   дополнительных у компании обычно несколько — отсюда отдельный блок со списком
   и поиском по нему. */

export interface OkvedItem {
  code: string;
  name: string;
}

const CATALOG: OkvedItem[] = [
  { code: '06.10.1', name: 'Добыча сырой нефти и нефтяного (попутного) газа' },
  { code: '19.20', name: 'Производство нефтепродуктов' },
  { code: '46.71', name: 'Торговля оптовая твёрдым, жидким и газообразным топливом' },
  { code: '46.71.2', name: 'Торговля оптовая моторным топливом, включая авиационный бензин' },
  { code: '46.71.3', name: 'Торговля оптовая смазочными материалами' },
  { code: '46.90', name: 'Торговля оптовая неспециализированная' },
  { code: '49.41', name: 'Деятельность автомобильного грузового транспорта' },
  { code: '52.10', name: 'Деятельность по складированию и хранению' },
  { code: '52.21', name: 'Деятельность вспомогательная, связанная с сухопутным транспортом' },
  { code: '52.29', name: 'Деятельность вспомогательная, связанная с перевозками' },
  { code: '68.20', name: 'Аренда и управление собственным или арендованным недвижимым имуществом' },
  { code: '71.20', name: 'Технические испытания, исследования, анализ и сертификация' },
  { code: '74.90', name: 'Деятельность профессиональная, научная и техническая прочая' },
  { code: '77.39', name: 'Аренда и лизинг прочих машин, оборудования и материальных средств' },
  { code: '82.99', name: 'Деятельность по предоставлению прочих вспомогательных услуг для бизнеса' },
];

function seedOf(str: string): number {
  return str.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

/** Детерминированный по uid добор 4–8 дополнительных ОКВЭД из справочника,
    без повтора основного кода карточки (тот уже показан отдельным полем). */
export function buildAdditionalOkveds(cp: Counterparty): OkvedItem[] {
  const pool = CATALOG.filter((o) => o.code !== cp.okvedCode);
  const seed = seedOf(cp.uid);
  const mixed = (seed * 1103515245 + 12345) >>> 0;
  const target = Math.min(pool.length, 4 + (mixed % 5));
  const step = 1 + (Math.floor(mixed / 64) % Math.max(1, pool.length - 1));
  const start = mixed % pool.length;
  const items: OkvedItem[] = [];
  for (let i = 0; items.length < target && i < pool.length; i++) {
    const item = pool[(start + i * step) % pool.length];
    if (!items.includes(item)) items.push(item);
  }
  return items.sort((a, b) => a.code.localeCompare(b.code));
}
