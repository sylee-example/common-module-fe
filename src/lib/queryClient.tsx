import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** 사내 기본 정책: 재시도 1회, 1분 캐시, 창 포커스 시 재조회 안 함 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}

export interface QueryProviderProps {
  children: ReactNode;
  /** 테스트 등에서 외부 client 주입. 없으면 내부에서 1회 생성 */
  client?: QueryClient;
}

// ponytail: client를 모듈 스코프에 1개만 만든다. 멀티 테넌트가 생기면 client prop으로 주입.
const defaultClient = createQueryClient();

export function QueryProvider({ children, client = defaultClient }: QueryProviderProps) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
