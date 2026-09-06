import type { AxiosAdapter } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createHttp, getHttp, isApiError, setHttp } from '../lib/http';

/** 네트워크를 타지 않고 요청 config를 그대로 돌려주는 어댑터 */
const echoAdapter: AxiosAdapter = (config) =>
  Promise.resolve({ data: null, status: 200, statusText: 'OK', headers: {}, config });

/** 지정한 status로 실패하는 어댑터 */
const failAdapter =
  (status: number, data?: unknown): AxiosAdapter =>
  (config) =>
    Promise.reject(
      Object.assign(new Error('Request failed'), {
        isAxiosError: true,
        config,
        response: { status, data, statusText: '', headers: {}, config },
      }),
    );

describe('createHttp - uuid 헤더', () => {
  it('동기 값이면 대기 없이 헤더에 넣는다', async () => {
    const http = createHttp({ adapter: echoAdapter, getUuid: () => 'sync-uuid' });

    const res = await http.get('/x');

    expect(res.config.headers['X-Session-Uuid']).toBe('sync-uuid');
  });

  it('uuid가 아직 없으면 도착할 때까지 요청을 대기시킨다', async () => {
    let deliver!: (uuid: string) => void;
    const ready = new Promise<string>((resolve) => {
      deliver = resolve;
    });

    const http = createHttp({ adapter: echoAdapter, getUuid: () => ready });

    // 웹소켓 수신 전에 요청 시작
    const pending = http.get('/x');
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false); // 아직 나가지 않았다

    deliver('ws-uuid');
    const res = await pending;

    expect(res.config.headers['X-Session-Uuid']).toBe('ws-uuid');
  });

  it('대기 중이던 요청 여러 건이 uuid 1회 수신으로 모두 풀린다', async () => {
    let deliver!: (uuid: string) => void;
    const ready = new Promise<string>((resolve) => {
      deliver = resolve;
    });
    const http = createHttp({ adapter: echoAdapter, getUuid: () => ready });

    const all = Promise.all([http.get('/a'), http.get('/b'), http.get('/c')]);
    deliver('ws-uuid');

    const results = await all;
    for (const res of results) {
      expect(res.config.headers['X-Session-Uuid']).toBe('ws-uuid');
    }
  });

  it('uuidTimeout 안에 도착하지 않으면 UUID_TIMEOUT으로 실패한다', async () => {
    vi.useFakeTimers();
    try {
      const http = createHttp({
        adapter: echoAdapter,
        uuidTimeout: 1_000,
        getUuid: () => new Promise<string>(() => {}), // 영원히 도착하지 않음
      });

      const pending = http.get('/x');
      const assertion = expect(pending).rejects.toMatchObject({
        name: 'ApiError',
        code: 'UUID_TIMEOUT',
        status: 0,
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('uuidHeader로 헤더명을 바꿀 수 있다', async () => {
    const http = createHttp({
      adapter: echoAdapter,
      getUuid: () => 'u1',
      uuidHeader: 'X-Custom-Uuid',
    });

    const res = await http.get('/x');

    expect(res.config.headers['X-Custom-Uuid']).toBe('u1');
    expect(res.config.headers['X-Session-Uuid']).toBeUndefined();
  });
});

describe('createHttp - 에러 메시지', () => {
  it('서버 body의 message가 status 기본 문구보다 우선한다', async () => {
    const http = createHttp({
      adapter: failAdapter(400, { code: 'STOCK_EMPTY', message: '재고가 부족합니다' }),
    });

    await expect(http.get('/x')).rejects.toMatchObject({
      status: 400,
      code: 'STOCK_EMPTY',
      message: '재고가 부족합니다',
    });
  });

  it('body에 message가 없으면 status별 기본 문구를 쓴다', async () => {
    const http = createHttp({ adapter: failAdapter(403) });

    await expect(http.get('/x')).rejects.toMatchObject({
      status: 403,
      message: '접근 권한이 없습니다.',
    });
  });

  it('statusMessages로 지정한 status만 덮어쓴다', async () => {
    const options = { statusMessages: { 404: '없는 페이지입니다' } };

    await expect(
      createHttp({ ...options, adapter: failAdapter(404) }).get('/x'),
    ).rejects.toMatchObject({ message: '없는 페이지입니다' });

    await expect(
      createHttp({ ...options, adapter: failAdapter(500) }).get('/x'),
    ).rejects.toMatchObject({ message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
  });

  it('실패는 항상 ApiError로 정규화된다', async () => {
    const http = createHttp({ adapter: failAdapter(500) });

    const error = await http.get('/x').catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    expect(error).toBeInstanceOf(ApiError);
  });
});

describe('createHttp - 401 처리', () => {
  it('401이면 onUnauthorized를 호출한다', async () => {
    const onUnauthorized = vi.fn();
    const http = createHttp({ adapter: failAdapter(401), onUnauthorized });

    await expect(http.get('/x')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('401이 병렬로 쏟아져도 onUnauthorized는 1회만 호출한다', async () => {
    const onUnauthorized = vi.fn();
    const http = createHttp({ adapter: failAdapter(401), onUnauthorized });

    await Promise.allSettled([http.get('/a'), http.get('/b'), http.get('/c')]);

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('skipAuthHandler를 준 요청의 401은 리다이렉트를 유발하지 않는다', async () => {
    const onUnauthorized = vi.fn();
    const http = createHttp({ adapter: failAdapter(401), onUnauthorized });

    await expect(
      http.post('/auth/login', {}, { skipAuthHandler: true }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('성공 응답 이후의 401은 다시 감지한다', async () => {
    const onUnauthorized = vi.fn();
    const http = createHttp({ adapter: failAdapter(401), onUnauthorized });

    await expect(http.get('/x')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    // 재로그인 성공
    await http.get('/y', { adapter: echoAdapter });

    await expect(http.get('/z')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });
});

describe('setHttp / getHttp', () => {
  it('등록 전에 getHttp를 부르면 안내 메시지와 함께 실패한다', () => {
    expect(() => getHttp()).toThrow(/setHttp/);
  });

  it('등록하면 같은 인스턴스를 돌려준다', () => {
    const http = createHttp({ adapter: echoAdapter });
    setHttp(http);

    expect(getHttp()).toBe(http);
  });
});
