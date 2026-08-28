import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { IconAdd } from '@consta/icons/IconAdd';
import { IconDownload } from '@consta/icons/IconDownload';
import { IconFavoriteStroked } from '@consta/icons/IconFavoriteStroked';
import { IconFavoriteFilled } from '@consta/icons/IconFavoriteFilled';
import { IconSearchStroked } from '@consta/icons/IconSearchStroked';
import { IconForward } from '@consta/icons/IconForward';
import { useApp } from '@/app/AppContext';
import { ROLES, can } from '@/shared/roles';
import { PageHeader, SectionCard, GroupBadge, Stat, EmptyState, AuditFooter, DateActuality, CalcStamp, Segmented, FileDrop } from '@/shared/ui/kit';
import { StatementsEditor } from '@/shared/ui/StatementsEditor';
import { HEROES, BY_UID, REGISTRY } from '@/shared/mock/data';
import { buildAssessment, DIRECTIONS, METHODOLOGY_TITLE, STOP_FACTORS, CATEGORIES_OIL, CATEGORIES_MTR, CATEGORIES_ADV, type Direction, type DirectionResult, type ScoreBlock } from '@/shared/mock/assessment';
import { SCORE_EXPLAIN } from '@/shared/mock/ai';
import type { Counterparty } from '@/shared/mock/types';
import { dateRu, moneyCompact, money, inn as fmtInn } from '@/shared/format';

const selStyle: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', border: '1px solid var(--color-bg-border)', borderRadius: 8, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', outline: 'none', fontSize: 13 };
function Field({ label, children, hint, req }: { label: string; children: React.ReactNode; hint?: string; req?: boolean }) {
  return (
    <label style={{ display: 'block' }}>
      <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}{req && <span style={{ color: 'var(--pmrk-risk-4)' }}> *</span>}</div>
      {children}
      {hint && <div className="pmrk-muted" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>}
    </label>
  );
}

/* ========================= Поиск контрагента (ФТ-3.1) ===================== */
function CounterpartySearch({ value, onChange }: { value: Counterparty | null; onChange: (c: Counterparty | null) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Counterparty | null>(null);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return REGISTRY.filter((c) => c.name.toLowerCase().includes(s) || c.inn.includes(s)).slice(0, 20); // макс. 20 (ФТ-3.1)
  }, [q]);

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--color-bg-border)', borderRadius: 8, background: 'var(--color-bg-secondary)' }}>
        <GroupBadge group={value.group} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{value.name}</div>
          <div className="pmrk-muted" style={{ fontSize: 11.5 }}>ИНН {fmtInn(value.inn)} · {value.region}</div>
        </div>
        <Button size="xs" view="clear" label="Быстрый просмотр" onClick={() => setPreview(value)} />
        <Button size="xs" view="ghost" label="Заменить" onClick={() => onChange(null)} />
        <Button size="xs" view="clear" label="✕" onClick={() => onChange(null)} title="Удалить выбор" />
        {preview && <PreviewPopup cp={preview} onClose={() => setPreview(null)} onOpen={() => navigate(`/counterparties/${preview.uid}`)} />}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', border: '1px solid var(--color-bg-border)', borderRadius: 8, background: 'var(--color-bg-default)' }}>
        <IconSearchStroked size="s" className="pmrk-muted" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Поиск по наименованию или ИНН (по реестру контрагентов)"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-typo-primary)', fontSize: 13 }}
        />
      </div>
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: 40, left: 0, right: 0, zIndex: 20, background: 'var(--color-bg-default)', border: '1px solid var(--color-bg-border)', borderRadius: 10, boxShadow: 'var(--pmrk-shadow-pop)', maxHeight: 320, overflowY: 'auto' }}>
          <div className="pmrk-muted" style={{ fontSize: 11, padding: '6px 12px' }}>Найдено {results.length} (макс. 20)</div>
          {results.map((c) => (
            <div key={c.uid} className="pmrk-tr" style={{ padding: '8px 12px' }} onClick={() => { onChange(c); setOpen(false); setQ(''); }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }} className="pmrk-truncate">{c.name}</div>
                <div className="pmrk-muted" style={{ fontSize: 11 }}>ИНН {fmtInn(c.inn)} · {c.region}</div>
              </div>
              <GroupBadge group={c.group} />
              <Button size="xs" view="clear" onlyIcon iconLeft={IconSearchStroked as never} title="Быстрый просмотр" onClick={(e) => { e.stopPropagation(); setPreview(c); }} />
            </div>
          ))}
        </div>
      )}
      {preview && <PreviewPopup cp={preview} onClose={() => setPreview(null)} onOpen={() => navigate(`/counterparties/${preview.uid}`)} />}
    </div>
  );
}

function PreviewPopup({ cp, onClose, onOpen }: { cp: Counterparty; onClose: () => void; onOpen: () => void }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={onClose} />
      <div style={{ position: 'absolute', top: 44, right: 0, zIndex: 101, width: 360, background: 'var(--color-bg-default)', border: '1px solid var(--color-bg-border)', borderRadius: 12, boxShadow: 'var(--pmrk-shadow-pop)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{cp.name}</div>
          <span className="pmrk-clickable" onClick={onClose}>✕</span>
        </div>
        <div className="pmrk-muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>ИНН {fmtInn(cp.inn)} · {cp.region}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <GroupBadge group={cp.group} withScore={cp.score} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5 }}>
          <div><span className="pmrk-muted">Статус:</span> {cp.status}</div>
          <div><span className="pmrk-muted">ОКВЭД:</span> {cp.okvedCode}</div>
          <div><span className="pmrk-muted">Действ. КЛ:</span> {cp.creditLimit ? moneyCompact(cp.creditLimit) : '—'}</div>
          <div><span className="pmrk-muted">Выручка:</span> {moneyCompact(cp.revenue)}</div>
        </div>
        <Button size="xs" view="ghost" label="Открыть профиль" iconRight={IconForward as never} onClick={onOpen} style={{ marginTop: 10 }} />
      </div>
    </>
  );
}

/* ===================== Журнал экспресс-оценок (ФТ-3.7) =================== */
const JOURNAL = HEROES.map((h) => {
  const a = buildAssessment(h);
  return { cp: h, date: a.OIL.date, period: '2025 год', standard: 'РСБУ', oil: a.OIL, mtr: a.MTR, adv: a.ADVANCE, author: h.assessments[0]?.author ?? 'Соколова Е.В.' };
});

export function AssessmentJournal() {
  const navigate = useNavigate();
  const { role } = useApp();
  const [limit, setLimit] = useState(30);
  return (
    <div className="pmrk-page">
      <PageHeader
        title="Экспресс-оценки"
        subtitle="Журнал оценок кредитоспособности · 3 методики (нефть/НП · МТР/логистика · авансирование)"
        breadcrumbs={[{ label: 'Главная', to: '/' }, { label: 'Экспресс-оценки' }]}
        actions={<>
          {can(role, 'massAssessment') && <Button size="s" view="secondary" label="Выгрузка экспресс-оценок" onClick={() => navigate('/assessments/mass')} />}
          <Button size="s" label="Новая оценка" iconLeft={IconAdd as never} onClick={() => navigate('/assessments/new')} />
        </>}
      />
      <SectionCard title={`Журнал оценок · показано ${Math.min(limit, JOURNAL.length)} из ${JOURNAL.length}`} extra={<DateActuality date="2026-06-15" source="scoring" />}>
        <div style={{ overflowX: 'auto' }}>
          <div className="pmrk-table" style={{ minWidth: 1500 }}>
            <div className="pmrk-table__head">
              {['Наименование', 'ИНН', 'Дата создания', 'Период отч.', 'Стандарт', 'Группа (нефть/НП)', 'Группа (МТР/ЛУ)', 'Степень надёжности', 'Рек. КЛ (нефть/НП)', 'Рек. КЛ (МТР/ЛУ)', 'Лимит аванс.', 'Ед. изм.', 'Валюта', 'Кем изменено'].map((h, i) => (
                <div key={i} className="pmrk-th" style={{ flex: i === 0 ? 2.2 : 1, minWidth: i === 0 ? 200 : 90 }}>{h}</div>
              ))}
            </div>
            {JOURNAL.slice(0, limit).map((r) => (
              <div key={r.cp.uid} className="pmrk-tr" onClick={() => navigate(`/assessments/${r.cp.assessments[0]?.id ?? r.cp.uid}`)}>
                <div className="pmrk-td" style={{ flex: 2.2, minWidth: 200, fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); navigate(`/counterparties/${r.cp.uid}`); }}><span className="pmrk-truncate" style={{ color: 'var(--color-typo-brand)' }}>{r.cp.shortName}</span></div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 90 }}>{r.cp.inn}</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}>{dateRu(r.date)}</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}>{r.period}</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}>{r.standard}</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}><GroupBadge group={r.oil.group} /></div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}><GroupBadge group={r.mtr.group} /></div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}>{r.oil.reliability}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 90 }}>{r.oil.limit ? moneyCompact(r.oil.limit) : '—'}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 90 }}>{r.mtr.limit ? moneyCompact(r.mtr.limit) : '—'}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 90 }}>{r.adv.limit ? moneyCompact(r.adv.limit) : '—'}</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}>тыс. руб.</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}>RUB</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 90 }}>{r.author}</div>
              </div>
            ))}
          </div>
        </div>
        {limit < JOURNAL.length && <div style={{ textAlign: 'center', marginTop: 10 }}><Button size="s" view="ghost" label="Показать больше" onClick={() => setLimit((l) => l + 30)} /></div>}
      </SectionCard>
    </div>
  );
}

/* ===================== Вкладка «Оценка» — 3 методики (ФТ-3.5) ============= */
function ScoreBlockTable({ block }: { block: ScoreBlock }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{block.title}</span>
        <span className="pmrk-tnum" style={{ fontWeight: 700 }}>{block.subtotal} балл.</span>
      </div>
      <div className="pmrk-table">
        <div className="pmrk-table__head">
          <div className="pmrk-th" style={{ flex: 2 }}>Показатель</div>
          <div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Значение</div>
          <div className="pmrk-th" style={{ flex: 0.8, justifyContent: 'flex-end' }}>Баллы</div>
        </div>
        {block.rows.map((r, i) => (
          <div key={i} className="pmrk-tr" style={{ cursor: 'default' }}>
            <div className="pmrk-td" style={{ flex: 2 }}>{r.name}</div>
            <div className="pmrk-td pmrk-tnum" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex' }}>{r.value}</div>
            <div className="pmrk-td pmrk-tnum" style={{ flex: 0.8, justifyContent: 'flex-end', display: 'flex', fontWeight: 600 }}>{r.points} / {r.max}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssessmentResultView({ cp, onRecalc }: { cp: Counterparty; onRecalc?: () => void }) {
  const { aiOn } = useApp();
  const all = useMemo(() => buildAssessment(cp), [cp.uid]);
  const [dir, setDir] = useState<Direction>('OIL');
  const r: DirectionResult = all[dir];
  const explain = SCORE_EXPLAIN[cp.uid];
  const [showExplain, setShowExplain] = useState(false);
  const history = useMemo(
    () => cp.assessments.filter((a) => a.direction === dir).slice().sort((x, y) => y.date.localeCompare(x.date)),
    [cp.uid, dir],
  );

  return (
    <SectionCard
      title="Оценка кредитоспособности"
      extra={<DateActuality date={r.date} source="ядро scoring" />}
    >
      {/* переключатель 3 методик (ФТ-3.5) */}
      <div style={{ marginBottom: 14 }}>
        <Segmented value={dir} onChange={(k) => setDir(k as Direction)} items={DIRECTIONS.map((d) => ({ key: d.key, label: d.short }))} />
      </div>

      {/* итоговое заключение */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center', padding: '12px 0' }}>
        <div style={{ textAlign: 'center' }}>
          <GroupBadge group={r.group} />
          <div style={{ fontSize: 40, fontWeight: 800, margin: '6px 0', fontVariantNumeric: 'tabular-nums' }}>{r.totalScore}</div>
          <div className="pmrk-muted" style={{ fontSize: 12, maxWidth: 170 }}>{r.groupText}</div>
          <div style={{ marginTop: 6 }}><CalcStamp date={r.date} source={r.method} /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <Stat label="Методика" value={`${r.method}`} sub={r.label} />
          <Stat label="Степень надёжности" value={r.reliability} />
          <Stat label="Контрагент" value={cp.shortName} sub={`ИНН ${fmtInn(cp.inn)}`} />
          <Stat label="Категория контрагента" value={r.category} />
          <Stat label="Подразделение" value={r.department} />
          <Stat label="Класс / внутренний рейтинг" value={`${r.contragentClass} / ${r.internalRating}`} sub="класс A–C, рейтинг = класс + группа" />
        </div>
      </div>

      {aiOn && explain && dir === 'OIL' && (
        <div style={{ margin: '4px 0 14px' }}>
          <button onClick={() => setShowExplain((v) => !v)} style={{ background: 'var(--pmrk-ai-bg)', border: '1px solid var(--pmrk-ai-border)', color: 'var(--pmrk-ai-strong)', borderRadius: 6, padding: '4px 10px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
            ✦ почему группа {r.group}? {showExplain ? '▲' : '▼'}
          </button>
          {showExplain && (
            <div className="pmrk-ai-surface" style={{ marginTop: 8, padding: '12px 16px 12px 20px' }}>
              <div className="pmrk-ai-accentbar" />
              <div style={{ fontSize: 13 }}><b>Что изменилось:</b> {explain.delta}</div>
              <div style={{ fontSize: 13, marginTop: 6, color: 'var(--pmrk-ai-strong)' }}><b>Чувствительность:</b> {explain.toNextGroup}</div>
              <div className="pmrk-ai__foot"><span>Балл и группа — детерминированы ядром scoring (П-1). AI только объясняет.</span></div>
            </div>
          )}
        </div>
      )}

      {/* блоки показателей 1–3 + итог */}
      {r.blocks.map((b) => <ScoreBlockTable key={b.key} block={b} />)}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-bg-secondary)', borderRadius: 8, marginBottom: 14 }}>
        <span style={{ fontWeight: 700 }}>Итого скоринг-балл (1 + 2 + 3)</span>
        <span className="pmrk-tnum" style={{ fontWeight: 800, fontSize: 18 }}>{r.totalScore}</span>
      </div>

      {/* 4. Расчёт кредитного лимита — постатейно по Форме №1 (ФТ-3.5) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>4. Расчёт кредитного лимита</span>
          <span className="pmrk-tnum" style={{ fontWeight: 700 }}>{r.limit ? moneyCompact(r.limit) : '—'}</span>
        </div>
        <div className="pmrk-table">
          <div className="pmrk-table__head">
            <div className="pmrk-th" style={{ flex: 2, minWidth: 0 }}>Показатель</div>
            <div className="pmrk-th" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>тыс. руб.</div>
          </div>
          {r.limitSteps.map((s) => (
            <div key={s.label} className="pmrk-tr" style={{ cursor: 'default' }}>
              <div className="pmrk-td" style={{ flex: 2, minWidth: 0 }}>{s.label}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end', display: 'flex' }}>{money(s.value, { unit: '' })}</div>
            </div>
          ))}
          <div className="pmrk-tr" style={{ cursor: 'default' }}>
            <div className="pmrk-td" style={{ flex: 2, minWidth: 0 }}>Понижающий коэффициент (итого баллов / 100)</div>
            <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end', display: 'flex' }}>{r.downRatio.toFixed(2)}</div>
          </div>
          <div className="pmrk-tr" style={{ cursor: 'default', fontWeight: 700 }}>
            <div className="pmrk-td" style={{ flex: 2, minWidth: 0 }}>Кредитный лимит контрагента (база × понижающий коэффициент)</div>
            <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end', display: 'flex' }}>{money(Math.round(r.limit / 1000), { unit: '' })}</div>
          </div>
        </div>
      </div>

      {/* Все экспресс-оценки по направлению (ФТ-3.7) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, padding: '6px 0' }}>Все экспресс-оценки по направлению «{r.short}»</div>
        {history.length === 0 ? (
          <EmptyState text="По этому направлению сохранённых оценок ещё нет — показан предварительный расчёт по текущим данным." />
        ) : (
          <div className="pmrk-table">
            <div className="pmrk-table__head">
              <div className="pmrk-th" style={{ flex: 1, minWidth: 0 }}>Дата оценки</div>
              <div className="pmrk-th" style={{ flex: 1, minWidth: 0 }}>Период отчётности</div>
              <div className="pmrk-th" style={{ flex: 0.8, minWidth: 0 }}>Группа (1–4)</div>
              <div className="pmrk-th" style={{ flex: 1.2, minWidth: 0, justifyContent: 'flex-end' }}>Кредитный лимит</div>
              <div className="pmrk-th" style={{ flex: 0.8, minWidth: 0, justifyContent: 'flex-end' }}>Скоринг-балл</div>
              <div className="pmrk-th" style={{ flex: 1, minWidth: 0 }}>Категория</div>
            </div>
            {history.map((x) => (
              <div key={x.id} className="pmrk-tr" style={{ cursor: 'default' }}>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 0 }}>{dateRu(x.date)}</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 0 }}>{dateRu(x.reportPeriod)}</div>
                <div className="pmrk-td" style={{ flex: 0.8, minWidth: 0 }}>{x.group}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1.2, minWidth: 0, justifyContent: 'flex-end', display: 'flex' }}>{x.limit ? moneyCompact(x.limit) : '—'}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 0.8, minWidth: 0, justifyContent: 'flex-end', display: 'flex' }}>{x.score}</div>
                <div className="pmrk-td" style={{ flex: 1, minWidth: 0 }}>{r.category}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* методология (ФТ-3.5) */}
      <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 14 }}>МЕТОДОЛОГИЯ: {METHODOLOGY_TITLE[r.direction]}</div>

      {/* корректировка/пересчёт + выгрузка (ФТ-3.5/3.6) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--color-bg-border)', paddingTop: 12 }}>
        <span className="pmrk-muted" style={{ fontSize: 12.5, flex: 1 }}>Корректировка отчётности, перевыбор к/а или стандарта → пересчёт.</span>
        {onRecalc && <Button size="s" view="ghost" label="Пересчитать" onClick={onRecalc} />}
        <Button size="xs" view="secondary" label={`Выгрузить (${r.short})`} iconLeft={IconDownload as never} title={`xlsx по шаблону ${r.template}`} />
      </div>
    </SectionCard>
  );
}

/* ===================== Создание оценки — мастер (ФТ-3.1) ================= */
const STEPS = ['Параметры', 'Отчётность', 'Оценка'];

export function AssessmentCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const advanceMode = params.get('direction') === 'ADVANCE';
  const [step, setStep] = useState(0);
  const [cp, setCp] = useState<Counterparty | null>(BY_UID.get('cp-balt') ?? null);
  const [standard, setStandard] = useState<'РСБУ' | 'МСФО'>('РСБУ');
  const [balanced, setBalanced] = useState(false);

  return (
    <div className="pmrk-page">
      <PageHeader
        title={advanceMode ? 'Расчёт лимита авансирования' : 'Новая экспресс-оценка'}
        subtitle="Параметры → отчётность → оценка · число группы детерминировано (П-1)"
        breadcrumbs={[{ label: 'Экспресс-оценки', to: '/assessments' }, { label: 'Новая' }]}
      />
      <div className="pmrk-route" style={{ marginBottom: 20 }}>
        {STEPS.map((s, i) => (
          <div key={s} className={`pmrk-route__step ${i < step ? 'pmrk-route__step--done' : i === step ? 'pmrk-route__step--current' : 'pmrk-route__step--upcoming'}`}>
            <div className="pmrk-route__num">Шаг {i + 1}</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{s}</div>
          </div>
        ))}
      </div>

      {step === 0 && (
        <SectionCard title="Параметры экспресс-оценки">
          <div style={{ display: 'grid', gap: 16 }}>
            <Field label="Контрагент" req hint="Поиск по реестру · до 20 результатов · быстрый просмотр профиля">
              <CounterpartySearch value={cp} onChange={setCp} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Стандарт отчётности" req>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['РСБУ', 'МСФО'] as const).map((s) => (
                    <div key={s} className={`pmrk-filterchip ${standard === s ? 'pmrk-filterchip--active' : ''}`} onClick={() => setStandard(s)}>{s}</div>
                  ))}
                </div>
              </Field>
            </div>

            {/* условные поля МСФО (ФТ-3.1) */}
            {standard === 'МСФО' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 14, border: '1px dashed var(--color-bg-border)', borderRadius: 10, background: 'var(--color-bg-secondary)' }}>
                <div style={{ gridColumn: '1 / -1', fontSize: 12.5, fontWeight: 600 }}>Дополнительные параметры для МСФО</div>
                <Field label="Дата регистрации"><input type="date" style={selStyle} /></Field>
                <Field label="Наличие СТОП-факторов" req>
                  <select style={selStyle}>{STOP_FACTORS.map((s) => <option key={s}>{s}</option>)}</select>
                </Field>
                <Field label="Категория (нефть, газ, НП)">
                  <select style={selStyle}>{CATEGORIES_OIL.map((s) => <option key={s}>{s}</option>)}</select>
                </Field>
                <Field label="Категория (МТР и логистические услуги)">
                  <select style={selStyle}>{CATEGORIES_MTR.map((s) => <option key={s}>{s}</option>)}</select>
                </Field>
                <Field label="Категория (лимит авансового платежа)">
                  <select style={selStyle}>{CATEGORIES_ADV.map((s) => <option key={s}>{s}</option>)}</select>
                </Field>
              </div>
            )}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="s" label="Далее: отчётность" iconRight={IconForward as never} disabled={!cp} onClick={() => setStep(1)} />
          </div>
        </SectionCard>
      )}

      {step === 1 && (
        <SectionCard title="Отчётность (Ф1–Ф4)" extra={<span className="pmrk-muted" style={{ fontSize: 12 }}>стандарт: {standard} · подтягивается из СПАРК</span>}>
          <StatementsEditor onValidChange={setBalanced} />
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Button size="s" view="ghost" label="Назад" onClick={() => setStep(0)} />
            <Button size="s" label="Рассчитать оценку" disabled={!balanced} onClick={() => setStep(2)} title={balanced ? '' : 'Сначала сведите баланс (актив=пассив)'} />
          </div>
        </SectionCard>
      )}

      {step === 2 && cp && (
        <>
          <AssessmentResultView cp={cp} onRecalc={() => setStep(1)} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button size="s" view="ghost" label="Назад к отчётности" onClick={() => setStep(1)} />
            <Button size="s" view="secondary" label="Сохранить и открыть форму" onClick={() => navigate(`/assessments/${cp.assessments[0]?.id ?? cp.uid}`)} />
          </div>
        </>
      )}
    </div>
  );
}

/* ===================== Форма оценки — 3 вкладки (ФТ-3.2/3.3) ============= */
export function AssessmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cp = useMemo(() => {
    const byA = HEROES.find((h) => h.assessments.some((a) => a.id === id));
    return byA ?? BY_UID.get(id ?? '') ?? null;
  }, [id]);
  const [tab, setTab] = useState('general');
  const [fav, setFav] = useState(false);
  const [edit, setEdit] = useState(false);

  if (!cp) return <div className="pmrk-page"><EmptyState title="Оценка не найдена" text="Вернитесь в журнал." action={<Button size="s" label="В журнал" onClick={() => navigate('/assessments')} />} /></div>;

  return (
    <div className="pmrk-page">
      <PageHeader
        title={<span>{cp.name} <span className="pmrk-muted" style={{ fontSize: 14, fontWeight: 400 }}>· ИНН {fmtInn(cp.inn)}</span></span>}
        subtitle="Форма экспресс-оценки · отчётность и внешние данные — из СПАРК, опыт сотрудничества — из АРМ КК"
        breadcrumbs={[{ label: 'Экспресс-оценки', to: '/assessments' }, { label: cp.shortName }]}
        actions={<>
          <Button size="s" view={fav ? 'primary' : 'ghost'} onlyIcon iconLeft={(fav ? IconFavoriteFilled : IconFavoriteStroked) as never} title="В избранное" onClick={() => setFav((v) => !v)} />
          <Button size="s" view={edit ? 'primary' : 'secondary'} label={edit ? 'Режим редактирования' : 'Редактировать'} onClick={() => setEdit((v) => !v)} />
        </>}
      />

      {/* 3 кнопки выгрузки (ФТ-3.2/3.6) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="pmrk-muted" style={{ fontSize: 12, alignSelf: 'center' }}>Выгрузить оценку:</span>
        <Button size="xs" view="secondary" label="Нефть, газ, НП" iconLeft={IconDownload as never} title="Ш-13.08.01-01" />
        <Button size="xs" view="secondary" label="МТР и логистические услуги" iconLeft={IconDownload as never} title="Ш-13.08.01-03" />
        <Button size="xs" view="secondary" label="Авансирование" iconLeft={IconDownload as never} title="Ш-13.08-03" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Segmented value={tab} onChange={setTab} items={[{ key: 'general', label: 'Общие сведения' }, { key: 'statements', label: 'Отчётность' }, { key: 'result', label: 'Оценка' }]} />
      </div>

      {tab === 'general' && <GeneralTab cp={cp} edit={edit} />}
      {tab === 'statements' && (
        <SectionCard title="Отчётность (Ф1–Ф4)" extra={<DateActuality date={cp.asOf.statements} source="СПАРК" />}>
          <StatementsEditor />
        </SectionCard>
      )}
      {tab === 'result' && <AssessmentResultView cp={cp} onRecalc={() => setTab('statements')} />}

      <AuditFooter createdBy="SYSTEM" createdAt={cp.assessments[0]?.date ?? '2026-05-01'} modifiedBy={cp.assessments[0]?.author ?? 'Соколова Е.В.'} modifiedAt={cp.assessments[0]?.date ?? '2026-05-21'} />
    </div>
  );
}

function GeneralTab({ cp, edit }: { cp: Counterparty; edit: boolean }) {
  const enforcement = cp.courtCases.filter((c) => c.kind === 'enforcement').reduce((s, c) => s + c.amount, 0);
  return (
    <SectionCard title="Общие сведения" extra={<DateActuality date={cp.asOf.general} source="СПАРК" />}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 16 }}>
        <Field label="Наименование контрагента"><input value={cp.name} readOnly style={selStyle} /></Field>
        <Field label="Стандарт отчётности"><input value="РСБУ" readOnly style={selStyle} /></Field>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Дополнительные показатели для проведения оценки</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        <Field label="Дата регистрации"><input value={dateRu(cp.registered)} readOnly={!edit} style={selStyle} /></Field>
        <Field label="Сумма активных исполнительных производств, руб."><input value={enforcement ? money(enforcement) : '0 руб.'} readOnly={!edit} style={selStyle} /></Field>
      </div>
      {edit && <div className="pmrk-muted" style={{ fontSize: 12, marginTop: 10 }}>Режим редактирования: можно скорректировать дополнительные показатели; финансовая отчётность правится на вкладке «Отчётность».</div>}
    </SectionCard>
  );
}

/* ===================== Массовая выгрузка (ФТ-3.8) ======================= */
export function MassAssessment() {
  const { role } = useApp();
  const quota = ROLES[role].massQuota;
  const [tab, setTab] = useState('common');
  const [count] = useState(42);
  return (
    <div className="pmrk-page" style={{ maxWidth: 900 }}>
      <PageHeader title="Выгрузка экспресс-оценок" subtitle="Заявка на массовую экспресс-оценку · отчёт придёт на почту инициатора и доп. получателей" breadcrumbs={[{ label: 'Экспресс-оценки', to: '/assessments' }, { label: 'Выгрузка' }]} />
      <div style={{ marginBottom: 14 }}>
        <Segmented value={tab} onChange={setTab} items={[{ key: 'common', label: 'Общее' }, { key: 'extra', label: 'Дополнительно' }]} />
      </div>

      {tab === 'common' && (
        <SectionCard title="Общее">
          <div style={{ padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: 8, fontSize: 12.5, marginBottom: 14 }}>
            ℹ Скачайте шаблон списка контрагентов, заполните и приложите. Результат придёт на почту и в «Мои отчёты». Письмо содержит статус, ссылку на портал, вложение-запрос и вложение-результат.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}><Button size="s" view="secondary" label="Скачать шаблон списка к/а (.xlsx)" iconLeft={IconDownload as never} /></div>
          <Field label="Список контрагентов (вложение)"><FileDrop multiple={false} hint="XLSX по шаблону · до 50 контрагентов (для КК-ДО/СБ)" accept=".xlsx,.xls" /></Field>
          <div style={{ marginTop: 14 }}><Field label="Дополнительные получатели"><input placeholder="имя, e-mail" style={selStyle} /></Field></div>
        </SectionCard>
      )}

      {tab === 'extra' && (
        <SectionCard title="Дополнительно">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Вид экспресс-оценки" req><select style={selStyle}><option>РСБУ</option><option>МСФО</option></select></Field>
            <Field label="Отчётность" req><select style={selStyle}><option>Годовая 2025</option><option>Промежуточная 1 кв. 2026</option></select></Field>
            <Field label="Период актуальности оценки, дней"><input type="number" defaultValue={30} style={selStyle} /></Field>
            <Field label="Макс. количество запросов к СПАРК"><input type="number" defaultValue={500} style={selStyle} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 14 }}>
            <input type="checkbox" defaultChecked /> Обновлять экспресс-оценки перед выгрузкой
          </label>
        </SectionCard>
      )}

      {quota ? (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: count > quota ? 'var(--pmrk-risk-4-bg)' : 'var(--pmrk-risk-2-bg)', fontSize: 13, marginBottom: 14 }}>
          Квота вашей роли: <b>≤ {quota} контрагентов в день</b>. В заявке: {count}. {count > quota ? 'Превышение — ответ 429 DAILY_QUOTA_EXCEEDED.' : 'В пределах квоты.'}
        </div>
      ) : (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--pmrk-risk-1-bg)', fontSize: 13, marginBottom: 14 }}>Ваша роль — без ограничения по количеству.</div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button size="s" view="ghost" label="Закрыть" />
        <Button size="s" label="Отправить заявку" />
      </div>
    </div>
  );
}
