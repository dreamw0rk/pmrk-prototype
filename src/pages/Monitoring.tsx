import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@consta/uikit/Button';
import { Modal } from '@consta/uikit/Modal';
import { IconSearchStroked } from '@consta/icons/IconSearchStroked';
import { IconSettingsStroked } from '@consta/icons/IconSettingsStroked';
import { useApp } from '@/app/AppContext';
import { PageHeader, SectionCard, GroupBadge, EmptyState, severityColor, SEVERITY_LABEL, Segmented } from '@/shared/ui/kit';
import { TaskRow } from '@/shared/ui/TaskRow';
import { SIGNALS, TASKS, BY_UID, REGISTRY, SUBS, BLOCK_NAMES } from '@/shared/mock/data';
import type { SignalSeverity } from '@/shared/mock/types';
import { ago, moneyCompact } from '@/shared/format';

/* ----------------------------- Лента сигналов ----------------------------- */

export function NotificationFeed() {
  const navigate = useNavigate();
  const { aiOn } = useApp();
  const [sev, setSev] = useState<SignalSeverity | 'all'>('all');
  const [rules, setRules] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [signals, setSignals] = useState(SIGNALS);

  const bySeverity = signals.filter((s) => sev === 'all' || s.severity === sev);
  const byRule = bySeverity.filter((s) => rules.size === 0 || rules.has(s.category));
  const query = q.trim().toLowerCase();
  const filtered = byRule.filter((s) => {
    if (!query) return true;
    const c = s.counterpartyUid ? BY_UID.get(s.counterpartyUid) : undefined;
    const name = (s.counterpartyName || c?.name || '').toLowerCase();
    const inn = c?.inn ?? '';
    return name.includes(query) || inn.includes(query);
  });
  const markRead = (id: string) => setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, read: true } : s)));

  const toggleRule = (name: string) => {
    setRules((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="pmrk-page">
      <PageHeader
        title="Лента сигналов"
        subtitle="Умная лента: ранжирование по существенности, фильтр шума · 58 видов в 12 категориях"
        breadcrumbs={[{ label: 'Главная', to: '/' }, { label: 'Лента сигналов' }]}
        actions={<Button size="s" view="secondary" label="Правила внимания" onClick={() => navigate('/subscriptions')} />}
      />

      {aiOn && (
        <div className="pmrk-ai-surface pmrk-ai" style={{ marginBottom: 16 }}>
          <div className="pmrk-ai-accentbar" />
          <div className="pmrk-ai__head"><span className="pmrk-ai__badge">✦ AI</span><span style={{ fontWeight: 600 }}>Суммаризация ленты (AI-6/AI-7)</span></div>
          <div style={{ fontSize: 13 }}>Из {signals.length} событий значимых — {signals.filter((s) => s.severity === 'critical' || s.severity === 'high').length}. Топ-приоритет: 2 критических (иск + банкротство), общий объём под риском — {moneyCompact(34_200_000 + 88_000_000)}. Остальное — фоновый шум, свёрнут.</div>
        </div>
      )}

      <div className="pmrk-filterbar">
        <span className="pmrk-muted" style={{ fontSize: 12, width: 82, flex: 'none', whiteSpace: 'nowrap' }}>Критичность:</span>
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map((s) => (
          <div key={s} className={`pmrk-filterchip ${sev === s ? 'pmrk-filterchip--active' : ''}`} onClick={() => setSev(s)}>
            {s === 'all' ? 'Все' : SEVERITY_LABEL[s]}
          </div>
        ))}
      </div>

      {/* Фильтр по правилам из «Правил внимания» — множественный выбор, в отличие
          от важности выше: можно смотреть сразу несколько категорий сигналов. */}
      <div className="pmrk-filterbar" style={{ marginTop: -4 }}>
        <span className="pmrk-muted" style={{ fontSize: 12, width: 82, flex: 'none', whiteSpace: 'nowrap' }}>Правило:</span>
        <div className={`pmrk-filterchip ${rules.size === 0 ? 'pmrk-filterchip--active' : ''}`} onClick={() => setRules(new Set())}>
          Все
        </div>
        {CATEGORIES.map((c) => {
          const count = bySeverity.filter((s) => s.category === c.name).length;
          return (
            <div
              key={c.name}
              className={`pmrk-filterchip ${rules.has(c.name) ? 'pmrk-filterchip--active' : ''}`}
              onClick={() => toggleRule(c.name)}
              style={count === 0 ? { opacity: 0.45 } : undefined}
            >
              {c.name}
            </div>
          );
        })}
      </div>

      {/* Поиск по контрагенту — сужает то, что уже прошло фильтры важности и правил выше. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span className="pmrk-muted" style={{ fontSize: 12, width: 82, flex: 'none', whiteSpace: 'nowrap' }}>Контрагент:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', maxWidth: 420, border: '1px solid var(--color-bg-border)', borderRadius: 10, background: 'var(--color-bg-default)' }}>
          <IconSearchStroked size="xs" className="pmrk-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Наименование или ИНН контрагента"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-typo-primary)' }}
          />
        </div>
      </div>

      <div className="pmrk-feed">
        {filtered.map((s) => (
          <div key={s.id} className={`pmrk-signal pmrk-signal--${s.severity}`}>
            {!s.read && <span className="pmrk-signal__unread" />}
            <div style={{ flex: 1 }} onClick={() => s.counterpartyUid && navigate(`/counterparties/${s.counterpartyUid}`)}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</span>
                <span className="pmrk-chip" style={{ background: 'var(--color-bg-secondary)', color: severityColor(s.severity), fontSize: 11 }}>{SEVERITY_LABEL[s.severity]}</span>
              </div>
              <div className="pmrk-muted" style={{ fontSize: 13, marginTop: 2 }}>{s.detail}</div>
              <div className="pmrk-muted" style={{ fontSize: 11.5, marginTop: 4 }}>{s.category} · {s.type} · {ago(s.date)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {s.amount && <b style={{ fontSize: 13 }}>{moneyCompact(s.amount)}</b>}
              {!s.read && <Button size="xs" view="clear" label="Прочитано" onClick={() => markRead(s.id)} />}
            </div>
          </div>
        ))}
        {!filtered.length && <EmptyState text="Нет сигналов по выбранному фильтру." />}
      </div>
    </div>
  );
}

/* --------------------------- Правила внимания ----------------------------- */

const CATEGORIES = [
  { name: 'Дебиторская задолженность', types: ['Рост просроченной ДЗ выше порога', 'Появление ПДЗ', 'Превышение лимита'], threshold: true },
  { name: 'Претензионно-исковая работа', types: ['Новый судебный иск', 'Претензия', 'Исполнительное производство'], threshold: true },
  { name: 'Банкротство', types: ['Введена процедура банкротства', 'Заявление о банкротстве'], threshold: false },
  { name: 'Санкции', types: ['Включение в санкционный список', 'Изменение санкционного статуса'], threshold: false },
  { name: 'Кредитный лимит', types: ['Заявка требует решения', 'Изменение КЛ', 'Истечение срока КЛ'], threshold: false },
  { name: 'Особый контроль', types: ['Предложение о включении', 'Решение по особому контролю'], threshold: false },
  { name: 'Новости', types: ['Значимое негативное событие', 'Появление новости'], threshold: true },
  { name: 'Отчётность', types: ['Отчётность старше 12 месяцев', 'Загружена новая отчётность'], threshold: false },
];

type ScopeKind = 'Блок / БЕ' | 'ДО' | 'Контрагент';
type ScopeItem = { id: string; label: string; sub?: string };

/** Список для выпадашки скоупа правила. Контрагент — демо-срез реестра (первые 60). */
function scopeItems(kind: ScopeKind): ScopeItem[] {
  if (kind === 'Блок / БЕ') return BLOCK_NAMES.map((b) => ({ id: b, label: b }));
  if (kind === 'ДО') return SUBS.map((s) => ({ id: s, label: s }));
  return REGISTRY.slice(0, 60).map((c) => ({ id: c.uid, label: c.name, sub: `ИНН ${c.inn} · ${c.region}` }));
}

/** Модальное окно выбора области действия правила: поиск + чекбоксы, по умолчанию выбрано всё. */
function ScopeModalBody({
  kind,
  items,
  initialSelected,
  onSave,
  onClose,
}: {
  kind: ScopeKind;
  items: ScopeItem[];
  initialSelected: Set<string>;
  onSave: (next: Set<string>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Set<string>>(new Set(initialSelected));
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((it) => it.label.toLowerCase().includes(q)) : items;

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ padding: 20, width: 480, maxWidth: '92vw' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Область действия · {kind}</h3>
        <Button size="xs" view="clear" label="✕" onClick={onClose} />
      </div>
      <div className="pmrk-muted" style={{ fontSize: 12, marginBottom: 12 }}>
        Правило будет присылать сигналы только по выбранным ниже {kind === 'Контрагент' ? 'контрагентам' : kind === 'ДО' ? 'дочерним обществам' : 'блокам / бизнес-единицам'}.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', marginBottom: 10, border: '1px solid var(--color-bg-border)', borderRadius: 10, background: 'var(--color-bg-default)' }}>
        <IconSearchStroked size="xs" className="pmrk-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по списку"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-typo-primary)' }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Button size="xs" view="secondary" label="Выделить все" onClick={() => setDraft(new Set(items.map((i) => i.id)))} />
        <Button size="xs" view="secondary" label="Снять выделение" onClick={() => setDraft(new Set())} />
        <span style={{ flex: 1 }} />
        <span className="pmrk-muted" style={{ fontSize: 12 }}>Выбрано {draft.size} из {items.length}</span>
      </div>

      <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--color-bg-border)', borderRadius: 10 }}>
        {filtered.map((it) => (
          <label key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-bg-border)', cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.has(it.id)} onChange={() => toggle(it.id)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13 }} className="pmrk-truncate">{it.label}</div>
              {it.sub && <div className="pmrk-muted" style={{ fontSize: 11 }}>{it.sub}</div>}
            </div>
          </label>
        ))}
        {!filtered.length && <div className="pmrk-muted" style={{ padding: 14, fontSize: 13, textAlign: 'center' }}>Ничего не найдено.</div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button size="s" view="secondary" label="Отменить" onClick={onClose} />
        <Button size="s" label="Сохранить" onClick={() => onSave(draft)} />
      </div>
    </div>
  );
}

export function Subscriptions() {
  const [open, setOpen] = useState<string | null>('Дебиторская задолженность');
  const [scopeKind, setScopeKind] = useState<Record<string, ScopeKind>>({});
  const [scopeSelection, setScopeSelection] = useState<Record<string, Set<string>>>({});
  const [modalRow, setModalRow] = useState<string | null>(null);

  const kindFor = (rowKey: string) => scopeKind[rowKey] ?? 'Блок / БЕ';

  return (
    <div className="pmrk-page">
      <PageHeader
        title="Правила внимания"
        subtitle="Управляемые правила вместо таблицы из 58 чек-боксов · пороги и скоупы Блок/БЕ–ДО–контрагент"
        breadcrumbs={[{ label: 'Главная', to: '/' }, { label: 'Правила внимания' }]}
        actions={<Button size="s" label="Сохранить настройки" />}
      />
      <div className="pmrk-muted" style={{ fontSize: 13, marginBottom: 12 }}>12 категорий × 58 видов уведомлений. Включайте правило, задавайте порог существенности и область (на что подписаны).</div>
      {CATEGORIES.map((cat) => {
        const isOpen = open === cat.name;
        return (
          <div key={cat.name} className="pmrk-card" style={{ marginBottom: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : cat.name)}>
              <span style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--color-typo-secondary)' }}>▸</span>
              <span style={{ fontWeight: 600, flex: 1 }}>{cat.name}</span>
              <span className="pmrk-muted" style={{ fontSize: 12 }}>{cat.types.length} видов{cat.threshold ? ' · с порогом' : ''}</span>
              <label onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" defaultChecked /> вкл
              </label>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--color-bg-border)', padding: '8px 16px 14px' }}>
                {cat.types.map((t) => {
                  const rowKey = `${cat.name}::${t}`;
                  const kind = kindFor(rowKey);
                  const selectionKey = `${rowKey}::${kind}`;
                  const items = scopeItems(kind);
                  const selected = scopeSelection[selectionKey] ?? new Set(items.map((i) => i.id));
                  const allSelected = selected.size === items.length;
                  return (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-bg-border)' }}>
                      <input type="checkbox" defaultChecked />
                      <span style={{ flex: 1, fontSize: 13 }}>{t}</span>
                      {cat.threshold && (
                        <label style={{ fontSize: 12, color: 'var(--color-typo-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          порог <input type="text" defaultValue="1 млн ₽" style={{ width: 90, height: 28, border: '1px solid var(--color-bg-border)', borderRadius: 6, padding: '0 8px', background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)' }} />
                        </label>
                      )}
                      <select
                        value={kind}
                        onChange={(e) => setScopeKind((prev) => ({ ...prev, [rowKey]: e.target.value as ScopeKind }))}
                        style={{ height: 28, border: '1px solid var(--color-bg-border)', borderRadius: 6, padding: '0 8px', background: 'var(--color-bg-default)', color: 'var(--color-typo-primary)', fontSize: 12 }}
                      >
                        <option>Блок / БЕ</option>
                        <option>ДО</option>
                        <option>Контрагент</option>
                      </select>
                      {!allSelected && (
                        <span className="pmrk-muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{selected.size} из {items.length}</span>
                      )}
                      <Button
                        size="xs"
                        view="secondary"
                        onlyIcon
                        iconLeft={IconSettingsStroked as never}
                        title="Настроить область действия правила"
                        onClick={() => setModalRow(rowKey)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <Modal isOpen={!!modalRow} onClickOutside={() => setModalRow(null)} onEsc={() => setModalRow(null)}>
        {modalRow && (() => {
          const kind = kindFor(modalRow);
          const selectionKey = `${modalRow}::${kind}`;
          const items = scopeItems(kind);
          const initial = scopeSelection[selectionKey] ?? new Set(items.map((i) => i.id));
          return (
            <ScopeModalBody
              key={selectionKey}
              kind={kind}
              items={items}
              initialSelected={initial}
              onSave={(next) => {
                setScopeSelection((prev) => ({ ...prev, [selectionKey]: next }));
                setModalRow(null);
              }}
              onClose={() => setModalRow(null)}
            />
          );
        })()}
      </Modal>
    </div>
  );
}

/* -------------------------------- Задачи ---------------------------------- */

const TASK_TABS = [
  { key: 'all', label: 'Все', match: () => true },
  { key: 'attention', label: 'Требуют внимания', match: (s: string) => s === 'attention' },
  { key: 'overdue', label: 'Просрочено', match: (_s: string, d?: number) => (d ?? 0) < 0 },
  { key: 'soon', label: 'Срок ≤ 2 дней', match: (_s: string, d?: number) => (d ?? 99) >= 0 && (d ?? 99) <= 2 },
  { key: 'approval', label: 'На согласовании', match: (s: string) => s === 'approval' },
  { key: 'completed', label: 'Завершены', match: (s: string) => s === 'completed' },
] as const;

export function Tasks() {
  const [tab, setTab] = useState<string>('all');
  const apply = (key: string) => {
    const t = TASK_TABS.find((x) => x.key === key)!;
    return TASKS.filter((task) => t.match(task.status, task.dueInDays));
  };
  const rows = apply(tab);
  return (
    <div className="pmrk-page">
      <PageHeader title="Мои задачи" subtitle="Инбокс кредитного контролёра · задачи из всех разделов с признаком срока" breadcrumbs={[{ label: 'Главная', to: '/' }, { label: 'Мои задачи' }]} />
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          items={TASK_TABS.map((t) => ({ key: t.key as string, label: t.label, count: apply(t.key).length }))}
        />
      </div>
      <SectionCard pad={false}>
        <div style={{ padding: '0 16px' }}>
          {rows.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
        {!rows.length && <EmptyState text="Нет задач в этой вкладке." />}
      </SectionCard>
    </div>
  );
}

/* ------------------------------- Избранное -------------------------------- */

export function Favorites() {
  const navigate = useNavigate();
  const favs = ['cp-balt', 'cp-sibur', 'cp-rnsnab', 'cp-yugtrans'];
  return (
    <div className="pmrk-page">
      <PageHeader title="Избранное" subtitle="Контрагенты с прямыми ссылками" breadcrumbs={[{ label: 'Главная', to: '/' }, { label: 'Избранное' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {favs.map((uid) => {
          const c = BY_UID.get(uid)!;
          return (
            <div key={uid} className="pmrk-card pmrk-card--pad pmrk-clickable" onClick={() => navigate(`/counterparties/${uid}`)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div className="pmrk-muted" style={{ fontSize: 12, marginTop: 2 }}>ИНН {c.inn} · {c.region}</div>
                </div>
                <GroupBadge group={c.group} withScore={c.score} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
