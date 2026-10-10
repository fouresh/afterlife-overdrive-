import { useEffect, useState } from 'preact/hooks';
import type { HostStats } from '../game/host';

/** ?debug=1 overlay: FPS, frame times, entities, seed, resolution. */
export function DebugOverlay({ stats, extra }: { stats: HostStats; extra?: () => string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);
  const lines = [
    `FPS ${stats.fps}  avg ${stats.frameMs.toFixed(1)}ms  worst ${stats.worstFrameMs.toFixed(0)}ms`,
    `sim ${stats.simMs.toFixed(2)}ms  tick ${stats.tick}  ent ${stats.entities}`,
    `seed ${stats.seed}  ${stats.res}`,
  ];
  if (extra) lines.push(extra());
  return (
    <div class="debug" data-testid="debug-overlay">
      {lines.join('\n')}
    </div>
  );
}
