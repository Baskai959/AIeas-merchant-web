import { create } from 'zustand';

export interface QueryStatusState {
  pendingRequestCount: number;
  beginRequest: () => void;
  endRequest: () => void;
}

export const useQueryStore = create<QueryStatusState>((set) => ({
  pendingRequestCount: 0,
  beginRequest() {
    set((state) => ({
      pendingRequestCount: state.pendingRequestCount + 1,
    }));
  },
  endRequest() {
    set((state) => ({
      pendingRequestCount: Math.max(0, state.pendingRequestCount - 1),
    }));
  },
}));
