import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** true면 이 요청의 401은 onUnauthorized를 호출하지 않는다 (로그인 API 등) */
    skipAuthHandler?: boolean;
  }
}

/** 서버 공통 응답 형식 */
export interface ApiResponse<T = unknown> {
  code: string;
  message: string;
  data: T;
}

/** 인터셉터에서 정규화된 에러. 호출부는 이 타입만 알면 된다. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** status 0은 응답 자체를 못 받은 경우(네트워크 단절, CORS, 타임아웃) */
export const DEFAULT_STATUS_MESSAGES: Readonly<Record<number, string>> = {
  0: '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.',
  400: '요청 값이 올바르지 않습니다.',
  401: '로그인이 필요합니다. 다시 로그인해 주세요.',
  403: '접근 권한이 없습니다.',
  404: '요청한 정보를 찾을 수 없습니다.',
  408: '요청 시간이 초과되었습니다.',
  409: '이미 처리된 요청입니다.',
  422: '입력값을 확인해 주세요.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  500: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  502: '서버와 통신할 수 없습니다.',
  503: '서비스 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  504: '서버 응답이 지연되고 있습니다.',
};

export interface CreateHttpOptions extends AxiosRequestConfig {
  /** 요청마다 Authorization 헤더에 넣을 토큰을 반환. 없으면 헤더 미첨부 */
  getToken?: () => string | null | undefined;
  /**
   * 요청 시점마다 평가된다. Promise를 반환하면 값이 도착할 때까지 요청이 대기한다.
   * 웹소켓처럼 도착 시점을 알 수 없는 값에 사용.
   */
  getUuid?: () => string | null | undefined | Promise<string | null | undefined>;
  /** uuid를 실을 헤더명 */
  uuidHeader?: string;
  /** getUuid가 이 시간(ms) 안에 값을 주지 못하면 ApiError(0, 'UUID_TIMEOUT')로 실패시킨다 */
  uuidTimeout?: number;
  /** 401 응답 시 호출 (로그아웃/리다이렉트 처리) */
  onUnauthorized?: () => void;
  /** status별 사용자 메시지 오버라이드. 지정한 status만 기본값을 덮어쓴다 */
  statusMessages?: Record<number, string>;
}

export function createHttp({
  getToken,
  getUuid,
  uuidHeader = 'X-Session-Uuid',
  uuidTimeout = 10_000,
  onUnauthorized,
  statusMessages,
  ...config
}: CreateHttpOptions = {}): AxiosInstance {
  const messages = { ...DEFAULT_STATUS_MESSAGES, ...statusMessages };

  // 401이 병렬로 여러 개 떨어져도 onUnauthorized는 1회만 부른다.
  // 성공 응답이 오면 리셋해 재로그인 이후의 401을 다시 잡는다.
  let unauthorizedHandled = false;

  const instance = axios.create({
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
    ...config,
  });

  instance.interceptors.request.use(async (req: InternalAxiosRequestConfig) => {
    const token = getToken?.();
    if (token) req.headers.set('Authorization', `Bearer ${token}`);

    if (getUuid) {
      // 동기 값이면 즉시 통과, Promise면 도착할 때까지 대기한다
      const uuid = await withTimeout(getUuid(), uuidTimeout, uuidHeader);
      if (uuid) req.headers.set(uuidHeader, uuid);
    }

    return req;
  });

  instance.interceptors.response.use(
    (res) => {
      unauthorizedHandled = false;
      return res;
    },
    (error: AxiosError<Partial<ApiResponse>>) => {
      // 요청 인터셉터에서 던진 ApiError는 그대로 통과시킨다
      if (error instanceof ApiError) return Promise.reject(error);

      const status = error.response?.status ?? 0;

      if (status === 401 && !unauthorizedHandled && !error.config?.skipAuthHandler) {
        unauthorizedHandled = true;
        onUnauthorized?.();
      }

      const body = error.response?.data;
      return Promise.reject(
        new ApiError(
          status,
          body?.code ?? error.code ?? 'UNKNOWN',
          // 서버가 준 구체적 사유가 1순위, status별 안내 문구가 2순위
          body?.message ?? messages[status] ?? error.message,
          body,
        ),
      );
    },
  );

  return instance;
}

/** uuid가 끝내 도착하지 않는 경우를 대비한 상한. 값이 동기면 대기 없이 반환한다. */
async function withTimeout(
  value: string | null | undefined | Promise<string | null | undefined>,
  ms: number,
  header: string,
): Promise<string | null | undefined> {
  if (!(value instanceof Promise)) return value;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      value,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new ApiError(0, 'UUID_TIMEOUT', `${header} 값을 받지 못해 요청을 보낼 수 없습니다.`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// ponytail: 인스턴스 1개만 공유한다. 멀티 테넌트/다중 baseURL이 생기면
// HttpProvider + useHttp() 컨텍스트로 승격할 것.
let sharedHttp: AxiosInstance | null = null;

/** 앱 진입점에서 1회 호출해 모듈 전역에 인스턴스를 등록한다 */
export function setHttp(instance: AxiosInstance): void {
  sharedHttp = instance;
}

/** 등록된 인스턴스를 반환. 훅이 아니므로 zustand 스토어·유틸 함수에서도 쓸 수 있다 */
export function getHttp(): AxiosInstance {
  if (!sharedHttp) {
    throw new Error(
      'http 인스턴스가 등록되지 않았습니다. 앱 진입점에서 setHttp(createHttp(...))를 호출하세요.',
    );
  }
  return sharedHttp;
}

/** ApiError 타입 가드 — catch 블록에서 사용 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
