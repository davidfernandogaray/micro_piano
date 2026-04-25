import { useRef, useEffect, useState, useCallback } from 'react';
import * as Tone from 'tone';
import { useMidiStore, getTicksPerBar } from '../store/midiStore';
import type { MidiTrack, MidiClip } from '../store/midiStore';
import { INSTRUMENTS } from '../audio/instruments';
import { startPlayback, stopPlayback, getTransportTick } from '../audio/midiPlayer';
import { startMetronome, stopMetronome } from '../audio/metronome';
import MidiEditor from '../components/midi/MidiEditor';

const TIME_SIGS = ['3/4','4/4','5/4','6/8','10/8','7/12'] as const;
const TRACK_H   = 60;
const HEADER_W  = 150;
const BAR_PX    = 80;
const RULER_H   = 22;
const RESIZE_W  = 8; // px of resize handle on right edge of sample

interface Props { onBack: () => void }

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

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const rafRef  = useRef<number | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const barPx   = BAR_PX * zoom;
  const ticksPerBar = getTicksPerBar(timeSig);

  // ── Sample resize drag ─────────────────────────────────────────────────────
  const resizeRef = useRef<{
    pointerId: number; trackId: string; clipId: string;
    startClientX: number; origLengthBars: number;
  } | null>(null);

  const handleSampleResizeStart = useCallback((
    e: React.PointerEvent, trackId: string, clipId: string, origLengthBars: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { pointerId: e.pointerId, trackId, clipId, startClientX: e.clientX, origLengthBars };
  }, []);

  const handleTimelinePointerMove = useCallback((e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r || r.pointerId !== e.pointerId) return;
    const dx = e.clientX - r.startClientX;
    const newLen = Math.max(1, Math.round(r.origLengthBars + dx / barPx));
    updateClip(r.trackId, r.clipId, { lengthBars: newLen });
  }, [barPx, updateClip]);

  const handleTimelinePointerUp = useCallback((e: React.PointerEvent) => {
    if (resizeRef.current?.pointerId === e.pointerId) resizeRef.current = null;
  }, []);

  // ── Playback ───────────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    await Tone.start();
    if (isPlaying) {
      stopPlayback();
      if (metronomeOn) stopMetronome();
      setPlaying(false);
    } else {
      startPlayback(tracks, bpm, timeSig);
      if (metronomeOn) startMetronome(bpm, parseInt(timeSig.split('/')[0]));
      setPlaying(true);
    }
  }, [isPlaying, tracks, bpm, timeSig, metronomeOn, setPlaying]);

  const handleStop = useCallback(() => {
    stopPlayback();
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

  // ── Timeline click (select/add sample) ────────────────────────────────────
  const handleTimelineClick = useCallback((e: React.MouseEvent, trackId: string) => {
    if (resizeRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + (timelineScrollRef.current?.scrollLeft ?? 0);
    const bar = Math.floor(x / barPx);
    const track = tracks.find(t => t.id === trackId)!;
    const hit = track.clips.find(c => bar >= c.startBar && bar < c.startBar + c.lengthBars);
    if (hit) { selectClip(hit.id); }
    else { addClip(trackId, bar); }
  }, [tracks, barPx, addClip, selectClip]);

  const playheadPx = (playheadTick / ticksPerBar) * barPx;

  // ── Edit clip routing ──────────────────────────────────────────────────────
  if (editingClip) {
    const track = tracks.find(t => t.id === editingClip.trackId);
    const clip  = track?.clips.find(c => c.id === editingClip.clipId);
    if (track && clip) {
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#13131a', overflow: 'hidden' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        padding: '4px 10px', background: '#0d0d14',
        borderBottom: '1px solid #1e1e2e', flexShrink: 0, minHeight: 38,
      }}>
        <button onClick={onBack} style={btn}>← Piano</button>
        <div style={sep} />

        <button onClick={handlePlay} style={{ ...btn, color: isPlaying ? '#ef5350' : '#66bb6a', background: isPlaying ? 'rgba(220,50,50,0.15)' : 'transparent' }}>
          {isPlaying ? '■' : '▶'}
        </button>
        <button onClick={handleStop} style={btn}>⏹</button>
        <div style={sep} />

        <button onClick={() => {
          const next = !metronomeOn; setMetronome(next);
          if (isPlaying) { if (next) startMetronome(bpm, parseInt(timeSig.split('/')[0])); else stopMetronome(); }
        }} style={{ ...btn, color: metronomeOn ? '#4fc3f7' : '#555' }}>🔔</button>
        <div style={sep} />

        <button onClick={() => setBpm(Math.max(20, bpm - 1))} style={btn}>−</button>
        <input type="number" value={bpm} min={20} max={300}
          onChange={e => setBpm(Math.max(20, Math.min(300, parseInt(e.target.value) || bpm)))}
          style={{ width: 42, textAlign: 'center', background: '#12121e', border: '1px solid #222', borderRadius: 4, color: '#b0b0d0', fontSize: 13, fontFamily: 'monospace', padding: '2px' }}
        />
        <button onClick={() => setBpm(Math.min(300, bpm + 1))} style={btn}>+</button>
        <span style={{ color: '#444', fontSize: 9, fontFamily: 'monospace' }}>BPM</span>
        <div style={sep} />

        <select value={timeSig} onChange={e => setTimeSig(e.target.value)} style={{
          background: '#12121e', border: '1px solid #222', borderRadius: 4,
          color: '#b0b0d0', fontSize: 11, padding: '2px 4px', cursor: 'pointer',
        }}>
          {TIME_SIGS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={sep} />

        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} style={btn}>−</button>
        <span style={{ color: '#444', fontSize: 9, fontFamily: 'monospace', minWidth: 32, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(4, z + 0.2))} style={btn}>+</button>
        <div style={sep} />

        {/* Sample actions */}
        {selectedClipId && (() => {
          const track = tracks.find(t => t.clips.some(c => c.id === selectedClipId));
          return track ? (
            <>
              <button onClick={() => setEditingClip({ trackId: track.id, clipId: selectedClipId })} style={{ ...btn, color: '#90caf9' }}>✏ Edit</button>
              <button onClick={() => copyClip(track.id, selectedClipId)} style={btn} title="Copy sample">⎘</button>
              <button onClick={() => { deleteClip(track.id, selectedClipId); selectClip(null); }} style={{ ...btn, color: '#ef9a9a' }}>✕</button>
            </>
          ) : null;
        })()}
        {store.clipboard && (
          <button onClick={() => { const t = tracks[0]; if (t) pasteClip(t.id, totalBars - store.clipboard!.lengthBars); }} style={btn}>⎙ Paste</button>
        )}

        <div style={{ flex: 1 }} />
        <button onClick={extendTimeline} style={btn}>+ Bars</button>
        <button onClick={addTrack} style={{ ...btn, color: '#a5d6a7' }}>+ Track</button>
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
                width: barPx, flexShrink: 0, borderLeft: '1px solid #222',
                paddingLeft: 4, fontSize: 9, color: '#444', fontFamily: 'monospace',
              }}>{i + 1}</div>
            ))}
          </div>

          {/* Track rows */}
          <div style={{ position: 'relative', width: totalBars * barPx, minHeight: tracks.length * TRACK_H }}>
            {tracks.map(track => (
              <TrackRow
                key={track.id} track={track} totalBars={totalBars} barPx={barPx}
                selectedClipId={selectedClipId}
                onClick={(e) => handleTimelineClick(e, track.id)}
                onClipClick={(id) => selectClip(id)}
                onClipDblClick={(id) => setEditingClip({ trackId: track.id, clipId: id })}
                onSampleResizeStart={(e, clipId, origLen) => handleSampleResizeStart(e, track.id, clipId, origLen)}
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
      {/* Row 1: name + mute + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
        {editingName ? (
          <input value={nameVal} onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            autoFocus
            style={{ flex: 1, background: '#1a1a28', border: '1px solid #4fc3f7', borderRadius: 3, color: '#c0c0e0', fontSize: 10, fontFamily: 'monospace', padding: '1px 4px', outline: 'none' }}
          />
        ) : (
          <span
            onClick={() => { setNameVal(track.name); setEditingName(true); }}
            title="Click to rename"
            style={{ flex: 1, color: '#c0c0e0', fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
          >{track.name}</span>
        )}
        <button onClick={() => onUpdate({ muted: !track.muted })} style={{ ...iconBtn, color: track.muted ? '#ef5350' : '#555' }}>
          {track.muted ? '🔇' : '🔊'}
        </button>
        <button onClick={onDelete} style={{ ...iconBtn, color: '#444', fontSize: 10 }}>✕</button>
      </div>

      {/* Row 2: instrument + actions + reorder */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <select value={track.instrumentId} onChange={e => onUpdate({ instrumentId: e.target.value })}
          style={{ flex: 1, background: 'transparent', border: 'none', color: '#555', fontSize: 9, fontFamily: 'monospace', cursor: 'pointer', outline: 'none', minWidth: 0 }}
        >
          {INSTRUMENTS.map(i => <option key={i.id} value={i.id} style={{ background: '#1a1a26' }}>{i.name}</option>)}
        </select>
        <button onClick={onAdd} style={{ ...iconBtn, color: '#66bb6a' }}>＋</button>
        {hasSelected && <button onClick={onEdit} style={{ ...iconBtn, color: '#90caf9' }}>✏</button>}
        {hasClipboard && <button onClick={onPaste} style={{ ...iconBtn, color: '#ffd54f' }}>⎙</button>}
        <div style={{ width: 1, height: 12, background: '#222' }} />
        <button onClick={onMoveUp} disabled={idx === 0} style={{ ...iconBtn, color: idx === 0 ? '#2a2a3a' : '#666', fontSize: 9 }}>↑</button>
        <button onClick={onMoveDown} disabled={idx === trackCount - 1} style={{ ...iconBtn, color: idx === trackCount - 1 ? '#2a2a3a' : '#666', fontSize: 9 }}>↓</button>
      </div>
    </div>
  );
}

// ── Track Row (timeline) ──────────────────────────────────────────────────────
function TrackRow({ track, totalBars, barPx, selectedClipId, onClick, onClipClick, onClipDblClick, onSampleResizeStart }: {
  track: MidiTrack; totalBars: number; barPx: number; selectedClipId: string | null;
  onClick: (e: React.MouseEvent) => void;
  onClipClick: (id: string) => void;
  onClipDblClick: (id: string) => void;
  onSampleResizeStart: (e: React.PointerEvent, clipId: string, origLen: number) => void;
}) {
  return (
    <div onClick={onClick} style={{
      height: TRACK_H, position: 'relative',
      borderBottom: '1px solid #1a1a26', background: '#13131a',
    }}>
      {/* Bar grid */}
      {Array.from({ length: totalBars }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', left: i * barPx, top: 0, bottom: 0,
          width: 1, background: '#1c1c2a', pointerEvents: 'none',
        }} />
      ))}

      {/* Samples (clips) */}
      {track.clips.map((clip: MidiClip) => {
        const sel = clip.id === selectedClipId;
        const w   = Math.max(barPx - 2, clip.lengthBars * barPx - 2);
        return (
          <div
            key={clip.id}
            onClick={(e) => { e.stopPropagation(); onClipClick(clip.id); }}
            onDoubleClick={(e) => { e.stopPropagation(); onClipDblClick(clip.id); }}
            style={{
              position: 'absolute', left: clip.startBar * barPx + 1,
              width: w, top: 4, bottom: 4, borderRadius: 4,
              background: track.color + (sel ? 'dd' : '88'),
              border: sel ? `2px solid ${track.color}` : `1px solid ${track.color}44`,
              cursor: 'pointer', overflow: 'hidden',
              boxShadow: sel ? `0 0 8px ${track.color}66` : 'none',
              display: 'flex', alignItems: 'center', paddingLeft: 6,
            }}
          >
            <span style={{ fontSize: 9, color: sel ? '#fff' : '#ffffff99', fontFamily: 'monospace', whiteSpace: 'nowrap', flex: 1, overflow: 'hidden' }}>
              {clip.notes.length > 0 ? `♩ ${clip.notes.length}` : 'empty'}
            </span>
            {/* Resize handle */}
            <div
              onPointerDown={(e) => onSampleResizeStart(e, clip.id, clip.lengthBars)}
              style={{
                width: RESIZE_W, alignSelf: 'stretch', cursor: 'col-resize',
                background: 'rgba(255,255,255,0.12)', flexShrink: 0,
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
  background: 'transparent', color: '#666',
  border: '1px solid #1e1e2e', borderRadius: 4,
  padding: '3px 8px', fontSize: 11, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', flexShrink: 0,
};
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none',
  cursor: 'pointer', fontSize: 12, padding: '1px 2px',
  WebkitTapHighlightColor: 'transparent',
};
const sep: React.CSSProperties = { width: 1, height: 18, background: '#1e1e2e', flexShrink: 0 };
