import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { IconAdd } from '@consta/icons/IconAdd';
import { IconForward } from '@consta/icons/IconForward';
import { IconCalculator } from '@consta/icons/IconCalculator';
import { IconDocFilled } from '@consta/icons/IconDocFilled';
import { IconDownload } from '@consta/icons/IconDownload';
import { IconConnection } from '@consta/icons/IconConnection';
import { useApp } from '@/app/AppContext';
import { ROLES, can } from '@/shared/roles';
import { PageHeader, SectionCard, GroupBadge, Stat, KriList, severityColor, SEVERITY_LABEL } from '@/shared/ui/kit';
import { TaskRow } from '@/shared/ui/TaskRow';
import { Sparkline } from '@/shared/ui/MiniChart';
import { AI_DIGEST } from '@/shared/mock/ai';
import { SIGNALS, TASKS, LIMIT_REQUESTS, FAVORITES, BY_UID, REGISTRY, KRI, REPORTING_PERIOD } from '@/shared/mock/data';
import { ago, moneyCompact, moneyCompactText, dateRu } from '@/shared/format';

const DASHBOARDS = [
  { title: 'Риск-индикаторы по контрагентам ГК ГПН', suid: 'СУИД: PMRK_DASH_RISK', trend: [4, 5, 6, 5, 7, 8, 9], color: 'var(--pmrk-risk-3)' },
  { title: 'Мониторинг ДЗ и ПДЗ', suid: 'СУИД: PMRK_DASH_DZ', trend: [3, 3, 4, 4, 5, 6, 7], color: 'var(--color-bg-brand)' },
  { title: 'Мониторинг авансов', suid: 'СУИД: PMRK_DASH_ADV', trend: [6, 5, 5, 4, 4, 3, 3], color: 'var(--pmrk-risk-1)' },
  { title: 'Мониторинг КЗ', suid: 'СУИД: PMRK_DASH_KZ', trend: [2, 3, 3, 4, 3, 4, 5], color: 'var(--pmrk-risk-2)' },
];

export function CommandCenter() {
  const { role, aiOn } = useApp();
  const navigate = useNavigate();
  const def = ROLES[role];
  const light = def.profile === 'light';

  // У роли «Пользователь» (профиль light, ~4900 чел.) портфеля нет: раздел скрыт
  // в меню, а прямой заход возвращаем на главную с поиском.
  if (light) return <Navigate to="/" replace />;

  const topSignals = SIGNALS.slice(0, 6);
  const myTasks = TASKS.filter((t) => t.status !== 'completed');
  const myRequests = LIMIT_REQUESTS.filter((r) => r.status !== 'Утверждено');

  return (
    <div className="pmrk-page">
      <PageHeader
        title={`Доброе утро, ${def.short === 'Контролёр ДО' ? 'Елена' : def.short}`}
        subtitle={`${def.title} · ваш портфель и то, что требует внимания сегодня`}
        actions={
          <>
            <Button size="s" view="secondary" label="Найти контрагента" iconLeft={IconForward as never} onClick={() => navigate('/registry')} />
            {can(role, 'editAssessment') && <Button size="s" label="Новая оценка" iconLeft={IconAdd as never} onClick={() => navigate('/assessments/new')} />}
          </>
        }
      />

      {/* Полоса отчётного периода (идея из СФК) — опинионированный дефолт/дедлайн */}
      {!light && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 16, background: 'var(--color-bg-default)', border: '1px solid var(--color-bg-border)', borderRadius: 'var(--pmrk-radius-lg)' }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--pmrk-risk-3-bg)', color: 'var(--pmrk-risk-3-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flex: 'none' }}>◷</span>
          <span style={{ fontSize: 13.5 }}>Отчётный период · <b>{REPORTING_PERIOD.module}</b>: {REPORTING_PERIOD.label}</span>
          <span style={{ flex: 1 }} />
          <span className="pmrk-muted" style={{ fontSize: 12.5 }}>до {dateRu(REPORTING_PERIOD.deadline)} · {REPORTING_PERIOD.state}</span>
        </div>
      )}

      {/* KPI портфеля — для тех, кто работает глубоко */}
      {!light && (
        <div className="pmrk-statgrid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
          <Stat label="Контрагентов в реестре" value={REGISTRY.length.toLocaleString('ru-RU')} sub="из 200 тыс. (демо-срез)" asOf="2026-06-15" calcLabel="обновлено" calcSource="реестр" />
          <Stat label="Требуют внимания" value={AI_DIGEST.items.length} sub="по сигналам мониторинга" tone="risk" asOf={AI_DIGEST.asOf} calcSource="AI-ранжирование" />
          <Stat label="Заявки на КЛ в работе" value={myRequests.length} sub="на проверке/утверждении" asOf="2026-06-15" calcLabel="обновлено" calcSource="limit-workflow" />
          <Stat label="Совокупный КЛ группы, руб." value={moneyCompact(1_250_000_000)} sub="РН-Снабжение" asOf="2026-06-14" calcSource="агрегат лимитов" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: light ? '1fr' : '1.55fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* ЛЕВО — что требует меня сегодня */}
        <div>
          {/* AI signal-digest (AI-7) */}
          {aiOn && !light && (
            <div className="pmrk-ai-surface pmrk-ai pmrk-enter" style={{ marginBottom: 16 }}>
              <div className="pmrk-ai-accentbar" />
              <div className="pmrk-ai__head">
                <span className="pmrk-ai__badge">✦ AI</span>
                <span style={{ fontWeight: 700 }}>{AI_DIGEST.headline}</span>
                <span style={{ flex: 1 }} />
                <span className="pmrk-muted" style={{ fontSize: 12 }}>дайджест на {AI_DIGEST.asOf.split('-').reverse().join('.')}</span>
              </div>
              <div className="pmrk-stack" style={{ gap: 8 }}>
                {AI_DIGEST.items.map((it) => (
                  <div
                    key={it.uid}
                    className="pmrk-clickable"
                    style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--color-bg-default)', border: '1px solid var(--pmrk-ai-border)', borderRadius: 10, padding: '10px 12px' }}
                    onClick={() => navigate(`/counterparties/${it.uid}`)}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, background: severityColor(it.severity), flex: 'none' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{it.name}</div>
                      <div className="pmrk-muted" style={{ fontSize: 12.5 }}>{it.reason}</div>
                    </div>
                    <IconForward size="s" className="pmrk-muted" />
                  </div>
                ))}
              </div>
              <div className="pmrk-ai__foot">
                <span>Ранжировано AI по существенности (суммы, скорость ухудшения, совокупный лимит). Числа — из мониторинга, не из AI.</span>
              </div>
            </div>
          )}

          <SectionCard
            title="Что требует внимания"
            extra={<a className="pmrk-ai__src" href="#" onClick={(e) => { e.preventDefault(); navigate('/notifications'); }} style={{ color: 'var(--color-typo-brand)' }}>Вся лента →</a>}
          >
            <div className="pmrk-feed">
              {topSignals.map((s) => (
                <div key={s.id} className={`pmrk-signal pmrk-signal--${s.severity}`} onClick={() => s.counterpartyUid && navigate(`/counterparties/${s.counterpartyUid}`)}>
                  {!s.read && <span className="pmrk-signal__unread" />}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.title}</span>
                      <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: severityColor(s.severity), fontSize: 11 }}>{SEVERITY_LABEL[s.severity]}</span>
                    </div>
                    <div className="pmrk-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s.detail}</div>
                    <div className="pmrk-muted" style={{ fontSize: 11.5, marginTop: 4 }}>{s.category} · {s.type} · {ago(s.date)}</div>
                  </div>
                  {s.amount && <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{moneyCompactText(s.amount)}</div>}
                </div>
              ))}
            </div>
          </SectionCard>

          {can(role, 'viewTasks') && myTasks.length > 0 && (
            <SectionCard title={`Мои задачи · из всех разделов`} extra={<a className="pmrk-ai__src" href="#" onClick={(e) => { e.preventDefault(); navigate('/tasks'); }} style={{ color: 'var(--color-typo-brand)' }}>Все задачи →</a>}>
              <div>
                {myTasks.slice(0, 6).map((t) => (
                  <TaskRow key={t.id} task={t} compact />
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* ПРАВО — действия, избранное, дашборды */}
        <div>
          <SectionCard title="Быстрые действия">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {can(role, 'editAssessment') && <ActionTile icon={<IconCalculator size="s" />} label="Экспресс-оценка" onClick={() => navigate('/assessments/new')} />}
              {can(role, 'createLimitRequest') && <ActionTile icon={<IconDocFilled size="s" />} label="Заявка на КЛ" onClick={() => navigate('/limit-requests/new')} />}
              <ActionTile icon={<IconConnection size="s" />} label="Аффилированность" onClick={() => navigate('/counterparties/cp-rnsnab/affiliation')} />
              <ActionTile icon={<IconDownload size="s" />} label="Отчёт по к/а" onClick={() => navigate('/reports')} />
              {can(role, 'massAssessment') && <ActionTile icon={<IconCalculator size="s" />} label="Массовая оценка" onClick={() => navigate('/assessments/mass')} badge={ROLES[role].massQuota ? `≤ ${ROLES[role].massQuota}/день` : 'без лимита'} />}
              <ActionTile icon={<IconForward size="s" />} label="Связанные стороны" onClick={() => navigate('/reports')} />
            </div>
          </SectionCard>

          {!light && (
            <SectionCard
              title="Ключевые индикаторы (KRI)"
              extra={<a className="pmrk-ai__src" href="#" onClick={(e) => { e.preventDefault(); navigate('/notifications'); }} style={{ color: 'var(--color-typo-brand)' }}>Кредитный контроль →</a>}
            >
              <KriList items={KRI} />
            </SectionCard>
          )}

          <SectionCard title="Избранное">
            <div className="pmrk-stack" style={{ gap: 4 }}>
              {FAVORITES.map((uid) => {
                const c = BY_UID.get(uid)!;
                return (
                  <div key={uid} className="pmrk-clickable" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 4px', borderBottom: '1px solid var(--color-bg-border)' }} onClick={() => navigate(`/counterparties/${uid}`)}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }} className="pmrk-truncate">{c.shortName}</div>
                      <div className="pmrk-muted" style={{ fontSize: 11 }}>ИНН {c.inn} · {c.subsidiary.replace('ООО «Газпромнефть-', '').replace('»', '')}</div>
                    </div>
                    <GroupBadge group={c.group} />
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Дашборды" extra={<span className="pmrk-muted" style={{ fontSize: 11 }}>доступ — по СУИД</span>}>
            <div className="pmrk-stack" style={{ gap: 8 }}>
              {DASHBOARDS.map((d) => (
                <a key={d.title} href="#" onClick={(e) => e.preventDefault()} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', border: '1px solid var(--color-bg-border)', borderRadius: 10, textDecoration: 'none', color: 'inherit' }} title={`Открыть дашборд · запросить ${d.suid}`}>
                  <Sparkline points={d.trend} color={d.color} width={64} height={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.title}</div>
                    <div className="pmrk-muted" style={{ fontSize: 11 }}>{d.suid}</div>
                  </div>
                  <IconForward size="s" className="pmrk-muted" />
                </a>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function ActionTile({ icon, label, onClick, badge }: { icon: React.ReactNode; label: string; onClick: () => void; badge?: string }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', padding: '12px 12px', border: '1px solid var(--color-bg-border)', borderRadius: 10, background: 'var(--color-bg-default)', cursor: 'pointer', textAlign: 'left' }}
    >
      <span style={{ color: 'var(--color-typo-brand)' }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      {badge && <span className="pmrk-muted" style={{ fontSize: 10.5 }}>{badge}</span>}
    </button>
  );
}

