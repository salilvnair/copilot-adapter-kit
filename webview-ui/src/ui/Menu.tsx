/* Menu — the three-dot overflow.
 *
 * Written here rather than taken from dui: dui's ContextMenuView renders and
 * closes correctly, but never invokes an item's `onClick`, so every entry that
 * did more than change screens silently did nothing. Its hover classes are
 * reused so the look is unchanged.
 *
 * Keyboard: Escape closes, Up/Down move, Enter or Space picks. Destructive
 * entries sit last, behind a separator, in red — everywhere, without exception. */

import { IconButtonView } from '@salilvnair/dui';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as I from '../icons';

export interface MenuItem {
  id: string;
  label?: string;
  description?: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

export function Menu({
  items,
  label,
  align = 'left',
  trigger,
}: {
  items: MenuItem[];
  /** Accessible name — an icon-only trigger still needs one. */
  label: string;
  /** Which edge of the trigger the menu lines up with. */
  align?: 'left' | 'right';
  /** Defaults to the three-dot button. */
  trigger?: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* IconButtonView does not forward a ref, and the popup needs the trigger's
          box to position against — so the ref lives on a wrapper. */}
      <span ref={anchor} style={{ display: 'inline-flex' }}>
      <IconButtonView
        icon={trigger ?? <I.Dots />}
        size="md"
        variant="ghost"
        active={open}
        tooltip={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="menu-trigger"
        accentColor="var(--c-primary)"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      />
      </span>
      {open && (
        <Popup
          items={items}
          anchor={anchor.current}
          align={align}
          label={label}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

function Popup({
  items, anchor, align, label, close,
}: {
  items: MenuItem[];
  anchor: HTMLElement | null;
  align: 'left' | 'right';
  label: string;
  close: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [active, setActive] = useState(0);

  const pickable = items.filter(i => !i.separator && !i.disabled);

  // Place it after measuring, so a menu near an edge folds back inside the
  // window instead of being clipped by it.
  useLayoutEffect(() => {
    if (!anchor || !box.current) return;
    const a = anchor.getBoundingClientRect();
    const b = box.current.getBoundingClientRect();
    const gap = 4;
    let left = align === 'right' ? a.right - b.width : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - b.width - 8));
    let top = a.bottom + gap;
    if (top + b.height > window.innerHeight - 8) top = Math.max(8, a.top - b.height - gap);
    setPos({ top, left });
  }, [anchor, align]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, pickable.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const item = pickable[active];
        if (item) { close(); item.onClick?.(); }
      }
    };
    // `true` so the outside-click lands before anything under the cursor.
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
    };
  }, [close, pickable, active]);

  let idx = -1;

  return createPortal(
    <div
      ref={box}
      className="cak-menu"
      role="menu"
      aria-label={label}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {items.map(item => {
        if (item.separator) return <div key={item.id} className="cak-menu__sep" />;
        idx += 1;
        const mine = idx;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={
              'cak-menu__item dui_ctx-menu__item'
              + (item.danger ? ' cak-menu__item--danger dui_ctx-menu__item--danger' : '')
              + (item.disabled ? ' dui_ctx-menu__item--disabled' : '')
              + (mine === active ? ' is-active' : '')
            }
            onMouseEnter={() => setActive(mine)}
            onClick={() => { close(); item.onClick?.(); }}
          >
            <span className="cak-menu__icon">{item.icon}</span>
            <span className="cak-menu__text">
              <span className="cak-menu__label">{item.label}</span>
              {item.description && <span className="cak-menu__desc">{item.description}</span>}
            </span>
            {item.shortcut && <span className="cak-menu__kbd mono">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
