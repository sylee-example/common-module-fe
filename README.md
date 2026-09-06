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
