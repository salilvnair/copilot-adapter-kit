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
  const raf = useRef<number | undefined>(undefined);
  const started = useRef<number | undefined>(undefined);
  const done = useRef(false);

  const stop = () => {
    if (raf.current !== undefined) cancelAnimationFrame(raf.current);
    raf.current = undefined;
    started.current = undefined;
    if (!done.current) setPct(0);
  };

  useEffect(() => stop, []);

  const tick = () => {
    if (started.current === undefined) return;
    const elapsed = Date.now() - started.current;
    const next = Math.min(100, (elapsed / (seconds * 1000)) * 100);
    setPct(next);
    if (next >= 100) {
      done.current = true;
      stop();
      onConfirm();
      // Let the filled state show for a beat before it resets.
      setTimeout(() => { done.current = false; setPct(0); }, 400);
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    if (done.current) return;
    started.current = Date.now();
    raf.current = requestAnimationFrame(tick);
  };

  return (
    <button
      type="button"
      className="hold-b"
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') begin(); }}
      onKeyUp={stop}
      aria-label={`${label} — press and hold for ${seconds} seconds`}
      style={{ ['--hold' as string]: `${pct}%` }}
    >
      <I.Circle size={12} />
      <span>{pct > 0 && pct < 100 ? `Keep holding — ${Math.ceil(seconds - (pct / 100) * seconds)}s` : `${label} — ${seconds}s`}</span>
    </button>
  );
}
