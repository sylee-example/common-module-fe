# @company/react-common-module

사내 React 프로젝트 공통 모듈. React 18 + antd + AG Grid + Zustand + TanStack Query + Axios.

## 설치

소비 프로젝트 루트에 `.npmrc` 추가:

```
@company:registry=https://nexus.your-company.com/repository/npm-group/
//nexus.your-company.com/repository/npm-group/:_authToken=${NPM_AUTH_TOKEN}
```

```bash
npm i @company/react-common-module
# peerDependencies 는 소비 프로젝트가 직접 설치한다 (중복 인스턴스 방지)
npm i react react-dom antd ag-grid-community ag-grid-react \
      @tanstack/react-query axios zustand react-hook-form @hookform/resolvers zod
```

## 앱 진입점

```tsx
import { ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { QueryProvider, createHttp } from '@company/react-common-module';

export const http = createHttp({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  getToken: () => localStorage.getItem('accessToken'),
  onUnauthorized: () => { location.href = '/login'; },
});

export function App() {
  return (
    <ConfigProvider locale={koKR}>
      <QueryProvider>
        <Routes />
      </QueryProvider>
    </ConfigProvider>
  );
}
```

## CommonGrid

```tsx
import { CommonGrid } from '@company/react-common-module';
import type { ColDef } from 'ag-grid-community';

interface User { id: number; name: string; email: string; }

const columnDefs: ColDef<User>[] = [
  { field: 'id', headerName: '번호', maxWidth: 100 },
  { field: 'name', headerName: '이름' },
  { field: 'email', headerName: '이메일', flex: 2 },
];

<CommonGrid<User>
  rowData={users}
  columnDefs={columnDefs}
  height={520}
  stateKey="user-list"   // 컬럼 너비/순서/정렬을 zustand에 저장·복원
  loading={isLoading}
  onRowClicked={(e) => console.log(e.data)}
/>
```

기본 적용: Quartz 테마, 한국어 로케일, 정렬·필터·리사이즈 on, 페이지네이션 50건.
`AgGridReactProps` 를 그대로 확장하므로 나머지 옵션은 props로 덮어쓰면 된다.

### 컬럼 너비

모든 컬럼에 `flex: 1` + `minWidth` 가 걸려 있다. AG Grid 는 flex 배분값을 `minWidth`/`maxWidth` 로
클램프하므로 별도 코드 없이 이렇게 동작한다.

- 컬럼이 적으면 → 늘어나서 브라우저 폭을 꽉 채운다
- 컬럼이 많으면 → `minWidth` 까지만 줄어들고, 다 못 그리면 가로 스크롤이 생긴다

최소 너비는 `columnMinWidth` 로 바꾼다 (기본 100).

```tsx
<CommonGrid columnMinWidth={140} ... />
```

특정 컬럼만 제외하려면 그 컬럼에 `flex: 0` 과 고정 `width` 를 준다.

## 그리드 인라인 편집 (fullRow)

`editType="fullRow"` 를 주면 행 단위 편집 + 방향키 네비게이션이 함께 켜진다.
읽기 전용 그리드에는 아무 영향이 없다.

```tsx
import { CommonGrid, SelectCellEditor, SearchCellEditor } from '@company/react-common-module';

const columnDefs: ColDef<Row>[] = [
  { field: 'name', headerName: '이름', editable: true },
  {
    field: 'role',
    headerName: '권한',
    editable: true,
    cellEditor: SelectCellEditor,
    cellEditorParams: {
      options: [
        { label: '관리자', value: 'ADMIN' },
        { label: '일반', value: 'USER' },
      ],
    },
  },
  {
    field: 'vendorCode',
    headerName: '거래처',
    editable: true,
    cellEditor: SearchCellEditor,
    cellEditorParams: {
      onSearch: async (keyword) => {
        const res = await http.get<ApiResponse<Vendor[]>>('/vendors', { params: { keyword } });
        return res.data.data.map((v) => ({ label: v.name, value: v.code }));
      },
      toLabel: (code) => vendorNameMap[code] ?? '',
    },
  },
];

<CommonGrid<Row>
  rowData={rows}
  columnDefs={columnDefs}
  editType="fullRow"
  onRowValueChanged={(e) => save(e.data)}
/>
```

### 방향키 규칙

편집 중에만 적용된다. 편집 중이 아니면 AG Grid 기본 셀 이동이 그대로 동작한다.

| 키 | 상황 | 동작 |
|---|---|---|
| ↑ | 최상위 행 | 막음 (헤더로 안 감) |
| ↑ | 그 외 | 편집 행을 위로 옮김 |
| ↓ | 마지막 행 | 막음 |
| ↓ | 그 외 | 편집 행을 아래로 옮김 |
| ↑ ↓ | select 드롭다운 열림 | 옵션 목록 이동 |
| ← → | 텍스트가 남아 있음 | input 안에서 캐럿 이동 |
| ← | 텍스트 맨 왼쪽 | 이전 칸으로 |
| → | 텍스트 끝 | 다음 칸으로 |
| ← → | 행의 첫/마지막 칸 | 막음 (그리드 밖으로 안 나감) |
| Enter Esc | select 드롭다운 열림 | 목록에서 선택/닫기 (편집은 유지) |

행 경계는 페이지네이션을 따른다. 현재 페이지의 첫/마지막 행에서 멈춘다.

좌/우는 현재 행 안에서만 움직인다. 행을 넘나드는 건 ↑/↓ 담당이고, 이때 편집 행이 포커스된 행으로 옮겨간다
(이전 행의 값은 커밋된다).

편집 중 ↑/↓/←/→ 4개 키를 가로챈다. Tab, PageUp/Down, Ctrl 조합 등은 AG Grid 기본 동작 그대로다.

Enter/Escape 는 **드롭다운이 열려 있을 때만** 가로챈다. AG Grid 가 Enter 를 먼저 잡으면 하이라이트된
옵션이 버려진 채 행 편집이 끝나버리기 때문이다. `preventDefault()` 로 AG Grid 만 막고
(`processKeyboardEvent` 가 `defaultPrevented` 를 보고 빠진다) antd 의 React 핸들러는 그대로 돌게 둔다.
드롭다운이 닫혀 있으면 Enter/Escape 는 평소대로 행 편집을 확정/취소한다.

### SelectCellEditor

`CommonSelect` 기반. 포커스가 들어온 셀의 드롭다운만 열린다 (fullRow 는 행의 모든 에디터가 동시에
마운트되므로 `defaultOpen` 을 쓰면 전부 열린다). AG Grid 는 셀 간 이동할 때만 `focusIn` 을 부르고
편집을 시작한 칸에는 부르지 않으므로, `cellStartedEdit` 을 보고 직접 연다.

```tsx
cellEditorParams: {
  options: [{ label: '관리자', value: 'ADMIN' }],
  selectProps: { allowClear: false },   // CommonSelect 옵션 그대로
}
```

### SearchCellEditor

비동기 자동완성 에디터. `onSearch` 만 주면 어디서든 재사용된다.

| 파라미터 | 기본값 | 설명 |
|---|---|---|
| `onSearch` | (필수) | `(keyword) => Promise<CommonSelectOption[]>` |
| `debounceMs` | `300` | 입력이 멈춘 뒤 조회까지 대기 |
| `minLength` | `1` | 조회를 시작할 최소 글자수 |
| `toLabel` | 값 그대로 | 셀 값 → 입력창 표시 텍스트 |
| `onError` | 없음 | 조회 실패 시 호출 (없으면 목록만 비움) |

- 늦게 도착한 이전 요청 결과는 폐기한다 (요청 시퀀스 비교)
- **목록에서 고른 항목만 커밋한다.** 자유 입력은 포커스가 빠질 때 되돌아간다 — 코드성 컬럼에 목록에 없는
  값이 들어가는 걸 막기 위함이다. 자유 입력을 허용해야 하면 이 에디터 대신 기본 텍스트 에디터를 쓸 것.

## CommonForm + FormField

검증은 zod 스키마 한 곳에서만 정의한다. antd `rules` 는 쓰지 않는다.

```tsx
import { z } from 'zod';
import { CommonForm, FormField, CommonInput, CommonSelect } from '@company/react-common-module';

const schema = z.object({
  name: z.string().min(1, '이름은 필수입니다'),
  email: z.string().email('이메일 형식이 아닙니다'),
  role: z.enum(['ADMIN', 'USER']),
  memo: z.string().max(200).optional(),
});
type FormValues = z.infer<typeof schema>;

<CommonForm<FormValues>
  schema={schema}
  defaultValues={{ name: '', email: '', role: 'USER' }}
  onSubmit={(values) => mutate(values)}
  submitText="저장"
  resetText="초기화"
>
  <FormField<FormValues> name="name" label="이름" required>
    <CommonInput placeholder="이름 입력" />
  </FormField>

  <FormField<FormValues> name="email" label="이메일" required>
    <CommonInput placeholder="user@company.com" />
  </FormField>

  <FormField<FormValues> name="role" label="권한">
    <CommonSelect options={[
      { label: '관리자', value: 'ADMIN' },
      { label: '일반', value: 'USER' },
    ]} />
  </FormField>

  <FormField<FormValues> name="memo" label="비고">
    <CommonInput type="textarea" />
  </FormField>
</CommonForm>
```

`children` 에 함수를 넘기면 `useForm` 반환값에 접근할 수 있다.

```tsx
<CommonForm schema={schema} onSubmit={save}>
  {({ watch }) => (watch('role') === 'ADMIN' ? <AdminFields /> : null)}
</CommonForm>
```

## CommonInput

`type` 하나로 antd Input 계열을 전환한다.

```tsx
<CommonInput />                       // Input (allowClear)
<CommonInput type="password" />       // Input.Password
<CommonInput type="textarea" />       // Input.TextArea (autoSize)
<CommonInput type="number" min={0} /> // InputNumber (width 100%)
```

## CommonSelect

```tsx
<CommonSelect
  options={[{ label: '서울', value: 'SEOUL' }, { label: '부산', value: 'BUSAN' }]}
  onChange={setCity}
/>
```

기본 적용: `showSearch`, `allowClear`, label 기준 검색, width 100%.

## CommonModal

`onOk` 가 Promise를 반환하면 완료까지 확인 버튼이 로딩된다.

```tsx
<CommonModal open={open} title="사용자 수정" onOk={async () => { await save(); setOpen(false); }} onCancel={() => setOpen(false)}>
  <UserForm />
</CommonModal>

// 삭제 확인
confirmModal({ title: '삭제하시겠습니까?', danger: true, onOk: () => remove(id) });
```

## HTTP / 에러 처리

응답 인터셉터가 모든 실패를 `ApiError` 로 정규화한다.

```tsx
import { isApiError, type ApiResponse } from '@company/react-common-module';

const { data } = useQuery({
  queryKey: ['users'],
  queryFn: async () => {
    const res = await http.get<ApiResponse<User[]>>('/users');
    return res.data.data;
  },
});

try { await http.post('/users', body); }
catch (e) { if (isApiError(e)) message.error(`[${e.code}] ${e.message}`); }
```

## 개발 / 배포

```bash
npm run typecheck   # 타입 검사
npm test            # vitest
npm run build       # dist/ 생성 (ESM + CJS + d.ts)
```

Nexus 배포:

```bash
export NPM_AUTH_TOKEN=...        # Nexus 사용자 토큰
npm version patch                # 0.1.0 -> 0.1.1
npm publish                      # publishConfig.registry 로 업로드
```

CI에서 배포할 때는 토큰을 시크릿으로 주입하고 `.npmrc` 는 커밋된 그대로 사용한다.

## 확장 지점

- 그리드 컬럼 상태는 메모리에만 남는다. 새로고침 후 유지가 필요하면 `gridStore` 를 `zustand/middleware` 의 `persist` 로 감쌀 것.
- AG Grid Enterprise 기능(그룹핑, 피벗)이 필요하면 `AllCommunityModule` 등록부에 엔터프라이즈 모듈과 라이선스 키를 추가.

## 엑셀 내보내기

AG Grid Enterprise 의 `ExcelExportModule` 등록이 필요하다 (선택적 peerDependency).

```tsx
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';

ModuleRegistry.registerModules([AllEnterpriseModule]);
```

`CommonGrid` 는 공통 스타일 팔레트를 자동 등록하고 컬럼마다 `excel-*` cellClass 를 붙인다
(대응하는 CSS 가 없어 화면 표시에는 영향이 없다). 사용처는 내보내기만 호출하면 된다.

```tsx
import { CommonGrid, exportGridToExcel } from '@company/react-common-module';

const apiRef = useRef<GridApi<Row> | null>(null);

<CommonGrid<Row>
  rowData={rows}
  columnDefs={columnDefs}
  onGridReady={(e) => { apiRef.current = e.api; }}
/>

<Button onClick={() => exportGridToExcel(apiRef.current!, { sheetName: '재고목록' })}>
  엑셀 다운로드
</Button>
```

기본 동작: 화면에 보이는 컬럼 순서 그대로, **체크박스·숨김 컬럼 제외**, 화면 필터·정렬 반영,
헤더 고정, 수식 자동 변환 off.

### 값 종류와 서식

| 종류 | 정렬 | 서식 | 엑셀 셀 타입 |
|---|---|---|---|
| `string` | 왼쪽 | — | String |
| `number` | 오른쪽 | `#,##0` | Number |
| `decimal` | 오른쪽 | `#,##0.00` | Number |
| `date` | 가운데 | `yyyy-mm-dd` | DateTime |
| `datetime` | 가운데 | `yyyy-mm-dd hh:mm` | DateTime |

종류는 `context.excelType` → `colDef.cellDataType` → 실제 값 추론 → `string` 순으로 정해진다.
대부분 자동으로 맞으므로 틀릴 때만 지정한다.

```tsx
const columnDefs: ExcelColDef<Row>[] = [
  { field: 'name', headerName: '거래처' },              // 자동: string
  { field: 'qty', headerName: '수량' },                 // 자동: number
  { field: 'price', headerName: '단가', context: { excelType: 'decimal' } },
  { field: 'regDate', headerName: '등록일' },           // '2026-09-07' -> date
];
```

설정을 `context` 안에 두는 이유: AG Grid 가 colDef 속성을 검증해 모르는 키에 경고를 낸다.
(`invalid colDef property ... use the 'colDef.context' property instead`)

숫자처럼 생긴 문자열(`'00123'`, `'010-1234-5678'`)은 **문자열로 유지**한다. 앞자리 0 이 사라지면 안 되기 때문.

### 컬럼 목록 지정

```tsx
// 문자열만
exportGridToExcel(api, { columns: ['name', 'qty'] });

// 스펙 혼용 (헤더명·타입·너비 재정의)
exportGridToExcel(api, {
  columns: ['name', { colId: 'qty', header: '출고수량', width: 120 }],
  rows: 'all',            // 기본 'filteredAndSorted'
  onlySelected: true,
});
```

화면에 없는 컬럼(숨김·오타)은 조용히 건너뛴다.

### 팔레트 밖 서식

`excelStyles` 는 그리드 생성 시점에만 적용되므로(`@initial`) 런타임에 서식을 만들 수 없다.
직접 등록한 뒤 `styleId` 로 지목한다.

```tsx
<CommonGrid excelStyles={[{ id: 'excel-won', alignment: { horizontal: 'Right' },
  dataType: 'Number', numberFormat: { format: '₩#,##0' } }]} ... />

exportGridToExcel(api, { columns: [{ colId: 'amount', styleId: 'excel-won' }] });
```

### 보안 — 수식 인젝션

`=`, `+`, `-`, `@`, 탭, 개행으로 시작하는 **문자열** 셀에 홑따옴표를 붙여 텍스트로 고정한다.
`=cmd|...` 같은 값이 파일을 여는 사람 PC 에서 실행되는 것을 막는다. 숫자·날짜는 손대지 않는다
(건드리면 셀 서식이 문자열로 깨진다).

`autoConvertFormulas` 는 항상 `false` 로 넘긴다. **켜지 말 것.**

## internStrings

`JSON.parse` 는 같은 값이 반복돼도 매번 새 문자열 객체를 만들고 V8 이 중복을 제거하지 않는다.
상태·부서·코드처럼 값 종류가 적은 컬럼이 많을수록 효과가 크다.

```tsx
import { internStrings } from '@company/react-common-module';

const rows = internStrings(res.data.data);   // 그리드에 넣기 전에 한 번
```

실측 (80,000행 x 30컬럼): **209MB → 54MB**, 162ms 소요.

행 객체를 제자리에서 고치고 같은 배열을 돌려준다. 중첩 객체는 건드리지 않는다.

> 대용량 그리드에서 한글 정렬에 `localeCompare(v, 'ko', {...})` 를 쓰지 말 것.
> 80,000행 정렬에 **1,980ms** 가 걸린다 (매 비교마다 Collator 를 새로 만든다).
> 로케일 정렬이 꼭 필요하면 `Intl.Collator` 를 모듈 레벨에 한 번 만들어 재사용한다 (134ms).
> AG Grid 기본 비교자는 34ms 이고, 한글은 코드포인트 순서가 이미 가나다순이라 대개 이걸로 충분하다.

## 예제 실행

```bash
npm run example   # http://localhost:5173
```

| 탭 | 내용 |
|---|---|
| fullRow 편집 + 엑셀 | 방향키 네비게이션, SelectCellEditor, SearchCellEditor, 엑셀 다운로드 4종, 컬럼 너비 |
| 80k 성능 테스트 | 행 수·인터닝을 바꿔 가며 생성/로드/정렬/엑셀 시간과 힙을 측정 |

엑셀은 Enterprise 모듈이 필요하다. 예제는 `ExcelExportModule` 만 등록하며, 라이선스 키가 없으면
trial 로 동작한다 (콘솔 경고 + 워터마크).

### 80,000행 x 30컬럼 실측 (Chrome, M4 Pro)

| 작업 | 시간 | 힙 |
|---|---|---|
| 데이터 생성 | 223 ms | 81 MB |
| `internStrings` | 123 ms | 93 MB |
| 그리드 로드 | 2,696 ms | 95 MB |
| 정렬 (숫자 컬럼) | 48 ms | 89 MB |
| 정렬 (문자열 컬럼) | 193 ms | 152 MB |
| 엑셀 다운로드 (5컬럼) | 1,451 ms | 322 MB |
| **엑셀 다운로드 (30컬럼)** | **8,496 ms** | **1,294 MB** |

> **80,000행 전체 컬럼 엑셀은 브라우저에서 8.5초간 완전히 멈추고 힙이 1.3GB 까지 치솟는다.**
> 전부 동기 작업이라 같은 탭에서 도는 다른 마이크로 프론트엔드도 함께 멈춘다.
> 내보내는 컬럼을 줄이면 거의 선형으로 줄어든다 (30컬럼 8.5초 -> 5컬럼 1.5초).
>
> 대응 순서: ① `columns` 로 꼭 필요한 컬럼만, ② `rows: 'filteredAndSorted'` 로 행 줄이기,
> ③ 그래도 부족하면 서버 생성. `ExportExcelOptions` 형태를 그대로 서버에 넘기면 되므로
> 사용처 코드는 바뀌지 않는다.
