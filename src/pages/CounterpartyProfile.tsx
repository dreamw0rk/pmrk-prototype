import { Fragment, useEffect, useId, useMemo, useState } from 'react';
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
import { IconSearchStroked } from '@consta/icons/IconSearchStroked';
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
import { BY_UID, GRAPHS, groupLabel, NOW, BLOCKS, type BlockCode } from '@/shared/mock/data';
import { AI_SUMMARY, AI_GROUP_RISK, SCORE_EXPLAIN } from '@/shared/mock/ai';
import { useMockQuery } from '@/shared/mock/useMockQuery';
import { buildExternal, rbSignal, type Indicator } from '@/shared/mock/external';
import { buildLegal } from '@/shared/mock/legal';
import { buildCreditLimitsByDo, isDoLimitActive, activeCreditLimit } from '@/shared/mock/creditLimits';
import { buildDoLinks, type DoLink } from '@/shared/mock/subsidiaries';
import { buildAdditionalOkveds } from '@/shared/mock/okved';
import { buildNameChanges } from '@/shared/mock/nameHistory';
import { buildDzKzTable, exportDzKzToExcel, MONTH_NAMES, shortDoLabel } from '@/shared/mock/dzKzMatrix';
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

/** Отчёты по контрагенту (ФТ-1.16…1.19) — плитки в шапке профиля. Путь строится
    как `/report/{uid}{to}`, поэтому у «Профиля контрагента» to пустой. */
const REPORT_TILES = [
  { to: '/egrul', label: 'Скачать ЕГРЮЛ', icon: IconFileDocument, title: 'Сформировать и скачать выписку из ЕГРЮЛ/ЕГРИП, .pdf (ФТ-1.16)' },
  { to: '', label: 'Скачать профиль', icon: IconFilePDF, title: 'Сформировать и скачать отчет «Профиль контрагента», .pdf (ФТ-1.17)' },
  { to: '/spark', label: 'Скачать СПАРК-Профиль', icon: IconDocExport, title: 'Сформировать и скачать расширенный отчет «СПАРК-Профиль», .pdf (ФТ-1.18)' },
  { to: '/spark-risks', label: 'Скачать СПАРК-Риски', icon: IconAlert, title: 'Сформировать и скачать отчет «СПАРК-Риски», .pdf (ФТ-1.19)' },
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

  /* Кнопки самой карточки — рядом с названием контрагента: это действия над
     контрагентом, а не над разделом, и у заголовка они не растягивают шапку по
     высоте (в правой колонке они стояли над панелью отчётов и разводили колонки). */
  const cardActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
      <Button size="s" view={fav ? 'primary' : 'ghost'} onlyIcon iconLeft={(fav ? IconFavoriteFilled : IconFavoriteStroked) as never} onClick={() => setFav((v) => !v)} title="В избранное" />
      {subscribed && (
        <span title='Ранее Вы уже подписались на уведомления по всем контрагентам Блока/БЕ или ДО. Изменить/отменить подписку по контрагентам можно в разделе «Мои оповещения»' style={{ color: 'var(--color-typo-secondary)', cursor: 'help', fontSize: 14 }}>ⓘ</span>
      )}
      <Button size="s" view={subscribed ? 'primary' : 'secondary'} label={subscribed ? 'Вы подписаны' : 'Подписаться'} iconLeft={IconRing as never} onClick={() => setSubscribed((v) => !v)} />
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
          position: 'sticky', top: 0, zIndex: 3,
          background: 'var(--color-bg-default)',
          borderBottom: '1px solid var(--color-bg-border)',
          boxShadow: scrolled ? 'var(--pmrk-shadow-2)' : 'none',
          transition: 'box-shadow .15s',
        }}
      >
      <div style={{ maxWidth: 'var(--pmrk-content-max)', margin: '0 auto', padding: '14px 14px 0' }}>
        {skin !== 'sfk' && (
          <div className="pmrk-breadcrumbs">
            <a onClick={() => navigate('/registry')} style={{ cursor: 'pointer' }}>Реестр контрагентов</a> / {c.shortName}
          </div>
        )}
        {/* flexWrap: на узком экране панель отчётов переносится под реквизиты,
            а не сжимает заголовок с бейджами до нечитаемого столбца. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            {skin !== 'sfk' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 6px' }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                  {c.name}
                  {c.underSanctions && <span style={{ color: 'var(--pmrk-risk-4)', fontSize: 15, fontWeight: 600 }}> (Находится под санкциями)</span>}
                </h1>
                {cardActions}
              </div>
            )}
            {/* реквизиты — одной строкой через точки-разделители: три блока
                почти одинакового веса делали шапку рыхлой, теперь это одна
                тихая подпись под названием */}
            <div style={{ fontSize: 12.5, color: 'var(--color-typo-secondary)', lineHeight: 1.5 }}>
              ИНН {fmtInn(c.inn)} · КПП {c.kpp} · ОГРН {c.ogrn} · Статус по СПАРК: {c.status}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <GroupBadge group={c.group} withScore={c.score} />
              <RbIndicator value={c.rbIndex} />
              {c.underSanctions && <SanctionBadge />}
              {c.specialControl && <StatusBadge status="Особый контроль" />}
              <StatusBadge status={c.status} />
              {/* в скине СФК заголовка на странице нет (он в топбаре оболочки),
                  поэтому кнопки карточки остаются в строке бейджей */}
              {skin === 'sfk' && <div style={{ marginLeft: 'auto' }}>{cardActions}</div>}
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
          <div style={{ flex: 1, minWidth: 460, maxWidth: 620 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
              {REPORT_TILES.map((r) => {
                const TileIcon = r.icon;
                return (
                  <button
                    key={r.to}
                    onClick={() => navigate(`/report/${c.uid}${r.to}`)}
                    title={r.title}
                    className="pmrk-clickable"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0, textAlign: 'left', padding: '10px 12px', border: '1px solid var(--color-bg-border)', borderRadius: 12, background: 'var(--color-bg-default)', cursor: 'pointer' }}
                  >
                    <TileIcon size="m" style={{ color: 'var(--color-typo-brand)', flex: 'none' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{r.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
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
      </div>

      {/* контент вкладок — на общей сетке страницы, под «липкой» панелью */}
      <div className="pmrk-page">
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

/** Группа блока ГК в составе «Работает с ДО» — сворачиваемая: заголовок с
    шевроном и кодом блока (БЛПС, БРД …), под ним строки его ДО со сдвигом
    вправо. Без шеврона и сдвига строки блоков сливались в одну простыню и
    принадлежность ДО к блоку читалась плохо. */
function DoBlockGroup({ block, name, items }: { block: string; name?: string; items: DoLink[] }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <div
        className="pmrk-clickable"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-bg-border)', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--color-typo-secondary)', width: 12, display: 'inline-block' }}>▸</span>
        <span className="pmrk-chip" style={{ background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', border: '1px solid var(--color-bg-border)', fontSize: 11.5, fontWeight: 700 }}>{block}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{name ?? 'Блок не определён'}</span>
        <span className="pmrk-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{items.length} ДО</span>
      </div>
      {open && items.map((link) => (
        <div key={link.subsidiary} className="pmrk-tr" style={{ cursor: 'default', alignItems: 'flex-start' }}>
          {/* отступ и тонкая направляющая слева: строка визуально принадлежит
              блоку выше. Направляющая в 1px — вложенность держится на отступе,
              полоса лишь поддерживает её, не превращаясь в цветной ярлык */}
          <div className="pmrk-td" style={{ flex: 1.8, fontWeight: 600, whiteSpace: 'normal', paddingLeft: 32, borderLeft: '1px solid var(--color-bg-border)' }}>
            {link.subsidiary}
            {/* основное ДО карточки — то самое значение поля «Работает с ДО» */}
            {link.primary && (
              <span className="pmrk-chip" style={{ marginLeft: 8, background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11, fontWeight: 500 }}>основное</span>
            )}
          </div>
          <div className="pmrk-td pmrk-tnum" style={{ flex: 0.9 }}>{link.inn}</div>
          <div className="pmrk-td" style={{ flex: 1.3, whiteSpace: 'normal' }}>{link.segment}</div>
        </div>
      ))}
    </>
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
    <SectionCard
      collapsible
      defaultOpen={false}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Дополнительные виды деятельности
          <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11 }}>
            {okveds.length}
          </span>
        </span>
      }
      extra={<DateActuality date={c.asOf.general} source="ЕГРЮЛ" />}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', marginBottom: 12, maxWidth: 420, border: '1px solid var(--color-bg-border)', borderRadius: 10, background: 'var(--color-bg-default)' }}>
        <IconSearchStroked size="xs" className="pmrk-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Код или наименование вида деятельности"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-typo-primary)' }}
        />
      </div>

      <div className="pmrk-table">
        <div className="pmrk-table__head">
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
    </SectionCard>
  );
}

/** «Изменения в наименовании и организационно-правовой форме» (ЕГРЮЛ) — история
    переименований/смены ОПФ. У большинства карточек изменений не было, тогда
    вместо таблицы — пояснение, а не пустой список. */
function NameChangesCard({ c }: { c: Counterparty }) {
  const changes = useMemo(() => buildNameChanges(c), [c.uid]);

  return (
    <SectionCard
      collapsible
      defaultOpen={false}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          Изменения в наименовании и организационно-правовой форме
          <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11 }}>
            {changes.length}
          </span>
        </span>
      }
      extra={<DateActuality date={c.asOf.general} source="ЕГРЮЛ" />}
    >
      {changes.length ? (
        <div className="pmrk-table">
          <div className="pmrk-table__head">
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
    </SectionCard>
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
        name: BLOCKS[block as BlockCode] as string | undefined,
        items: [...items].sort((x, y) => Number(y.primary) - Number(x.primary) || x.subsidiary.localeCompare(y.subsidiary, 'ru')),
      }));
  }, [doLinks]);

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

      <AdditionalOkvedsCard c={c} />
      <NameChangesCard c={c} />

      {/* «Работает с ДО» (ФТ-19.1) — отдельный сворачиваемый блок, а не девятое
          поле карточки: ДО у контрагента несколько, и важно не только «с кем», но
          и «в каком блоке ГК» — по блокам сводится управленческая отчётность
          (ФТ-22.3 «Блок → ДО → итог»). Раскрытым нужен не всем, отсюда сворачивание. */}
      <SectionCard
        collapsible
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Работает с ДО
            <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-secondary)', fontSize: 11 }}>
              {doLinks.length} ДО · {doGroups.length} {doGroups.length === 1 ? 'блок' : doGroups.length < 5 ? 'блока' : 'блоков'}
            </span>
          </span>
        }
        extra={<DateActuality date={c.asOf.general} source="справочник ДО ГК ГПН" />}
      >
        <div className="pmrk-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          Дочерние общества ГК «Газпром нефть», работающие с контрагентом, — по блокам. Условия работы по каждому ДО (кредитный лимит, отсрочка, обеспечение) — на вкладке «Кредитный лимит».
        </div>

        <div className="pmrk-table">
          <div className="pmrk-table__head">
            {/* +1px к отступу — на ширину направляющей у строк ДО, чтобы шапка и
                данные были выровнены по одной вертикали */}
            <div className="pmrk-th" style={{ flex: 1.8, paddingLeft: 33 }}>Наименование ДО</div>
            <div className="pmrk-th" style={{ flex: 0.9 }}>ИНН</div>
            <div className="pmrk-th" style={{ flex: 1.3 }}>Направление работы</div>
          </div>
          {doGroups.map((g) => (
            <DoBlockGroup key={g.block} block={g.block} name={g.name} items={g.items} />
          ))}
        </div>
      </SectionCard>
    </>
  );
}

const extLevelColor = (l?: string) => (l === 'high' ? 'var(--pmrk-risk-4)' : l === 'medium' ? 'var(--pmrk-risk-3)' : l === 'low' ? 'var(--pmrk-risk-1)' : 'var(--color-typo-primary)');

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
function SparkGauge({ value, max, color, size = 66 }: { value: number; max: number; color: string; size?: number }) {
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
function SparkLevelRing({ level, color, size = 66 }: { level: 'low' | 'medium' | 'high'; color: string; size?: number }) {
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
const SPARK_SCALES: Record<string, { kind: 'level' } | { kind: 'gauge'; max: number; scale: string }> = {
  'Сводный риск': { kind: 'level' },
  'Индекс финансового риска (ИФР)': { kind: 'level' },
  'Индекс должной осмотрительности (ИДО)': { kind: 'gauge', max: 99, scale: '1–99 · выше — рискованнее' },
  'Индекс платёжной дисциплины (ИПД)': { kind: 'gauge', max: 100, scale: 'Paydex 0–100 · выше — лучше' },
};

/** Визуальное представление значения индикатора в строке списка — цветная точка
    и значение. Крупные шкалы вынесены в сводку раздела (SparkIndicatorCard):
    в списке они дублировали бы её и растягивали строки. */
function IndicatorVisual({ ind }: { ind: Indicator }) {
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

/** Короткие подписи для сводки — полные названия там не нужны. */
const SHORT_LABEL: Record<string, string> = {
  'Сводный риск': 'Сводный риск',
  'Индекс должной осмотрительности (ИДО)': 'ИДО',
  'Индекс финансового риска (ИФР)': 'ИФР',
  'Индекс платёжной дисциплины (ИПД)': 'ИПД',
};

/** Карточка одного индикатора в сводке: подпись, круговая шкала СПАРК, значение
    словами и расшифровка шкалы. У ИПД значение приходит как «{N} / 100» — в
    кольцо идёт только числитель, постоянный знаменатель на каждой шкале ничего
    не сообщает и не поместился бы читаемо. */
function SparkIndicatorCard({ ind }: { ind: Indicator }) {
  const scale = SPARK_SCALES[ind.label];
  const color = extLevelColor(ind.level);
  const level = (ind.level ?? 'low') as 'low' | 'medium' | 'high';
  const numeric = Number(ind.value.split(' ')[0].replace(',', '.'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 10px', border: '1px solid var(--color-bg-border)', borderRadius: 12, background: 'var(--color-bg-default)', minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-typo-secondary)', textAlign: 'center' }}>
        {SHORT_LABEL[ind.label] ?? ind.label}
        {ind.tip && <span title={ind.tip} style={{ marginLeft: 4, cursor: 'help', color: 'var(--color-typo-ghost)', fontSize: 11 }}>ⓘ</span>}
      </span>
      {scale && scale.kind === 'gauge' && Number.isFinite(numeric) ? (
        <>
          <SparkGauge value={numeric} max={scale.max} color={color} />
          {/* число уже в центре шкалы — под ней только диапазон и направление шкалы */}
          <span className="pmrk-muted" style={{ marginTop: 'auto', fontSize: 11, textAlign: 'center', lineHeight: 1.3 }}>{scale.scale}</span>
        </>
      ) : (
        <>
          <SparkLevelRing level={level} color={color} />
          {/* marginTop: auto — подписи всех карточек ряда стоят на одной линии,
              независимо от того, в сколько строк уложилась расшифровка шкалы */}
          <span style={{ marginTop: 'auto', fontSize: 13, fontWeight: 600, color, textAlign: 'center' }}>{ind.value}</span>
        </>
      )}
    </div>
  );
}

/** Сводка раздела «1. Финансовые индикаторы риска СПАРК» — четыре ключевых
    показателя карточками со шкалами в стилистике источника, над списком
    остальных значений раздела. Значения те же, что в списке ниже; карточки
    дают быстрый ответ «как дела», список — полную расшифровку. */
function RiskSummaryBar({ indicators }: { indicators: Indicator[] }) {
  const cards = indicators.filter((ind) => SPARK_SCALES[ind.label]);
  if (cards.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: 8, padding: '8px 0 12px', marginBottom: 10, borderBottom: '1px solid var(--color-bg-border)' }}>
      {cards.map((ind, i) => <SparkIndicatorCard key={i} ind={ind} />)}
    </div>
  );
}

function ExtAccordion({ title, indicators, defaultOpen, beforeIndicators, children }: { title: string; indicators?: Indicator[]; defaultOpen?: boolean; beforeIndicators?: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const risky = indicators?.filter((i) => i.level === 'high' || i.level === 'medium').length ?? 0;
  return (
    <div className="pmrk-card" style={{ marginBottom: 8, overflow: 'hidden' }}>
      {/* заголовок раздела — те же классы, что и у шапки SectionCard: разделы
          «Внешней информации» это такие же разделы, и брендовая плашка должна
          быть у них общая, а не своя разметка со своими отступами */}
      <div className="pmrk-card__head pmrk-clickable" style={{ marginBottom: 0, cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <div className="pmrk-card__title" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'currentColor', opacity: 0.8 }}>▸</span>
          {title}
        </div>
        {risky > 0 && <span className="pmrk-chip" style={{ background: 'var(--pmrk-risk-3-bg)', color: 'var(--pmrk-risk-3)', fontSize: 11 }}>{risky} сигнал.</span>}
      </div>
      {open && (
        <div style={{ padding: '10px 16px 12px' }}>
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

          {/* Санкции — сразу после «Риск-индикаторов по данным СПАРК» (порядок ЕДТ),
              раздел скрыт при отсутствии записей (ФТ-1.3) */}
          {s.key === 's2' && ext.sanctions.length > 0 && (
            <ExtAccordion
              title="Санкции по данным СПАРК"
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
  const [month, setMonth] = useState(NOW.getMonth());
  const [year, setYear] = useState(NOW.getFullYear());
  const dzKz = useMemo(() => buildDzKzTable(c, month, year), [c.uid, month, year]);
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
  const fmtCell = (v: number | undefined) => (v ? money(v, { unit: '' }) : '—');
  const selectStyle: React.CSSProperties = { height: 32, border: '1px solid var(--color-bg-border)', borderRadius: 8, padding: '0 10px', background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', fontSize: 13 };
  const stickyCol: React.CSSProperties = { position: 'sticky', left: 0, background: 'var(--color-bg-default)', zIndex: 1 };

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
                <th rowSpan={2} style={{ ...stickyCol, minWidth: 280, textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid var(--color-bg-border)', borderRight: '1px solid var(--color-bg-border)', color: 'var(--color-typo-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.02em', zIndex: 2 }}>
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
              {dzKz.rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...stickyCol, padding: '8px 12px', paddingLeft: 12 + r.indent * 16, borderBottom: '1px solid var(--color-bg-border)', borderRight: '1px solid var(--color-bg-border)', fontWeight: r.indent === 0 ? 600 : 400, whiteSpace: 'normal' }}>
                    {r.label}
                  </td>
                  {allCols.map((col) => (
                    <td key={col.name} className="pmrk-tnum" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-bg-border)', textAlign: 'right' }}>
                      {fmtCell(r.values[col.name])}
                    </td>
                  ))}
                  <td className="pmrk-tnum" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-bg-border)', textAlign: 'right', fontWeight: 700 }}>
                    {fmtCell(r.total)}
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
    </SectionCard>
  );
}

function StatementsTab({ c }: { c: Counterparty }) {
  // Столбцы — по убыванию: текущий год и два предыдущих. Прошедший (завершённый)
  // год подписан датой закрытия периода (31.12.YYYY), текущий, ещё не прошедший, —
  // последней доступной датой отчётности контрагента (c.asOf.statements),
  // а не годом: иначе непонятно, на какую дату фактически приведены цифры.
  const periodYears = [NOW.getFullYear(), NOW.getFullYear() - 1, NOW.getFullYear() - 2];
  const periodLabel = (year: number) => (year < NOW.getFullYear() ? dateRu(`${year}-12-31`) : dateRu(c.asOf.statements ?? NOW));

  return (
    <SectionCard title="Отчётность (Ф1–Ф4 за 3 периода)" extra={<DateActuality date={c.asOf.statements} source="СПАРК / ручной ввод" />}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Button size="xs" view="secondary" label="РСБУ отчётность (PDF)" iconLeft={IconDownload as never} />
        <span className="pmrk-muted" style={{ fontSize: 12, alignSelf: 'center' }}>Стандарт: РСБУ · валюта ₽ · тыс. руб.</span>
      </div>
      <div className="pmrk-table" style={{ overflow: 'hidden' }}>
        {/* Колонка показателя — резиновая (flex:1), суммовые — узкие и фиксированной
            ширины (не растут на всю оставшуюся ширину карточки), поэтому стоят
            вплотную друг к другу справа — так проще сверять числа взглядом. */}
        <div className="pmrk-table__head">
          <div className="pmrk-th" style={{ flex: 1 }}>Показатель (Форма №1)</div>
          {periodYears.map((year) => <div key={year} className="pmrk-th" style={{ flex: '0 0 120px', justifyContent: 'flex-end' }}>{periodLabel(year)}</div>)}
        </div>
        {[['Внеоборотные активы', 0.3], ['Оборотные активы', 0.7], ['БАЛАНС (актив)', 1], ['Капитал и резервы', 0.35], ['Долгосрочные обязательства', 0.2], ['Краткосрочные обязательства', 0.45], ['БАЛАНС (пассив)', 1]].map(([label, k]) => (
          <div key={label as string} className="pmrk-tr" style={{ cursor: 'default', fontWeight: (label as string).includes('БАЛАНС') ? 700 : 400 }}>
            <div className="pmrk-td" style={{ flex: 1 }}>{label}</div>
            {[1, 0.96, 0.9].map((y, i) => <div key={i} className="pmrk-td pmrk-tnum" style={{ flex: '0 0 120px', justifyContent: 'flex-end', display: 'flex' }}>{money(Math.round((c.revenue * 0.4 * (k as number)) * y / 1000), { unit: '' })}</div>)}
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
