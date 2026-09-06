# 인증 상태 관리와 새 창(팝업) 처리

새 창을 열 때마다 로그인 체크가 반복되는 문제, uuid 를 웹소켓으로 받는 구조에서
생기는 제약, 그리고 개선 방법을 정리한다.

관련 구현: `src/lib/http.ts` (`createHttp`, `setHttp`, `getHttp`)

---

## 배경: uuid 는 웹소켓으로 비동기 도착한다

- API 요청에 uuid 헤더가 **필수**
- uuid 는 웹소켓으로 들어오고, **언제 도착할지 알 수 없다**
- 앱에서는 `auth-slice.ts` (zustand) 가 uuid 를 보관한다

### 해결 원칙: 값을 박지 말고, 함수를 넘긴다

`axios.create({ headers })` 의 `headers` 는 **값**이라 생성 시점에 굳는다.
부팅 시점에 `uuid = null` 이면 도착 이후에도 영원히 `null` 이다.

```js
// 검증 결과
// A안: axios.create({ headers: { 'X-Uuid': uuid } })
// B안: interceptors.request.use((req) => { ... uuid 읽기 ... })

--- uuid 도착 전 ---
A: null
B: undefined
--- uuid 도착 후 ---
A: null                    // ← 굳어버림
B: uuid-from-websocket     // ← 매 요청 재평가
```

인터셉터는 **요청마다 실행되는 함수**라 그때그때 최신값을 읽는다.

```ts
http.interceptors.request.use((req) => {
  const { uuid } = useAuthStore.getState();   // ✅ getState()
  // const { uuid } = useAuthStore();         // ❌ 훅은 컴포넌트 안에서만
  if (uuid) req.headers.set('X-Session-Uuid', uuid);
  return req;
});
```

인터셉터는 React 컴포넌트가 아니므로 **반드시 `getState()`**.
`getState()` 는 구독이 아니라 스냅샷 읽기라 리렌더도 일으키지 않는다.

### 인스턴스를 다시 만들지 말 것

```tsx
// ❌ uuid 바뀔 때마다 인스턴스 재생성
const http = useMemo(() => axios.create({ headers: { 'X-Uuid': uuid } }), [uuid]);
```

인스턴스 아이덴티티가 바뀌면 react-query `queryFn` 클로저가 옛 인스턴스를 붙들거나
진행 중이던 요청이 붕 뜬다. 인터셉터 방식은 인스턴스를 1개로 고정한다.

### uuid 도착 전에 나간 요청은 대기시킨다

`getUuid` 가 Promise 를 반환하면 요청 인터셉터가 `await` 로 붙잡는다.
값이 동기면 대기 없이 통과한다.

```ts
// auth-slice.ts
let resolveUuid: ((v: string) => void) | undefined;
const uuidReady = new Promise<string>((resolve) => { resolveUuid = resolve; });

export const useAuthStore = create<AuthState>((set) => ({
  uuid: null,
  setUuid: (uuid) => { set({ uuid }); resolveUuid?.(uuid); },  // 웹소켓 수신 시
  clear: () => set({ uuid: null }),
}));

/** 있으면 즉시, 없으면 도착할 때까지 대기 */
export const getUuid = () => useAuthStore.getState().uuid ?? uuidReady;
```

```ts
export const http = createHttp({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  getToken: () => localStorage.getItem('accessToken'),
  getUuid,
  onUnauthorized: () => {
    useAuthStore.getState().clear();
    location.href = '/login';
  },
});
setHttp(http);   // 모듈 전역 등록
```

`uuidTimeout`(기본 10초) 안에 도착하지 않으면 `ApiError(0, 'UUID_TIMEOUT')` 으로 실패한다.
무한 대기를 막는 상한이다.

---

## 새 창(팝업)에서 벌어지는 일

새 창은 **별도 JS 실행 컨텍스트**다. 앱이 통째로 다시 부팅되고,
zustand store · axios 인스턴스 · React state 가 전부 새로 생성된다.

| | 팝업에 승계? |
|---|---|
| Cookie (같은 origin) | ✅ |
| localStorage | ✅ |
| sessionStorage | ⚠️ **생성 시점 스냅샷만 복사**. 이후 변경은 동기화 안 됨 |
| IndexedDB | ✅ |
| **zustand store** | ❌ 메모리 → 빈 상태로 새로 생성 |
| **axios 인스턴스** | ❌ 새로 생성 (인터셉터도 새로) |
| **웹소켓 연결** | ❌ 없음 |

> `window.open(url, '_blank', 'noopener')` 로 열면 sessionStorage 승계와
> `window.opener` 접근이 모두 끊긴다. 팝업에는 `noopener` 를 빼야 한다.

그러므로 **새 창이 인증 상태를 다시 확인하는 것 자체는 정상**이다.

다만 구분할 것:

- ✅ 정상: 토큰을 읽어 `/auth/me` 한 번 호출해 세션 유효성 확인
- ❌ 버그: 아이디/비밀번호를 다시 요구 → 토큰을 메모리(zustand)에만 들고 있다는 뜻

### 이 구조에서 실제로 터지는 지점

```
팝업 부팅 → zustand uuid = null
         → uuidReady Promise 새로 생성 (pending)
         → 웹소켓 연결 없음 → 아무도 resolve 하지 않음
         → 10초 후 모든 요청이 ApiError(0, 'UUID_TIMEOUT')
```

토큰과 달리 **uuid 는 저장소 어디에도 없다.** 웹소켓을 열지 않는 창은 API 를 한 건도 보낼 수 없다.

---

## 문제: 인증 체크가 "상태"가 아니라 "네비게이션"으로 구현돼 있다

현재 흐름:

```
window.open('/orders/1')
  1. 앱 부팅 #1  at /orders/1
  2. 인증 미확인 → location.href = '/login?redirect=/orders/1'
  3. 앱 부팅 #2  at /login          ← 번들 재다운로드·재파싱
  4. uuid 검증 API 호출
  5. location.href = '/orders/1'
  6. 앱 부팅 #3  at /orders/1       ← 또 전체 리로드
```

SPA 인데 full page load 가 3번 일어난다. 팝업을 열 때마다 반복되니
"계속 로그인 체크하는" 체감이 생긴다.

---

## 개선 1단계: URL 이동을 없앤다 (효과 제일 큼)

`/login` 으로 **이동하지 말고**, 같은 URL 에서 렌더만 바꾼다.

```tsx
type AuthStatus = 'checking' | 'authed' | 'anonymous';

function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);

  if (status === 'checking') return <Splash />;      // URL 그대로
  if (status === 'anonymous') return <LoginPage />;  // URL 그대로
  return <>{children}</>;
}

// App.tsx
<AuthGate>
  <Routes />
</AuthGate>
```

앱 부팅 **3회 → 1회**. `?redirect=` 파라미터도 통째로 불필요해진다.
인증되면 원래 URL 이 이미 주소창에 있으므로 그 자리에서 렌더하면 된다.

`location.href` 는 **로그아웃 때만** 남긴다. 그때는 메모리 전체를 날리는 게 오히려 맞다.

## 개선 2단계: 검증 요청을 react-query 에 맡긴다

이 모듈이 이미 react-query 를 싣고 있다. 중복 호출 제거와 캐싱이 공짜로 따라온다.

```ts
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => getHttp().get<ApiResponse<Session>>('/auth/me').then((r) => r.data.data),
    staleTime: Infinity,   // 창이 살아있는 동안 재검증하지 않음
    retry: false,
  });
}
```

컴포넌트 5개가 동시에 호출해도 요청은 1건.
직접 만든 `isChecking` 플래그·중복 방지 로직을 전부 지울 수 있다.

## 개선 3단계: 팝업은 부모 창에서 받는다 (네트워크 왕복 0)

부모 창이 이미 검증을 마쳤다. 팝업이 같은 것을 다시 물어볼 이유가 없다.

```ts
// 팝업 쪽 — 부팅 시
if (window.opener && !window.opener.closed) {
  window.opener.postMessage({ type: 'AUTH_REQUEST' }, location.origin);
}

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;   // ⚠️ 아래 보안 주의 참고
  if (e.data?.type === 'AUTH_RESPONSE') {
    useAuthStore.getState().setUuid(e.data.uuid);
  }
});
```

```ts
// 부모 쪽
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  if (e.data?.type === 'AUTH_REQUEST') {
    e.source?.postMessage(
      { type: 'AUTH_RESPONSE', uuid: useAuthStore.getState().uuid },
      location.origin,
    );
  }
});
```

### ⚠️ postMessage 보안 주의

`postMessage` 는 창 경계를 넘는 통로다. 두 가지를 반드시 지킨다.

1. **수신 시 `e.origin` 을 검증한다.** 검증하지 않으면 임의의 사이트가
   메시지를 보내 가짜 uuid 를 주입할 수 있다.
2. **송신 시 targetOrigin 에 `'*'` 를 쓰지 않는다.** `'*'` 를 쓰면 창이
   다른 origin 으로 이동한 뒤에도 메시지가 전달되어 uuid 가 유출된다.
   반드시 `location.origin` 같은 구체적 origin 을 지정한다.

### 검증을 완전히 생략하지는 말 것

부모 창이 몇 시간 열려 있었다면 세션이 이미 만료됐을 수 있다.
받은 uuid 로 **일단 렌더하고, 검증은 백그라운드로** 돌린다.
만료됐다면 첫 API 가 401 로 떨어지고 `onUnauthorized` 가 받아낸다.

## 개선 4단계: BroadcastChannel 로 창 전체 동기화

`postMessage` 는 부모↔팝업 1:1 이다. 창이 여러 개면 이쪽이 낫다.

```ts
const channel = new BroadcastChannel('auth');

channel.onmessage = (e) => {
  if (e.data.type === 'UUID') useAuthStore.getState().setUuid(e.data.uuid);
  if (e.data.type === 'LOGOUT') useAuthStore.getState().clear();
};
```

보너스로 **한 창에서 로그아웃하면 모든 창이 함께 로그아웃**된다.
지금 구조에서는 팝업만 살아남아 401 을 뱉는 상태가 생긴다.

---

## 정리

| 단계 | 얻는 것 | 비용 |
|---|---|---|
| 1. AuthGate | 부팅 3회→1회, redirect 파라미터 제거 | 컴포넌트 1개 |
| 2. react-query | 중복 요청 제거, 캐싱 | 훅 1개 |
| 3. postMessage | 팝업 검증 왕복 0 | origin 검증 필수 |
| 4. BroadcastChannel | 다중 창 동기화, 동시 로그아웃 | 약 10줄 |

**1단계만 해도 체감 대부분이 해결된다.** 3·4 는 팝업을 자주 쓰는 경우에 추가한다.

---

## uuid 를 어디에 저장할 것인가

| | 팝업 승계 | XSS 노출 | 탭 닫으면 |
|---|---|---|---|
| `localStorage` | ✅ | 노출됨 | 남음 |
| `sessionStorage` | ✅ 생성 시점 스냅샷 | 노출됨 | 사라짐 |
| httpOnly 쿠키 | ✅ | **안 됨** | 설정 따름 |

uuid 가 서버 세션 식별자라면 **httpOnly 쿠키가 정석**이다.
JS 가 읽을 수 없으니 헤더에 넣을 필요도, 웹소켓을 기다릴 필요도 없어진다.
지금 겪는 문제 전체가 사라지는 경로다. 다만 백엔드 변경이 필요하고
CORS · `SameSite` 설정이 따라붙는다.

JS 가 들고 있어야 하는 값이라면 `sessionStorage` 를 쓴다.
팝업에 승계되고 탭을 닫으면 지워진다.

---

## 선행 확인 사항

**uuid 가 "브라우저 세션당 하나"인가, "웹소켓 연결당 하나"인가?**

- 세션당 하나 → 팝업이 부모 값을 그대로 사용 (개선 3·4단계)
- 연결당 하나 → 팝업도 자기 웹소켓을 열어야 함 (서버 커넥션 2배)

이 답에 따라 팝업 전략이 갈린다.

---

## 모듈 편입 범위

| 대상 | 위치 | 이유 |
|---|---|---|
| `createHttp` / `setHttp` / `getHttp` | **모듈** | 구현됨 (`src/lib/http.ts`) |
| `AuthGate`, `useSession` | 모듈 후보 | 앱마다 같은 코드 |
| `postMessage` / `BroadcastChannel` 배선 | **앱** | 메시지 스키마·origin 정책이 앱 고유 |
| `auth-slice.ts` | **앱** | 웹소켓 연결과 묶여 있음 |
