import { Stage } from '@pixi/react';
import { sound } from '@pixi/sound';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import { Viewport } from 'pixi-viewport';
import { useEffect, useRef, useState } from 'react';
import { useElementSize } from 'usehooks-ts';
import { api } from '../../convex/_generated/api';
import { Descriptions as PokedexDescriptions } from '../../data/characters';
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

  // NOTE: Automatic fit-to-world behavior (on fullscreen or mobile resize)
  // has been removed so users retain control of pan/zoom gestures.

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

  // Selected player's display name/character and profile image helper
  const selectedPlayerName = selectedPlayer ? game.playerDescriptions.get(selectedPlayer)?.name ?? selectedPlayer : undefined;
  const selectedPlayerCharacter = selectedPlayer ? game.playerDescriptions.get(selectedPlayer)?.character : undefined;
  const baseAssetUrl = (import.meta as any).env?.BASE_URL ?? '/';
  const getPfpUrl = (name?: string, ext = 'png') => {
    if (!name) return undefined;
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${baseAssetUrl}assets/pfps/${sanitized}.${ext}`;
  };

  return (
    <div className="world-root w-full h-screen" style={{ position: 'relative' }}>
      <div className="clouds">
        <div className="cloud cloud-1" />
        <div className="cloud cloud-2" />
        <div className="cloud cloud-3" />
      </div>

      {/* status bar removed: Route label and World HP were intentionally removed */}

      <div className="main-container max-w-[1400px] mx-auto flex flex-col md:flex-row gap-4 min-h-[calc(100vh-120px)]">
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
              <div className="stats-title">TRAINER</div>

              <div
                className="trainer-box"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 0,
                  padding: 4,
                  marginBottom: 0,
                  fontFamily: "'VT323', monospace",
                  boxSizing: 'border-box',
                  width: '100%',
                  maxHeight: 220,
                  overflow: 'auto',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Trainer: <span style={{ fontWeight: 400 }}>Ichigo</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#0f172a', marginTop: 4 }}>
                  <div>ID: 34721</div>
                  <div>Region: Kanto</div>
                </div>
                <div style={{ fontSize: 12, color: '#0f172a', marginTop: 6 }}>Class: Ace Trainer</div>
                <div style={{ fontSize: 12, color: '#0f172a' }}>Badges: 4/8</div>
                <div style={{ fontSize: 12, color: '#0f172a' }}>Pokedex: Seen 72 | Caught 45</div>
                <hr style={{ border: 'none', borderBottom: '2px dashed rgba(15,23,42,0.15)', margin: '8px 0' }} />

                <div style={{ fontWeight: 700, marginBottom: 6 }}>Active Team:</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <img src={`${(import.meta as any).env?.BASE_URL ?? '/'}assets/pfps/pikachu.png`} alt="Pikachu" style={{ width: 28, height: 28 }} />
                    <div style={{ fontSize: 12 }}>Pikachu Lv.32 ⚡</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <img src={`${(import.meta as any).env?.BASE_URL ?? '/'}assets/pfps/jigglypuff.png`} alt="Jigglypuff" style={{ width: 28, height: 28 }} />
                    <div style={{ fontSize: 12 }}>Jigglypuff Lv.12</div>
                  </div>
                </div>

                <div style={{ borderTop: '2px dashed rgba(15,23,42,0.08)', marginTop: 8, paddingTop: 6 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Stats:</div>
                  <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <div>Wins 54 | Losses 12 | Shiny 1</div>
                    <div>Favorite Type: Fire</div>
                  </div>
                </div>
              </div>

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
            <div
              className="game-screen"
              style={{ position: 'relative', width: '100%', height: '100%', touchAction: isMobile ? 'pan-x pan-y' : undefined }}
            >
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
                    isMobile={isMobile}
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
            <div className="stats-panel w-full md:w-auto" style={{ fontSize: '16px' }}>
              <div className="stats-title" style={{ fontSize: '12px', fontWeight: 700 }}>CREATURE STATS</div>
              {!selectedPlayer ? (
                <div style={{ padding: '12px 0', color: '#000', fontSize: 14 }}>
                  Click on a character to see stats
                </div>
              ) : (
                <div style={{ padding: '6px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: '18px' }}>{selectedPlayerName}</div>
                    <img
                      src={getPfpUrl(selectedPlayerName, 'png')}
                      alt={selectedPlayerName}
                      style={{ width: 40, height: 40, borderRadius: 999 }}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        const tried = img.dataset.tried ?? 'none';
                        if (tried === 'none') {
                          img.dataset.tried = 'png';
                          img.src = getPfpUrl(selectedPlayerName, 'jpg') ?? img.src;
                        } else if (tried === 'png') {
                          img.dataset.tried = 'jpg';
                          img.src = getPfpUrl(selectedPlayerName, 'webp') ?? img.src;
                        } else {
                          img.dataset.tried = 'fallback';
                          img.src = `${baseAssetUrl}assets/pfps/default.png`;
                        }
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 14, color: '#9ca3af', marginTop: 4 }}>
                    {selectedPlayerCharacter ?? ''}
                  </div>
                </div>
              )}
              {selectedPlayer && (() => {
                  const s = simStats[selectedPlayer] || { hp: 0, pp: 0, exp: 0 };
                  // Show numeric HP and derived battler power and generation.
                  const hp = Math.round(s.hp);
                  const battlerPower = Math.max(0, Math.round(hp * 1.5 + (s.pp ?? 0) * 1.2 + (s.exp ?? 0)));
                  // Deterministic generation based on selectedPlayer id
                  const generation = (() => {
                    let seed = 0;
                    for (let i = 0; i < selectedPlayer.length; i++) seed = (seed * 31 + selectedPlayer.charCodeAt(i)) & 0xffffffff;
                    return (Math.abs(seed) % 8) + 1; // Gen 1..8
                  })();

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>HP</span>
                        <span>{hp}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>Battler Power</span>
                        <span>{battlerPower}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>Generation</span>
                        <span>{`Gen ${generation}`}</span>
                      </div>
                    </div>
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

      {/* New Pokedex section below the dashboard */}
      <div className="pokedex-section max-w-[1400px] mx-auto p-6 lg:p-20">
        <div className="box w-full bg-white rounded-lg p-6 lg:p-20 shadow-lg">
          <h2 className="p-2 font-display text-xl tracking-wider text-left lowercase">pokedex</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {PokedexDescriptions.map((d, i) => {
              const id = `#${String(i + 1).padStart(4, '0')}`;
              const name = d.name;
              const base = (import.meta as any).env?.BASE_URL ?? '/';
              const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              const img = `${base}assets/pfps/${sanitized}.png`;

              const typeMap: Record<string, string[]> = {
                Kabuto: ['Rock', 'Water'],
                Mewtwo: ['Psychic'],
                Pikachu: ['Electric'],
                Eevee: ['Normal'],
                Jigglypuff: ['Fairy'],
              };

              const types = typeMap[name] ?? [];

              return (
                <div key={name} className="p-3 md:p-4 bg-white rounded-lg shadow-xl hover:shadow-2xl transition-shadow">
                  <div className="flex flex-col gap-2 md:gap-3">
                    <div className="bg-gray-100 rounded-lg p-3 md:p-4 flex justify-center items-center">
                      <img
                        src={img}
                        alt={name}
                        className="w-28 h-28 md:w-40 md:h-40 lg:w-48 lg:h-48 object-contain"
                      />
                    </div>
                    <div className="text-gray-400 text-xs md:text-sm">{id}</div>
                    <div className="font-bold text-lg md:text-2xl">{name}</div>
                    <div className="flex gap-2 flex-wrap">
                      {types.map((t) => (
                        <span key={t} className="bg-green-100 text-gray-800 px-2 py-1 rounded text-xs">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grass-decoration" />
    </div>
  );
}
