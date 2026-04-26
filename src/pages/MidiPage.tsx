import { useRef, useEffect, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { useMidiStore, getTicksPerBar } from '../store/midiStore';
import type { MidiTrack, MidiClip, MidiNote } from '../store/midiStore';
import { INSTRUMENTS } from '../audio/instruments';
import { startPlayback, stopPlayback, getTransportTick } from '../audio/midiPlayer';
import { startDrumPlayback, stopDrumPlayback } from '../audio/drumPlayer';
import { startMetronome, stopMetronome } from '../audio/metronome';
import MidiEditor from '../components/midi/MidiEditor';
import DrumEditor from '../components/midi/DrumEditor';

const TIME_SIGS = ['3/4','4/4','5/4','6/8','10/8','7/12'] as const;
const TRACK_H   = 64;
const HEADER_W  = 160;
const BAR_PX    = 80;
const RULER_H   = 24;
const RESIZE_W  = 14;

interface Props { onBack: () => void }

// ── Mini note preview ─────────────────────────────────────────────────────────
function ClipMiniPreview({ notes, ticksPerBar, lengthBars }: {
  notes: MidiNote[]; color?: string; ticksPerBar: number; lengthBars: number;
}) {
  if (!notes.length) return null;
  const totalTicks = Math.max(lengthBars * ticksPerBar, 1);
  const minNI = Math.min(...notes.map(n => n.noteIndex));
  const maxNI = Math.max(...notes.map(n => n.noteIndex));
  const niRange = Math.max(maxNI - minNI + 1, 8);
  return (
    <svg
      style={{ position: 'absolute', inset: '3px', right: RESIZE_W + 4, pointerEvents: 'none', display: 'block' }}
      viewBox={`0 0 ${totalTicks} ${niRange}`}
      preserveAspectRatio="none"
    >
      {notes.map(note => (
        <rect key={note.id}
          x={note.startTick}
          y={maxNI - note.noteIndex}
          width={Math.max(totalTicks * 0.012, note.durationTicks)}
          height={1}
          fill="rgba(255,255,255,0.88)"
        />
      ))}
    </svg>
  );
}

// ── Drum mini preview ─────────────────────────────────────────────────────────
function DrumMiniPreview({ clip }: { clip: MidiClip }) {
  if (!clip.drumRows) return null;
  return (
    <div style={{ position: 'absolute', inset: '3px', right: RESIZE_W + 4, display: 'flex', flexWrap: 'wrap', gap: 1, alignContent: 'flex-start', overflow: 'hidden', pointerEvents: 'none' }}>
      {clip.drumRows.map(row =>
        row.steps.map((step, i) => step.active ? (
          <div key={`${row.instrumentId}-${i}`} style={{ width: 3, height: 3, borderRadius: 1, background: 'white', opacity: step.velocity }} />
        ) : null)
      )}
    </div>
  );
}

export default function MidiPage({ onBack }: Props) {
  const store = useMidiStore();
  const {
    tracks, totalBars, bpm, timeSig, metronomeOn,
    isPlaying, playheadTick,
    selectedClipId, editingClip,
    addTrack, removeTrack, updateTrack, moveTrack,
    addClip, deleteClip, updateClip, copyClip, pasteClip,
    setEditingClip, selectClip,
    setBpm, setTimeSig, setMetronome, setPlaying, setRecording,
    setPlayheadTick, extendTimeline,
  } = store;

  const handleSave = () => {
    localStorage.setItem('microPiano_v1', JSON.stringify({ tracks, totalBars, bpm, timeSig }));
    alert('Project saved!');
  };

  const handleOpen = () => {
    const raw = localStorage.getItem('microPiano_v1');
    if (!raw) { alert('No saved project found'); return; }
    try {
      const data = JSON.parse(raw);
      store.loadProject(data);
    } catch { alert('Failed to load project'); }
  };

  const handleExport = async () => {
    await Tone.start();
    setExporting(true);
    const recorder = new Tone.Recorder();
    Tone.Destination.connect(recorder);
    await recorder.start();
    startPlayback(tracks, bpm, timeSig);
    startDrumPlayback(tracks, bpm, timeSig);
    const beatsPerBar = parseInt(timeSig.split('/')[0]);
    const durationMs = totalBars * beatsPerBar * (60000 / bpm) + 500;
    setTimeout(async () => {
      stopPlayback();
      stopDrumPlayback();
      const blob = await recorder.stop();
      Tone.Destination.disconnect(recorder);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'microPiano.webm'; a.click();
      URL.revokeObjectURL(url);
      setExporting(false);
    }, durationMs);
  };

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const rafRef  = useRef<number | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const barPx   = BAR_PX * zoom;
  const ticksPerBar = getTicksPerBar(timeSig);

  // ── Clip drag (move + resize) ─────────────────────────────────────────────
  const clipDragRef = useRef<{
    pointerId: number; trackId: string; clipId: string;
    startClientX: number; origLengthBars: number; origStartBar: number;
    mode: 'resize' | 'move';
  } | null>(null);

  const handleSampleResizeStart = useCallback((
    e: React.PointerEvent, trackId: string, clipId: string, origLengthBars: number, origStartBar: number
  ) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    clipDragRef.current = { pointerId: e.pointerId, trackId, clipId, startClientX: e.clientX, origLengthBars, origStartBar, mode: 'resize' };
  }, []);

  const handleSampleMoveStart = useCallback((
    e: React.PointerEvent, trackId: string, clipId: string, origStartBar: number, origLengthBars: number
  ) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    clipDragRef.current = { pointerId: e.pointerId, trackId, clipId, startClientX: e.clientX, origLengthBars, origStartBar, mode: 'move' };
  }, []);

  const handleTimelinePointerMove = useCallback((e: React.PointerEvent) => {
    const r = clipDragRef.current;
    if (!r || r.pointerId !== e.pointerId) return;
    const dx = e.clientX - r.startClientX;
    if (r.mode === 'resize') {
      const newLen = Math.max(1, Math.round(r.origLengthBars + dx / barPx));
      updateClip(r.trackId, r.clipId, { lengthBars: newLen });
    } else {
      const newStart = Math.max(0, Math.round(r.origStartBar + dx / barPx));
      updateClip(r.trackId, r.clipId, { startBar: newStart });
    }
  }, [barPx, updateClip]);

  const handleTimelinePointerUp = useCallback((e: React.PointerEvent) => {
    if (clipDragRef.current?.pointerId === e.pointerId) clipDragRef.current = null;
  }, []);

  // ── Playback ──────────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    await Tone.start();
    if (isPlaying) {
      stopPlayback();
      stopDrumPlayback();
      if (metronomeOn) stopMetronome();
      setPlaying(false);
    } else {
      startPlayback(tracks, bpm, timeSig);
      startDrumPlayback(tracks, bpm, timeSig);
      if (metronomeOn) startMetronome(bpm, parseInt(timeSig.split('/')[0]));
      setPlaying(true);
    }
  }, [isPlaying, tracks, bpm, timeSig, metronomeOn, setPlaying]);

  const handleStop = useCallback(() => {
    stopPlayback();
    stopDrumPlayback();
    if (metronomeOn) stopMetronome();
    setPlaying(false); setRecording(false); setPlayheadTick(0);
    Tone.Transport.stop();
    Tone.Transport.position = 0 as unknown as string;
  }, [metronomeOn, setPlaying, setRecording, setPlayheadTick]);

  useEffect(() => {
    if (!isPlaying) return;
    const tick = () => { setPlayheadTick(getTransportTick()); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, setPlayheadTick]);

  // ── Timeline click ────────────────────────────────────────────────────────
  const handleTimelineClick = useCallback((e: React.MouseEvent, trackId: string) => {
    if (clipDragRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + (timelineScrollRef.current?.scrollLeft ?? 0);
    const bar = Math.floor(x / barPx);
    const track = tracks.find(t => t.id === trackId)!;
    const hit = track.clips.find(c => bar >= c.startBar && bar < c.startBar + c.lengthBars);
    if (hit) { selectClip(hit.id); }
    else { addClip(trackId, bar); }
  }, [tracks, barPx, addClip, selectClip]);

  const playheadPx = (playheadTick / ticksPerBar) * barPx;

  // ── Duplicate selected clip ───────────────────────────────────────────────
  const handleDuplicate = useCallback(() => {
    if (!selectedClipId) return;
    const track = tracks.find(t => t.clips.some(c => c.id === selectedClipId));
    if (!track) return;
    const clip = track.clips.find(c => c.id === selectedClipId)!;
    copyClip(track.id, selectedClipId);
    pasteClip(track.id, clip.startBar + clip.lengthBars);
  }, [selectedClipId, tracks, copyClip, pasteClip]);

  // ── Edit clip routing ─────────────────────────────────────────────────────
  if (editingClip) {
    const track = tracks.find(t => t.id === editingClip.trackId);
    const clip  = track?.clips.find(c => c.id === editingClip.clipId);
    if (track && clip) {
      if (track.trackType === 'drums') {
        return (
          <DrumEditor
            track={track} clip={clip} timeSig={timeSig}
            onClose={() => setEditingClip(null)}
            onUpdateClip={(patch) => updateClip(track.id, clip.id, patch)}
            onUpdateTrack={(patch) => updateTrack(track.id, patch)}
          />
        );
      }
      return (
        <MidiEditor
          track={track} clip={clip} timeSig={timeSig}
          onClose={() => setEditingClip(null)}
          onUpdateClip={(patch) => updateClip(track.id, clip.id, patch)}
          onUpdateTrack={(patch) => updateTrack(track.id, patch)}
        />
      );
    }
  }

  const selectedTrack = selectedClipId
    ? tracks.find(t => t.clips.some(c => c.id === selectedClipId)) ?? null
    : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#13131a', overflow: 'hidden' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '6px 12px', background: '#0d0d14',
        borderBottom: '1px solid #1e1e2e', flexShrink: 0, minHeight: 48,
      }}>
        {/* Back */}
        <button onClick={onBack} style={btn}>← Piano</button>
        <div style={sep} />

        {/* Transport */}
        <button onClick={handlePlay} style={{ ...transportBtn, color: '#66bb6a', background: isPlaying ? 'rgba(102,187,106,0.18)' : 'transparent', boxShadow: isPlaying ? '0 0 10px rgba(102,187,106,0.35)' : 'none' }}>
          {isPlaying ? '■' : '▶'}
        </button>
        <button onClick={handleStop} style={{ ...transportBtn, color: '#4fc3f7' }}>⏹</button>
        <div style={sep} />

        {/* Metronome */}
        <button onClick={() => {
          const next = !metronomeOn; setMetronome(next);
          if (isPlaying) { if (next) startMetronome(bpm, parseInt(timeSig.split('/')[0])); else stopMetronome(); }
        }} style={{ ...btn, color: metronomeOn ? '#4fc3f7' : '#aaa', background: metronomeOn ? 'rgba(79,195,247,0.1)' : 'transparent' }}>🔔</button>
        <div style={sep} />

        {/* BPM */}
        <button onClick={() => setBpm(Math.max(20, bpm - 1))} style={btn}>−</button>
        <input type="number" value={bpm} min={20} max={300}
          onChange={e => setBpm(Math.max(20, Math.min(300, parseInt(e.target.value) || bpm)))}
          style={{ width: 44, textAlign: 'center', background: '#12121e', border: '1px solid #333', borderRadius: 4, color: '#e0e0f0', fontSize: 13, fontFamily: 'monospace', padding: '3px 2px' }}
        />
        <button onClick={() => setBpm(Math.min(300, bpm + 1))} style={btn}>+</button>
        <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace' }}>BPM</span>
        <div style={sep} />

        {/* Time sig */}
        <select value={timeSig} onChange={e => setTimeSig(e.target.value)} style={{
          background: '#12121e', border: '1px solid #333', borderRadius: 4,
          color: '#e0e0f0', fontSize: 12, padding: '4px 6px', cursor: 'pointer',
        }}>
          {TIME_SIGS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={sep} />

        {/* Zoom */}
        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} style={btn}>−</button>
        <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace', minWidth: 32, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} style={btn}>+</button>
        <div style={sep} />

        {/* Clip actions — shown when clip selected */}
        {selectedClipId && selectedTrack && (() => (
          <>
            <button onClick={() => setEditingClip({ trackId: selectedTrack.id, clipId: selectedClipId })}
              style={{ ...btn, color: '#90caf9', borderColor: 'rgba(144,202,249,0.4)' }}>✏ Edit</button>
            <button onClick={handleDuplicate}
              style={{ ...btn, color: '#ffd54f', borderColor: 'rgba(255,213,79,0.4)' }}>⊕ Dup</button>
            {store.clipboard && (
              <button onClick={() => pasteClip(selectedTrack.id, 0)}
                style={{ ...btn, color: '#ce93d8', borderColor: 'rgba(206,147,216,0.4)' }}>⎙ Paste</button>
            )}
            <button onClick={() => { deleteClip(selectedTrack.id, selectedClipId); selectClip(null); }}
              style={{ ...btn, color: '#ef9a9a', borderColor: 'rgba(239,154,154,0.4)' }}>✕ Del</button>
          </>
        ))()}

        <div style={{ flex: 1 }} />
        <div style={sep} />
        <button onClick={handleSave} style={btn}>💾 Save</button>
        <button onClick={handleOpen} style={btn}>📂 Open</button>
        <button onClick={handleExport} disabled={exporting} style={{ ...btn, color: exporting ? '#aaa' : '#a5d6a7' }}>
          {exporting ? '⏳' : '⬇ Export'}
        </button>
        <div style={sep} />
        <button onClick={extendTimeline} style={btn}>+ Bars</button>
        <button onClick={() => store.addDrumTrack()} style={{ ...btn, color: '#ff9800', borderColor: 'rgba(255,152,0,0.4)' }}>+ Drums</button>
        <button onClick={addTrack} style={{ ...btn, color: '#a5d6a7', borderColor: 'rgba(165,214,167,0.4)' }}>+ Piano</button>
      </div>

      {/* ── Arranger ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Track headers */}
        <div style={{
          width: HEADER_W, flexShrink: 0, background: '#0f0f18',
          borderRight: '1px solid #1e1e2e', overflowY: 'auto', scrollbarWidth: 'none',
        }}>
          <div style={{ height: RULER_H, borderBottom: '1px solid #1e1e2e' }} />
          {tracks.map((track, idx) => (
            <TrackHeader
              key={track.id} track={track} idx={idx} trackCount={tracks.length}
              selectedClipId={selectedClipId}
              onUpdate={(p) => updateTrack(track.id, p)}
              onDelete={() => removeTrack(track.id)}
              onAdd={() => addClip(track.id, 0)}
              onEdit={() => { const c = track.clips.find(c2 => c2.id === selectedClipId); if (c) setEditingClip({ trackId: track.id, clipId: c.id }); }}
              onPaste={() => pasteClip(track.id, 0)}
              onMoveUp={() => moveTrack(track.id, 'up')}
              onMoveDown={() => moveTrack(track.id, 'down')}
              hasClipboard={!!store.clipboard}
            />
          ))}
        </div>

        {/* Timeline */}
        <div
          ref={timelineScrollRef}
          onPointerMove={handleTimelinePointerMove}
          onPointerUp={handleTimelinePointerUp}
          onPointerCancel={handleTimelinePointerUp}
          style={{ flex: 1, overflow: 'auto', position: 'relative' }}
        >
          {/* Ruler */}
          <div style={{
            height: RULER_H, position: 'sticky', top: 0, zIndex: 5,
            width: totalBars * barPx, background: '#0d0d14',
            borderBottom: '1px solid #1e1e2e', display: 'flex', alignItems: 'center',
          }}>
            {Array.from({ length: totalBars }, (_, i) => (
              <div key={i} style={{
                width: barPx, flexShrink: 0, borderLeft: '1px solid #2a2a3e',
                paddingLeft: 4, fontSize: 9, color: '#999', fontFamily: 'monospace',
              }}>{i + 1}</div>
            ))}
          </div>

          {/* Track rows */}
          <div style={{ position: 'relative', width: totalBars * barPx, minHeight: tracks.length * TRACK_H }}>
            {tracks.map(track => (
              <TrackRow
                key={track.id} track={track} totalBars={totalBars} barPx={barPx}
                ticksPerBar={ticksPerBar}
                selectedClipId={selectedClipId}
                onClick={(e) => handleTimelineClick(e, track.id)}
                onClipClick={(id) => selectClip(id)}
                onClipDblClick={(id) => setEditingClip({ trackId: track.id, clipId: id })}
                onSampleResizeStart={(e, clipId, origLen, origStart) => handleSampleResizeStart(e, track.id, clipId, origLen, origStart)}
                onSampleMoveStart={(e, clipId, origStart, origLen) => handleSampleMoveStart(e, track.id, clipId, origStart, origLen)}
              />
            ))}

            {/* Playhead */}
            {isPlaying && (
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: playheadPx, width: 2,
                background: '#ff3b30', pointerEvents: 'none', zIndex: 10,
              }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Track Header ──────────────────────────────────────────────────────────────
function TrackHeader({
  track, idx, trackCount, selectedClipId,
  onUpdate, onDelete, onAdd, onEdit, onPaste, onMoveUp, onMoveDown, hasClipboard,
}: {
  track: MidiTrack; idx: number; trackCount: number; selectedClipId: string | null;
  onUpdate: (p: Partial<Pick<MidiTrack, 'name'|'instrumentId'|'muted'|'color'>>) => void;
  onDelete: () => void; onAdd: () => void; onEdit: () => void;
  onPaste: () => void; onMoveUp: () => void; onMoveDown: () => void;
  hasClipboard: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(track.name);
  const commitName = () => { onUpdate({ name: nameVal.trim() || track.name }); setEditingName(false); };
  const hasSelected = track.clips.some(c => c.id === selectedClipId);

  return (
    <div style={{
      height: TRACK_H, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: '4px 6px', borderBottom: '1px solid #1a1a26',
      borderLeft: `3px solid ${track.color}`, background: '#0f0f18',
    }}>
      {/* Row 1: color + name + mute + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        {/* Color picker */}
        <input type="color" value={track.color}
          onChange={e => onUpdate({ color: e.target.value })}
          style={{ width: 16, height: 16, border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 2, flexShrink: 0 }}
          title="Track color"
        />
        {editingName ? (
          <input value={nameVal} onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            autoFocus
            style={{ flex: 1, background: '#1a1a28', border: '1px solid #4fc3f7', borderRadius: 3, color: '#e0e0f0', fontSize: 10, fontFamily: 'monospace', padding: '1px 4px', outline: 'none' }}
          />
        ) : (
          <span
            onClick={() => { setNameVal(track.name); setEditingName(true); }}
            title="Click to rename"
            style={{ flex: 1, color: '#e0e0f0', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
          >{track.name}</span>
        )}
        <button onClick={() => onUpdate({ muted: !track.muted })} style={{ ...iconBtn, color: track.muted ? '#ef5350' : '#aaa' }}>
          {track.muted ? '🔇' : '🔊'}
        </button>
        <button onClick={onDelete} style={{ ...iconBtn, color: '#999', fontSize: 10 }}>✕</button>
      </div>

      {/* Row 2: instrument + actions + reorder */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <select value={track.instrumentId} onChange={e => onUpdate({ instrumentId: e.target.value })}
          style={{ flex: 1, background: 'transparent', border: 'none', color: '#ccc', fontSize: 9, fontFamily: 'monospace', cursor: 'pointer', outline: 'none', minWidth: 0 }}
        >
          {INSTRUMENTS.map(i => <option key={i.id} value={i.id} style={{ background: '#1a1a26' }}>{i.name}</option>)}
        </select>
        <button onClick={onAdd} style={{ ...iconBtn, color: '#66bb6a' }}>＋</button>
        {hasSelected && <button onClick={onEdit} style={{ ...iconBtn, color: '#90caf9' }}>✏</button>}
        {hasClipboard && <button onClick={onPaste} style={{ ...iconBtn, color: '#ffd54f' }}>⎙</button>}
        <div style={{ width: 1, height: 12, background: '#222' }} />
        <button onClick={onMoveUp} disabled={idx === 0} style={{ ...iconBtn, color: idx === 0 ? '#2a2a3a' : '#aaa', fontSize: 9 }}>↑</button>
        <button onClick={onMoveDown} disabled={idx === trackCount - 1} style={{ ...iconBtn, color: idx === trackCount - 1 ? '#2a2a3a' : '#aaa', fontSize: 9 }}>↓</button>
      </div>
    </div>
  );
}

// ── Track Row ─────────────────────────────────────────────────────────────────
function TrackRow({ track, totalBars, barPx, ticksPerBar, selectedClipId, onClick, onClipClick, onClipDblClick, onSampleResizeStart, onSampleMoveStart }: {
  track: MidiTrack; totalBars: number; barPx: number; ticksPerBar: number; selectedClipId: string | null;
  onClick: (e: React.MouseEvent) => void;
  onClipClick: (id: string) => void;
  onClipDblClick: (id: string) => void;
  onSampleResizeStart: (e: React.PointerEvent, clipId: string, origLen: number, origStart: number) => void;
  onSampleMoveStart: (e: React.PointerEvent, clipId: string, origStart: number, origLen: number) => void;
}) {
  return (
    <div onClick={onClick} style={{
      height: TRACK_H, position: 'relative',
      borderBottom: '1px solid #1a1a26', background: '#13131a',
    }}>
      {Array.from({ length: totalBars }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', left: i * barPx, top: 0, bottom: 0,
          width: 1, background: '#1c1c2a', pointerEvents: 'none',
        }} />
      ))}

      {track.clips.map((clip: MidiClip) => {
        const sel = clip.id === selectedClipId;
        const w   = Math.max(barPx - 2, clip.lengthBars * barPx - 2);
        return (
          <div
            key={clip.id}
            onPointerDown={(e) => onSampleMoveStart(e, clip.id, clip.startBar, clip.lengthBars)}
            onClick={(e) => { e.stopPropagation(); onClipClick(clip.id); }}
            onDoubleClick={(e) => { e.stopPropagation(); onClipDblClick(clip.id); }}
            style={{
              position: 'absolute', left: clip.startBar * barPx + 1,
              width: w, top: 4, bottom: 4, borderRadius: 5,
              background: track.color + (sel ? 'cc' : '66'),
              border: sel ? `2px solid ${track.color}` : `1px solid ${track.color}44`,
              cursor: 'grab',
              boxShadow: sel ? `0 0 10px ${track.color}55` : 'none',
              display: 'flex', alignItems: 'center', paddingLeft: 6,
              overflow: 'hidden',
            }}
          >
            {/* Mini preview */}
            {clip.drumRows ? (
              <DrumMiniPreview clip={clip} />
            ) : (
              <ClipMiniPreview notes={clip.notes} ticksPerBar={ticksPerBar} lengthBars={clip.lengthBars} />
            )}

            {/* Label (when no notes/steps) */}
            {!clip.drumRows && clip.notes.length === 0 && (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', whiteSpace: 'nowrap', flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
                empty
              </span>
            )}
            {clip.drumRows && !clip.drumRows.some(r => r.steps.some(s => s.active)) && (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', whiteSpace: 'nowrap', flex: 1, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
                empty
              </span>
            )}

            {/* Resize handle */}
            <div
              onPointerDown={(e) => onSampleResizeStart(e, clip.id, clip.lengthBars, clip.startBar)}
              style={{
                width: RESIZE_W, alignSelf: 'stretch', cursor: 'col-resize',
                background: 'rgba(255,255,255,0.15)', flexShrink: 0, zIndex: 2,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const btn: React.CSSProperties = {
  background: 'transparent', color: '#d0d0e8',
  border: '1px solid #2a2a3e', borderRadius: 6,
  padding: '6px 12px', fontSize: 12, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', flexShrink: 0,
};
const transportBtn: React.CSSProperties = {
  border: '1px solid #2a2a3e', borderRadius: 6,
  padding: '6px 14px', fontSize: 14, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', flexShrink: 0,
  fontWeight: 'bold',
};
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  cursor: 'pointer', fontSize: 12, padding: '1px 3px',
  WebkitTapHighlightColor: 'transparent',
};
const sep: React.CSSProperties = { width: 1, height: 22, background: '#1e1e2e', flexShrink: 0 };
