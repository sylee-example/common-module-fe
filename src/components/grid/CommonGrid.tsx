import { useCallback, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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
import { handleEditNavigation } from './gridEditNavigation';

// v33+ 는 모듈 등록이 필수. 모듈 로드 시 1회만 실행된다.
ModuleRegistry.registerModules([AllCommunityModule]);

export interface CommonGridProps<TData> extends AgGridReactProps<TData> {
  rowData: TData[];
  columnDefs: ColDef<TData>[];
  /** 그리드 높이. number면 px */
  height?: number | string;
  /**
   * 컬럼 최소 너비(px). 컬럼이 적으면 flex로 화면을 꽉 채우고,
   * 많으면 이 값까지만 줄어든 뒤 가로 스크롤이 생긴다.
   */
  columnMinWidth?: number;
  /** 지정하면 컬럼 너비/순서/정렬 상태를 zustand에 저장하고 복원 */
  stateKey?: string;
}

// ColDef로 타입을 박으면 field가 string으로 넓어져 제네릭 ColDef<TData>와 충돌한다
const baseDefaultColDef = {
  sortable: true,
  resizable: true,
  filter: true,
  flex: 1,
};

export function CommonGrid<TData>({
  rowData,
  columnDefs,
  height = 480,
  columnMinWidth = 100,
  stateKey,
  defaultColDef,
  onGridReady,
  editType,
  pagination = true,
  paginationPageSize = 50,
  ...rest
}: CommonGridProps<TData>) {
  const apiRef = useRef<GridApi<TData> | null>(null);
  const savedState = useGridStore((s) => (stateKey ? s.columnStates[stateKey] : undefined));
  const setColumnState = useGridStore((s) => s.setColumnState);

  const mergedDefaultColDef = useMemo<ColDef<TData>>(
    () => ({ ...baseDefaultColDef, minWidth: columnMinWidth, ...defaultColDef }),
    [columnMinWidth, defaultColDef],
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

  // fullRow 편집일 때만 방향키를 가로챈다. 읽기 전용 그리드는 AG Grid 기본 동작 그대로다
  const handleKeyDownCapture = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (apiRef.current) handleEditNavigation(apiRef.current, event.nativeEvent);
  }, []);

  const persistColumnState = useCallback(() => {
    if (!stateKey || !apiRef.current) return;
    setColumnState(stateKey, apiRef.current.getColumnState());
  }, [stateKey, setColumnState]);

  return (
    <div
      style={{ height, width: '100%' }}
      onKeyDownCapture={editType === 'fullRow' ? handleKeyDownCapture : undefined}
    >
      <AgGridReact<TData>
        theme={themeQuartz}
        localeText={AG_GRID_LOCALE_KR}
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={mergedDefaultColDef}
        editType={editType}
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
