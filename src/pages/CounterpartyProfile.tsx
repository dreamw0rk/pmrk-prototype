import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { IconFavoriteStroked } from '@consta/icons/IconFavoriteStroked';
import { IconFavoriteFilled } from '@consta/icons/IconFavoriteFilled';
import { IconRing } from '@consta/icons/IconRing';
import { IconDownload } from '@consta/icons/IconDownload';
import { IconConnection } from '@consta/icons/IconConnection';
import { IconSearchStroked } from '@consta/icons/IconSearchStroked';
import { useApp } from '@/app/AppContext';
import { useSetPageMeta } from '@/app/PageMeta';
import { can } from '@/shared/roles';
import {
  GroupBadge, RbIndicator, SanctionBadge, RnpUnscrupulous, StatusBadge, DateActuality, SectionCard, KeyValue, Stat,
  EmptyState, AuditFooter, severityColor, SEVERITY_LABEL, CalcStamp, Segmented, SimpleOverlay,
} from '@/shared/ui/kit';
import { AiSummaryCard } from '@/shared/ui/AiSummaryCard';
import iconPdf from '@/assets/icons/icon-pdf.png';
import { DebtChart, GroupDynamicsChart } from '@/shared/ui/MiniChart';
import { AffiliationDiagram, describeShare, highRiskInfo, DIRECTOR_COLOR, HIGH_RISK_COLOR, type DiagramFilters } from '@/shared/ui/AffiliationDiagram';
import { AFFILIATION_KINDS } from '@/shared/mock/affiliationKinds';
import { BY_UID, GRAPHS, LIMIT_REQUESTS, groupLabel, NOW, BLOCKS, type BlockCode } from '@/shared/mock/data';
import { AI_SUMMARY, AI_GROUP_RISK, SCORE_EXPLAIN } from '@/shared/mock/ai';
import { useMockQuery } from '@/shared/mock/useMockQuery';
import { buildExternal, rbSignal, type Indicator } from '@/shared/mock/external';
import { buildLegal } from '@/shared/mock/legal';
import { buildCreditLimitsByDo, isDoLimitActive, affiliatedCreditLimit } from '@/shared/mock/creditLimits';
import { buildDoLinks, type DoLink } from '@/shared/mock/subsidiaries';
import { buildAdditionalOkveds, activityKind } from '@/shared/mock/okved';
import { buildNameChanges } from '@/shared/mock/nameHistory';
import { buildStatements } from '@/shared/mock/statements';
import { exportAssessmentToExcel } from '@/shared/mock/assessmentExport';
import { buildIfrsStatements, defaultIfrsLines, getIfrsEntries, saveIfrsEntry, deleteIfrsEntry, type IfrsEntry } from '@/shared/mock/ifrs';
import { IfrsEntryModal } from '@/shared/ui/IfrsEntryModal';
import { IconAdd } from '@consta/icons/IconAdd';
import { buildDzKzTable, buildDzKzContractDetail, exportDzKzToExcel, MONTH_NAMES, shortDoLabel, type DzKzContractDetail } from '@/shared/mock/dzKzMatrix';
import { buildInteractionInfo } from '@/shared/mock/interaction';
import { buildAssessment, assessmentExtras, creditIndicators, claimsSummary, type Direction as AssessDirection, type ScoreBlock } from '@/shared/mock/assessment';
import type { Counterparty, AffiliationNode, NewsSource } from '@/shared/mock/types';
import { dateRu, money, moneyCompact, moneyCompactText, pct, inn as fmtInn } from '@/shared/format';

/* hidden — вкладка убрана из навигации карточки, но остаётся в коде вместе с
   содержимым (TabContent) — чтобы вернуть её, достаточно снять флаг. */
interface TabDef { key: string; label: string; cap?: Parameters<typeof can>[1]; hidden?: boolean; }
const TABS: TabDef[] = [
  { key: 'general', label: 'Общие сведения' },
  { key: 'external', label: 'Внешняя информация' },
  { key: 'affiliation', label: 'Аффилированность' },
  { key: 'debt', label: 'Данные по ДЗ и КЗ' },
  { key: 'statements', label: 'Отчётность' },
  { key: 'assessment', label: 'Оценка' },
  { key: 'news', label: 'Новости' },
  { key: 'security', label: 'Информация СБ', cap: 'viewSecurityTab' },
  { key: 'special-control', label: 'Под особым контролем', hidden: true },
  { key: 'legal', label: 'Претензионно-исковая работа' },
  { key: 'credit-limit', label: 'Кредитный лимит', cap: 'viewLimitSection' },
  { key: 'discussion', label: 'Обсуждение' },
  { key: 'advance-limit', label: 'Лимит авансирования', hidden: true },
  { key: 'protocols', label: 'Протоколы', cap: 'viewProtocols' },
];

const monthLabels = (n = 12) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() - (n - 1 - i), 1);
    return d.toLocaleDateString('ru-RU', { month: 'short' });
  });

/** Даты точек графиков ДЗ/КЗ, как в исходной системе: каждая точка — на
    последний день месяца (30.09.2025, 31.10.2025 …), последняя — на дату
    актуальности данных (asOf), а не на конец её месяца. */
const debtDateLabels = (n: number, asOf: string) => {
  const end = new Date(asOf);
  return Array.from({ length: n }, (_, i) => {
    if (i === n - 1) return dateRu(asOf);
    const monthEnd = new Date(Date.UTC(end.getFullYear(), end.getMonth() - (n - 1 - i) + 1, 0));
    return dateRu(monthEnd.toISOString().slice(0, 10));
  });
};

/** Отчёты по контрагенту (ФТ-1.16…1.19) — плитки в шапке профиля. Путь строится
    как `/report/{uid}{to}`, поэтому у «Профиля контрагента» to пустой. */
const REPORT_TILES = [
  { to: '/egrul', label: 'Скачать выписку\nиз ЕГРЮЛ/ЕГРИП', title: 'Сформировать и скачать выписку из ЕГРЮЛ/ЕГРИП, .pdf (ФТ-1.16)' },
  { to: '', label: 'Скачать отчет\n«Профиль\nконтрагента»', title: 'Сформировать и скачать отчет «Профиль контрагента», .pdf (ФТ-1.17)' },
  { to: '/spark', label: 'Скачать\nрасширенный отчет\n«СПАРК-Профиль»', title: 'Сформировать и скачать расширенный отчет «СПАРК-Профиль», .pdf (ФТ-1.18)' },
  { to: '/spark-risks', label: 'Скачать отчет\n«СПАРК-Риски»', title: 'Сформировать и скачать отчет «СПАРК-Риски», .pdf (ФТ-1.19)' },
];

export function CounterpartyProfile() {
  const { uid = '', tab = 'general' } = useParams();
  const navigate = useNavigate();
  const { role, aiOn, skin } = useApp();
  const c = BY_UID.get(uid);
  const [fav, setFav] = useState(['cp-balt', 'cp-sibur', 'cp-rnsnab'].includes(uid));
  const [subscribed, setSubscribed] = useState(false);
  // Тень у «липкой» шапки появляется только когда под неё уезжает контент:
  // в верхнем положении она была бы декоративной, а при скролле показывает,
  // что карточки проходят под панелью, а не обрываются.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const scroller = document.querySelector('.pmrk-content');
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > 4);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [uid]);

  // В скине СФК топбар оболочки прокручивается вместе со страницей, поэтому
  // название контрагента живёт в «липкой» шапке профиля (как в ПМРК1), а в
  // топбаре — только хлебные крошки (пустой title гасит заголовок топбара).
  useSetPageMeta({
    title: '',
    breadcrumbs: [{ label: 'Реестр контрагентов', to: '/registry' }, ...(c ? [{ label: c.shortName }] : [])],
  });

  const visibleTabs = TABS.filter((t) => !t.hidden && (!t.cap || can(role, t.cap)));

  if (!c) {
    return (
      <div className="pmrk-page">
        <EmptyState title="Контрагент не найден" text="Проверьте ссылку или вернитесь в реестр." action={<Button size="s" label="В реестр" onClick={() => navigate('/registry')} />} />
      </div>
    );
  }

  const summary = AI_SUMMARY[uid];

  /* Кнопки самой карточки — рядом с названием контрагента: это действия над
     контрагентом, а не над разделом, и у заголовка они не растягивают шапку по
     высоте (в правой колонке они стояли над панелью отчётов и разводили колонки). */
  const cardActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
      <Button size="s" view={fav ? 'primary' : 'ghost'} onlyIcon iconLeft={(fav ? IconFavoriteFilled : IconFavoriteStroked) as never} onClick={() => setFav((v) => !v)} title="В избранное" />
    </div>
  );

  // CTA «Подписаться» — в шапке профиля, сразу под строкой чипов состояния
  // («Действующее» / «Особый контроль» / «Под санкциями»): это действие над
  // контрагентом в целом, поэтому оно в шапке и видно на всех вкладках. Ширину
  // кнопке задаёт колонка-обёртка ниже (по ряду чипов) — width:full растягивает
  // её ровно на эту ширину.
  const subscribeAction = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button size="s" width="full" style={{ flex: 1, minWidth: 0 }} view={subscribed ? 'primary' : 'secondary'} label={subscribed ? 'Вы подписаны' : 'Подписаться на уведомления по контрагенту'} iconLeft={IconRing as never} onClick={() => setSubscribed((v) => !v)} />
      {subscribed && (
        <span title='Ранее Вы уже подписались на уведомления по всем контрагентам Блока/БЕ или ДО. Изменить/отменить подписку по контрагентам можно в разделе «Мои оповещения»' style={{ color: 'var(--color-typo-secondary)', cursor: 'help', fontSize: 14, flex: 'none' }}>ⓘ</span>
      )}
    </div>
  );

  return (
    <>
      {/* Шапка профиля — «липкая» панель во всю ширину рабочей области: она
          вынесена из .pmrk-page, потому что страница центрирована с max-width и
          внутри неё full-bleed не получить (прежние отрицательные поля давали
          белые «уши» по краям). Панель прилегает к топбару, а содержимое внутри
          выравнивается по той же сетке, что и контент. Тень включается при
          скролле — когда карточки уезжают под панель. */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 3, width: '100%',
          background: 'var(--color-bg-default)',
          borderBottom: '1px solid var(--color-bg-border)',
          boxShadow: scrolled ? 'var(--pmrk-shadow-2)' : 'none',
          transition: 'box-shadow .15s',
        }}
      >
      {/* width: 100% — без него внутренняя обёртка сжималась по содержимому и
          шапка оказывалась уже колонки контента; maxWidth + margin auto держат
          её по центру. Ширина шапки — своя переменная (--pmrk-cp-header-max),
          независимая от колонки контента (--pmrk-content-max у .pmrk-page). */}
      <div style={{ width: '100%', maxWidth: 'var(--pmrk-cp-header-max)', margin: '0 auto', padding: '14px 8px 0' }}>
        {skin !== 'sfk' && (
          <div className="pmrk-breadcrumbs">
            <a onClick={() => navigate('/registry')} style={{ cursor: 'pointer' }}>Реестр контрагентов</a> / {c.shortName}
          </div>
        )}
        {/* flexWrap: на узком экране панель отчётов переносится под реквизиты,
            а не сжимает заголовок с бейджами до нечитаемого столбца. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 6px' }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                {c.name}
              </h1>
              {cardActions}
            </div>
            {/* реквизиты — одной строкой через точки-разделители: три блока
                почти одинакового веса делали шапку рыхлой, теперь это одна
                тихая подпись под названием. Статус и санкции сюда не выносим —
                они уже есть чипами ниже (StatusBadge / SanctionBadge), и текст
                в подписи их дублировал; источник статуса ушёл в подсказку чипа. */}
            <div style={{ fontSize: 12.5, color: 'var(--color-typo-secondary)', lineHeight: 1.5 }}>
              ИНН {fmtInn(c.inn)} · КПП {c.kpp} · ОГРН {c.ogrn}
            </div>
            {/* строка бейджей — только статус контрагента и санкции. Кредито-
                способность и Индекс РБ отсюда убраны: это риск-метрики, а не
                состояние контрагента, и в шапке они спорили со статусом за
                внимание. Обе остались там, где читаются в контексте: Индекс РБ —
                во «Внешней информации», группа со скорингом — в «Оценке». */}
            {/* Чипы состояния и кнопка «Подписаться» — в общей колонке-обёртке
                (inline-flex): она сжимается по ширине самого широкого ряда чипов,
                а кнопка ниже тянется ровно на ту же ширину — визуально один блок,
                кнопка не длиннее чипов. */}
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, marginTop: 10, maxWidth: '100%' }}>
              <div className="pmrk-cp-status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span title="Статус по данным СПАРК"><StatusBadge status={c.status} /></span>
                {c.specialControl && <StatusBadge status="Особый контроль" />}
                {c.underSanctions && <SanctionBadge />}
              </div>
              {subscribeAction}
            </div>
          </div>
          {/* Панель документов (ФТ-1.16…1.19) — четыре плитки в один ряд в правой
              колонке шапки. Оформление то же, что у «Действий» и «Дашбордов» на
              главной (рамка, радиус, брендовая иконка, подпись снизу): заливные
              кнопки здесь выбивались из языка интерфейса и перебивали CTA
              «Подписаться». Иконка слева, название в две строки справа — плитка
              остаётся низкой, и высота панели держится вровень с левой колонкой
              шапки, не растягивая её. Слово «Скачать» в названии — кнопка формирует
              файл, а не открывает раздел; полное название отчёта с форматом и
              номером ФТ — в подсказке. */}
          <div style={{ flex: '1 1 600px', minWidth: 520, maxWidth: 760 }}>
            {/* minHeight: 76 у плиток — компактные кнопки, текст (полное название
                отчёта) заполняет кнопку; на узком экране, где название не влезает
                в три строки, ряд кнопок вырастает по самой длинной подписи.
                Панель — не шире 760px: кнопки узкие, названия разбиты на
                2–3 строки явными переносами, как в макете. Четыре кнопки равной
                ширины: minmax(0, 1fr) — нижняя граница столбца 0, верхняя —
                равная доля контейнера. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              {REPORT_TILES.map((r) => {
                return (
                <button
                  key={r.to}
                  onClick={() => navigate(`/report/${c.uid}${r.to}`)}
                  title={r.title}
                  className="pmrk-clickable pmrk-report-tile"
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 76, minWidth: 0, textAlign: 'left', padding: '10px 12px', border: '1px solid var(--color-typo-brand)', borderRadius: 8, cursor: 'pointer' }}
                >
                  {/* PNG перекрашивается в фирменный цвет через CSS-маску:
                      альфа-канал картинки задаёт форму, заливка — цвет */}
                  <span
                    aria-hidden
                    style={{
                      width: 20, height: 20, flex: 'none', display: 'inline-block',
                      background: '#0071b2',
                      WebkitMaskImage: `url(${iconPdf})`, maskImage: `url(${iconPdf})`,
                      WebkitMaskSize: 'contain', maskSize: 'contain',
                      WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center', maskPosition: 'center',
                    }}
                  />
                  {/* переносы строк заданы в самом названии (\n) — как в макете */}
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, whiteSpace: 'pre' }}>{r.label}</div>
                </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Вкладки — навигация в несколько рядов (без бокового скролла),
            выбранная подсвечена фирменной заливкой */}
        <div className="pmrk-cptabs">
          {visibleTabs.map((t) => (
            <div
              key={t.key}
              onClick={() => navigate(`/counterparties/${uid}/${t.key}`)}
              className={tab === t.key ? 'pmrk-cptab pmrk-cptab--active' : 'pmrk-cptab'}
            >
              {t.label}
            </div>
          ))}
        </div>
      </div>
      </div>

      {/* контент вкладок — под «липкой» панелью, той же ширины, что и шапка
          (--pmrk-cp-header-max), а не общей колонки страниц: на широком экране
          разделы тянутся во всю рабочую область; боковые поля ужаты до 8px,
          чтобы серого по краям почти не оставалось */}
      <div className="pmrk-page" style={{ maxWidth: 'var(--pmrk-cp-header-max)', paddingLeft: 8, paddingRight: 8 }}>
        {/* AI-резюме сверху профиля (AI-2) — над содержимым вкладок (со скелетоном генерации) */}
        {aiOn && summary && <ProfileAiSummary uid={uid} summary={summary} />}

        <TabContent c={c} tab={tab} />

        <AuditFooter createdBy="SYSTEM" createdAt="2025-03-12" modifiedBy="Соколова Е.В." modifiedAt={c.asOf.general ?? '2026-06-14'} />
      </div>
    </>
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

/** Подраздел внутри карточки (не отдельная секция уровня вкладки) — сворачиваемый
    заголовок на прозрачном фоне с тонкой обводкой, в стиле шапки таблицы
    (.pmrk-th/.pmrk-muted), а не брендовая плашка: так подраздел не спорит по
    весу с заголовком самой SectionCard. */
function SubSection({ title, count, defaultOpen, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div style={{ marginTop: 16 }}>
      <div
        className="pmrk-clickable"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', padding: '10px 14px', borderRadius: 'var(--pmrk-radius)', border: '1px solid var(--color-bg-border)', background: 'transparent' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, color: 'var(--color-typo-primary)' }}>
          <span className="pmrk-muted" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block' }}>▸</span>
          {title}
        </span>
        {count != null && <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11 }}>{count}</span>}
      </div>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

/** «Дополнительные виды деятельности» (ЕГРЮЛ) — список кроме основного ОКВЭД
    (тот уже показан в «Общих сведениях»). Поиск — по частичному совпадению
    и с кодом, и с наименованием: код ищут по цифрам, наименование — по словам. */
function AdditionalOkvedsCard({ c }: { c: Counterparty }) {
  const okveds = useMemo(() => buildAdditionalOkveds(c), [c.uid]);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const filtered = query
    ? okveds.filter((o) => o.code.toLowerCase().includes(query) || o.name.toLowerCase().includes(query))
    : okveds;

  return (
    // тот же стиль подблока, что у «Изменений в наименовании…»: мягкая плашка
    // заголовка, таблица во всю карточку с липкой шапкой, счётчик — чипом в extra
    <div style={{ marginTop: 16 }}>
    <ExtAccordion
      title="Дополнительные виды деятельности"
      flush
      softHead
      extra={<span className="pmrk-chip" style={{ background: 'var(--color-bg-brand)', color: 'var(--color-bg-default)', fontSize: 11 }}>{okveds.length}</span>}
    >
      {/* строка поиска — полосой между заголовком подблока и шапкой таблицы,
          фон в цвет шапки таблицы (сливается с плашкой заголовка) */}
      <div style={{ padding: '10px 16px', background: '#f0f5fd' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', maxWidth: 420, border: '1px solid var(--color-bg-border)', borderRadius: 10, background: 'var(--color-bg-default)' }}>
          <IconSearchStroked size="xs" className="pmrk-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Код или наименование вида деятельности"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-typo-primary)' }}
          />
        </div>
      </div>

      <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible' }}>
        <div className="pmrk-table__head" style={{ position: 'static' }}>
          <div className="pmrk-th" style={{ flex: 0.6 }}>Код ОКВЭД</div>
          <div className="pmrk-th" style={{ flex: 2.4 }}>Вид деятельности</div>
        </div>
        {filtered.map((o) => (
          <div key={o.code} className="pmrk-tr" style={{ cursor: 'default' }}>
            <div className="pmrk-td pmrk-tnum" style={{ flex: 0.6 }}>{o.code}</div>
            <div className="pmrk-td" style={{ flex: 2.4, whiteSpace: 'normal' }}>{o.name}</div>
          </div>
        ))}
      </div>
      {!filtered.length && <EmptyState text="Ничего не найдено по запросу." />}
    </ExtAccordion>
    </div>
  );
}

/** «Изменения в наименовании и организационно-правовой форме» (ЕГРЮЛ) — история
    переименований/смены ОПФ. У большинства карточек изменений не было, тогда
    вместо таблицы — пояснение, а не пустой список. */
function NameChangesCard({ c }: { c: Counterparty }) {
  const changes = useMemo(() => buildNameChanges(c), [c.uid]);

  return (
    // тот же стиль подблока, что у «Расшифровки санкций»: мягкая плашка
    // заголовка, таблица во всю карточку с липкой шапкой; счётчик строк —
    // чипом в правой части заголовка (extra)
    <div style={{ marginTop: 16 }}>
    <ExtAccordion
      title="Изменения в наименовании и организационно-правовой форме"
      flush
      softHead
      extra={<span className="pmrk-chip" style={{ background: 'var(--color-bg-brand)', color: 'var(--color-bg-default)', fontSize: 11 }}>{changes.length}</span>}
    >
      {changes.length ? (
        <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible' }}>
          <div className="pmrk-table__head" style={{ position: 'static' }}>
            <div className="pmrk-th" style={{ flex: 0.7 }}>Дата изменений</div>
            <div className="pmrk-th" style={{ flex: 2.4 }}>Название</div>
            <div className="pmrk-th" style={{ flex: 0.8 }}>ИНН</div>
            <div className="pmrk-th" style={{ flex: 0.9 }}>ОГРН</div>
            <div className="pmrk-th" style={{ flex: 1.3 }}>Организационно-правовая форма (ОКОПФ)</div>
          </div>
          {changes.map((ch) => (
            <div key={ch.date} className="pmrk-tr" style={{ cursor: 'default' }}>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 0.7 }}>{dateRu(ch.date)}</div>
              <div className="pmrk-td" style={{ flex: 2.4, whiteSpace: 'normal' }}>{ch.name}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 0.8 }}>{ch.inn}</div>
              <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9 }}>{ch.ogrn}</div>
              <div className="pmrk-td" style={{ flex: 1.3, whiteSpace: 'normal' }}>{ch.okopf}</div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="По данным ЕГРЮЛ наименование и организационно-правовая форма не менялись." />
      )}
    </ExtAccordion>
    </div>
  );
}

function GeneralTab({ c }: { c: Counterparty }) {
  // Состав ДО, работающих с контрагентом (ФТ-19.1). Контрагент почти всегда
  // работает с несколькими ДО, а управленчески они сворачиваются до блока —
  // БЛПС, БРД и т.д., поэтому список сгруппирован по блокам. Условия работы
  // (кредитный лимит, отсрочка, орган утверждения) здесь не выводятся: это
  // предмет вкладки «Кредитный лимит», дублировать их в общих сведениях незачем.
  const doLinks = useMemo(() => buildDoLinks(c), [c.uid]);
  const doGroups = useMemo(() => {
    const byBlock = new Map<string, DoLink[]>();
    doLinks.forEach((link) => {
      const key = link.block ?? '—';
      if (!byBlock.has(key)) byBlock.set(key, []);
      byBlock.get(key)!.push(link);
    });
    // Порядок групп — как в справочнике блоков (управленческий, не алфавитный);
    // ДО без блока (головная компания ГК в роли «ДО» у самой себя) — в конце.
    const order = Object.keys(BLOCKS);
    return [...byBlock.entries()]
      .sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99))
      .map(([block, items]) => ({
        block,
        blockName: BLOCKS[block as BlockCode] as string | undefined,
        items: [...items].sort((x, y) => Number(y.primary) - Number(x.primary) || x.subsidiary.localeCompare(y.subsidiary, 'ru')),
      }));
  }, [doLinks]);
  // Блоки с несколькими ДО в таблице свёрнуты в одну строку; раскрытые — здесь.
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(new Set());
  const toggleBlock = (block: string) =>
    setOpenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(block)) next.delete(block); else next.add(block);
      return next;
    });

  const interaction = useMemo(() => buildInteractionInfo(c), [c.uid]);
  const pdHorizonLabel: Record<string, string> = { '30+ дней': '1 месяц', '90+ дней': '3 месяца', '180+ дней': '6 месяцев' };

  // Цветная точка перед значением — как на реальном портале у показателей
  // деловой репутации и негативной информации (зелёная/жёлтая/красная), а не
  // голый текст. «Наличие обеспечения» на портале — без точки, поэтому это
  // единственное булево поле блока без DotValue.
  const DotValue = ({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'neutral'; children: React.ReactNode }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="pmrk-dot" style={{ background: tone === 'good' ? 'var(--pmrk-risk-1)' : tone === 'warn' ? 'var(--pmrk-risk-3)' : tone === 'bad' ? 'var(--pmrk-risk-4)' : 'var(--color-typo-ghost)' }} />
      {children}
    </span>
  );
  const experienceTone = interaction.experience === 'более 3-х лет' ? 'good' : interaction.experience === 'от 1 до 3-х лет' ? 'warn' : 'bad';
  const disciplineTone = interaction.paymentDiscipline === 'Без нарушений' ? 'good' : interaction.paymentDiscipline === 'Единичные случаи возникновения ПДЗ' ? 'warn' : 'bad';
  const ratingTone = interaction.reviews.avgRating === 0 ? 'neutral' : interaction.reviews.avgRating >= 4 ? 'good' : interaction.reviews.avgRating >= 2.5 ? 'warn' : 'bad';

  return (
    <>
      <SectionCard title="Общие сведения" extra={<DateActuality date={c.asOf.general} source="СПАРК / ЕГРЮЛ" />}>
        <KeyValue
          cols={3}
          items={[
            { k: 'Полное наименование', v: c.name },
            { k: 'ИНН / КПП', v: `${fmtInn(c.inn)} / ${c.kpp}` },
            { k: 'ОГРН', v: c.ogrn },
            { k: 'Дата регистрации (возраст компании)', v: `${dateRu(c.registered)} (${NOW.getFullYear() - new Date(c.registered).getFullYear()})` },
            { k: 'Регион регистрации', v: c.region },
            { k: 'Адрес контрагента', v: c.address },
            { k: 'Организационно-правовая форма (ОКОПФ)', v: c.okopf },
            { k: 'Форма собственности', v: c.ownershipForm },
            { k: 'Рабочий сайт', v: c.website ?? 'Нет данных' },
            {
              k: 'Социальные сети',
              v: c.socials?.length ? (
                <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {c.socials.map((s, i) => (
                    <a key={i} href={`https://${s.url}`} target="_blank" rel="noreferrer" style={{ color: 'var(--color-typo-brand)' }}>{s.network}</a>
                  ))}
                </span>
              ) : 'Нет данных',
            },
            { k: 'Руководитель (должность)', v: c.director },
            { k: 'Размер предприятия', v: c.companySize },
            { k: 'Среднесписочная численность', v: `${c.employees} чел.` },
            { k: 'Налоговый режим', v: c.taxRegime },
            // код ОКВЭД и его расшифровка — отдельными полями: «Отрасль» —
            // название основного вида деятельности по ОКВЭД
            { k: 'Основной ОКВЭД', v: c.okvedCode },
            { k: 'Вид деятельности', v: activityKind(c) },
            { k: 'Отрасль', v: c.okved },
          ]}
        />

        {/* На реальном портале это подразделы той же «СВЕДЕНИЯ ИЗ ЕГРЮЛ»
            секции, а не отдельные карточки уровня вкладки. */}
        <AdditionalOkvedsCard c={c} />
        <NameChangesCard c={c} />
      </SectionCard>

      {/* «Взаимодействие контрагента с ГК Газпром нефть» (ФТ-19.1) — отдельный
          сворачиваемый блок, а не девятое поле карточки: объединяет статус
          работы с ГК, состав ДО (по блокам сводится управленческая отчётность,
          ФТ-22.3 «Блок → ДО → итог»), обеспечение/деловую репутацию и условия
          отсрочки платежа — как один непрерывный раздел на реальном портале.
          Раскрытым нужен не всем, отсюда сворачивание. */}
      <SectionCard
        collapsible
        title="Взаимодействие контрагента с ГК Газпром нефть"
        extra={<DateActuality date={c.asOf.general} source="справочник ДО ГК ГПН" />}
      >
        {/* Блок с несколькими ДО — одна сворачиваемая строка (по умолчанию свёрнута),
            под ней при раскрытии — ДО блока; блок с одним ДО — обычная строка */}
        <div className="pmrk-table">
          <div className="pmrk-table__head">
            <div className="pmrk-th" style={{ flex: 1 }}>Блок/КБЕ, с которыми работает контрагент</div>
            <div className="pmrk-th" style={{ flex: 1.4 }}>Наименование ДО</div>
          </div>
          {doGroups.map(({ block, blockName, items }) => {
            const blockLabel = blockName ? `${block} - ${blockName}` : 'Блок не определён';
            const doCell = (link: DoLink) => (
              <>
                {link.subsidiary}
                {/* основное ДО карточки — то самое значение поля «Работает с ДО» */}
                {link.primary && (
                  <span className="pmrk-chip" style={{ marginLeft: 8, background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11, fontWeight: 500 }}>основное</span>
                )}
              </>
            );
            if (items.length === 1) {
              return (
                <div key={block} className="pmrk-tr" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                  <div className="pmrk-td" style={{ flex: 1, whiteSpace: 'normal', fontSize: 12.5, fontWeight: 600, paddingLeft: 36 }}>{blockLabel}</div>
                  <div className="pmrk-td" style={{ flex: 1.4, fontWeight: 600, whiteSpace: 'normal' }}>{doCell(items[0])}</div>
                </div>
              );
            }
            const open = openBlocks.has(block);
            return (
              <Fragment key={block}>
                <div
                  className="pmrk-tr"
                  role="button"
                  tabIndex={0}
                  aria-expanded={open}
                  onClick={() => toggleBlock(block)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBlock(block); } }}
                  style={{ cursor: 'pointer', alignItems: 'flex-start' }}
                >
                  <div className="pmrk-td" style={{ flex: 1, whiteSpace: 'normal', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ width: 16, flex: '0 0 16px', color: 'var(--color-typo-secondary)', fontSize: 10, lineHeight: '18px', textAlign: 'center' }}>{open ? '▾' : '▸'}</span>
                    <span>{blockLabel}</span>
                  </div>
                  <div className="pmrk-td pmrk-muted" style={{ flex: 1.4, whiteSpace: 'normal', fontSize: 12.5 }}>
                    {open ? 'Свернуть' : `${items.length} ДО — развернуть`}
                    {!open && items.some((l) => l.primary) && (
                      <span className="pmrk-chip" style={{ marginLeft: 8, background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11, fontWeight: 500 }}>есть основное</span>
                    )}
                  </div>
                </div>
                {open && items.map((link) => (
                  <div key={link.subsidiary} className="pmrk-tr" style={{ cursor: 'default', alignItems: 'flex-start', background: 'var(--color-bg-secondary)' }}>
                    <div className="pmrk-td" style={{ flex: 1 }} />
                    <div className="pmrk-td" style={{ flex: 1.4, fontWeight: 600, whiteSpace: 'normal' }}>{doCell(link)}</div>
                  </div>
                ))}
              </Fragment>
            );
          })}
        </div>

        {/* Наличие обеспечения/негативной информации и показатели деловой
            репутации — на реальном портале это продолжение того же раздела
            «Взаимодействие с ГК», сразу после списка ДО, а не отдельная
            карточка. */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-bg-border)' }}>
          <KeyValue
            cols={2}
            items={[
              { k: 'Наличие обеспечения (признак)', v: interaction.hasCollateral ? 'Да' : 'Нет' },
              { k: 'Наличие негативной информации от службы безопасности', v: <DotValue tone={interaction.hasNegativeSecurityInfo ? 'bad' : 'good'}>{interaction.hasNegativeSecurityInfo ? 'Да' : 'Нет'}</DotValue> },
            ]}
          />
        </div>
        {/* Проверка авторизации сделок в рамках ЛФП (бывш. «Контроль ЛФП») — по регламенту КТ-555; два независимых признака */}
        <div style={{ marginTop: 16 }}>
          <ExtAccordion title="Проверка авторизации сделок с контрагентом в рамках ЛФП" softHead collapsible={false}>
            <KeyValue
              cols={2}
              items={[
                { k: 'По сумме договора и/или по отсрочке платежа', v: <DotValue tone={interaction.lfpContractControl ? 'warn' : 'neutral'}>{interaction.lfpContractControl ? 'Подлежит контролю в соответствии с КТ-555' : 'Не подлежит контролю в соответствии с КТ-555'}</DotValue> },
                { k: 'По сумме аванса', v: <DotValue tone={interaction.lfpAdvanceControl ? 'warn' : 'neutral'}>{interaction.lfpAdvanceControl ? 'Подлежит контролю в соответствии с КТ-555' : 'Не подлежит контролю в соответствии с КТ-555'}</DotValue> },
              ]}
            />
          </ExtAccordion>
        </div>
        <div style={{ marginTop: 16 }}>
          <ExtAccordion title="История деловых отношений с ГК ГПН" softHead collapsible={false}>
            <KeyValue
              cols={2}
              items={[
                { k: 'Опыт сотрудничества с ГК ГПН', v: <DotValue tone={experienceTone}>{interaction.experience}</DotValue> },
                { k: 'Платёжная дисциплина за последние 12 месяцев', v: <DotValue tone={disciplineTone}>{interaction.paymentDiscipline}</DotValue> },
              ]}
            />
          </ExtAccordion>
        </div>
      </SectionCard>

      {/* Внутренние рейтинги и оценки — на реальном портале общий заголовок
          раздела, внутри которого пока один источник (платформа «Мнения»),
          поэтому «Платформа деловых отзывов» — вложенный подзаголовок, а не
          самостоятельная карточка. */}
      <SectionCard collapsible title="Внутренние рейтинги и оценки" extra={<DateActuality date={c.asOf.general} source="mnenia.gazprom-neft.ru" />}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Мнения — платформа деловых отзывов</div>
        {/* cols=1 — «Виды деятельности» и «Регион» на портале это не короткие
            значения, а перечисление через запятую (все ОКВЭД контрагента,
            основной и дополнительные), в 3-колоночной сетке они бы дробились
            на узкие столбцы вместо переноса по всей ширине. Ссылка на
            платформу — не отдельной строкой, а в скобках при оценке. */}
        <KeyValue
          cols={1}
          items={[
            { k: 'Виды деятельности', v: interaction.reviews.activities },
            { k: 'Регион', v: interaction.reviews.region },
            {
              k: 'Средняя оценка по 5-балльной шкале',
              v: (
                <DotValue tone={ratingTone}>
                  {interaction.reviews.avgRating > 0 ? interaction.reviews.avgRating.toFixed(2).replace('.', ',') : 'Нет данных'}
                  {' ('}
                  <a href={interaction.reviews.link} target="_blank" rel="noreferrer" style={{ color: 'var(--color-typo-brand)' }}>Ссылка на платформу Мнения</a>
                  {')'}
                </DotValue>
              ),
            },
          ]}
        />
      </SectionCard>

      {/* Предиктивная аналитика (модель АГАТА) — та же величина, что в отчёте
          «Профиль контрагента» (c.pdForecast), но с горизонтом в месяцах,
          как на реальном портале, а не в днях. */}
      {c.pdForecast.length > 0 && (
        <SectionCard collapsible title="Предиктивная аналитика по модели машинного обучения ГПН" extra={<DateActuality date={c.asOf.general} source="модель АГАТА" />}>
          <KeyValue
            cols={3}
            items={c.pdForecast.map((p) => ({ k: `Вероятность возникновения ПДЗ на горизонте ${pdHorizonLabel[p.horizon] ?? p.horizon}`, v: `${p.pd}%` }))}
          />
        </SectionCard>
      )}

      {/* Список «Под особым контролем» — тот же признак, что на бейдже в шапке
          профиля и на одноимённой вкладке (там — карточка согласования
          включения/исключения), но здесь, как на портале, это плоский блок
          статуса: причина, комментарий и сведения из ЕФРСБ. */}
      <SectionCard collapsible title="Список «Под особым контролем»" extra={<DateActuality date={c.asOf['special-control'] ?? c.asOf.general} source="ПМРК" />}>
        <KeyValue
          cols={2}
          items={[
            { k: 'Под особым контролем', v: <DotValue tone={c.specialControl ? 'bad' : 'good'}>{c.specialControl ? 'Да' : 'Нет'}</DotValue> },
            { k: 'Причина', v: c.specialControl ? 'Внесено предложение о включении (КК Блока)' : '—' },
            { k: 'Комментарий', v: c.specialControl ? 'Согласование — КК-Блок / КК-УФК / АДМ; исключение — КК-УФК / АДМ.' : '—' },
            { k: 'Наличие сведений в Едином Федеральном реестре о банкротстве', v: c.status === 'Банкротство' ? 'Да' : 'Нет данных' },
            { k: 'Ссылка на карточку в Едином Федеральном реестре о банкротстве', v: c.status === 'Банкротство' ? <a href={`https://bankrot.fedresurs.ru/entity/${c.inn}`} target="_blank" rel="noreferrer" style={{ color: 'var(--color-typo-brand)' }}>{`bankrot.fedresurs.ru/entity/${c.inn}`}</a> : 'Нет данных' },
          ]}
        />
      </SectionCard>
    </>
  );
}

const extLevelColor = (l?: string) => (l === 'high' ? 'var(--pmrk-risk-4)' : l === 'medium' ? 'var(--pmrk-risk-3)' : l === 'low' ? 'var(--pmrk-risk-1)' : 'var(--color-typo-primary)');
/* для значения, окрашенного целиком (без точки): светофорный жёлтый текстом не читается */
const extLevelTextColor = (l?: string) => (l === 'medium' ? 'var(--pmrk-risk-3-text)' : extLevelColor(l));

/* Иконки индикаторов СПАРК. Стилистика источника: показатель — круговая шкала,
   значение крупной цифрой в центре, дуга заполнения поверх тонкой серой дорожки,
   цвет — по зоне риска (зелёная / жёлтая / красная). Уровневые показатели
   (значение «Низкий / Средний / Высокий», а не число) в СПАРК рисуются светофором,
   поэтому кольцо у них разбито на три равных сегмента: активный залит цветом
   уровня, соседние остаются серыми — видно и текущий уровень, и шкалу целиком. */

/** Дуга кольца через strokeDasharray: circle начинается в 3 часа и идёт по часовой,
    поэтому положение задаётся поворотом, а длина — долей окружности. Так дуга
    рисуется одним примитивом, без ручного расчёта путей. */
function RingArc({ r, c, from, sweep, color, width, round = true }: { r: number; c: number; from: number; sweep: number; color: string; width: number; round?: boolean }) {
  const len = 2 * Math.PI * r;
  const arc = (len * sweep) / 360;
  return (
    <circle
      cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={width}
      strokeLinecap={round ? 'round' : 'butt'}
      strokeDasharray={`${arc} ${len - arc}`}
      transform={`rotate(${from} ${c} ${c})`}
    />
  );
}

/** Числовая шкала (ИДО, ИПД): разомкнутое снизу кольцо на 270°, заполнение — доля
    значения от максимума шкалы, число крупно в центре, диапазон подписью снизу. */
function SparkGauge({ value, max, color, size = 48 }: { value: number; max: number; color: string; size?: number }) {
  const c = 50;
  const r = 40;
  const frac = Math.max(0, Math.min(1, value / max));
  const digits = String(value).length;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flex: 'none' }} aria-hidden>
      <RingArc r={r} c={c} from={135} sweep={270} color="var(--color-bg-border)" width={9} />
      {frac > 0 && <RingArc r={r} c={c} from={135} sweep={270 * frac} color={color} width={9} />}
      <text x={c} y={c} textAnchor="middle" dominantBaseline="central" fontSize={digits > 2 ? 26 : 30} fontWeight={700} fill={color}>{value}</text>
    </svg>
  );
}

/** Уровневая шкала (сводный риск, ИФР): три сегмента кольца — низкий, средний,
    высокий; активный залит цветом уровня. Порядок сегментов по часовой стрелке
    от левого нижнего, как ступени светофора: сегмент активного уровня подсказывает
    не только «какой риск», но и «насколько далеко до соседних». */
function SparkLevelRing({ level, color, size = 48 }: { level: 'low' | 'medium' | 'high'; color: string; size?: number }) {
  const c = 50;
  const r = 40;
  const active = level === 'low' ? 0 : level === 'medium' ? 1 : 2;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flex: 'none' }} aria-hidden>
      {/* сегменты от 153° по часовой: разрыв приходится ровно на низ кольца.
          Активный сегмент чуть толще соседних — уровень читается и без цвета */}
      {[0, 1, 2].map((i) => (
        <RingArc
          key={i}
          r={r} c={c}
          from={153 + i * 84}
          sweep={66}
          color={i === active ? color : 'var(--color-bg-border)'}
          width={i === active ? 11 : 8}
        />
      ))}
      {/* «лампа» в центре — цвет активного уровня; словами уровень подписан под
          иконкой, поэтому внутрь кольца текст не дублируем */}
      <circle cx={c} cy={c} r={17} fill={color} opacity={0.14} />
      <circle cx={c} cy={c} r={10} fill={color} />
    </svg>
  );
}

/** Шкалы индикаторов раздела «1. Финансовые индикаторы риска СПАРК»: числовые
    показатели — с максимумом шкалы и её расшифровкой, уровневые — светофором.
    Индикаторы, которых здесь нет, выводятся обычной строкой с цветной точкой. */
const SPARK_SCALES: Record<string, { kind: 'level' } | { kind: 'gauge'; max: number }> = {
  'Сводный риск': { kind: 'level' },
  'Индекс финансового риска (ИФР)': { kind: 'level' },
  'Индекс должной осмотрительности (ИДО)': { kind: 'gauge', max: 99 },
  'Индекс платёжной дисциплины (ИПД)': { kind: 'gauge', max: 100 },
};

/** Словесная трактовка уровня — под кольцом карточек с числовой шкалой (ИДО,
    ИПД) выводится не легенда диапазона, а оценка значения теми же словами,
    что у «Сводного риска» и ИФР. */
const SPARK_LEVEL_WORD: Record<'low' | 'medium' | 'high', string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий' };

/** Визуальное представление значения индикатора в строке списка — цветная точка
    и значение. Крупные шкалы вынесены в сводку раздела (RiskSummaryList):
    в списке они дублировали бы её и растягивали строки. */
function IndicatorVisual({ ind, hideDot, left }: { ind: Indicator; hideDot?: boolean; left?: boolean }) {
  // значение-таблица «сумма | название»: две колонки вместо склеенного текста
  if (ind.rows) {
    return (
      <span style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 24, rowGap: 6, flex: left ? 1 : undefined, fontWeight: 400 }}>
        {ind.rows.map((r, k) => (
          <Fragment key={k}>
            <span className="pmrk-tnum" style={{ fontWeight: 600, textAlign: 'right' }}>{r.amount}</span>
            <span>{r.name}</span>
          </Fragment>
        ))}
      </span>
    );
  }
  return (
    // inline-flex, а не inline: у inline-элемента .pmrk-dot (width/height 8px)
    // не применялись размеры и точка была невидимой.
    // left — значение по левому краю (списки раздела «Внешняя информация»):
    // занимает свободную ширину строки, текст и переносы прижаты влево.
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: left ? 'flex-start' : 'flex-end', gap: 6, fontWeight: 600, color: ind.level && (ind.dot ?? !hideDot) ? 'var(--color-typo-primary)' : extLevelTextColor(ind.level), whiteSpace: 'pre-line', textAlign: left ? 'left' : 'right', flex: left ? 1 : undefined }}>
      {ind.level && (ind.dot ?? !hideDot) && <span className="pmrk-dot" style={{ background: extLevelColor(ind.level) }} />}
      {ind.value}
      {ind.link && (
        <a href={ind.link} target="_blank" rel="noreferrer" style={{ fontWeight: 400, color: 'var(--color-typo-brand)' }}>(ссылка)</a>
      )}
    </span>
  );
}

function IndRow({ ind, hideDot, left, noBorder, inline }: { ind: Indicator; hideDot?: boolean; left?: boolean; noBorder?: boolean; inline?: boolean }) {
  // inline — значение стоит вплотную к подписи слева («Под санкциями  ● Да»),
  // а не отдельной колонкой у другого края строки (обычный left).
  if (inline) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 0', borderBottom: noBorder ? 'none' : '1px solid var(--color-bg-border)', fontSize: 13 }}>
        <span>
          {ind.label}
          {ind.tip && <span title={ind.tip} style={{ marginLeft: 6, cursor: 'help', color: 'var(--color-typo-ghost)', fontSize: 12 }}>ⓘ</span>}
        </span>
        <IndicatorVisual ind={ind} hideDot={hideDot} />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: left ? 'flex-start' : 'center', gap: 12, padding: '8px 0', borderBottom: noBorder ? 'none' : '1px solid var(--color-bg-border)', fontSize: 13 }}>
      <span style={{ flex: 1 }}>
        {ind.label}
        {ind.tip && <span title={ind.tip} style={{ marginLeft: 6, cursor: 'help', color: 'var(--color-typo-ghost)', fontSize: 12 }}>ⓘ</span>}
      </span>
      <IndicatorVisual ind={ind} hideDot={hideDot} left={left} />
    </div>
  );
}

/** Иерархический вывод показателей. Группа первого уровня берётся из поля
    `ind.group`, а если его нет — из части метки до первого « · » (раздел
    «Внешние рейтинги и оценки»). Текст показателя (второй уровень) — часть
    метки после первого « · », либо вся метка, если разделителя нет. Первый
    уровень — плашка-заголовок с фоном шапки таблицы (.pmrk-table__head). */
function GroupedIndicators({ indicators, hideDot, left }: { indicators: Indicator[]; hideDot?: boolean; left?: boolean }) {
  const groups: { name: string; items: { sub: string; ind: Indicator }[] }[] = [];
  for (const ind of indicators) {
    const sep = ind.label.indexOf(' · ');
    const name = ind.group ?? (sep === -1 ? '—' : ind.label.slice(0, sep));
    const sub = sep === -1 ? ind.label : ind.label.slice(sep + 3);
    let group = groups.find((g) => g.name === name);
    if (!group) { group = { name, items: [] }; groups.push(group); }
    group.items.push({ sub, ind });
  }
  const hasCalcDate = indicators.some((x) => x.calcDate);
  return (
    <div style={{ border: '1px solid var(--color-bg-border)', borderRadius: 'var(--pmrk-radius-lg)', overflow: 'hidden', marginTop: 4 }}>
      {groups.map((g) => (
        <Fragment key={g.name}>
          <div className="pmrk-table__head" style={{ padding: '8px 12px', justifyContent: 'space-between', gap: 12 }}>
            <span>{g.name}</span>
            {/* дата актуальности источника группы — справа в плашке */}
            {g.items.find((x) => x.ind.groupAsOf)?.ind.groupAsOf && (
              <span style={{ fontWeight: 400, color: 'var(--color-typo-secondary)', whiteSpace: 'nowrap' }}>Информация актуальна на {dateRu(g.items.find((x) => x.ind.groupAsOf)!.ind.groupAsOf!)}</span>
            )}
          </div>
          {g.items.map(({ sub, ind }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: left ? 'flex-start' : 'center', gap: 12, padding: '8px 12px', borderBottom: i === g.items.length - 1 ? 'none' : '1px solid var(--color-bg-border)', fontSize: 13 }}>
              <span style={{ flex: 1 }}>
                {sub}
                {ind.tip && <span title={ind.tip} style={{ marginLeft: 6, cursor: 'help', color: 'var(--color-typo-ghost)', fontSize: 12 }}>ⓘ</span>}
              </span>
              <IndicatorVisual ind={ind} hideDot={hideDot} left={left} />
              {/* дата расчёта показателя — своя колонка фиксированной ширины у
                  правого края, чтобы даты стояли столбиком; колонка есть во всех
                  группах раздела, если дата есть хотя бы у одного показателя, —
                  иначе значения в группах с датой и без неё съезжали бы */}
              {hasCalcDate && (
                <span style={{ flex: 'none', width: 150, textAlign: 'right', fontSize: 12, color: 'var(--color-typo-secondary)', whiteSpace: 'nowrap' }}>
                  {ind.calcDate ? `Дата расчёта ${ind.calcDate}` : ''}
                </span>
              )}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

/** Одна ячейка сводки «Финансовые индикаторы риска СПАРК»: индикатор слева,
    справа в столбик полное наименование показателя и значение словом. Без рамки. */
function SparkIndicatorInline({ ind }: { ind: Indicator }) {
  const scale = SPARK_SCALES[ind.label];
  const color = extLevelColor(ind.level);
  const level = (ind.level ?? 'low') as 'low' | 'medium' | 'high';
  const numeric = Number(ind.value.split(' ')[0].replace(',', '.'));
  const word = scale?.kind === 'gauge' && Number.isFinite(numeric) ? SPARK_LEVEL_WORD[level] : ind.value;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ flex: 'none' }}>
        {scale && scale.kind === 'gauge' && Number.isFinite(numeric)
          ? <SparkGauge value={numeric} max={scale.max} color={color} />
          : <SparkLevelRing level={level} color={color} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--color-typo-secondary)', lineHeight: 1.3 }}>
          {ind.label}
          {ind.tip && <span title={ind.tip} style={{ marginLeft: 4, cursor: 'help', color: 'var(--color-typo-ghost)', fontSize: 11 }}>ⓘ</span>}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-typo-primary)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{word}</span>
      </div>
    </div>
  );
}

/** Сводка раздела «Финансовые индикаторы риска СПАРК» — показатели идут друг за
    другом равной ширины (грид 1fr), без рамок; у каждого индикатор слева,
    полное наименование и значение — справа в столбик. */
function RiskSummaryList({ indicators }: { indicators: Indicator[] }) {
  const cards = indicators.filter((ind) => SPARK_SCALES[ind.label]);
  if (cards.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: 24, padding: '14px 0 0' }}>
      {cards.map((ind, i) => <SparkIndicatorInline key={i} ind={ind} />)}
    </div>
  );
}

function ExtAccordion({ title, indicators, defaultOpen, beforeIndicators, hideList, hideDot, grouped, valueLeft, flush, softHead, extra, collapsible = true, children }: { title: string; indicators?: Indicator[]; defaultOpen?: boolean; beforeIndicators?: React.ReactNode; hideList?: boolean; hideDot?: boolean; grouped?: boolean; valueLeft?: boolean; flush?: boolean; softHead?: boolean; extra?: React.ReactNode; collapsible?: boolean; children?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  // collapsible={false} — тот же брендовый подблок, но без шеврона и клика:
  // содержимое всегда раскрыто (таблицы раздела «Аффилированность»).
  const isOpen = !collapsible || open;
  return (
    // flush — содержимое (таблица) занимает карточку целиком, без внутренних полей.
    <div className="pmrk-card" style={{ marginBottom: 8, overflow: 'hidden' }}>
      {/* заголовок раздела — те же классы, что и у шапки SectionCard: разделы
          «Внешней информации» это такие же разделы, и брендовая плашка должна
          быть у них общая, а не своя разметка со своими отступами */}
      <div
        className={`pmrk-card__head${collapsible ? ' pmrk-clickable' : ''}${softHead ? ' pmrk-card__head--soft' : ''}`}
        style={{ marginBottom: 0, cursor: collapsible ? 'pointer' : 'default' }}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
      >
        <div className="pmrk-card__title" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          {collapsible && (
            <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'currentColor', opacity: 0.8 }}>▸</span>
          )}
          {title}
        </div>
        {extra && <div onClick={(e) => e.stopPropagation()}>{extra}</div>}
      </div>
      {isOpen && (
        <div style={{ padding: flush ? 0 : '10px 16px 12px' }}>
          {beforeIndicators}
          {!hideList && indicators && (grouped
            ? <GroupedIndicators indicators={indicators} hideDot={hideDot} left={valueLeft} />
            : indicators.map((ind, i) => <IndRow key={i} ind={ind} hideDot={hideDot} left={valueLeft} />))}
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
      {/* ВРЕМЕННО СКРЫТО (по просьбе): верхний блок без заголовка вкладки «Внешняя информация» —
          строка даты актуальности, пояснение про 11 разделов и три карточки (Индекс РБ /
          Санкционный статус / РНП). Чтобы вернуть — снять обрамляющий комментарий
          вокруг этого блока (искать по «ВРЕМЕННО СКРЫТО») и восстановить обычные
          JSX-комментарии на месте пометок с двойными квадратными скобками.
          Переменная rb выше нужна только этому блоку.

      <SectionCard>
        [[ Заголовок-плашка «Внешняя информация» убран — вкладка и так названа
            так же; дата актуальности источников оставлена строкой над сводкой,
            прижата к правому краю (как extra у заголовков остальных блоков). ]]
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <DateActuality date={c.asOf.external} source="СПАРК / ФНС / ГПБ / Госзакупки" />
        </div>
        <div className="pmrk-muted" style={{ fontSize: 13, marginBottom: 12 }}>11 разделов внешних источников (СПАРК, ФНС, Газпромбанк, Госзакупки). Разделы раскрываются по запросу — в заголовке каждого показана дата актуализации источника.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          [[ Все три карточки — на 3 строки (label / value / доп.информация через
              sub), а не вразнобой: раньше только у «Индекс РБ» была третья
              строка (sub), у остальных двух — по 2, из-за чего значения не
              выравнивались по одной высоте. ]]
          <Stat label="Индекс РБ (Газпромбанк)" value={<RbIndicator value={c.rbIndex} />} sub={rb.desc} />
          <Stat
            label="Санкционный статус"
            value={c.underSanctions ? <SanctionBadge /> : 'Не выявлено'}
            tone={c.underSanctions ? 'risk' : 'good'}
            sub={c.underSanctions ? (c.sanctions[0]?.basis ?? 'Основание уточняется') : 'Проверено по актуальным спискам'}
          />
          <Stat
            label="РНП (недобросовестные)"
            value={c.group ? <RnpUnscrupulous /> : 'Не выявлено'}
            tone={c.group === 4 ? 'risk' : 'good'}
            sub={c.group === 4 ? 'Требует внимания при заключении сделки' : 'Проверено в реестре ФАС'}
          />
        </div>
      </SectionCard>
      */}

      {/* Разделы внешних источников — аккордеоны (прогрессивное раскрытие).
          «Санкции по данным СПАРК» встроены в ту же последовательность сразу
          после «Риск-индикаторов по данным СПАРК», тем же компонентом
          ExtAccordion — раздел не должен визуально отличаться от остальных:
          тот же сворачиваемый заголовок, та же карточка. Расшифровка внутри —
          таблицей, без клика и модалки. Нумерация разделов из ЕДТ в подписях не
          выводится: пользователю нужны названия, а порядок задаёт сам список. */}
      {ext.sections.map((s) => (
        <Fragment key={s.key}>
          <ExtAccordion
            title={s.title}
            indicators={s.indicators}
            defaultOpen={['s1', 's2', 's4', 's5', 's6'].includes(s.key)}
            beforeIndicators={s.key === 's1' && s.indicators ? <RiskSummaryList indicators={s.indicators} /> : undefined}
            hideList={s.key === 's1'}
            hideDot={['s4', 's6'].includes(s.key)}
            grouped={['s4', 's5', 's6', 's9'].includes(s.key)}
            valueLeft
            extra={<DateActuality date={s.asOf} source={s.source} />}
          >
            {s.key === 's5' && (
              // «Расшифровка сведений о суммах недоимки…» — вложенный подблок под
              // группой «Задолженность перед ФНС», в стиле остальных расшифровок;
              // строка ИТОГО считается из строк таблицы
              <div style={{ marginTop: 10 }}>
                <ExtAccordion
                  title="Расшифровка сведений о суммах недоимки и задолженности по пеням и штрафам"
                  defaultOpen
                  flush
                  softHead
                >
                  <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible' }}>
                    <div className="pmrk-table__head" style={{ position: 'static' }}>
                      <div className="pmrk-th" style={{ flex: 1.6, minWidth: 0 }}>Наименование налога, сбора, страхового взноса</div>
                      <div className="pmrk-th" style={{ flex: 0.8, minWidth: 0 }}>Сумма недоимки, руб.</div>
                      <div className="pmrk-th" style={{ flex: 0.7, minWidth: 0 }}>Сумма пени, руб.</div>
                      <div className="pmrk-th" style={{ flex: 0.7, minWidth: 0 }}>Сумма штрафа, руб.</div>
                      <div className="pmrk-th" style={{ flex: 1.3, minWidth: 0 }}>Общая сумма недоимки и задолженности по пеням и штрафам, руб.</div>
                    </div>
                    {ext.ftsDebtBreakdown.length === 0 && (
                      <div className="pmrk-tr" style={{ cursor: 'default' }}>
                        <div className="pmrk-td pmrk-muted" style={{ flex: 1 }}>Задолженность перед ФНС отсутствует</div>
                      </div>
                    )}
                    {ext.ftsDebtBreakdown.length > 0 && [
                      ...ext.ftsDebtBreakdown,
                      ext.ftsDebtBreakdown.reduce((t, r) => ({ ...t, arrears: t.arrears + r.arrears, penalty: t.penalty + r.penalty, fine: t.fine + r.fine, total: t.total + r.total }), { name: 'ИТОГО', arrears: 0, penalty: 0, fine: 0, total: 0 }),
                    ].map((r) => (
                      <div key={r.name} className="pmrk-tr" style={{ cursor: 'default', fontWeight: r.name === 'ИТОГО' ? 700 : undefined }}>
                        <div className="pmrk-td" style={{ flex: 1.6, minWidth: 0, whiteSpace: 'normal' }}>{r.name}</div>
                        <div className="pmrk-td pmrk-tnum" style={{ flex: 0.8, minWidth: 0 }}>{money(r.arrears)}</div>
                        <div className="pmrk-td pmrk-tnum" style={{ flex: 0.7, minWidth: 0 }}>{money(r.penalty)}</div>
                        <div className="pmrk-td pmrk-tnum" style={{ flex: 0.7, minWidth: 0 }}>{money(r.fine)}</div>
                        <div className="pmrk-td pmrk-tnum" style={{ flex: 1.3, minWidth: 0 }}>{money(r.total)}</div>
                      </div>
                    ))}
                  </div>
                </ExtAccordion>
              </div>
            )}
            {s.key === 's6' && ext.courtCases.length > 0 && (
              // «Расшифровка судебных дел» — вложенный сворачиваемый подблок
              // раздела: тем же ExtAccordion, что и разделы «Внешней информации»,
              // раскрыт по умолчанию, но его можно свернуть, оставив в разделе
              // только сводные индикаторы.
              <div style={{ marginTop: 10 }}>
                <ExtAccordion
                  title="Расшифровка судебных дел"
                  flush
                  softHead
                  extra={<span style={{ fontSize: 12, color: 'var(--color-typo-secondary)', whiteSpace: 'nowrap' }}>Информация актуальна на {dateRu(s.asOf)}</span>}
                >
                  {/* таблица во всю карточку (без рамки и полей), шапка липнет
                      прямо под заголовком подблока (top = высота плашки);
                      сверху — разделитель между заголовком подблока и таблицей */}
                  <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible' }}>
                    <div className="pmrk-table__head" style={{ position: 'static' }}>
                      <div className="pmrk-th" style={{ flex: 1.5, minWidth: 0 }}>Истец</div>
                      <div className="pmrk-th" style={{ flex: 1.1, minWidth: 0 }}>Номер дела</div>
                      <div className="pmrk-th" style={{ flex: 1.3, minWidth: 0 }}>Категория</div>
                      <div className="pmrk-th" style={{ flex: 1, minWidth: 0 }}>Состояние</div>
                      <div className="pmrk-th" style={{ flex: 1, minWidth: 0 }}>Исход дела</div>
                      <div className="pmrk-th" style={{ flex: 0.8, minWidth: 0 }}>Дата иска</div>
                      <div className="pmrk-th" style={{ flex: 0.9, minWidth: 0, justifyContent: 'flex-end' }}>Сумма иска, руб.</div>
                      <div className="pmrk-th" style={{ flex: 0.9, minWidth: 0, justifyContent: 'flex-end' }}>Сумма по решению, руб.</div>
                    </div>
                    {(allCases ? ext.courtCases : ext.courtCases.slice(0, 3)).map((cc, i) => (
                      <div key={i} className="pmrk-tr" style={{ cursor: 'default' }}>
                        <div className="pmrk-td" style={{ flex: 1.5, minWidth: 0 }}>{cc.plaintiff}</div>
                        <div className="pmrk-td" style={{ flex: 1.1, minWidth: 0 }}>{cc.number}</div>
                        <div className="pmrk-td" style={{ flex: 1.3, minWidth: 0 }}>{cc.category}</div>
                        <div className="pmrk-td" style={{ flex: 1, minWidth: 0 }}>{cc.state}</div>
                        <div className="pmrk-td" style={{ flex: 1, minWidth: 0 }}>{cc.outcome}</div>
                        <div className="pmrk-td" style={{ flex: 0.8, minWidth: 0 }}>{dateRu(cc.date)}</div>
                        <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9, minWidth: 0, justifyContent: 'flex-end', display: 'flex' }}>{moneyCompact(cc.claim)}</div>
                        <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9, minWidth: 0, justifyContent: 'flex-end', display: 'flex' }}>{cc.decision ? moneyCompact(cc.decision) : '—'}</div>
                      </div>
                    ))}
                  </div>
                  {ext.courtCases.length > 3 && <div style={{ margin: '6px 16px 8px' }}><Button size="xs" view="ghost" label={allCases ? 'Свернуть' : 'Показать больше'} onClick={() => setAllCases((v) => !v)} /></div>}
                </ExtAccordion>
              </div>
            )}
            {s.key === 's6' && ext.enforcementCases.length > 0 && (
              // «Расшифровка активных исполнительных производств» — последний
              // вложенный подблок раздела, в том же стиле, что и «Расшифровка
              // судебных дел»; дата актуальности — справа в заголовке подблока
              <div style={{ marginTop: 10 }}>
                <ExtAccordion
                  title="Расшифровка активных исполнительных производств"
                  flush
                  softHead
                  extra={<span style={{ fontSize: 12, color: 'var(--color-typo-secondary)', whiteSpace: 'nowrap' }}>Информация актуальна на {dateRu(s.asOf)}</span>}
                >
                  <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible' }}>
                    <div className="pmrk-table__head" style={{ position: 'static' }}>
                      <div className="pmrk-th" style={{ flex: 1.4, minWidth: 0 }}>Наименование категории</div>
                      <div className="pmrk-th" style={{ flex: 1, minWidth: 0 }}>Номер производства</div>
                      <div className="pmrk-th" style={{ flex: 0.6, minWidth: 0 }}>Дата</div>
                      <div className="pmrk-th" style={{ flex: 0.8, minWidth: 0 }}>Сумма выплаты, руб.</div>
                      <div className="pmrk-th" style={{ flex: 2, minWidth: 0 }}>Документ-основание</div>
                    </div>
                    {ext.enforcementCases.map((ec, i) => (
                      <div key={i} className="pmrk-tr" style={{ cursor: 'default' }}>
                        <div className="pmrk-td" style={{ flex: 1.4, minWidth: 0 }}>{ec.category}</div>
                        <div className="pmrk-td" style={{ flex: 1, minWidth: 0 }}>{ec.number}</div>
                        <div className="pmrk-td" style={{ flex: 0.6, minWidth: 0 }}>{dateRu(ec.date)}</div>
                        <div className="pmrk-td pmrk-tnum" style={{ flex: 0.8, minWidth: 0 }}>{money(ec.amount, { unit: '' })}</div>
                        <div className="pmrk-td" style={{ flex: 2, minWidth: 0, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', overflowWrap: 'anywhere' }}>{ec.basis}</div>
                      </div>
                    ))}
                  </div>
                </ExtAccordion>
              </div>
            )}
          </ExtAccordion>

          {/* Санкции — сразу после «Риск-индикаторов по данным СПАРК» (порядок ЕДТ),
              раздел скрыт при отсутствии записей (ФТ-1.3) */}
          {s.key === 's2' && ext.sanctions.length > 0 && (
            <ExtAccordion
              title="Санкции по данным СПАРК"
              defaultOpen
              extra={<DateActuality date={c.asOf.external} source="СПАРК · Санкции" />}
            >
              {/* показатель «Под санкциями» — обычной строкой, как в других
                  блоках (значение слева); без нижней границы, чтобы не двоить
                  разделитель перед подблоком «Расшифровка санкций» */}
              <IndRow ind={{ label: 'Под санкциями', value: 'Да', level: 'high' }} inline noBorder />
              {/* «Расшифровка санкций» — вложенный сворачиваемый подблок, тем же
                  ExtAccordion, что и «Расшифровка судебных дел» в разделе s6. */}
              <div style={{ marginTop: 10 }}>
                <ExtAccordion
                  title="Расшифровка санкций"
                  flush
                  softHead
                >
                  {/* таблица во всю карточку (без рамки и полей), шапка липнет
                      прямо под заголовком подблока (top = высота плашки);
                      сверху — разделитель между заголовком подблока и таблицей */}
                  <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible' }}>
                    <div className="pmrk-table__head" style={{ position: 'static' }}>
                      <div className="pmrk-th" style={{ flex: 1.3, minWidth: 0 }}>Категория ограничительных мер</div>
                      <div className="pmrk-th" style={{ flex: 1.6, minWidth: 0 }}>Санкционный список</div>
                      <div className="pmrk-th" style={{ flex: 1, minWidth: 0 }}>Санкционная программа</div>
                      <div className="pmrk-th" style={{ flex: 1.8, minWidth: 0 }}>Причина включения</div>
                      <div className="pmrk-th" style={{ flex: 0.8, minWidth: 0 }}>Дата включения</div>
                      <div className="pmrk-th" style={{ flex: 0.8, minWidth: 0 }}>Дата исключения</div>
                      <div className="pmrk-th" style={{ flex: 1, minWidth: 0 }}>Тип санкций</div>
                      <div className="pmrk-th" style={{ flex: 1.2, minWidth: 0 }}>Совладельцы</div>
                    </div>
                    {ext.sanctions.map((sd, i) => (
                      <div key={i} className="pmrk-tr" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                        <div className="pmrk-td" style={{ flex: 1.3, minWidth: 0, whiteSpace: 'normal' }}>{sd.category}</div>
                        <div className="pmrk-td" style={{ flex: 1.6, minWidth: 0, fontWeight: 600, whiteSpace: 'normal' }}>{sd.list}</div>
                        <div className="pmrk-td" style={{ flex: 1, minWidth: 0, whiteSpace: 'normal' }}>{sd.program}</div>
                        <div className="pmrk-td" style={{ flex: 1.8, minWidth: 0, whiteSpace: 'normal' }}>{sd.reason}</div>
                        <div className="pmrk-td" style={{ flex: 0.8, minWidth: 0 }}>{dateRu(sd.from)}</div>
                        <div className="pmrk-td" style={{ flex: 0.8, minWidth: 0 }}>{sd.to}</div>
                        <div className="pmrk-td" style={{ flex: 1, minWidth: 0, whiteSpace: 'normal' }}>{sd.type}</div>
                        <div className="pmrk-td" style={{ flex: 1.2, minWidth: 0, whiteSpace: 'normal' }}>{sd.coOwners}</div>
                      </div>
                    ))}
                  </div>
                </ExtAccordion>
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
  const [filters, setFilters] = useState<DiagramFilters>({ selected: new Set<number>(), minDirect: 0, maxLevel: 3 });
  const groupRisk = AI_GROUP_RISK[c.uid];

  if (!graph) {
    return <SimpleTab title="Аффилированность" text="Диаграмма и таблица связей строятся по данным о владельцах, руководстве и аффилированных лицах по типам аффилированности. Для этого контрагента связи не загружены — попробуйте Газпром нефть, РН-Снабжение или Балтийскую ТК." asOf={c.asOf.affiliation} />;
  }

  // Клик по связанному лицу: есть карточка в реестре — открываем её, нет — ведём
  // в заявку на создание карточки (по ИНН, а у физлица — по имени).
  const openNode = (n: AffiliationNode) =>
    n.inRegistry && n.uid
      ? navigate(`/counterparties/${n.uid}/general`)
      : navigate(`/counterparties/request?q=${encodeURIComponent(n.inn ?? n.name)}`);

  // Типы аффилированности, по которым у компании есть связи — в порядке
  // справочника; по ним строятся фильтры-чипы. Сначала показаны все типы (чип
  // «Все»); выбор чипов оставляет только выбранные, повторный клик снимает.
  const kindsPresent = AFFILIATION_KINDS.filter((k) => graph.nodes.some((n) => n.kinds.includes(k.id)));
  const toggleType = (id: number) => {
    setFilters((f) => {
      const selected = new Set(f.selected);
      selected.has(id) ? selected.delete(id) : selected.add(id);
      return { ...f, selected };
    });
  };
  const resetTypes = () => setFilters((f) => ({ ...f, selected: new Set<number>() }));

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
            placeholder="Поиск связи по наименованию или ИНН (подсветка малиновым)"
            style={{ flex: 1, height: 34, padding: '0 12px', border: '1px solid var(--color-bg-border)', borderRadius: 8, background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', outline: 'none' }}
          />
          <Segmented value={mode} onChange={setMode} items={[{ key: 'diagram', label: 'Диаграмма' }, { key: 'table', label: 'Таблица' }]} />
        </div>

        {/* фильтры — по типам аффилированности (справочник). «Все» — по
            умолчанию; выбранный тип показывает только его группу. Короткая
            подпись, полное название типа — в подсказке и в заголовке группы */}
        <div className="pmrk-filterbar">
          <div
            className={`pmrk-filterchip ${filters.selected.size === 0 ? 'pmrk-filterchip--active' : ''}`}
            onClick={resetTypes}
          >
            Все
          </div>
          {kindsPresent.map((k) => (
            <div
              key={k.id}
              title={k.pmrk}
              className={`pmrk-filterchip ${filters.selected.has(k.id) ? 'pmrk-filterchip--active' : ''}`}
              onClick={() => toggleType(k.id)}
            >
              {k.short}
            </div>
          ))}
        </div>

        {mode === 'diagram' ? (
          <AffiliationDiagram
            graph={graph}
            search={search}
            filters={filters}
            onOpenGeneral={() => navigate(`/counterparties/${c.uid}/general`)}
            onOpenNode={openNode}
          />
        ) : (
          <AffiliationTable graph={graph} search={search} selected={filters.selected} onOpen={openNode} />
        )}
      </SectionCard>
    </>
  );
}

function AffiliationTable({ graph, search, selected, onOpen }: { graph: typeof GRAPHS[string]; search: string; selected: Set<number>; onOpen: (n: AffiliationNode) => void }) {
  const q = search.trim().toLowerCase();
  const hit = (n: AffiliationNode) => !!q && (n.name.toLowerCase().includes(q) || (n.inn ?? '').includes(q));

  // точка «руководитель» — только в группе «Руководитель компании» (тип 3), как значок «Р» на диаграмме
  const NameCell = ({ n, kindId }: { n: AffiliationNode; kindId?: number }) => (
    <div className="pmrk-td" style={{ flex: 1.8, whiteSpace: 'normal' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {n.isDirector && kindId === 3 && <span title="Руководитель (ЕИО)" style={{ width: 8, height: 8, borderRadius: '50%', background: DIRECTOR_COLOR, flex: 'none' }} />}
        <span style={{ fontWeight: 600 }}>{n.name}</span>
      </span>{' '}{n.underSanctions && <SanctionBadge />}
      {highRiskInfo(n) && (
        <span className="pmrk-chip" title="Высокий риск по результату экспресс-оценки (группа 4)" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-primary)', marginLeft: 6 }}>
          <span className="pmrk-dot" style={{ background: HIGH_RISK_COLOR }} />
          Высокий риск
        </span>
      )}
    </div>
  );

  const Row = ({ n, kindId }: { n: AffiliationNode; kindId: number }) => (
    <div className={`pmrk-tr ${hit(n) ? 'pmrk-search-hit' : ''}`} style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => onOpen(n)}>
      <NameCell n={n} kindId={kindId} />
      <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9 }}>{n.inn ?? '—'}</div>
      <div className="pmrk-td" style={{ flex: 0.8 }}>{n.isPerson ? 'Физ. лицо' : 'Юр. лицо'}</div>
      <div className="pmrk-td pmrk-muted" style={{ flex: 1.6, whiteSpace: 'normal' }}>{describeShare(n) ?? '—'}</div>
    </div>
  );

  // Таблица: сначала «Структура собственников» — владельцы (тип 2) и конечные
  // бенефициары, ФИЗИЧЕСКИЕ лица; затем по таблице на каждый из остальных типов
  // аффилированности — те же группы, что и на диаграмме (одно лицо с несколькими
  // типами есть в каждой). Несворачиваемые подблоки в стиле «Изменений в
  // наименовании…»: мягкая плашка заголовка, таблица во всю карточку, счётчик
  // строк чипом. Владельцев отдельной группой типа 2 не дублируем.
  const chip = (n: number) => <span className="pmrk-chip" style={{ background: 'var(--color-bg-brand)', color: 'var(--color-bg-default)', fontSize: 11 }}>{n}</span>;
  const OWNER_KIND = 2;
  const showStructure = selected.size === 0 || selected.has(OWNER_KIND);
  const owners = graph.nodes.filter((n) => n.kinds.includes(OWNER_KIND));
  const beneficiaries = graph.beneficiaries ?? [];
  const structureRows = [
    ...owners.map((n) => ({ n, role: 'Владелец' })),
    ...beneficiaries.map((n) => ({ n, role: 'Конечный бенефициар' })),
  ];
  const groups = AFFILIATION_KINDS
    .filter((k) => k.id !== OWNER_KIND && (selected.size === 0 || selected.has(k.id)))
    .map((k) => ({ kind: k, nodes: graph.nodes.filter((n) => n.kinds.includes(k.id)) }))
    .filter((g) => g.nodes.length > 0);

  const hasStructure = showStructure && (structureRows.length > 0 || graph.beneficiaries !== undefined);
  if (!groups.length && !hasStructure) return <EmptyState text="Связей выбранных типов не найдено." />;

  return (
    <div>
      {hasStructure && (
        <div style={{ marginTop: 16 }}>
          <ExtAccordion title="Структура собственников" collapsible={false} flush softHead extra={chip(structureRows.length)}>
            <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible' }}>
              <div className="pmrk-table__head" style={{ position: 'static' }}>
                <div className="pmrk-th" style={{ flex: 1.8 }}>Наименование</div>
                <div className="pmrk-th" style={{ flex: 0.9 }}>ИНН</div>
                <div className="pmrk-th" style={{ flex: 0.8 }}>Тип лица</div>
                <div className="pmrk-th" style={{ flex: 1.4 }}>Доля владения</div>
                <div className="pmrk-th" style={{ flex: 1.1 }}>Статус</div>
              </div>
              {structureRows.map(({ n, role }) => (
                <div key={`${role}:${n.id}`} className={`pmrk-tr ${hit(n) ? 'pmrk-search-hit' : ''}`} style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => onOpen(n)}>
                  <NameCell n={n} />
                  <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9 }}>{n.inn ?? '—'}</div>
                  <div className="pmrk-td" style={{ flex: 0.8 }}>{n.isPerson ? 'Физ. лицо' : 'Юр. лицо'}</div>
                  <div className="pmrk-td pmrk-muted" style={{ flex: 1.4, whiteSpace: 'normal' }}>{describeShare(n) ?? '—'}</div>
                  <div className="pmrk-td" style={{ flex: 1.1, whiteSpace: 'normal', fontWeight: role === 'Конечный бенефициар' ? 600 : 400 }}>{role}</div>
                </div>
              ))}
              {graph.beneficiaries !== undefined && beneficiaries.length === 0 && (
                <div className="pmrk-muted" style={{ fontSize: 13, padding: '10px 12px' }}>
                  Конечный бенефициар — физическое лицо не установлен.
                </div>
              )}
            </div>
          </ExtAccordion>
        </div>
      )}
      {groups.map(({ kind, nodes }) => (
        <div key={kind.id} style={{ marginTop: 16 }}>
          <ExtAccordion title={kind.pmrk} collapsible={false} flush softHead extra={chip(nodes.length)}>
            <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible' }}>
              <div className="pmrk-table__head" style={{ position: 'static' }}>
                <div className="pmrk-th" style={{ flex: 1.8 }}>Наименование</div>
                <div className="pmrk-th" style={{ flex: 0.9 }}>ИНН</div>
                <div className="pmrk-th" style={{ flex: 0.8 }}>Тип лица</div>
                <div className="pmrk-th" style={{ flex: 1.6 }}>Доля владения</div>
              </div>
              {nodes.map((n) => <Row key={n.id} n={n} kindId={kind.id} />)}
            </div>
          </ExtAccordion>
        </div>
      ))}
    </div>
  );
}

function DebtTab({ c }: { c: Counterparty }) {
  const debt = c.debt.length ? c.debt : synthDebt(c);
  const labels = debtDateLabels(debt.length, c.asOf.debt ?? NOW.toISOString().slice(0, 10));
  const [month, setMonth] = useState(NOW.getMonth());
  const [year, setYear] = useState(NOW.getFullYear());
  const dzKz = useMemo(() => buildDzKzTable(c, month, year), [c.uid, month, year]);
  // Фильтр графиков по ДО: в списке только ДО, по которым в детализации есть
  // ненулевые значения (activeColumns), в порядке колонок таблицы. Серия
  // выбранного ДО — ряд контрагента, умноженный на долю ДО в соответствующей
  // аналитике детализации, поэтому графики и таблица не расходятся.
  const [doFilter, setDoFilter] = useState('');
  const doOptions = dzKz.groups.flatMap((g) => g.columns).filter((col) => dzKz.activeColumns.has(col.name)).map((col) => col.name);
  const selectedDo = doOptions.includes(doFilter) ? doFilter : '';
  const doShare = (rowKey: string) => {
    if (!selectedDo) return 1;
    const row = dzKz.rows.find((r) => r.key === rowKey);
    return row && row.total ? (row.values[selectedDo] ?? 0) / row.total : 0;
  };
  const kDz = doShare('dzTotal'), kPdz = doShare('dzOverdue'), kAdv = doShare('advanceTotal'), kPay = doShare('payable');
  return (
    <>
      <SectionCard title="Данные по дебиторской и кредиторской задолженности" extra={<DateActuality date={c.asOf.debt} source="АРМ КК" />}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, marginBottom: 14 }}>
          <span>Выберите дочернее общество (ДО) для отображения</span>
          <select
            value={selectedDo}
            onChange={(e) => setDoFilter(e.target.value)}
            style={{ height: 32, minWidth: 320, border: '1px solid var(--color-bg-border)', borderRadius: 8, padding: '0 10px', background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', fontSize: 13 }}
          >
            <option value="">Все ДО</option>
            {doOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        {/* Три графика в ряд в оформлении исходной системы (DebtChart):
            ДЗ и ПДЗ, выданные авансы, КЗ — в млн руб., точки на конец каждого
            месяца и на дату актуальности; значение — по наведению (тултип). */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          <DebtChart
            title="ДЗ и ПДЗ, млн руб."
            labels={labels}
            series={[
              { name: 'ДЗ', color: '#3d8fd6', points: debt.map((d) => Math.round(d.dz * kDz)) },
              { name: 'ПДЗ', color: '#f2a53a', points: debt.map((d) => Math.round(d.pdz * kPdz)) },
            ]}
          />
          <DebtChart
            title="Выданные авансы, млн руб."
            labels={labels}
            series={[{ name: 'Выданные авансы', color: '#3d8fd6', points: debt.map((d) => Math.round(d.advance * kAdv)) }]}
          />
          <DebtChart
            title="Кредиторская задолженность, млн руб."
            labels={labels}
            series={[{ name: 'КЗ', color: '#3d8fd6', points: debt.map((d) => Math.round(d.payable * kPay)) }]}
          />
        </div>
      </SectionCard>
      <DzKzDetailCard c={c} dzKz={dzKz} month={month} year={year} onMonth={setMonth} onYear={setYear} />
    </>
  );
}

/** «Детализация (Блок → ДО → итог, 13 аналитик)» — сводная таблица по ДО,
    сгруппированным по блокам ГК, плюс колонка «Итого». Ширина зависит от
    количества связанных ДО (buildDoLinks) — от 3–4 до пары десятков у крупных
    внутригрупповых контрагентов, поэтому таблица скроллится по горизонтали,
    а не сжимается и не переносится. Первая колонка (аналитика) — липкая. */
function DzKzDetailCard({
  c, dzKz, month, year, onMonth, onYear,
}: {
  c: Counterparty;
  dzKz: ReturnType<typeof buildDzKzTable>;
  month: number;
  year: number;
  onMonth: (m: number) => void;
  onYear: (y: number) => void;
}) {
  const years = [NOW.getFullYear(), NOW.getFullYear() - 1, NOW.getFullYear() - 2];
  const allCols = dzKz.groups.flatMap((g) => g.columns);
  // «Задолженность Просроченная» раскрывается по срокам просрочки (до 5 / 6–30 / более 30 дней);
  // по умолчанию свёрнута — остаётся одна строка с итогом
  const [overdueOpen, setOverdueOpen] = useState(false);
  const OVERDUE_DETAIL = ['dzOverdue5', 'dzOverdue30', 'dzOverdueMore'];
  const fmtCell = (v: number | undefined) => (v ? money(v, { unit: '' }) : '—');
  const selectStyle: React.CSSProperties = { height: 32, border: '1px solid var(--color-bg-border)', borderRadius: 8, padding: '0 10px', background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', fontSize: 13 };
  const stickyCol: React.CSSProperties = { position: 'sticky', left: 0, background: 'var(--color-bg-default)', zIndex: 1 };

  // Клик по сумме в «Детализации» — расшифровка по договорам (undefined
  // colName у sentinel-объекта означает «Итого» по всем ДО, а не «закрыто»:
  // закрытое состояние — null).
  const [detailCol, setDetailCol] = useState<{ col?: string } | null>(null);
  const openDetail = (col?: string) => setDetailCol({ col });
  /** Сумма-ссылка: кликабельна только когда есть что расшифровывать (v > 0). */
  const SumCell = ({ v, col, bold }: { v: number | undefined; col?: string; bold?: boolean }) =>
    v ? (
      <span
        className="pmrk-clickable"
        style={{ color: 'var(--color-typo-brand)', fontWeight: bold ? 700 : 400, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}
        onClick={() => openDetail(col)}
        title="Показать расшифровку по договорам"
      >
        {money(v, { unit: '' })}
      </span>
    ) : (
      <span>—</span>
    );

  return (
    <SectionCard title={`Детализация (Блок → ДО → итог, ${dzKz.rows.length} аналитик)`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <span className="pmrk-muted">Месяц</span>
          <select value={month} onChange={(e) => onMonth(Number(e.target.value))} style={selectStyle}>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <span className="pmrk-muted">Год</span>
          <select value={year} onChange={(e) => onYear(Number(e.target.value))} style={selectStyle}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        {allCols.length > 0 && (
          <Button size="xs" view="secondary" label="Выгрузить в Excel" iconLeft={IconDownload as never} onClick={() => exportDzKzToExcel(c, dzKz, month, year)} />
        )}
        <CalcStamp date={c.asOf.debt} source="АРМ КК" />
      </div>

      {allCols.length ? (
        <div style={{ overflowX: 'auto', border: '1px solid var(--color-bg-border)', borderRadius: 'var(--pmrk-radius-lg)' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 'max-content' }}>
            <thead>
              <tr>    
                <th rowSpan={2} style={{ ...stickyCol, background: 'var(--color-bg-brand)', minWidth: 280, textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid var(--color-bg-border)', borderRight: '1px solid var(--color-bg-border)', color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase'}}>
                  Аналитика / подразделение
                </th>
                {dzKz.groups.map((g) => (
                  <th key={g.key} colSpan={g.columns.length} style={{ padding: '8px 10px', background: 'var(--color-bg-brand)', color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.25)' }}>
                    {g.label}
                  </th>
                ))}
                <th rowSpan={2} style={{ minWidth: 130, padding: '8px 10px', background: 'var(--color-bg-brand)', color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.35)' }}>
                  Итого
                </th>
              </tr>
              <tr>
                {allCols.map((col) => (
                  <th key={col.name} title={col.name} style={{ minWidth: 96, padding: '8px 8px', background: 'color-mix(in srgb, var(--color-bg-brand) 65%, #ffffff)', color: '#fff', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', textAlign: 'right', borderLeft: '1px solid rgba(255,255,255,0.25)', borderBottom: '1px solid var(--color-bg-border)' }}>
                    {shortDoLabel(col.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...stickyCol, padding: '8px 12px', borderBottom: '1px solid var(--color-bg-border)', borderRight: '1px solid var(--color-bg-border)', fontStyle: 'italic', color: 'var(--color-typo-secondary)' }}>Дата</td>
                {allCols.map((col) => (
                  <td key={col.name} className="pmrk-tnum" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-bg-border)', textAlign: 'right', color: 'var(--color-typo-secondary)', fontStyle: 'italic' }}>
                    {dzKz.activeColumns.has(col.name) ? dateRu(dzKz.periodDate) : '—'}
                  </td>
                ))}
                <td className="pmrk-tnum" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-bg-border)', textAlign: 'right', color: 'var(--color-typo-secondary)', fontStyle: 'italic' }}>{dateRu(dzKz.periodDate)}</td>
              </tr>
              {dzKz.rows.filter((r) => overdueOpen || !OVERDUE_DETAIL.includes(r.key)).map((r) => (
                <tr key={r.key}>
                  <td style={{ ...stickyCol, padding: '8px 12px', paddingLeft: 12 + r.indent * 16, borderBottom: '1px solid var(--color-bg-border)', borderRight: '1px solid var(--color-bg-border)', fontWeight: r.indent === 0 ? 600 : 400, whiteSpace: 'normal' }}>
                    {r.key === 'dzOverdue' ? (
                      <button
                        type="button"
                        onClick={() => setOverdueOpen((v) => !v)}
                        aria-expanded={overdueOpen}
                        title={overdueOpen ? 'Свернуть сроки просрочки' : 'Показать сроки просрочки'}
                        style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, padding: 0, border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                      >
                        <span style={{ width: 12, flex: '0 0 12px', fontSize: 10, lineHeight: '18px', color: 'var(--color-typo-secondary)' }}>{overdueOpen ? '▾' : '▸'}</span>
                        <span>{r.label}</span>
                      </button>
                    ) : r.label}
                  </td>
                  {allCols.map((col) => (
                    <td key={col.name} className="pmrk-tnum" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-bg-border)', textAlign: 'right' }}>
                      <SumCell v={r.values[col.name]} col={col.name} />
                    </td>
                  ))}
                  <td className="pmrk-tnum" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-bg-border)', textAlign: 'right', fontWeight: 700 }}>
                    <SumCell v={r.total} bold />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState text="Нет данных о работе с ДО за выбранный период." />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <span className="pmrk-muted" style={{ fontSize: 12 }}>
          {allCols.length} {allCols.length === 1 ? 'ДО' : 'ДО'} в {dzKz.groups.length} {dzKz.groups.length === 1 ? 'блоке' : 'блоках'} · доля ПДЗ на конец периода:{' '}
          <b style={{ color: 'var(--pmrk-risk-4)' }}>
            {dzKz.rows[0].total ? pct((dzKz.rows[2].total / dzKz.rows[0].total) * 100) : '—'}
          </b>.
        </span>
      </div>

      {detailCol && (
        <DzKzContractModal
          detail={buildDzKzContractDetail(c, dzKz, detailCol.col)}
          onClose={() => setDetailCol(null)}
        />
      )}
    </SectionCard>
  );
}

/** Расшифровка задолженности по договорам (клик по сумме в «Детализации») —
    4 блока по образцу исходной системы: дебиторская задолженность, авансы,
    кредиторская задолженность, прочие обеспечения. Поля обеспечения и
    комментариев в моке не заведены (в «Детализации» это всегда нулевые
    строки) — выводятся прочерком, а «Прочие обеспечения» — пустым разделом,
    как и в исходнике для контрагентов без обеспечения. */
function DzKzContractModal({ detail, onClose }: { detail: DzKzContractDetail; onClose: () => void }) {
  const m = (n: number) => money(n, { unit: '' });
  const rub = (n: number) => (n ? m(n) : '—');

  const dzRows = detail.dz.map((r, i) => ({ id: `${r.number}-${i}`, ...r }));
  const dzCols: LegalCol<typeof dzRows[0]>[] = [
    { label: 'Номер договора', width: 160, render: (r) => r.number },
    { label: 'Задолженность Общая, руб.', width: 140, align: 'right', render: (r) => m(r.general) },
    { label: 'Задолженность Текущая, руб.', width: 140, align: 'right', render: (r) => m(r.current) },
    { label: 'Задолженность Просроченная, руб.', width: 150, align: 'right', render: (r) => rub(r.overdue) },
    { label: 'Просроченная до 5 дней, руб.', width: 140, align: 'right', render: (r) => rub(r.overdue5) },
    { label: 'Просроченная от 6 до 30 дней, руб.', width: 150, align: 'right', render: (r) => rub(r.overdue30) },
    { label: 'Просроченная более 30 дней, руб.', width: 150, align: 'right', render: (r) => rub(r.overdueMore) },
    { label: 'Выставленные претензии и штрафы, руб.', width: 160, align: 'right', render: (r) => rub(r.claims) },
    { label: 'Сумма резервов по сомнительным долгам, руб.', width: 170, align: 'right', render: (r) => rub(r.reserve) },
    { label: 'Комментарий относительно просроченной задолженности', width: 220, render: () => '—' },
    { label: 'Сумма обеспечения, руб.', width: 130, align: 'right', render: () => '—' },
    { label: 'Вид обеспечения', width: 120, render: () => '—' },
    { label: 'Номер обеспечения', width: 130, render: () => '—' },
    { label: 'Наименование гаранта / поручителя / залогодателя / страховщика', width: 220, render: () => '—' },
    { label: 'Дата начала действия обеспечения', width: 150, render: () => '—' },
    { label: 'Дата окончания срока действия обеспечения', width: 160, render: () => '—' },
  ];

  const advRows = detail.advances.map((r, i) => ({ id: `${r.number}-${i}`, ...r }));
  const advCols: LegalCol<typeof advRows[0]>[] = [
    { label: 'Номер договора', width: 160, render: (r) => r.number },
    { label: 'Авансы Сумма на конец периода, руб. (без отрицательных сальдо)', width: 220, align: 'right', render: (r) => m(r.amount) },
    { label: 'Комментарий по авансам', width: 180, render: () => '—' },
    { label: 'Сумма обеспечения, руб.', width: 130, align: 'right', render: () => '—' },
    { label: 'Вид обеспечения', width: 120, render: () => '—' },
    { label: 'Номер обеспечения', width: 130, render: () => '—' },
    { label: 'Наименование гаранта / поручителя / залогодателя / страховщика', width: 220, render: () => '—' },
    { label: 'Дата начала действия обеспечения', width: 150, render: () => '—' },
    { label: 'Дата окончания срока действия обеспечения', width: 160, render: () => '—' },
  ];

  const payRows = detail.payable.map((r, i) => ({ id: `${r.number}-${i}`, ...r }));
  const payCols: LegalCol<typeof payRows[0]>[] = [
    { label: 'Номер договора', width: 200, render: (r) => r.number },
    { label: 'Кредиторская задолженность, руб.', width: 180, align: 'right', render: (r) => m(r.amount) },
  ];

  const otherCols: LegalCol<{ id: string }>[] = [
    { label: 'Номер договора', width: 200, render: () => '—' },
    { label: 'Сумма обеспечения, руб.', width: 150, align: 'right', render: () => '—' },
    { label: 'Вид обеспечения', width: 140, render: () => '—' },
    { label: 'Номер обеспечения', width: 140, render: () => '—' },
    { label: 'Наименование гаранта / поручителя / залогодателя / страховщика', width: 240, render: () => '—' },
    { label: 'Дата начала действия обеспечения', width: 160, render: () => '—' },
    { label: 'Дата окончания срока действия обеспечения', width: 170, render: () => '—' },
  ];

  const SectionHead = ({ title }: { title: string }) => (
    <div style={{ padding: '9px 14px', background: 'var(--color-bg-brand)', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'uppercase', borderRadius: 'var(--pmrk-radius) var(--pmrk-radius) 0 0' }}>
      {title}
    </div>
  );

  return (
    <SimpleOverlay onClose={onClose} maxWidth="min(94vw, 1520px)">
      <div style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Дебиторская и кредиторская задолженность</h3>
          <span className="pmrk-muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
            {detail.colName ?? 'Итого по всем ДО'} · на {dateRu(detail.periodDate)}
          </span>
        </div>

        <div style={{ marginBottom: 18 }}>
          <SectionHead title="Дебиторская задолженность" />
          <div style={{ border: '1px solid var(--color-bg-border)', borderTop: 'none', borderRadius: '0 0 var(--pmrk-radius) var(--pmrk-radius)', padding: dzRows.length ? 0 : 10 }}>
            <LegalWideTable columns={dzCols} rows={dzRows} empty="Дебиторской задолженности по договорам нет." />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <SectionHead title="Авансы" />
          <div style={{ border: '1px solid var(--color-bg-border)', borderTop: 'none', borderRadius: '0 0 var(--pmrk-radius) var(--pmrk-radius)', padding: advRows.length ? 0 : 10 }}>
            <LegalWideTable columns={advCols} rows={advRows} empty="Авансов нет." />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <SectionHead title="Кредиторская задолженность" />
          <div style={{ border: '1px solid var(--color-bg-border)', borderTop: 'none', borderRadius: '0 0 var(--pmrk-radius) var(--pmrk-radius)', padding: payRows.length ? 0 : 10 }}>
            <LegalWideTable columns={payCols} rows={payRows} empty="Кредиторской задолженности по договорам нет." />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <SectionHead title="Прочие обеспечения" />
          <div style={{ border: '1px solid var(--color-bg-border)', borderTop: 'none', borderRadius: '0 0 var(--pmrk-radius) var(--pmrk-radius)', padding: 10 }}>
            <LegalWideTable columns={otherCols} rows={[]} empty="Прочих обеспечений нет." />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="s" label="OK" onClick={onClose} />
        </div>
      </div>
    </SimpleOverlay>
  );
}

/** Ширина колонки показателя в таблицах отчётности (px). */
const STMT_LABEL_W = 400;

/** Допустимое отклонение активов от пассивов, тыс. руб.: больше — баннер «Проверьте отчётность». */
const BALANCE_TOLERANCE = 2;

function StatementsTab({ c }: { c: Counterparty }) {
  // Столбцы — отчётные периоды от свежего к старому. По «героям» это реальная
  // годовая отчётность (три закрытых года), по остальным карточкам — прежняя
  // синтетика, где текущий, ещё не закрытый год подписан датой актуализации
  // отчётности контрагента: иначе непонятно, на какую дату приведены цифры.
  const [standard, setStandard] = useState<'РСБУ' | 'МСФО'>('РСБУ');
  const [, bump] = useState(0);
  // null — окно закрыто, 'new' — новая запись, иначе редактируем внесённый период
  const [editing, setEditing] = useState<IfrsEntry | 'new' | null>(null);
  const rsbu = useMemo(() => buildStatements(c), [c.uid]);
  const ifrsEntries = getIfrsEntries(c);
  const ifrs = buildIfrsStatements(ifrsEntries);
  const st = standard === 'РСБУ' ? rsbu : ifrs;
  // в МСФО нет кодов строк — колонку не рисуем
  const hasCodes = standard === 'РСБУ';
  const codeW = hasCodes ? 100 : 0;
  const emptyIfrs = standard === 'МСФО' && ifrs.periods.length === 0;
  const actualDate = standard === 'РСБУ' ? c.asOf.statements : ifrs.periods[0];
  // сходимость баланса по каждой отчётной дате: в РСБУ — коды 1600 и 1700, в МСФО — итоги
  // «ИТОГО АКТИВЫ» и «ИТОГО КАПИТАЛ И ОБЯЗАТЕЛЬСТВА»
  const balanceRows = st.blocks[0]?.rows ?? [];
  const totalAssets = balanceRows.find((r) => r.code === '1600' || r.label === 'ИТОГО АКТИВЫ');
  const totalLiab = balanceRows.find((r) => r.code === '1700' || r.label === 'ИТОГО КАПИТАЛ И ОБЯЗАТЕЛЬСТВА');
  const imbalances = totalAssets && totalLiab
    ? st.periods.map((date, i) => ({ date, diff: totalAssets.values[i] - totalLiab.values[i] })).filter((x) => Math.abs(x.diff) > BALANCE_TOLERANCE)
    : [];

  return (
    <SectionCard title="Финансовая отчётность контрагента" extra={<DateActuality date={actualDate} source={[...new Set(st.sources)].join(' / ')} />}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Segmented value={standard} onChange={setStandard} items={[{ key: 'РСБУ', label: 'РСБУ отчётность' }, { key: 'МСФО', label: 'МСФО отчётность' }]} />
        <div style={{ flex: 1 }} />
        {standard === 'МСФО' && <Button size="xs" view="primary" label="Внести отчётность по МСФО" iconLeft={IconAdd as never} onClick={() => setEditing('new')} />}
        {!emptyIfrs && <Button size="xs" view="secondary" label={`${standard} отчётность (PDF)`} iconLeft={IconDownload as never} />}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
        <span><span className="pmrk-muted">Валюта отчётности: </span>рубль</span>
        <span><span className="pmrk-muted">Единица измерения: </span>тыс.</span>
      </div>

      {/* Проверка сходимости баланса: активы ≠ пассивы с отклонением больше 2 тыс. руб. на любую
          из отчётных дат — крупное уведомление над таблицами */}
      {!emptyIfrs && imbalances.length > 0 && (
        <div
          role="alert"
          style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '18px 20px', marginBottom: 16, borderRadius: 'var(--pmrk-radius-lg)', background: 'var(--pmrk-risk-4-bg)', border: '2px solid var(--pmrk-risk-4)' }}
        >
          <span style={{ flex: '0 0 40px', width: 40, height: 40, borderRadius: '50%', background: 'var(--pmrk-risk-4)', color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: '40px', textAlign: 'center' }}>!</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Проверьте отчётность</div>
            <div style={{ fontSize: 13.5 }}>
              Активы не равны пассивам (допустимое отклонение — до {BALANCE_TOLERANCE} тыс. руб.):
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5 }}>
              {imbalances.map((x) => (
                <li key={x.date}>на {dateRu(x.date)} — отклонение {money(Math.abs(x.diff), { unit: '' })} тыс. руб. ({x.diff > 0 ? 'активы больше пассивов' : 'пассивы больше активов'})</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {standard === 'МСФО' && ifrsEntries.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 6 }}>Внесённая отчётность по МСФО</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ifrsEntries.map((e) => (
              <button
                key={e.id}
                type="button"
                className="pmrk-filterchip"
                title="Открыть для редактирования"
                onClick={() => setEditing(e)}
                style={{ cursor: 'pointer' }}
              >
                {dateRu(e.date)} · {e.consolidated ? 'консолидированная' : 'отдельная'} · {e.status === 'Сформирована' ? 'сформирована' : 'черновик'}
              </button>
            ))}
          </div>
        </div>
      )}

      {emptyIfrs ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', border: '1px dashed var(--color-bg-border)', borderRadius: 'var(--pmrk-radius)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Отчётность по МСФО не сформирована</div>
          <div className="pmrk-muted" style={{ fontSize: 12.5, maxWidth: 520, margin: '0 auto 12px' }}>
            СПАРК отчётность по МСФО не передаёт. Внесите показатели вручную (источник — «Данные компании»): итоги, баланс и таблицы отчётов система сформирует сама.
          </div>
          <Button size="s" label="Внести отчётность по МСФО" iconLeft={IconAdd as never} onClick={() => setEditing('new')} />
        </div>
      ) : (
        st.blocks.map((block, bi) => (
          <div key={block.title} className="pmrk-table" style={{ overflow: 'hidden', marginTop: bi ? 16 : 0, maxWidth: STMT_LABEL_W + codeW + 120 * st.periods.length }}>
            {/* Ширина таблицы ограничена: колонка показателя — не шире STMT_LABEL_W, суммовые
                фиксированной ширины следуют сразу за ней, а не уезжают к правому краю
                карточки — так числа ближе к подписям и их проще сверять взглядом. */}
            <div className="pmrk-table__head">
              <div className="pmrk-th" style={{ flex: `1 1 ${STMT_LABEL_W}px`, minWidth: 0 }}>{block.title}</div>
              {hasCodes && <div className="pmrk-th" style={{ flex: '0 0 100px', minWidth: 0, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>Код строки</div>}
              {st.periods.map((d, i) => (
                // над датой периода — источник отчётности: «ФНС» (из СПАРК) или
                // «Данные компании» (внесено вручную); дата — ниже
                <div key={d} className="pmrk-th" style={{ flex: '0 0 120px', minWidth: 0, flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 1 }}>
                  <span
                    title={st.sources[i] === 'ФНС' ? 'Годовая отчётность из СПАРК (ГИР БО ФНС России)' : 'Отчётность внесена вручную'}
                    style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.85, whiteSpace: 'nowrap' }}
                  >
                    {st.sources[i]}
                  </span>
                  <span>{dateRu(d)}</span>
                </div>
              ))}
            </div>
            {block.rows.map((row, ri) => (
              <div key={ri} className="pmrk-tr" style={{ cursor: 'default', fontWeight: row.strong ? 700 : 400 }}>
                <div className="pmrk-td" style={{ flex: `1 1 ${STMT_LABEL_W}px`, minWidth: 0, paddingLeft: row.indent ? 20 : undefined }}>{row.label}</div>
                {hasCodes && <div className="pmrk-td pmrk-tnum pmrk-muted" style={{ flex: '0 0 100px', minWidth: 0, justifyContent: 'flex-end', display: 'flex', fontWeight: 400, fontSize: 12 }}>{row.code ?? ''}</div>}
                {row.values.map((v, i) => <div key={i} className="pmrk-td pmrk-tnum" style={{ flex: '0 0 120px', minWidth: 0, justifyContent: 'flex-end', display: 'flex' }}>{money(v, { unit: '' })}</div>)}
              </div>
            ))}
          </div>
        ))
      )}
      {!emptyIfrs && st.balanceCheck && imbalances.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--pmrk-risk-1)' }}>
          {standard === 'РСБУ' ? '✓ Проверка пройдена: активы = пассивам на каждую отчётную дату (ФТ-3.4).' : '✓ Проверка пройдена: активы = капитал + обязательства на каждую отчётную дату.'}
        </div>
      )}
      {!emptyIfrs && st.note && <div className="pmrk-muted" style={{ marginTop: 8, fontSize: 12 }}>{st.note}</div>}

      {editing && (
        <IfrsEntryModal
          entry={editing === 'new' ? null : editing}
          baseLines={ifrsEntries[0]?.lines ?? defaultIfrsLines()}
          takenDates={ifrsEntries.filter((e) => editing === 'new' || e.id !== editing.id).map((e) => e.date)}
          onClose={() => setEditing(null)}
          onSave={(e) => { saveIfrsEntry(c, e); setEditing(null); bump((n) => n + 1); }}
          onDelete={(id) => { deleteIfrsEntry(c, id); setEditing(null); bump((n) => n + 1); }}
        />
      )}
    </SectionCard>
  );
}

/** Реальный максимум раздела — доля от 100 (веса 45/30/25 из buildDirection).
    Суммы max отдельных строк внутри блока декоративные (не масштабируются
    под вес раздела), поэтому для чипа считаем от общего максимума 100, а не
    складываем их — иначе все три раздела показывали бы одинаковое «из 100». */
const BLOCK_MAX: Record<string, number> = { fin: 45, rep: 30, ext: 25 };

/** Компактная плашка балла по разделу (1/2/3) — на вкладке показываем только
    итог раздела, без построчной раскладки: она есть на «Полной оценке». */
function AssessmentScoreChip({ block }: { block: ScoreBlock }) {
  const max = BLOCK_MAX[block.key] ?? block.rows.reduce((s, r) => s + r.max, 0);
  const ratio = max ? block.subtotal / max : 0;
  // светофор без полутонов: заливка зелёная / жёлтая / красная, текст нейтральный
  const bg = ratio >= 0.6 ? 'rgba(10, 158, 84, 0.20)' : ratio >= 0.3 ? 'rgba(242, 194, 0, 0.30)' : 'rgba(224, 54, 59, 0.20)';
  return (
    <div style={{ flex: 1, minWidth: 130, padding: '10px 12px', borderRadius: 10, background: bg }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-typo-primary)' }}>{block.subtotal} <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>из {max}</span></div>
      <div style={{ fontSize: 11.5, marginTop: 2, color: 'var(--color-typo-primary)', opacity: 0.8 }}>{block.title.replace(/^\d+\.\s*/, '')}</div>
    </div>
  );
}

/** Плитка «значение + подпись» для дополнительных показателей оценки. */
function InfoTile({ value, caption, big }: { value: string; caption: string; big?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: big ? 170 : 130, padding: big ? '14px 16px' : '10px 12px', borderRadius: 10, background: 'var(--color-bg-secondary)' }}>
      <div className="pmrk-tnum" style={{ fontSize: big ? 26 : 16, fontWeight: big ? 800 : 700, lineHeight: big ? '30px' : undefined }}>{value}</div>
      <div className="pmrk-muted" style={{ fontSize: big ? 12.5 : 11.5, marginTop: 2 }}>{caption}</div>
    </div>
  );
}

const plural = (n: number, one: string, few: string, many: string) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;

/** Колонки компактной таблицы «Все экспресс-оценки» (под графиком, в левой колонке). */
const ALIGN_JUSTIFY = { left: undefined, center: 'center', right: 'flex-end' } as const;
const SCORE_COLS: { label: string; style: React.CSSProperties; align?: 'center' | 'right' }[] = [
  { label: 'Дата оценки', style: { flex: '0 0 94px' } },
  { label: 'Период отчётности', style: { flex: '0 0 94px' } },
  { label: 'Группа (1–4)', style: { flex: '0 0 56px' }, align: 'center' },
  { label: 'Скоринг-балл', style: { flex: '1 1 0' }, align: 'center' },
  { label: 'Доп. балл', style: { flex: '1 1 0' }, align: 'center' },
  { label: 'Штраф', style: { flex: '1 1 0' }, align: 'center' },
  { label: 'Кредитный лимит, тыс. руб.', style: { flex: '1.4 1 0' }, align: 'right' },
  { label: 'Лимит авансового платежа, тыс. руб.', style: { flex: '1.4 1 0' }, align: 'right' },
];

function AssessmentTab({ c }: { c: Counterparty }) {
  const navigate = useNavigate();
  const { aiOn } = useApp();
  const all = useMemo(() => buildAssessment(c), [c.uid]);
  // оценка одна — по методике покупателей нефти, газа и нефтепродуктов
  const dir: AssessDirection = 'OIL';
  const r = all[dir];
  const explain = SCORE_EXPLAIN[c.uid];
  const [showExplain, setShowExplain] = useState(false);
  const history = useMemo(
    () => c.assessments.filter((a) => a.direction === dir).slice().sort((x, y) => y.date.localeCompare(x.date)),
    [c.uid, dir],
  );
  // последняя оценка — источник и для панели результата, и для первой строки таблицы
  const last = history[0];
  const creditLimit = last?.limit ?? r.limit;
  const extras = assessmentExtras(c.uid, last ?? { id: c.uid, group: r.group, limit: r.limit });
  const indicators = creditIndicators(c, r.group);
  const claims = claimsSummary(c);
  const limitK = (v: number) => (v ? money(Math.round(v / 1000), { unit: '' }) : '—');

  return (
    <SectionCard title="Оценка кредитоспособности" extra={<DateActuality date={r.date} source="ядро scoring" />}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)', gap: 20 }}>
        <div>
          <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 6 }}>Динамика оценки кредитоспособности</div>
          <GroupDynamicsChart points={history.map((x) => ({ date: x.date, group: x.group, score: x.score }))} end={NOW} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--color-bg-border)' }}>
            <span className="pmrk-muted" style={{ fontSize: 11.5 }}>МЕТОДОЛОГИЯ: {r.method} «{r.label}»</span>
            <Button size="xs" view="ghost" label="Подробнее" onClick={() => navigate(`/assessments/${c.assessments[0]?.id ?? c.uid}`)} />
          </div>

          {/* «Все экспресс-оценки» под графиком, в левой колонке: компактная таблица
              (мелкий шрифт и отступы, без колонки «Категория» — она одна и показана
              в результате справа) */}
          <div style={{ marginTop: 50 }}>
            <ExtAccordion
              title="Все экспресс-оценки"
              collapsible={false}
              flush
              softHead
              extra={<span className="pmrk-chip" style={{ background: 'var(--color-bg-brand)', color: 'var(--color-bg-default)', fontSize: 11 }}>{history.length}</span>}
            >
              {history.length === 0 ? (
                <EmptyState text={`По направлению «${r.short}» сохранённых оценок ещё нет — показан предварительный расчёт по текущим данным.`} />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                <div className="pmrk-table" style={{ border: 0, borderTop: '2px solid #e0e5e9', borderRadius: '0 0 var(--pmrk-radius-lg) var(--pmrk-radius-lg)', overflow: 'visible', fontSize: 12, minWidth: 560 }}>
                  <div className="pmrk-table__head" style={{ position: 'static' }}>
                    {SCORE_COLS.map((col) => (
                      <div key={col.label} className="pmrk-th" style={{ ...col.style, minWidth: 0, padding: '7px 6px', fontSize: 10.5, lineHeight: 1.2, justifyContent: ALIGN_JUSTIFY[col.align ?? 'left'], textAlign: col.align ?? 'left', whiteSpace: 'normal' }}>{col.label}</div>
                    ))}
                  </div>
                  {history.map((x) => {
                    const ex = assessmentExtras(c.uid, x);
                    const cells = [dateRu(x.date), dateRu(x.reportPeriod), String(x.group), String(x.score), String(ex.extraPoints), ex.penalty ? `−${ex.penalty}` : '0', limitK(x.limit), limitK(ex.advanceLimit)];
                    return (
                      <div key={x.id} className="pmrk-tr" style={{ cursor: 'pointer' }} onClick={() => navigate(`/assessments/${x.id}`)}>
                        {SCORE_COLS.map((col, i) => (
                          <div key={col.label} className={`pmrk-td${col.align ? ' pmrk-tnum' : ''}`} style={{ ...col.style, minWidth: 0, padding: '8px 6px', justifyContent: ALIGN_JUSTIFY[col.align ?? 'left'], display: col.align ? 'flex' : undefined }}>{cells[i]}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
                </div>
              )}
            </ExtAccordion>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Результат последней оценки от {dateRu(r.date)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span className="pmrk-muted">Категория</span><span>{r.category}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}><span className="pmrk-muted">Период отчётности</span><span>{dateRu(last?.reportPeriod ?? c.asOf.statements ?? r.date)}</span></div>

          {/* лимиты — самые важные результаты оценки: сразу под периодом отчётности, очень крупно */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <InfoTile big value={limitK(creditLimit)} caption="Кредитный лимит, тыс. руб." />
            <InfoTile big value={limitK(extras.advanceLimit)} caption="Лимит авансового платежа, тыс. руб." />
          </div>

          {/* итог: группа и скоринг-балл — две сплошные синие полосы */}
          <div style={{ borderRadius: 'var(--pmrk-radius)', overflow: 'hidden', background: 'var(--color-bg-brand)', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', fontSize: 14, fontWeight: 700 }}>
              <span>Группа кредитоспособности (1–4)</span><span style={{ fontSize: 18 }}>{r.group}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', fontSize: 14, fontWeight: 700, borderTop: '1px solid rgba(255,255,255,0.28)' }}>
              <span>Скоринг-балл</span><span style={{ fontSize: 18 }}>{r.totalScore} <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85 }}>из 100</span></span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 12px' }}>
            <span className="pmrk-muted" style={{ fontSize: 12, flex: 1 }}>{r.groupText} · класс {r.contragentClass} · рейтинг {r.internalRating}</span>
            {aiOn && explain && (
              <button onClick={() => setShowExplain((v) => !v)} style={{ background: 'var(--pmrk-ai-bg)', border: '1px solid var(--pmrk-ai-border)', color: 'var(--pmrk-ai-strong)', borderRadius: 6, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }}>
                ✦ почему группа {r.group}?
              </button>
            )}
          </div>

          <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>Количество баллов по разделам</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {r.blocks.map((b) => <AssessmentScoreChip key={b.key} block={b} />)}
          </div>

          <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>Дополнительные показатели</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <InfoTile value={indicators.graph} caption="Графовый индикатор" />
            <InfoTile value={indicators.claim} caption="Исковый индикатор" />
            <InfoTile value={`${extras.extraPoints} ${plural(extras.extraPoints, 'балл', 'балла', 'баллов')}`} caption="Итого доп. баллы" />
          </div>

          <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 6 }}>Наличие претензионно-исковой работы с контрагентом</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <InfoTile value={claims.preTrial} caption="Наличие досудебных требований" />
            <InfoTile value={claims.lawsuits} caption="Наличие исковых требований" />
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <Button size="xs" view="secondary" label="Выгрузить XLSX" iconLeft={IconDownload as never} title="Шаблон Ш-13.08.01-01 «Оценка кредитоспособности контрагента»" onClick={() => { exportAssessmentToExcel(c).catch((e) => window.alert(`Не удалось сформировать файл: ${e instanceof Error ? e.message : e}`)); }} />
            <Button size="xs" view="ghost" label="Направить на почту" />
          </div>
        </div>
      </div>

      {showExplain && explain && (
        <div className="pmrk-ai-surface" style={{ marginTop: 16, padding: '14px 16px 14px 20px' }}>
          <div className="pmrk-ai-accentbar" />
          <div className="pmrk-ai__head"><span className="pmrk-ai__badge">✦ AI</span><span style={{ fontWeight: 600 }}>Объяснение оценки (AI-3) · число группы — детерминированное, AI вербализует</span></div>
          <div style={{ fontSize: 13, marginTop: 6 }}><b>Что изменилось:</b> {explain.delta}</div>
          <div style={{ fontSize: 13, marginTop: 6, color: 'var(--pmrk-ai-strong)' }}><b>Чувствительность:</b> {explain.toNextGroup}</div>
        </div>
      )}
    </SectionCard>
  );
}

// Порядок и подписи блоков — как в исходной системе: отдельный реестр новостей
// на каждый внешний источник (ContragentNewsList), а не общий поток.
const NEWS_SOURCES: NewsSource[] = ['Яндекс.Новости', 'bankrot.fedresurs.ru', 'pravo.ru', 'zakon.ru'];
const NEWS_SOURCE_TITLE: Record<NewsSource, string> = {
  'Яндекс.Новости': 'Топ новости с сайта Яндекс.Новости',
  'bankrot.fedresurs.ru': 'Новости (bankrot.fedresurs.ru)',
  'pravo.ru': 'Новости (pravo.ru)',
  'zakon.ru': 'Новости (zakon.ru)',
};

function NewsTab({ c }: { c: Counterparty }) {
  if (!c.news.length) return <SimpleTab title="Новости" text="По контрагенту нет значимых новостей за период." asOf={c.asOf.news} />;
  return (
    <SectionCard title="Новости" extra={<DateActuality date={c.asOf.news} source="PRIMO" />}>
      {NEWS_SOURCES.map((src) => {
        const items = c.news.filter((n) => n.source === src);
        // дата актуализации раздела-источника — по самой свежей новости из него,
        // иначе общая дата вкладки «Новости»
        const srcAsOf = items.reduce((m, n) => (n.date > m ? n.date : m), c.asOf.news ?? '');
        return (
          <ExtAccordion
            key={src}
            title={NEWS_SOURCE_TITLE[src]}
            defaultOpen={items.length > 0}
            extra={<DateActuality date={srcAsOf || undefined} source="PRIMO" />}
          >
            {items.length === 0 ? (
              <div className="pmrk-muted" style={{ fontSize: 13, padding: '4px 0' }}>Новостей не найдено.</div>
            ) : items.map((n) => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-bg-border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.sentiment === 'negative' ? 'var(--pmrk-risk-4)' : n.sentiment === 'positive' ? 'var(--pmrk-risk-1)' : 'var(--color-typo-ghost)' }} />
                  <span style={{ fontWeight: 600 }}>{n.title}</span>
                  <span className="pmrk-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{dateRu(n.date)}</span>
                </div>
                <div className="pmrk-muted" style={{ fontSize: 13, marginTop: 4, paddingLeft: 16 }}>{n.summary}</div>
              </div>
            ))}
          </ExtAccordion>
        );
      })}
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

/** Столбец таблицы претензионно-исковой работы. width — не пиксели, а «вес» колонки:
    таблицы плотные (до 18 столбцов, как в исходной системе), поэтому колонки делят
    ширину карточки пропорционально весу, текст в ячейках переносится, и вся таблица —
    с первой строкой — умещается на экране без горизонтальной прокрутки. */
interface LegalCol<T> { label: string; width: number; align?: 'right'; /** своя минимальная ширина, px (для статусов-чипов) */ min?: number; render: (row: T) => React.ReactNode }

function safeDateRu(v: string): string {
  return v && v !== '—' ? dateRu(v) : '—';
}

/** Минимальная ширина колонки, px: дата или сумма не должны ломаться посреди числа, а слова
    заголовков — рваться на слоги. Если карточка уже суммы минимумов — горизонтальная прокрутка. */
const legalColMin = (width: number, min?: number) => min ?? (width <= 140 ? 64 : Math.max(66, Math.round(width * 0.26)));

/** `fit` — режим вкладки «Претензионно-исковая работа» (LegalFitTable): оформление по образцу
    исходной системы (стили — .pmrk-legal в components.css), ширину колонок задают веса `width`. Без `fit` (расшифровка по договорам ДЗ/КЗ) — колонки фиксированной ширины
    и горизонтальная прокрутка. */
/** Таблица вкладки «Претензионно-исковая работа»: если колонки с комфортными минимумами не
    помещаются в карточку, вся таблица пропорционально уменьшается (CSS zoom, не меньше 0.7) —
    она целиком, с шапкой и первой строкой, видна на экране без горизонтальной прокрутки. */
function LegalFitTable<T extends { id: string }>({ columns, rows }: { columns: LegalCol<T>[]; rows: T[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setBox(el.clientWidth - 20); // минус боковые поля обёртки
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const need = columns.reduce((sum, col) => sum + legalColMin(col.width, col.min), 0);
  const scale = box > 0 && box < need ? Math.max(0.7, box / need) : 1;
  const flexOf = (col: LegalCol<T>) => `${col.width} 1 ${legalColMin(col.width, col.min)}px`;
  return (
    // таблица выходит за внутренние поля карточки (почти от края до края)
    <div ref={wrapRef} style={{ overflowX: 'auto', margin: '0 -18px', padding: '0 10px' }}>
      <div className="pmrk-table pmrk-legal" style={{ minWidth: need, width: scale < 1 ? need : undefined, zoom: scale }}>
        <div className="pmrk-table__head">
          {columns.map((col, i) => (
            <div key={i} className="pmrk-th" style={{ flex: flexOf(col) }}>{col.label}</div>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.id} className="pmrk-tr" style={{ cursor: 'default' }}>
            {columns.map((col, i) => (
              <div key={i} className="pmrk-td" style={{ flex: flexOf(col) }}>{col.render(r)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LegalWideTable<T extends { id: string }>({ columns, rows, empty, fit }: { columns: LegalCol<T>[]; rows: T[]; empty: string; fit?: boolean }) {
  if (!rows.length) return <EmptyState text={empty} />;
  if (fit) return <LegalFitTable columns={columns} rows={rows} />;
  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="pmrk-table" style={{ minWidth: columns.reduce((s, col) => s + col.width, 0) }}>
        <div className="pmrk-table__head">
          {columns.map((col, i) => (
            <div key={i} className="pmrk-th" style={{ flex: `0 0 ${col.width}px`, minWidth: 0, justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}>{col.label}</div>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.id} className="pmrk-tr" style={{ cursor: 'default', alignItems: 'flex-start' }}>
            {columns.map((col, i) => (
              <div key={i} className="pmrk-td" style={{ flex: `0 0 ${col.width}px`, minWidth: 0, justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start', display: 'flex', whiteSpace: 'normal' }}>{col.render(r)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
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
  const [curacao, setCuracao] = useState(false);
  const m = (n: number) => money(n, { unit: '' });

  // «Данные КЮРАСАО 2.0» — во всех 4 разделах один и тот же столбец: клик не
  // ведёт в саму систему (для этого нужны доступы через СУИД), а открывает
  // уведомление об этом — как и было в детальной карточке раньше.
  const curacaoCol = <T,>(): LegalCol<T> => ({
    label: 'Данные КЮРАСАО 2.0', width: 120,
    render: () => <a href="#" onClick={(e) => { e.preventDefault(); setCuracao(true); }} style={{ color: 'var(--color-typo-brand)', fontSize: 12 }}>Перейти</a>,
  });

  const claimCols: LegalCol<typeof legal.claims[0]>[] = [
    { label: 'Заявитель претензии', width: 190, render: (x) => x.applicant },
    { label: 'Направление деятельности, из которого возникла претензия', width: 170, render: (x) => x.activity },
    { label: 'Номер договора', width: 110, min: 76, render: (x) => x.contractNo },
    { label: 'Номер исходящей претензии', width: 130, min: 76, render: (x) => x.claimNo },
    { label: 'Дата направления претензии', width: 110, render: (x) => dateRu(x.sentDate) },
    { label: 'Предмет и основание претензии', width: 260, render: (x) => x.subject },
    { label: 'Сумма претензии (общая), руб.', width: 130, align: 'right', render: (x) => m(x.total) },
    { label: 'Основной долг, руб.', width: 110, align: 'right', render: (x) => m(x.principal) },
    { label: 'Неустойка, руб.', width: 100, align: 'right', render: (x) => m(x.penalty) },
    { label: 'Иное, руб.', width: 90, align: 'right', render: (x) => m(x.other) },
    { label: 'Удовлетворено, руб.', width: 110, align: 'right', render: (x) => m(x.satisfied) },
    { label: 'Событие по претензии', width: 180, render: (x) => x.event },
    { label: 'Дата события', width: 100, render: (x) => dateRu(x.eventDate) },
    { label: 'Статус', width: 150, min: 84, render: (x) => <StatusBadge status={x.status} /> },
    { label: 'Комментарий', width: 200, render: (x) => x.comment },
    { label: 'Связь с судебным делом', width: 140, min: 84, render: (x) => x.lawsuitLink },
    curacaoCol<typeof legal.claims[0]>(),
    { label: 'Юрист сопровождающий претензию', width: 170, render: (x) => x.lawyer },
  ];

  const lawsuitCols: LegalCol<typeof legal.lawsuits[0]>[] = [
    { label: 'Истец', width: 190, render: (x) => x.plaintiff },
    { label: 'Номер дела', width: 130, min: 80, render: (x) => x.caseNo },
    { label: 'Дата регистрации дела', width: 120, render: (x) => dateRu(x.regDate) },
    { label: 'Сумма иска текущая, руб.', width: 140, align: 'right', render: (x) => m(x.currentClaim) },
    { label: 'Удовлетворено, руб.', width: 110, align: 'right', render: (x) => m(x.satisfied) },
    { label: 'Текущая судебная инстанция', width: 170, render: (x) => x.instance },
    { label: 'Ближайшее судебное заседание', width: 130, render: (x) => dateRu(x.nextHearing) },
    { label: 'Статус дела', width: 150, min: 84, render: (x) => <StatusBadge status={x.status} /> },
    { label: 'Результат решения суда', width: 240, render: (x) => x.courtResult },
    { label: 'Исход дела', width: 160, render: (x) => x.outcome },
    { label: 'Связь с исполнительным производством', width: 150, render: (x) => x.enforcementLink },
    { label: 'Связь с делом о банкротстве', width: 150, render: (x) => x.bankruptcyLink },
    curacaoCol<typeof legal.lawsuits[0]>(),
    { label: 'Юрист сопровождающий претензию', width: 170, render: (x) => x.lawyer },
  ];

  const enfCols: LegalCol<typeof legal.enforcement[0]>[] = [
    { label: 'Взыскатель в исполнительном производстве', width: 200, render: (x) => x.claimant },
    { label: 'Название дела об исполнительном производстве', width: 220, render: (x) => x.caseName },
    { label: 'Дата создания дела об исполнительном производстве', width: 130, render: (x) => dateRu(x.createDate) },
    { label: 'Дата выдачи исполнительного листа', width: 130, render: (x) => dateRu(x.writDate) },
    { label: 'Исполнительный документ: серия и номер', width: 160, render: (x) => x.writSerial },
    { label: 'Сумма по исполнительному документу, руб.', width: 150, align: 'right', render: (x) => m(x.sumByDoc) },
    { label: 'Фактически получено, руб.', width: 130, align: 'right', render: (x) => m(x.received) },
    { label: 'Дата последнего платежа', width: 130, render: (x) => safeDateRu(x.lastPaymentDate) },
    { label: 'Планируемое событие по исполнительному производству', width: 190, render: (x) => x.plannedEvent },
    { label: 'Дата планируемого события по исполнительному производству', width: 150, render: (x) => safeDateRu(x.plannedDate) },
    { label: 'Комментарий по событию', width: 200, render: (x) => x.eventComment },
    { label: 'Отметка о фактическом выполнении', width: 150, render: (x) => x.completed },
    { label: 'Дата фактического завершения исполнительного производства', width: 150, render: (x) => safeDateRu(x.completionDate) },
    curacaoCol<typeof legal.enforcement[0]>(),
  ];

  const bankCols: LegalCol<typeof legal.bankruptcy[0]>[] = [
    { label: 'Кредитор в деле о банкротстве', width: 220, render: (x) => x.creditor },
    { label: 'Название дела о банкротстве', width: 220, render: (x) => x.caseName },
    { label: 'Стадия банкротства', width: 150, min: 84, render: (x) => <StatusBadge status={x.stage} /> },
    { label: 'Сумма требований Кредитора в реестре требований, руб.', width: 160, align: 'right', render: (x) => m(x.claimInRegistry) },
    { label: 'Сумма исполнения требований в деле о банкротстве, руб.', width: 160, align: 'right', render: (x) => m(x.execution) },
    { label: 'Дата последнего платежа', width: 130, render: (x) => safeDateRu(x.lastPaymentDate) },
    { label: 'Сумма последнего платежа, руб.', width: 140, align: 'right', render: (x) => m(x.lastPaymentSum) },
    { label: 'Планируемое событие по банкротному делу', width: 200, render: (x) => x.plannedEvent },
    { label: 'Дата планируемого события по банкротному делу', width: 150, render: (x) => safeDateRu(x.plannedDate) },
    { label: 'Описание события', width: 220, render: (x) => x.eventDescription },
    { label: 'Комментарий по делу о банкротстве', width: 220, render: (x) => x.comment },
    { label: 'Дата перехода в архив', width: 130, render: (x) => safeDateRu(x.archiveDate) },
    curacaoCol<typeof legal.bankruptcy[0]>(),
  ];

  return (
    <SectionCard title="Претензионно-исковая работа" extra={<DateActuality date={c.asOf.legal} source="КЮРАСАО 2.0" />}>
      <div style={{ marginBottom: 14 }}>
        <Segmented value={sec} onChange={setSec} items={SECTIONS.map((s) => ({ key: s.key, label: s.label, count: s.count }))} />
      </div>

      {sec === 'claims' && <LegalWideTable fit columns={claimCols} rows={legal.claims} empty="Данные по контрагенту отсутствуют" />}
      {sec === 'lawsuits' && <LegalWideTable fit columns={lawsuitCols} rows={legal.lawsuits} empty="Данные по контрагенту отсутствуют" />}
      {sec === 'enforcement' && <LegalWideTable fit columns={enfCols} rows={legal.enforcement} empty="Данные по контрагенту отсутствуют" />}
      {sec === 'bankruptcy' && <LegalWideTable fit columns={bankCols} rows={legal.bankruptcy} empty="Данные по контрагенту отсутствуют" />}

      {/* Уведомление о доступах КЮРАСАО 2.0 */}
      {curacao && (
        <SimpleOverlay onClose={() => setCuracao(false)} maxWidth="min(92vw, 440px)">
          <div style={{ padding: 22 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Переход в систему КЮРАСАО 2.0</h3>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 16 }}>Для перехода в систему КЮРАСАО 2.0 необходимо получить соответствующие доступы (через СУИД). При наличии доступов вы будете перенаправлены в систему.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="s" view="ghost" label="Закрыть" onClick={() => setCuracao(false)} />
              <Button size="s" label="Перейти в КЮРАСАО 2.0" onClick={() => setCuracao(false)} />
            </div>
          </div>
        </SimpleOverlay>
      )}
    </SectionCard>
  );
}

function CreditLimitTab({ c }: { c: Counterparty }) {
  const doLimits = useMemo(() => buildCreditLimitsByDo(c), [c.uid]);
  // Совокупный КЛ контрагента — сумма поля «Лимит» из таблицы ДО ниже: значение
  // и расчёт всегда согласованы по построению, а не «случайно совпадают».
  const groupAggregateLimit = useMemo(() => doLimits.reduce((sum, row) => sum + row.amountRub, 0), [doLimits]);
  // Совокупный КЛ аффилированных лиц — сумма утверждённых КЛ связанных компаний
  // (владельцы/бенефициары/ДО/аффилиаты из диаграммы аффилированности), у которых
  // есть карточка в реестре ПМРК.
  const affiliatedLimit = useMemo(() => affiliatedCreditLimit(c), [c.uid]);

  const summaryIndicators: Indicator[] = [
    { label: 'Совокупный кредитный лимит контрагента, руб.', value: money(groupAggregateLimit, { unit: '' }) },
    { label: 'Совокупный кредитный лимит аффилированных лиц, руб.', value: money(affiliatedLimit, { unit: '' }) },
    { label: 'Совокупный кредитный лимит контрагента и аффилированных лиц, руб.', value: money(groupAggregateLimit + affiliatedLimit, { unit: '' }) },
  ];

  const m = (n: number) => money(n, { unit: '' });
  type KlRow = (typeof doLimits)[number] & { id: string };
  const limitCols: LegalCol<KlRow>[] = [
    { label: 'Наименование ДО ГК ГПН', width: 150, render: (r) => r.subsidiary },
    { label: 'Действительность', width: 100, render: (r) => (isDoLimitActive(r) ? 'Да' : 'Нет') },
    { label: 'Сегмент', width: 150, render: (r) => r.segment },
    { label: 'Утверждённый кредитный лимит, валюта', width: 130, render: (r) => m(r.amountRub) },
    { label: 'Валюта утверждённого КЛ', width: 100, render: () => 'рубль' },
    { label: 'Утверждённый кредитный лимит, руб.', width: 130, render: (r) => m(r.amountRub) },
    { label: 'Утверждённая отсрочка платежа, кол-во дней', width: 110, render: (r) => r.deferralDays },
    { label: 'Коллегиальный орган, утвердивший КЛ', width: 140, render: (r) => r.approvalBody },
    { label: 'Реквизиты документа, согласно которому утверждён КЛ', width: 160, render: (r) => r.documentRef },
    { label: 'Утверждённая дата начала действия КЛ', width: 120, render: (r) => dateRu(r.startDate) },
    { label: 'Утверждённая дата окончания действия КЛ', width: 120, render: (r) => dateRu(r.endDate) },
    { label: 'Описание обеспечения', width: 130, render: (r) => (r.collateral === 'нет' ? 'Без обеспечения' : r.collateral) },
    { label: 'Комментарии по обеспечению', width: 150, render: (r) => r.comment || '' },
  ];
  // заявки по контрагенту: у ещё не утверждённых заявок лимит, валюта и даты в реестре пустые («-»)
  const requests = useMemo(() => LIMIT_REQUESTS.filter((q) => q.counterpartyUid === c.uid), [c.uid]);
  const requestCols: LegalCol<(typeof requests)[number]>[] = [
    { label: 'Номер заявки', width: 120, render: (q) => q.number },
    { label: 'Наименование ДО ГК ГПН', width: 160, render: (q) => q.subsidiary },
    { label: 'Действительность', width: 100, render: (q) => (q.status === 'Утверждено' ? 'Да' : 'Нет') },
    { label: 'Утверждённый кредитный лимит, валюта', width: 140, render: (q) => (q.status === 'Утверждено' ? m(q.requestedLimit) : '-') },
    { label: 'Валюта утверждённого КЛ', width: 110, render: (q) => (q.status === 'Утверждено' ? 'рубль' : '-') },
    { label: 'Утверждённый кредитный лимит, руб.', width: 140, render: (q) => (q.status === 'Утверждено' ? m(q.requestedLimit) : '-') },
    { label: 'Утверждённая отсрочка платежа, кол-во дней', width: 120, render: (q) => (q.status === 'Утверждено' ? q.deferralDays : '-') },
    { label: 'Утверждённая дата начала действия КЛ', width: 130, render: (q) => (q.status === 'Утверждено' ? dateRu(q.createdAt) : '-') },
    { label: 'Утверждённая дата окончания действия КЛ', width: 130, render: () => '-' },
    { label: 'Статус заявки', width: 140, min: 90, render: (q) => <StatusBadge status={q.status} /> },
  ];

  return (
    <>
      {/* Сводка — тем же компонентом и тем же списочным стилем, что и «Налоги
          и взносы» во «Внешней информации» (обычный indicators-список внутри
          ExtAccordion, без отдельной вёрстки). */}
      <ExtAccordion
        title="Утверждённый совокупный кредитный лимит по ГК Газпром нефть"
        indicators={summaryIndicators}
        defaultOpen
        valueLeft
        extra={<DateActuality date={c.asOf['credit-limit']} source="limit-workflow" />}
      />

      {/* Утверждённые КЛ самого контрагента по ДО ГК ГПН (реестр «Кредитные лимиты», ФТ-1.7) —
          раскладка совокупного КЛ из блока выше; колонки и порядок — как в исходной системе. */}
      <ExtAccordion
        title="Утверждённые кредитные лимиты по ГК Газпром нефть"
        defaultOpen
        flush
        extra={<DateActuality date={c.asOf['credit-limit']} source="Реестр КЛ ГК ГПН" />}
      >
        <div style={{ paddingBottom: 10 }}>
          <LegalWideTable
            fit
            columns={limitCols}
            rows={doLimits.map((r, i) => ({ ...r, id: `kl-${i}` }))}
            empty="Действующих лимитов по ДО нет — заявка на открытие КЛ не подавалась или отклонена."
          />
        </div>
      </ExtAccordion>

      {/* Заявки на кредитный лимит, поданные через платформу — по контрагенту */}
      <ExtAccordion
        title="Заявки на кредитный лимит (платформа)"
        defaultOpen
        flush
        extra={<DateActuality date={c.asOf['credit-limit']} source="limit-workflow" />}
      >
        <div style={{ paddingBottom: 10 }}>
          <LegalWideTable
            fit
            columns={requestCols}
            rows={requests}
            empty="Заявок на кредитный лимит по контрагенту нет."
          />
        </div>
      </ExtAccordion>

    </>
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
          <div className="pmrk-table__head"><div className="pmrk-th" style={{ flex: 1 }}>Заявка</div><div className="pmrk-th" style={{ flex: 1, justifyContent: 'flex-end' }}>Лимит авансирования, руб.</div><div className="pmrk-th" style={{ flex: 1 }}>Дата</div><div className="pmrk-th" style={{ flex: 1 }}>Статус</div></div>
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
            <div style={{ fontWeight: 600, fontSize: 13 }}>КЛ {moneyCompactText(c.creditLimit)}</div>
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
