import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, Volume2, VolumeX, Loader2, Bell, BellOff } from 'lucide-react';

// Use globally injected alphaTab from CDN to bypass Vite WebWorker bundling issues
const alphaTab = (window as any).alphaTab;

interface AlphaTabPlayerProps {
  url: string;
}

export default function AlphaTabPlayer({ url }: AlphaTabPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);

  const togglePlay = () => {
    if (!apiRef.current) return;
    apiRef.current.playPause();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Ignore if user is typing in an input, textarea, or select
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }
      
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault(); // Prevent page scroll
        if (isReady) {
          togglePlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReady]);

  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current) return;

    const api = new alphaTab.AlphaTabApi(containerRef.current, {
      core: {
        scriptFile: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/alphaTab.js',
        fontDirectory: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/font/',
      },
      display: {
        staveProfile: alphaTab.StaveProfile.Default,
      },
      player: {
        enablePlayer: true,
        soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2',
        scrollElement: wrapperRef.current
      }
    });

    apiRef.current = api;
    let isCancelled = false;

    api.scoreLoaded.on((score: any) => {
      console.log("AlphaTab Score Loaded:", score);
      setIsReady(true);
    });

    api.renderFinished.on(() => {
      console.log("AlphaTab Render Finished!");
    });

    api.playerReady.on(() => {
      setIsReady(true);
    });

    api.playerStateChanged.on((args: any) => {
      setIsPlaying(args.state === 1); 
    });

    // Manually fetch the file to bypass AlphaTab's URL extension detection issues with Firebase ?alt=media
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buffer => {
        if (!isCancelled) {
          api.load(new Uint8Array(buffer));
        }
      })
      .catch(err => {
        console.error("Erro ao carregar partitura via fetch:", err);
      });

    return () => {
      isCancelled = true;
      try {
        api.destroy();
      } catch (e) {
        console.error(e);
      }
    };
  }, [url]);

  const stop = () => {
    if (!apiRef.current) return;
    apiRef.current.stop();
  };

  const toggleMute = () => {
    if (!apiRef.current) return;
    const newMute = !isMuted;
    setIsMuted(newMute);
    apiRef.current.masterVolume = newMute ? 0 : volume;
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (!isMuted && apiRef.current) {
      apiRef.current.masterVolume = val;
    }
  };

  const toggleMetronome = () => {
    if (!apiRef.current) return;
    const newState = !isMetronomeActive;
    setIsMetronomeActive(newState);
    apiRef.current.metronomeVolume = newState ? 1 : 0;
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-inner border border-zinc-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-4 p-4 bg-zinc-50 border-b border-zinc-200">
        <button 
          onClick={togglePlay}
          disabled={!isReady}
          className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center w-12 h-12 shadow-sm"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
        </button>
        <button 
          onClick={stop}
          disabled={!isReady}
          className="p-3 bg-white text-zinc-600 border border-zinc-200 rounded-xl hover:bg-zinc-50 hover:text-red-500 transition-colors disabled:opacity-50 flex items-center justify-center w-12 h-12"
        >
          <Square className="w-5 h-5 fill-current" />
        </button>
        
        <div className="h-8 w-px bg-zinc-200 mx-2"></div>
        
        <div className="flex items-center gap-3">
          <button onClick={toggleMute} className="text-zinc-400 hover:text-zinc-700 transition-colors" title={isMuted ? "Desmutar" : "Mutar"}>
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <input 
            type="range" 
            min="0" max="2" step="0.1" 
            value={volume} 
            onChange={handleVolume}
            className="w-24 accent-emerald-500"
          />
        </div>

        <div className="h-8 w-px bg-zinc-200 mx-2 hidden sm:block"></div>

        {/* Metronome Control */}
        <button 
          onClick={toggleMetronome}
          disabled={!isReady}
          title="Metrônomo da Partitura"
          className={`p-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 text-sm font-medium ${
            isMetronomeActive 
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
              : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
          }`}
        >
          {isMetronomeActive ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          <span className="hidden md:inline">Metrônomo</span>
        </button>

        <div className="h-8 w-px bg-zinc-200 mx-2 hidden sm:block"></div>

        {/* Speed Control */}
        <div className="flex items-center gap-2">
          <select 
            className="text-sm bg-white border border-zinc-200 text-zinc-700 rounded-lg px-2 py-1 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer font-medium"
            defaultValue="1"
            title="Velocidade de Reprodução"
            onChange={(e) => {
              if (apiRef.current) {
                apiRef.current.playbackSpeed = parseFloat(e.target.value);
              }
            }}
            disabled={!isReady}
          >
            <option value="0.25">0.25x</option>
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x Normal</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>

        {!isReady && (
          <div className="ml-auto text-xs font-bold text-emerald-600 flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-lg">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando Partitura...
          </div>
        )}
      </div>

      {/* Sheet Music Container */}
      <style>
        {`
          .at-cursor-bar {
            background: rgba(16, 185, 129, 0.15); /* emerald-500 */
          }
          .at-cursor-beat {
            background: rgba(16, 185, 129, 0.6);
            width: 3px;
          }
        `}
      </style>
      <div 
        ref={wrapperRef} 
        className="flex-1 overflow-auto bg-zinc-100 p-2 relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div ref={containerRef} className="alphaTab-container w-full min-h-[500px] relative">
        </div>
      </div>
    </div>
  );
}
