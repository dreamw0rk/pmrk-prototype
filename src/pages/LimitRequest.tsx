import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { IconAdd } from '@consta/icons/IconAdd';
import { IconDownload } from '@consta/icons/IconDownload';
import { useApp } from '@/app/AppContext';
import { can } from '@/shared/roles';
import { PageHeader, SectionCard, StatusBadge, GroupBadge, RouteViewer, AuditFooter, Stat, EmptyState, CalcStamp } from '@/shared/ui/kit';
import { StatementsEditor } from '@/shared/ui/StatementsEditor';
import { AssessmentResultView } from '@/pages/Assessment';
import { LIMIT_REQUESTS, HEROES, BY_UID } from '@/shared/mock/data';
import { AI_DRAFTS } from '@/shared/mock/ai';
import type { LimitRequest } from '@/shared/mock/types';
import { dateRu, money, moneyCompact } from '@/shared/format';

const selStyle: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', border: '1px solid var(--color-bg-border)', borderRadius: 8, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', outline: 'none', fontSize: 13 };
function Field({ label, children, req, hint }: { label: string; children: React.ReactNode; req?: boolean; hint?: string }) {
  return (
    <label style={{ display: 'block' }}>
      <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}{req && <span style={{ color: 'var(--pmrk-risk-4)' }}> *</span>}</div>
      {children}
      {hint && <div className="pmrk-muted" style={{ fontSize: 11, marginTop: 2 }}>{hint}</div>}
    </label>
  );
}
function ReadField({ label, value, req }: { label: string; value: string; req?: boolean }) {
  return <Field label={label} req={req}><input value={value} readOnly style={{ ...selStyle, background: 'var(--color-bg-secondary)' }} /></Field>;
}

/* ===================== Реестр заявок на КЛ (ФТ-6.12) ===================== */
const PRESETS = [
  { key: 'on-approval', label: 'На утверждении', match: (s: string) => s === 'На утверждении' },
  { key: 'on-review', label: 'На проверке', match: (s: string) => s === 'На проверке' },
  { key: 'approved', label: 'Утверждено', match: (s: string) => s === 'Утверждено' },
  { key: 'my', label: 'Я ответственный', match: () => true },
] as const;

export function LimitRequestRegistry() {
  const navigate = useNavigate();
  const { role } = useApp();
  const [preset, setPreset] = useState<string>('my');
  const rows = LIMIT_REQUESTS.filter((r) => PRESETS.find((p) => p.key === preset)!.match(r.status));

  return (
    <div className="pmrk-page">
      <PageHeader
        title="Кредитный лимит"
        subtitle="Реестр заявок-анкет на установление кредитного лимита · согласование по маршруту"
        breadcrumbs={[{ label: 'Главная', to: '/' }, { label: 'Кредитный лимит' }]}
        actions={can(role, 'createLimitRequest') && <Button size="s" label="Создать заявку" iconLeft={IconAdd as never} onClick={() => navigate('/limit-requests/new')} />}
      />
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {PRESETS.map((p) => (
          <div key={p.key} className={`pmrk-savedview ${preset === p.key ? 'pmrk-savedview--active' : ''}`} onClick={() => setPreset(p.key)}>{p.label}</div>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div className="pmrk-table" style={{ minWidth: 1100 }}>
          <div className="pmrk-table__head">
            <div className="pmrk-th" style={{ flex: 1, minWidth: 110 }}>Дата</div>
            <div className="pmrk-th" style={{ flex: 1.6, minWidth: 160 }}>ДО ГК ГПН</div>
            <div className="pmrk-th" style={{ flex: 2, minWidth: 180 }}>Контрагент</div>
            <div className="pmrk-th" style={{ flex: 1, minWidth: 100 }}>ИНН</div>
            <div className="pmrk-th" style={{ flex: 1, minWidth: 110, justifyContent: 'flex-end' }}>Запраш. КЛ, руб.</div>
            <div className="pmrk-th" style={{ flex: 1.4, minWidth: 150 }}>Название этапа</div>
            <div className="pmrk-th" style={{ flex: 1.1, minWidth: 120 }}>Статус</div>
            <div className="pmrk-th" style={{ flex: 1.2, minWidth: 130 }}>Ответственный</div>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="pmrk-tr" onClick={() => navigate(`/limit-requests/${r.id}`)}>
              <div className="pmrk-td" style={{ flex: 1, minWidth: 110 }}>{dateRu(r.createdAt)}</div>
              <div className="pmrk-td" style={{ flex: 1.6, minWidth: 160 }}><span className="pmrk-truncate">{r.subsidiary.replace('ООО «Газпромнефть', 'ГПН').replace('»', '')}</span></div>
              <div className="pmrk-td" style={{ flex: 2, minWidth: 180, fontWeight: 600 }}><span className="pmrk-truncate">{r.counterpartyName}</span></div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 100 }}>{r.inn}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 1, minWidth: 110, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(r.requestedLimit)}</div>
              <div className="pmrk-td" style={{ flex: 1.4, minWidth: 150 }}>{r.stage}</div>
              <div className="pmrk-td" style={{ flex: 1.1, minWidth: 120 }}><StatusBadge status={r.status} /></div>
              <div className="pmrk-td" style={{ flex: 1.2, minWidth: 130 }}>{r.responsible}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===================== Карточка заявки — 7 вкладок (ФТ-6.1) ============== */
const TABS = [
  { key: 'general', label: 'Общие сведения' },
  { key: 'statements', label: 'Отчётность' },
  { key: 'assessment', label: 'Оценка' },
  { key: 'performance', label: 'Показатели деятельности' },
  { key: 'decision', label: 'Решение' },
  { key: 'approval', label: 'Согласование' },
  { key: 'discussion', label: 'Обсуждение' },
];

export function LimitRequestPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const r = LIMIT_REQUESTS.find((x) => x.id === id);
  const [tab, setTab] = useState('general');
  if (!r) return <div className="pmrk-page"><EmptyState title="Заявка не найдена" text="Вернитесь в реестр заявок." action={<Button size="s" label="В реестр" onClick={() => navigate('/limit-requests')} />} /></div>;
  const cp = BY_UID.get(r.counterpartyUid);

  return (
    <div className="pmrk-page">
      <PageHeader
        title={`Заявка ${r.number}`}
        subtitle={<span>{r.counterpartyName} · ИНН {r.inn} · <GroupBadge group={r.group} /> · этап: {r.stage}</span>}
        breadcrumbs={[{ label: 'Кредитный лимит', to: '/limit-requests' }, { label: r.number }]}
        actions={<>
          <Button size="xs" view="ghost" label="Заявка-анкета" iconLeft={IconDownload as never} />
          <Button size="xs" view="ghost" label="Оценка" iconLeft={IconDownload as never} />
          <Button size="xs" view="ghost" label="Профиль" iconLeft={IconDownload as never} />
          <Button size="s" view="secondary" label="Сохранить" />
        </>}
      />

      {/* вкладки-навигация (подчёркивание) */}
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto', borderBottom: '1px solid var(--color-bg-border)', marginBottom: 16 }}>
        {TABS.map((t) => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{ padding: '9px 14px', fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer', borderBottom: tab === t.key ? '2px solid var(--color-bg-brand)' : '2px solid transparent', color: tab === t.key ? 'var(--color-typo-primary)' : 'var(--color-typo-secondary)', fontWeight: tab === t.key ? 600 : 400 }}>{t.label}</div>
        ))}
      </div>

      {tab === 'general' && <LrGeneralTab r={r} />}
      {tab === 'statements' && <LrStatementsTab />}
      {tab === 'assessment' && (cp ? <AssessmentResultView cp={cp} /> : <EmptyState text="Контрагент не найден." />)}
      {tab === 'performance' && <LrPerformanceTab r={r} />}
      {tab === 'decision' && <LrDecisionTab r={r} />}
      {tab === 'approval' && <LrApprovalTab r={r} />}
      {tab === 'discussion' && <LrDiscussionTab />}

      <AuditFooter createdBy={r.author} createdAt={r.createdAt} modifiedBy={r.responsible} modifiedAt={r.createdAt} />
    </div>
  );
}

/* --- Вкладка «Общие сведения» (ФТ-6.2) --- */
function LrGeneralTab({ r }: { r: LimitRequest }) {
  const { aiOn } = useApp();
  const draft = AI_DRAFTS['cp-progress'];
  const [brief, setBrief] = useState(draft.brief);
  const [just, setJust] = useState(draft.justification);
  const [calc, setCalc] = useState(draft.calculation);
  const [aiFilled, setAiFilled] = useState<Record<string, boolean>>({ brief: true, just: true, calc: true });
  const belowMateriality = r.requestedLimit <= 1_000_000;
  const aggregateWith = r.requestedLimit + r.aggregateLimit - r.currentLimit;
  const approvalLevel = aggregateWith > 1_500_000_000 ? 'Кредитный комитет ГПН' : aggregateWith > 500_000_000 ? 'Кредитная комиссия Блока' : aggregateWith > 100_000_000 ? 'Кредитная комиссия Департамента' : 'Кредитный комитет ДО';

  return (
    <>
      <SectionCard title="1. Общий раздел">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          <ReadField label="Наименование ДО ГК ГПН" req value={r.subsidiary} />
          <ReadField label="Подразделение / Блок" value="Блок логистики, переработки и сбыта" />
          <ReadField label="Контрагент" req value={r.counterpartyName} />
          <ReadField label="ИНН" req value={r.inn} />
        </div>
      </SectionCard>

      <SectionCard title="2. Экспресс-оценка кредитоспособности контрагента">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <Field label="Вид экспресс-оценки" req><select style={selStyle}><option>РСБУ</option><option>МСФО</option></select></Field>
          <ReadField label="Стандарт отчётности" value="РСБУ" />
          <ReadField label="Класс контрагента" value="Торговля" />
        </div>
      </SectionCard>

      <SectionCard title="3. Заявка на утверждение кредитного лимита">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
          <ReadField label="Платёжная дисциплина (12 мес.)" req value="без существенных нарушений" />
          <ReadField label="Вид деятельности (ОКВЭД)" req value="46.71 — оптовая торговля топливом" />
          <ReadField label="Опыт сотрудничества с ГК ГПН" req value="с 2018 года" />
        </div>

        {/* AI-черновики (AI-4) */}
        <AiField aiOn={aiOn} label="Краткая справка" req value={brief} onChange={setBrief} filled={aiFilled.brief} onAi={() => { setBrief(draft.brief); setAiFilled((p) => ({ ...p, brief: true })); }} />
        <AiField aiOn={aiOn} label="Обоснование" req value={just} onChange={setJust} filled={aiFilled.just} onAi={() => { setJust(draft.justification); setAiFilled((p) => ({ ...p, just: true })); }} rows={3} />
        <AiField aiOn={aiOn} label="Расчёт" req value={calc} onChange={setCalc} filled={aiFilled.calc} onAi={() => { setCalc(draft.calculation); setAiFilled((p) => ({ ...p, calc: true })); }} rows={2} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 6 }}>
          <Field label="Запрашиваемый кредитный лимит, руб." req><input type="number" defaultValue={r.requestedLimit} style={selStyle} /></Field>
          <Field label="Валюта" req><select style={selStyle}><option>RUB · руб.</option><option>USD</option><option>EUR</option></select></Field>
          <ReadField label="Действующий КЛ, руб." value={r.currentLimit ? money(r.currentLimit) : '0'} />
        </div>

        {belowMateriality && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--pmrk-risk-3-bg)', color: 'var(--pmrk-risk-3-text)', fontSize: 13, marginTop: 12 }}>
            «Кредитный лимит ниже уровня существенности» утверждение не требуется, обращаем внимание, что уровень существенности для ИП и ФЛ составляет 300 тыс. руб.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 12 }}>
          <div style={{ padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: 8 }}>
            <div className="pmrk-muted" style={{ fontSize: 12 }}>Действие по лимиту (авторасчёт)</div>
            <div style={{ fontWeight: 600 }}>{r.action} <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 12, color: 'var(--color-typo-brand)' }}>· вручную</a></div>
            <div style={{ marginTop: 4 }}><CalcStamp live /></div>
          </div>
          <Field label="Количество дней отсрочки платежа" req><input type="number" defaultValue={r.deferralDays} style={selStyle} /></Field>
          <div style={{ alignSelf: 'end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><input type="checkbox" defaultChecked={r.deferralDays > 30} /> Добавлен файл с экономическим обоснованием</label>
            {r.deferralDays > 30 && <div className="pmrk-muted" style={{ fontSize: 11, marginTop: 2 }}>Отсрочка &gt; 30 дней → файл и галочка обязательны, иначе заявка не сохранится.</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginTop: 12 }}>
          <Field label="Обеспечение" req><select style={selStyle} defaultValue={r.collateral}><option>Нет</option><option>Банковская гарантия</option><option>Залог</option><option>Поручительство</option></select></Field>
          <Field label="Обеспечение, руб." req><input type="number" defaultValue={r.collateralAmount} style={selStyle} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><input type="checkbox" /> Согласовано с Департаментом по финансам</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><input type="checkbox" defaultChecked={r.collateralAmount >= r.requestedLimit} /> Обеспечение покрывает запрашиваемый КЛ</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><input type="checkbox" defaultChecked={r.currentLimit > 0} /> Ранее КЛ устанавливался</label>
        </div>
      </SectionCard>

      <SectionCard title="4. Совокупный кредитный лимит по ГК «Газпром нефть»">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <Stat label="Действующий совокупный КЛ, руб." value={moneyCompact(r.aggregateLimit)} asOf={r.createdAt} calcSource="агрегат лимитов" />
          <Stat label="Совокупный КЛ с учётом заявки, руб." value={moneyCompact(aggregateWith)} sub="Запрашиваемый + Совокупный − Действующий" asOf={r.createdAt} calcSource="авторасчёт" />
          <div style={{ padding: '10px 12px', background: 'var(--color-bg-brand)', color: '#fff', borderRadius: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Уровень утверждения (матрица)</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{approvalLevel}</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>определяет маршрут согласования</div>
          </div>
        </div>
        <div className="pmrk-muted" style={{ fontSize: 11.5, marginTop: 8 }}>Матрица: &gt; 1 500 млн → КК ГПН · &gt; 500 млн → Комиссия Блока · &gt; 100 млн → Комиссия Департамента · до 100 млн (≥ 1 млн) → КК ДО.</div>
      </SectionCard>
    </>
  );
}

/* --- Вкладка «Отчётность» (ФТ-6.3) --- */
function LrStatementsTab() {
  return (
    <SectionCard title="Отчётность (Ф1–Ф4)">
      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--pmrk-risk-3-bg)', color: 'var(--pmrk-risk-3-text)', fontSize: 13, marginBottom: 14 }}>
        ⚠ Последняя загруженная отчётность старше 12 месяцев. Используйте актуальную отчётность или приложите комментарий-обоснование.
        <input placeholder="Комментарий-обоснование использования отчётности старше 12 мес." style={{ ...selStyle, marginTop: 8, background: 'var(--color-bg-default)' }} />
      </div>
      <StatementsEditor />
    </SectionCard>
  );
}

/* --- Вкладка «Показатели деятельности» — Ш-13.08.01-04 (ФТ-6.5) --- */
function LrPerformanceTab({ r }: { r: LimitRequest }) {
  const [insert, setInsert] = useState(false);
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь'];
  const exp = months.map((m, i) => ({ m, qty: 1200 + i * 80, revenue: 680_000 + i * 30_000, cash: 640_000 + i * 25_000, debt: 90_000 + i * 8_000, pdz: i > 3 ? 12_000 + i * 4_000 : 0 }));
  const avg = (sel: (e: typeof exp[0]) => number) => Math.round(exp.reduce((s, e) => s + sel(e), 0) / exp.length);

  return (
    <>
      <SectionCard title="1. Кредитные лимиты" extra={<span className="pmrk-muted" style={{ fontSize: 12 }}>Курс ЦБ на 15.06.2026 · валюта RUB</span>}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
          <input type="checkbox" checked={insert} onChange={(e) => setInsert(e.target.checked)} /> Вставить из заявки (автозаполнение по ДО + контрагент)
        </label>
        <div className="pmrk-table">
          <div className="pmrk-table__head">
            <div className="pmrk-th" style={{ flex: 2 }}>Параметр</div>
            <div className="pmrk-th" style={{ flex: 1.4 }}>Действующий КЛ</div>
            <div className="pmrk-th" style={{ flex: 1.4 }}>Запрашиваемый КЛ</div>
          </div>
          {[
            ['Способ расчётов', 'Отсрочка платежа', 'Отсрочка платежа'],
            ['Кредитный лимит в валюте', insert ? money(r.currentLimit) : '—', money(r.requestedLimit)],
            ['Кредитный лимит в рублях', insert ? money(r.currentLimit) : '—', money(r.requestedLimit)],
            ['Срок отсрочки платежа, кал. дн.', insert ? '45' : '—', String(r.deferralDays)],
            ['Начало действия', insert ? '01.01.2026' : '—', '01.07.2026'],
            ['Окончание действия', insert ? '31.12.2026' : '—', '30.06.2027'],
            ['Наличие обеспечения', insert ? 'Да' : '—', r.collateral === 'Нет' ? 'Нет' : 'Да'],
            ['Коллегиальный орган', '—', r.approvalLevel],
            ['Номер протокола КК', insert ? '№ 17' : '—', '—'],
          ].map((row, i) => (
            <div key={i} className="pmrk-tr" style={{ cursor: 'default' }}>
              <div className="pmrk-td" style={{ flex: 2 }}>{row[0]}</div>
              <div className="pmrk-td pmrk-muted" style={{ flex: 1.4 }}>{row[1]}</div>
              <div className="pmrk-td" style={{ flex: 1.4, fontWeight: 500 }}>{row[2]}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="2. Опыт работы (последние 6 мес.)" extra={<span className="pmrk-muted" style={{ fontSize: 12 }}>валюта RUB</span>}>
        <div style={{ overflowX: 'auto' }}>
          <div className="pmrk-table" style={{ minWidth: 760 }}>
            <div className="pmrk-table__head">
              <div className="pmrk-th" style={{ flex: 1.2 }}>Месяц</div>
              <div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Кол-во, т</div>
              <div className="pmrk-th" style={{ flex: 1.3, justifyContent: 'flex-end' }}>Выручка с НДС, руб.</div>
              <div className="pmrk-th" style={{ flex: 1.3, justifyContent: 'flex-end' }}>Поступление ДС, руб.</div>
              <div className="pmrk-th" style={{ flex: 1.3, justifyContent: 'flex-end' }}>Остаток задолж., руб.</div>
              <div className="pmrk-th" style={{ flex: 1.1, justifyContent: 'flex-end' }}>в т.ч. ПДЗ, руб.</div>
            </div>
            {exp.map((e, i) => (
              <div key={i} className="pmrk-tr" style={{ cursor: 'default' }}>
                <div className="pmrk-td" style={{ flex: 1.2 }}>{e.m}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex' }}>{e.qty.toLocaleString('ru-RU')}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1.3, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(e.revenue)}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1.3, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(e.cash)}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1.3, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(e.debt)}</div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 1.1, justifyContent: 'flex-end', display: 'flex', color: e.pdz ? 'var(--pmrk-risk-4)' : undefined }}>{e.pdz ? moneyCompact(e.pdz) : '—'}</div>
              </div>
            ))}
            <div className="pmrk-tr" style={{ cursor: 'default', fontWeight: 700, background: 'var(--color-bg-secondary)' }}>
              <div className="pmrk-td" style={{ flex: 1.2 }}>Среднее за 6 мес.</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex' }}>{avg((e) => e.qty).toLocaleString('ru-RU')}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 1.3, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(avg((e) => e.revenue))}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 1.3, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(avg((e) => e.cash))}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 1.3, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(avg((e) => e.debt))}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 1.1, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(avg((e) => e.pdz))}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 6 }}><CalcStamp live /></div>
      </SectionCard>

      <SectionCard title="3. Контролёр и дата">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          <ReadField label="Контролёр (ФИО)" value={r.responsible} />
          <ReadField label="Дата" value={dateRu(r.createdAt)} />
        </div>
        <div className="pmrk-muted" style={{ fontSize: 12, marginTop: 8 }}>Форму редактирует только кредитный контролёр на своём этапе маршрута.</div>
      </SectionCard>
    </>
  );
}

/* --- Вкладка «Решение» (ФТ-6.6) --- */
function LrDecisionTab({ r }: { r: LimitRequest }) {
  const navigate = useNavigate();
  const approved = r.status === 'Утверждено';
  return (
    <>
      <SectionCard title="1. Информация по решению">
        {approved ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            <Stat label="Дата начала действия" value="01.06.2026" />
            <Stat label="Дата окончания действия" value="31.05.2027" />
            <Stat label="Валюта утверждённого КЛ" value="RUB" />
            <Stat label="Утверждённый КЛ, руб." value={money(r.requestedLimit)} tone="good" asOf={r.createdAt} calcSource="протокол № 18" />
            <Stat label="Утверждённая отсрочка, дни" value={String(r.deferralDays)} />
            <Stat label="Статус последнего протокола" value="Утверждён" tone="good" />
          </div>
        ) : (
          <EmptyState text="Решение по заявке ещё не принято. Информация появится после утверждения на кредитном комитете." />
        )}
      </SectionCard>

      <SectionCard title="2. Протоколы КО" extra={<Button size="xs" view="ghost" label="К реестру протоколов" onClick={() => navigate('/protocols')} />}>
        {approved ? (
          <div className="pmrk-table">
            <div className="pmrk-table__head">
              <div className="pmrk-th" style={{ flex: 0.8 }}>Номер</div>
              <div className="pmrk-th" style={{ flex: 1 }}>Дата записи</div>
              <div className="pmrk-th" style={{ flex: 1.6 }}>ДО</div>
              <div className="pmrk-th" style={{ flex: 1.6 }}>Коллегиальный орган</div>
              <div className="pmrk-th" style={{ flex: 1 }}>Статус</div>
            </div>
            <div className="pmrk-tr" style={{ cursor: 'default' }}>
              <div className="pmrk-td" style={{ flex: 0.8, fontWeight: 600 }}>№ 18</div>
              <div className="pmrk-td" style={{ flex: 1 }}>16.05.2026</div>
              <div className="pmrk-td" style={{ flex: 1.6 }}>{r.subsidiary.replace('ООО «Газпромнефть', 'ГПН').replace('»', '')}</div>
              <div className="pmrk-td" style={{ flex: 1.6 }}>{r.approvalLevel}</div>
              <div className="pmrk-td" style={{ flex: 1 }}><StatusBadge status="Утверждено" /></div>
            </div>
          </div>
        ) : (
          <div className="pmrk-muted" style={{ fontSize: 13 }}>Согласованные протоколы появятся по мере прохождения заявки. Если уровня протокола недостаточно — статус «Согласован»; последний — «Утверждён».</div>
        )}
      </SectionCard>
    </>
  );
}

/* --- Вкладка «Согласование» (ФТ-6.7) --- */
function LrApprovalTab({ r }: { r: LimitRequest }) {
  const { role } = useApp();
  return (
    <SectionCard title="Согласование" extra={<StatusBadge status={r.status} />}>
      <div style={{ marginBottom: 16 }}>
        <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 6 }}>Текущий статус: <b style={{ color: 'var(--color-typo-primary)' }}>{r.status}</b> · этап «{r.stage}» · ответственный {r.responsible}</div>
        <RouteViewer steps={r.route} />
      </div>
      {can(role, 'approveLimitRequest') && r.status !== 'Утверждено' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Button size="s" label="Согласовать" />
          <Button size="s" view="secondary" label="Вернуть на доработку" />
          <Button size="s" view="ghost" label="Отклонить" />
          <Button size="s" view="ghost" label="Подготовить к КО" />
          <Button size="s" view="ghost" label="Добавить ad-hoc шаг" />
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>История согласования</div>
      <div className="pmrk-stack" style={{ gap: 0 }}>
        {r.route.filter((s) => s.state === 'done').map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-bg-border)', fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pmrk-risk-1)', marginTop: 5 }} />
            <div style={{ flex: 1 }}>
              <div><b>{s.title}</b> · {s.actor}</div>
              {s.comment && <div className="pmrk-muted" style={{ fontSize: 12 }}>«{s.comment}»</div>}
            </div>
            <span className="pmrk-muted" style={{ fontSize: 12 }}>{s.at ? dateRu(s.at) : ''}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* --- Вкладка «Обсуждение» (ФТ-6.8) --- */
function LrDiscussionTab() {
  return (
    <SectionCard title="Обсуждение">
      <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-bg-border)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>ПИ</div>
        <div>
          <div style={{ fontSize: 13 }}><a href="#" onClick={(e) => e.preventDefault()} style={{ color: 'var(--color-typo-brand)' }}>Петрова И.А.</a> · 09.06.2026</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>Прошу уточнить структуру обеспечения по запрашиваемому лимиту перед вынесением на комитет.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input placeholder="Добавить комментарий…" style={{ ...selStyle, flex: 1 }} />
        <Button size="s" label="Отправить" />
      </div>
    </SectionCard>
  );
}

/* ===================== Создание заявки (ФТ-6.1/6.2) ===================== */
const FLOW = ['Общие сведения', 'Отчётность', 'Оценка', 'Показатели', 'Решение', 'Согласование'];

export function LimitRequestCreate() {
  const navigate = useNavigate();
  const { aiOn } = useApp();
  const [cpUid, setCpUid] = useState('cp-progress');
  const [requested, setRequested] = useState(90_000_000);
  const cp = BY_UID.get(cpUid)!;
  const draft = AI_DRAFTS['cp-progress'];
  // Шаблон-заявка для предпросмотра шагов, опирающихся на данные заявки
  // (Показатели/Решение/Согласование) — по выбранному контрагенту, иначе первая.
  const templateR = LIMIT_REQUESTS.find((x) => x.counterpartyUid === cpUid) ?? LIMIT_REQUESTS[0];
  const [brief, setBrief] = useState('');
  const [just, setJust] = useState('');
  const [calc, setCalc] = useState('');
  const [aiFilled, setAiFilled] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState(0);
  const belowMateriality = requested <= 1_000_000;
  const action = cp.creditLimit === 0 ? 'Открытие КЛ' : requested > cp.creditLimit ? 'Увеличение КЛ' : requested === cp.creditLimit ? 'Пролонгация' : 'Изменение';
  const aggregateWith = requested + cp.groupAggregateLimit - cp.creditLimit;
  const approvalLevel = aggregateWith > 1_500_000_000 ? 'Кредитный комитет ГПН' : aggregateWith > 500_000_000 ? 'Кредитная комиссия Блока' : aggregateWith > 100_000_000 ? 'Кредитная комиссия Департамента' : 'Кредитный комитет ДО';
  const fillAi = (f: 'brief' | 'just' | 'calc') => {
    if (f === 'brief') setBrief(draft.brief);
    if (f === 'just') setJust(draft.justification);
    if (f === 'calc') setCalc(draft.calculation);
    setAiFilled((p) => ({ ...p, [f]: true }));
  };

  return (
    <div className="pmrk-page">
      <PageHeader title="Заявка на кредитный лимит" subtitle="Пошаговый flow · автозаполнение · AI-черновики полей" breadcrumbs={[{ label: 'Кредитный лимит', to: '/limit-requests' }, { label: 'Новая' }]} />
      <div className="pmrk-route" style={{ marginBottom: 20 }}>
        {FLOW.map((s, i) => (
          <div
            key={s}
            onClick={() => setStep(i)}
            style={{ cursor: 'pointer' }}
            className={`pmrk-route__step ${step === i ? 'pmrk-route__step--current' : i < step ? 'pmrk-route__step--done' : 'pmrk-route__step--upcoming'}`}
          >
            <div className="pmrk-route__num">Шаг {i + 1}</div>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{s}</div>
          </div>
        ))}
      </div>

      {step === 0 && (
      <SectionCard title="Общие сведения">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <Field label="Контрагент" req><select value={cpUid} onChange={(e) => setCpUid(e.target.value)} style={selStyle}>{HEROES.map((h) => <option key={h.uid} value={h.uid}>{h.name}</option>)}</select></Field>
          <ReadField label="Подразделение / Блок" value={cp.subsidiary} />
          <Field label="Запрашиваемый кредитный лимит, руб." req><input type="number" value={requested} onChange={(e) => setRequested(Number(e.target.value))} style={selStyle} /></Field>
          <ReadField label="Действующий КЛ, руб." value={cp.creditLimit ? money(cp.creditLimit) : '0'} />
        </div>

        {belowMateriality && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--pmrk-risk-3-bg)', color: 'var(--pmrk-risk-3-text)', fontSize: 13, marginBottom: 14 }}>
            «Кредитный лимит ниже уровня существенности» утверждение не требуется, обращаем внимание, что уровень существенности для ИП и ФЛ составляет 300 тыс. руб.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
          <div style={{ padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: 8 }}><div className="pmrk-muted" style={{ fontSize: 12 }}>Действие по лимиту</div><div style={{ fontWeight: 600 }}>{action}</div><div style={{ marginTop: 4 }}><CalcStamp live /></div></div>
          <div style={{ padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: 8 }}><div className="pmrk-muted" style={{ fontSize: 12 }}>Совокупный КЛ с учётом заявки, руб.</div><div style={{ fontWeight: 600 }}>{moneyCompact(aggregateWith)}</div><div style={{ marginTop: 4 }}><CalcStamp live /></div></div>
          <div style={{ padding: '10px 12px', background: 'var(--color-bg-brand)', color: '#fff', borderRadius: 8 }}><div style={{ fontSize: 12, opacity: 0.85 }}>Уровень утверждения</div><div style={{ fontWeight: 700 }}>{approvalLevel}</div></div>
        </div>

        <AiField aiOn={aiOn} label="Краткая справка" req value={brief} onChange={setBrief} filled={aiFilled.brief} onAi={() => fillAi('brief')} />
        <AiField aiOn={aiOn} label="Обоснование" req value={just} onChange={setJust} filled={aiFilled.just} onAi={() => fillAi('just')} rows={3} />
        <AiField aiOn={aiOn} label="Расчёт" req value={calc} onChange={setCalc} filled={aiFilled.calc} onAi={() => fillAi('calc')} rows={2} />

      </SectionCard>
      )}

      {step === 1 && <LrStatementsTab />}
      {step === 2 && <AssessmentResultView cp={cp} />}
      {step === 3 && <LrPerformanceTab r={templateR} />}
      {step === 4 && <LrDecisionTab r={templateR} />}
      {step === 5 && <LrApprovalTab r={templateR} />}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Button size="s" view="ghost" label="← Назад" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="s" view="ghost" label="Сохранить черновик" />
          {step < FLOW.length - 1
            ? <Button size="s" label="Далее →" onClick={() => setStep((s) => Math.min(FLOW.length - 1, s + 1))} />
            : <Button size="s" label="Отправить на согласование" onClick={() => navigate('/limit-requests/lr-481')} />}
        </div>
      </div>
    </div>
  );
}

function AiField({ aiOn, label, value, onChange, filled, onAi, rows = 2, req }: { aiOn: boolean; label: string; value: string; onChange: (v: string) => void; filled?: boolean; onAi: () => void; rows?: number; req?: boolean }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <span className="pmrk-muted" style={{ fontSize: 12 }}>{label}{req && <span style={{ color: 'var(--pmrk-risk-4)' }}> *</span>}</span>
        {aiOn && <button onClick={onAi} style={{ marginLeft: 'auto', background: 'var(--pmrk-ai-bg)', border: '1px solid var(--pmrk-ai-border)', color: 'var(--pmrk-ai-strong)', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}>✦ черновик</button>}
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder="Заполните или сгенерируйте черновик и отредактируйте" style={{ width: '100%', padding: '8px 10px', border: `1px solid ${filled ? 'var(--pmrk-ai-border)' : 'var(--color-bg-border)'}`, borderRadius: 8, background: filled ? 'var(--pmrk-ai-bg)' : 'var(--color-bg-default)', color: 'var(--color-typo-primary)', outline: 'none', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
      {filled && <div style={{ fontSize: 11, color: 'var(--pmrk-ai-strong)', marginTop: 2 }}>✦ Черновик AI — проверьте и отредактируйте перед отправкой (П-2)</div>}
    </div>
  );
}
