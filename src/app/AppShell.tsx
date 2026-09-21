import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { IconSearchStroked } from '@consta/icons/IconSearchStroked';
import { IconRing } from '@consta/icons/IconRing';
import { IconSun } from '@consta/icons/IconSun';
import { IconMoon } from '@consta/icons/IconMoon';
import { IconUser } from '@consta/icons/IconUser';
import { useApp } from './AppContext';
import { visibleNav } from './nav';
import { CommandPalette } from './CommandPalette';
import { ScrollTopButton } from './ScrollTopButton';
import { PageMetaProvider } from './PageMeta';
import { AppShellSfk } from './AppShellSfk';
import { ROLES, ROLE_ORDER } from '@/shared/roles';
import { SIGNALS, TASKS } from '@/shared/mock/data';

function RoleSwitcher() {
  const { role, setRole } = useApp();
  const [open, setOpen] = useState(false);
  const def = ROLES[role];
  return (
    <div style={{ position: 'relative' }}>
      <button className="pmrk-iconbtn" style={{ width: 'auto', gap: 8, padding: '0 10px' }} onClick={() => setOpen((v) => !v)} title="Переключить роль (демо)">
        <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--color-bg-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
          {def.code.replace('КК-', '').slice(0, 3)}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-typo-primary)' }}>{def.short}</span>
          <span style={{ fontSize: 10.5, color: 'var(--color-typo-secondary)' }}>{def.code}</span>
        </span>
        <span style={{ color: 'var(--color-typo-secondary)' }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', right: 0, top: 44, width: 320, background: 'var(--color-bg-default)', border: '1px solid var(--color-bg-border)', borderRadius: 12, boxShadow: 'var(--pmrk-shadow-pop)', zIndex: 50, padding: 8 }}>
            <div className="pmrk-palette__group">Роль (демо «один продукт для 8 ролей»)</div>
            {ROLE_ORDER.map((rc) => {
              const r = ROLES[rc];
              return (
                <div
                  key={rc}
                  className={`pmrk-palette__item ${rc === role ? 'pmrk-palette__item--active' : ''}`}
                  onClick={() => { setRole(rc); setOpen(false); }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.title}</div>
                    <div className="pmrk-muted" style={{ fontSize: 11.5 }}>{r.code} · {r.profile === 'deep' ? 'глубокая работа' : r.profile === 'light' ? 'разовая справка' : 'регулярная работа'}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function AppShellPmrk() {
  const { role, aiOn, toggleAi, theme, setTheme, skin, setSkin, setPaletteOpen } = useApp();
  const navigate = useNavigate();
  const groups = visibleNav(role);
  const unread = SIGNALS.filter((s) => !s.read).length;
  const tasksAttention = TASKS.filter((t) => t.status !== 'completed').length;

  return (
    <div className="pmrk-app">
      <aside className="pmrk-sidebar">
        <div className="pmrk-brand pmrk-clickable" onClick={() => navigate('/')}>
          <div className="pmrk-brand__mark">ПМ</div>
          <div>
            <div className="pmrk-brand__name">ПМРК</div>
            <div className="pmrk-brand__sub">Кредитный контроль · ГК ГПН</div>
          </div>
        </div>

        <nav className="pmrk-nav">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="pmrk-nav__group">{g.title}</div>
              {g.items.map((it) => {
                const Icon = it.icon;
                const badge = it.badgeKey === 'signals' ? unread : it.badgeKey === 'tasks' ? tasksAttention : 0;
                return (
                  <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => `pmrk-nav__item ${isActive ? 'pmrk-nav__item--active' : ''}`}>
                    <Icon size="s" />
                    <span>{it.label}</span>
                    {it.aiHint && aiOn && <span style={{ color: 'var(--pmrk-ai)', fontSize: 11 }}>✦</span>}
                    {badge > 0 && <span className="pmrk-nav__badge">{badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="pmrk-main">
        <header className="pmrk-topbar">
          <div className="pmrk-search-trigger" onClick={() => setPaletteOpen(true)}>
            <IconSearchStroked size="s" />
            <span>Поиск контрагента, действия, разделы…</span>
            <span className="pmrk-kbd">Ctrl K</span>
          </div>

          <div className="pmrk-topbar__spacer" />

          <div className="pmrk-skin-toggle" title="Переключить дизайн: ПМРК1 (родной) ↔ ПМРК2 (повторение СФК)">
            <button className={skin === 'pmrk' ? 'on' : ''} onClick={() => setSkin('pmrk')} type="button">ПМРК1</button>
            <button className={skin === 'sfk' ? 'on' : ''} onClick={() => setSkin('sfk')} type="button">ПМРК2</button>
          </div>

          <div
            className={`pmrk-ai-toggle ${aiOn ? '' : 'pmrk-ai-toggle--off'}`}
            onClick={toggleAi}
            title="Показать продукт с AI-гипотезами или без них"
          >
            <span>✦ AI</span>
            <span className="pmrk-ai-switch" />
            <span style={{ fontSize: 11, opacity: 0.85 }}>{aiOn ? 'вкл' : 'выкл'}</span>
          </div>

          <button className="pmrk-iconbtn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Тема">
            {theme === 'light' ? <IconMoon size="s" /> : <IconSun size="s" />}
          </button>

          <button className="pmrk-iconbtn" onClick={() => navigate('/notifications')} title="Лента сигналов">
            <IconRing size="s" />
            {unread > 0 && <span className="pmrk-iconbtn__dot" />}
          </button>

          <RoleSwitcher />

          <button className="pmrk-iconbtn" title="Соколова Е.В.">
            <IconUser size="s" />
          </button>
        </header>

        <main className="pmrk-content">
          <Outlet />
        </main>
      </div>

      <ScrollTopButton />
      <CommandPalette />
    </div>
  );
}

/* Переключатель каркаса: скин «sfk» отдаёт оболочку, повторяющую портал СФК 1:1,
   скин «pmrk» — родную. PageMetaProvider оборачивает обе (PageHeader публикует
   заголовок в топбар SFK-каркаса; в каркасе ПМРК канал просто не используется). */
export function AppShell() {
  const { skin } = useApp();
  return (
    <PageMetaProvider>
      {skin === 'sfk' ? <AppShellSfk /> : <AppShellPmrk />}
    </PageMetaProvider>
  );
}
