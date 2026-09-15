# AG Grid 33.2.1 그리드 옵션 가이드

AG Grid **v33.2.1 (React)** 기준 그리드 옵션 정리와 예제 모음.
표의 `E` 표시는 **Enterprise 전용** 옵션이다.

> 이 레포(`react-common-module`)에는 현재 `ag-grid-community@34.3.1` 이 설치돼 있다.
> v33 → v34 차이는 [맨 아래 섹션](#19-v33--v34-차이-요약)에 정리했다.

---

## 목차

1. [설치와 모듈 등록](#1-설치와-모듈-등록)
2. [최소 예제](#2-최소-예제)
3. [데이터 · 행 옵션](#3-데이터--행-옵션)
4. [컬럼 옵션](#4-컬럼-옵션)
5. [ColDef 주요 속성](#5-coldef-주요-속성)
6. [정렬](#6-정렬)
7. [필터](#7-필터)
8. [행 선택](#8-행-선택-v33-오브젝트-api)
9. [셀 편집](#9-셀-편집)
10. [페이지네이션](#10-페이지네이션)
11. [크기 · 레이아웃 · 스타일](#11-크기--레이아웃--스타일)
12. [테마 (v33 Theming API)](#12-테마-v33-theming-api)
13. [로케일 · 오버레이 · 기타](#13-로케일--오버레이--기타)
14. [이벤트와 Grid API](#14-이벤트와-grid-api)
15. [Enterprise 옵션](#15-enterprise-옵션)
16. [Row Model 종류](#16-row-model-종류)
17. [v32 → v33 마이그레이션 주의](#17-v32--v33-마이그레이션-주의)
18. [성능 팁](#18-성능-팁)
19. [v33 → v34 차이 요약](#19-v33--v34-차이-요약)

---

## 1. 설치와 모듈 등록

v33부터 **모듈 등록이 필수**다. 등록하지 않으면 런타임에 모듈 누락 에러가 난다.
또 `@ag-grid-community/*` 스코프 패키지는 v33에서 폐지되고 `ag-grid-community` 단일 패키지로 통합됐다.

```bash
npm i ag-grid-community@33.2.1 ag-grid-react@33.2.1
# Enterprise 사용 시
npm i ag-grid-enterprise@33.2.1
```

```tsx
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';

// 앱 진입점 또는 그리드 래퍼 모듈 최상단에서 1회만 실행
ModuleRegistry.registerModules([AllCommunityModule]);
```

Enterprise를 쓰면:

```tsx
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';

ModuleRegistry.registerModules([AllEnterpriseModule]);
LicenseManager.setLicenseKey('YOUR_LICENSE_KEY');
```

필요한 모듈만 골라 등록하면 번들이 줄어든다.

```tsx
import {
  ModuleRegistry,
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  PaginationModule,
  RowSelectionModule,
} from 'ag-grid-community';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  PaginationModule,
  RowSelectionModule,
]);
```

---

## 2. 최소 예제

```tsx
import { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';

interface Car {
  make: string;
  model: string;
  price: number;
}

export function CarGrid() {
  const [rowData] = useState<Car[]>([
    { make: 'Tesla', model: 'Model Y', price: 64950 },
    { make: 'Ford', model: 'F-Series', price: 33850 },
    { make: 'Toyota', model: 'Corolla', price: 29600 },
  ]);

  const columnDefs = useMemo<ColDef<Car>[]>(
    () => [
      { field: 'make', headerName: '제조사' },
      { field: 'model', headerName: '모델' },
      { field: 'price', headerName: '가격', type: 'numericColumn' },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({ sortable: true, filter: true, resizable: true, flex: 1, minWidth: 100 }),
    [],
  );

  return (
    <div style={{ height: 480 }}>
      <AgGridReact<Car>
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
      />
    </div>
  );
}
```

> **주의:** `columnDefs` / `defaultColDef` 를 인라인 객체로 넘기면 매 렌더마다 참조가 바뀌어 그리드가 재설정된다. 항상 `useMemo` 로 감싼다.

---

## 3. 데이터 · 행 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `rowData` | `TData[] \| null` | — | 클라이언트 사이드 행 데이터. `null` 이면 로딩 오버레이 표시 |
| `getRowId` | `(params) => string` | — | 행의 고유 ID. 지정하면 갱신 시 행을 재사용해 성능·상태 유지에 유리 |
| `rowModelType` | `'clientSide' \| 'infinite' \| 'viewport' \| 'serverSide'` | `'clientSide'` | 데이터 공급 방식 |
| `getRowHeight` | `(params) => number \| undefined \| null` | — | 행별 높이 동적 계산 |
| `rowHeight` | `number` | `42` | 고정 행 높이(px) |
| `getRowClass` / `rowClass` | `fn` / `string \| string[]` | — | 행 CSS 클래스 |
| `rowClassRules` | `{ [cls]: string \| fn }` | — | 조건부 행 클래스 |
| `getRowStyle` / `rowStyle` | `fn` / `object` | — | 행 인라인 스타일 |
| `pinnedTopRowData` / `pinnedBottomRowData` | `TData[]` | — | 상·하단 고정 행(합계 행 등) |
| `rowBuffer` | `number` | `10` | 화면 밖 렌더링 행 수 |
| `animateRows` | `boolean` | `true` | 정렬·필터 시 행 이동 애니메이션 |
| `suppressNoRowsOverlay` | `boolean` | `false` | 빈 데이터 오버레이 끄기 |

```tsx
<AgGridReact<Order>
  rowData={orders}
  getRowId={(params) => String(params.data.orderId)}
  rowHeight={40}
  rowClassRules={{
    // 취소 주문은 흐리게
    'row-cancelled': (params) => params.data?.status === 'CANCELLED',
    // 금액 100만 이상 강조
    'row-highlight': 'data.amount >= 1000000',
  }}
  pinnedBottomRowData={[{ orderId: 'TOTAL', amount: totalAmount }]}
/>
```

---

## 4. 컬럼 옵션

| 옵션 | 타입 | 설명 |
|---|---|---|
| `columnDefs` | `(ColDef \| ColGroupDef)[]` | 컬럼 정의 배열 |
| `defaultColDef` | `ColDef` | 모든 컬럼에 적용할 기본값 |
| `defaultColGroupDef` | `ColGroupDef` | 모든 컬럼 그룹 기본값 |
| `columnTypes` | `{ [type]: ColDef }` | 재사용 가능한 컬럼 타입 정의 |
| `autoSizeStrategy` | `object` | 최초 렌더 시 컬럼 너비 자동 조정 |
| `maintainColumnOrder` | `boolean` | `columnDefs` 갱신 시 사용자가 바꾼 컬럼 순서 유지 |
| `suppressMovableColumns` | `boolean` | 컬럼 드래그 이동 금지 |
| `suppressFieldDotNotation` | `boolean` | `field: 'a.b'` 의 점 표기 해석 끄기 |

```tsx
const columnTypes = useMemo(
  () => ({
    // 통화 컬럼 공통 설정
    currency: {
      type: 'numericColumn',
      valueFormatter: (p) => (p.value == null ? '' : `${p.value.toLocaleString()}원`),
      filter: 'agNumberColumnFilter',
    },
    // 날짜 컬럼 공통 설정
    date: {
      valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleDateString('ko-KR') : ''),
      filter: 'agDateColumnFilter',
    },
  }),
  [],
);

const columnDefs = useMemo<ColDef<Order>[]>(
  () => [
    { field: 'orderNo', headerName: '주문번호', pinned: 'left', width: 140 },
    { field: 'amount', headerName: '금액', type: 'currency' },
    { field: 'orderedAt', headerName: '주문일', type: 'date' },
  ],
  [],
);

<AgGridReact
  columnDefs={columnDefs}
  columnTypes={columnTypes}
  autoSizeStrategy={{ type: 'fitGridWidth', defaultMinWidth: 100 }}
/>;
```

`autoSizeStrategy` 종류:

```ts
{ type: 'fitGridWidth', defaultMinWidth: 100, columnLimits: [{ colId: 'name', minWidth: 200 }] }
{ type: 'fitProvidedWidth', width: 1200 }
{ type: 'fitCellContents', skipHeader: false, colIds: ['name', 'email'] }
```

---

## 5. ColDef 주요 속성

| 속성 | 타입 | 설명 |
|---|---|---|
| `field` | `string` | 데이터 필드명. 점 표기(`user.name`) 지원 |
| `colId` | `string` | 컬럼 식별자. 생략 시 `field` 사용 |
| `headerName` | `string` | 헤더 표시 텍스트 |
| `width` / `minWidth` / `maxWidth` | `number` | 너비(px) |
| `flex` | `number` | 남은 공간 비율 분배. `width` 보다 우선 |
| `hide` | `boolean` | 컬럼 숨김 |
| `pinned` | `'left' \| 'right' \| null` | 좌·우 고정 |
| `lockPosition` | `boolean \| 'left' \| 'right'` | 이동 불가 위치 고정 |
| `sortable` / `sort` / `sortIndex` | `boolean` / `'asc'\|'desc'` / `number` | 정렬 |
| `filter` | `boolean \| string \| Component` | 필터 종류 |
| `floatingFilter` | `boolean` | 헤더 아래 인라인 필터 |
| `editable` | `boolean \| fn` | 편집 가능 여부 |
| `cellEditor` / `cellEditorParams` | `string \| Component` / `object` | 에디터 |
| `cellRenderer` / `cellRendererParams` | `string \| Component` / `object` | 렌더러 |
| `valueGetter` | `(params) => any` | 계산 값 |
| `valueFormatter` | `(params) => string` | 표시용 포맷 |
| `valueSetter` / `valueParser` | `fn` | 편집 값 저장/파싱 |
| `cellClass` / `cellClassRules` / `cellStyle` | `string \| fn` / `object` / `object \| fn` | 셀 스타일 |
| `tooltipField` / `tooltipValueGetter` | `string` / `fn` | 툴팁 |
| `headerTooltip` | `string` | 헤더 툴팁 |
| `headerClass` | `string \| string[] \| fn` | 헤더 클래스 |
| `wrapText` / `autoHeight` | `boolean` | 줄바꿈 / 내용 높이 자동 |
| `suppressMovable` / `suppressSizeToFit` | `boolean` | 이동·자동맞춤 제외 |
| `type` | `string \| string[]` | `columnTypes` 적용 |
| `rowGroup` / `pivot` / `aggFunc` `E` | `boolean` / `boolean` / `string \| fn` | 그룹·피벗·집계 |

```tsx
const columnDefs = useMemo<ColDef<User>[]>(
  () => [
    {
      field: 'name',
      headerName: '이름',
      pinned: 'left',
      tooltipField: 'name',
      cellClassRules: { 'text-red-500': (p) => p.data?.blocked === true },
    },
    {
      // 성 + 이름 합성 컬럼
      colId: 'fullName',
      headerName: '전체 이름',
      valueGetter: (p) => `${p.data?.lastName ?? ''}${p.data?.firstName ?? ''}`,
    },
    {
      field: 'status',
      headerName: '상태',
      // 코드 → 한글 라벨
      valueFormatter: (p) => ({ A: '활성', I: '비활성' }[p.value as string] ?? p.value),
    },
    {
      field: 'memo',
      headerName: '메모',
      wrapText: true,
      autoHeight: true,
      minWidth: 240,
    },
  ],
  [],
);
```

컬럼 그룹(`ColGroupDef`):

```tsx
const columnDefs = [
  {
    headerName: '고객 정보',
    marryChildren: true, // 그룹 내 컬럼이 흩어지지 않게 고정
    children: [
      { field: 'customerName', headerName: '이름' },
      { field: 'customerTel', headerName: '연락처', columnGroupShow: 'open' }, // 그룹 펼칠 때만 표시
    ],
  },
];
```

---

## 6. 정렬

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `sortingOrder` | `('asc'\|'desc'\|null)[]` | `['asc','desc',null]` | 헤더 클릭 시 정렬 순환 순서 |
| `multiSortKey` | `'ctrl'` | — | 다중 정렬 보조키 |
| `alwaysMultiSort` | `boolean` | `false` | 키 없이도 항상 다중 정렬 |
| `accentedSort` | `boolean` | `false` | 악센트 문자 정렬 보정 |
| `postSortRows` | `(params) => void` | — | 정렬 후 행 순서 후처리 |
| `unSortIcon` (ColDef) | `boolean` | `false` | 정렬 안 된 컬럼에도 아이콘 표시 |

```tsx
<AgGridReact
  defaultColDef={{ sortable: true }}
  multiSortKey="ctrl"
  columnDefs={[
    { field: 'dept', sort: 'asc', sortIndex: 0 },
    { field: 'name', sort: 'asc', sortIndex: 1 },
    // 커스텀 비교자 — 한글 가나다순
    { field: 'title', comparator: (a, b) => String(a).localeCompare(String(b), 'ko') },
  ]}
/>
```

---

## 7. 필터

내장 필터: `agTextColumnFilter`, `agNumberColumnFilter`, `agDateColumnFilter`, `agSetColumnFilter`(E), `agMultiColumnFilter`(E).

| 옵션 | 타입 | 설명 |
|---|---|---|
| `quickFilterText` | `string` | 전체 컬럼 대상 빠른 검색 |
| `cacheQuickFilter` | `boolean` | 빠른 검색 캐시(대용량에서 유리) |
| `isExternalFilterPresent` / `doesExternalFilterPass` | `fn` | 외부 필터 연동 |
| `excludeChildrenWhenTreeDataFiltering` | `boolean` | 트리 데이터 필터 범위 |
| `suppressMenuHide` | `boolean` | 필터 메뉴 아이콘 항상 표시 |

```tsx
const [quickFilter, setQuickFilter] = useState('');

<Input value={quickFilter} onChange={(e) => setQuickFilter(e.target.value)} />
<AgGridReact
  quickFilterText={quickFilter}
  cacheQuickFilter
  defaultColDef={{ filter: true, floatingFilter: true }}
  columnDefs={[
    {
      field: 'price',
      filter: 'agNumberColumnFilter',
      filterParams: { buttons: ['reset', 'apply'], closeOnApply: true },
    },
    {
      field: 'orderedAt',
      filter: 'agDateColumnFilter',
      filterParams: {
        comparator: (filterDate: Date, cellValue: string) => {
          const cell = new Date(cellValue);
          if (cell < filterDate) return -1;
          if (cell > filterDate) return 1;
          return 0;
        },
      },
    },
  ]}
/>;
```

외부 필터 예:

```tsx
const [onlyActive, setOnlyActive] = useState(false);
const gridRef = useRef<AgGridReact<User>>(null);

// 체크박스 바뀔 때 그리드에 필터 재평가 요청
useEffect(() => {
  gridRef.current?.api.onFilterChanged();
}, [onlyActive]);

<AgGridReact
  ref={gridRef}
  isExternalFilterPresent={() => onlyActive}
  doesExternalFilterPass={(node) => node.data?.status === 'A'}
/>;
```

필터 상태 저장/복원:

```tsx
const model = api.getFilterModel();
api.setFilterModel(model);
```

---

## 8. 행 선택 (v33 오브젝트 API)

v32.2부터 `rowSelection` 이 **오브젝트 형태**로 바뀌었다. v33에서 기존 문자열 형태(`'single'`/`'multiple'`)와 `checkboxSelection`, `suppressRowClickSelection`, `rowMultiSelectWithClick` 등은 **deprecated** 다.

| 속성 | 값 | 설명 |
|---|---|---|
| `mode` | `'singleRow' \| 'multiRow'` | 단일 / 다중 선택 |
| `checkboxes` | `boolean \| fn` | 선택 체크박스 표시 |
| `headerCheckbox` | `boolean` | 헤더 전체 선택 체크박스 |
| `enableClickSelection` | `boolean \| 'enableDeselection'` | 행 클릭으로 선택 |
| `enableSelectionWithoutKeys` | `boolean` | Ctrl 없이 다중 선택 |
| `groupSelects` `E` | `'self' \| 'descendants' \| 'filteredDescendants'` | 그룹 선택 전파 |
| `isRowSelectable` | `(node) => boolean` | 선택 가능 행 제한 |
| `copySelectedRows` | `boolean` | 복사 시 선택 행 대상 |

```tsx
<AgGridReact<User>
  rowSelection={{
    mode: 'multiRow',
    checkboxes: true,
    headerCheckbox: true,
    enableClickSelection: false,
    // 탈퇴 회원은 선택 불가
    isRowSelectable: (node) => node.data?.status !== 'WITHDRAWN',
  }}
  onSelectionChanged={(e) => setSelected(e.api.getSelectedRows())}
/>
```

관련 API:

```ts
api.getSelectedRows();      // TData[]
api.getSelectedNodes();     // IRowNode[]
api.selectAll();
api.deselectAll();
api.setNodesSelected({ nodes, newValue: true });
```

---

## 9. 셀 편집

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `editType` | `'fullRow' \| undefined` | — | 행 단위 편집 |
| `singleClickEdit` | `boolean` | `false` | 한 번 클릭으로 편집 시작 |
| `suppressClickEdit` | `boolean` | `false` | 클릭 편집 금지(API로만 편집) |
| `stopEditingWhenCellsLoseFocus` | `boolean` | `false` | 포커스 잃으면 편집 종료 |
| `enterNavigatesVertically` | `boolean` | `false` | Enter 로 아래 셀 이동 |
| `enterNavigatesVerticallyAfterEdit` | `boolean` | `false` | 편집 완료 후 아래 셀로 |
| `undoRedoCellEditing` | `boolean` | `false` | 편집 실행 취소 |
| `undoRedoCellEditingLimit` | `number` | `10` | 취소 스택 크기 |
| `readOnlyEdit` | `boolean` | `false` | 그리드가 값을 직접 바꾸지 않음(외부 상태 관리용) |

내장 에디터: `agTextCellEditor`, `agLargeTextCellEditor`, `agSelectCellEditor`, `agNumberCellEditor`, `agDateCellEditor`, `agDateStringCellEditor`, `agCheckboxCellEditor`, `agRichSelectCellEditor`(E).

```tsx
<AgGridReact<Product>
  singleClickEdit
  stopEditingWhenCellsLoseFocus
  undoRedoCellEditing
  undoRedoCellEditingLimit={20}
  columnDefs={[
    { field: 'name', editable: true, cellEditor: 'agTextCellEditor' },
    {
      field: 'category',
      editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['의류', '식품', '가전'] },
    },
    {
      field: 'stock',
      editable: (p) => p.data?.status !== 'DISCONTINUED', // 단종 상품은 편집 불가
      cellEditor: 'agNumberCellEditor',
      cellEditorParams: { min: 0, max: 9999, precision: 0 },
    },
    {
      field: 'description',
      editable: true,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      cellEditorParams: { maxLength: 500, rows: 6 },
    },
  ]}
  onCellValueChanged={(e) => {
    // 변경된 행만 서버에 저장
    saveProduct(e.data);
  }}
/>
```

`readOnlyEdit` 로 외부 상태(zustand 등)에 위임:

```tsx
<AgGridReact
  readOnlyEdit
  onCellEditRequest={(e) => {
    const next = rows.map((r) => (r.id === e.data.id ? { ...r, [e.colDef.field!]: e.newValue } : r));
    setRows(next);
  }}
/>
```

---

## 10. 페이지네이션

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `pagination` | `boolean` | `false` | 페이지네이션 사용 |
| `paginationPageSize` | `number` | `100` | 페이지당 행 수 |
| `paginationPageSizeSelector` | `number[] \| boolean` | `[20,50,100]` | 페이지 크기 선택기 |
| `paginationAutoPageSize` | `boolean` | `false` | 높이에 맞춰 자동 계산 |
| `suppressPaginationPanel` | `boolean` | `false` | 기본 페이저 UI 숨김(커스텀 페이저 사용 시) |

```tsx
<AgGridReact
  pagination
  paginationPageSize={50}
  paginationPageSizeSelector={[20, 50, 100, 200]}
  onPaginationChanged={(e) => console.log(e.api.paginationGetCurrentPage())}
/>
```

```ts
api.paginationGoToPage(2);
api.paginationGoToNextPage();
api.paginationGetTotalPages();
api.paginationSetPageSize(100);
```

---

## 11. 크기 · 레이아웃 · 스타일

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `domLayout` | `'normal' \| 'autoHeight' \| 'print'` | `'normal'` | 레이아웃 방식 |
| `headerHeight` | `number` | 테마 값 | 헤더 높이 |
| `groupHeaderHeight` / `floatingFiltersHeight` | `number` | — | 그룹 헤더 / 플로팅 필터 높이 |
| `suppressHorizontalScroll` | `boolean` | `false` | 가로 스크롤 숨김 |
| `alwaysShowVerticalScroll` | `boolean` | `false` | 세로 스크롤 항상 표시 |
| `suppressColumnVirtualisation` | `boolean` | `false` | 컬럼 가상화 끄기(테스트·자동 너비용) |
| `suppressRowVirtualisation` | `boolean` | `false` | 행 가상화 끄기(성능 주의) |
| `enableCellTextSelection` | `boolean` | `false` | 셀 텍스트 드래그 선택 |
| `suppressCellFocus` | `boolean` | `false` | 셀 포커스 테두리 제거 |
| `tooltipShowDelay` / `tooltipHideDelay` | `number` | `2000` / `10000` | 툴팁 지연(ms) |

`domLayout='normal'` 이면 **부모 요소에 명시적 높이**가 있어야 한다.

```tsx
// 고정 높이
<div style={{ height: 600 }}>
  <AgGridReact {...props} />
</div>

// 내용만큼 늘어나는 높이 (행이 많으면 사용 금지 — 가상화가 꺼진다)
<AgGridReact domLayout="autoHeight" {...props} />
```

---

## 12. 테마 (v33 Theming API)

v33부터 **Theming API 가 기본**이다. `theme` 옵션으로 지정하며, CSS 파일 임포트가 필요 없다.

```tsx
import { themeQuartz, themeBalham, themeAlpine, colorSchemeDark } from 'ag-grid-community';

// 파라미터 커스터마이즈
const myTheme = themeQuartz.withParams({
  accentColor: '#1677ff',       // antd primary 와 맞춤
  fontFamily: 'Pretendard, sans-serif',
  fontSize: 13,
  headerHeight: 40,
  rowHeight: 38,
  borderRadius: 4,
  headerBackgroundColor: '#fafafa',
  oddRowBackgroundColor: '#fcfcfc',
});

// 다크 모드
const myDarkTheme = themeQuartz.withPart(colorSchemeDark);

<AgGridReact theme={myTheme} {...props} />;
```

**기존 CSS 테마(legacy)를 계속 쓰려면** `theme="legacy"` 를 명시하고 CSS를 직접 임포트해야 한다. 안 그러면 "Theming API and CSS File Themes cannot be used together" 에러가 난다.

```tsx
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

<div className="ag-theme-quartz" style={{ height: 600 }}>
  <AgGridReact theme="legacy" {...props} />
</div>;
```

---

## 13. 로케일 · 오버레이 · 기타

| 옵션 | 타입 | 설명 |
|---|---|---|
| `localeText` | `{ [key]: string }` | UI 문구 번역 |
| `loading` | `boolean` | 로딩 오버레이 수동 제어 |
| `loadingOverlayComponent` / `noRowsOverlayComponent` | `Component` | 커스텀 오버레이 |
| `overlayLoadingTemplate` / `overlayNoRowsTemplate` | `string` | HTML 템플릿 오버레이 |
| `suppressContextMenu` | `boolean` | 우클릭 메뉴 끄기 |
| `preventDefaultOnContextMenu` | `boolean` | 브라우저 기본 메뉴 차단 |
| `copyHeadersToClipboard` | `boolean` | 복사 시 헤더 포함 |
| `clipboardDelimiter` | `string` | 복사 구분자(기본 탭) |
| `getLocaleText` | `(params) => string` | 동적 번역 |

```tsx
import { AG_GRID_LOCALE_KR } from '@ag-grid-community/locale';

<AgGridReact
  localeText={AG_GRID_LOCALE_KR}
  loading={isFetching}
  overlayNoRowsTemplate="<span>조회된 데이터가 없습니다.</span>"
/>;
```

---

## 14. 이벤트와 Grid API

자주 쓰는 이벤트:

| 이벤트 | 설명 |
|---|---|
| `onGridReady` | 그리드 초기화 완료. `event.api` 보관 |
| `onFirstDataRendered` | 첫 데이터 렌더 완료. 자동 너비 조정 시점 |
| `onRowClicked` / `onRowDoubleClicked` | 행 클릭 |
| `onCellClicked` / `onCellDoubleClicked` | 셀 클릭 |
| `onCellValueChanged` | 셀 값 변경 |
| `onSelectionChanged` | 선택 변경 |
| `onSortChanged` / `onFilterChanged` | 정렬·필터 변경 |
| `onColumnResized` / `onColumnMoved` / `onColumnVisible` | 컬럼 상태 변경 |
| `onPaginationChanged` | 페이지 변경 |
| `onGridSizeChanged` | 그리드 크기 변경 |
| `onRowDataUpdated` | 행 데이터 갱신 완료 |

```tsx
const gridRef = useRef<AgGridReact<Order>>(null);

<AgGridReact<Order>
  ref={gridRef}
  onGridReady={(e: GridReadyEvent<Order>) => {
    // 저장된 컬럼 상태 복원
    const saved = loadColumnState();
    if (saved) e.api.applyColumnState({ state: saved, applyOrder: true });
  }}
  onFirstDataRendered={(e) => e.api.sizeColumnsToFit()}
  onColumnResized={(e) => {
    if (e.finished) saveColumnState(e.api.getColumnState());
  }}
/>;
```

자주 쓰는 API (v31부터 `columnApi` 는 폐지, 전부 `api` 에 통합):

```ts
// 데이터
api.setGridOption('rowData', rows);
api.applyTransaction({ add: [newRow], update: [changed], remove: [old] });
api.refreshCells({ force: true, rowNodes: [node] });
api.redrawRows();

// 컬럼
api.getColumnState();
api.applyColumnState({ state, applyOrder: true });
api.setColumnsVisible(['memo'], false);
api.autoSizeAllColumns();
api.sizeColumnsToFit();

// 정렬·필터
api.getFilterModel();
api.setFilterModel(model);

// 이동·편집
api.ensureIndexVisible(100, 'middle');
api.startEditingCell({ rowIndex: 0, colKey: 'name' });
api.stopEditing();

// 내보내기
api.exportDataAsCsv({ fileName: '주문목록.csv' });
api.exportDataAsExcel({ fileName: '주문목록.xlsx' }); // Enterprise
```

`setGridOption` / `getGridOption` 으로 대부분의 옵션을 런타임에 변경할 수 있다.

```ts
api.setGridOption('quickFilterText', keyword);
api.setGridOption('pagination', false);
api.setGridOption('loading', true);
```

---

## 15. Enterprise 옵션

| 옵션 | 설명 |
|---|---|
| `sideBar` | 우측 컬럼/필터 툴 패널 |
| `statusBar` | 하단 상태 바(합계·선택 수) |
| `rowGroupPanelShow` | `'never' \| 'always' \| 'onlyWhenGrouping'` 그룹 드롭 영역 |
| `groupDisplayType` | `'singleColumn' \| 'multipleColumns' \| 'groupRows' \| 'custom'` |
| `autoGroupColumnDef` | 자동 생성되는 그룹 컬럼 정의 |
| `groupDefaultExpanded` | 기본 펼침 레벨(`-1` = 전부) |
| `suppressAggFuncInHeader` | 헤더에 집계 함수명 숨김 |
| `aggFuncs` | 커스텀 집계 함수 |
| `pivotMode` / `pivotPanelShow` | 피벗 |
| `treeData` / `getDataPath` | 트리 데이터 |
| `masterDetail` / `detailCellRendererParams` | 마스터-디테일 |
| `cellSelection` | 셀 범위 선택 (구 `enableRangeSelection`) |
| `enableCharts` | 통합 차트 |
| `excelStyles` | 엑셀 내보내기 서식 |
| `getContextMenuItems` | 우클릭 메뉴 커스터마이즈 |

```tsx
<AgGridReact<Sale>
  sideBar={{
    toolPanels: ['columns', 'filters'],
    defaultToolPanel: '',
  }}
  statusBar={{
    statusPanels: [
      { statusPanel: 'agTotalRowCountComponent', align: 'left' },
      { statusPanel: 'agSelectedRowCountComponent', align: 'left' },
      { statusPanel: 'agAggregationComponent', align: 'right' },
    ],
  }}
  rowGroupPanelShow="always"
  groupDisplayType="singleColumn"
  groupDefaultExpanded={1}
  autoGroupColumnDef={{ headerName: '분류', minWidth: 220, pinned: 'left' }}
  cellSelection={{ handle: { mode: 'fill' } }}
  columnDefs={[
    { field: 'region', headerName: '지역', rowGroup: true, hide: true },
    { field: 'product', headerName: '상품' },
    { field: 'amount', headerName: '금액', aggFunc: 'sum' },
  ]}
/>
```

---

## 16. Row Model 종류

| rowModelType | 용도 | 핵심 옵션 |
|---|---|---|
| `clientSide` (기본) | 전체 데이터를 브라우저에 로드. 수만 행까지 | `rowData` |
| `infinite` | 스크롤 시 블록 단위 로드 | `datasource`, `cacheBlockSize`, `maxBlocksInCache` |
| `serverSide` `E` | 서버에서 정렬·필터·그룹·집계 | `serverSideDatasource`, `cacheBlockSize`, `serverSideInfiniteScroll` |
| `viewport` `E` | 서버가 화면에 보이는 행만 푸시 | `viewportDatasource` |

Infinite Row Model 예:

```tsx
<AgGridReact
  rowModelType="infinite"
  cacheBlockSize={100}
  maxBlocksInCache={10}
  datasource={{
    getRows: async (params) => {
      const { startRow, endRow, sortModel, filterModel } = params;
      try {
        const res = await fetchOrders({ startRow, endRow, sortModel, filterModel });
        params.successCallback(res.rows, res.totalCount);
      } catch {
        params.failCallback();
      }
    },
  }}
/>
```

Server-Side Row Model 예 (Enterprise):

```tsx
<AgGridReact
  rowModelType="serverSide"
  cacheBlockSize={100}
  serverSideDatasource={{
    getRows: async (params) => {
      try {
        const res = await fetchOrders(params.request); // request 에 정렬/필터/그룹 정보 포함
        params.success({ rowData: res.rows, rowCount: res.totalCount });
      } catch {
        params.fail();
      }
    },
  }}
/>
```

---

## 17. v32 → v33 마이그레이션 주의

| 항목 | v32 | v33 |
|---|---|---|
| 패키지 | `@ag-grid-community/core` 등 스코프 패키지 | `ag-grid-community` 단일 패키지로 통합 |
| 모듈 등록 | 선택(패키지 방식은 불필요) | **필수** — `AllCommunityModule` 등록 |
| 테마 | CSS 파일 임포트 | Theming API 기본. CSS 테마는 `theme="legacy"` |
| 행 선택 | `rowSelection='multiple'`, `checkboxSelection` | `rowSelection={{ mode: 'multiRow', checkboxes: true }}` |
| 범위 선택 | `enableRangeSelection` | `cellSelection` |
| 컬럼 API | `columnApi` (v31에서 제거됨) | `api` 로 통합 |
| 다크 모드 | `ag-theme-*-dark` 클래스 | `colorSchemeDark` 파트 |

---

## 18. 성능 팁

- `columnDefs`, `defaultColDef`, `rowSelection`, `cellRendererParams` 등 **객체·배열 prop 은 반드시 `useMemo`**. 매 렌더 새 참조가 가면 그리드가 재설정된다.
- `getRowId` 지정 → 데이터 갱신 시 행 재생성 대신 갱신. 선택·스크롤·편집 상태가 유지된다.
- 전체 교체 대신 `api.applyTransaction({ add, update, remove })` 로 부분 갱신.
- 커스텀 `cellRenderer` 는 비용이 크다. 단순 표시는 `valueFormatter` 로 충분.
- `domLayout="autoHeight"` 는 행 가상화를 끈다. 행이 많으면 고정 높이 사용.
- 무거운 `valueGetter` 는 결과를 데이터에 미리 계산해 넣는 편이 빠르다.
- 대용량 + 빠른 검색은 `cacheQuickFilter` 를 켠다.
- 행이 수만 건을 넘으면 `serverSide` 또는 `infinite` row model 전환을 검토.

---

## 19. v33 → v34 차이 요약

이 레포는 `ag-grid-community@34.3.1` 을 쓴다. 위 내용 대부분 그대로 유효하고, 주요 차이는 다음과 같다.

- v33에서 deprecated 였던 항목 상당수가 v34에서 **제거**됐다. 특히 `rowSelection` 문자열 형태, `checkboxSelection`, `suppressRowClickSelection`, `enableRangeSelection` 은 오브젝트 API(`rowSelection={{ mode }}`, `cellSelection`)로 반드시 바꿔야 한다.
- Enterprise 모듈 이름이 `AllEnterpriseModule` 로 정리됐다.
- Theming API 가 더 굳어졌고 legacy CSS 테마 사용은 계속 비권장이다.
- Grid API 는 `setGridOption` / `getGridOption` 중심으로 유지된다.

이 레포의 `CommonGrid` (`src/components/grid/CommonGrid.tsx`) 는 v34 기준으로
`ModuleRegistry.registerModules([AllCommunityModule])`, `themeQuartz`, `AG_GRID_LOCALE_KR` 을 이미 적용해 두었다.

---

## 참고

- 공식 문서: <https://www.ag-grid.com/react-data-grid/>
- 그리드 옵션 전체 레퍼런스: <https://www.ag-grid.com/react-data-grid/grid-options/>
- ColDef 전체 레퍼런스: <https://www.ag-grid.com/react-data-grid/column-properties/>
- Grid API 레퍼런스: <https://www.ag-grid.com/react-data-grid/grid-api/>
- v33 마이그레이션 가이드: <https://www.ag-grid.com/react-data-grid/upgrading-to-ag-grid-33/>
