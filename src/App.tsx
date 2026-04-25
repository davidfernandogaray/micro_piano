import { useEffect, useState } from 'react';
import { AudioProvider } from './components/AudioProvider';
import { KeyboardContainer } from './components/keyboard/KeyboardContainer';
import { InstrumentSelector } from './components/InstrumentSelector';
import { MetronomeBar } from './components/MetronomeBar';
import MidiPage from './pages/MidiPage';

function useIsPortrait() {
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  useEffect(() => {
    const update = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return portrait;
}

export default function App() {
  const isPortrait = useIsPortrait();
  const [page, setPage] = useState<'piano' | 'midi'>('piano');

  // Try to lock orientation on Android (ignored on iOS)
  useEffect(() => {
    if (screen.orientation?.lock) {
      screen.orientation.lock('landscape').catch(() => {});
    }
  }, []);

  if (isPortrait) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0d0d14', gap: 16,
      }}>
        <span style={{ fontSize: 48 }}>↺</span>
        <span style={{ color: '#c0c0e0', fontSize: 16, fontFamily: 'system-ui', textAlign: 'center' }}>
          Please rotate your device
        </span>
        <span style={{ color: '#4a4a6a', fontSize: 12, fontFamily: 'monospace' }}>
          MicoPiano works in landscape
        </span>
      </div>
    );
  }

  if (page === 'midi') {
    return (
      <AudioProvider>
        <MidiPage onBack={() => setPage('piano')} />
      </AudioProvider>
    );
  }

  return (
    <AudioProvider>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0d0d14',
        overflow: 'hidden',
      }}>
        {/* Compact header row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px', borderBottom: '1px solid #161622',
          flexShrink: 0, minHeight: 30,
        }}>
          <span style={{
            fontSize: 22, color: '#e8c040',
            fontFamily: "'Pinyon Script', 'Palatino Linotype', cursive",
            letterSpacing: 0.5, lineHeight: 1,
          }}>MicroPiano</span>
          <span style={{
            fontSize: 9, color: '#4fc3f7',
            background: 'rgba(79,195,247,0.1)', border: '1px solid rgba(79,195,247,0.25)',
            borderRadius: 8, padding: '1px 6px', fontFamily: 'monospace',
          }}>24-TET</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setPage('midi')} style={{
            background: 'rgba(144,80,224,0.15)', color: '#b388ff',
            border: '1px solid rgba(144,80,224,0.4)', borderRadius: 6,
            padding: '2px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'monospace',
            WebkitTapHighlightColor: 'transparent',
          }}>MIDI ▶</button>
        </div>

        {/* Metronome — compact */}
        <div style={{ flexShrink: 0 }}>
          <MetronomeBar />
        </div>

        {/* Instrument selector — compact */}
        <div style={{ flexShrink: 0 }}>
          <InstrumentSelector />
        </div>

        {/* Keyboard fills remaining space */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <KeyboardContainer />
        </div>
      </div>
    </AudioProvider>
  );
}
