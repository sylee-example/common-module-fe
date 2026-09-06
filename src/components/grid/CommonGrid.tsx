import { useCallback, useMemo, useRef } from 'react';
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
} from 'ag-grid-community';
import { AG_GRID_LOCALE_KR } from '@ag-grid-community/locale';
import { AgGridReact, type AgGridReactProps } from 'ag-grid-react';
import { useGridStore } from '../../store/gridStore';

// v33+ 는 모듈 등록이 필수. 모듈 로드 시 1회만 실행된다.
ModuleRegistry.registerModules([AllCommunityModule]);

export interface CommonGridProps<TData> extends AgGridReactProps<TData> {
  rowData: TData[];
  columnDefs: ColDef<TData>[];
  /** 그리드 높이. number면 px */
  height?: number | string;
  /** 지정하면 컬럼 너비/순서/정렬 상태를 zustand에 저장하고 복원 */
  stateKey?: string;
}

// ColDef로 타입을 박으면 field가 string으로 넓어져 제네릭 ColDef<TData>와 충돌한다
const baseDefaultColDef = {
  sortable: true,
  resizable: true,
  filter: true,
  minWidth: 100,
  flex: 1,
};

export function CommonGrid<TData>({
  rowData,
  columnDefs,
  height = 480,
  stateKey,
  defaultColDef,
  onGridReady,
  pagination = true,
  paginationPageSize = 50,
  ...rest
}: CommonGridProps<TData>) {
  const apiRef = useRef<GridApi<TData> | null>(null);
  const savedState = useGridStore((s) => (stateKey ? s.columnStates[stateKey] : undefined));
  const setColumnState = useGridStore((s) => s.setColumnState);

  const mergedDefaultColDef = useMemo<ColDef<TData>>(
    () => ({ ...baseDefaultColDef, ...defaultColDef }),
    [defaultColDef],
  );

  const handleGridReady = useCallback(
    (event: GridReadyEvent<TData>) => {
      apiRef.current = event.api;
      if (savedState?.length) {
        event.api.applyColumnState({ state: savedState, applyOrder: true });
      }
      onGridReady?.(event);
    },
    // savedState는 최초 복원에만 쓰므로 의존성에서 제외 (재적용 시 사용자 조작을 되돌린다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onGridReady],
  );

  const persistColumnState = useCallback(() => {
    if (!stateKey || !apiRef.current) return;
    setColumnState(stateKey, apiRef.current.getColumnState());
  }, [stateKey, setColumnState]);

  return (
    <div style={{ height, width: '100%' }}>
      <AgGridReact<TData>
        theme={themeQuartz}
        localeText={AG_GRID_LOCALE_KR}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={mergedDefaultColDef}
        pagination={pagination}
        paginationPageSize={paginationPageSize}
        animateRows
        onGridReady={handleGridReady}
        onColumnMoved={persistColumnState}
        onColumnResized={persistColumnState}
        onSortChanged={persistColumnState}
        overlayNoRowsTemplate="<span>데이터가 없습니다.</span>"
        {...rest}
      />
    </div>
  );
}
