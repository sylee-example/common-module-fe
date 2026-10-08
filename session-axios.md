결론부터 말씀드리면, 보호할 라우트와 공개 라우트를 나눌 필요가 없으면 main.tsx 게이트가 가장 간단합니다. SSO 콜백이나 에러 페이지처럼 세션 없이 열려야 하는 화면이 있으면 TanStack Router의 beforeLoad가 맞습니다.

┌─────────────────────────┬──────────────────────────────────────────────────┬────────────────────────────────┐
│                         │                 main.tsx 게이트                  │       Router beforeLoad        │
├─────────────────────────┼──────────────────────────────────────────────────┼────────────────────────────────┤
│ 적용 범위               │ 앱 전체                                          │ 라우트 단위 (공개/보호 분리)   │
├─────────────────────────┼──────────────────────────────────────────────────┼────────────────────────────────┤
│ 세션 변경 반응          │ 자동 (zustand selector로 리렌더)                 │ 수동 (router.invalidate()      │
│                         │                                                  │ 필요)                          │
├─────────────────────────┼──────────────────────────────────────────────────┼────────────────────────────────┤
│ loader /                │ 실행 안 됨 (RouterProvider가 마운트되지          │ beforeLoad가 끝난 뒤 실행      │
│ ensureQueryData         │ 않으므로)                                        │                                │
├─────────────────────────┼──────────────────────────────────────────────────┼────────────────────────────────┤
│ 코드량                  │ 적음                                             │ 라우트 구조 변경 필요          │
└─────────────────────────┴──────────────────────────────────────────────────┴────────────────────────────────┘

방법 1: main.tsx 게이트 (추천)

createRouter는 모듈 레벨에서 만들어도 괜찮습니다. 실제 라우트 로딩(loader 실행)은 RouterProvider가 마운트될 때 시작되기 때문에, 게이트로 감싸 두면 세션이 오기 전에는 loader도 쿼리도 실행되지 않습니다.

// common/providers/SessionGate.tsx
import { Button, Result, Spin } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { useAppStore } from '../store/appSto
import { connectSessionSocket, disconnectSessionSocket } from '../socket/sessionSocket';

export const SessionGate = ({ children }: { children: ReactNode }) => {
  // boolean만 구독 → 세션 내부 값이 바뀌어
  const hasSession = useAppStore((s) => s.session !== null);
  const isError = useAppStore((s) => s.sessi

  useEffect(() => {
    connectSessionSocket();
    return disconnectSessionSocket;
  }, []);

  if (hasSession) return <>{children}</>;

  if (isError) {
    return (
      <Result
        status='error'
        title='세션 정보를 받지 못했습니다'
        extra={<Button onClick={() => window 도</Button>}
      />
    );
  }

  return (
    <div className='flex h-screen items-cent
      <Spin size='large' />
    </div>
  );
};

// main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { AppProvider, queryClient } from '@cr';
import { routeTree } from './routeTree.gen';

const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* AppProvider = QueryClientProvider + SessionGate (공통 모듈) */}
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  </StrictMode>,
);

로그아웃 등으로 session이 null이 되면 게이트 니다. 따로 처리할 것이 없습니다.
