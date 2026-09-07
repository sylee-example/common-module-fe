import { describe, expect, it } from 'vitest';
import {
  COMMON_EXCEL_STYLES,
  EXCLUDED_EXCEL_COL_IDS,
  excelStyleIdFor,
  resolveExcelType,
  sanitizeExcelValue,
  buildExcelFileName,
  type ExcelValueType,
} from '../lib/excelExport';

describe('resolveExcelType - 타입 결정 순서', () => {
  it('명시한 type 이 가장 우선한다', () => {
    expect(resolveExcelType({ explicit: 'decimal', cellDataType: 'text', sample: '문자' })).toBe(
      'decimal',
    );
  });

  it('명시가 없으면 colDef.cellDataType 을 쓴다', () => {
    expect(resolveExcelType({ cellDataType: 'number', sample: '문자' })).toBe('number');
    expect(resolveExcelType({ cellDataType: 'date', sample: 123 })).toBe('date');
    expect(resolveExcelType({ cellDataType: 'dateString', sample: 123 })).toBe('date');
    expect(resolveExcelType({ cellDataType: 'text', sample: 123 })).toBe('string');
  });

  it('cellDataType 이 boolean(자동추론 on/off) 이면 무시한다', () => {
    expect(resolveExcelType({ cellDataType: true, sample: 10 })).toBe('number');
    expect(resolveExcelType({ cellDataType: false, sample: 10 })).toBe('number');
  });

  it('알 수 없는 cellDataType 은 값 추론으로 넘어간다', () => {
    expect(resolveExcelType({ cellDataType: 'object', sample: 10 })).toBe('number');
  });

  it('둘 다 없으면 값으로 추론한다', () => {
    expect(resolveExcelType({ sample: 10 })).toBe('number');
    expect(resolveExcelType({ sample: new Date() })).toBe('date');
    expect(resolveExcelType({ sample: '가나다' })).toBe('string');
  });

  it('ISO 형태 날짜 문자열은 date 로 본다', () => {
    expect(resolveExcelType({ sample: '2026-09-07' })).toBe('date');
    expect(resolveExcelType({ sample: '2026-09-07 13:20' })).toBe('datetime');
    expect(resolveExcelType({ sample: '2026-09-07T13:20:00' })).toBe('datetime');
  });

  it('숫자처럼 생긴 문자열은 숫자로 보지 않는다 (코드값 보호)', () => {
    // 사번/우편번호의 앞자리 0 이 사라지면 안 된다
    expect(resolveExcelType({ sample: '00123' })).toBe('string');
    expect(resolveExcelType({ sample: '010-1234-5678' })).toBe('string');
  });

  it('추론할 값이 없으면 string 으로 떨어진다', () => {
    expect(resolveExcelType({})).toBe('string');
    expect(resolveExcelType({ sample: null })).toBe('string');
    expect(resolveExcelType({ sample: undefined })).toBe('string');
  });
});

describe('excelStyleIdFor', () => {
  it('타입마다 팔레트의 스타일 id 를 준다', () => {
    const pairs: [ExcelValueType, string][] = [
      ['string', 'excel-string'],
      ['number', 'excel-number'],
      ['decimal', 'excel-decimal'],
      ['date', 'excel-date'],
      ['datetime', 'excel-datetime'],
    ];
    for (const [type, id] of pairs) expect(excelStyleIdFor(type)).toBe(id);
  });

  it('반환한 id 가 실제로 팔레트에 있다', () => {
    const ids = new Set(COMMON_EXCEL_STYLES.map((s) => s.id));
    for (const type of ['string', 'number', 'decimal', 'date', 'datetime'] as ExcelValueType[]) {
      expect(ids.has(excelStyleIdFor(type))).toBe(true);
    }
  });
});

describe('COMMON_EXCEL_STYLES - 요구사항 확인', () => {
  const byId = (id: string) => COMMON_EXCEL_STYLES.find((s) => s.id === id);

  it('문자열은 왼쪽 정렬', () => {
    expect(byId('excel-string')?.alignment?.horizontal).toBe('Left');
  });

  it('숫자는 오른쪽 정렬 + 콤마 구분자 + Number 타입', () => {
    const style = byId('excel-number');
    expect(style?.alignment?.horizontal).toBe('Right');
    expect(style?.numberFormat?.format).toBe('#,##0');
    // dataType 이 없으면 엑셀에서 문자열이 되어 합계·정렬이 안 된다
    expect(style?.dataType).toBe('Number');
  });

  it('소수는 소수점 두 자리까지 콤마 서식', () => {
    expect(byId('excel-decimal')?.numberFormat?.format).toBe('#,##0.00');
    expect(byId('excel-decimal')?.dataType).toBe('Number');
  });

  it('날짜는 DateTime 타입이라 엑셀에서 날짜로 다뤄진다', () => {
    expect(byId('excel-date')?.dataType).toBe('DateTime');
    expect(byId('excel-date')?.numberFormat?.format).toBe('yyyy-mm-dd');
  });

  it('스타일 id 가 중복되지 않는다', () => {
    const ids = COMMON_EXCEL_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('sanitizeExcelValue - 수식 인젝션 방어', () => {
  it.each(['=1+1', '=cmd|/c calc', '+1', '-1+2', '@SUM(A1)', '\tx', '\rx'])(
    '%j 는 홑따옴표를 붙여 텍스트로 만든다',
    (value) => {
      expect(sanitizeExcelValue(value)).toBe(`'${value}`);
    },
  );

  it('평범한 문자열은 그대로 둔다', () => {
    expect(sanitizeExcelValue('가나상사')).toBe('가나상사');
    expect(sanitizeExcelValue('A-100')).toBe('A-100');
  });

  it('문자열이 아닌 값은 손대지 않는다 (숫자 서식이 깨지면 안 된다)', () => {
    const date = new Date(0);
    expect(sanitizeExcelValue(1000)).toBe(1000);
    expect(sanitizeExcelValue(-5)).toBe(-5);
    expect(sanitizeExcelValue(true)).toBe(true);
    expect(sanitizeExcelValue(null)).toBeNull();
    expect(sanitizeExcelValue(undefined)).toBeUndefined();
    expect(sanitizeExcelValue(date)).toBe(date);
  });

  it('빈 문자열을 견딘다', () => {
    expect(sanitizeExcelValue('')).toBe('');
  });
});

describe('EXCLUDED_EXCEL_COL_IDS', () => {
  it('체크박스 컬럼과 그룹 자동 컬럼을 제외 대상으로 둔다', () => {
    expect(EXCLUDED_EXCEL_COL_IDS.has('ag-Grid-SelectionColumn')).toBe(true);
    expect(EXCLUDED_EXCEL_COL_IDS.has('ag-Grid-AutoColumn')).toBe(true);
  });
});

describe('buildExcelFileName', () => {
  it('시트명과 시각을 붙여 파일명을 만든다', () => {
    const at = new Date(2026, 8, 7, 13, 5);
    expect(buildExcelFileName('재고목록', at)).toBe('재고목록_20260907_1305.xlsx');
  });

  it('확장자는 한 번만 붙는다', () => {
    const at = new Date(2026, 8, 7, 13, 5);
    expect(buildExcelFileName('재고목록.xlsx', at)).toBe('재고목록_20260907_1305.xlsx');
  });
});
