import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { IconBookmarkStroked } from '@consta/icons/IconBookmarkStroked';
import { IconRestart } from '@consta/icons/IconRestart';
import { IconForward } from '@consta/icons/IconForward';
import { useApp } from '@/app/AppContext';
import { can } from '@/shared/roles';
import { PageHeader, GroupBadge, RbIndicator, SanctionBadge, StatusBadge, CalcStamp, Segmented } from '@/shared/ui/kit';
import { DataTable, type Column, type SortState } from '@/shared/ui/DataTable';
import { REGISTRY } from '@/shared/mock/data';
import type { Counterparty, RiskGroup } from '@/shared/mock/types';
import { moneyCompact, inn as fmtInn } from '@/shared/format';

const VIEWS = [
  { key: 'all', label: 'Все контрагенты' },
  { key: 'active', label: 'Действующие' },
  { key: 'potential', label: 'Потенциальные' },
  { key: 'special-control', label: 'Особый контроль' },
] as const;

const REGIONS = ['г. Москва', 'г. Санкт-Петербург', 'Московская область', 'Ростовская область'];

// Счётчики видов — считаются один раз (REGISTRY статичен)
const VIEW_COUNTS: Record<string, number> = {
  all: REGISTRY.length,
  active: REGISTRY.filter((c) => c.status === 'Действующее').length,
  potential: REGISTRY.filter((c) => c.creditLimit === 0).length,
  'special-control': REGISTRY.filter((c) => c.specialControl).length,
};
const viewCount = (key: string) => VIEW_COUNTS[key] ?? REGISTRY.length;

export function Registry() {
  const navigate = useNavigate();
  const { role } = useApp();
  const { view = 'all' } = useParams();
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [groups, setGroups] = useState<Set<RiskGroup>>(new Set());
  const [region, setRegion] = useState<string | null>(null);
  const [sanctionsOnly, setSanctionsOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);

  const rows = useMemo(() => {
    let r = REGISTRY.filter((c) => {
      if (view === 'active' && c.status !== 'Действующее') return false;
      if (view === 'special-control' && !c.specialControl) return false;
      if (view === 'potential' && c.creditLimit > 0) return false;
      if (groups.size && !groups.has(c.group)) return false;
      if (region && c.region !== region) return false;
      if (sanctionsOnly && !c.underSanctions) return false;
      if (minScore && c.score < minScore) return false;
      return true;
    });
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (col?.sortValue) {
      const sv = col.sortValue;
      r = [...r].sort((a, b) => {
        const va = sv(a);
        const vb = sv(b);
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ru');
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }
    return r;
  }, [view, groups, region, sanctionsOnly, minScore, sort]);

  const toggleGroup = (g: RiskGroup) => {
    setGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  const activeFilters = groups.size + (region ? 1 : 0) + (sanctionsOnly ? 1 : 0) + (minScore ? 1 : 0);

  return (
    <div className="pmrk-page">
      <PageHeader
        title="Реестр контрагентов"
        subtitle={`${REGISTRY.length.toLocaleString('ru-RU')} карточек · виртуализация под объём до 200 тыс. (НФТ-Пр-3)`}
        breadcrumbs={[{ label: 'Главная', to: '/' }, { label: 'Реестр контрагентов' }]}
        actions={can(role, 'editRegistry') && <Button size="s" view="secondary" label="Изменить (АДМ)" />}
      />

      {/* Сохранённые виды (4 пресета + свои) — сегмент-контрол со счётчиками.
          На узких окнах сегмент-контрол ужимается и скроллится по горизонтали,
          а «Сохранить вид» остаётся на месте (min-width:0 позволяет ужиматься). */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Segmented
            value={view}
            onChange={(k) => navigate(`/registry/${k}`)}
            items={VIEWS.map((v) => ({ key: v.key as string, label: v.label, count: viewCount(v.key) }))}
          />
        </div>
        <div className="pmrk-savedview" style={{ flex: 'none', color: 'var(--color-typo-brand)', whiteSpace: 'nowrap' }}>
          <IconBookmarkStroked size="xs" /> Сохранить вид
        </div>
      </div>

      {/* Фильтры-чипы */}
      <div className="pmrk-filterbar">
        <span className="pmrk-muted" style={{ fontSize: 12 }}>Группа:</span>
        {([1, 2, 3, 4] as RiskGroup[]).map((g) => (
          <div key={g} className={`pmrk-filterchip ${groups.has(g) ? 'pmrk-filterchip--active' : ''}`} onClick={() => toggleGroup(g)}>
            Группа {g}
          </div>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--color-bg-border)', margin: '0 4px' }} />
        <span className="pmrk-muted" style={{ fontSize: 12 }}>Регион:</span>
        {REGIONS.map((r) => (
          <div key={r} className={`pmrk-filterchip ${region === r ? 'pmrk-filterchip--active' : ''}`} onClick={() => setRegion(region === r ? null : r)}>
            {r.replace('г. ', '')}
          </div>
        ))}
        <div className={`pmrk-filterchip ${sanctionsOnly ? 'pmrk-filterchip--active' : ''}`} onClick={() => setSanctionsOnly((v) => !v)}>
          Под санкциями
        </div>
        <div className={`pmrk-filterchip ${minScore ? 'pmrk-filterchip--active' : ''}`} onClick={() => setMinScore(minScore ? 0 : 60)}>
          Балл ≥ 60
        </div>
        {activeFilters > 0 && (
          <div className="pmrk-savedview" style={{ color: 'var(--pmrk-risk-4)' }} onClick={() => { setGroups(new Set()); setRegion(null); setSanctionsOnly(false); setMinScore(0); }}>
            Очистить форму ({activeFilters})
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <CalcStamp date="2026-06-14" label="группы, баллы и лимиты обновлены" source="синхронизация ТИ-2/11" />
      </div>

      <DataTable<Counterparty>
        columns={COLUMNS}
        rows={rows}
        rowKey={(c) => c.uid}
        sort={sort}
        onSort={setSort}
        height={560}
        onRowClick={(c) => navigate(`/counterparties/${c.uid}`)}
        rowActions={(c) => (
          <>
            <Button size="xs" view="clear" onlyIcon iconLeft={IconBookmarkStroked as never} title="Подписаться" onClick={() => {}} />
            <Button size="xs" view="clear" onlyIcon iconLeft={IconRestart as never} title="Версии профиля" onClick={() => navigate(`/counterparties/${c.uid}/versions`)} />
            <Button size="xs" view="clear" onlyIcon iconLeft={IconForward as never} title="Открыть профиль" onClick={() => navigate(`/counterparties/${c.uid}`)} />
          </>
        )}
      />
    </div>
  );
}

const COLUMNS: Column<Counterparty>[] = [
  { key: 'name', title: 'Наименование', grow: 2.4, sortable: true, sortValue: (c) => c.name, render: (c) => (
    <div style={{ overflow: 'hidden' }}>
      <div className="pmrk-truncate" style={{ fontWeight: 600 }}>{c.name}</div>
      <div className="pmrk-muted pmrk-truncate" style={{ fontSize: 11 }}>{c.okved}</div>
    </div>
  ) },
  { key: 'inn', title: 'ИНН', width: 116, sortable: true, sortValue: (c) => c.inn, render: (c) => <span className="pmrk-tnum">{fmtInn(c.inn)}</span> },
  { key: 'region', title: 'Регион', grow: 1.2, sortable: true, sortValue: (c) => c.region, render: (c) => <span className="pmrk-truncate">{c.region}</span> },
  { key: 'group', title: 'Группа', width: 116, sortable: true, sortValue: (c) => c.group, render: (c) => <GroupBadge group={c.group} /> },
  { key: 'score', title: 'Балл', width: 64, align: 'right', sortable: true, sortValue: (c) => c.score, render: (c) => <b className="pmrk-tnum">{c.score}</b> },
  { key: 'rb', title: 'Индекс РБ', width: 124, sortable: true, sortValue: (c) => c.rbIndex, render: (c) => <RbIndicator value={c.rbIndex} /> },
  { key: 'limit', title: 'Действующий КЛ, ₽', width: 132, align: 'right', sortable: true, sortValue: (c) => c.creditLimit, render: (c) => <span className="pmrk-tnum">{c.creditLimit ? moneyCompact(c.creditLimit) : '—'}</span> },
  { key: 'status', title: 'Статус', width: 150, sortable: true, sortValue: (c) => c.status, render: (c) => (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {c.underSanctions ? <SanctionBadge /> : <StatusBadge status={c.status} />}
    </div>
  ) },
];
