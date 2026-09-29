import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { IconSearchStroked } from '@consta/icons/IconSearchStroked';
import { IconRing } from '@consta/icons/IconRing';
import { IconSun } from '@consta/icons/IconSun';
import { IconMoon } from '@consta/icons/IconMoon';
import { useApp } from './AppContext';
import { usePageMetaValue } from './PageMeta';
import { NAV, visibleNav } from './nav';
import { CommandPalette } from './CommandPalette';
import { ScrollTopButton } from './ScrollTopButton';
import { ROLES, ROLE_ORDER } from '@/shared/roles';
import { SIGNALS, TASKS } from '@/shared/mock/data';

/* Каркас СФК — точное визуальное повторение оболочки портала СФК
   (sfk-portal/src/App.tsx + styles.css): сайдбар + рабочая область, у которой
   заголовок и контролы живут в ОДНОЙ строке топбара. Контент рисует <Outlet/>;
   заголовок/действия страницы приходят из PageMeta (см. PageHeader). */

const initials = (s: string) =>
  s.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Персона-свитчер в стиле СФК (native select). Контент — 8 ролей ПМРК. */
function PersonaSelect() {
  const { role, setRole } = useApp();
  return (
    <div className="sfk-persona">
      <label>Роль:</label>
      <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
        {ROLE_ORDER.map((rc) => (
          <option key={rc} value={rc}>{ROLES[rc].short}</option>
        ))}
      </select>
    </div>
  );
}

export function AppShellSfk() {
  const { role, aiOn, toggleAi, theme, setTheme, skin, setSkin, setPaletteOpen } = useApp();
  const navigate = useNavigate();
  const loc = useLocation();
  const meta = usePageMetaValue();
  const groups = visibleNav(role);
  const unread = SIGNALS.filter((s) => !s.read).length;
  const tasksAttention = TASKS.filter((t) => t.status !== 'completed').length;

  // Заголовок для топбара: из PageMeta, иначе — по активному пункту навигации.
  const navLabel = NAV.flatMap((g) => g.items).find((it) => it.to !== '/' && loc.pathname.startsWith(it.to))?.label;
  const title = meta.title ?? navLabel ?? 'ПМРК';

  return (
    <div className="sfk-app">
      <aside className="sfk-sidebar">
        <div className="sfk-brand" onClick={() => navigate('/')}>
          <div className="sfk-brand-logo">ПМ</div>
          <div className="sfk-brand-text">
            <strong>ПМРК</strong>
          </div>
        </div>

        <nav className="sfk-nav">
          {groups.map((g) => (
            <div className="sfk-nav-group" key={g.title}>
              <div className="sfk-nav-group-title">{g.title}</div>
              {g.items.map((it) => {
                const Icon = it.icon;
                const badge = it.badgeKey === 'signals' ? unread : it.badgeKey === 'tasks' ? tasksAttention : 0;
                return (
                  <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <Icon size="s" />
                    <span>{it.label}</span>
                    {it.aiHint && aiOn && <span className="sfk-nav-ai">✦</span>}
                    {badge > 0 && <span className="count">{badge}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sfk-side-user">
          <div className="sfk-avatar">{initials(ROLES[role].title)}</div>
          <div className="sfk-side-user-info">
            <strong>{ROLES[role].title}</strong>
            <span>{ROLES[role].code}</span>
          </div>
        </div>
      </aside>

      <section className="sfk-workspace">
        <div className="sfk-topbar">
          <div className="sfk-phead-t">
            {meta.breadcrumbs && meta.breadcrumbs.length > 0 && (
              <div className="sfk-breadcrumb">
                {meta.breadcrumbs.map((b, i) => (
                  <span key={i}>
                    {i > 0 && ' / '}
                    {b.to ? <Link to={b.to}>{b.label}</Link> : b.label}
                  </span>
                ))}
              </div>
            )}
            {/* пустой title от страницы — заголовка в топбаре нет, только крошки */}
            {title && <h1 className="sfk-page-title">{title}</h1>}
            {meta.subtitle && <div className="sfk-page-sub">{meta.subtitle}</div>}
          </div>

          <div className="sfk-hero-actions">
            <button className="sfk-icon-button" onClick={() => setPaletteOpen(true)} title="Поиск · Ctrl K" aria-label="Поиск">
              <IconSearchStroked size="s" />
            </button>

            <div
              className={`pmrk-ai-toggle ${aiOn ? '' : 'pmrk-ai-toggle--off'}`}
              onClick={toggleAi}
              title="Показать продукт с AI-гипотезами или без них"
            >
              <span>✦ AI</span>
              <span className="pmrk-ai-switch" />
              <span style={{ fontSize: 11, opacity: 0.85 }}>{aiOn ? 'вкл' : 'выкл'}</span>
            </div>

            <button className="sfk-icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Тема" aria-label="Тема">
              {theme === 'light' ? <IconMoon size="s" /> : <IconSun size="s" />}
            </button>

            <PersonaSelect />

            <button className="sfk-icon-button sfk-bell" onClick={() => navigate('/notifications')} title="Лента сигналов" aria-label="Лента сигналов">
              <IconRing size="s" />
              {unread > 0 && <span className="dot">{unread}</span>}
            </button>

            <div className="pmrk-skin-toggle" title="Переключить дизайн: ПМРК1 (родной) ↔ ПМРК2 (повторение СФК)">
              <button className={skin === 'pmrk' ? 'on' : ''} onClick={() => setSkin('pmrk')} type="button">ПМРК1</button>
              <button className={skin === 'sfk' ? 'on' : ''} onClick={() => setSkin('sfk')} type="button">ПМРК2</button>
            </div>
          </div>
        </div>

        {meta.actions && <div className="sfk-page-actions">{meta.actions}</div>}

        <Outlet />
      </section>

      <ScrollTopButton />
      <CommandPalette />
    </div>
  );
}
