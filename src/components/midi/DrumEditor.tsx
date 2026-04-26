import { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { DRUM_INSTRUMENTS, DRUM_KITS, playDrumHit } from '../../audio/drumSynth';
import { startMetronome, stopMetronome } from '../../audio/metronome';
import { useMidiStore } from '../../store/midiStore';
import type { MidiTrack, MidiClip, DrumRow } from '../../store/midiStore';

interface Props {
  track: MidiTrack;
  clip: MidiClip;
  timeSig: string;
  onClose: () => void;
  onUpdateClip: (patch: Partial<MidiClip>) => void;
  onUpdateTrack: (patch: Partial<Pick<MidiTrack, 'name' | 'instrumentId' | 'muted'>>) => void;
}

function buildRows(instrumentIds: string[], stepCount: number): DrumRow[] {
  return instrumentIds.map(id => ({
    instrumentId: id,
    steps: Array.from({ length: stepCount }, () => ({ active: false, velocity: 0.8 })),
  }));
}

const DEFAULT_KIT = DRUM_KITS[0];

export default function DrumEditor({ track, clip, timeSig, onClose, onUpdateClip }: Props) {
  const { bpm, metronomeOn, setMetronome } = useMidiStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [stepCount, setStepCount] = useState(clip.stepCount ?? 16);
  const [lastVel, setLastVel] = useState<Record<string, number>>({});
  const [pickerRowIdx, setPickerRowIdx] = useState<number | null>(null);
  const [showKitPicker, setShowKitPicker] = useState(false);

  const dragRef = useRef<{
    pointerId: number; rowIdx: number; stepIdx: number;
    startY: number; startVel: number; didDrag: boolean; startTime: number;
  } | null>(null);

  const seqRef = useRef<Tone.Sequence | null>(null);

  // Initialize rows from clip or default kit
  const rows: DrumRow[] = clip.drumRows && clip.drumRows.length > 0
    ? clip.drumRows
    : buildRows(DEFAULT_KIT.rows, stepCount);

  // Ensure rows match current stepCount
  const normalizedRows = rows.map(row => {
    if (row.steps.length === stepCount) return row;
    return {
      ...row,
      steps: Array.from({ length: stepCount }, (_, i) =>
        row.steps[i] ?? { active: false, velocity: 0.8 }
      ),
    };
  });

  const stopSequencer = useCallback(() => {
    if (seqRef.current) {
      try { seqRef.current.stop(); seqRef.current.dispose(); } catch { /* ignore */ }
      seqRef.current = null;
    }
    if (metronomeOn) stopMetronome();
    Tone.Transport.stop();
    setIsPlaying(false);
  }, [metronomeOn]);

  const handlePlay = useCallback(async () => {
    await Tone.start();
    if (isPlaying) { stopSequencer(); return; }
    Tone.Transport.stop();
    Tone.Transport.position = '0';
    Tone.Transport.bpm.value = bpm;

    const steps = Array.from({ length: stepCount }, (_, i) => i);
    const seq = new Tone.Sequence(
      (time, stepIdx) => {
        normalizedRows.forEach(row => {
          const step = row.steps[stepIdx];
          if (step?.active) playDrumHit(row.instrumentId, time, step.velocity);
        });
      },
      steps,
      '16n',
    );
    seq.loop = true;
    seq.start(0);
    seqRef.current = seq;
    if (metronomeOn) startMetronome(bpm, parseInt(timeSig.split('/')[0]));
    Tone.Transport.start();
    setIsPlaying(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, bpm, stepCount, normalizedRows, metronomeOn, timeSig, stopSequencer]);

  useEffect(() => () => { stopSequencer(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStepCountChange = (n: number) => {
    setStepCount(n);
    onUpdateClip({
      stepCount: n,
      drumRows: normalizedRows.map(row => ({
        ...row,
        steps: Array.from({ length: n }, (_, i) => row.steps[i] ?? { active: false, velocity: 0.8 }),
      })),
    });
    if (isPlaying) stopSequencer();
  };

  const applyKit = (kitIdx: number) => {
    const kit = DRUM_KITS[kitIdx];
    // Keep existing step patterns — only change instrument assignments
    const newRows: DrumRow[] = kit.rows.map((instId, i) => ({
      instrumentId: instId,
      steps: normalizedRows[i]?.steps ?? Array.from({ length: stepCount }, () => ({ active: false, velocity: 0.8 })),
    }));
    onUpdateClip({ drumRows: newRows });
    setShowKitPicker(false);
  };

  const toggleStep = (rowIdx: number, stepIdx: number) => {
    const row = normalizedRows[rowIdx];
    const wasActive = row.steps[stepIdx].active;
    onUpdateClip({
      drumRows: normalizedRows.map((r, ri) =>
        ri !== rowIdx ? r : { ...r, steps: r.steps.map((s, si) => si !== stepIdx ? s : { ...s, active: !s.active }) }
      ),
    });
    if (!wasActive) playDrumHit(row.instrumentId, Tone.now(), 0.8);
  };

  const setStepVelocity = (rowIdx: number, stepIdx: number, velocity: number) => {
    const vel = Math.max(0.05, Math.min(1, velocity));
    const row = normalizedRows[rowIdx];
    onUpdateClip({
      drumRows: normalizedRows.map((r, ri) =>
        ri !== rowIdx ? r : { ...r, steps: r.steps.map((s, si) => si !== stepIdx ? s : { ...s, velocity: vel }) }
      ),
    });
    setLastVel(prev => ({ ...prev, [`${rowIdx}`]: vel }));
    void row;
  };

  const addRow = () => {
    onUpdateClip({
      drumRows: [...normalizedRows, {
        instrumentId: 'kick',
        steps: Array.from({ length: stepCount }, () => ({ active: false, velocity: 0.8 })),
      }],
    });
  };

  const removeRow = (rowIdx: number) => {
    if (normalizedRows.length <= 1) return;
    onUpdateClip({ drumRows: normalizedRows.filter((_, i) => i !== rowIdx) });
  };

  const changeRowInstrument = (rowIdx: number, instId: string) => {
    onUpdateClip({ drumRows: normalizedRows.map((r, i) => i !== rowIdx ? r : { ...r, instrumentId: instId }) });
    setPickerRowIdx(null);
    playDrumHit(instId, Tone.now(), 0.8);
  };

  const handleStepPointerDown = (e: React.PointerEvent<HTMLDivElement>, rowIdx: number, stepIdx: number) => {
    e.preventDefault(); e.stopPropagation();
    const step = normalizedRows[rowIdx].steps[stepIdx];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, rowIdx, stepIdx, startY: e.clientY, startVel: step?.velocity ?? 0.8, didDrag: false, startTime: Date.now() };
  };
  const handleStepPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 5) { d.didDrag = true; setStepVelocity(d.rowIdx, d.stepIdx, d.startVel + dy / 100); }
  };
  const handleStepPointerUp = (e: React.PointerEvent<HTMLDivElement>, rowIdx: number, stepIdx: number) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.didDrag && Date.now() - d.startTime < 250 && Math.abs(d.startY - e.clientY) < 8) toggleStep(rowIdx, stepIdx);
    dragRef.current = null;
  };

  const beatsPerBar = parseInt(timeSig.split('/')[0]);
  const groupSize = beatsPerBar <= 4 ? 4 : beatsPerBar;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: '#0d0d14', zIndex: 100, display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)', paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      onClick={() => { setPickerRowIdx(null); setShowKitPicker(false); }}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '6px 10px', background: '#080810', borderBottom: '1px solid #1e1e2e', flexShrink: 0, minHeight: 48,
      }}>
        <button onClick={onClose} style={btn}>← Back</button>
        <div style={sep} />

        <div style={{ borderLeft: `3px solid ${track.color}`, paddingLeft: 6 }}>
          <span style={{ color: '#e0e0f0', fontSize: 11, fontFamily: 'monospace' }}>{track.name}</span>
        </div>
        <div style={sep} />

        {/* Kit preset picker */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); setShowKitPicker(v => !v); setPickerRowIdx(null); }}
            style={{ ...btn, color: '#ffd54f', borderColor: 'rgba(255,213,79,0.4)', background: showKitPicker ? 'rgba(255,213,79,0.1)' : 'transparent' }}
          >Kit ▾</button>
          {showKitPicker && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', top: '100%', left: 0, zIndex: 300,
                background: '#12121e', border: '1px solid #2a2a3e', borderRadius: 8,
                padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                minWidth: 130, boxShadow: '0 6px 20px rgba(0,0,0,0.7)',
              }}
            >
              <div style={{ fontSize: 9, color: '#666', fontFamily: 'monospace', padding: '2px 6px' }}>
                Resets all steps
              </div>
              {DRUM_KITS.map((kit, i) => (
                <button key={kit.name} onClick={() => applyKit(i)}
                  style={{ background: 'transparent', border: 'none', borderRadius: 4,
                    padding: '7px 10px', cursor: 'pointer', textAlign: 'left',
                    color: '#e0e0f0', fontSize: 11, fontFamily: 'monospace',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,213,79,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >{kit.name}</button>
              ))}
            </div>
          )}
        </div>
        <div style={sep} />

        <button onClick={handlePlay}
          style={{ ...transportBtn, color: '#66bb6a', background: isPlaying ? 'rgba(102,187,106,0.18)' : 'transparent', boxShadow: isPlaying ? '0 0 10px rgba(102,187,106,0.3)' : 'none' }}
        >{isPlaying ? '■' : '▶'}</button>
        <button onClick={stopSequencer} style={{ ...transportBtn, color: '#4fc3f7' }}>⏹</button>
        <div style={sep} />

        <span style={{ color: '#aaa', fontSize: 11, fontFamily: 'monospace' }}>{bpm} BPM</span>
        <div style={sep} />

        <button onClick={() => setMetronome(!metronomeOn)}
          style={{ ...btn, color: metronomeOn ? '#4fc3f7' : '#666', background: metronomeOn ? 'rgba(79,195,247,0.1)' : 'transparent' }}
        >🔔</button>
        <div style={sep} />

        <span style={{ color: '#666', fontSize: 9, fontFamily: 'monospace' }}>Steps:</span>
        {([16, 32] as const).map(n => (
          <button key={n} onClick={() => handleStepCountChange(n)}
            style={{ ...btn, fontSize: 10, padding: '3px 8px',
              color: stepCount === n ? '#ffd54f' : '#888',
              border: `1px solid ${stepCount === n ? 'rgba(255,213,79,0.5)' : '#2a2a3e'}`,
              background: stepCount === n ? 'rgba(255,213,79,0.1)' : 'transparent',
            }}
          >{n}</button>
        ))}
      </div>

      {/* Drum grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px 16px' }}>
        {normalizedRows.map((row, rowIdx) => {
          const inst = DRUM_INSTRUMENTS.find(d => d.id === row.instrumentId) ?? DRUM_INSTRUMENTS[0];
          const isPickerOpen = pickerRowIdx === rowIdx;

          return (
            <div key={rowIdx} style={{ display: 'flex', alignItems: 'center', height: 40, marginBottom: 4, position: 'relative' }}>
              {/* Instrument label / picker trigger */}
              <div style={{ width: 74, flexShrink: 0, paddingRight: 5, position: 'relative' }}>
                <button
                  onClick={e => { e.stopPropagation(); setPickerRowIdx(isPickerOpen ? null : rowIdx); setShowKitPicker(false); }}
                  style={{
                    width: '100%', background: isPickerOpen ? 'rgba(255,255,255,0.07)' : 'transparent',
                    border: `1px solid ${isPickerOpen ? inst.color + '99' : '#252535'}`,
                    borderRadius: 4, padding: '4px 5px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold', color: inst.color }}>{inst.name}</span>
                  <span style={{ fontSize: 8, color: '#444' }}>▾</span>
                </button>
                {lastVel[`${rowIdx}`] !== undefined && (
                  <div style={{ position: 'absolute', bottom: -10, right: 5, fontSize: 7, fontFamily: 'monospace', color: '#555' }}>
                    {Math.round(lastVel[`${rowIdx}`] * 100)}%
                  </div>
                )}

                {/* Instrument dropdown */}
                {isPickerOpen && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200,
                      background: '#12121e', border: '1px solid #2a2a3e', borderRadius: 6,
                      padding: 4, display: 'flex', flexDirection: 'column', gap: 1,
                      minWidth: 115, maxHeight: 280, overflowY: 'auto',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
                    }}
                  >
                    {DRUM_INSTRUMENTS.map(d => (
                      <button key={d.id} onClick={() => changeRowInstrument(rowIdx, d.id)}
                        style={{
                          background: d.id === row.instrumentId ? `${d.color}22` : 'transparent',
                          border: `1px solid ${d.id === row.instrumentId ? d.color + '77' : 'transparent'}`,
                          borderRadius: 4, padding: '5px 8px', cursor: 'pointer',
                          textAlign: 'left', color: d.color, fontSize: 10,
                          fontFamily: 'monospace', fontWeight: 'bold',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >{d.name}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Step buttons */}
              <div style={{ flex: 1, display: 'flex', gap: 2 }}>
                {row.steps.map((step, stepIdx) => {
                  const isGroupStart = stepIdx % groupSize === 0;
                  return (
                    <div key={stepIdx}
                      onPointerDown={e => handleStepPointerDown(e, rowIdx, stepIdx)}
                      onPointerMove={handleStepPointerMove}
                      onPointerUp={e => handleStepPointerUp(e, rowIdx, stepIdx)}
                      onPointerCancel={e => { if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null; }}
                      style={{
                        flex: 1, minWidth: 20, height: 36, borderRadius: 4,
                        cursor: 'pointer', position: 'relative', overflow: 'hidden', touchAction: 'none',
                        background: step.active ? inst.color + 'cc' : (isGroupStart ? '#1a1a28' : '#141420'),
                        border: `1px solid ${step.active ? inst.color : (isGroupStart ? '#252540' : '#1a1a2e')}`,
                        boxShadow: step.active ? `0 0 7px ${inst.color}77` : 'none',
                        transition: 'background 0.05s, box-shadow 0.05s',
                      }}
                    >
                      {step.active && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                          height: `${step.velocity * 100}%`, background: 'rgba(255,255,255,0.22)',
                          borderRadius: '0 0 3px 3px', pointerEvents: 'none',
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Remove row */}
              <button onClick={() => removeRow(rowIdx)}
                style={{ marginLeft: 4, width: 20, height: 20, flexShrink: 0,
                  background: 'transparent', border: '1px solid #222230', borderRadius: 3,
                  color: '#444', fontSize: 12, cursor: 'pointer', lineHeight: 1,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >×</button>
            </div>
          );
        })}

        {/* Add row */}
        <button onClick={addRow}
          style={{ marginTop: 8, background: 'transparent', border: '1px dashed #252535',
            borderRadius: 6, color: '#666', fontSize: 11, fontFamily: 'monospace',
            padding: '6px 18px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >+ Add row</button>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: 'transparent', color: '#d0d0e8',
  border: '1px solid #2a2a3e', borderRadius: 6,
  padding: '5px 10px', fontSize: 11, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', flexShrink: 0,
};
const transportBtn: React.CSSProperties = {
  border: '1px solid #2a2a3e', borderRadius: 6,
  padding: '6px 14px', fontSize: 14, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', flexShrink: 0, fontWeight: 'bold',
};
const sep: React.CSSProperties = { width: 1, height: 22, background: '#1e1e2e', flexShrink: 0 };
