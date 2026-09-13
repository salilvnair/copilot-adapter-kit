/* Hold-to-confirm.
 *
 * Used instead of a confirmation dialog for anything irreversible. A dialog
 * trains you to click through it; a hold cannot be completed by muscle memory,
 * and it can be abandoned halfway by letting go. */

import { useEffect, useRef, useState } from 'react';
import * as I from '../icons';

export function HoldToConfirm({
  seconds = 2,
  onConfirm,
  label,
}: {
  seconds?: number;
  onConfirm: () => void;
  label: string;
}) {
  const [pct, setPct] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const started = useRef<number | undefined>(undefined);
  const done = useRef(false);

  const stop = () => {
    if (timer.current !== undefined) clearInterval(timer.current);
    timer.current = undefined;
    started.current = undefined;
    if (!done.current) setPct(0);
  };

  useEffect(() => stop, []);

  // Progress is measured against the wall clock and polled on an interval, not
  // driven by requestAnimationFrame: a hidden webview delivers no frames at
  // all, so an rAF-driven hold silently stalls the moment the panel stops being
  // the visible tab. Interval callbacks are throttled there, never stopped, and
  // reading Date.now() keeps the elapsed time honest either way.
  const begin = () => {
    if (done.current || started.current !== undefined) return;
    started.current = Date.now();
    setPct(0.5);
    timer.current = setInterval(() => {
      if (started.current === undefined) return;
      const next = Math.min(100, ((Date.now() - started.current) / (seconds * 1000)) * 100);
      setPct(next);
      if (next >= 100) {
        done.current = true;
        stop();
        setPct(100);
        onConfirm();
        setTimeout(() => { done.current = false; setPct(0); }, 400);
      }
    }, 40);
  };

  const remaining = Math.max(0, Math.ceil(seconds - (pct / 100) * seconds));

  return (
    <button
      type="button"
      className="hold-b"
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') begin(); }}
      onKeyUp={stop}
      onBlur={stop}
      aria-label={`${label} — press and hold for ${seconds} seconds`}
      style={{ ['--hold' as string]: `${pct}%` }}
    >
      <I.Circle size={12} />
      <span>{pct > 0 && pct < 100 ? `Keep holding — ${remaining}s` : `${label} — ${seconds}s`}</span>
    </button>
  );
}
