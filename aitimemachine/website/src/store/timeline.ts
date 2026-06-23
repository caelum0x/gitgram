import { create } from 'zustand';

interface Checkpoint {
  id: string;
  description: string;
  timestamp: string;
  files: any[];
}

interface TimelineStore {
  checkpoints: Checkpoint[];
  currentIndex: number;
  loading: boolean;
  setCheckpoints: (checkpoints: Checkpoint[]) => void;
  goTo: (index: number) => void;
  setLoading: (loading: boolean) => void;
}

export const useTimeline = create<TimelineStore>((set) => ({
  checkpoints: [],
  currentIndex: 0,
  loading: false,
  setCheckpoints: (checkpoints) => set({ checkpoints }),
  goTo: (index) => set({ currentIndex: index }),
  setLoading: (loading) => set({ loading })
}));
