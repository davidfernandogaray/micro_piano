export const WHITE_W  = 60;
export const BLACK_W  = 42;
export const GRAY_W   = 26;
export const WHITE_H  = 250;   // taller keys → ~75% of landscape height
export const BLACK_H  = 165;
export const GRAY_H   = 132;
export const OCTAVE_W = 7 * WHITE_W; // 420

export type KeyVariant = 'white' | 'black' | 'gray';

export interface KeyLayout {
  left: number;
  width: number;
  height: number;
  zIndex: number;
}

// WHITE_W=60  BLACK_W=42  BLACK_W/2=21
// White: C=0 D=60 E=120 F=180 G=240 A=300 B=360
// Black: C#=39 D#=99 F#=219 G#=279 A#=339
// Centers: C=30 C#=60 D=90 D#=120 E=150 F=210 F#=240 G=270 G#=300 A=330 A#=360 B=390 nextC=450
// Gray midpoint = avg of adjacent semitone centers; GRAY_W/2=13
// B½ special: centered at octave boundary (420), left=407 – extends 13px into next octave visually

export const OCTAVE_LAYOUTS: KeyLayout[] = [
  { left: 0,   width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 0  C
  { left: 32,  width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 1  C½   (30+60)/2=45→32
  { left: 39,  width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 2  C#
  { left: 62,  width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 3  C#½  (60+90)/2=75→62
  { left: 60,  width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 4  D
  { left: 92,  width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 5  D½   (90+120)/2=105→92
  { left: 99,  width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 6  D#
  { left: 122, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 7  D#½  (120+150)/2=135→122
  { left: 120, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 8  E
  { left: 167, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 9  E½   (150+210)/2=180→167
  { left: 180, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 10 F
  { left: 212, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 11 F½   (210+240)/2=225→212
  { left: 219, width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 12 F#
  { left: 242, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 13 F#½  (240+270)/2=255→242
  { left: 240, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 14 G
  { left: 272, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 15 G½   (270+300)/2=285→272
  { left: 279, width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 16 G#
  { left: 302, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 17 G#½  (300+330)/2=315→302
  { left: 300, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 18 A
  { left: 332, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 19 A½   (330+360)/2=345→332
  { left: 339, width: BLACK_W, height: BLACK_H, zIndex: 2 }, // 20 A#
  { left: 362, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 21 A#½  (360+390)/2=375→362
  { left: 360, width: WHITE_W, height: WHITE_H, zIndex: 1 }, // 22 B
  // B½: centered at octave boundary; left=OCTAVE_W-GRAY_W/2=407 (extends 13px into next C)
  { left: 407, width: GRAY_W,  height: GRAY_H,  zIndex: 3 }, // 23 B½
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
