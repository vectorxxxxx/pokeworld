import { Stage } from '@pixi/react';
import { sound } from '@pixi/sound';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import { Viewport } from 'pixi-viewport';
import * as PIXI from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { useElementSize } from 'usehooks-ts';
import { api } from '../../convex/_generated/api';
import { useServerGame } from '../hooks/serverGame.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import ConversationLog from './ConversationLog';
import PixiGame from './PixiGame.tsx';

export default function PokeworldDashboard() {
  const convex = useConvex();
  const [centerRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  // keep world alive
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime } = useHistoricalTime(worldState?.engine);
  const musicUrl = useQuery(api.music.getBackgroundMusic);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // DOM ref for the element tracked by `useElementSize` so we can request fullscreen on it.
  const centerDomRef = useRef<HTMLDivElement | null>(null);
  // Exposed viewport ref so we can programmatically fit/zoom the world.
  const pixiViewportRef = useRef<Viewport | undefined>();
  const logRef = useRef<HTMLDivElement | null>(null);
  const [musicPlaying, setMusicPlaying] = useState<boolean>(() => {
    try {
      const anySound = (sound as any);
      if (typeof anySound.isPlaying === 'function') return !!anySound.isPlaying('background');
    } catch (e) {
      // ignore
    }
    // Default to playing/unmuted when entering the dashboard.
    return true;
  });
  const [selectedPlayer, setSelectedPlayer] = useState<undefined | string>(undefined);
  const [isNight, setIsNight] = useState<boolean>(false);
  const [displayTime, setDisplayTime] = useState('0:00');
  const [breath, setBreath] = useState<number>(50);
  const [intensity, setIntensity] = useState<number>(0);
  const [simStats, setSimStats] = useState<Record<string, { hp: number; pp: number; exp: number }>>({});
  const [mobileLogOpen, setMobileLogOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  const setSelectedElement = (element?: { kind: 'player'; id: string }) => {
    if (!element) {
      setSelectedPlayer(undefined);
      return;
    }
    const id = element.id;
    setSelectedPlayer(id);
    // create deterministic simulated stats if missing
    setSimStats((prev) => {
      if (prev[id]) return prev;
      // deterministic-ish from id
      let seed = 0;
      for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) & 0xffffffff;
      const rand = (n: number) => Math.abs((seed = (seed * 1664525 + 1013904223) | 0)) % n;
      const stats = {
        hp: 40 + rand(61),
        pp: 20 + rand(81),
        exp: rand(101),
      };
      return { ...prev, [id]: stats };
    });
  };
  // Pick one active conversation (first) to show in the battle log.
  const activeConversation = game ? [...game.world.conversations.values()][0] : undefined;

  const currentlyTyping = activeConversation?.isTyping;
  const currentlyTypingName = currentlyTyping
    ? game?.playerDescriptions.get(currentlyTyping.playerId)?.name
    : undefined;

  // Persisted logs state (per world). Stored in localStorage so logs survive reloads.
  const storageKey = worldId ? `ai-town-logs-${worldId}` : null;
  const [persistedLogs, setPersistedLogs] = useState<any[]>(() => {
    try {
      if (!storageKey) return [];
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(persistedLogs));
    } catch (e) {
      // ignore
    }
  }, [storageKey, persistedLogs]);

  // Display server-driven world time (server sends elapsedMs and serverNowMs).
  useEffect(() => {
    if (!worldStatus) return;
    const elapsedMs = (worldStatus as any).elapsedMs ?? 0;
    // The server computed elapsedMs at query time; compute the client's start timestamp.
    const startTimestamp = Date.now() - elapsedMs;

    const update = () => {
      const now = Date.now();
      const elapsed = Math.max(0, now - startTimestamp);
      const totalSeconds = Math.floor(elapsed / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const hh = hours.toString().padStart(2, '0');
      const mm = minutes.toString().padStart(2, '0');
      const ss = seconds.toString().padStart(2, '0');
      setDisplayTime(`${hh}:${mm}:${ss}`);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [worldStatus]);

  // When entering fullscreen, ensure the Pixi viewport is zoomed out to fit
  // the whole world and centered. We listen for fullscreen changes on the
  // document and, when the fullscreen element matches our center DOM, compute
  // the fit scale from the current measured width and the game's world width.
  useEffect(() => {
    const handler = () => {
      try {
        const el = centerDomRef.current;
        if (!el) return;
        const isFs = document.fullscreenElement === el;
        if (!isFs) return;
        const vp = pixiViewportRef.current;
        if (!vp) return;
        if (!game) return;
        const worldWidth = game.worldMap.width * game.worldMap.tileDim;
        const worldHeight = game.worldMap.height * game.worldMap.tileDim;
        const targetScale = (width && worldWidth) ? (width / worldWidth) : 1;
        // Set zoom and clamp bounds similar to PixiViewport initial logic.
        try {
          vp.zoom(targetScale);
          vp.clampZoom({ minScale: targetScale, maxScale: Math.max(targetScale * 3.0, targetScale + 0.1) });
          // store fit scale
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (vp as any).__fitMinScale = targetScale;
          // center the viewport on the world center and animate scale/position
          const centerPoint = new PIXI.Point(worldWidth / 2, worldHeight / 2);
          vp.animate({ position: centerPoint, scale: targetScale });
        } catch (e) {
          // ignore animation/zoom errors
        }
      } catch (e) {
        // ignore
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [centerDomRef, width, game]);

  // On small screens (mobile), when the measured center size updates, compute a fit
  // scale so the Pixi viewport shows the entire world fully zoomed-out without cropping.
  useEffect(() => {
    try {
      if (!game) return;
      // Only apply this on narrow viewports (mobile)
      if (!isMobile) return;
      const vp = pixiViewportRef.current;
      if (!vp) return;
      // Use the stage dimensions (mobile fixed 800x600) or measured center size on desktop
      const stageW = isMobile ? 800 : width;
      const stageH = isMobile ? 600 : height;
      if (!stageW || !stageH) return;
      // If the center DOM is fullscreen, skip — fullscreen logic already handles fit.
      if (document.fullscreenElement === centerDomRef.current) return;

      const worldWidth = game.worldMap.width * game.worldMap.tileDim;
      const worldHeight = game.worldMap.height * game.worldMap.tileDim;
      if (!worldWidth || !worldHeight) return;

      const targetScale = Math.min(stageW / worldWidth, stageH / worldHeight);
      try {
        vp.zoom(targetScale);
        vp.clampZoom({ minScale: targetScale, maxScale: Math.max(targetScale * 3.0, targetScale + 0.1) });
        const centerPoint = new PIXI.Point(worldWidth / 2, worldHeight / 2);
        // Animate to the fitted position/scale for a smooth transition.
        vp.animate({ position: centerPoint, scale: targetScale });
      } catch (e) {
        // ignore animation/zoom errors
      }
    } catch (e) {
      // ignore
    }
  }, [width, height, game, centerDomRef, isMobile]);

  // Track window width to update `isMobile` responsively
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
    // Display server-driven world time: anchor to serverNowMs/serverStartMs so
    // all clients see the same time and progress it locally.
    useEffect(() => {
      if (!worldStatus) return;
      const ws = worldStatus as any;
      // serverNowMs is the server time at which elapsedMs was computed.
      const serverNowMs = typeof ws.serverNowMs === 'number' ? ws.serverNowMs : Date.now();
      const serverStartMs = typeof ws.serverStartMs === 'number' ? ws.serverStartMs : serverNowMs - (ws.elapsedMs ?? 0);
      const clientFetchAt = Date.now();

      const formatElapsed = (elapsed: number) => {
        const totalSeconds = Math.max(0, Math.floor(elapsed / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
          .toString()
          .padStart(2, '0')}`;
      };

      const update = () => {
        const nowAligned = serverNowMs + (Date.now() - clientFetchAt);
        const elapsed = Math.max(0, nowAligned - serverStartMs);
        setDisplayTime(formatElapsed(elapsed));
      };

      update();
      const id = setInterval(update, 1000);
      return () => clearInterval(id);
    }, [worldStatus]);

  // Initialize intensity from server activity when available.
  useEffect(() => {
    const ws = worldStatus as any;
    if (!ws) return;
    if (typeof ws.intensity === 'number') setIntensity(ws.intensity);
    if (typeof ws.breath === 'number') setBreath(ws.breath);
  }, [worldStatus]);

  // Poll the server frequently to get rapidly-changing simulated meters.
  // Client-side rapid meter animation: generate random values locally to
  // simulate rapid breathing/flicker without relying on the server.
  useEffect(() => {
    let mounted = true;
    const step = () => {
      if (!mounted) return;
      // generate rapid flicker values between 70 and 90
      const newBreath = 70 + Math.floor(Math.random() * 21); // 70..90
      const newIntensity = 70 + Math.floor(Math.random() * 21); // 70..90
      setBreath(newBreath);
      setIntensity(newIntensity);
    };

    // update roughly every 80-120ms to create a lively breathing/flicker effect
    const id = setInterval(step, 100);
    // run one immediately
    step();
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const addPersistedMessage = (m: any) => {
    setPersistedLogs((prev) => {
      const id = m.messageUuid ?? m._id;
      if (prev.find((p) => (p.messageUuid ?? p._id) === id)) return prev;
      const next = [...prev, m];
      next.sort((a, b) => (a._creationTime ?? a._creationTime) - (b._creationTime ?? b._creationTime));
      return next;
    });
  };

  // Auto-scroll log to bottom whenever persisted logs update or conversations change.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    // scroll to bottom to reveal latest
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [persistedLogs, game?.world.conversations.size]);

  const clearPersisted = () => setPersistedLogs([]);

  // Keep local state in sync with global music events.
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const detail = e?.detail;
        if (detail && typeof detail.isPlaying === 'boolean') {
          setMusicPlaying(detail.isPlaying);
        }
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener('pokeworld:music', handler as EventListener);
    return () => window.removeEventListener('pokeworld:music', handler as EventListener);
  }, []);

  // Register background music asset and try to auto-play when possible.
  useEffect(() => {
    if (!musicUrl) return;
    try {
      try {
        // Register the background asset (ignore if already added).
        const added = sound.add('background', musicUrl);
        if (added) added.loop = true;
      } catch (e) {
        // ignore if add fails (already registered or unsupported)
      }

      if (musicPlaying) {
        try {
          const prev = (window as any).__pokeworldMusicInstance;
          if (prev && typeof prev.stop === 'function') prev.stop();
        } catch {}

        try {
          const playResult = sound.play('background');
          // playResult may be a promise or an instance depending on the sound lib
          if (playResult && typeof (playResult as any).then === 'function') {
            (playResult as Promise<any>)
              .then((instance) => {
                (window as any).__pokeworldMusicInstance = instance;
              })
              .catch(() => {
                // autoplay blocked or play failed; ignore
              });
          } else {
            (window as any).__pokeworldMusicInstance = playResult;
          }
          (window as any).pokeworldMusicPlaying = true;
          window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: true } }));
        } catch (e) {
          // autoplay may be blocked by the browser; ignore
        }
      }
    } catch (e) {
      // ignore any unexpected errors
    }
  }, [musicUrl]);

  

  if (!worldId || !engineId || !game) return null;

  return (
    <div className="world-root w-full h-screen" style={{ position: 'relative' }}>
      <div className="clouds">
        <div className="cloud cloud-1" />
        <div className="cloud cloud-2" />
        <div className="cloud cloud-3" />
      </div>

      <div className="status-bar flex items-center px-4" id="statusBar">
        <span className="status-text hidden sm:inline mr-4">ROUTE 1 - READY FOR ADVENTURE</span>

        {/* Left: WORLD HP label */}
        <div className="hp-left flex items-center">
          <span className="font-semibold">WORLD HP</span>
        </div>

        {/* Right: HP meter stretched to the far right */}
        <div className="hp-meter flex-1 flex justify-end">
          <div className="hp-bar-container w-48 max-w-[60vw]">
            <div className="hp-bar-fill" id="worldHpBar" style={{ width: '100%' }} />
          </div>
        </div>
      </div>

      <div className="main-container max-w-[1400px] mx-auto flex flex-col md:flex-row gap-4 h-[calc(100vh-120px)]">
        <aside className="sidebar w-full md:w-64 flex-none h-36 md:h-auto">
          <div className="sidebar-header">
            <div className="sidebar-title">TRAINER MENU</div>
          </div>
          <div className="sidebar-content flex flex-row md:flex-col gap-4 items-start">
            <div className="flex flex-row gap-3 items-center flex-none">
              <button
                className="battle-btn fight small"
                style={{ width: 'auto' }}
                onClick={() => {
                  // Toggle night overlay locally and keep existing start event.
                  setIsNight((v) => !v);
                  window.dispatchEvent(new CustomEvent('pokeworld:start'));
                }}
              >
                {isNight ? 'Day' : 'Night'}
              </button>
              <button
                className="battle-btn run small"
                style={{ width: 'auto' }}
                onClick={async () => {
                  try {
                    // Ensure the background music asset is registered like MusicButton does.
                    if (musicUrl) {
                      try {
                        sound.add('background', musicUrl).loop = true;
                      } catch (e) {
                        // ignore if already added or add fails
                      }
                    }

                    // Use local state as the authoritative source to avoid duplicated play calls.
                    if (musicPlaying) {
                      // Stop any playing background sound instance
                      try {
                        const inst = (window as any).__pokeworldMusicInstance;
                        if (inst && typeof inst.stop === 'function') {
                          inst.stop();
                        } else {
                          sound.stop('background');
                        }
                      } catch (e) {
                        try {
                          sound.stop('background');
                        } catch {}
                      }
                      (window as any).pokeworldMusicPlaying = false;
                      (window as any).__pokeworldMusicInstance = undefined;
                      setMusicPlaying(false);
                      window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: false } }));
                    } else {
                      // Stop any existing instance before starting a new one
                      try {
                        const prev = (window as any).__pokeworldMusicInstance;
                        if (prev && typeof prev.stop === 'function') prev.stop();
                      } catch {}
                      const instance = await sound.play('background');
                      (window as any).__pokeworldMusicInstance = instance;
                      (window as any).pokeworldMusicPlaying = true;
                      setMusicPlaying(true);
                      window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: true } }));
                    }
                  } catch (e) {
                    // Fallback: flip global flag and local state
                    (window as any).pokeworldMusicPlaying = !(window as any).pokeworldMusicPlaying;
                    setMusicPlaying(!!(window as any).pokeworldMusicPlaying);
                    window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: !!(window as any).pokeworldMusicPlaying } }));
                  }
                }}
            >
              {musicPlaying ? 'MUTE' : 'UNMUTE'}
              </button>
            </div>

            <div className="stats-panel flex-1 md:flex-none w-auto">
              <div className="stats-title">WORLD STATUS</div>
              <div className="stat-row">
                <span className="stat-label">TIME</span>
                <span className="stat-value" id="timeDisplay">{displayTime}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">CREATURES</span>
                <span className="stat-value" id="lifeDisplay">{(worldStatus as any)?.creatures ?? '0'}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">AREA</span>
                <span className="stat-value" id="sizeDisplay">800x600</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">ACTIVITY</span>
                <span className="stat-value" id="activityDisplay">{((worldStatus as any)?.activity ?? 0) + '%'}</span>
              </div>
            </div>

            {/* Wild area card removed */}
          </div>
        </aside>

        <main
          ref={(el) => {
            // wire both the size-tracking ref and our DOM ref to the same element
              try {
                // centerRef is a callback ref from useElementSize
                (centerRef as any)(el);
              } catch {}
              // `el` can be a generic HTMLElement; narrow/cast to `HTMLDivElement` for the ref.
              centerDomRef.current = el as HTMLDivElement | null;
          }}
          className="center-area flex-1 min-h-0 relative bg-brown-900"
        >
          <div ref={containerRef} className="absolute inset-0">
            <div className="game-screen" style={{ position: 'relative', width: '100%', height: '100%' }}>
              <button
                className="screen-btn"
                style={{ position: 'absolute', right: 12, top: 12, zIndex: 20 }}
                onClick={async () => {
                  const el = centerDomRef.current ?? containerRef.current;
                  if (!el) return;
                  try {
                    if (document.fullscreenElement === el) {
                      if (document.exitFullscreen) await document.exitFullscreen();
                    } else {
                      if ((el as any).requestFullscreen) await (el as any).requestFullscreen();
                    }
                  } catch (e) {
                    // ignore fullscreen errors
                  }
                }}
              >
                FULLSCREEN
              </button>
              <Stage
                width={isMobile ? 800 : Math.max(0, width)}
                height={isMobile ? 600 : Math.max(0, height)}
                options={{ backgroundColor: 0x7ab5ff }}
                style={{ width: '100%', height: '100%' }}
              >
                <ConvexProvider client={convex}>
                  <PixiGame
                    game={game}
                    worldId={worldId}
                    engineId={engineId}
                    width={width}
                    height={height}
                    historicalTime={historicalTime}
                    setSelectedElement={setSelectedElement}
                    viewportRef={pixiViewportRef}
                  />
                </ConvexProvider>
              </Stage>
              {/* Night overlay placed above the Pixi canvas but below UI chrome (fullscreen button has zIndex 20).
                  Always render the overlay inside the game-screen so it precisely covers the display area,
                  and animate opacity to fade in/out. */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(3,15,60,0.70)',
                  zIndex: 5, // sit above canvas but below controls (controls use zIndex ~10)
                  pointerEvents: 'none',
                  transition: 'opacity 300ms ease',
                  opacity: isNight ? 1 : 0,
                }}
              />
            </div>
          </div>

          <div className="controls-panel hidden sm:block absolute bottom-0 left-0 right-0 p-4 z-10">
            <div className="control-group" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: 220 }}>
                <label style={{ fontSize: 12, marginBottom: 6 }}>World Breath</label>
                <div style={{ height: 4, width: '100%', background: '#e6e6e6', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${breath}%`, background: '#6ea8fe' }} />
                </div>
                {/* percent removed - meter is visual only */}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', width: 220 }}>
                <label style={{ fontSize: 12, marginBottom: 6 }}>Intensity</label>
                <div style={{ height: 4, width: '100%', background: '#e6e6e6', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${intensity}%`, background: '#ff9b9b' }} />
                </div>
                {/* percent removed - meter is visual only */}
              </div>
            </div>
          </div>
        </main>

        <aside className="sidebar w-full md:w-64 flex-none h-36 md:h-auto">
          <div className="sidebar-header">
            <div className="sidebar-title">POKEDEX LOG</div>
          </div>
          <div className="sidebar-content flex flex-row md:flex-col gap-4 items-start">
            <div className="stats-panel w-full md:w-auto">
              <div className="stats-title">CREATURE STATS</div>
              {
                (() => {
                  const s = selectedPlayer ? simStats[selectedPlayer] || { hp: 0, pp: 0, exp: 0 } : { hp: 0, pp: 0, exp: 0 };
                  const pct = (v: number) => `${Math.max(0, Math.min(100, Math.round(v)))}%`;
                  return (
                    <>
                      <div className="exp-container">
                        <div className="exp-label">
                          <span>HP</span>
                          <span>{pct(s.hp)}</span>
                        </div>
                        <div className="exp-bar">
                          <div className="exp-fill hp" style={{ width: pct(s.hp) }} />
                        </div>
                      </div>
                      <div className="exp-container">
                        <div className="exp-label">
                          <span>PP</span>
                          <span>{pct(s.pp)}</span>
                        </div>
                        <div className="exp-bar">
                          <div className="exp-fill pp" style={{ width: pct(s.pp) }} />
                        </div>
                      </div>
                      <div className="exp-container">
                        <div className="exp-label">
                          <span>EXP</span>
                          <span>{pct(s.exp)}</span>
                        </div>
                        <div className="exp-bar">
                          <div className="exp-fill exp" style={{ width: pct(s.exp) }} />
                        </div>
                      </div>
                    </>
                  );
                })()
              }
            </div>

            <div className="log-panel w-full md:w-auto">
              <div className="log-header">BATTLE LOG</div>
              <div className="log-content" id="liveFeed">
                {/* Render messages for all active conversations using ConversationLog */}
                {[...game.world.conversations.values()].length === 0 && (
                  <div className="log-item">
                    <span className="log-time">--:--</span>
                    <span>No recent events</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div />
                  <button className="battle-btn fight" onClick={clearPersisted}>
                    CLEAR LOGS
                  </button>
                </div>
                {/* Persisted logs (merged) */}
                {persistedLogs.map((m) => (
                  <div key={m.messageUuid ?? m._id} className="log-item">
                    <span className="log-time">
                      {new Date(m._creationTime).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span style={{ marginLeft: 8 }}>
                      <strong>{m.authorName}: </strong>
                      {m.text}
                    </span>
                  </div>
                ))}
                {/* Live conversation logs (also append to persisted storage) */}
                {[...game.world.conversations.values()].map((conv) => (
                  <ConversationLog key={conv.id} conv={conv} worldId={worldId} onNewMessage={addPersistedMessage} />
                ))}
              </div>
            </div>
          </div>
        </aside>
        {/* Mobile-only compact dashboard (Night / Mute / Log). Visible only on small screens */}
        <div className="mobile-dashboard sm:hidden">
          <div className="mobile-dashboard-inner">
            <button
              className="battle-btn fight small"
              onClick={() => {
                setIsNight((v) => !v);
                window.dispatchEvent(new CustomEvent('pokeworld:start'));
              }}
            >
              {isNight ? 'DAY' : 'NIGHT'}
            </button>

            <button
              className="battle-btn run small"
              onClick={async () => {
                try {
                  if (musicUrl) {
                    try {
                      sound.add('background', musicUrl).loop = true;
                    } catch (e) {
                      // ignore if already added
                    }
                  }

                  if (musicPlaying) {
                    try {
                      const inst = (window as any).__pokeworldMusicInstance;
                      if (inst && typeof inst.stop === 'function') inst.stop();
                      else sound.stop('background');
                    } catch (e) {
                      try {
                        sound.stop('background');
                      } catch {}
                    }
                    setMusicPlaying(false);
                    (window as any).pokeworldMusicPlaying = false;
                    (window as any).__pokeworldMusicInstance = undefined;
                    window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: false } }));
                  } else {
                    try {
                      const instance = await sound.play('background');
                      (window as any).__pokeworldMusicInstance = instance;
                    } catch (e) {
                      // ignore play errors
                    }
                    setMusicPlaying(true);
                    (window as any).pokeworldMusicPlaying = true;
                    window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: true } }));
                  }
                } catch (e) {
                  setMusicPlaying((v) => !v);
                  (window as any).pokeworldMusicPlaying = !!(window as any).pokeworldMusicPlaying;
                  window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: !!(window as any).pokeworldMusicPlaying } }));
                }
              }}
            >
              {musicPlaying ? 'MUTE' : 'UNMUTE'}
            </button>

            <button
              className="battle-btn fight small"
              onClick={() => setMobileLogOpen((v) => !v)}
            >
              {mobileLogOpen ? 'CLOSE' : 'LOG'}
            </button>
          </div>
        </div>

        {/* Mobile log panel (slides above footer) */}
        {mobileLogOpen && (
          <div className="mobile-log-panel sm:hidden">
            <div className="mobile-log-content">
              {[...game.world.conversations.values()].length === 0 && persistedLogs.length === 0 && (
                <div className="log-item">
                  <span className="log-time">--:--</span>
                  <span>No recent events</span>
                </div>
              )}

              {persistedLogs.slice(-20).map((m) => (
                <div key={m.messageUuid ?? m._id} className="log-item">
                  <span className="log-time">
                    {new Date(m._creationTime).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span style={{ marginLeft: 8 }}>
                    <strong>{m.authorName}: </strong>
                    {m.text}
                  </span>
                </div>
              ))}

              {[...game.world.conversations.values()].map((conv) => (
                <ConversationLog key={conv.id} conv={conv} worldId={worldId} onNewMessage={addPersistedMessage} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grass-decoration" />
    </div>
  );
}
