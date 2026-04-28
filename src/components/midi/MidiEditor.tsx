import { useRef, useState, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { KeyboardContainer } from '../keyboard/KeyboardContainer';
import { INSTRUMENTS } from '../../audio/instruments';
import { startRecording, stopRecording } from '../../audio/midiRecorder';
import { startClipPlayback, stopClipPlayback, getTransportTick } from '../../audio/midiPlayer';
import { startMetronome, stopMetronome } from '../../audio/metronome';
import { getTicksPerBar, TICKS_PER_BEAT, useMidiStore } from '../../store/midiStore';
import type { MidiClip, MidiNote, MidiTrack } from '../../store/midiStore';

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Constants ────────────────────────────────────────────────────────────────
const BASE_ROW_H      = 10;
const MIN_OCTAVE      = 1;
const MAX_OCTAVE      = 7;
const STEPS_PER_OCT   = 24;
const NUM_ROWS        = (MAX_OCTAVE - MIN_OCTAVE + 1) * STEPS_PER_OCT; // 168
const KEYS_W          = 40;
const TOP_NOTE_IDX    = MAX_OCTAVE * STEPS_PER_OCT + 23; // B7½ = 191
const RESIZE_HANDLE   = 18;

const WHITE_EVEN = new Set([0,4,8,10,14,18,22]);
const SEMITONE_LABEL = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function stepVariant(step: number): 'white' | 'black' | 'gray' {
  if (step % 2 === 1) return 'gray';
  return WHITE_EVEN.has(step) ? 'white' : 'black';
}

function getNoteLabel(noteIndex: number): string {
  const octave = Math.floor(noteIndex / STEPS_PER_OCT);
  const step   = noteIndex % STEPS_PER_OCT;
  const semi   = Math.floor(step / 2);
  const isGray = step % 2 === 1;
  return `${SEMITONE_LABEL[semi]}${isGray ? '½' : ''}${octave}`;
}

const ROW_BG: Record<string, string> = { white: '#24243a', black: '#18181f', gray: '#1c2235' };
const ROW_BG_C = '#2a2a42';

const NOTE_LENGTHS = [
  { label: '1/1',  ticks: TICKS_PER_BEAT * 4  },
  { label: '1/2',  ticks: TICKS_PER_BEAT * 2  },
  { label: '1/4',  ticks: TICKS_PER_BEAT      },
  { label: '1/8',  ticks: Math.round(TICKS_PER_BEAT / 2)  },
  { label: '1/16', ticks: Math.round(TICKS_PER_BEAT / 4)  },
  { label: '1/32', ticks: Math.round(TICKS_PER_BEAT / 8)  },
];

function rowY(noteIndex: number, rowH: number): number { return (TOP_NOTE_IDX - noteIndex) * rowH; }
function noteIndexFromY(y: number, rowH: number): number { return TOP_NOTE_IDX - Math.floor(y / rowH); }
function snapTick(tick: number, snap: number): number { return Math.round(tick / snap) * snap; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

function hitTestNote(notes: MidiNote[], x: number, y: number, pxPerTick: number, rowH: number): { note: MidiNote; isResize: boolean } | null {
  const ni = noteIndexFromY(y, rowH);
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.noteIndex !== ni) continue;
    const nx = n.startTick * pxPerTick;
    const nw = Math.max(RESIZE_HANDLE + 2, n.durationTicks * pxPerTick);
    if (x >= nx && x < nx + nw) return { note: n, isResize: x >= nx + nw - RESIZE_HANDLE };
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  track: MidiTrack; clip: MidiClip; timeSig: string;
  onClose: () => void;
  onUpdateClip: (patch: Partial<MidiClip>) => void;
  onUpdateTrack: (patch: Partial<Pick<MidiTrack, 'name'|'instrumentId'|'muted'>>) => void;
}

export default function MidiEditor({ track, clip, timeSig, onClose, onUpdateClip, onUpdateTrack }: Props) {
  const { bpm, metronomeOn, setMetronome } = useMidiStore();
  const ticksPerBar = getTicksPerBar(timeSig);
  const [zoom, setZoom]         = useState(1);
  const [rowZoom, setRowZoom]   = useState(1);
  const [noteLen, setNoteLen]   = useState(TICKS_PER_BEAT);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [isRec, setIsRec]           = useState(false);
  const [playheadTick, setPlayheadTick] = useState(0);
  const [countIn, setCountIn]       = useState(false);
  const [countdown, setCountdown]   = useState<number | null>(null);
  const [showKeys, setShowKeys] = useState(true);
  const [cursor, setCursor]     = useState<'crosshair' | 'move' | 'col-resize'>('crosshair');

  const rowH = Math.round(BASE_ROW_H * rowZoom);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draftNote, setDraftNote]           = useState<MidiNote | null>(null);

  const dragRef = useRef<{
    pointerId: number; mode: 'move' | 'resize'; noteId: string;
    startClientX: number; startClientY: number; origNote: MidiNote;
  } | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal]         = useState(track.name);
  const commitName = () => { onUpdateTrack({ name: nameVal.trim() || track.name }); setEditingName(false); };

  const recordingNotesRef = useRef<MidiNote[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);
  const rafRef  = useRef<number | undefined>(undefined);

  const pxPerTick     = (200 * zoom) / ticksPerBar;
  const beatsPerBar   = parseInt(timeSig.split('/')[0]);
  const totalWidthPx  = Math.max(clip.lengthBars * ticksPerBar * pxPerTick + 300, 800);
  const totalHeightPx = NUM_ROWS * rowH;

  const onGridScroll = useCallback(() => {
    if (keysRef.current && gridRef.current) keysRef.current.scrollTop = gridRef.current.scrollTop;
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => { setPlayheadTick(getTransportTick()); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying]);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = Math.max(0, rowY(4 * STEPS_PER_OCT, rowH) - 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getGridXY = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + (gridRef.current?.scrollLeft ?? 0),
      y: e.clientY - rect.top  + (gridRef.current?.scrollTop  ?? 0),
    };
  }, []);

  // ── Transport ───────────────────────────────────────────────────────────
  const handlePlay = async () => {
    await Tone.start();
    if (isPlaying) {
      stopClipPlayback();
      if (metronomeOn) stopMetronome();
      setIsPlaying(false);
    } else {
      startClipPlayback(clip.notes, track.instrumentId, ticksPerBar, clip.lengthBars);
      if (metronomeOn) startMetronome(bpm, parseInt(timeSig.split('/')[0]));
      setIsPlaying(true);
    }
  };

  const flushRecording = () => {
    const leftover = stopRecording();
    const allNew = [...recordingNotesRef.current, ...leftover];
    recordingNotesRef.current = [];
    if (allNew.length) onUpdateClip({ notes: [...clip.notes, ...allNew] });
  };

  const handleStop = () => {
    stopClipPlayback();
    if (metronomeOn) stopMetronome();
    if (isRec) { flushRecording(); setIsRec(false); }
    setIsPlaying(false); setPlayheadTick(0);
    Tone.Transport.stop();
    Tone.Transport.position = 0 as unknown as string;
  };

  const startActualRecording = () => {
    stopClipPlayback();
    stopMetronome();
    Tone.Transport.stop();
    Tone.Transport.position = 0 as unknown as string;
    recordingNotesRef.current = [];
    startClipPlayback(clip.notes, track.instrumentId, ticksPerBar, clip.lengthBars);
    if (metronomeOn) startMetronome(bpm, parseInt(timeSig.split('/')[0]));
    startRecording((note) => {
      recordingNotesRef.current = [...recordingNotesRef.current, note];
    });
    setIsRec(true); setIsPlaying(true); setCountdown(null);
  };

  const handleRecord = async () => {
    await Tone.start();
    if (isRec) {
      flushRecording();
      if (metronomeOn) stopMetronome();
      setIsRec(false);
    } else if (countIn) {
      // Count-in: play 4 metronome beats, then start recording
      stopClipPlayback();
      stopMetronome();
      Tone.Transport.stop();
      Tone.Transport.position = 0 as unknown as string;
      const beatsPerBar = parseInt(timeSig.split('/')[0]);
      const msBeat = 60000 / bpm;
      startMetronome(bpm, beatsPerBar);
      setCountdown(4);
      [3, 2, 1].forEach((n, i) => {
        setTimeout(() => setCountdown(n), msBeat * (i + 1));
      });
      setTimeout(() => {
        startActualRecording();
      }, msBeat * 4);
    } else {
      startActualRecording();
    }
  };

  // ── Note pointer handlers ───────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const { x, y } = getGridXY(e);
    const hit = hitTestNote(clip.notes, x, y, pxPerTick, rowH);

    if (hit) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setSelectedNoteId(hit.note.id);
      setDraftNote({ ...hit.note });
      dragRef.current = {
        pointerId: e.pointerId,
        mode: hit.isResize ? 'resize' : 'move',
        noteId: hit.note.id,
        startClientX: e.clientX, startClientY: e.clientY,
        origNote: { ...hit.note },
      };
    } else {
      setSelectedNoteId(null); setDraftNote(null);
      const ni = noteIndexFromY(y, rowH);
      if (ni < MIN_OCTAVE * STEPS_PER_OCT || ni > TOP_NOTE_IDX) return;
      const rawTick   = x / pxPerTick;
      const startTick = snapTick(rawTick, noteLen);
      const exists = clip.notes.find(n =>
        n.noteIndex === ni && startTick >= n.startTick && startTick < n.startTick + n.durationTicks
      );
      if (exists) return;
      const newNote: MidiNote = { id: uid(), noteIndex: ni, startTick, durationTicks: noteLen, velocity: 0.8 };
      const newLen = Math.ceil((startTick + noteLen) / ticksPerBar);
      onUpdateClip({ notes: [...clip.notes, newNote], lengthBars: Math.max(clip.lengthBars, newLen) });
    }
  }, [clip.notes, clip.lengthBars, pxPerTick, noteLen, ticksPerBar, rowH, getGridXY, onUpdateClip]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      const { x, y } = getGridXY(e);
      const hit = hitTestNote(clip.notes, x, y, pxPerTick, rowH);
      setCursor(hit?.isResize ? 'col-resize' : hit ? 'move' : 'crosshair');
      return;
    }

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    if (drag.mode === 'move') {
      const dticks   = snapTick(dx / pxPerTick, noteLen);
      const drows    = Math.round(dy / rowH);
      const newStart = Math.max(0, drag.origNote.startTick + dticks);
      const newNI    = clamp(drag.origNote.noteIndex - drows, MIN_OCTAVE * STEPS_PER_OCT, TOP_NOTE_IDX);
      setDraftNote({ ...drag.origNote, startTick: newStart, noteIndex: newNI });
    } else {
      const dticks  = snapTick(dx / pxPerTick, noteLen);
      const newDur  = Math.max(noteLen, drag.origNote.durationTicks + dticks);
      setDraftNote({ ...drag.origNote, durationTicks: newDur });
    }
  }, [clip.notes, pxPerTick, noteLen, rowH, getGridXY]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (draftNote) {
      const newNotes = clip.notes.map(n => n.id === drag.noteId ? draftNote : n);
      const maxTick  = newNotes.reduce((m, n) => Math.max(m, n.startTick + n.durationTicks), 0);
      const newLen   = Math.ceil(maxTick / ticksPerBar);
      onUpdateClip({ notes: newNotes, lengthBars: Math.max(clip.lengthBars, newLen) });
    }

    dragRef.current = null; setDraftNote(null);
  }, [clip.notes, clip.lengthBars, draftNote, ticksPerBar, onUpdateClip]);

  // ── Note delete / velocity ──────────────────────────────────────────────
  const selectedNote = draftNote?.id === selectedNoteId
    ? draftNote
    : clip.notes.find(n => n.id === selectedNoteId) ?? null;

  const deleteSelected = () => {
    if (!selectedNoteId) return;
    onUpdateClip({ notes: clip.notes.filter(n => n.id !== selectedNoteId) });
    setSelectedNoteId(null); setDraftNote(null);
  };

  const updateVelocity = (vel: number) => {
    if (!selectedNoteId) return;
    onUpdateClip({ notes: clip.notes.map(n => n.id === selectedNoteId ? { ...n, velocity: vel } : n) });
  };

  const clearAll = () => { if (confirm('Clear all notes in this sample?')) { onUpdateClip({ notes: [] }); setSelectedNoteId(null); } };

  const notesToRender = clip.notes.map(n => n.id === draftNote?.id ? draftNote : n);
  const playheadPx    = playheadTick * pxPerTick;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#13131a', zIndex: 100,
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '6px 12px', background: '#0d0d14',
        borderBottom: '1px solid #1e1e2e', flexShrink: 0, minHeight: 48,
      }}>
        <button onClick={onClose} style={btn}>← Back</button>
        <div style={sep} />

        {/* Transport — always colored */}
        <button onClick={handlePlay} style={{ ...transportBtn, color: '#66bb6a', background: isPlaying && !isRec ? 'rgba(102,187,106,0.18)' : 'transparent', boxShadow: isPlaying && !isRec ? '0 0 10px rgba(102,187,106,0.3)' : 'none' }}>
          {isPlaying && !isRec ? '■' : '▶'}
        </button>
        <button onClick={handleStop} style={{ ...transportBtn, color: '#4fc3f7' }}>⏹</button>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <button onClick={handleRecord} style={{ ...transportBtn, color: '#fff', background: isRec ? '#ff1744' : '#c62828', border: '1px solid #b71c1c', boxShadow: isRec ? '0 0 12px rgba(255,23,68,0.6)' : 'none' }}>⏺</button>
          {countdown !== null && (
            <span style={{
              position: 'absolute', left: '100%', marginLeft: 6,
              fontSize: 20, fontWeight: 'bold', color: '#ef5350',
              fontFamily: 'monospace', minWidth: 20, textAlign: 'center',
              animation: 'pulse 0.4s ease-in-out',
            }}>{countdown}</span>
          )}
        </div>
        <button onClick={() => setMetronome(!metronomeOn)} style={{ ...btn, color: metronomeOn ? '#4fc3f7' : '#aaa', background: metronomeOn ? 'rgba(79,195,247,0.1)' : 'transparent' }}>🔔</button>
        <button onClick={() => setCountIn(v => !v)} style={{ ...btn, fontSize: 9, padding: '3px 7px', color: countIn ? '#ffd54f' : '#aaa', background: countIn ? 'rgba(255,213,79,0.15)' : 'transparent', border: `1px solid ${countIn ? 'rgba(255,213,79,0.5)' : '#2a2a3e'}` }}>Count</button>
        <div style={sep} />

        {/* Track name */}
        <div style={{ borderLeft: `3px solid ${track.color}`, paddingLeft: 6 }}>
          {editingName ? (
            <input value={nameVal} onChange={e => setNameVal(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
              autoFocus
              style={{ background: '#1a1a28', border: '1px solid #4fc3f7', borderRadius: 3, color: '#e0e0f0', fontSize: 11, fontFamily: 'monospace', padding: '1px 4px', outline: 'none', width: 120 }}
            />
          ) : (
            <span onClick={() => { setNameVal(track.name); setEditingName(true); }} title="Click to rename"
              style={{ color: '#e0e0f0', fontSize: 11, fontFamily: 'monospace', cursor: 'text' }}>{track.name}</span>
          )}
        </div>
        <select value={track.instrumentId} onChange={e => onUpdateTrack({ instrumentId: e.target.value })}
          style={{ background: '#12121e', border: '1px solid #333', borderRadius: 4, color: '#ccc', fontSize: 10, padding: '3px 5px' }}
        >
          {INSTRUMENTS.map(i => <option key={i.id} value={i.id} style={{ background: '#1a1a26' }}>{i.name}</option>)}
        </select>
        <div style={sep} />

        {/* Note snap length */}
        <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace' }}>Snap:</span>
        {NOTE_LENGTHS.map(l => (
          <button key={l.label} onClick={() => setNoteLen(l.ticks)}
            style={{ ...btn, fontSize: 9, padding: '3px 6px',
              color: noteLen === l.ticks ? '#4fc3f7' : '#bbb',
              border: `1px solid ${noteLen === l.ticks ? '#4fc3f7' : '#2a2a3e'}`,
              background: noteLen === l.ticks ? 'rgba(79,195,247,0.1)' : 'transparent',
            }}
            title={l.label === '1/1' ? 'whole note' : l.label === '1/2' ? 'half note' : l.label === '1/4' ? 'quarter note' : l.label === '1/8' ? 'eighth note' : l.label === '1/16' ? 'sixteenth' : 'thirty-second'}
          >{l.label}</button>
        ))}
        <div style={sep} />

        {/* Horizontal zoom */}
        <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace' }}>H:</span>
        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.3))} style={btn}>−</button>
        <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace', minWidth: 30, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(8, z + 0.3))} style={btn}>+</button>

        {/* Vertical zoom */}
        <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace' }}>V:</span>
        <button onClick={() => setRowZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} style={btn}>−</button>
        <button onClick={() => setRowZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))} style={btn}>+</button>
        <div style={sep} />

        <button onClick={clearAll} style={{ ...btn, color: '#ef9a9a' }}>⌫ Clear</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowKeys(s => !s)} style={{ ...btn, color: '#aaa' }}>
          {showKeys ? '⌨ Hide' : '⌨ Show'}
        </button>
      </div>

      {/* ── Selected note info ─────────────────────────────────────────── */}
      {selectedNote && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '4px 12px', background: '#0a0a12',
          borderBottom: '1px solid #1e1e2e', flexShrink: 0,
        }}>
          <span style={{ color: track.color, fontSize: 11, fontFamily: 'monospace', minWidth: 40 }}>
            {getNoteLabel(selectedNote.noteIndex)}
          </span>
          <span style={{ color: '#aaa', fontSize: 10, fontFamily: 'monospace' }}>Vel</span>
          <input type="range" min={0} max={100} step={1}
            value={Math.round(selectedNote.velocity * 100)}
            onChange={e => updateVelocity(parseInt(e.target.value) / 100)}
            style={{ width: 100, accentColor: track.color }}
          />
          <span style={{ color: '#ccc', fontSize: 10, fontFamily: 'monospace', minWidth: 30 }}>
            {Math.round(selectedNote.velocity * 100)}%
          </span>
          <span style={{ color: '#aaa', fontSize: 10, fontFamily: 'monospace' }}>Dur</span>
          <button onClick={() => {
            const idx = NOTE_LENGTHS.findIndex(l => l.ticks <= selectedNote.durationTicks);
            const ni = Math.min(NOTE_LENGTHS.length - 1, Math.max(0, idx) + 1);
            onUpdateClip({ notes: clip.notes.map(n => n.id === selectedNoteId ? { ...n, durationTicks: NOTE_LENGTHS[ni].ticks } : n) });
          }} style={{ ...btn, padding: '2px 8px' }}>−</button>
          <select
            value={NOTE_LENGTHS.reduce((best, l) => Math.abs(l.ticks - selectedNote.durationTicks) < Math.abs(best.ticks - selectedNote.durationTicks) ? l : best, NOTE_LENGTHS[2]).ticks}
            onChange={e => onUpdateClip({ notes: clip.notes.map(n => n.id === selectedNoteId ? { ...n, durationTicks: parseInt(e.target.value) } : n) })}
            style={{ background: '#12121e', border: '1px solid #333', borderRadius: 4, color: '#e0e0f0', fontSize: 10, padding: '2px 4px' }}
          >
            {NOTE_LENGTHS.map(l => <option key={l.label} value={l.ticks} style={{ background: '#1a1a26' }}>{l.label}</option>)}
          </select>
          <button onClick={() => {
            const idx = NOTE_LENGTHS.findIndex(l => l.ticks >= selectedNote.durationTicks);
            const ni = Math.max(0, Math.min(NOTE_LENGTHS.length - 1, idx) - 1);
            onUpdateClip({ notes: clip.notes.map(n => n.id === selectedNoteId ? { ...n, durationTicks: NOTE_LENGTHS[ni].ticks } : n) });
          }} style={{ ...btn, padding: '2px 8px' }}>+</button>
          <button onClick={deleteSelected} style={{ ...btn, color: '#ef5350', marginLeft: 4 }}>✕ Del</button>
        </div>
      )}

      {/* ── Piano roll ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Key labels */}
        <div ref={keysRef} style={{ width: KEYS_W, flexShrink: 0, overflow: 'hidden', background: '#0f0f18', borderRight: '1px solid #1e1e2e' }}>
          <div style={{ height: totalHeightPx, position: 'relative' }}>
            {Array.from({ length: NUM_ROWS }, (_, rowIdx) => {
              const ni      = TOP_NOTE_IDX - rowIdx;
              const step    = ni % STEPS_PER_OCT;
              const octave  = Math.floor(ni / STEPS_PER_OCT);
              const variant = stepVariant(step);
              const isC     = step === 0;
              const bg      = isC ? '#2a2a42' : variant === 'white' ? '#1e1e2e' : variant === 'black' ? '#111118' : '#1a1e30';
              return (
                <div key={rowIdx} style={{
                  position: 'absolute', top: rowIdx * rowH, left: 0, right: 0, height: rowH,
                  background: bg,
                  borderBottom: isC ? '1px solid #333' : '1px solid #181820',
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 3,
                }}>
                  {isC && <span style={{ fontSize: 7, color: '#aaa', fontFamily: 'monospace' }}>C{octave}</span>}
                  {variant === 'gray' && <div style={{ width: 5, height: 5, borderRadius: 1, background: '#607d8b', opacity: 0.6 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          onScroll={onGridScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ flex: 1, overflow: 'auto', position: 'relative', cursor, touchAction: 'none' }}
        >
          <div style={{ width: totalWidthPx, height: totalHeightPx, position: 'relative' }}>

            {Array.from({ length: NUM_ROWS }, (_, rowIdx) => {
              const ni   = TOP_NOTE_IDX - rowIdx;
              const step = ni % STEPS_PER_OCT;
              const isC  = step === 0;
              return (
                <div key={rowIdx} style={{
                  position: 'absolute', top: rowIdx * rowH, left: 0, right: 0, height: rowH,
                  background: isC ? ROW_BG_C : ROW_BG[stepVariant(step)],
                  borderBottom: isC ? '1px solid #333' : '1px solid #181820',
                }} />
              );
            })}

            {Array.from({ length: clip.lengthBars * beatsPerBar + 1 }, (_, i) => {
              const isBar = i % beatsPerBar === 0;
              return (
                <div key={i} style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: i * TICKS_PER_BEAT * pxPerTick, width: 1,
                  background: isBar ? '#2a2a44' : '#1e1e2a',
                  pointerEvents: 'none', zIndex: 1,
                }} />
              );
            })}

            {Array.from({ length: clip.lengthBars + 1 }, (_, i) => (
              <div key={i} style={{
                position: 'absolute', top: 1, left: i * ticksPerBar * pxPerTick + 3,
                fontSize: 8, color: '#777', fontFamily: 'monospace',
                pointerEvents: 'none', zIndex: 2,
              }}>{i + 1}</div>
            ))}

            {notesToRender.map(note => {
              const isSel   = note.id === selectedNoteId;
              const isDraft = note.id === draftNote?.id;
              const w       = Math.max(4, note.durationTicks * pxPerTick - 1);
              return (
                <div key={note.id} style={{
                  position: 'absolute',
                  left: note.startTick * pxPerTick,
                  top: rowY(note.noteIndex, rowH) + 1,
                  width: w, height: rowH - 2,
                  background: track.color,
                  opacity: 0.5 + note.velocity * 0.5,
                  borderRadius: 2,
                  outline: isSel ? `2px solid #fff` : 'none',
                  outlineOffset: 1,
                  pointerEvents: 'none', zIndex: isDraft ? 5 : 3,
                  boxShadow: isSel ? `0 0 6px ${track.color}` : 'none',
                }}>
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0,
                    width: `${note.velocity * 100}%`, height: 2,
                    background: 'rgba(255,255,255,0.5)', borderRadius: 1,
                  }} />
                  {w > 12 && (
                    <div style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0, width: RESIZE_HANDLE,
                      background: 'rgba(255,255,255,0.15)', borderRadius: '0 2px 2px 0',
                    }} />
                  )}
                </div>
              );
            })}

            {isPlaying && (
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: playheadPx, width: 2,
                background: '#ff3b30', pointerEvents: 'none', zIndex: 10,
              }} />
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom keyboard ─────────────────────────────────────────────── */}
      {showKeys && <div style={{ flexShrink: 0 }}><KeyboardContainer /></div>}
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
  WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  fontWeight: 'bold',
};
const sep: React.CSSProperties = { width: 1, height: 22, background: '#1e1e2e', flexShrink: 0 };
