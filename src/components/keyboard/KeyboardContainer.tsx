import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import PianoKey from './PianoKey';
import { OCTAVE_LAYOUTS, OCTAVE_W, WHITE_H, GRAY_W, hitTestOctave, type KeyInfo } from './layout';
import { STEPS_PER_OCTAVE, noteFrequency } from '../../audio/tuning';
import { attackNote, releaseNote } from '../../audio/engine';
import { useAppStore } from '../../store';

const MIN_OCTAVE    = 1;
const MAX_OCTAVE    = 7;
const NUM_OCTAVES   = MAX_OCTAVE - MIN_OCTAVE + 1; // 7
const TOTAL_W       = NUM_OCTAVES * OCTAVE_W;
const INIT_SCROLL   = 2 * OCTAVE_W; // start at C3
const DEFAULT_ZOOM  = 1.3;

const SEMITONE_LABEL   = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const SEMITONE_VARIANT = ['white','black','white','black','white','white','black','white','black','white','black','white'] as const;

function buildAllKeys(): KeyInfo[] {
  const keys: KeyInfo[] = [];
  for (let oct = MIN_OCTAVE; oct <= MAX_OCTAVE; oct++) {
    const octLeft = (oct - MIN_OCTAVE) * OCTAVE_W;
    for (let semi = 0; semi < 12; semi++) {
      const eStep = semi * 2;
      const ni = oct * STEPS_PER_OCTAVE + eStep;
      keys.push({
        noteId: `${SEMITONE_LABEL[semi]}${oct}`,
        noteIndex: ni, frequency: noteFrequency(ni),
        variant: SEMITONE_VARIANT[semi], stepInOctave: eStep, octave: oct,
        label: `${SEMITONE_LABEL[semi]}${oct}`,
        absLeft: octLeft + OCTAVE_LAYOUTS[eStep].left,
      });
      const oStep = semi * 2 + 1;
      const mi = oct * STEPS_PER_OCTAVE + oStep;
      // B½ (oStep=23): center it at the octave boundary so it bridges B and next C
      const isB_half = oStep === 23;
      const grayLeft = isB_half
        ? octLeft + OCTAVE_W - GRAY_W / 2   // center = octave boundary (407 with GRAY_W=26)
        : octLeft + OCTAVE_LAYOUTS[oStep].left;
      keys.push({
        noteId: `${SEMITONE_LABEL[semi]}+${oct}`,
        noteIndex: mi, frequency: noteFrequency(mi),
        variant: 'gray', stepInOctave: oStep, octave: oct,
        label: `${SEMITONE_LABEL[semi]}+`,
        absLeft: grayLeft,
      });
    }
  }
  return keys;
}

const ALL_KEYS       = buildAllKeys();
const NOTE_INDEX_MAP = new Map<number, KeyInfo>(ALL_KEYS.map(k => [k.noteIndex, k]));

// ── Octave Strip ─────────────────────────────────────────────────────────────
const OCTAVE_LABELS = Array.from({ length: NUM_OCTAVES }, (_, i) => `C${i + MIN_OCTAVE}`);

function OctaveStrip({
  scrollLeft, zoom, containerWidth,
  onScrollTo, onScrollBy, onZoomBy,
}: {
  scrollLeft: number; zoom: number; containerWidth: number;
  onScrollTo: (s: number) => void;
  onScrollBy: (oct: number) => void;
  onZoomBy:   (d: number) => void;
}) {
  const visibleW    = containerWidth / zoom;            // unscaled viewport width
  const visStart    = scrollLeft / OCTAVE_W;            // fractional octave offset
  const visCount    = visibleW / OCTAVE_W;              // fractional octave count

  const rectLeft  = Math.max(0, (visStart / NUM_OCTAVES) * 100);
  const rectWidth = Math.min(100 - rectLeft, (visCount / NUM_OCTAVES) * 100);

  const handleStripClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const targetOctave = Math.floor(frac * NUM_OCTAVES);
    onScrollTo(Math.max(0, Math.min(targetOctave * OCTAVE_W, TOTAL_W - OCTAVE_W)));
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', background: '#090910',
      borderBottom: '1px solid #161622',
    }}>
      {/* Scroll left */}
      <button onClick={() => onScrollBy(-1)} style={navBtn}>◀</button>

      {/* Octave strip */}
      <div
        onClick={handleStripClick}
        style={{
          flex: 1, position: 'relative', height: 22,
          background: '#111118', borderRadius: 4,
          cursor: 'pointer', overflow: 'hidden',
          border: '1px solid #1e1e2a',
        }}
      >
        {/* Octave labels */}
        <div style={{
          display: 'flex', height: '100%',
          alignItems: 'center',
        }}>
          {OCTAVE_LABELS.map(lbl => (
            <div key={lbl} style={{
              flex: 1, textAlign: 'center',
              fontSize: 9, color: '#8888aa',
              fontFamily: 'monospace', userSelect: 'none',
            }}>{lbl}</div>
          ))}
        </div>
        {/* Red visible-range rectangle */}
        <div style={{
          position: 'absolute', top: 1, bottom: 1,
          left: `${rectLeft}%`,
          width: `${rectWidth}%`,
          background: 'rgba(220, 50, 50, 0.25)',
          border: '1px solid rgba(220, 50, 50, 0.6)',
          borderRadius: 3,
          pointerEvents: 'none',
          transition: 'left 0.12s, width 0.12s',
        }} />
      </div>

      {/* Scroll right */}
      <button onClick={() => onScrollBy(1)} style={navBtn}>▶</button>

      {/* Zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <button onClick={() => onZoomBy(-0.15)} style={navBtn}>−</button>
        <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace', minWidth: 30, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => onZoomBy(0.15)} style={navBtn}>+</button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function KeyboardContainer() {
  const containerRef    = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(INIT_SCROLL);
  const [zoom, setZoom]             = useState(DEFAULT_ZOOM);
  const [containerW, setContainerW] = useState(800);
  const scrollRef  = useRef(INIT_SCROLL);
  const zoomRef    = useRef(DEFAULT_ZOOM);
  const activePointers   = useRef(new Map<number, number>());
  const pointerPositions = useRef(new Map<number, { x: number; y: number }>());
  const lastPinchDist    = useRef<number | null>(null);
  const { pressKey, releaseKey } = useAppStore();

  // Track container width for the octave strip
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const getHitNote = useCallback((clientX: number, clientY: number): KeyInfo | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect   = el.getBoundingClientRect();
    // CSS transform: scaleX(zoom) translateX(-scrollLeft) → undo R→L
    const localX = (clientX - rect.left) / zoomRef.current + scrollRef.current;
    const localY = clientY - rect.top;
    if (localY < 0 || localY > WHITE_H || localX < 0 || localX >= TOTAL_W) return null;
    const octaveIdx = Math.floor(localX / OCTAVE_W);
    const octave    = octaveIdx + MIN_OCTAVE;
    if (octave < MIN_OCTAVE || octave > MAX_OCTAVE) return null;
    const xInOctave = localX - octaveIdx * OCTAVE_W;
    const step      = hitTestOctave(xInOctave, localY);
    if (step < 0) return null;
    return NOTE_INDEX_MAP.get(octave * STEPS_PER_OCTAVE + step) ?? null;
  }, []);

  const scrollTo = useCallback((s: number) => {
    const clamped = Math.max(0, Math.min(s, TOTAL_W - OCTAVE_W * 2));
    setScrollLeft(clamped);
    scrollRef.current = clamped;
  }, []);

  const scrollBy = useCallback((octaves: number) => {
    scrollTo(scrollRef.current + octaves * OCTAVE_W);
  }, [scrollTo]);

  const zoomBy = useCallback((delta: number) => {
    setZoom(prev => {
      const next = Math.max(0.4, Math.min(prev + delta, 2.5));
      zoomRef.current = next;
      return next;
    });
  }, []);

  const releasePointerNote = useCallback((pointerId: number) => {
    const ni = activePointers.current.get(pointerId);
    if (ni === undefined) return;
    releaseNote(pointerId);
    const k = NOTE_INDEX_MAP.get(ni);
    if (k) releaseKey(k.noteId);
    activePointers.current.delete(pointerId);
  }, [releaseKey]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    pointerPositions.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointerPositions.current.size >= 2) {
      // Second finger → enter pinch mode, release any playing note
      releasePointerNote(e.pointerId);
      for (const pid of [...activePointers.current.keys()]) releasePointerNote(pid);
      lastPinchDist.current = null;
      return;
    }

    const key = getHitNote(e.clientX, e.clientY);
    if (!key) return;
    attackNote(key.noteIndex, key.frequency, e.pointerId);
    activePointers.current.set(e.pointerId, key.noteIndex);
    pressKey(key.noteId);
  }, [getHitNote, pressKey, releasePointerNote]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    pointerPositions.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointerPositions.current.size >= 2) {
      // Pinch zoom
      const pts = [...pointerPositions.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDist.current !== null) {
        zoomBy((dist - lastPinchDist.current) / 320);
      }
      lastPinchDist.current = dist;
      return;
    }

    const curIndex = activePointers.current.get(e.pointerId);
    if (curIndex === undefined) return;
    const key = getHitNote(e.clientX, e.clientY);
    if (!key || key.noteIndex === curIndex) return;
    const oldKey = NOTE_INDEX_MAP.get(curIndex);
    attackNote(key.noteIndex, key.frequency, e.pointerId);
    activePointers.current.set(e.pointerId, key.noteIndex);
    if (oldKey) releaseKey(oldKey.noteId);
    pressKey(key.noteId);
  }, [getHitNote, pressKey, releaseKey, zoomBy, releasePointerNote]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointerPositions.current.delete(e.pointerId);
    if (pointerPositions.current.size < 2) lastPinchDist.current = null;
    releasePointerNote(e.pointerId);
  }, [releasePointerNote]);

  const sortedKeys = useMemo(() => [
    ...ALL_KEYS.filter(k => k.variant === 'white'),
    ...ALL_KEYS.filter(k => k.variant === 'black'),
    ...ALL_KEYS.filter(k => k.variant === 'gray'),
  ], []);

  return (
    <div>
      {/* Octave strip + zoom — always visible above keys */}
      <OctaveStrip
        scrollLeft={scrollLeft}
        zoom={zoom}
        containerWidth={containerW}
        onScrollTo={scrollTo}
        onScrollBy={scrollBy}
        onZoomBy={zoomBy}
      />

      {/* Touch-capture keyboard area */}
      <div
        ref={containerRef}
        style={{
          position: 'relative', width: '100%', height: WHITE_H,
          overflow: 'hidden', touchAction: 'none',
          background: '#0a0a12', cursor: 'crosshair',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Edge fades */}
        <div style={{ position:'absolute',left:0,top:0,width:16,height:'100%',background:'linear-gradient(to right,#0a0a12,transparent)',zIndex:10,pointerEvents:'none'}} />
        <div style={{ position:'absolute',right:0,top:0,width:16,height:'100%',background:'linear-gradient(to left,#0a0a12,transparent)',zIndex:10,pointerEvents:'none'}} />

        {/* Keys layer — transform: scaleX(zoom) translateX(-scrollLeft) applied R→L */}
        <div style={{
          position: 'absolute', left: 0, top: 0,
          width: TOTAL_W, height: WHITE_H,
          transform: `scaleX(${zoom}) translateX(${-scrollLeft}px)`,
          transformOrigin: '0 0',
        }}>
          {sortedKeys.map(key => (
            <PianoKey
              key={key.noteId}
              noteId={key.noteId}
              variant={key.variant}
              absLeft={key.absLeft}
              layout={OCTAVE_LAYOUTS[key.stepInOctave]}
              label={key.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: 'transparent', color: '#aaa',
  border: '1px solid #2a2a3e', borderRadius: 4,
  padding: '2px 10px', fontSize: 12, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  flexShrink: 0,
};
