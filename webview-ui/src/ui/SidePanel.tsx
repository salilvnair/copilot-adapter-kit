/* SidePanel — a drawer that can be dragged wider.
 *
 * The mock draws the drawer as a fixed 330px overlay. A fixed width is fine
 * until you are pasting a long base URL or reading a failure message, so the
 * panel is mounted through dui's SplitPanelView: same resting width, but the
 * divider drags and double-clicks back to the default.
 *
 * The split stays mounted when there is no drawer — `collapsed` hides it rather
 * than the caller swapping between a split and a bare element. dui's own notes
 * are explicit about why: swapping moves the main subtree to a new position and
 * React rebuilds it, taking the filter text and scroll position with it.
 *
 * Every left- or right-hand panel in this UI goes through here, so they all
 * resize the same way. */

import { SplitPanelView } from '@salilvnair/dui';
import { useState, type ReactNode } from 'react';

export function SidePanel({
  main,
  panel,
  side = 'right',
  /** The width the panel opens at, in px. The mock's drawer is 330. */
  panelPx = 330,
  minMainPx = 320,
}: {
  main: ReactNode;
  panel?: ReactNode;
  side?: 'left' | 'right';
  panelPx?: number;
  minMainPx?: number;
}) {
  const onRight = side === 'right';

  // The split is held here rather than inside SplitPanelView, which does not
  // restore its own value after a collapse: the panel came back at its minimum
  // width instead of the width it had. Keeping it out here also means a width
  // the user dragged to survives closing and reopening the drawer.
  // Deliberately past the panel's minimum, so the very first open is clamped to
  // panelPx exactly as every later one is. Without it the first open sized from
  // the percentage and every open after it from the minimum — a different width
  // each time, which is the flicker this component exists to avoid.
  const [split, setSplit] = useState(onRight ? 95 : 5);

  // Collapsed, the remaining pane takes the whole width. A controlled split
  // would otherwise hold main at its open size and leave the drawer's share
  // sitting there as dead space.
  return (
    <SplitPanelView
      className="split-host"
      direction="horizontal"
      first={onRight ? main : panel}
      second={onRight ? panel : main}
      split={panel ? split : (onRight ? 100 : 0)}
      // Resizes reported while collapsed describe the collapse, not a drag.
      // Storing them overwrote the remembered width, and the panel reopened at a
      // different size each time — which is what read as flicker.
      onResize={next => { if (panel) setSplit(next); }}
      // The panel opens at panelPx and can be dragged wider. SplitPanelView
      // re-clamps to its minimum when it comes back from a collapse rather than
      // re-reading the split, so the minimum is set to the width the panel is
      // meant to have: it then opens at exactly that width, every time.
      minFirst={panel ? minMainPx : 0}
      minSecond={panel ? panelPx : 0}
      collapsed={!panel}
      collapsedSide={onRight ? 'second' : 'first'}
      accentColor="var(--c-primary)"
    />
  );
}
