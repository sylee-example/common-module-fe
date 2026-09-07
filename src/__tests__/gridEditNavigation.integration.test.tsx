import { useRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommonGrid, type CommonGridProps } from '../components/grid/CommonGrid';

interface Row {
  name: string;
  role: string;
  memo: string;
}

// AG Grid 는 커밋 시 rowNode.data 를 직접 고친다. 테스트마다 새 객체를 줘야 격리된다
const makeRows = (): Row[] => [
  { name: '1행', role: 'A', memo: 'm1' },
  { name: '2행', role: 'B', memo: 'm2' },
  { name: '3행', role: 'C', memo: 'm3' },
];

const COLUMNS = [
  { field: 'name' as const, editable: true },
  { field: 'role' as const, editable: true },
  { field: 'memo' as const, editable: true },
];

let api: GridApi<Row>;

function Harness(props: Partial<CommonGridProps<Row>>) {
  const apiRef = useRef<GridApi<Row> | null>(null);
  const rows = useRef(makeRows());
  return (
    <CommonGrid<Row>
      rowData={rows.current}
      columnDefs={COLUMNS}
      pagination={false}
      onGridReady={(e) => {
        apiRef.current = e.api;
        api = e.api;
      }}
      {...props}
    />
  );
}

async function mountGrid(props: Partial<CommonGridProps<Row>> = {}) {
  render(<Harness {...props} />);
  await screen.findByText('1행');
}

/** 편집 중인 행 인덱스 (fullRow 라 행 전체가 편집 상태다) */
function editingRow(): number | undefined {
  return api.getEditingCells()[0]?.rowIndex;
}

function focusedColId(): string | undefined {
  return api.getFocusedCell()?.column.getColId();
}

/** 현재 포커스된 편집 input 에서 키를 쏜다. 캐럿 위치를 지정하면 그대로 맞춘 뒤 쏜다 */
function pressKey(key: string, caret?: number) {
  const el = document.activeElement as HTMLInputElement | null;
  if (!el) throw new Error('포커스된 요소가 없다');
  if (caret != null && typeof el.setSelectionRange === 'function') {
    el.setSelectionRange(caret, caret);
  }
  act(() => {
    fireEvent.keyDown(el, { key, bubbles: true });
  });
  return el;
}

async function startEditing(rowIndex: number, colKey: string) {
  act(() => {
    api.setFocusedCell(rowIndex, colKey);
    api.startEditingCell({ rowIndex, colKey });
  });
  await waitFor(() => expect(editingRow()).toBe(rowIndex));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('fullRow 편집 - 상/하 방향키', () => {
  it('중간 행에서 아래로 가면 편집 행이 따라 내려간다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(1, 'name');

    pressKey('ArrowDown');

    await waitFor(() => expect(editingRow()).toBe(2));
    expect(api.getFocusedCell()?.rowIndex).toBe(2);
    // 같은 컬럼을 유지한다
    expect(focusedColId()).toBe('name');
  });

  it('위로 가면 편집 행이 따라 올라간다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(2, 'role');

    pressKey('ArrowUp');

    await waitFor(() => expect(editingRow()).toBe(1));
    expect(focusedColId()).toBe('role');
  });

  it('최상위 행에서 위로 가도 헤더로 넘어가지 않고 편집 상태를 유지한다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(0, 'name');

    pressKey('ArrowUp');

    await waitFor(() => expect(editingRow()).toBe(0));
    expect(api.getFocusedCell()?.rowIndex).toBe(0);
  });

  it('마지막 행에서 아래로 가도 더 내려가지 않는다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(2, 'name');

    pressKey('ArrowDown');

    await waitFor(() => expect(editingRow()).toBe(2));
    expect(api.getFocusedCell()?.rowIndex).toBe(2);
  });

  it('행을 옮기면 이전 행에서 고친 값이 커밋된다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(0, 'name');

    const input = document.activeElement as HTMLInputElement;
    act(() => {
      // AG Grid 텍스트 에디터는 change 가 아니라 input 이벤트를 듣는다
      fireEvent.input(input, { target: { value: '고친값' } });
    });
    pressKey('ArrowDown');

    await waitFor(() => expect(editingRow()).toBe(1));
    expect(api.getDisplayedRowAtIndex(0)?.data?.name).toBe('고친값');
  });
});

describe('fullRow 편집 - 좌/우 방향키', () => {
  it('텍스트 맨 왼쪽이면 이전 칸으로 이동한다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(1, 'role');

    pressKey('ArrowLeft', 0);

    await waitFor(() => expect(focusedColId()).toBe('name'));
    // 행은 그대로다
    expect(editingRow()).toBe(1);
  });

  it('텍스트 끝이면 다음 칸으로 이동한다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(1, 'role');

    const el = document.activeElement as HTMLInputElement;
    pressKey('ArrowRight', el.value.length);

    await waitFor(() => expect(focusedColId()).toBe('memo'));
    expect(editingRow()).toBe(1);
  });

  it('텍스트 중간이면 칸을 옮기지 않고 input 안에서 이동한다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(1, 'memo');

    const el = pressKey('ArrowLeft', 1);

    expect(focusedColId()).toBe('memo');
    // 그리드가 preventDefault 하지 않아 브라우저 기본 캐럿 이동에 맡긴다
    expect(el.selectionStart).toBe(1);
  });

  it('첫 칸에서 왼쪽으로 가도 그리드를 벗어나지 않는다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(1, 'name');

    pressKey('ArrowLeft', 0);

    expect(focusedColId()).toBe('name');
    expect(editingRow()).toBe(1);
  });

  it('마지막 칸에서 오른쪽으로 가도 그리드를 벗어나지 않는다', async () => {
    await mountGrid({ editType: 'fullRow' });
    await startEditing(1, 'memo');

    const el = document.activeElement as HTMLInputElement;
    pressKey('ArrowRight', el.value.length);

    expect(focusedColId()).toBe('memo');
    expect(editingRow()).toBe(1);
  });
});

describe('페이지네이션 경계', () => {
  it('현재 페이지의 마지막 행에서 다음 페이지로 넘어가지 않는다', async () => {
    await mountGrid({
      editType: 'fullRow',
      pagination: true,
      paginationPageSize: 2,
      paginationPageSizeSelector: false,
    });
    // 0,1 이 1페이지. 1행이 페이지 마지막이다
    await startEditing(1, 'name');

    pressKey('ArrowDown');

    await waitFor(() => expect(editingRow()).toBe(1));
    expect(api.paginationGetCurrentPage()).toBe(0);
  });
});

describe('읽기 모드에서는 AG Grid 기본 동작을 그대로 둔다', () => {
  it('editType 이 fullRow 가 아니면 방향키가 기본 셀 이동으로 동작한다', async () => {
    await mountGrid();
    act(() => api.setFocusedCell(0, 'name'));

    const cell = document.querySelector('.ag-cell[col-id="name"]') as HTMLElement;
    act(() => {
      cell.focus();
      fireEvent.keyDown(cell, { key: 'ArrowDown', bubbles: true });
    });

    await waitFor(() => expect(api.getFocusedCell()?.rowIndex).toBe(1));
  });

  it('fullRow 그리드라도 편집 중이 아니면 기본 셀 이동이 살아 있다', async () => {
    await mountGrid({ editType: 'fullRow' });
    act(() => api.setFocusedCell(0, 'name'));
    expect(api.getEditingCells()).toHaveLength(0);

    const cell = document.querySelector('.ag-cell[col-id="name"]') as HTMLElement;
    act(() => {
      cell.focus();
      fireEvent.keyDown(cell, { key: 'ArrowDown', bubbles: true });
    });

    await waitFor(() => expect(api.getFocusedCell()?.rowIndex).toBe(1));
    expect(api.getEditingCells()).toHaveLength(0);
  });
});
