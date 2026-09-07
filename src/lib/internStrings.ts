/**
 * 행 배열 안에서 값이 같은 문자열을 한 인스턴스로 합친다.
 *
 * `JSON.parse` 는 같은 값이 반복돼도 매번 새 문자열 객체를 만들고 V8 이 중복을 제거해 주지 않는다.
 * 상태·부서·코드처럼 값 종류가 적은 컬럼이 많을수록 효과가 크다.
 * (80,000행 x 30컬럼 실측: 209MB -> 54MB, 162ms 소요)
 *
 * 행 객체를 제자리에서 고치고 같은 배열을 돌려준다. 중첩 객체는 건드리지 않는다.
 */
export function internStrings<T extends object>(rows: T[]): T[] {
  const pool = new Map<string, string>();

  for (const row of rows) {
    for (const key in row) {
      const value = row[key];
      if (typeof value !== 'string') continue;

      const shared = pool.get(value);
      if (shared === undefined) {
        pool.set(value, value);
      } else {
        (row as Record<string, unknown>)[key] = shared;
      }
    }
  }

  // pool 은 여기서 버려진다. 살아남는 건 행이 참조하는 문자열뿐이다.
  return rows;
}
