import { describe, expect, it } from 'vitest';
import type { ColDef } from 'ag-grid-community';
import { withExcelCellClass } from '../lib/excelExport';

interface Row {
  name: string;
  qty: number;
  price: number;
  regDate: string;
}

const sample: Row = { name: '가나상사', qty: 10, price: 1234.5, regDate: '2026-09-07' };

describe('withExcelCellClass', () => {
  it('cellDataType 으로 타입을 잡아 cellClass 를 붙인다', () => {
    const cols: ColDef<Row>[] = [
      { field: 'name', cellDataType: 'text' },
      { field: 'qty', cellDataType: 'number' },
      { field: 'regDate', cellDataType: 'date' },
    ];

    const out = withExcelCellClass(cols, sample);

    expect(out[0].cellClass).toBe('excel-string');
    expect(out[1].cellClass).toBe('excel-number');
    expect(out[2].cellClass).toBe('excel-date');
  });

  it('cellDataType 이 없으면 샘플 행 값으로 추론한다', () => {
    const out = withExcelCellClass<Row>(
      [{ field: 'name' }, { field: 'qty' }, { field: 'regDate' }],
      sample,
    );

    expect(out[0].cellClass).toBe('excel-string');
    expect(out[1].cellClass).toBe('excel-number');
    expect(out[2].cellClass).toBe('excel-date');
  });

  it('context.excelType 을 직접 주면 그게 우선한다', () => {
    const out = withExcelCellClass<Row>(
      [{ field: 'price', context: { excelType: 'decimal' } }],
      sample,
    );
    expect(out[0].cellClass).toBe('excel-decimal');
  });

  it('사용처가 지정한 cellClass 를 지우지 않고 함께 남긴다', () => {
    const out = withExcelCellClass<Row>([{ field: 'qty', cellClass: 'my-class' }], sample);
    expect(out[0].cellClass).toEqual(['my-class', 'excel-number']);
  });

  it('cellClass 가 배열이어도 합친다', () => {
    const out = withExcelCellClass<Row>([{ field: 'qty', cellClass: ['a', 'b'] }], sample);
    expect(out[0].cellClass).toEqual(['a', 'b', 'excel-number']);
  });

  it('cellClass 가 함수면 건드리지 않는다 (사용처 로직을 깨지 않는다)', () => {
    const fn = () => 'dynamic';
    const out = withExcelCellClass<Row>([{ field: 'qty', cellClass: fn }], sample);
    expect(out[0].cellClass).toBe(fn);
  });

  it('원본 columnDefs 를 변형하지 않는다', () => {
    const cols: ColDef<Row>[] = [{ field: 'qty' }];
    withExcelCellClass(cols, sample);
    expect(cols[0].cellClass).toBeUndefined();
  });

  it('field 가 없는 컬럼(체크박스 등)은 그대로 통과시킨다', () => {
    const checkbox: ColDef<Row> = { checkboxSelection: true, width: 40 };
    const out = withExcelCellClass<Row>([checkbox], sample);
    expect(out[0].cellClass).toBeUndefined();
  });

  it('샘플 행이 없어도 동작한다', () => {
    const out = withExcelCellClass<Row>([{ field: 'qty', cellDataType: 'number' }], undefined);
    expect(out[0].cellClass).toBe('excel-number');
  });
});
