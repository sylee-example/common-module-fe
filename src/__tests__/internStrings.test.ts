import { describe, expect, it } from 'vitest';
import { internStrings } from '../lib/internStrings';

describe('internStrings', () => {
  // 참고: 문자열은 원시값이라 인스턴스 동일성을 JS 로 관찰할 수 없다 (=== 가 값 비교).
  // 메모리 절감은 V8 힙 레벨에서 일어나며 벤치마크로만 확인된다 (80k x 30: 209MB -> 54MB).
  // 따라서 여기서는 "값을 망가뜨리지 않는다"는 계약만 검증한다.
  it('반복 값이 있어도 값이 그대로 유지된다', () => {
    const rows = JSON.parse('[{"s":"승인"},{"s":"승인"},{"s":"반려"}]') as { s: string }[];

    internStrings(rows);

    expect(rows.map((r) => r.s)).toEqual(['승인', '승인', '반려']);
  });

  it('값 자체는 바뀌지 않는다', () => {
    const rows = [
      { code: 'A', name: '가나상사', qty: 10 },
      { code: 'A', name: '나다물산', qty: 20 },
    ];
    expect(internStrings(rows)).toEqual([
      { code: 'A', name: '가나상사', qty: 10 },
      { code: 'A', name: '나다물산', qty: 20 },
    ]);
  });

  it('문자열이 아닌 값은 건드리지 않는다', () => {
    const date = new Date(0);
    const nested = { deep: 'x' };
    const rows = [{ n: 1, b: true, nil: null, undef: undefined, date, nested }];

    internStrings(rows);

    expect(rows[0].n).toBe(1);
    expect(rows[0].b).toBe(true);
    expect(rows[0].nil).toBeNull();
    expect(rows[0].undef).toBeUndefined();
    // 중첩 객체는 참조를 그대로 둔다 (얕게만 처리한다)
    expect(rows[0].date).toBe(date);
    expect(rows[0].nested).toBe(nested);
  });

  it('같은 배열을 그대로 반환한다 (제자리 처리)', () => {
    const rows = [{ s: 'a' }];
    expect(internStrings(rows)).toBe(rows);
  });

  it('빈 배열과 값 없는 행을 견딘다', () => {
    expect(internStrings([])).toEqual([]);
    expect(internStrings([{}])).toEqual([{}]);
  });

  it('컬럼이 여러 개여도 각 값을 유지한다', () => {
    const rows = JSON.parse('[{"a":"서울","b":"서울","c":"부산"}]') as Record<string, string>[];
    internStrings(rows);
    expect(rows[0]).toEqual({ a: '서울', b: '서울', c: '부산' });
  });
});
