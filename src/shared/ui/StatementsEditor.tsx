import { useState } from 'react';
import { Button } from '@consta/uikit/Button';
import { IconDocAdd } from '@consta/icons/IconDocAdd';
import { useApp } from '@/app/AppContext';
import { money } from '@/shared/format';
import { Segmented, FileDrop } from './kit';

/* Редактор отчётности Ф1–Ф4 (ФТ-3.4 / ФТ-6.3). Общий для оценки и заявки КЛ.
   - период / валюта / единицы измерения
   - вкладки Ф1–Ф4; на Ф1 — проверка актив=пассив (422 BALANCE_MISMATCH блокирует)
   - AI-5: drag-drop PDF → автозаполнение с подсветкой неуверенных ячеек «проверьте»
   - вложения. Числа в расчёт идут только после прохождения баланса (движок, не AI). */

interface Row {
  label: string;
  side: 'asset' | 'liability' | 'none';
  value: number;
  extracted?: boolean;
  uncertain?: boolean;
}

const BLANK: Row[] = [
  { label: 'I. Внеоборотные активы', side: 'asset', value: 0 },
  { label: 'II. Оборотные активы', side: 'asset', value: 0 },
  { label: 'БАЛАНС (актив)', side: 'none', value: 0 },
  { label: 'III. Капитал и резервы', side: 'liability', value: 0 },
  { label: 'IV. Долгосрочные обязательства', side: 'liability', value: 0 },
  { label: 'V. Краткосрочные обязательства', side: 'liability', value: 0 },
  { label: 'БАЛАНС (пассив)', side: 'none', value: 0 },
];

const FORMS = [
  { key: 'f1', label: 'Ф1 · Баланс' },
  { key: 'f2', label: 'Ф2 · Фин. результаты' },
  { key: 'f3', label: 'Ф3 · Изм. капитала' },
  { key: 'f4', label: 'Ф4 · ДДС' },
];

const OTHER_ROWS: Record<string, { label: string; value: number }[]> = {
  f2: [
    { label: 'Выручка', value: 8_420_000 }, { label: 'Себестоимость продаж', value: -7_650_000 },
    { label: 'Валовая прибыль', value: 770_000 }, { label: 'Прибыль до налогообложения', value: 312_000 },
    { label: 'Чистая прибыль (убыток)', value: 248_000 },
  ],
  f3: [
    { label: 'Капитал на начало периода', value: 410_000 }, { label: 'Чистая прибыль периода', value: 248_000 },
    { label: 'Распределение прибыли', value: -120_000 }, { label: 'Капитал на конец периода', value: 538_000 },
  ],
  f4: [
    { label: 'ДДС от операционной деятельности', value: 320_000 }, { label: 'ДДС от инвестиционной деятельности', value: -180_000 },
    { label: 'ДДС от финансовой деятельности', value: -90_000 }, { label: 'Чистое изменение денежных средств', value: 50_000 },
  ],
};

export function StatementsEditor(props: { onValidChange?: (valid: boolean) => void }) {
  const { aiOn } = useApp();
  const [form, setForm] = useState('f1');
  const [rows, setRows] = useState<Row[]>(BLANK);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const assets = rows.filter((r) => r.side === 'asset').reduce((s, r) => s + r.value, 0);
  const liabilities = rows.filter((r) => r.side === 'liability').reduce((s, r) => s + r.value, 0);
  const balanced = assets > 0 && assets === liabilities;

  const setVal = (i: number, v: number) => {
    setRows((prev) => {
      const next = prev.map((r, idx) => (idx === i ? { ...r, value: v, uncertain: false } : r));
      const a = next.filter((r) => r.side === 'asset').reduce((s, r) => s + r.value, 0);
      const l = next.filter((r) => r.side === 'liability').reduce((s, r) => s + r.value, 0);
      next[2] = { ...next[2], value: a };
      next[6] = { ...next[6], value: l };
      props.onValidChange?.(a > 0 && a === l);
      return next;
    });
  };

  const runExtract = () => {
    setExtracting(true);
    setTimeout(() => {
      const a1 = 124_000, a2 = 286_000, total = a1 + a2;
      setRows([
        { label: 'I. Внеоборотные активы', side: 'asset', value: a1, extracted: true },
        { label: 'II. Оборотные активы', side: 'asset', value: a2, extracted: true, uncertain: true },
        { label: 'БАЛАНС (актив)', side: 'none', value: total },
        { label: 'III. Капитал и резервы', side: 'liability', value: 142_000, extracted: true },
        { label: 'IV. Долгосрочные обязательства', side: 'liability', value: 96_000, extracted: true, uncertain: true },
        { label: 'V. Краткосрочные обязательства', side: 'liability', value: total - 142_000 - 96_000, extracted: true },
        { label: 'БАЛАНС (пассив)', side: 'none', value: total },
      ]);
      setExtracting(false);
      setForm('f1');
      props.onValidChange?.(true);
    }, 1100);
  };

  const sel: React.CSSProperties = { height: 32, padding: '0 8px', border: '1px solid var(--color-bg-border)', borderRadius: 6, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', fontSize: 12.5 };

  return (
    <div>
      {/* период / валюта / единицы (ФТ-3.4) */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><span className="pmrk-muted">Период отчётности</span>
          <select style={sel}><option>Годовая · 2025</option><option>Промежуточная · 1 кв. 2026</option><option>Годовая · 2024</option></select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><span className="pmrk-muted">Валюта</span>
          <select style={sel}><option>RUB · ₽</option><option>USD · $</option><option>EUR · €</option></select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><span className="pmrk-muted">Единицы</span>
          <select style={sel}><option>тыс. руб.</option><option>млн руб.</option><option>руб.</option></select>
        </label>
      </div>

      {/* drag-drop зона (AI-5) */}
      {aiOn && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); runExtract(); }}
          style={{ border: `2px dashed ${dragOver ? 'var(--pmrk-ai)' : 'var(--pmrk-ai-border)'}`, background: dragOver ? 'var(--pmrk-ai-bg-2)' : 'var(--pmrk-ai-bg)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <span className="pmrk-ai__badge">✦ AI</span>
          <div style={{ flex: 1, fontSize: 13 }}>
            <b>Извлечение отчётности из PDF (AI-5).</b> Перетащите скан/PDF МСФО — Ф1–Ф4 заполнятся автоматически, неуверенные ячейки подсветятся «проверьте». Валидацию актив=пассив выполняет движок.
          </div>
          <Button size="s" view="secondary" label={extracting ? 'Распознаю…' : 'Загрузить демо-PDF'} iconLeft={IconDocAdd as never} loading={extracting} onClick={runExtract} />
        </div>
      )}

      {/* вкладки форм Ф1–Ф4 */}
      <div style={{ marginBottom: 12 }}>
        <Segmented value={form} onChange={setForm} items={FORMS} />
      </div>

      {form === 'f1' ? (
        <>
          <div className="pmrk-table">
            <div className="pmrk-table__head">
              <div className="pmrk-th" style={{ flex: 2 }}>Бухгалтерский баланс (Форма №1) · на 31.12.2025</div>
              <div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Значение, тыс. ₽</div>
            </div>
            {rows.map((r, i) => {
              const isTotal = r.side === 'none';
              return (
                <div key={i} className="pmrk-tr" style={{ cursor: 'default', fontWeight: isTotal ? 700 : 400, background: r.uncertain ? '#fff8e1' : undefined }}>
                  <div className="pmrk-td" style={{ flex: 2 }}>
                    {r.label}
                    {r.uncertain && <span style={{ marginLeft: 8, fontSize: 11, color: '#b8860b' }}>✦ проверьте</span>}
                  </div>
                  <div className="pmrk-td" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex' }}>
                    {isTotal ? (
                      <span className="pmrk-tnum">{money(r.value)}</span>
                    ) : (
                      <input type="number" value={r.value || ''} onChange={(e) => setVal(i, Number(e.target.value))} placeholder="0" style={{ width: 140, textAlign: 'right', height: 28, border: `1px solid ${r.uncertain ? '#e6c200' : 'var(--color-bg-border)'}`, borderRadius: 6, padding: '0 8px', background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', outline: 'none', fontVariantNumeric: 'tabular-nums' }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10 }}>
            {balanced ? (
              <span style={{ color: 'var(--pmrk-risk-1)', fontSize: 13, fontWeight: 600 }}>✓ Баланс сходится: активы = пассивам ({money(assets, { unit: 'тыс. руб.' })}). Сохранение и расчёт разблокированы.</span>
            ) : assets > 0 || liabilities > 0 ? (
              <span style={{ color: 'var(--pmrk-risk-4)', fontSize: 13, fontWeight: 600 }}>⚠ Баланс не сходится: активы {money(assets, { unit: 'тыс. руб.' })} ≠ пассивы {money(liabilities, { unit: 'тыс. руб.' })}. Внесение изменений заблокировано (BALANCE_MISMATCH).</span>
            ) : (
              <span className="pmrk-muted" style={{ fontSize: 13 }}>Заполните форму вручную или загрузите PDF. Проверка актив=пассив — обязательна (ФТ-3.4).</span>
            )}
          </div>
        </>
      ) : (
        <div className="pmrk-table">
          <div className="pmrk-table__head">
            <div className="pmrk-th" style={{ flex: 2 }}>{FORMS.find((f) => f.key === form)?.label} · на 31.12.2025</div>
            <div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Значение, тыс. ₽</div>
          </div>
          {OTHER_ROWS[form].map((r, i) => (
            <div key={i} className="pmrk-tr" style={{ cursor: 'default', fontWeight: r.label.startsWith('Чист') || r.label.startsWith('Капитал на конец') ? 700 : 400 }}>
              <div className="pmrk-td" style={{ flex: 2 }}>{r.label}</div>
              <div className="pmrk-td" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex' }}>
                <input type="number" defaultValue={r.value} style={{ width: 140, textAlign: 'right', height: 28, border: '1px solid var(--color-bg-border)', borderRadius: 6, padding: '0 8px', background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', outline: 'none', fontVariantNumeric: 'tabular-nums' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* вложения */}
      <div style={{ marginTop: 16 }}>
        <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>Вложения (сканы/PDF отчётности)</div>
        <FileDrop hint="PDF, XLSX · оригиналы форм отчётности" accept=".pdf,.xlsx,.xls" />
      </div>
    </div>
  );
}
