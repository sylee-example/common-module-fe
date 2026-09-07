import type {
  ColDef,
  Column,
  ColumnWidthCallbackParams,
  ExcelStyle,
  GridApi,
} from 'ag-grid-community';

/** 엑셀에 넣을 때 구분하는 값 종류 */
export type ExcelValueType = 'string' | 'number' | 'decimal' | 'date' | 'datetime';

/**
 * 공통 엑셀 스타일 팔레트.
 *
 * `ExcelStyle.id` 는 CSS cell class 와 매칭된다. 컬럼에 같은 이름의 cellClass 가 붙어야 서식이 적용된다.
 * `excelStyles` 는 그리드 생성 시점에만 지정할 수 있어(@initial) 런타임에 서식을 새로 만들 수 없다.
 * 팔레트 밖 서식이 필요하면 CommonGrid 에 excelStyles 를 추가로 넘기고 컬럼 스펙의 styleId 로 지정한다.
 */
export const COMMON_EXCEL_STYLES: ExcelStyle[] = [
  { id: 'excel-string', alignment: { horizontal: 'Left' }, dataType: 'String' },
  // dataType 이 없으면 엑셀에서 문자열이 되어 합계·정렬이 되지 않는다
  {
    id: 'excel-number',
    alignment: { horizontal: 'Right' },
    dataType: 'Number',
    numberFormat: { format: '#,##0' },
  },
  {
    id: 'excel-decimal',
    alignment: { horizontal: 'Right' },
    dataType: 'Number',
    numberFormat: { format: '#,##0.00' },
  },
  {
    id: 'excel-date',
    alignment: { horizontal: 'Center' },
    dataType: 'DateTime',
    numberFormat: { format: 'yyyy-mm-dd' },
  },
  {
    id: 'excel-datetime',
    alignment: { horizontal: 'Center' },
    dataType: 'DateTime',
    numberFormat: { format: 'yyyy-mm-dd hh:mm' },
  },
  // 'header' 는 AG Grid 가 헤더 셀에 쓰는 예약 id 다
  { id: 'header', font: { bold: true }, interior: { color: '#F2F2F2', pattern: 'Solid' } },
];

const STYLE_ID_BY_TYPE: Record<ExcelValueType, string> = {
  string: 'excel-string',
  number: 'excel-number',
  decimal: 'excel-decimal',
  date: 'excel-date',
  datetime: 'excel-datetime',
};

/** 값 종류에 대응하는 팔레트 스타일 id (= 컬럼에 붙일 cellClass) */
export function excelStyleIdFor(type: ExcelValueType): string {
  return STYLE_ID_BY_TYPE[type];
}

/** 내보내기에서 항상 빼는 컬럼. 숨김 컬럼은 getAllDisplayedColumns 가 이미 걸러 준다 */
export const EXCLUDED_EXCEL_COL_IDS = new Set(['ag-Grid-SelectionColumn', 'ag-Grid-AutoColumn']);

/** AG Grid cellDataType -> 엑셀 값 종류 */
const TYPE_BY_CELL_DATA_TYPE: Record<string, ExcelValueType> = {
  text: 'string',
  number: 'number',
  date: 'date',
  dateString: 'date',
  boolean: 'string',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export interface ResolveExcelTypeInput {
  /** 호출자가 직접 지정한 값 종류 */
  explicit?: ExcelValueType;
  /** colDef.cellDataType. boolean 은 자동추론 on/off 스위치라 타입 정보가 아니다 */
  cellDataType?: boolean | string;
  /** 추론에 쓸 실제 값 하나 */
  sample?: unknown;
}

/**
 * 컬럼의 엑셀 값 종류를 정한다.
 * 명시값 -> colDef.cellDataType -> 실제 값 추론 -> string 순으로 떨어진다.
 */
export function resolveExcelType({
  explicit,
  cellDataType,
  sample,
}: ResolveExcelTypeInput): ExcelValueType {
  if (explicit) return explicit;

  if (typeof cellDataType === 'string') {
    const mapped = TYPE_BY_CELL_DATA_TYPE[cellDataType];
    if (mapped) return mapped;
  }

  if (typeof sample === 'number') return 'number';
  if (sample instanceof Date) return 'date';

  if (typeof sample === 'string') {
    if (ISO_DATETIME.test(sample)) return 'datetime';
    if (ISO_DATE.test(sample)) return 'date';
    // 숫자처럼 생긴 문자열은 문자열로 둔다. 사번·우편번호의 앞자리 0 이 사라지면 안 된다
  }

  return 'string';
}

/** 엑셀이 수식으로 해석하는 시작 문자 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * 수식 인젝션을 막는다.
 *
 * `=cmd|...` 같은 값이 그대로 들어가면 파일을 여는 사람 PC 에서 실행될 수 있다.
 * 문자열만 손대고 숫자·날짜는 그대로 둔다 (건드리면 셀 서식이 문자열로 깨진다).
 */
export function sanitizeExcelValue<T>(value: T): T | string {
  if (typeof value !== 'string' || !FORMULA_PREFIX.test(value)) return value;
  return `'${value}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `재고목록_20260907_1305.xlsx` 형태로 파일명을 만든다 */
export function buildExcelFileName(sheetName: string, at: Date = new Date()): string {
  const base = sheetName.replace(/\.xlsx$/i, '');
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `_${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `${base}_${stamp}.xlsx`;
}

/** 내보낼 컬럼 지정. 문자열만 주면 나머지는 그리드에서 알아서 읽는다 */
export interface ExcelColumnSpec {
  colId: string;
  /** 생략 시 그리드 헤더명 */
  header?: string;
  type?: ExcelValueType;
  /** 팔레트 밖 서식이 필요할 때 직접 등록한 ExcelStyle 의 id */
  styleId?: string;
  width?: number;
}

export interface ExportExcelOptions {
  /** 생략 시 `${sheetName}_YYYYMMDD_HHmm.xlsx` */
  fileName?: string;
  sheetName?: string;
  /** 생략 시 화면에 보이는 컬럼 전부. 문자열과 스펙을 섞어 줘도 된다 */
  columns?: (string | ExcelColumnSpec)[];
  /** 기본 'filteredAndSorted' (화면에 걸린 필터·정렬을 반영) */
  rows?: 'all' | 'filteredAndSorted';
  onlySelected?: boolean;
  /** 기본 true */
  freezeHeader?: boolean;
}

function toSpec(entry: string | ExcelColumnSpec): ExcelColumnSpec {
  return typeof entry === 'string' ? { colId: entry } : entry;
}

/** 화면에 보이는 컬럼에서 체크박스·그룹 컬럼을 뺀 목록 (순서 유지) */
export function getExportableColumns<TData>(api: GridApi<TData>): Column[] {
  return api
    .getAllDisplayedColumns()
    .filter((column) => !EXCLUDED_EXCEL_COL_IDS.has(column.getColId()));
}

/** 컬럼 값 하나를 뽑아 타입 추론에 쓴다. 전체를 훑지 않고 앞쪽 몇 건만 본다 */
function findSampleValue<TData>(api: GridApi<TData>, column: Column): unknown {
  const limit = Math.min(api.getDisplayedRowCount(), 20);
  for (let i = 0; i < limit; i++) {
    const node = api.getDisplayedRowAtIndex(i);
    if (!node) continue;
    const value = api.getCellValue({ rowNode: node, colKey: column });
    if (value != null && value !== '') return value;
  }
  return undefined;
}

export interface ResolvedExcelColumn {
  colId: string;
  header?: string;
  type: ExcelValueType;
  styleId: string;
  width?: number;
}

/**
 * 내보낼 컬럼을 확정한다.
 * columns 를 주면 그 순서대로, 주지 않으면 화면 컬럼 순서대로.
 */
export function resolveExcelColumns<TData>(
  api: GridApi<TData>,
  columns?: (string | ExcelColumnSpec)[],
): ResolvedExcelColumn[] {
  const displayed = getExportableColumns(api);
  const byId = new Map(displayed.map((column) => [column.getColId(), column]));

  const specs = columns?.length
    ? columns.map(toSpec)
    : displayed.map((column) => ({ colId: column.getColId() }) as ExcelColumnSpec);

  const resolved: ResolvedExcelColumn[] = [];

  for (const spec of specs) {
    if (EXCLUDED_EXCEL_COL_IDS.has(spec.colId)) continue;

    const column = byId.get(spec.colId);
    // 화면에 없는 컬럼(숨김·오타)은 조용히 건너뛴다. 엑셀에 빈 열이 생기는 것보다 낫다
    if (!column) continue;

    // context.excelType 도 존중해야 cellClass 와 내보내기 타입이 어긋나지 않는다
    const colDef = column.getColDef();
    const type = resolveExcelType({
      explicit: spec.type ?? excelTypeOf(colDef),
      cellDataType: colDef.cellDataType,
      sample: findSampleValue(api, column),
    });

    resolved.push({
      colId: spec.colId,
      header: spec.header,
      type,
      styleId: spec.styleId ?? excelStyleIdFor(type),
      width: spec.width,
    });
  }

  return resolved;
}

/**
 * 그리드를 엑셀로 내려받는다.
 *
 * AG Grid Enterprise 의 ExcelExportModule 등록이 필요하다. 등록하지 않아도 api.exportDataAsExcel
 * 자체는 존재하므로(예외도 나지 않는다) 여기서 미리 걸러낼 방법이 없다. 대신 AG Grid 가
 * "error #200 ... ExcelExportModule is not registered" 를 콘솔에 남기고 아무 일도 하지 않는다.
 */
export function exportGridToExcel<TData>(
  api: GridApi<TData>,
  options: ExportExcelOptions = {},
): void {
  const { sheetName = '데이터', rows = 'filteredAndSorted', onlySelected = false } = options;
  const freezeHeader = options.freezeHeader ?? true;

  const resolved = resolveExcelColumns(api, options.columns);
  const headerByColId = new Map(
    resolved.filter((column) => column.header).map((column) => [column.colId, column.header!]),
  );
  const widthByColId = new Map(
    resolved.filter((column) => column.width).map((column) => [column.colId, column.width!]),
  );

  api.exportDataAsExcel({
    fileName: options.fileName ?? buildExcelFileName(sheetName),
    sheetName,
    columnKeys: resolved.map((column) => column.colId),
    exportedRows: rows,
    onlySelected,
    freezeRows: freezeHeader ? 'headers' : undefined,
    freezeColumns: 'pinned',
    // 켜면 '=' 로 시작하는 셀이 수식으로 실행된다. 기본값이지만 명시해 둔다
    autoConvertFormulas: false,
    // 지정한 너비가 하나도 없으면 옵션을 빼서 AG Grid 기본 동작(화면 너비)에 맡긴다.
    // 콜백은 number 를 반드시 반환해야 해서 undefined 로 "기본값"을 표현할 수 없다
    ...(widthByColId.size
      ? {
          columnWidth: (params: ColumnWidthCallbackParams) => {
            const column = params.column;
            if (!column) return 75;
            return widthByColId.get(column.getColId()) ?? column.getActualWidth();
          },
        }
      : {}),
    processHeaderCallback: (params) => {
      const colId = params.column.getColId();
      return headerByColId.get(colId) ?? params.api.getDisplayNameForColumn(params.column, null);
    },
    processCellCallback: (params) => sanitizeExcelValue(params.value) as string,
  });
}

/** colDef.context 에 넣는 엑셀 설정. AG Grid 는 모르는 colDef 속성에 경고를 낸다 */
export interface ExcelColContext {
  excelType?: ExcelValueType;
}

/**
 * ColDef 에 얹어 쓰는 확장. 자동 추론이 틀릴 때만 지정하면 된다.
 *
 * AG Grid 가 colDef 속성을 검증해 모르는 키에 경고를 내므로, 설정은 context 안에 넣는다
 * (AG Grid 가 안내하는 방식이다).
 */
export interface ExcelColDef<TData> extends ColDef<TData> {
  context?: ExcelColContext & Record<string, unknown>;
}

/** colDef.context 에서 엑셀 값 종류를 읽는다 */
function excelTypeOf<TData>(colDef: ColDef<TData>): ExcelValueType | undefined {
  return (colDef.context as ExcelColContext | undefined)?.excelType;
}

function mergeCellClass(
  existing: ColDef['cellClass'],
  added: string,
): ColDef['cellClass'] {
  if (existing == null) return added;
  // 함수는 사용처 로직이라 건드리지 않는다
  if (typeof existing === 'function') return existing;
  return Array.isArray(existing) ? [...existing, added] : [existing, added];
}

/**
 * 컬럼마다 엑셀 서식용 cellClass 를 붙인다.
 *
 * `ExcelStyle.id` 가 cellClass 와 매칭되는 구조라, 이게 붙어 있어야 정렬·콤마 서식이 적용된다.
 * `excel-*` 클래스에 대응하는 CSS 는 없으므로 화면 표시에는 영향이 없다.
 * 원본 배열은 그대로 두고 새 배열을 돌려준다.
 */
export function withExcelCellClass<TData>(
  columnDefs: ExcelColDef<TData>[],
  sampleRow?: TData,
): ExcelColDef<TData>[] {
  return columnDefs.map((colDef) => {
    const { field } = colDef;
    // field 가 없는 컬럼(체크박스 등)은 내보낼 값이 없다
    if (!field) return colDef;

    const type = resolveExcelType({
      explicit: excelTypeOf(colDef),
      cellDataType: colDef.cellDataType,
      sample: sampleRow ? (sampleRow as Record<string, unknown>)[field as string] : undefined,
    });

    return { ...colDef, cellClass: mergeCellClass(colDef.cellClass, excelStyleIdFor(type)) };
  });
}
