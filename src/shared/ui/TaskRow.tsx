import { useNavigate } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { IconForward } from '@consta/icons/IconForward';
import type { Task } from '@/shared/mock/types';
import { dueDelta, sectionColor } from '@/shared/format';

/* Плотная строка задачи (идея из СФК «Личный кабинет»): тег раздела + под-статус +
   ДО + дельта срока, цветная полоса слева по срочности. Сканируется на лету. */

export function SectionTag({ source }: { source: string }) {
  const c = sectionColor(source);
  return (
    <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: c, background: 'color-mix(in srgb, currentColor 12%, transparent)', borderRadius: 4, padding: '1px 6px' }}>
      {source}
    </span>
  );
}

export function DueChip({ days }: { days: number }) {
  const d = dueDelta(days);
  const color = d.tone === 'bad' ? 'var(--pmrk-risk-4)' : d.tone === 'warn' ? 'var(--pmrk-risk-3-text)' : 'var(--color-typo-secondary)';
  return <span style={{ fontSize: 12, fontWeight: 700, color }} className="pmrk-tnum">{d.label}</span>;
}

export function TaskRow({ task, compact }: { task: Task; compact?: boolean }) {
  const navigate = useNavigate();
  const overdue = (task.dueInDays ?? 0) < 0;
  const soon = (task.dueInDays ?? 99) >= 0 && (task.dueInDays ?? 99) <= 2;
  const bar = task.status === 'completed' ? 'var(--pmrk-risk-1)' : overdue ? 'var(--pmrk-risk-4)' : soon ? 'var(--pmrk-risk-3)' : task.status === 'approval' ? 'var(--color-bg-brand)' : 'var(--color-bg-border)';
  const badge = task.status === 'completed'
    ? { label: 'Завершено', color: 'var(--pmrk-risk-1)' }
    : task.status === 'approval'
      ? { label: 'На согласовании', color: 'var(--color-bg-brand)' }
      : overdue
        ? { label: 'Просрочено', color: 'var(--pmrk-risk-4)' }
        : { label: 'Скоро срок', color: 'var(--pmrk-risk-3)' };

  return (
    <div
      className="pmrk-clickable"
      onClick={() => navigate(task.link)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: compact ? '9px 12px 9px 0' : '11px 14px 11px 0', borderBottom: '1px solid var(--color-bg-border)' }}
    >
      <span style={{ alignSelf: 'stretch', width: 3, borderRadius: 3, background: bar, flex: 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <SectionTag source={task.source} />
          <span style={{ fontSize: 13.5, fontWeight: 600 }} className="pmrk-truncate">{task.title}</span>
        </div>
        <div className="pmrk-muted" style={{ fontSize: 11.5, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {task.ref && <span className="pmrk-tnum">{task.ref}</span>}
          {task.subState && <><span>·</span><span>{task.subState}</span></>}
          {task.org && <><span>·</span><span>{task.org}</span></>}
          {task.dueInDays != null && task.status !== 'completed' && <><span>·</span><DueChip days={task.dueInDays} /></>}
        </div>
      </div>
      <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-typo-primary)', flex: 'none' }}>
        <span className="pmrk-dot" style={{ background: badge.color }} />
        {badge.label}
      </span>
      {!compact && <Button size="xs" view="ghost" label="Открыть" iconRight={IconForward as never} onClick={(e) => { e.stopPropagation(); navigate(task.link); }} />}
    </div>
  );
}
