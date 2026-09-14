/* The standalone Spend Guard panel — what `showUsage` opens now instead of the
 * native modal. Same component as the rail's screen, so there is one dashboard
 * with two doors into it. */

import { SpendGuard } from './screens/SpendGuard';
import { useAppState } from './state';

export function SpendGuardPanel() {
  const state = useAppState();
  if (!state) return <div className="pane" />;
  return (
    <>
      {state.isSample && (
        <div className="fixture-bar">
          Sample data — this page is running outside VS Code, so none of these figures are yours.
        </div>
      )}
      <SpendGuard state={state} standalone />
    </>
  );
}
