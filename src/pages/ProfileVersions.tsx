import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { PageHeader, SectionCard, EmptyState } from '@/shared/ui/kit';
import { BY_UID } from '@/shared/mock/data';

/* Журнал версий профиля (ФТ-2.4, ФТ-11.1): список версий + diff «было/стало». */

interface Version {
  id: string;
  at: string;
  author: string;
  source: string;
  changes: { field: string; before: string; after: string }[];
}

const VERSIONS: Version[] = [
  {
    id: 'v5', at: '2026-06-14 08:12', author: 'Системная учётная запись', source: 'ТИ-11 АРМ КК',
    changes: [
      { field: 'Просроченная ДЗ', before: '14%', after: '27%' },
      { field: 'Дата актуализации (ДЗ)', before: '13.06.2026', after: '14.06.2026' },
    ],
  },
  {
    id: 'v4', at: '2026-06-08 11:40', author: 'Системная учётная запись', source: 'ТИ-12 PRIMO',
    changes: [
      { field: 'Новости', before: '2 записи', after: '3 записи (добавлен иск)' },
      { field: 'Претензионно-исковая работа', before: '2 дела', after: '3 дела' },
    ],
  },
  {
    id: 'v3', at: '2026-05-22 16:05', author: 'Петрова И.А.', source: 'Ручная правка',
    changes: [
      { field: 'Под особым контролем', before: 'Нет', after: 'Внесено предложение' },
    ],
  },
  {
    id: 'v2', at: '2026-05-21 09:30', author: 'Соколова Е.В.', source: 'Экспресс-оценка',
    changes: [
      { field: 'Группа кредитоспособности', before: 'Группа 2 (58)', after: 'Группа 3 (47)' },
      { field: 'Рекомендованный КЛ, ₽', before: '150 млн', after: '120 млн' },
    ],
  },
];

export function ProfileVersions() {
  const { uid = '' } = useParams();
  const navigate = useNavigate();
  const c = BY_UID.get(uid);
  const [sel, setSel] = useState(VERSIONS[0].id);
  if (!c) return <div className="pmrk-page"><EmptyState title="Контрагент не найден" text="Вернитесь в реестр." action={<Button size="s" label="В реестр" onClick={() => navigate('/registry')} />} /></div>;
  const current = VERSIONS.find((v) => v.id === sel)!;

  return (
    <div className="pmrk-page">
      <PageHeader
        title="Журнал версий профиля"
        subtitle={`${c.name} · ИНН ${c.inn}`}
        breadcrumbs={[{ label: 'Реестр контрагентов', to: '/registry' }, { label: c.shortName, to: `/counterparties/${uid}` }, { label: 'Версии' }]}
        actions={<Button size="s" view="secondary" label="Открыть профиль" onClick={() => navigate(`/counterparties/${uid}`)} />}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        <SectionCard title="Версии" pad={false}>
          {VERSIONS.map((v, i) => (
            <div key={v.id} className={`pmrk-tr ${v.id === sel ? '' : ''}`} style={{ padding: '12px 16px', background: v.id === sel ? 'var(--color-bg-secondary)' : undefined, borderLeft: v.id === sel ? '3px solid var(--color-bg-brand)' : '3px solid transparent' }} onClick={() => setSel(v.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Версия {VERSIONS.length - i} · {v.at}</div>
                <div className="pmrk-muted" style={{ fontSize: 11.5 }}>{v.author === 'Системная учётная запись' ? v.author : <a href="#" onClick={(e) => e.preventDefault()} style={{ color: 'var(--color-typo-brand)' }}>{v.author}</a>} · {v.source}</div>
                <div className="pmrk-muted" style={{ fontSize: 11 }}>{v.changes.length} изм.</div>
              </div>
            </div>
          ))}
        </SectionCard>

        <SectionCard title={`Изменения · версия ${VERSIONS.length - VERSIONS.findIndex((v) => v.id === sel)}`} extra={<span className="pmrk-muted" style={{ fontSize: 12 }}>{current.at} · {current.source}</span>}>
          <div className="pmrk-table">
            <div className="pmrk-table__head">
              <div className="pmrk-th" style={{ flex: 1.4 }}>Поле</div>
              <div className="pmrk-th" style={{ flex: 1 }}>Было</div>
              <div className="pmrk-th" style={{ flex: 1 }}>Стало</div>
            </div>
            {current.changes.map((ch, i) => (
              <div key={i} className="pmrk-tr" style={{ cursor: 'default', alignItems: 'stretch' }}>
                <div className="pmrk-td" style={{ flex: 1.4, fontWeight: 600 }}>{ch.field}</div>
                <div className="pmrk-td" style={{ flex: 1, color: 'var(--pmrk-risk-4)', background: 'var(--pmrk-risk-4-bg)' }}>{ch.before}</div>
                <div className="pmrk-td" style={{ flex: 1, color: 'var(--pmrk-risk-1)', background: 'var(--pmrk-risk-1-bg)' }}>{ch.after}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
