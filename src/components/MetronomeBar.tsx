import { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { startMetronome, stopMetronome, setMetronomeBpm } from '../audio/metronome';
import { useMidiStore } from '../store/midiStore';

const TIME_SIGS = ['3/4','4/4','5/4','6/8','10/8','7/12'] as const;

function useCurrentBeat(playing: boolean, beats: number) {
  const [beat, setBeat] = useState(-1);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!playing) { setBeat(-1); return; }
    const tick = () => {
      const pos = Tone.Transport.position as string;
      setBeat(parseInt(pos.split(':')[1] ?? '0') % beats);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current !== undefined) cancelAnimationFrame(raf.current); };
  }, [playing, beats]);
  return beat;
}

export function MetronomeBar() {
  // BPM and time sig are shared via the MIDI store so both pages stay in sync
  const { bpm, timeSig, setBpm, setTimeSig } = useMidiStore();
  const [playing, setPlaying] = useState(false);
  const beats = parseInt(timeSig.split('/')[0]);
  const beat  = useCurrentBeat(playing, beats);

  const toggle = () => {
    if (playing) { stopMetronome(); setPlaying(false); }
    else { startMetronome(bpm, beats); setPlaying(true); }
  };

  const changeBpm = (v: number) => {
    const c = Math.max(20, Math.min(300, v));
    setBpm(c);
    setMetronomeBpm(c);
  };

  const changeSig = (s: string) => {
    setTimeSig(s);
    if (playing) { stopMetronome(); startMetronome(bpm, parseInt(s.split('/')[0])); }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 12px', background: '#0a0a12',
      borderBottom: '1px solid #161622',
      minHeight: 34,
    }}>
      {/* Play/stop */}
      <button onClick={toggle} style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: playing ? '#c62828' : '#2e7d32', border: 'none',
        color: '#fff', fontSize: 10, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
      }}>
        {playing ? '■' : '▶'}
      </button>

      {/* BPM */}
      <button onClick={() => changeBpm(bpm - 1)} style={micro}>−</button>
      <input
        type="number" value={bpm} min={20} max={300}
        onChange={e => changeBpm(parseInt(e.target.value) || bpm)}
        style={{
          width: 44, textAlign: 'center', background: '#12121e',
          border: '1px solid #222', borderRadius: 4,
          color: '#b0b0d0', fontSize: 13, fontFamily: 'monospace', padding: '2px 2px',
        }}
      />
      <button onClick={() => changeBpm(bpm + 1)} style={micro}>+</button>
      <span style={{ color: '#333', fontSize: 9, fontFamily: 'monospace' }}>BPM</span>

      <div style={{ width: 1, height: 18, background: '#1e1e2e', flexShrink: 0 }} />

      {/* Time sig */}
      {TIME_SIGS.map(s => (
        <button key={s} onClick={() => changeSig(s)} style={{
          ...micro,
          background: s === timeSig ? 'rgba(79,195,247,0.12)' : 'transparent',
          border: `1px solid ${s === timeSig ? '#4fc3f7' : '#1e1e2e'}`,
          color: s === timeSig ? '#4fc3f7' : '#444',
          fontSize: 10, padding: '2px 6px',
        }}>{s}</button>
      ))}

      <div style={{ width: 1, height: 18, background: '#1e1e2e', flexShrink: 0 }} />

      {/* Beat dots */}
      {Array.from({ length: beats }, (_, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: beat === i ? (i === 0 ? '#ef5350' : '#4fc3f7') : '#1a1a2a',
          transition: 'background 0.05s',
        }} />
      ))}
    </div>
  );
}

const micro: React.CSSProperties = {
  background: 'transparent', color: '#666',
  border: '1px solid #1e1e2e', borderRadius: 4,
  padding: '2px 7px', fontSize: 12, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};
