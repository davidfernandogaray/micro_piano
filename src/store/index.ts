import { create } from 'zustand';

interface AppState {
  activeNoteIds: Set<string>;
  pressKey: (noteId: string) => void;
  releaseKey: (noteId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeNoteIds: new Set(),
  pressKey: (noteId) =>
    set((s) => { const n = new Set(s.activeNoteIds); n.add(noteId); return { activeNoteIds: n }; }),
  releaseKey: (noteId) =>
    set((s) => { const n = new Set(s.activeNoteIds); n.delete(noteId); return { activeNoteIds: n }; }),
}));
