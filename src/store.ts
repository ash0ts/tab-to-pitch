import { create } from 'zustand';
export type AppMode = 'play' | 'understand' | 'practice';
export type LabelMode = 'pitch' | 'hybrid' | 'fret';
interface WorkspaceState {
  mode: AppMode;
  labelMode: LabelMode;
  speed: number;
  trackIndex: number;
  selectedNoteId: string | null;
  loopStart: number;
  loopEnd: number;
  looping: boolean;
  setMode(mode: AppMode): void;
  setLabels(labelMode: LabelMode): void;
  setSpeed(speed: number): void;
  setTrack(trackIndex: number): void;
  selectNote(selectedNoteId: string | null): void;
  setLoop(loopStart: number, loopEnd: number, looping: boolean): void;
}
export const useWorkspace = create<WorkspaceState>((set) => ({
  mode: 'play',
  labelMode: 'hybrid',
  speed: 0.75,
  trackIndex: 0,
  selectedNoteId: null,
  loopStart: 0,
  loopEnd: 1,
  looping: false,
  setMode: (mode) => set({ mode }),
  setLabels: (labelMode) => set({ labelMode }),
  setSpeed: (speed) => set({ speed }),
  setTrack: (trackIndex) => set({ trackIndex, selectedNoteId: null }),
  selectNote: (selectedNoteId) => set({ selectedNoteId }),
  setLoop: (loopStart, loopEnd, looping) => set({ loopStart, loopEnd, looping }),
}));
