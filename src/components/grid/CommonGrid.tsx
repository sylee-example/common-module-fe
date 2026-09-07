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
import { COMMON_EXCEL_STYLES, withExcelCellClass, type ExcelColDef } from '../../lib/excelExport';
import { handleEditNavigation } from './gridEditNavigation';

// v33+ 는 모듈 등록이 필수. 모듈 로드 시 1회만 실행된다.
ModuleRegistry.registerModules([AllCommunityModule]);

export interface CommonGridProps<TData> extends AgGridReactProps<TData> {
  rowData: TData[];
  /** excelType 으로 엑셀 값 종류를 직접 지정할 수 있다 (생략 시 자동 추론) */
  columnDefs: ExcelColDef<TData>[];
  /** 그리드 높이. number면 px */
  height?: number | string;
  /**
   * 컬럼 최소 너비(px). 컬럼이 적으면 flex로 화면을 꽉 채우고,
   * 많으면 이 값까지만 줄어든 뒤 가로 스크롤이 생긴다.
   */
  columnMinWidth?: number;
  /** 지정하면 컬럼 너비/순서/정렬 상태를 zustand에 저장하고 복원 */
  stateKey?: string;
  /**
   * 엑셀 내보내기 서식을 끈다.
   * 기본은 켜짐 — 컬럼에 excel-* cellClass 를 붙이고 공통 스타일 팔레트를 등록한다.
   */
  disableExcelStyles?: boolean;
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
  disableExcelStyles = false,
  excelStyles,
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

  // 엑셀 서식은 ExcelStyle.id 와 cellClass 매칭으로 걸리므로 컬럼에 클래스를 붙여 둔다.
  // 화면용 CSS 가 없는 클래스라 표시에는 영향이 없다.
  const mergedColumnDefs = useMemo(
    () => (disableExcelStyles ? columnDefs : withExcelCellClass(columnDefs, rowData[0])),
    // 첫 행은 타입 추론에만 쓴다. 행 내용이 바뀌어도 다시 계산할 필요가 없다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnDefs, disableExcelStyles],
  );

  // excelStyles 는 그리드 생성 시점에만 적용된다(@initial). 사용처가 준 스타일을 뒤에 붙여 덮어쓸 수 있게 한다
  const mergedExcelStyles = useMemo(
    () => (disableExcelStyles ? excelStyles : [...COMMON_EXCEL_STYLES, ...(excelStyles ?? [])]),
    [disableExcelStyles, excelStyles],
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
        columnDefs={mergedColumnDefs}
        defaultColDef={mergedDefaultColDef}
        excelStyles={mergedExcelStyles}
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
