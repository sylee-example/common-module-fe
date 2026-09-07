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

## 예제 실행

```bash
npm run example   # http://localhost:5173
```

`example/main.tsx` 에 fullRow 편집, SelectCellEditor, SearchCellEditor, 컬럼 너비 동작이 모두 들어 있다.
