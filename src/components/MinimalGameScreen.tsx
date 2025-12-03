import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import { useEffect, useRef } from 'react';
import { useElementSize } from 'usehooks-ts';
import { api } from '../../convex/_generated/api';
import { useServerGame } from '../hooks/serverGame.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import PixiGame from './PixiGame.tsx';

export default function MinimalGameScreen() {
  const convex = useConvex();
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  // Keep world alive
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime } = useHistoricalTime(worldState?.engine);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // noop; keep this component lightweight but ready for DOM events
  }, []);

  if (!worldId || !engineId || !game) return null;

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) await document.exitFullscreen();
    else await el.requestFullscreen();
  };

  return (
    <div ref={gameWrapperRef} className="w-full h-screen relative bg-brown-900" style={{ position: 'relative' }}>
      <div ref={containerRef} className="absolute inset-0">
        <button
          onClick={toggleFullscreen}
          style={{ position: 'absolute', zIndex: 10, right: 12, top: 12 }}
        >
          FULLSCREEN
        </button>
        <div className="w-full h-full">
          <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
            <ConvexProvider client={convex}>
              <PixiGame
                game={game}
                worldId={worldId}
                engineId={engineId}
                width={width}
                height={height}
                historicalTime={historicalTime}
                setSelectedElement={() => {}}
              />
            </ConvexProvider>
          </Stage>
        </div>
      </div>
    </div>
  );
}
