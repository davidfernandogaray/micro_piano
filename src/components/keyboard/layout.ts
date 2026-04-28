export const WHITE_W  = 66;
export const BLACK_W  = 46;
export const GRAY_W   = 29;   // narrower than black but touchable
export const WHITE_H  = 220;
export const BLACK_H  = 155;
export const GRAY_H   = 79;
export const OCTAVE_W = 7 * WHITE_W; // 462

export type KeyVariant = 'white' | 'black' | 'gray';

export interface KeyLayout {
  left: number;
  width: number;
  height: number;
  zIndex: number;
}

// WHITE_W=66  BLACK_W=46  GRAY_W=29 (GRAY_W/2=14.5)
// White centers: C=33 D=99 E=165 F=231 G=297 A=363 B=429
// Black centers: C#=66 D#=132 F#=264 G#=330 A#=396
// Gray left = midpoint_between_adjacent_semitones - GRAY_W/2
// B+: left = OCTAVE_W - GRAY_W/2 = 462-14 = 448

export const OCTAVE_LAYOUTS: KeyLayout[] = [
  { left: 0,   width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 0  C
  { left: 36,  width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 1  C+   (33+66)/2=49.5 → 36
  { left: 43,  width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 2  C#
  { left: 69,  width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 3  C#+  (66+99)/2=82.5 → 69
  { left: 66,  width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 4  D
  { left: 102, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 5  D+   (99+132)/2=115.5 → 102
  { left: 109, width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 6  D#
  { left: 135, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 7  D#+  (132+165)/2=148.5 → 135
  { left: 132, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 8  E
  { left: 184, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 9  E+   (165+231)/2=198 → 184
  { left: 198, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 10 F
  { left: 234, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 11 F+   (231+264)/2=247.5 → 234
  { left: 241, width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 12 F#
  { left: 267, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 13 F#+  (264+297)/2=280.5 → 267
  { left: 264, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 14 G
  { left: 300, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 15 G+   (297+330)/2=313.5 → 300
  { left: 307, width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 16 G#
  { left: 333, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 17 G#+  (330+363)/2=346.5 → 333
  { left: 330, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 18 A
  { left: 366, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 19 A+   (363+396)/2=379.5 → 366
  { left: 373, width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 20 A#
  { left: 399, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 21 A#+  (396+429)/2=412.5 → 399
  { left: 396, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 22 B
  // B+: left = OCTAVE_W - GRAY_W/2 = 462 - 14 = 448
  { left: 448, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 23 B+
];

const GRAY_STEPS  = [1,3,5,7,9,11,13,15,17,19,21,23];
const BLACK_STEPS = [2,6,12,16,20];
const WHITE_STEPS = [0,4,8,10,14,18,22];

export function hitTestOctave(xInOctave: number, y: number): number {
  if (y < GRAY_H) {
    for (const s of GRAY_STEPS) {
      const l = OCTAVE_LAYOUTS[s];
      if (xInOctave >= l.left && xInOctave < l.left + l.width) return s;
    }
  }
  if (y < BLACK_H) {
    for (const s of BLACK_STEPS) {
      const l = OCTAVE_LAYOUTS[s];
      if (xInOctave >= l.left && xInOctave < l.left + l.width) return s;
    }
  }
  for (const s of WHITE_STEPS) {
    const l = OCTAVE_LAYOUTS[s];
    if (xInOctave >= l.left && xInOctave < l.left + l.width) return s;
  }
  return -1;
}

export interface KeyInfo {
  noteId: string;
  noteIndex: number;
  frequency: number;
  variant: KeyVariant;
  stepInOctave: number;
  octave: number;
  label: string;
  absLeft: number;
}
