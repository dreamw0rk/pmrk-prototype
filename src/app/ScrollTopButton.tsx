import { useEffect, useState } from 'react';
import { IconArrowUp } from '@consta/icons/IconArrowUp';

/* Кнопка «Наверх» — небольшая, внизу справа. Появляется, когда страница
   прокручена вниз, и плавно возвращает к началу. Прокручивается не окно, а
   контейнер рабочей области: .pmrk-content в оболочке ПМРК1, .sfk-workspace —
   в ПМРК2, поэтому кнопка сама находит нужный контейнер. */
const SCROLLER = '.pmrk-content, .sfk-workspace';
const SHOW_AFTER = 300;

export function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  // scroll не всплывает, но ловится в фазе захвата на document — так кнопка
  // не привязана к конкретному элементу и переживает пересоздание контейнера
  // (смена оболочки ПМРК1/ПМРК2, горячая перезагрузка).
  useEffect(() => {
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.matches(SCROLLER)) setVisible(t.scrollTop > SHOW_AFTER);
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, []);

  const toTop = () => document.querySelector<HTMLElement>(SCROLLER)?.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <button
      type="button"
      onClick={toTop}
      title="Наверх"
      aria-label="Наверх"
      style={{
        position: 'fixed', right: 24, bottom: 24, zIndex: 50,
        width: 36, height: 36, borderRadius: '50%', border: 'none',
        background: 'var(--color-bg-brand)', color: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'var(--pmrk-shadow-2)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(8px)',
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity .18s, transform .18s',
      }}
    >
      <IconArrowUp size="s" />
    </button>
  );
}
