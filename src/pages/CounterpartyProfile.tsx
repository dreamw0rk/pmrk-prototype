import { Fragment, useId, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { Modal } from '@consta/uikit/Modal';
import { IconFavoriteStroked } from '@consta/icons/IconFavoriteStroked';
import { IconFavoriteFilled } from '@consta/icons/IconFavoriteFilled';
import { IconRing } from '@consta/icons/IconRing';
import { IconDownload } from '@consta/icons/IconDownload';
import { IconFileDocument } from '@consta/icons/IconFileDocument';
import { IconFilePDF } from '@consta/icons/IconFilePDF';
import { IconDocExport } from '@consta/icons/IconDocExport';
import { IconAlert } from '@consta/icons/IconAlert';
import { IconConnection } from '@consta/icons/IconConnection';
import { useApp } from '@/app/AppContext';
import { useSetPageMeta } from '@/app/PageMeta';
import { can } from '@/shared/roles';
import {
  GroupBadge, RbIndicator, SanctionBadge, StatusBadge, DateActuality, SectionCard, KeyValue, Stat,
  EmptyState, AuditFooter, severityColor, SEVERITY_LABEL, CalcStamp, Segmented,
} from '@/shared/ui/kit';
import { AiSummaryCard } from '@/shared/ui/AiSummaryCard';
import { LineChart, Gauge } from '@/shared/ui/MiniChart';
import { AffiliationDiagram, type DiagramFilters } from '@/shared/ui/AffiliationDiagram';
import { BY_UID, GRAPHS, groupLabel, NOW } from '@/shared/mock/data';
import { AI_SUMMARY, AI_GROUP_RISK, SCORE_EXPLAIN } from '@/shared/mock/ai';
import { useMockQuery } from '@/shared/mock/useMockQuery';
import { buildExternal, rbSignal, type Indicator } from '@/shared/mock/external';
import { buildLegal } from '@/shared/mock/legal';
import { buildCreditLimitsByDo, isDoLimitActive, activeCreditLimit, type DoLimitRow } from '@/shared/mock/creditLimits';
import type { Counterparty, AffiliationLinkType } from '@/shared/mock/types';
import { dateRu, money, moneyCompact, moneyCompactParts, pct, inn as fmtInn } from '@/shared/format';

interface TabDef { key: string; label: string; cap?: Parameters<typeof can>[1]; }
const TABS: TabDef[] = [
  { key: 'general', label: 'Общие сведения' },
  { key: 'external', label: 'Внешняя информация' },
  { key: 'affiliation', label: 'Аффилированность' },
  { key: 'debt', label: 'Данные по ДЗ и КЗ' },
  { key: 'statements', label: 'Отчётность' },
  { key: 'assessment', label: 'Оценка' },
  { key: 'news', label: 'Новости' },
  { key: 'security', label: 'Информация СБ', cap: 'viewSecurityTab' },
  { key: 'special-control', label: 'Под особым контролем' },
  { key: 'legal', label: 'Претензионно-исковая работа' },
  { key: 'credit-limit', label: 'Кредитный лимит', cap: 'viewLimitSection' },
  { key: 'discussion', label: 'Обсуждение' },
  { key: 'advance-limit', label: 'Лимит авансирования' },
  { key: 'protocols', label: 'Протоколы', cap: 'viewProtocols' },
];

const monthLabels = (n = 12) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() - (n - 1 - i), 1);
    return d.toLocaleDateString('ru-RU', { month: 'short' });
  });

export function CounterpartyProfile() {
  const { uid = '', tab = 'general' } = useParams();
  const navigate = useNavigate();
  const { role, aiOn, skin } = useApp();
  const c = BY_UID.get(uid);
  const [fav, setFav] = useState(['cp-balt', 'cp-sibur', 'cp-rnsnab'].includes(uid));
  const [subscribed, setSubscribed] = useState(false);

  // В скине СФК большой заголовок профиля уезжает в топбар оболочки (топология 1:1).
  useSetPageMeta({
    title: c?.name ?? 'Контрагент',
    breadcrumbs: [{ label: 'Реестр контрагентов', to: '/registry' }, ...(c ? [{ label: c.shortName }] : [])],
  });

  const visibleTabs = TABS.filter((t) => !t.cap || can(role, t.cap));

  if (!c) {
    return (
      <div className="pmrk-page">
        <EmptyState title="Контрагент не найден" text="Проверьте ссылку или вернитесь в реестр." action={<Button size="s" label="В реестр" onClick={() => navigate('/registry')} />} />
      </div>
    );
  }

  const summary = AI_SUMMARY[uid];

  return (
    <div className="pmrk-page" style={{ paddingTop: 0 }}>
      {/* Шапка профиля (sticky) */}
      <div style={{ position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', paddingTop: 16, margin: '0 -24px', padding: '16px 24px 0' }}>
        {skin !== 'sfk' && (
          <div className="pmrk-breadcrumbs">
            <a onClick={() => navigate('/registry')} style={{ cursor: 'pointer' }}>Реестр контрагентов</a> / {c.shortName}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            {skin !== 'sfk' && (
              <h1 style={{ margin: '2px 0 6px', fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
                {c.name}
                {c.underSanctions && <span style={{ color: 'var(--pmrk-risk-4)', fontSize: 15, fontWeight: 600 }}> (Находится под санкциями)</span>}
              </h1>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-typo-secondary)' }}>
              <span>ИНН {fmtInn(c.inn)}</span>
              <span>КПП {c.kpp}</span>
              <span>ОГРН {c.ogrn}</span>
              <span>Статус по СПАРК: {c.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <GroupBadge group={c.group} withScore={c.score} />
              <RbIndicator value={c.rbIndex} />
              {c.underSanctions && <SanctionBadge />}
              {c.specialControl && <StatusBadge status="Особый контроль" />}
              <StatusBadge status={c.status} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="s" view={fav ? 'primary' : 'ghost'} onlyIcon iconLeft={(fav ? IconFavoriteFilled : IconFavoriteStroked) as never} onClick={() => setFav((v) => !v)} title="В избранное" />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
                {subscribed && (
                  <span title='Ранее Вы уже подписались на уведомления по всем контрагентам Блока/БЕ или ДО. Изменить/отменить подписку по контрагентам можно в разделе «Мои оповещения»' style={{ color: 'var(--color-typo-secondary)', cursor: 'help', fontSize: 14 }}>ⓘ</span>
                )}
                <Button size="s" view={subscribed ? 'primary' : 'secondary'} label={subscribed ? 'Вы подписаны' : 'Подписаться'} iconLeft={IconRing as never} onClick={() => setSubscribed((v) => !v)} />
              </div>
            </div>
          </div>
        </div>

        {/* Панель документов (ФТ-1.16…1.19): ряд на всю ширину под бейджами —
            акцентный secondary-вид с брендовой рамкой, но тише заливного CTA «Подписаться»;
            подпись «Скачать отчёт (PDF)» явно обозначает, что кнопки формируют файл. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--color-typo-secondary)' }}>
            <IconDownload size="s" />
            Скачать отчёт (PDF):
          </span>
          <Button size="s" view="secondary" label="Выписка ЕГРЮЛ" iconLeft={IconFileDocument as never} title="Сформировать и скачать выписку из ЕГРЮЛ/ЕГРИП, .pdf (ФТ-1.16)" onClick={() => navigate(`/report/${c.uid}/egrul`)} />
          <Button size="s" view="secondary" label="Профиль (PDF)" iconLeft={IconFilePDF as never} title="Сформировать и скачать отчет «Профиль контрагента» (ФТ-1.17)" onClick={() => navigate(`/report/${c.uid}`)} />
          <Button size="s" view="secondary" label="СПАРК-Профиль" iconLeft={IconDocExport as never} title="Сформировать и скачать расширенный отчет «СПАРК-Профиль», .pdf (ФТ-1.18)" onClick={() => navigate(`/report/${c.uid}/spark`)} />
          <Button size="s" view="secondary" label="СПАРК-Риски" iconLeft={IconAlert as never} title="Сформировать и скачать отчет «СПАРК-Риски», .pdf (ФТ-1.19)" onClick={() => navigate(`/report/${c.uid}/spark-risks`)} />
        </div>

        {/* Вкладки — sticky навигация */}
        <div style={{ display: 'flex', gap: 2, overflowX: 'auto', borderBottom: '1px solid var(--color-bg-border)' }}>
          {visibleTabs.map((t) => (
            <div
              key={t.key}
              onClick={() => navigate(`/counterparties/${uid}/${t.key}`)}
              style={{
                padding: '9px 12px', fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer',
                borderBottom: tab === t.key ? '2px solid var(--color-bg-brand)' : '2px solid transparent',
                color: tab === t.key ? 'var(--color-typo-primary)' : 'var(--color-typo-secondary)',
                fontWeight: tab === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ paddingTop: 16 }}>
        {/* AI-резюме сверху профиля (AI-2) — над содержимым вкладок (со скелетоном генерации) */}
        {aiOn && summary && <ProfileAiSummary uid={uid} summary={summary} />}

        <TabContent c={c} tab={tab} />

        <AuditFooter createdBy="SYSTEM" createdAt="2025-03-12" modifiedBy="Соколова Е.В." modifiedAt={c.asOf.general ?? '2026-06-14'} />
      </div>
    </div>
  );
}

function ProfileAiSummary({ uid, summary }: { uid: string; summary: import('@/shared/mock/ai').AiSummary }) {
  const navigate = useNavigate();
  // имитируем «генерацию» резюме → показываем скелетон конкретной формы (НФТ-Пр-2)
  const { data, loading } = useMockQuery(() => summary, [uid], 650);
  if (loading || !data) return <AiSummaryCard summary={summary} loading onJump={() => {}} />;
  return <AiSummaryCard summary={data} onJump={(to) => navigate(`/counterparties/${uid}/${to}`)} />;
}

function TabContent({ c, tab }: { c: Counterparty; tab: string }) {
  switch (tab) {
    case 'general': return <GeneralTab c={c} />;
    case 'external': return <ExternalTab c={c} />;
    case 'affiliation': return <AffiliationTabView c={c} />;
    case 'debt': return <DebtTab c={c} />;
    case 'statements': return <StatementsTab c={c} />;
    case 'assessment': return <AssessmentTab c={c} />;
    case 'news': return <NewsTab c={c} />;
    case 'security': return <SecurityTab c={c} />;
    case 'special-control': return <SpecialControlTab c={c} />;
    case 'legal': return <LegalTab c={c} />;
    case 'credit-limit': return <CreditLimitTab c={c} />;
    case 'discussion': return <DiscussionTab />;
    case 'advance-limit': return <AdvanceLimitTab c={c} />;
    case 'protocols': return <ProfileProtocolsTab c={c} />;
    default: return null;
  }
}

/** Строка состава «Работает с ДО»: дочернее общество ГК ГПН и — если по нему
    открывался кредитный лимит — соответствующая запись реестра КЛ с условиями
    работы. Без лимита (row отсутствует) остаётся сам факт связи. */
interface DoEntry { subsidiary: string; inn: string; row?: DoLimitRow }

function GeneralTab({ c }: { c: Counterparty }) {
  const navigate = useNavigate();
  const { role } = useApp();
  // Список ДО — та же выборка, что и в «Кредитном лимите» (buildCreditLimitsByDo),
  // здесь просто показывает состав и условия работы, без агрегатов лимита.
  // На карточке нет отдельного справочника ДО, поэтому переиспользуем уже
  // посчитанную связь контрагент↔ДО.
  const doLimits = useMemo(() => buildCreditLimitsByDo(c), [c.uid]);
  const doList = useMemo<DoEntry[]>(() => {
    const seen = new Map<string, DoEntry>();
    doLimits.forEach((row) => {
      if (!seen.has(row.subsidiary)) seen.set(row.subsidiary, { subsidiary: row.subsidiary, inn: row.subsidiaryInn, row });
    });
    // Связь «работает с ДО» (ФТ-19.1) существует независимо от кредитного лимита:
    // если КЛ не открывался, основное ДО контрагента всё равно должно быть в составе —
    // иначе блок пустует там, где сведения есть.
    if (!seen.has(c.subsidiary)) seen.set(c.subsidiary, { subsidiary: c.subsidiary, inn: '—' });
    return [...seen.values()];
  }, [doLimits, c.subsidiary]);
  const [doDetail, setDoDetail] = useState<{ title: string; items: { k: string; v: React.ReactNode }[] } | null>(null);

  // Суммы и условия КЛ видны только ролям, у которых открыт раздел «Кредитный
  // лимит» (табл. 13 ЕДТ): для остальных блок остаётся составом ДО без цифр.
  const showLimits = can(role, 'viewLimitSection');
  const activeLimit = useMemo(() => activeCreditLimit(doLimits), [doLimits]);
  // Совокупный КЛ считаем так же, как на вкладке «Кредитный лимит» — суммой по
  // тем же строкам реестра, а не полем карточки: иначе две вкладки показывали бы
  // разные числа для одного и того же показателя.
  const groupLimit = useMemo(() => doLimits.reduce((sum, row) => sum + row.amountRub, 0), [doLimits]);
  const activeDoCount = doLimits.filter(isDoLimitActive).length;

  const openDo = (entry: DoEntry) => {
    const row = entry.row;
    setDoDetail({
      title: entry.subsidiary,
      items: [
        { k: 'Наименование ДО', v: entry.subsidiary },
        { k: 'ИНН', v: entry.inn },
        ...(row && showLimits
          ? [
              { k: 'Сегмент', v: row.segment },
              { k: 'Лимит', v: moneyCompact(row.amountRub) },
              { k: 'Отсрочка платежа', v: `${row.deferralDays} дн.` },
              { k: 'Коллегиальный орган', v: row.approvalBody },
              { k: 'Реквизиты документа', v: row.documentRef },
              { k: 'Действительность', v: isDoLimitActive(row) ? 'Да' : 'Нет' },
              { k: 'Действует', v: `${dateRu(row.startDate)} – ${dateRu(row.endDate)}` },
              { k: 'Обеспечение', v: row.collateral },
            ]
          : [{ k: 'Кредитный лимит', v: row ? 'Скрыт для текущей роли' : 'Не открывался' }]),
      ],
    });
  };

  return (
    <>
      <SectionCard title="Общие сведения" extra={<DateActuality date={c.asOf.general} source="СПАРК / ЕГРЮЛ" />}>
        <KeyValue
          cols={3}
          items={[
            { k: 'Полное наименование', v: c.name },
            { k: 'ИНН / КПП', v: `${fmtInn(c.inn)} / ${c.kpp}` },
            { k: 'ОГРН', v: c.ogrn },
            { k: 'Основной ОКВЭД', v: `${c.okvedCode} — ${c.okved}` },
            { k: 'Регион регистрации', v: c.region },
            { k: 'Дата регистрации', v: dateRu(c.registered) },
            { k: 'Выручка (последний год)', v: moneyCompact(c.revenue) },
            { k: 'Численность', v: `${c.employees} чел.` },
          ]}
        />
      </SectionCard>

      {/* «Работает с ДО» (ФТ-19.1) — отдельный сворачиваемый блок, а не девятое
          поле карточки: у связи контрагент↔ДО в ЕДТ заведён собственный набор
          аналитик (реестр «Кредитные лимиты», ФТ-1.7 — сегмент, утверждённый КЛ,
          отсрочка платежа, коллегиальный орган, реквизиты документа, срок
          действия, обеспечение), а ДО у контрагента бывает несколько. Одним
          полем это не выражается, но и раскрытым нужно не всем — отсюда
          сворачивание. Полные условия по каждому ДО — в модалке по клику. */}
      <SectionCard
        collapsible
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Работает с ДО
            <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11 }}>{doList.length}</span>
          </span>
        }
        extra={<DateActuality date={c.asOf['credit-limit'] ?? c.asOf.general} source="реестр «Кредитные лимиты» · АРМ КК" />}
      >
        <div className="pmrk-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Дочерние общества ГК «Газпром нефть», работающие с контрагентом
          {showLimits ? ', и условия этой работы из реестра КЛ. Клик по строке — полная карточка ДО.' : '. Клик по строке — карточка ДО.'}
        </div>

        {showLimits && doLimits.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 14 }}>
            <Stat label="ДО с действующим КЛ" value={`${activeDoCount} из ${doLimits.length}`} sub="утверждённые лимиты со сроком действия" />
            <Stat label="Действующий КЛ по ДО" value={<MoneyValue amount={activeLimit} />} asOf={c.asOf['credit-limit']} calcLabel="обновлено" calcSource="сумма непросроченных лимитов ДО" />
            <Stat label="Совокупный КЛ группы" value={<MoneyValue amount={groupLimit} />} asOf={c.asOf['credit-limit']} calcSource="сумма утверждённых лимитов ДО" />
          </div>
        )}

        <div className="pmrk-table">
          <div className="pmrk-table__head">
            <div className="pmrk-th" style={{ flex: 1.6 }}>Наименование ДО</div>
            <div className="pmrk-th" style={{ flex: 0.9 }}>ИНН</div>
            <div className="pmrk-th" style={{ flex: 1.2 }}>Сегмент</div>
            {showLimits && <div className="pmrk-th" style={{ flex: 0.8, justifyContent: 'flex-end' }}>Лимит</div>}
            {showLimits && <div className="pmrk-th" style={{ flex: 0.7, justifyContent: 'flex-end' }}>Отсрочка</div>}
            {showLimits && <div className="pmrk-th" style={{ flex: 1.1 }}>Действительность</div>}
            <div className="pmrk-th" style={{ flex: 0.2 }} />
          </div>
          {doList.map((entry, i) => {
            const row = entry.row;
            const active = row ? isDoLimitActive(row) : false;
            return (
              <div key={i} className="pmrk-tr" style={{ alignItems: 'flex-start' }} onClick={() => openDo(entry)}>
                <div className="pmrk-td" style={{ flex: 1.6, fontWeight: 600, whiteSpace: 'normal' }}>
                  {entry.subsidiary}
                  {/* основное ДО карточки — то самое значение поля «Работает с ДО» */}
                  {entry.subsidiary === c.subsidiary && (
                    <span className="pmrk-chip" style={{ marginLeft: 8, background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11, fontWeight: 500 }}>основное</span>
                  )}
                </div>
                <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9 }}>{entry.inn}</div>
                <div className="pmrk-td" style={{ flex: 1.2, whiteSpace: 'normal' }}>{row?.segment ?? '—'}</div>
                {showLimits && <div className="pmrk-td pmrk-tnum" style={{ flex: 0.8, justifyContent: 'flex-end', display: 'flex' }}>{row ? moneyCompact(row.amountRub) : '—'}</div>}
                {showLimits && <div className="pmrk-td pmrk-tnum" style={{ flex: 0.7, justifyContent: 'flex-end', display: 'flex' }}>{row ? `${row.deferralDays} дн.` : '—'}</div>}
                {showLimits && (
                  <div className="pmrk-td" style={{ flex: 1.1, whiteSpace: 'normal' }}>
                    {row ? (
                      <>
                        <span style={{ color: active ? 'var(--pmrk-risk-1)' : 'var(--pmrk-risk-4)', fontWeight: 600, fontSize: 12 }}>{active ? 'Да' : 'Нет'}</span>
                        <div className="pmrk-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{dateRu(row.startDate)} – {dateRu(row.endDate)}</div>
                      </>
                    ) : (
                      <span className="pmrk-muted" style={{ fontSize: 12 }}>КЛ не открывался</span>
                    )}
                  </div>
                )}
                <div className="pmrk-td pmrk-muted" style={{ flex: 0.2, justifyContent: 'flex-end', display: 'flex' }}>→</div>
              </div>
            );
          })}
        </div>

        {showLimits && (
          <div style={{ marginTop: 10 }}>
            <Button size="xs" view="ghost" label="Все лимиты по ДО — вкладка «Кредитный лимит» →" onClick={() => navigate(`/counterparties/${c.uid}/credit-limit`)} />
          </div>
        )}
      </SectionCard>

      {/* Доп. информация по ДО — тот же паттерн, что и карточки претензий/дел
          в «Претензионно-исковой работе»: клик по строке → Modal с KeyValue. */}
      <Modal isOpen={!!doDetail} onClickOutside={() => setDoDetail(null)} onEsc={() => setDoDetail(null)}>
        {doDetail && (
          <div style={{ padding: 20, width: 480, maxWidth: '92vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{doDetail.title}</h3>
              <Button size="xs" view="clear" label="✕" onClick={() => setDoDetail(null)} />
            </div>
            <KeyValue cols={1} items={doDetail.items} />
          </div>
        )}
      </Modal>
    </>
  );
}

const extLevelColor = (l?: string) => (l === 'high' ? 'var(--pmrk-risk-4)' : l === 'medium' ? 'var(--pmrk-risk-3)' : l === 'low' ? 'var(--pmrk-risk-1)' : 'var(--color-typo-primary)');

/** Плоская иконка «сводного риска» — кольцо (пончик), разрезанное строго вертикально
    на 2 половины (левую и правую) прямым разрезом фиксированной ширины 2px.
    Авторский холст (viewBox) 256×256, в интерфейсе выводится через проп size.
    Разрез вырезан прямоугольной SVG-маской, а не угловым зазором (strokeDasharray):
    угловой зазор на широком кольце превращается в клин — шире у внешнего края,
    у́же у отверстия, — а маска-прямоугольник даёт одинаковую ширину разреза на
    любом радиусе. Ширина задана как реальные 2px на экране, а не доля холста:
    при масштабировании 2px от 256 стали бы долями пикселя и пропали бы — поэтому
    пересчитывается от size, чтобы на экране всегда было ровно 2px. Цвет — по
    уровню риска, тот же токен, что и у текстового значения строки. */
function RiskDonutIcon({ color, size = 48 }: { color: string; size?: number }) {
  const maskId = useId();
  const outerR = 114; // внешний край кольца — не меняется
  const innerR = 50; // внутреннее отверстие — немного увеличено (было 35)
  const r = (outerR + innerR) / 2; // радиус для отрисовки stroke — середина кольца
  const strokeWidth = outerR - innerR; // толщина кольца подстраивается под отверстие
  const cutOnScreenPx = 2;
  const cut = (cutOnScreenPx * 256) / size; // 2 реальных px, переведённые в единицы холста 256
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" style={{ flex: 'none' }} aria-hidden>
      {/* maskUnits/x/y/width/height явно на весь холст: по умолчанию область маски
          считается от геометрического bbox круга (радиус r, без учёта толщины
          обводки) — при таком толстом кольце это обрезало внешний край квадратной
          рамкой, и кольцо визуально превращалось в восьмиугольник. */}
      <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={256} height={256}>
        <rect x={0} y={0} width={256} height={256} fill="#fff" />
        {/* вертикальная полоса фиксированной ширины cut — прямой разрез сверху донизу */}
        <rect x={128 - cut / 2} y={0} width={cut} height={256} fill="#000" />
      </mask>
      <circle cx={128} cy={128} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} mask={`url(#${maskId})`} />
    </svg>
  );
}

/** Индикаторы, для которых вместо цветной точки выводится кольцевая иконка
    (RiskDonutIcon) — итоговые вердикты риска, где визуальный акцент важнее
    остальных строк списка. */
const DONUT_INDICATOR_LABELS = new Set(['Сводный риск', 'Индекс финансового риска (ИФР)']);

/** Индикаторы со значением, вписанным в геометрическую фигуру (RiskShapeIcon):
    форма — часть кодирования уровня риска, в дополнение к цвету. */
const SHAPE_INDICATOR_LABELS = new Set(['Индекс должной осмотрительности (ИДО)', 'Индекс платёжной дисциплины (ИПД)']);

/** Иконка «Индекс должной осмотрительности» / «Индекс платёжной дисциплины» —
    фигура со значением внутри. Форма зависит от уровня риска (та же градация,
    что и цвет текста в остальных строках): круг — низкий/зелёный, квадрат —
    средний/жёлтый, шестигранник — высокий/красный. Обводка толстая (16 из 256
    холста, ≈3px на реальном размере), чтобы форма чётко читалась. Число внутри —
    крупным жирным кеглем; у ИПД исходное значение вида «99 / 100» — постоянный
    знаменатель на каждой иконке не несёт информации и не поместился бы читаемо,
    поэтому внутрь идёт только числитель (при 3 цифрах кегль уменьшается, чтобы
    не тесно). Авторский холст и размер на экране те же, что и у RiskDonutIcon. */
function RiskShapeIcon({ value, level, color, size = 48 }: { value: string; level: 'low' | 'medium' | 'high'; color: string; size?: number }) {
  const strokeWidth = 16;
  const cx = 128;
  const cy = 128;
  const displayValue = value.split(' / ')[0];
  const fontSize = displayValue.length >= 3 ? 74 : 92;

  let shape: React.ReactNode;
  if (level === 'low') {
    shape = <circle cx={cx} cy={cy} r={100} fill="none" stroke={color} strokeWidth={strokeWidth} />;
  } else if (level === 'medium') {
    const half = 98;
    shape = <rect x={cx - half} y={cy - half} width={half * 2} height={half * 2} rx={20} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  } else {
    const r = 108;
    const points = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (-90 + i * 60);
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(' ');
    shape = <polygon points={points} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
  }

  return (
    <svg width={size} height={size} viewBox="0 0 256 256" style={{ flex: 'none' }} aria-hidden>
      {shape}
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={700} fill={color}>{displayValue}</text>
    </svg>
  );
}

/** Визуальное представление значения индикатора — donut / фигура-с-числом / точка
    с текстом, в зависимости от лейбла. Общая часть для строки списка (IndRow)
    и для карточки в горизонтальной сводке (SummaryItem) — сводка показывает
    «ту же иконку и значения», что и основной список, одним и тем же кодом. */
function IndicatorVisual({ ind }: { ind: Indicator }) {
  const useDonut = DONUT_INDICATOR_LABELS.has(ind.label);
  const useShape = SHAPE_INDICATOR_LABELS.has(ind.label);
  if (useDonut && ind.level) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <RiskDonutIcon color={extLevelColor(ind.level)} />
        <span style={{ fontWeight: 600, color: extLevelColor(ind.level), textAlign: 'center' }}>{ind.value}</span>
      </span>
    );
  }
  if (useShape && ind.level) {
    return <RiskShapeIcon value={ind.value} level={ind.level as 'low' | 'medium' | 'high'} color={extLevelColor(ind.level)} />;
  }
  return (
    <span style={{ fontWeight: 600, color: extLevelColor(ind.level), textAlign: 'right' }}>
      {ind.level && <span className="pmrk-dot" style={{ background: extLevelColor(ind.level), marginRight: 6 }} />}
      {ind.value}
    </span>
  );
}

function IndRow({ ind }: { ind: Indicator }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-bg-border)', fontSize: 13 }}>
      <span style={{ flex: 1 }}>
        {ind.label}
        {ind.tip && <span title={ind.tip} style={{ marginLeft: 6, cursor: 'help', color: 'var(--color-typo-ghost)', fontSize: 12 }}>ⓘ</span>}
      </span>
      <IndicatorVisual ind={ind} />
    </div>
  );
}

/** Короткие подписи для горизонтальной сводки — полные названия там не нужны. */
const SHORT_LABEL: Record<string, string> = {
  'Сводный риск': 'Риск',
  'Индекс должной осмотрительности (ИДО)': 'ИДО',
  'Индекс финансового риска (ИФР)': 'ИФР',
  'Индекс платёжной дисциплины (ИПД)': 'ИПД',
};

/** Горизонтальная сводка индикаторов раздела «1. Финансовые индикаторы риска
    СПАРК» — те же 4 значения из основного списка ниже, но компактно в ряд:
    короткая подпись (с той же подсказкой ⓘ, что и в списке) сверху, иконка
    и значение снизу. Отделена от списка собственной рамкой снизу — визуально
    самостоятельный блок в границах того же раздела. */
function RiskSummaryBar({ indicators }: { indicators: Indicator[] }) {
  return (
    // Группа занимает ровно половину ширины раздела (width: '50%'), показатели
    // распределены по этой половине через justifyContent: 'space-between' —
    // расстояние между ними задаётся шириной группы, а не фиксированным gap.
    <div style={{ display: 'flex', justifyContent: 'space-between', width: '50%', padding: '4px 4px 20px', marginBottom: 16, borderBottom: '1px solid var(--color-bg-border)' }}>
      {indicators.map((ind, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-typo-secondary)' }}>
            {SHORT_LABEL[ind.label] ?? ind.label}
            {ind.tip && <span title={ind.tip} style={{ marginLeft: 4, cursor: 'help', color: 'var(--color-typo-ghost)', fontSize: 11 }}>ⓘ</span>}
          </span>
          <IndicatorVisual ind={ind} />
        </div>
      ))}
    </div>
  );
}

function ExtAccordion({ title, indicators, defaultOpen, beforeIndicators, children }: { title: string; indicators?: Indicator[]; defaultOpen?: boolean; beforeIndicators?: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const risky = indicators?.filter((i) => i.level === 'high' || i.level === 'medium').length ?? 0;
  return (
    <div className="pmrk-card" style={{ marginBottom: 8, overflow: 'hidden' }}>
      <div className="pmrk-clickable" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }} onClick={() => setOpen((v) => !v)}>
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--color-typo-secondary)' }}>▸</span>
        <span style={{ fontWeight: 600, flex: 1 }}>{title}</span>
        {risky > 0 && <span className="pmrk-chip" style={{ background: 'var(--pmrk-risk-3-bg)', color: 'var(--pmrk-risk-3)', fontSize: 11 }}>{risky} сигнал.</span>}
      </div>
      {open && (
        <div style={{ borderTop: '1px solid var(--color-bg-border)', padding: '4px 16px 12px' }}>
          {beforeIndicators}
          {indicators?.map((ind, i) => <IndRow key={i} ind={ind} />)}
          {children}
        </div>
      )}
    </div>
  );
}

function ExternalTab({ c }: { c: Counterparty }) {
  const ext = useMemo(() => buildExternal(c), [c.uid]);
  const [allCases, setAllCases] = useState(false);
  const rb = rbSignal(c.rbIndex);

  return (
    <>
      <SectionCard title="Внешняя информация" extra={<DateActuality date={c.asOf.external} source="СПАРК / ФНС / ГПБ / Госзакупки" />}>
        <div className="pmrk-muted" style={{ fontSize: 13, marginBottom: 12 }}>11 разделов внешних источников (СПАРК, ФНС, Газпромбанк, Госзакупки). Разделы раскрываются по запросу — сигналы видны сразу.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <Stat label="Индекс РБ (Газпромбанк)" value={<RbIndicator value={c.rbIndex} />} sub={rb.desc} />
          <Stat label="Санкционный статус" value={c.underSanctions ? <SanctionBadge /> : 'Не выявлено'} tone={c.underSanctions ? 'risk' : 'good'} />
          <Stat label="РНП (недобросовестные)" value={c.group === 4 ? 'Есть записи' : 'Не выявлено'} tone={c.group === 4 ? 'risk' : 'good'} />
        </div>
      </SectionCard>

      {/* 1,2,4,5,6,7,9,10,11 — аккордеоны (прогрессивное раскрытие).
          3. Санкции по данным СПАРК встроена в ту же последовательность сразу после
          раздела 2 (по номеру), тем же компонентом ExtAccordion — раздел не должен
          визуально отличаться от остальных: тот же сворачиваемый заголовок,
          та же карточка. Расшифровка внутри — таблицей, без клика и модалки. */}
      {ext.sections.map((s) => (
        <Fragment key={s.key}>
          <ExtAccordion
            title={s.title}
            indicators={s.indicators}
            defaultOpen={['s1', 's2', 's4', 's6'].includes(s.key)}
            beforeIndicators={s.key === 's1' && s.indicators ? <RiskSummaryBar indicators={s.indicators} /> : undefined}
          >
            {s.key === 's6' && ext.courtCases.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>Расшифровка судебных дел</div>
                <div className="pmrk-table">
                  <div className="pmrk-table__head">
                    <div className="pmrk-th" style={{ flex: 1.6 }}>Истец</div>
                    <div className="pmrk-th" style={{ flex: 1.2 }}>Номер дела</div>
                    <div className="pmrk-th" style={{ flex: 1 }}>Состояние</div>
                    <div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Сумма иска</div>
                  </div>
                  {(allCases ? ext.courtCases : ext.courtCases.slice(0, 3)).map((cc, i) => (
                    <div key={i} className="pmrk-tr" style={{ cursor: 'default' }}>
                      <div className="pmrk-td" style={{ flex: 1.6 }}>{cc.plaintiff}</div>
                      <div className="pmrk-td" style={{ flex: 1.2 }}>{cc.number}</div>
                      <div className="pmrk-td" style={{ flex: 1 }}>{cc.state}</div>
                      <div className="pmrk-td pmrk-tnum" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(cc.claim)}</div>
                    </div>
                  ))}
                </div>
                {ext.courtCases.length > 3 && <div style={{ marginTop: 6 }}><Button size="xs" view="ghost" label={allCases ? 'Свернуть' : 'Показать больше'} onClick={() => setAllCases((v) => !v)} /></div>}
              </div>
            )}
          </ExtAccordion>

          {/* 3. Санкции — сразу после раздела 2 (по номеру), скрыт при отсутствии записей (ФТ-1.3) */}
          {s.key === 's2' && ext.sanctions.length > 0 && (
            <ExtAccordion
              title="3. Санкции по данным СПАРК"
              indicators={[{ label: 'Под санкциями', value: 'Да', level: 'high' }]}
              defaultOpen
            >
              <div style={{ marginTop: 10 }}>
                <div className="pmrk-table">
                  <div className="pmrk-table__head">
                    <div className="pmrk-th" style={{ flex: 1.5 }}>Санкционная программа / список</div>
                    <div className="pmrk-th" style={{ flex: 1 }}>Категория</div>
                    <div className="pmrk-th" style={{ flex: 1.1 }}>Тип санкций</div>
                    <div className="pmrk-th" style={{ flex: 0.8 }}>Включение</div>
                    <div className="pmrk-th" style={{ flex: 0.8 }}>Исключение</div>
                    <div className="pmrk-th" style={{ flex: 0.8 }}>Совладельцы</div>
                    <div className="pmrk-th" style={{ flex: 1.8 }}>Причина включения</div>
                  </div>
                  {ext.sanctions.map((sd, i) => (
                    <div key={i} className="pmrk-tr" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                      <div className="pmrk-td" style={{ flex: 1.5, fontWeight: 600, whiteSpace: 'normal' }}>{sd.program}</div>
                      <div className="pmrk-td" style={{ flex: 1, whiteSpace: 'normal' }}>{sd.category}</div>
                      <div className="pmrk-td" style={{ flex: 1.1, whiteSpace: 'normal' }}>{sd.type}</div>
                      <div className="pmrk-td" style={{ flex: 0.8 }}>{dateRu(sd.from)}</div>
                      <div className="pmrk-td" style={{ flex: 0.8 }}>{sd.to}</div>
                      <div className="pmrk-td" style={{ flex: 0.8 }}>{sd.coOwners}</div>
                      <div className="pmrk-td" style={{ flex: 1.8, whiteSpace: 'normal' }}>{sd.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            </ExtAccordion>
          )}
        </Fragment>
      ))}
    </>
  );
}

function AffiliationTabView({ c }: { c: Counterparty }) {
  const navigate = useNavigate();
  const { aiOn } = useApp();
  const graph = GRAPHS[c.uid];
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'diagram' | 'table'>('diagram');
  const [filters, setFilters] = useState<DiagramFilters>({ types: new Set<AffiliationLinkType>(['owner', 'beneficiary', 'subsidiary', 'affiliate']), minDirect: 0, maxLevel: 3 });
  const groupRisk = AI_GROUP_RISK[c.uid];

  if (!graph) {
    return <SimpleTab title="Аффилированность" text="Диаграмма и таблица связей строятся по данным структуры собственников, бенефициаров и аффилированных лиц. Для этого контрагента связи не загружены — попробуйте РН-Снабжение или Балтийскую ТК." asOf={c.asOf.affiliation} />;
  }

  const toggleType = (t: AffiliationLinkType) => {
    setFilters((f) => {
      const types = new Set(f.types);
      types.has(t) ? types.delete(t) : types.add(t);
      return { ...f, types };
    });
  };

  return (
    <>
      {aiOn && groupRisk && <AiSummaryCard variant="group" summary={groupRisk} onJump={(to) => navigate(`/counterparties/${to}/affiliation`)} />}

      <SectionCard
        title="Аффилированность"
        extra={<DateActuality date={graph.asOf} source="СПАРК-Аффилированность" />}
      >
        {/* единая строка поиска — дублируется в обе подвкладки (ФТ-4.3) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск связи по наименованию или ИНН (подсветка оранжевым)"
            style={{ flex: 1, height: 34, padding: '0 12px', border: '1px solid var(--color-bg-border)', borderRadius: 8, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', outline: 'none' }}
          />
          <Segmented value={mode} onChange={setMode} items={[{ key: 'diagram', label: 'Диаграмма' }, { key: 'table', label: 'Таблица' }]} />
        </div>

        {/* фильтры */}
        <div className="pmrk-filterbar">
          {(['owner', 'beneficiary', 'subsidiary', 'affiliate'] as AffiliationLinkType[]).map((t) => (
            <div key={t} className={`pmrk-filterchip ${filters.types.has(t) ? 'pmrk-filterchip--active' : ''}`} onClick={() => toggleType(t)}>
              {t === 'owner' ? 'Собственники' : t === 'beneficiary' ? 'Бенефициары' : t === 'subsidiary' ? 'Дочерние' : 'Аффилированные'}
            </div>
          ))}
        </div>

        {mode === 'diagram' ? (
          <AffiliationDiagram
            graph={graph}
            search={search}
            filters={filters}
            onOpenGeneral={() => navigate(`/counterparties/${c.uid}/general`)}
            onOpenCounterparty={(u) => navigate(`/counterparties/${u}/affiliation`)}
          />
        ) : (
          <AffiliationTable graph={graph} search={search} onOpen={(u) => navigate(`/counterparties/${u}/affiliation`)} />
        )}
      </SectionCard>
    </>
  );
}

function AffiliationTable({ graph, search, onOpen }: { graph: typeof GRAPHS[string]; search: string; onOpen: (uid: string) => void }) {
  const q = search.trim().toLowerCase();
  const owners = graph.nodes.filter((n) => n.linkType === 'owner');
  const benef = graph.nodes.filter((n) => n.linkType === 'beneficiary');
  const aff = graph.nodes.filter((n) => n.linkType === 'affiliate' || n.linkType === 'subsidiary');
  const hit = (name: string, inn?: string) => q && (name.toLowerCase().includes(q) || (inn ?? '').includes(q));
  const Row = ({ name, inn, extra, uid, person, sanc }: { name: string; inn?: string; extra: string; uid?: string; person?: boolean; sanc?: boolean }) => (
    <div className={`pmrk-tr ${hit(name, inn) ? 'pmrk-search-hit' : ''}`} style={{ padding: '8px 4px', cursor: uid ? 'pointer' : 'default' }} onClick={() => uid && onOpen(uid)}>
      <div style={{ flex: 2 }}>
        <span style={{ fontWeight: 600 }}>{name}</span> {sanc && <SanctionBadge />}
        <div className="pmrk-muted" style={{ fontSize: 11 }}>{person ? 'Физлицо' : inn ? `ИНН ${inn}` : 'ЮЛ'}{uid ? ' · есть в реестре →' : ''}</div>
      </div>
      <div style={{ flex: 1, fontSize: 12.5 }} className="pmrk-muted">{extra}</div>
    </div>
  );
  return (
    <div>
      <div style={{ fontWeight: 600, margin: '4px 0 6px' }}>Структура собственников</div>
      {owners.map((n) => <Row key={n.id} name={n.name} inn={n.inn} person={n.isPerson} uid={n.uid} sanc={n.underSanctions} extra={n.directShare != null ? `Доля прямого владения ${n.directShare}%` : n.indirectShare != null ? `Доля косвенного владения ${n.indirectShare}%` : '—'} />)}
      <div style={{ fontWeight: 600, margin: '14px 0 6px' }}>Бенефициары</div>
      {benef.map((n) => <Row key={n.id} name={n.name} person={n.isPerson} extra={`Конечный бенефициар · ${n.indirectShare ?? '—'}%`} />)}
      <div style={{ fontWeight: 600, margin: '14px 0 6px' }}>Аффилированные и дочерние лица</div>
      {aff.map((n) => <Row key={n.id} name={n.name} inn={n.inn} uid={n.uid} sanc={n.underSanctions} extra={n.linkType === 'subsidiary' ? `Дочернее · доля ${n.directShare ?? '—'}%` : 'Аффилированное лицо'} />)}
    </div>
  );
}

function DebtTab({ c }: { c: Counterparty }) {
  const debt = c.debt.length ? c.debt : synthDebt(c);
  const labels = monthLabels(debt.length);
  const [detail, setDetail] = useState<string | null>(null);
  return (
    <>
      <SectionCard title="Данные по дебиторской и кредиторской задолженности" extra={<DateActuality date={c.asOf.debt} source="АРМ КК" />}>
        {/* Три графика друг за другом в ряд (было 2: «Авансы и кредиторская
            задолженность» объединяла две разнородные серии в одном графике —
            разделили на «Авансовую» и «Кредитную» задолженность). Точки на
            каждое значение — showPoints; значение по-прежнему только по
            наведению (тултип), как и раньше. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>ДЗ и ПДЗ</div>
            <LineChart
              labels={labels}
              format={(v) => moneyCompact(v)}
              showPoints
              series={[
                { name: 'Дебиторская задолженность', color: 'var(--color-bg-brand)', points: debt.map((d) => d.dz), area: true },
                { name: 'Просроченная ДЗ', color: 'var(--pmrk-risk-4)', points: debt.map((d) => d.pdz) },
              ]}
            />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Авансовая задолженность</div>
            <LineChart
              labels={labels}
              format={(v) => moneyCompact(v)}
              showPoints
              series={[
                { name: 'Выданные авансы', color: 'var(--pmrk-risk-2)', points: debt.map((d) => d.advance), area: true },
              ]}
            />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Кредитная задолженность</div>
            <LineChart
              labels={labels}
              format={(v) => moneyCompact(v)}
              showPoints
              series={[
                { name: 'Кредиторская задолженность', color: 'var(--pmrk-ai)', points: debt.map((d) => d.payable), area: true },
              ]}
            />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Детализация (Блок → ДО → итог, 13 аналитик)">
        <div className="pmrk-table">
          <div className="pmrk-table__head">
            <div className="pmrk-th" style={{ flex: 2.8 }}>Уровень</div>
            <div className="pmrk-th" style={{ flex: 0.6, justifyContent: 'flex-end' }}>ДЗ</div>
            <div className="pmrk-th" style={{ flex: 0.6, justifyContent: 'flex-end' }}>ПДЗ</div>
            <div className="pmrk-th" style={{ flex: 0.6, justifyContent: 'flex-end' }}>Авансы</div>
          </div>
          {[
            { lvl: 'Блок (совокупно)', dz: debt[debt.length - 1].dz, pdz: debt[debt.length - 1].pdz, adv: debt[debt.length - 1].advance },
            { lvl: c.subsidiary.replace('ООО «', '').replace('»', ''), dz: Math.round(debt[debt.length - 1].dz * 0.7), pdz: Math.round(debt[debt.length - 1].pdz * 0.7), adv: Math.round(debt[debt.length - 1].advance * 0.6) },
          ].map((r, i) => (
            <div key={i} className="pmrk-tr pmrk-clickable" onClick={() => setDetail(r.lvl)}>
              <div className="pmrk-td" style={{ flex: 2.8, fontWeight: i === 0 ? 700 : 400 }}>{r.lvl}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 0.6, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(r.dz)}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 0.6, justifyContent: 'flex-end', display: 'flex', color: 'var(--pmrk-risk-4)' }}>{moneyCompact(r.pdz)}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 0.6, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(r.adv)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <span className="pmrk-muted" style={{ fontSize: 12 }}>Клик по строке → детализация до договора (4 раздела). Доля ПДЗ на последнюю дату: <b style={{ color: 'var(--pmrk-risk-4)' }}>{pct((debt[debt.length - 1].pdz / debt[debt.length - 1].dz) * 100)}</b>.</span>
          <CalcStamp date={c.asOf.debt} source="АРМ КК" />
        </div>
      </SectionCard>

      <Modal isOpen={!!detail} onClickOutside={() => setDetail(null)} onEsc={() => setDetail(null)}>
        <div style={{ padding: 20, width: 560, maxWidth: '90vw' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>Детализация задолженности · {detail}</h3>
            <Button size="xs" view="clear" label="✕" onClick={() => setDetail(null)} />
          </div>
          {['Дебиторская задолженность по договорам', 'Просроченная задолженность (по срокам)', 'Выданные авансы', 'Обеспечения и гарантии'].map((sec) => (
            <div key={sec} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-bg-border)' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{sec}</div>
              <div className="pmrk-muted" style={{ fontSize: 12, marginTop: 2 }}>Договор № 2024/{Math.floor(Math.random() * 900 + 100)} · до 30 дней / 31–90 / свыше 90 · с переходом к карточке договора (АРМ КК).</div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function StatementsTab({ c }: { c: Counterparty }) {
  return (
    <SectionCard title="Отчётность (Ф1–Ф4 за 3 периода)" extra={<DateActuality date={c.asOf.statements} source="СПАРК / ручной ввод" />}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Button size="xs" view="secondary" label="РСБУ отчётность (PDF)" iconLeft={IconDownload as never} />
        <span className="pmrk-muted" style={{ fontSize: 12, alignSelf: 'center' }}>Стандарт: РСБУ · валюта ₽ · тыс. руб.</span>
      </div>
      <div className="pmrk-table" style={{ overflow: 'hidden' }}>
        {/* Столбцы по годам — по убыванию (2025→2023), ширина как у ДЗ/ПДЗ/Авансы
            в «Детализации» (flex 0.6 против 2.8 у «Показателя»). */}
        <div className="pmrk-table__head"><div className="pmrk-th" style={{ flex: 2.8 }}>Показатель (Форма №1)</div><div className="pmrk-th" style={{ flex: 0.6, justifyContent: 'flex-end' }}>2025</div><div className="pmrk-th" style={{ flex: 0.6, justifyContent: 'flex-end' }}>2024</div><div className="pmrk-th" style={{ flex: 0.6, justifyContent: 'flex-end' }}>2023</div></div>
        {[['Внеоборотные активы', 0.3], ['Оборотные активы', 0.7], ['БАЛАНС (актив)', 1], ['Капитал и резервы', 0.35], ['Долгосрочные обязательства', 0.2], ['Краткосрочные обязательства', 0.45], ['БАЛАНС (пассив)', 1]].map(([label, k]) => (
          <div key={label as string} className="pmrk-tr" style={{ cursor: 'default', fontWeight: (label as string).includes('БАЛАНС') ? 700 : 400 }}>
            <div className="pmrk-td" style={{ flex: 2.8 }}>{label}</div>
            {[1, 0.96, 0.9].map((y, i) => <div key={i} className="pmrk-td pmrk-tnum" style={{ flex: 0.6, justifyContent: 'flex-end', display: 'flex' }}>{money(Math.round((c.revenue * 0.4 * (k as number)) * y / 1000), { unit: '' })}</div>)}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--pmrk-risk-1)' }}>✓ Проверка пройдена: активы = пассивам на каждую отчётную дату (ФТ-3.4).</div>
    </SectionCard>
  );
}

function AssessmentTab({ c }: { c: Counterparty }) {
  const navigate = useNavigate();
  const { aiOn } = useApp();
  const a = c.assessments[0];
  const explain = SCORE_EXPLAIN[c.uid];
  const [showExplain, setShowExplain] = useState(false);
  if (!a) return <SimpleTab title="Оценка" text="По контрагенту ещё не проводилась экспресс-оценка. Запустите новую с командного центра." asOf={c.asOf.assessment} />;
  return (
    <SectionCard
      title="Экспресс-оценка кредитоспособности"
      extra={<DateActuality date={c.asOf.assessment} source="scoring-движок" />}
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="pmrk-muted" style={{ fontSize: 12 }}>{a.directionLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0' }}>
            <GroupBadge group={a.group} withScore={a.score} />
            {aiOn && explain && (
              <button onClick={() => setShowExplain((v) => !v)} style={{ background: 'var(--pmrk-ai-bg)', border: '1px solid var(--pmrk-ai-border)', color: 'var(--pmrk-ai-strong)', borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }}>
                ✦ почему группа {a.group}?
              </button>
            )}
          </div>
          <div className="pmrk-muted" style={{ fontSize: 12 }}>{groupLabel(a.group)}</div>
          <div className="pmrk-muted" style={{ fontSize: 12, marginTop: 2 }}>Рекомендованный КЛ: <b>{a.limit ? moneyCompact(a.limit) : '—'}</b> · автор {a.author} · {dateRu(a.date)}</div>
          <div style={{ marginTop: 4 }}><CalcStamp date={a.date} source="ядро scoring" /></div>
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 4 }}>Динамика балла и группы</div>
          <LineChart height={120} labels={c.assessments.map((x) => dateRu(x.date)).reverse()} series={[{ name: 'Интегральный балл', color: 'var(--color-bg-brand)', points: c.assessments.map((x) => x.score).reverse(), area: true }]} format={(v) => String(Math.round(v))} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="xs" view="secondary" label="Выгрузить XLSX" iconLeft={IconDownload as never} />
          <Button size="xs" view="ghost" label="Полная оценка" onClick={() => navigate(`/assessments/${a.id}`)} />
        </div>
      </div>

      {showExplain && explain && (
        <div className="pmrk-ai-surface" style={{ marginTop: 16, padding: '14px 16px 14px 20px' }}>
          <div className="pmrk-ai-accentbar" />
          <div className="pmrk-ai__head"><span className="pmrk-ai__badge">✦ AI</span><span style={{ fontWeight: 600 }}>Объяснение оценки (AI-3) · число группы — детерминированное, AI вербализует</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, margin: '8px 0' }}>
            {explain.blocks.map((b) => (
              <div key={b.name}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{b.name}</div>
                <div style={{ height: 8, background: 'var(--color-bg-secondary)', borderRadius: 4, overflow: 'hidden', margin: '4px 0' }}><div style={{ width: `${(b.contribution / 30) * 100}%`, height: '100%', background: 'var(--pmrk-ai)' }} /></div>
                <div className="pmrk-muted" style={{ fontSize: 11 }}>вклад {b.contribution} · вес {Math.round(b.weight * 100)}% · {b.note}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, marginTop: 6 }}><b>Что изменилось:</b> {explain.delta}</div>
          <div style={{ fontSize: 13, marginTop: 6, color: 'var(--pmrk-ai-strong)' }}><b>Чтобы перейти в группу {explain.group - 1}:</b> {explain.toNextGroup}</div>
        </div>
      )}
    </SectionCard>
  );
}

function NewsTab({ c }: { c: Counterparty }) {
  if (!c.news.length) return <SimpleTab title="Новости" text="По контрагенту нет значимых новостей за период." asOf={c.asOf.news} />;
  return (
    <SectionCard title="Новости" extra={<DateActuality date={c.asOf.news} source="PRIMO" />}>
      {c.news.map((n) => (
        <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-bg-border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.sentiment === 'negative' ? 'var(--pmrk-risk-4)' : n.sentiment === 'positive' ? 'var(--pmrk-risk-1)' : 'var(--color-typo-ghost)' }} />
            <span style={{ fontWeight: 600 }}>{n.title}</span>
            <span className="pmrk-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{dateRu(n.date)} · {n.source}</span>
          </div>
          <div className="pmrk-muted" style={{ fontSize: 13, marginTop: 4, paddingLeft: 16 }}>{n.summary}</div>
        </div>
      ))}
    </SectionCard>
  );
}

function SecurityTab({ c }: { c: Counterparty }) {
  return (
    <SectionCard title="Информация СБ" extra={<DateActuality date={c.asOf.security} source="СКРАФФ" />}>
      {c.group === 4 ? (
        <div style={{ fontSize: 13 }}>Выявлены факторы повышенного внимания службы безопасности. Детализация доступна ролям СБ/КК.</div>
      ) : (
        <EmptyState text="По данному контрагенту нет информации от службы безопасности" />
      )}
    </SectionCard>
  );
}

function SpecialControlTab({ c }: { c: Counterparty }) {
  return (
    <SectionCard title="Под особым контролем" extra={<DateActuality date={c.asOf['special-control']} source="ПМРК" />}>
      {c.specialControl ? (
        <div>
          <StatusBadge status="На особом контроле" />
          <div className="pmrk-muted" style={{ fontSize: 13, marginTop: 8 }}>Внесено предложение о включении (КК Блока), статус — на согласовании. Согласование — КК-Блок/КК-УФК/АДМ; исключение — КК-УФК/АДМ.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button size="xs" label="Согласовать включение" />
            <Button size="xs" view="ghost" label="Исключить из особого контроля" />
          </div>
        </div>
      ) : (
        <div>
          <EmptyState text="Контрагент не находится под особым контролем." />
          <div style={{ textAlign: 'center' }}><Button size="xs" view="secondary" label="Внести предложение о включении" /></div>
        </div>
      )}
    </SectionCard>
  );
}

function LegalTab({ c }: { c: Counterparty }) {
  const legal = useMemo(() => buildLegal(c), [c.uid]);
  const SECTIONS = [
    { key: 'claims', label: 'Выставленные претензии', count: legal.claims.length },
    { key: 'lawsuits', label: 'Судебные дела', count: legal.lawsuits.length },
    { key: 'enforcement', label: 'Исполнительное производство', count: legal.enforcement.length },
    { key: 'bankruptcy', label: 'Банкротное дело', count: legal.bankruptcy.length },
  ];
  const [sec, setSec] = useState('claims');
  const [detail, setDetail] = useState<{ title: string; items: { k: string; v: React.ReactNode }[] } | null>(null);
  const [curacao, setCuracao] = useState(false);

  const m = (n: number) => money(n);

  const openClaim = (x: typeof legal.claims[0]) => setDetail({ title: `Претензия ${x.claimNo}`, items: [
    { k: 'Заявитель претензии', v: x.applicant }, { k: 'Направление деятельности', v: x.activity }, { k: 'Номер договора', v: x.contractNo },
    { k: 'Номер исходящей претензии', v: x.claimNo }, { k: 'Дата направления', v: dateRu(x.sentDate) }, { k: 'Предмет и основание', v: x.subject },
    { k: 'Сумма претензии (общая)', v: m(x.total) }, { k: 'Основной долг', v: m(x.principal) }, { k: 'Неустойка', v: m(x.penalty) },
    { k: 'Иное', v: m(x.other) }, { k: 'Удовлетворено', v: m(x.satisfied) }, { k: 'Событие по претензии', v: x.event }, { k: 'Дата события', v: dateRu(x.eventDate) },
    { k: 'Статус', v: <StatusBadge status={x.status} /> }, { k: 'Комментарий', v: x.comment }, { k: 'Связь с судебным делом', v: x.lawsuitLink },
    { k: 'Юрист, сопровождающий претензию', v: x.lawyer },
  ] });
  const openLawsuit = (x: typeof legal.lawsuits[0]) => setDetail({ title: `Судебное дело ${x.caseNo}`, items: [
    { k: 'Истец', v: x.plaintiff }, { k: 'Номер дела', v: x.caseNo }, { k: 'Дата регистрации дела', v: dateRu(x.regDate) },
    { k: 'Сумма иска текущая', v: m(x.currentClaim) }, { k: 'Удовлетворено', v: m(x.satisfied) }, { k: 'Текущая судебная инстанция', v: x.instance },
    { k: 'Ближайшее судебное заседание', v: dateRu(x.nextHearing) }, { k: 'Статус дела', v: <StatusBadge status={x.status} /> }, { k: 'Результат решения суда', v: x.courtResult },
    { k: 'Исход дела', v: x.outcome }, { k: 'Связь с исполнительным производством', v: x.enforcementLink }, { k: 'Связь с делом о банкротстве', v: x.bankruptcyLink },
    { k: 'Юрист', v: x.lawyer },
  ] });
  const openEnf = (x: typeof legal.enforcement[0]) => setDetail({ title: x.caseName, items: [
    { k: 'Взыскатель', v: x.claimant }, { k: 'Название дела', v: x.caseName }, { k: 'Дата создания дела', v: dateRu(x.createDate) },
    { k: 'Дата выдачи исполнительного листа', v: dateRu(x.writDate) }, { k: 'Исполнительный документ: серия и номер', v: x.writSerial }, { k: 'Сумма по исполнительному документу', v: m(x.sumByDoc) },
    { k: 'Фактически получено', v: m(x.received) }, { k: 'Дата последнего платежа', v: dateRu(x.lastPaymentDate) }, { k: 'Планируемое событие', v: x.plannedEvent },
    { k: 'Дата планируемого события', v: dateRu(x.plannedDate) }, { k: 'Комментарий по событию', v: x.eventComment }, { k: 'Отметка о фактическом выполнении', v: x.completed },
    { k: 'Дата фактического завершения', v: x.completionDate },
  ] });
  const openBank = (x: typeof legal.bankruptcy[0]) => setDetail({ title: x.caseName, items: [
    { k: 'Кредитор в деле о банкротстве', v: x.creditor }, { k: 'Название дела о банкротстве', v: x.caseName }, { k: 'Стадия банкротства', v: <StatusBadge status={x.stage} /> },
    { k: 'Сумма требований в реестре', v: m(x.claimInRegistry) }, { k: 'Сумма исполнения требований', v: m(x.execution) }, { k: 'Дата последнего платежа', v: x.lastPaymentDate },
    { k: 'Сумма последнего платежа', v: m(x.lastPaymentSum) }, { k: 'Планируемое событие', v: x.plannedEvent }, { k: 'Дата планируемого события', v: dateRu(x.plannedDate) },
  ] });

  // Ссылка на КЮРАСАО 2.0 перенесена из детальной карточки в отдельный столбец
  // таблицы («Данные КЮРАСАО 2.0» → «Перейти») — клик по ссылке не должен
  // открывать саму карточку строки, поэтому останавливаем всплытие.
  const Row = ({ onClick, cols }: { onClick: () => void; cols: React.ReactNode[] }) => (
    <div className="pmrk-tr" onClick={onClick}>
      {cols.map((col, i) => <div key={i} className="pmrk-td" style={{ flex: i === 0 ? 1.8 : 1, justifyContent: i > 1 ? 'flex-end' : 'flex-start', display: 'flex' }}>{col}</div>)}
      <div className="pmrk-td" style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
        <a href="#" onClick={(e) => { e.preventDefault(); setCuracao(true); }} style={{ color: 'var(--color-typo-brand)', fontSize: 12 }}>Перейти</a>
      </div>
      <div className="pmrk-td" style={{ flex: 0.3, justifyContent: 'flex-end', display: 'flex' }}>→</div>
    </div>
  );

  return (
    <SectionCard title="Претензионно-исковая работа" extra={<DateActuality date={c.asOf.legal} source="КЮРАСАО 2.0" />}>
      <div style={{ marginBottom: 14 }}>
        <Segmented value={sec} onChange={setSec} items={SECTIONS.map((s) => ({ key: s.key, label: s.label, count: s.count }))} />
      </div>

      {sec === 'claims' && (legal.claims.length ? (
        <div className="pmrk-table">
          <div className="pmrk-table__head"><div className="pmrk-th" style={{ flex: 1.8 }}>Заявитель / предмет</div><div className="pmrk-th" style={{ flex: 1 }}>Статус</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Сумма</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Удовлетворено</div><div className="pmrk-th" style={{ flex: 1 }}>Данные КЮРАСАО 2.0</div><div className="pmrk-th" style={{ flex: 0.3 }} /></div>
          {legal.claims.map((x) => <Row key={x.id} onClick={() => openClaim(x)} cols={[<div><b>{x.applicant}</b><div className="pmrk-muted" style={{ fontSize: 11 }}>{x.subject}</div></div>, <StatusBadge status={x.status} />, <span className="pmrk-tnum">{moneyCompact(x.total)}</span>, <span className="pmrk-tnum">{moneyCompact(x.satisfied)}</span>]} />)}
        </div>
      ) : <EmptyState text="Выставленных претензий нет." />)}

      {sec === 'lawsuits' && (legal.lawsuits.length ? (
        <div className="pmrk-table">
          <div className="pmrk-table__head"><div className="pmrk-th" style={{ flex: 1.8 }}>Истец / № дела</div><div className="pmrk-th" style={{ flex: 1 }}>Инстанция</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Сумма иска</div><div className="pmrk-th" style={{ flex: 1 }}>Заседание</div><div className="pmrk-th" style={{ flex: 1 }}>Данные КЮРАСАО 2.0</div><div className="pmrk-th" style={{ flex: 0.3 }} /></div>
          {legal.lawsuits.map((x) => <Row key={x.id} onClick={() => openLawsuit(x)} cols={[<div><b>{x.plaintiff}</b><div className="pmrk-muted" style={{ fontSize: 11 }}>{x.caseNo}</div></div>, <span style={{ fontSize: 12 }}>1-я инстанция</span>, <span className="pmrk-tnum">{moneyCompact(x.currentClaim)}</span>, dateRu(x.nextHearing)]} />)}
        </div>
      ) : <EmptyState text="Судебных дел нет." />)}

      {sec === 'enforcement' && (legal.enforcement.length ? (
        <div className="pmrk-table">
          <div className="pmrk-table__head"><div className="pmrk-th" style={{ flex: 1.8 }}>Взыскатель / дело</div><div className="pmrk-th" style={{ flex: 1 }}>Исп. лист</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Сумма</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Получено</div><div className="pmrk-th" style={{ flex: 1 }}>Данные КЮРАСАО 2.0</div><div className="pmrk-th" style={{ flex: 0.3 }} /></div>
          {legal.enforcement.map((x) => <Row key={x.id} onClick={() => openEnf(x)} cols={[<div><b>{x.claimant}</b><div className="pmrk-muted" style={{ fontSize: 11 }}>{x.caseName}</div></div>, x.writSerial, <span className="pmrk-tnum">{moneyCompact(x.sumByDoc)}</span>, <span className="pmrk-tnum">{moneyCompact(x.received)}</span>]} />)}
        </div>
      ) : <EmptyState text="Исполнительных производств нет." />)}

      {sec === 'bankruptcy' && (legal.bankruptcy.length ? (
        <div className="pmrk-table">
          <div className="pmrk-table__head"><div className="pmrk-th" style={{ flex: 1.8 }}>Кредитор / дело</div><div className="pmrk-th" style={{ flex: 1 }}>Стадия</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Требования</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Исполнено</div><div className="pmrk-th" style={{ flex: 1 }}>Данные КЮРАСАО 2.0</div><div className="pmrk-th" style={{ flex: 0.3 }} /></div>
          {legal.bankruptcy.map((x) => <Row key={x.id} onClick={() => openBank(x)} cols={[<div><b>{x.creditor}</b><div className="pmrk-muted" style={{ fontSize: 11 }}>{x.caseName}</div></div>, <StatusBadge status={x.stage} />, <span className="pmrk-tnum">{moneyCompact(x.claimInRegistry)}</span>, <span className="pmrk-tnum">{moneyCompact(x.execution)}</span>]} />)}
        </div>
      ) : <EmptyState text="Банкротных дел нет." />)}

      {/* Детальная карточка */}
      <Modal isOpen={!!detail} onClickOutside={() => setDetail(null)} onEsc={() => setDetail(null)}>
        {detail && (
          <div style={{ padding: 20, width: 560, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, position: 'sticky', top: -20, background: 'var(--color-bg-default)', paddingTop: 4 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{detail.title}</h3>
              <Button size="xs" view="clear" label="✕" onClick={() => setDetail(null)} />
            </div>
            <KeyValue cols={1} items={detail.items} />
          </div>
        )}
      </Modal>

      {/* Уведомление о доступах КЮРАСАО 2.0 */}
      <Modal isOpen={curacao} onClickOutside={() => setCuracao(false)} onEsc={() => setCuracao(false)}>
        <div style={{ padding: 22, width: 440, maxWidth: '92vw' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Переход в систему КЮРАСАО 2.0</h3>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 16 }}>Для перехода в систему КЮРАСАО 2.0 необходимо получить соответствующие доступы (через СУИД). При наличии доступов вы будете перенаправлены в систему.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button size="s" view="ghost" label="Закрыть" onClick={() => setCuracao(false)} />
            <Button size="s" label="Перейти в КЮРАСАО 2.0" onClick={() => setCuracao(false)} />
          </div>
        </div>
      </Modal>
    </SectionCard>
  );
}

/** Крупная цифра + мельче единица измерения рядом — числовое значение выделено
    размером, а не вся строка целиком («млрд ₽» остаётся вспомогательным текстом). */
function MoneyValue({ amount }: { amount: number }) {
  if (!amount) return <>—</>;
  const { value, unit } = moneyCompactParts(amount);
  return (
    <>
      {/* Кегль цифры +50% к прежнему (28 → 42) по прямому запросу; единица
          измерения увеличена пропорционально, чтобы соотношение сохранилось. */}
      <span style={{ fontSize: 42, fontWeight: 800 }}>{value}</span>
      <span style={{ fontSize: 21, fontWeight: 600, marginLeft: 6, color: 'var(--color-typo-secondary)' }}>{unit}</span>
    </>
  );
}

function CreditLimitTab({ c }: { c: Counterparty }) {
  const doLimits = useMemo(() => buildCreditLimitsByDo(c), [c.uid]);
  // Совокупный КЛ группы — не отдельный агрегат, а сумма поля «Лимит» из таблицы
  // «Утверждённые кредитные лимиты аффилированных лиц» ниже: значение и расчёт
  // всегда согласованы по построению, а не «случайно совпадают».
  const groupAggregateLimit = useMemo(() => doLimits.reduce((sum, row) => sum + row.amountRub, 0), [doLimits]);
  // Действующий КЛ — тоже из этой таблицы, но только по лимитам с непросроченным
  // сроком действия (Действительность = Да): сколько группа реально может выбрать
  // прямо сейчас, в отличие от совокупного КЛ — общей утверждённой ёмкости.
  const activeLimit = useMemo(() => activeCreditLimit(doLimits), [doLimits]);
  // % использования — доля действующего КЛ от совокупного КЛ группы, а не отдельный
  // мок-показатель: те же два числа выше, просто как отношение.
  const utilizationPct = groupAggregateLimit > 0 ? (activeLimit / groupAggregateLimit) * 100 : 0;
  return (
    <SectionCard title="Утверждённые совокупные кредитные лимиты по ГК Газпром-нефть" extra={<DateActuality date={c.asOf['credit-limit']} source="limit-workflow" />}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,auto)', gap: '8px 28px', alignItems: 'stretch' }}>
        {/* Числовое значение выделено размером через MoneyValue (крупная цифра +
            мельче единица) — .pmrk-stat__value центрирует его по вертикали между
            подписью и сноской даты (эффект виден только при растянутой карточке). */}
        <Stat label="Действующий КЛ" value={<MoneyValue amount={activeLimit} />} asOf={c.asOf['credit-limit']} calcLabel="обновлено" calcSource="сумма непросроченных по таблице" />
        <Stat label="Совокупный КЛ группы" value={<MoneyValue amount={groupAggregateLimit} />} asOf={c.asOf['credit-limit']} calcSource="сумма по таблице ниже" />
        {/* Та же обводка и расположение заголовка, что у Stat («Действующий КЛ»
            и т.д.) — подпись сверху, содержимое (пончик) центрировано между ней
            и сноской, как и в двух карточках рядом. */}
        <div className="pmrk-stat">
          <div className="pmrk-stat__label">% использования</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <Gauge value={utilizationPct / 100} color={utilizationPct > 85 ? 'var(--pmrk-risk-4)' : utilizationPct > 60 ? 'var(--pmrk-risk-3)' : 'var(--pmrk-risk-1)'} />
          </div>
          <div className="pmrk-stat__stamp"><CalcStamp date={c.asOf['credit-limit']} source="действующий КЛ / совокупный КЛ" /></div>
        </div>
      </div>
      {utilizationPct > 85 && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--pmrk-risk-4)' }}>⚠ Лимит выбран более чем на 85% — запас исчерпан, рекомендуется пересмотр.</div>}

      {/* Распределение совокупного КЛ по ДО ГК ГПН, работающим с контрагентом
          (реестр «Кредитные лимиты», ФТ-1.7) — раскладка тех же агрегатов выше. */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-bg-border)' }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}>Утверждённые кредитные лимиты аффилированных лиц по ГК Газпром-нефть</div>
        {doLimits.length === 0 ? (
          <EmptyState text="Действующих лимитов по ДО нет — заявка на открытие КЛ не подавалась или отклонена." />
        ) : (
          <div className="pmrk-table">
            <div className="pmrk-table__head">
              <div className="pmrk-th" style={{ flex: 1.5 }}>Название</div>
              <div className="pmrk-th" style={{ flex: 0.9 }}>ИНН</div>
              <div className="pmrk-th" style={{ flex: 1.2 }}>Сегмент</div>
              <div className="pmrk-th" style={{ flex: 0.9, justifyContent: 'flex-end' }}>Лимит</div>
              <div className="pmrk-th" style={{ flex: 0.7, justifyContent: 'flex-end' }}>Отсрочка</div>
              <div className="pmrk-th" style={{ flex: 1.1 }}>Коллегиальный орган</div>
              <div className="pmrk-th" style={{ flex: 1 }}>Реквизиты документа</div>
              <div className="pmrk-th" style={{ flex: 1.1 }}>Действительность</div>
              <div className="pmrk-th" style={{ flex: 0.9 }}>Обеспечение</div>
              <div className="pmrk-th" style={{ flex: 1 }}>Комментарии по обеспечению</div>
            </div>
            {doLimits.map((row, i) => {
              const active = isDoLimitActive(row);
              return (
                <div key={i} className="pmrk-tr" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                  <div className="pmrk-td" style={{ flex: 1.5, fontWeight: 600, whiteSpace: 'normal' }}>{row.subsidiary}</div>
                  <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9 }}>{row.subsidiaryInn}</div>
                  <div className="pmrk-td" style={{ flex: 1.2, whiteSpace: 'normal' }}>{row.segment}</div>
                  <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(row.amountRub)}</div>
                  <div className="pmrk-td pmrk-tnum" style={{ flex: 0.7, justifyContent: 'flex-end', display: 'flex' }}>{row.deferralDays} дн.</div>
                  <div className="pmrk-td" style={{ flex: 1.1, whiteSpace: 'normal' }}>{row.approvalBody}</div>
                  <div className="pmrk-td" style={{ flex: 1, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{row.documentRef}</div>
                  <div className="pmrk-td" style={{ flex: 1.1, whiteSpace: 'normal' }}>
                    <span style={{ color: active ? 'var(--pmrk-risk-1)' : 'var(--pmrk-risk-4)', fontWeight: 600, fontSize: 12 }}>{active ? 'Да' : 'Нет'}</span>
                    <div className="pmrk-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{dateRu(row.startDate)} – {dateRu(row.endDate)}</div>
                  </div>
                  <div className="pmrk-td pmrk-muted" style={{ flex: 0.9, whiteSpace: 'normal' }}>{row.collateral}</div>
                  <div className="pmrk-td pmrk-muted" style={{ flex: 1, whiteSpace: 'normal' }}>—</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function DiscussionTab() {
  return (
    <SectionCard title="Обсуждение">
      <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--color-bg-border)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-bg-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>СЕ</div>
        <div>
          <div style={{ fontSize: 13 }}><a href="#" onClick={(e) => e.preventDefault()} style={{ color: 'var(--color-typo-brand)' }}>Соколова Е.В.</a> · 12.06.2026</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>Запросил у исполнителя свежую отчётность и пояснения по росту ПДЗ. До получения — лимит на ручном контроле.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input placeholder="Добавить комментарий…" style={{ flex: 1, height: 36, padding: '0 12px', border: '1px solid var(--color-bg-border)', borderRadius: 8, background: 'var(--color-bg-default)', outline: 'none', color: 'var(--color-typo-primary)' }} />
        <Button size="s" label="Отправить" />
      </div>
    </SectionCard>
  );
}

function AdvanceLimitTab({ c }: { c: Counterparty }) {
  const navigate = useNavigate();
  const hasAdvance = c.assessments.some((a) => a.direction === 'ADVANCE') || c.uid === 'cp-yugtrans';
  return (
    <SectionCard title="Лимит авансирования" extra={<DateActuality date={c.asOf['credit-limit']} source="scoring" />}>
      {hasAdvance ? (
        <div className="pmrk-table">
          <div className="pmrk-table__head"><div className="pmrk-th" style={{ flex: 1 }}>Заявка</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Лимит авансирования</div><div className="pmrk-th" style={{ flex: 1 }}>Дата</div><div className="pmrk-th" style={{ flex: 1 }}>Статус</div></div>
          <div className="pmrk-tr" style={{ cursor: 'default' }}>
            <div className="pmrk-td" style={{ flex: 1, fontWeight: 600 }}>ЛА-2026-0142</div>
            <div className="pmrk-td pmrk-tnum" style={{ flex: 1, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(c.creditLimit || 60_000_000)}</div>
            <div className="pmrk-td" style={{ flex: 1 }}>25.05.2026</div>
            <div className="pmrk-td" style={{ flex: 1 }}><StatusBadge status="Утверждено" /></div>
          </div>
        </div>
      ) : (
        <EmptyState text="По контрагенту нет заявок на расчёт лимита авансирования." action={<Button size="xs" view="secondary" label="Создать заявку" onClick={() => navigate('/assessments/new?direction=ADVANCE')} />} />
      )}
    </SectionCard>
  );
}

function ProfileProtocolsTab({ c }: { c: Counterparty }) {
  const navigate = useNavigate();
  const has = c.group <= 2 || c.uid === 'cp-sibur';
  return (
    <SectionCard title="Протоколы" extra={<DateActuality date={c.asOf['credit-limit']} source="limit-workflow" />}>
      {has ? (
        <div className="pmrk-route">
          <div className="pmrk-route__step pmrk-route__step--upcoming" style={{ cursor: 'pointer' }} onClick={() => navigate('/protocols')}>
            <div className="pmrk-route__num">Протокол</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>№ 18 · Кредитный комитет ДО</div>
            <div className="pmrk-muted" style={{ fontSize: 11 }}>16.05.2026 · решение по КЛ</div>
          </div>
          <div className="pmrk-route__step pmrk-route__step--done">
            <div className="pmrk-route__num">Результат</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>КЛ {moneyCompact(c.creditLimit)}</div>
            <div className="pmrk-muted" style={{ fontSize: 11 }}>утверждён</div>
          </div>
        </div>
      ) : (
        <EmptyState text="Контрагент не фигурирует в протоколах коллегиальных органов." />
      )}
    </SectionCard>
  );
}

function SimpleTab({ title, text, asOf }: { title: string; text: string; asOf?: string }) {
  return (
    <SectionCard title={title} extra={asOf ? <DateActuality date={asOf} /> : undefined}>
      <EmptyState text={text} />
    </SectionCard>
  );
}

// Синтетическая серия ДЗ для сгенерированных карточек без детальных данных
function synthDebt(c: Counterparty) {
  const base = c.revenue * 0.02;
  const pdzRate = c.group === 1 ? 0.02 : c.group === 2 ? 0.05 : c.group === 3 ? 0.16 : 0.5;
  return monthLabels(12).map((_, i) => ({
    date: '',
    dz: Math.round(base * (0.85 + 0.3 * (i / 11))),
    pdz: Math.round(base * (0.85 + 0.3 * (i / 11)) * pdzRate * (0.5 + i / 11)),
    advance: Math.round(base * 0.2),
    payable: Math.round(base * 0.6),
  }));
}
