import { useMemo, useState } from 'react';
import { Button } from '@consta/uikit/Button';
import { SimpleOverlay } from '@/shared/ui/kit';
import { BALANCE_SECTIONS, FLOW_SECTIONS, computeIfrs, defaultIfrsLines, emptyIfrsValues, type BalanceSectionId, type IfrsEntry, type IfrsLine, type IfrsValues } from '@/shared/mock/ifrs';
import { money } from '@/shared/format';

/* Ввод отчётности по МСФО: статьи вносятся вручную, итоги и сходимость
   баланса пересчитываются на лету. «Сформировать» доступно, только когда
   указана дата и баланс сходится; иначе можно сохранить черновик. */

const parseNum = (s: string): number => {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number) => money(n, { unit: '' });

function TotalRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 8px', fontSize: 12.5, fontWeight: strong ? 700 : 600, background: 'var(--color-bg-secondary)', borderRadius: 6, marginTop: 4 }}>
      <span>{label}</span>
      <span className="pmrk-tnum">{fmt(value)}</span>
    </div>
  );
}

const inputStyle = { height: 30, padding: '0 8px', border: '1px solid var(--color-bg-border)', borderRadius: 6, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', fontSize: 13 } as const;

let lineSeq = 0;
const newKey = () => `c${Date.now().toString(36)}${lineSeq++}`;

export function IfrsEntryModal({
  entry, baseLines, takenDates, onSave, onDelete, onClose,
}: {
  entry: IfrsEntry | null;
  /** набор статей баланса компании по умолчанию — из последнего внесённого
      периода (структура баланса у компании от года к году обычно та же) */
  baseLines: IfrsLine[];
  /** даты, за которые МСФО уже внесена (кроме редактируемой записи) */
  takenDates: string[];
  onSave: (e: IfrsEntry) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(entry?.date ?? '');
  const [consolidated, setConsolidated] = useState(entry?.consolidated ?? true);
  const [lines, setLines] = useState<IfrsLine[]>(() => (entry?.lines ?? baseLines).map((l) => ({ ...l })));
  const [raw, setRaw] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (entry) for (const [k, n] of Object.entries(entry.values)) init[k] = n ? String(n) : '';
    return init;
  });

  const values: IfrsValues = useMemo(() => {
    const v = emptyIfrsValues();
    for (const l of lines) v[l.key] = parseNum(raw[l.key] ?? '');
    for (const k of Object.keys(v)) if (!lines.some((l) => l.key === k)) v[k] = parseNum(raw[k] ?? '');
    return v;
  }, [raw, lines]);
  const t = computeIfrs({ lines, values });
  const filled = Object.values(values).some((x) => x !== 0);
  // статья с суммой, но без названия, и одинаковые названия в одном разделе — ошибки ввода
  const unnamed = lines.some((l) => !l.label.trim() && (values[l.key] || 0) !== 0);
  const dupLabel = lines.some((l, i) => l.label.trim() && lines.findIndex((o) => o.section === l.section && o.label.trim().toLowerCase() === l.label.trim().toLowerCase()) !== i);
  const dup = !!date && takenDates.includes(date);
  // допустимое отклонение активов от пассивов — до 2 тыс. руб. (как в проверке на вкладке)
  const balanced = Math.abs(t.balanceDiff) <= 2;
  const canForm = !!date && !dup && filled && balanced && !unnamed && !dupLabel;

  const save = (status: IfrsEntry['status']) => {
    // пустые строки без названия и суммы — просто не сохраняем
    const kept = lines.filter((l) => l.label.trim() || values[l.key]).map((l) => ({ ...l, label: l.label.trim() }));
    const v: IfrsValues = {};
    for (const [k, n] of Object.entries(values)) if (kept.some((l) => l.key === k) || !lines.some((l) => l.key === k)) v[k] = n;
    onSave({ id: entry?.id ?? `ifrs-${date}-${Date.now()}`, date, consolidated, status, lines: kept, values: v });
  };

  const field = (key: string, label: string) => (
    <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
      <span style={{ fontSize: 12.5, lineHeight: 1.3 }}>{label}</span>
      <input
        inputMode="decimal"
        value={raw[key] ?? ''}
        onChange={(e) => setRaw((r) => ({ ...r, [key]: e.target.value.replace(/[^\d\s.,-]/g, '') }))}
        placeholder="0"
        className="pmrk-tnum"
        style={{ ...inputStyle, flex: '0 0 130px', textAlign: 'right' }}
      />
    </label>
  );

  const setLabel = (key: string, label: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, label } : l)));
  const removeLine = (key: string) => {
    setLines((ls) => ls.filter((l) => l.key !== key));
    setRaw((r) => { const { [key]: _drop, ...rest } = r; return rest; });
  };
  const addLine = (section: BalanceSectionId) => setLines((ls) => {
    // новая статья — в конец своего раздела
    const lastIdx = ls.map((l) => l.section).lastIndexOf(section);
    const next = [...ls];
    next.splice(lastIdx + 1, 0, { key: newKey(), label: '', section });
    return next;
  });

  // раздел баланса: названия статей редактируются, статьи можно убрать и добавить
  const balanceSection = (id: BalanceSectionId, totals: { label: string; value: number; strong?: boolean }[]) => {
    const sec = BALANCE_SECTIONS.find((x) => x.id === id)!;
    const items = lines.filter((l) => l.section === id);
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{sec.title}</div>
        {items.map((l) => {
          const dupHere = !!l.label.trim() && items.some((o) => o !== l && o.label.trim().toLowerCase() === l.label.trim().toLowerCase());
          const missing = !l.label.trim() && (values[l.key] || 0) !== 0;
          return (
            <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
              <input
                value={l.label}
                onChange={(e) => setLabel(l.key, e.target.value)}
                placeholder="Название статьи"
                title={l.label || 'Название статьи можно изменить под баланс компании'}
                style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: 12.5, borderColor: dupHere || missing ? 'var(--pmrk-risk-4)' : 'var(--color-bg-border)' }}
              />
              <input
                inputMode="decimal"
                value={raw[l.key] ?? ''}
                onChange={(e) => setRaw((r) => ({ ...r, [l.key]: e.target.value.replace(/[^\d\s.,-]/g, '') }))}
                placeholder="0"
                className="pmrk-tnum"
                style={{ ...inputStyle, flex: '0 0 104px', textAlign: 'right' }}
              />
              <button
                type="button"
                title="Убрать статью из баланса"
                aria-label="Убрать статью"
                onClick={() => removeLine(l.key)}
                style={{ flex: '0 0 24px', height: 24, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-typo-secondary)', fontSize: 16, lineHeight: 1 }}
              >×</button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => addLine(id)}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-typo-brand)', fontSize: 12.5, padding: '4px 0' }}
        >+ Добавить статью</button>
        {totals.map((x) => <TotalRow key={x.label} {...x} />)}
      </div>
    );
  };

  // фиксированные разделы: прибыль/убыток и денежные потоки
  const flowSection = (id: string, totals: { label: string; value: number; strong?: boolean }[]) => {
    const sec = FLOW_SECTIONS.find((x) => x.id === id)!;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{sec.title}</div>
        {sec.hint && <div className="pmrk-muted" style={{ fontSize: 11.5, marginBottom: 2 }}>{sec.hint}</div>}
        {sec.fields.map((f) => field(f.key, f.label))}
        {totals.map((x) => <TotalRow key={x.label} {...x} />)}
      </div>
    );
  };

  return (
    <SimpleOverlay onClose={onClose} maxWidth="1000px">
      <div style={{ padding: 24, width: 'min(1000px, 90vw)' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{entry ? 'Отчётность по МСФО — редактирование' : 'Внести отчётность по МСФО'}</div>
        <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 4, marginBottom: 16 }}>
          Источник — «Данные компании». Суммы в тыс. руб. Итоги и сходимость баланса считаются автоматически.
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 18, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span className="pmrk-muted">Отчётная дата</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ height: 32, padding: '0 8px', border: `1px solid ${dup ? 'var(--pmrk-risk-4)' : 'var(--color-bg-border)'}`, borderRadius: 6, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', fontSize: 13 }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            <span className="pmrk-muted">Вид отчётности</span>
            <select
              value={consolidated ? 'c' : 's'}
              onChange={(e) => setConsolidated(e.target.value === 'c')}
              style={{ height: 32, padding: '0 8px', border: '1px solid var(--color-bg-border)', borderRadius: 6, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', fontSize: 13 }}
            >
              <option value="c">Консолидированная</option>
              <option value="s">Отдельная</option>
            </select>
          </label>
          {dup && <span style={{ fontSize: 12, color: 'var(--pmrk-risk-4)', paddingBottom: 8 }}>За эту дату отчётность по МСФО уже внесена — отредактируйте её.</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 24, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <span className="pmrk-muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Отчёт о финансовом положении</span>
              <button
                type="button"
                title="Вернуть типовой набор статей (введённые суммы по убранным статьям будут потеряны)"
                onClick={() => setLines(defaultIfrsLines())}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-typo-secondary)', fontSize: 11.5 }}
              >Типовой набор статей</button>
            </div>
            <div className="pmrk-muted" style={{ fontSize: 11.5, marginBottom: 10 }}>
              Статьи баланса у каждой компании свои: переименуйте, уберите или добавьте нужные. Следующий период предложит тот же набор.
            </div>
            {balanceSection('nca', [{ label: 'Итого внеоборотные активы', value: t.nonCurrent }])}
            {balanceSection('ca', [{ label: 'Итого оборотные активы', value: t.current }, { label: 'ИТОГО АКТИВЫ', value: t.assets, strong: true }])}
            {balanceSection('eq', [{ label: 'Итого капитал', value: t.equity }])}
            {balanceSection('ltl', [{ label: 'Итого долгосрочные обязательства', value: t.ltl }])}
            {balanceSection('stl', [
              { label: 'Итого краткосрочные обязательства', value: t.stl },
              { label: 'ИТОГО КАПИТАЛ И ОБЯЗАТЕЛЬСТВА', value: t.liabAndEquity, strong: true },
            ])}
          </div>
          <div>
            <div className="pmrk-muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Результаты и денежные потоки</div>
            {flowSection('pl', [
              { label: 'Прибыль до налогообложения', value: t.beforeTax },
              { label: 'Прибыль за период', value: t.net, strong: true },
              { label: 'Итого совокупный доход', value: t.totalCI },
            ])}
            {flowSection('cf', [
              { label: 'Чистое изменение денежных средств', value: t.cfNet },
              { label: 'Денежные средства на конец периода', value: t.cashEnd, strong: true },
            ])}
            {filled && t.cashDiff !== 0 && (
              <div style={{ fontSize: 12, color: 'var(--pmrk-risk-3)' }}>
                Остаток денежных средств по ОДДС отличается от баланса на {fmt(t.cashDiff)} — проверьте строки движения денежных средств.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--color-bg-border)' }}>
          <div style={{ flex: 1, fontSize: 12.5 }}>
            {!filled ? (
              <span className="pmrk-muted">Внесите показатели отчётности</span>
            ) : unnamed ? (
              <span style={{ color: 'var(--pmrk-risk-4)' }}>Укажите название статьи, по которой внесена сумма</span>
            ) : dupLabel ? (
              <span style={{ color: 'var(--pmrk-risk-4)' }}>В разделе баланса есть статьи с одинаковым названием</span>
            ) : balanced ? (
              <span style={{ color: 'var(--pmrk-risk-1)' }}>✓ Баланс сходится: активы = капитал + обязательства (допустимо отклонение до 2 тыс. руб.)</span>
            ) : (
              <span style={{ color: 'var(--pmrk-risk-4)' }}>Баланс не сходится: активы − (капитал + обязательства) = {fmt(t.balanceDiff)}</span>
            )}
          </div>
          {entry && onDelete && <Button size="s" view="ghost" label="Удалить" onClick={() => onDelete(entry.id)} />}
          <Button size="s" view="ghost" label="Отмена" onClick={onClose} />
          <Button size="s" view="secondary" label="Сохранить черновик" disabled={!date || dup || !filled} onClick={() => save('Черновик')} />
          <Button size="s" label="Сформировать отчётность" disabled={!canForm} onClick={() => save('Сформирована')} />
        </div>
      </div>
    </SimpleOverlay>
  );
}
