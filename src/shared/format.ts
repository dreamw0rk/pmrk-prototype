/* Форматтеры ru-RU: деньги, даты, проценты. Табличные цифры — через CSS. */

const RUB = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const RUB2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Соглашение о валюте: знак рубля в ячейках и значениях НЕ пишется — число идёт
   просто числом, а «руб.» стоит в названии (заголовке колонки, подписи поля,
   карточки), например «Сумма иска, руб.». Исключение — сумма внутри связного
   текста (новость, подпись без названия): там нужны moneyText/moneyCompactText. */

export function money(amount: number, opts?: { unit?: 'руб.' | 'тыс. руб.' | 'млн руб.' | ''; frac?: boolean }): string {
  const unit = opts?.unit ?? '';
  const fmt = opts?.frac ? RUB2 : RUB;
  return unit ? `${fmt.format(amount)} ${unit}` : fmt.format(amount);
}

/** Сумма для связного текста (без отдельного названия): «1 234 567 руб.». */
export function moneyText(amount: number): string {
  return `${RUB.format(amount)} руб.`;
}

/** Компактная подача больших сумм для плотных таблиц/карточек: «5,00 млрд»,
    «212 млн» — масштаб есть, знака рубля нет (он в названии). */
export function moneyCompact(amount: number): string {
  const { value, unit } = moneyCompactParts(amount);
  return unit ? `${value} ${unit}` : value;
}

/** Компактная сумма для связного текста: «5,00 млрд руб.». */
export function moneyCompactText(amount: number): string {
  const { value, unit } = moneyCompactParts(amount);
  return `${value} ${unit ? unit + ' ' : ''}руб.`;
}

/** То же самое, но число и единица измерения отдельно — чтобы можно было
    визуально выделить размером именно число, а не всю строку целиком
    (крупная цифра, мельче — «млрд» рядом). */
export function moneyCompactParts(amount: number): { value: string; unit: string } {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return { value: RUB2.format(amount / 1_000_000_000), unit: 'млрд' };
  if (abs >= 1_000_000) return { value: RUB2.format(amount / 1_000_000), unit: 'млн' };
  if (abs >= 1_000) return { value: RUB.format(Math.round(amount / 1_000)), unit: 'тыс.' };
  return { value: RUB.format(amount), unit: '' };
}

export function pct(value: number, frac = 1): string {
  return `${value.toLocaleString('ru-RU', { minimumFractionDigits: frac, maximumFractionDigits: frac })} %`;
}

/** dd.mm.yyyy — основной формат дат в ПМРК. */
export function dateRu(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export function dateTimeRu(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dateRu(d)} ${hh}:${mi}`;
}

/** «3 дня назад», «сегодня» — для ленты сигналов и аудита. */
export function ago(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const day = 86_400_000;
  const days = Math.floor(diff / day);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;
  if (days < 30) return `${Math.floor(days / 7)} нед. назад`;
  return dateRu(d);
}

/** ИНН выводится сплошной строкой цифр, без разделителей. */
export function inn(value: string): string {
  return value;
}

/** Дельта срока для задач: «−2 дн.» (просрочено), «через 1 дн.», «сегодня». */
export function dueDelta(days: number): { label: string; tone: 'bad' | 'warn' | 'neutral' } {
  if (days < 0) return { label: `${days} дн.`, tone: 'bad' };
  if (days === 0) return { label: 'сегодня', tone: 'warn' };
  if (days <= 2) return { label: `через ${days} дн.`, tone: 'warn' };
  return { label: `через ${days} дн.`, tone: 'neutral' };
}

/** Цвет тега раздела-источника задачи. */
const SECTION_COLORS: Record<string, string> = {
  'Согласование КЛ': 'var(--color-bg-brand)',
  'Особый контроль': 'var(--pmrk-risk-3-text)',
  'Аффилированность': '#0a8f8f',
  'Контроль актуальности': 'var(--pmrk-ai)',
  'Оценка': 'var(--pmrk-risk-1)',
  'Отчёты': 'var(--color-typo-secondary)',
};
export function sectionColor(source: string): string {
  return SECTION_COLORS[source] ?? 'var(--color-typo-secondary)';
}
