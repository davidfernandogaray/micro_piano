import { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { releaseAll } from '../audio/engine';

interface AudioContextValue {
  isReady: boolean;
}

const AudioCtx = createContext<AudioContextValue>({ isReady: false });
export function useAudio() { return useContext(AudioCtx); }

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const unlocked = useRef(false);

  useEffect(() => {
    const unlock = () => {
      if (unlocked.current) return;
      unlocked.current = true;
      setIsReady(true);
      Tone.start().catch(console.error);
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Safety net: release all notes when the page is hidden or the window loses
  // focus (e.g. switching apps, notification shade). Without this, pointerup
  // events are never delivered and notes stay stuck forever.
  useEffect(() => {
    const onHide = () => releaseAll();
    const onVisibility = () => { if (document.hidden) releaseAll(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onHide);
    };
  }, []);

  return (
    <AudioCtx.Provider value={{ isReady }}>
      {children}
      {!isReady && (
        <div
          style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(13,13,20,0.92)', border: '1px solid #4fc3f7',
            color: '#4fc3f7', padding: '10px 22px', borderRadius: 24,
            fontSize: 13, fontFamily: 'monospace', zIndex: 100,
            pointerEvents: 'none', letterSpacing: 0.5, whiteSpace: 'nowrap',
            boxShadow: '0 0 16px rgba(79,195,247,0.3)',
          }}
        >
          Tap a key to start audio
        </div>
      )}
    </AudioCtx.Provider>
  );
}
