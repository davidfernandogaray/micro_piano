import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { attackNote, releaseNote, releaseAll } from '../../audio/engine';
import { noteFrequency, STEPS_PER_OCTAVE } from '../../audio/tuning';
import { useAppStore } from '../../store';

// ── Wicki-Hayden layout ───────────────────────────────────────────────────────
// Right (+1 col): +2 semitones = +4 steps
// Up   (+1 row): +7 semitones = +14 steps (perfect fifth)
// This matches the real Lumatone Wicki-Hayden layout exactly.

const COLS = 10;
const ROWS = 5;
const DX   = 4;   // noteIndex steps per column
const DY   = 14;  // noteIndex steps per row

// C4 (noteIndex = 96) centered at col=4, row=2
const BASE = 4 * STEPS_PER_OCTAVE - 4 * DX - 2 * DY; // 52 → D2 at bottom-left

// Blue palette per pitch class (0=C … 11=B)
const PC_COLOR = [
  '#ddeeff', // C  - near white-blue (landmark)
  '#1565c0', // C# - dark blue
  '#90caf9', // D  - light blue
  '#0d47a1', // D# - dark navy
  '#64b5f6', // E  - medium-light blue
  '#42a5f5', // F  - medium blue
  '#1a237e', // F# - very dark navy
  '#2196f3', // G  - standard blue
  '#1976d2', // G# - medium-dark blue
  '#bbdefb', // A  - very light blue
  '#0d47a1', // A# - dark navy
  '#90caf9', // B  - light blue
];

// Light-background pitch classes → dark text; others → light text
const DARK_TEXT = new Set([0, 2, 4, 9, 11]);

const PC_LABEL = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

interface HexData {
  col: number; row: number;
  cx: number; cy: number;
  noteIndex: number;
  noteId: string;
  frequency: number;
  pc: number;       // pitch class 0-11
  label: string;   // e.g. "C4"
}

function buildGrid(R: number): { hexes: HexData[]; vw: number; vh: number } {
  const HW = Math.sqrt(3) * R;   // pointy-top hex width = √3·R
  const colStep = HW;            // center-to-center horizontal
  const rowStep = 1.5 * R;       // center-to-center vertical
  const oddShift = HW / 2;       // odd rows shift right
  const pad = R;
  const vw = COLS * colStep + oddShift + pad;
  const vh = (ROWS - 1) * rowStep + 2 * R;

  const hexes: HexData[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = pad / 2 + col * colStep + (row % 2 === 1 ? oddShift : 0);
      const cy = vh - R - row * rowStep;
      const ni = BASE + col * DX + row * DY;
      if (ni < 0) continue;
      const step = ni % STEPS_PER_OCTAVE;
      const pc   = step / 2;                          // always even → integer
      const oct  = Math.floor(ni / STEPS_PER_OCTAVE);
      hexes.push({
        col, row, cx, cy,
        noteIndex: ni,
        noteId: `luma_${ni}`,
        frequency: noteFrequency(ni),
        pc, label: `${PC_LABEL[pc]}${oct}`,
      });
    }
  }
  return { hexes, vw, vh };
}

function polyPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6; // pointy-top (-30° start)
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function LumaKeyboard() {
  const svgRef         = useRef<SVGSVGElement>(null);
  const wrapRef        = useRef<HTMLDivElement>(null);
  const [R, setR]      = useState(28);
  const pointers       = useRef(new Map<number, number>()); // pid → noteIndex
  const activeNoteIds  = useAppStore(s => s.activeNoteIds);
  const { pressKey, releaseKey } = useAppStore();

  // Release all notes on unmount (e.g. user switches to piano keyboard)
  useEffect(() => () => { releaseAll(); }, []);

  // Make hex size responsive to the container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const rW = width  / ((COLS + 0.5) * Math.sqrt(3) + 1);
      const rH = height / (ROWS * 1.5 + 1);
      setR(Math.max(16, Math.min(rW, rH, 40)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { hexes, vw, vh } = useMemo(() => buildGrid(R), [R]);
  const niMap = useMemo(() => new Map(hexes.map(h => [h.noteIndex, h])), [hexes]);

  // Convert client coords → SVG logical coords using the SVG transform matrix
  const toSvg = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt  = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }, []);

  const hitTest = useCallback((cx: number, cy: number): HexData | null => {
    const { x, y } = toSvg(cx, cy);
    let best: HexData | null = null;
    let bestD = R * 1.15; // slightly beyond circumradius for clean tiling
    for (const h of hexes) {
      const d = Math.hypot(x - h.cx, y - h.cy);
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }, [hexes, R, toSvg]);

  const releasePtr = useCallback((pid: number) => {
    const ni = pointers.current.get(pid);
    if (ni === undefined) return;
    releaseNote(pid);
    const h = niMap.get(ni);
    if (h) releaseKey(h.noteId);
    pointers.current.delete(pid);
  }, [releaseKey, niMap]);

  const handleDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    const h = hitTest(e.clientX, e.clientY);
    if (!h) return;
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    attackNote(h.noteIndex, h.frequency, e.pointerId);
    pointers.current.set(e.pointerId, h.noteIndex);
    pressKey(h.noteId);
  }, [hitTest, pressKey]);

  const handleMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const curNI = pointers.current.get(e.pointerId);
    if (curNI === undefined) return;
    const h = hitTest(e.clientX, e.clientY);
    if (!h || h.noteIndex === curNI) return;
    const old = niMap.get(curNI);
    attackNote(h.noteIndex, h.frequency, e.pointerId);
    pointers.current.set(e.pointerId, h.noteIndex);
    if (old) releaseKey(old.noteId);
    pressKey(h.noteId);
  }, [hitTest, pressKey, releaseKey, niMap]);

  const handleUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    releasePtr(e.pointerId);
  }, [releasePtr]);

  return (
    <div ref={wrapRef} style={{
      flex: 1, minHeight: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#06060f', overflow: 'hidden',
    }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        <rect width={vw} height={vh} fill="#06060f" />

        {hexes.map(h => {
          const active = activeNoteIds.has(h.noteId);
          const fill   = active ? '#40c4ff' : PC_COLOR[h.pc];
          const stroke = active ? '#82d8ff' : '#0a0a1a';
          const tColor = active ? '#003555' : (DARK_TEXT.has(h.pc) ? '#0d1b2a' : '#e3f2fd');
          const r      = R - 1.5;

          return (
            <g key={h.noteId}>
              <polygon
                points={polyPoints(h.cx, h.cy, r)}
                fill={fill}
                stroke={stroke}
                strokeWidth={active ? 2 : 1}
              />
              {/* Glow ring when active */}
              {active && (
                <polygon
                  points={polyPoints(h.cx, h.cy, r + 3)}
                  fill="none"
                  stroke="#40c4ff"
                  strokeWidth={2}
                  opacity={0.4}
                />
              )}
              <text
                x={h.cx} y={h.cy + 0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={R * 0.26}
                fontFamily="system-ui, sans-serif"
                fontWeight="bold"
                fill={tColor}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {h.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
