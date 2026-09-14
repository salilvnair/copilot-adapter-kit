/* ─────────────────────────────────────────────────────────────────────────────
 * ui/index.tsx — primitives for the approved mock.
 *
 * Each component emits the mock's markup and class names unchanged, so what
 * renders is what was signed off. If a screen needs something these don't
 * cover, add a primitive here from the mock's markup — never restyle inline.
 *
 * The classes themselves live in styles/cak.css, extracted verbatim.
 * ───────────────────────────────────────────────────────────────────────────── */

import { ButtonView, IconButtonView } from '@salilvnair/dui';
import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

type Kids = { children?: ReactNode; className?: string; style?: CSSProperties };

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

/* ── Chips ────────────────────────────────────────────────────────────── */

export type ChipTone = 'ok' | 'warn' | 'err' | 'mute' | 'pri' | 'info';

const CHIP_TONE: Record<ChipTone, string> = {
  ok: 'chip-ok',
  warn: 'chip-warn',
  err: 'chip-err',
  mute: 'chip-mute',
  pri: 'chip-pri',
  info: 'chip-info',
};

export function Chip({
  tone = 'mute',
  dot = false,
  mono = false,
  children,
  className,
  style,
}: Kids & { tone?: ChipTone; dot?: boolean; mono?: boolean }) {
  return (
    <span className={cx('chip', CHIP_TONE[tone], mono && 'mono', className)} style={style}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

/* ── Buttons ──────────────────────────────────────────────────────────── */

export type BtnVariant = 'default' | 'pri' | 'ghost' | 'danger';

/** Our names mapped onto dui's. */
const BTN_VARIANT: Record<BtnVariant, 'primary' | 'secondary' | 'ghost' | 'danger'> = {
  default: 'secondary',
  pri: 'primary',
  ghost: 'ghost',
  danger: 'danger',
};

/**
 * Buttons are dui's, not ours.
 *
 * The mock is a static page, so the CSS extracted from it carries no hover,
 * active or focus states — buttons built on it looked right and felt dead.
 * ButtonView brings dui's interaction behaviour, its focus ring and its
 * loading state; `accentColor` keeps the mock's indigo.
 */
export function Btn({
  variant = 'default',
  icon,
  onClick,
  title,
  disabled,
  loading,
  autoFocus,
  children,
  className,
  style,
}: Kids & {
  variant?: BtnVariant;
  icon?: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  /** Shows dui's spinner and blocks further clicks. */
  loading?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <ButtonView
      variant={BTN_VARIANT[variant]}
      size="md"
      iconLeft={icon}
      loading={loading}
      onClick={onClick}
      title={title}
      disabled={disabled}
      autoFocus={autoFocus}
      className={className}
      style={style}
      accentColor="var(--c-primary)"
    >
      {children}
    </ButtonView>
  );
}

/** Icon-only button — dui's, for the same reason. */
export function IconBtn({
  icon,
  label,
  ghost = false,
  on = false,
  onClick,
  disabled,
  className,
}: {
  icon: ReactNode;
  /** Required: an icon-only control still needs an accessible name. */
  label: string;
  ghost?: boolean;
  on?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <IconButtonView
      icon={icon}
      size="md"
      variant={ghost ? 'ghost' : 'filled'}
      active={on}
      tooltip={label}
      aria-label={label}
      aria-pressed={on || undefined}
      onClick={onClick}
      disabled={disabled}
      className={className}
      accentColor="var(--c-primary)"
    />
  );
}

/** The one close mark used across the product. dui's icon button, sized down,
 *  with the red-on-approach treatment from cak.css. */
export function CloseBtn({ onClick, label = 'Close' }: { onClick?: () => void; label?: string }) {
  return (
    <IconButtonView
      icon={
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      }
      size="xs"
      variant="ghost"
      tooltip={label}
      aria-label={label}
      onClick={onClick}
      className="cak-close"
      accentColor="var(--c-error)"
    />
  );
}

export function IconBtnGroup({ children, className, style }: Kids) {
  return <span className={cx('ibtn-group', className)} style={style}>{children}</span>;
}

/** The gradient generate button from the sidebar composer. */
export function AiBtn({ icon, onClick, children, className }: Kids & { icon?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className={cx('btn-ai', className)} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

/* ── Cards & panes ────────────────────────────────────────────────────── */

export function Card({ header, right, children, className, style }: Kids & { header?: ReactNode; right?: ReactNode }) {
  return (
    <div className={cx('card', className)} style={style}>
      {header !== undefined && (
        <div className="card-h">
          {header}
          {right !== undefined && <span className="r">{right}</span>}
        </div>
      )}
      <div className="card-b">{children}</div>
    </div>
  );
}

export function Tile({ label, value, sub, children, className, style }: Kids & { label?: ReactNode; value?: ReactNode; sub?: ReactNode }) {
  return (
    <div className={cx('tile', className)} style={style}>
      {label !== undefined && <div className="tile-k">{label}</div>}
      {value !== undefined && <div className="tile-v mono">{value}</div>}
      {children}
      {sub !== undefined && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

export function Pane({ children, className, style }: Kids) {
  return <div className={cx('pane', className)} style={style}>{children}</div>;
}

export function PaneSplit({ weight, children, className, style }: Kids & { weight?: 'left' | 'right' }) {
  return (
    <div className={cx('pane-2', weight === 'left' && 'wide-l', weight === 'right' && 'wide-r', className)} style={style}>
      {children}
    </div>
  );
}

export function Crumb({ trail, right }: { trail: ReactNode[]; right?: ReactNode }) {
  return (
    <div className="crumb">
      {trail.map((part, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span className="sep">&rsaquo;</span>}
          {i === trail.length - 1 ? <b>{part}</b> : part}
        </span>
      ))}
      {right !== undefined && <span className="r">{right}</span>}
    </div>
  );
}

export function PageHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="page-head">
      <h3>{title}</h3>
      {sub !== undefined && <span className="sub">{sub}</span>}
      {right !== undefined && <span className="right">{right}</span>}
    </div>
  );
}

export function SectionTitle({ children, right, className, style }: Kids & { right?: ReactNode }) {
  return (
    <div className={cx('sec-t', className)} style={style}>
      {children}
      {right !== undefined && <span className="r">{right}</span>}
    </div>
  );
}

export function Rule() {
  return <div className="hr" />;
}

/* ── Controls ─────────────────────────────────────────────────────────── */

export function Switch({ on, onChange, label }: { on: boolean; onChange?: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cx('sw', on && 'on')}
      onClick={() => onChange?.(!on)}
    />
  );
}

/**
 * A number with − and +, and the number itself typeable.
 *
 * It used to be read-only text: getting from the default to 393,216 meant
 * clicking + ninety-six times, and there was no way to say a figure the step
 * size cannot land on. Pass `num` and `onSet` to make the value an input;
 * without them it stays a plain readout.
 *
 * While focused the field shows the raw number, because "2.00M" is not
 * something you can edit a digit of. Blur or Enter commits, Escape abandons.
 */
export function Stepper({
  value, onDec, onInc, label, num, onSet, format, parse,
}: {
  value: ReactNode;
  onDec?: () => void;
  onInc?: () => void;
  label: string;
  /** The raw value, when it should be editable. */
  num?: number;
  onSet?: (n: number) => void;
  /** How the raw value reads when the field is not focused. */
  format?: (n: number) => string;
  /** How typed text becomes a number. Defaults to Number(). */
  parse?: (text: string) => number;
}) {
  const editable = typeof num === 'number' && !!onSet;
  const [draft, setDraft] = useState<string | null>(null);
  /* Escape blurs the field, and blur commits. Clearing the draft in state is
     too late — React has not re-rendered by the time onBlur runs — so the
     abandon is recorded in a ref the commit checks. */
  const abandoned = useRef(false);

  const commit = () => {
    if (abandoned.current) { abandoned.current = false; setDraft(null); return; }
    if (draft === null) return;
    const n = parse ? parse(draft) : Number(draft);
    setDraft(null);
    if (Number.isFinite(n) && n >= 0) onSet!(Math.floor(n));
  };

  return (
    <span className="stepper" role="group" aria-label={label}>
      {editable ? (
        <input
          className="v mono stepper-in"
          inputMode="numeric"
          value={draft ?? (format ? format(num!) : String(num))}
          onChange={e => setDraft(e.target.value)}
          onFocus={() => setDraft(String(num))}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { abandoned.current = true; e.currentTarget.blur(); }
          }}
          // The group already carries `label`; repeating it here would leave
          // two controls answering to the same name.
          aria-label={`${label} value`}
        />
      ) : (
        <span className="v mono">{value}</span>
      )}
      <button type="button" className="b" onClick={onDec} aria-label={`Decrease ${label}`}>
        &minus;
      </button>
      <button type="button" className="b" onClick={onInc} aria-label={`Increase ${label}`}>
        +
      </button>
    </span>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegOption<T>[];
  value: T;
  onChange?: (next: T) => void;
  className?: string;
}) {
  return (
    <span className={cx('seg-ctl', className)} role="tablist">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cx('s', o.value === value && 'on')}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function Slider({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <span className="slider" role="img" aria-label={`${label}: ${Math.round(clamped)}%`}>
      <span className="f" style={{ width: `${clamped}%` }} />
      <span className="k" style={{ left: `calc(${clamped}% - 7px)` }} />
    </span>
  );
}

export function Meter({ pct, tone = 'pri' }: { pct: number; tone?: 'pri' | 'ok' | 'warn' | 'err' }) {
  const color = { pri: '#6366f1', ok: 'var(--c-success)', warn: 'var(--c-warning)', err: 'var(--c-error)' }[tone];
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

/* ── Settings row ─────────────────────────────────────────────────────── */

export function SettingRow({
  name,
  desc,
  modified = false,
  children,
}: {
  name: ReactNode;
  desc?: ReactNode;
  /** The dot the mock puts beside anything changed from its default. */
  modified?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="row-set">
      <span className="l">
        <span className="n">
          {modified && <span className="mod" />}
          {name}
        </span>
        {desc !== undefined && <span className="d">{desc}</span>}
      </span>
      {children}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */

export function EmptyState({ icon, title, detail, children }: { icon: ReactNode; title: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-ico">{icon}</span>
      <span className="t">{title}</span>
      {detail !== undefined && <span className="d">{detail}</span>}
      {children}
    </div>
  );
}

/* ── Rail ─────────────────────────────────────────────────────────────── */

export function RailGroup({ children }: Kids) {
  return <div className="rail-grp">{children}</div>;
}

export function RailItem({
  icon,
  count,
  countTone,
  active = false,
  onClick,
  children,
  className,
}: Kids & {
  icon?: ReactNode;
  count?: ReactNode;
  countTone?: 'ok' | 'hot';
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={cx('rail-item', active && 'on', className)}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      {children}
      {count !== undefined && <span className={cx('ct', countTone)}>{count}</span>}
    </button>
  );
}

/* ── Misc mock parts ──────────────────────────────────────────────────── */

export function Spark({ bars, label, style }: { bars: number[]; label: string; style?: CSSProperties }) {
  const max = Math.max(...bars, 1);
  return (
    <span className="spark" role="img" aria-label={label} style={style}>
      {bars.map((b, i) => (
        <i key={i} style={{ height: `${Math.max(2, Math.round((b / max) * 16))}px`, ...(i === bars.length - 1 ? { background: '#6366f1' } : null) }} />
      ))}
    </span>
  );
}

export function ProvMark({ children, className, style }: Kids) {
  return <span className={cx('prov-mark', className)} style={style}>{children}</span>;
}

export function Field({ label, children, className, style }: Kids & { label: ReactNode }) {
  return (
    <div className={cx('field', className)} style={style}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Input({ value, placeholder, mono = false, focus = false }: { value?: ReactNode; placeholder?: ReactNode; mono?: boolean; focus?: boolean }) {
  return (
    <div className={cx('inp', mono && 'mono', focus && 'focus', value === undefined && 'ph')}>
      {value ?? placeholder}
    </div>
  );
}
