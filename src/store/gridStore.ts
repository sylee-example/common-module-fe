import type { ColumnState } from 'ag-grid-community';
import { create } from 'zustand';

interface GridStoreState {
  /** stateKey 별 컬럼 상태 (너비/순서/정렬) */
  columnStates: Record<string, ColumnState[]>;
  setColumnState: (key: string, state: ColumnState[]) => void;
  resetColumnState: (key: string) => void;
}

// ponytail: 메모리 저장만 한다. 새로고침 후에도 유지하려면 zustand/middleware의 persist를 감쌀 것.
export const useGridStore = create<GridStoreState>((set) => ({
  columnStates: {},
  setColumnState: (key, state) =>
    set((prev) => ({ columnStates: { ...prev.columnStates, [key]: state } })),
  resetColumnState: (key) =>
    set((prev) => {
      const next = { ...prev.columnStates };
      delete next[key];
      return { columnStates: next };
    }),
}));
