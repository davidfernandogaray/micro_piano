import { create } from 'zustand';
import { INSTRUMENTS } from '../audio/instruments';

export interface MidiNote {
  id: string;
  noteIndex: number;
  startTick: number;     // ticks from start of clip
  durationTicks: number;
  velocity: number;      // 0–1
}

export interface MidiClip {
  id: string;
  startBar: number;
  lengthBars: number;
  notes: MidiNote[];
}

export interface MidiTrack {
  id: string;
  name: string;
  instrumentId: string;
  color: string;
  clips: MidiClip[];
  muted: boolean;
}

const TRACK_COLORS = [
  '#e05555','#e09955','#55c065','#55a0e0',
  '#9055e0','#e055b0','#55d0c8','#c8e055',
];

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function makeTrack(index: number): MidiTrack {
  return {
    id: uid(), name: `Track ${index + 1}`,
    instrumentId: INSTRUMENTS[index % INSTRUMENTS.length].id,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    clips: [], muted: false,
  };
}

export function makeClip(startBar: number, lengthBars = 2): MidiClip {
  return { id: uid(), startBar, lengthBars, notes: [] };
}

// ── Timing helpers ─────────────────────────────────────────────────────────────
export const TICKS_PER_BEAT = 192; // Tone.js default PPQ

export function getTicksPerBar(sig: string): number {
  const [num, den] = sig.split('/').map(Number);
  const ticksPerDenNote = Math.round(TICKS_PER_BEAT * 4 / den);
  return num * ticksPerDenNote;
}

// ── Store ──────────────────────────────────────────────────────────────────────
interface EditingClip { trackId: string; clipId: string }

interface MidiState {
  tracks: MidiTrack[];
  totalBars: number;
  bpm: number;
  timeSig: string;
  metronomeOn: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  playheadTick: number;
  editingClip: EditingClip | null;
  clipboard: MidiClip | null;
  selectedClipId: string | null;

  addTrack: () => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Pick<MidiTrack, 'name' | 'instrumentId' | 'muted' | 'color'>>) => void;
  addClip: (trackId: string, startBar: number) => void;
  deleteClip: (trackId: string, clipId: string) => void;
  updateClip: (trackId: string, clipId: string, patch: Partial<MidiClip>) => void;
  copyClip: (trackId: string, clipId: string) => void;
  pasteClip: (trackId: string, startBar: number) => void;
  setEditingClip: (v: EditingClip | null) => void;
  selectClip: (id: string | null) => void;
  setBpm: (v: number) => void;
  setTimeSig: (v: string) => void;
  setMetronome: (v: boolean) => void;
  setPlaying: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  setPlayheadTick: (v: number) => void;
  extendTimeline: () => void;
  moveTrack: (id: string, dir: 'up' | 'down') => void;
  updateNote: (trackId: string, clipId: string, noteId: string, patch: Partial<MidiNote>) => void;
}

export const useMidiStore = create<MidiState>((set, get) => ({
  tracks: [makeTrack(0), makeTrack(1)],
  totalBars: 16,
  bpm: 120,
  timeSig: '4/4',
  metronomeOn: false,
  isPlaying: false,
  isRecording: false,
  playheadTick: 0,
  editingClip: null,
  clipboard: null,
  selectedClipId: null,

  addTrack: () => set(s => ({ tracks: [...s.tracks, makeTrack(s.tracks.length)] })),

  removeTrack: (id) => set(s => ({
    tracks: s.tracks.filter(t => t.id !== id),
  })),

  updateTrack: (id, patch) => set(s => ({
    tracks: s.tracks.map(t => t.id === id ? { ...t, ...patch } : t),
  })),

  addClip: (trackId, startBar) => set(s => ({
    tracks: s.tracks.map(t => t.id !== trackId ? t : {
      ...t, clips: [...t.clips, makeClip(startBar)],
    }),
  })),

  deleteClip: (trackId, clipId) => set(s => ({
    tracks: s.tracks.map(t => t.id !== trackId ? t : {
      ...t, clips: t.clips.filter(c => c.id !== clipId),
    }),
    selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
  })),

  updateClip: (trackId, clipId, patch) => set(s => ({
    tracks: s.tracks.map(t => t.id !== trackId ? t : {
      ...t, clips: t.clips.map(c => c.id !== clipId ? c : { ...c, ...patch }),
    }),
  })),

  copyClip: (trackId, clipId) => {
    const track = get().tracks.find(t => t.id === trackId);
    const clip = track?.clips.find(c => c.id === clipId);
    if (clip) set({ clipboard: { ...clip, notes: clip.notes.map(n => ({ ...n })) } });
  },

  pasteClip: (trackId, startBar) => {
    const { clipboard } = get();
    if (!clipboard) return;
    set(s => ({
      tracks: s.tracks.map(t => t.id !== trackId ? t : {
        ...t, clips: [...t.clips, { ...clipboard, id: uid(), startBar,
          notes: clipboard.notes.map(n => ({ ...n, id: uid() })),
        }],
      }),
    }));
  },

  setEditingClip: (v) => set({ editingClip: v }),
  selectClip: (id) => set({ selectedClipId: id }),

  moveTrack: (id, dir) => set(s => {
    const idx = s.tracks.findIndex(t => t.id === id);
    if (dir === 'up' && idx <= 0) return {};
    if (dir === 'down' && idx >= s.tracks.length - 1) return {};
    const tracks = [...s.tracks];
    const j = dir === 'up' ? idx - 1 : idx + 1;
    [tracks[idx], tracks[j]] = [tracks[j], tracks[idx]];
    return { tracks };
  }),

  updateNote: (trackId, clipId, noteId, patch) => set(s => ({
    tracks: s.tracks.map(t => t.id !== trackId ? t : {
      ...t, clips: t.clips.map(c => c.id !== clipId ? c : {
        ...c, notes: c.notes.map(n => n.id !== noteId ? n : { ...n, ...patch }),
      }),
    }),
  })),
  setBpm: (bpm) => set({ bpm }),
  setTimeSig: (timeSig) => set({ timeSig }),
  setMetronome: (metronomeOn) => set({ metronomeOn }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setRecording: (isRecording) => set({ isRecording }),
  setPlayheadTick: (playheadTick) => set({ playheadTick }),
  extendTimeline: () => set(s => ({ totalBars: s.totalBars + 8 })),
}));
