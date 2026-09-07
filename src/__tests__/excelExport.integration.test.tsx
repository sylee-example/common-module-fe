import { render, screen } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';
import { describe, expect, it, vi } from 'vitest';
import { CommonGrid } from '../components/grid/CommonGrid';
import {
  exportGridToExcel,
  getExportableColumns,
  resolveExcelColumns,
} from '../lib/excelExport';
import type { ExcelColDef } from '../lib/excelExport';

interface Row {
  name: string;
  qty: number;
  price: number;
  regDate: string;
  hiddenMemo: string;
}

const makeRows = (): Row[] => [
  { name: '가나상사', qty: 10, price: 1234.5, regDate: '2026-09-07', hiddenMemo: 'm1' },
  { name: '나다물산', qty: 20, price: 99.9, regDate: '2026-09-08', hiddenMemo: 'm2' },
];

const columnDefs: ExcelColDef<Row>[] = [
  // 체크박스 컬럼 (v34 rowSelection 이 ag-Grid-SelectionColumn 을 자동 생성한다)
  { field: 'name', headerName: '거래처' },
  { field: 'qty', headerName: '수량' },
  { field: 'price', headerName: '단가', context: { excelType: 'decimal' } },
  { field: 'regDate', headerName: '등록일' },
  { field: 'hiddenMemo', headerName: '비고', hide: true },
];

let api: GridApi<Row>;

async function mountGrid() {
  render(
    <CommonGrid<Row>
      rowData={makeRows()}
      columnDefs={columnDefs}
      pagination={false}
      rowSelection={{ mode: 'multiRow' }}
      onGridReady={(e) => {
        api = e.api;
      }}
    />,
  );
  await screen.findByText('가나상사');
}

describe('내보낼 컬럼 선별', () => {
  it('숨김 컬럼과 체크박스 컬럼을 제외한다', async () => {
    await mountGrid();

    const all = api.getAllDisplayedColumns().map((c) => c.getColId());
    // 체크박스 컬럼이 실제로 생성되어 있어야 이 테스트가 의미를 가진다
    expect(all).toContain('ag-Grid-SelectionColumn');

    const exportable = getExportableColumns(api).map((c) => c.getColId());
    expect(exportable).toEqual(['name', 'qty', 'price', 'regDate']);
    expect(exportable).not.toContain('hiddenMemo');
    expect(exportable).not.toContain('ag-Grid-SelectionColumn');
  });

  it('컬럼 목록을 주면 그 순서를 따른다', async () => {
    await mountGrid();
    const resolved = resolveExcelColumns(api, ['regDate', 'name']);
    expect(resolved.map((c) => c.colId)).toEqual(['regDate', 'name']);
  });

  it('문자열과 스펙을 섞어 줄 수 있다', async () => {
    await mountGrid();
    const resolved = resolveExcelColumns(api, ['name', { colId: 'qty', header: '출고수량' }]);
    expect(resolved[0]).toMatchObject({ colId: 'name', styleId: 'excel-string' });
    expect(resolved[1]).toMatchObject({ colId: 'qty', header: '출고수량' });
  });

  it('화면에 없는 컬럼은 건너뛴다', async () => {
    await mountGrid();
    const resolved = resolveExcelColumns(api, ['name', 'hiddenMemo', 'ag-Grid-SelectionColumn']);
    expect(resolved.map((c) => c.colId)).toEqual(['name']);
  });
});

describe('타입 결정 - 실제 그리드 값 기준', () => {
  it('숫자·날짜·문자열을 구분해 스타일을 붙인다', async () => {
    await mountGrid();
    const byId = Object.fromEntries(resolveExcelColumns(api).map((c) => [c.colId, c]));

    expect(byId.name).toMatchObject({ type: 'string', styleId: 'excel-string' });
    expect(byId.qty).toMatchObject({ type: 'number', styleId: 'excel-number' });
    expect(byId.regDate).toMatchObject({ type: 'date', styleId: 'excel-date' });
    // context.excelType 을 직접 준 컬럼은 그 값이 이긴다
    expect(byId.price).toMatchObject({ type: 'decimal', styleId: 'excel-decimal' });
  });

  it('cellClass 가 컬럼에 실제로 붙어 렌더된다 (ExcelStyle.id 매칭의 전제)', async () => {
    await mountGrid();
    expect(document.querySelector('.ag-cell.excel-number[col-id="qty"]')).toBeTruthy();
    expect(document.querySelector('.ag-cell.excel-string[col-id="name"]')).toBeTruthy();
    expect(document.querySelector('.ag-cell.excel-decimal[col-id="price"]')).toBeTruthy();
  });
});

describe('exportGridToExcel', () => {
  it('모듈이 없어도 던지지 않고 AG Grid 에 위임한다', async () => {
    await mountGrid();
    // community 에도 api.exportDataAsExcel 은 함수로 존재하며 예외를 던지지 않는다.
    // 모듈 미등록은 AG Grid 가 error #200 으로 알린다 (여기서 미리 걸러낼 방법이 없다)
    expect(() => exportGridToExcel(api)).not.toThrow();
  });

  it('모듈이 있으면 확정된 파라미터로 호출한다', async () => {
    await mountGrid();
    const spy = vi.fn();
    (api as unknown as Record<string, unknown>).exportDataAsExcel = spy;

    exportGridToExcel(api, { sheetName: '재고목록', columns: ['name', 'qty'] });

    expect(spy).toHaveBeenCalledTimes(1);
    const params = spy.mock.calls[0][0];
    expect(params.columnKeys).toEqual(['name', 'qty']);
    expect(params.sheetName).toBe('재고목록');
    expect(params.fileName).toMatch(/^재고목록_\d{8}_\d{4}\.xlsx$/);
    // 수식 자동 변환은 반드시 꺼져 있어야 한다
    expect(params.autoConvertFormulas).toBe(false);
    expect(params.exportedRows).toBe('filteredAndSorted');
    expect(params.freezeRows).toBe('headers');
  });

  it('셀 콜백이 수식 문자열을 무력화하고 숫자는 그대로 둔다', async () => {
    await mountGrid();
    const spy = vi.fn();
    (api as unknown as Record<string, unknown>).exportDataAsExcel = spy;

    exportGridToExcel(api);
    const { processCellCallback } = spy.mock.calls[0][0];

    expect(processCellCallback({ value: '=cmd|/c calc' })).toBe("'=cmd|/c calc");
    expect(processCellCallback({ value: '가나상사' })).toBe('가나상사');
    // 숫자를 문자열로 바꾸면 엑셀에서 Number 서식이 깨진다
    expect(processCellCallback({ value: 1234 })).toBe(1234);
  });

  it('헤더 이름을 재정의할 수 있다', async () => {
    await mountGrid();
    const spy = vi.fn();
    (api as unknown as Record<string, unknown>).exportDataAsExcel = spy;

    exportGridToExcel(api, { columns: [{ colId: 'qty', header: '출고수량' }] });
    const { processHeaderCallback } = spy.mock.calls[0][0];

    const column = getExportableColumns(api).find((c) => c.getColId() === 'qty')!;
    expect(processHeaderCallback({ column, api })).toBe('출고수량');
  });
});
