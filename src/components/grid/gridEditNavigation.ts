import type { GridApi } from 'ag-grid-community';

/** input/textarea 안의 캐럿 위치 */
export interface Caret {
  /** 선택 시작 위치 */
  start: number;
  /** 선택 끝 위치 (선택이 없으면 start 와 같다) */
  end: number;
  /** 전체 텍스트 길이 */
  length: number;
}

/** resolveEditNavigation 이 판단에 쓰는 값. DOM 을 직접 보지 않아 단위 테스트가 가능하다 */
export interface EditNavContext {
  key: string;
  /** 현재 포커스된 행 인덱스 */
  rowIndex: number;
  /** 이동 가능한 첫 행 (페이지네이션이면 현재 페이지의 첫 행) */
  firstRowIndex: number;
  /** 이동 가능한 마지막 행 (페이지네이션이면 현재 페이지의 마지막 행) */
  lastRowIndex: number;
  /** 현재 포커스된 컬럼의 표시 순서 */
  colIndex: number;
  /** 마지막 컬럼의 표시 순서 */
  lastColIndex: number;
  /** 포커스된 요소가 텍스트 입력이면 캐럿, 아니면 null */
  caret: Caret | null;
  /** select 드롭다운이 열려 있는지 */
  dropdownOpen: boolean;
}

export type EditNavAction =
  /** 그리드가 관여하지 않는다. 에디터·브라우저 기본 동작에 맡긴다 */
  | { type: 'native' }
  /**
   * AG Grid 만 막고 에디터에게 맡긴다.
   *
   * preventDefault 를 하면 AG Grid 의 processKeyboardEvent 는 defaultPrevented 를 보고 빠지지만,
   * antd 의 키 처리는 React 핸들러라 그대로 실행된다. 이 차이를 이용한다.
   */
  | { type: 'defer' }
  /** 경계라서 아무 데도 못 간다. preventDefault 만 한다 */
  | { type: 'block' }
  /** 같은 행 안에서 좌/우 칸으로 이동한다 */
  | { type: 'cell'; direction: -1 | 1 }
  /** 편집 행을 해당 인덱스로 옮긴다 */
  | { type: 'row'; rowIndex: number };

const NATIVE: EditNavAction = { type: 'native' };
const BLOCK: EditNavAction = { type: 'block' };
const DEFER: EditNavAction = { type: 'defer' };

/**
 * fullRow 편집 중 방향키를 어떻게 처리할지 결정한다.
 * 순수 함수라 DOM 없이 테스트할 수 있다.
 */
export function resolveEditNavigation(ctx: EditNavContext): EditNavAction {
  const { key, rowIndex, firstRowIndex, lastRowIndex, colIndex, lastColIndex, caret } = ctx;

  // 드롭다운이 열려 있는 동안의 확정/취소는 목록을 고르는 쪽이 먼저다.
  // AG Grid 가 가져가면 하이라이트된 옵션이 버려진 채 편집이 끝난다.
  if (ctx.dropdownOpen && (key === 'Enter' || key === 'Escape')) return DEFER;

  switch (key) {
    case 'ArrowUp':
      // 드롭다운이 열려 있으면 상/하는 옵션 목록 이동이다
      if (ctx.dropdownOpen) return NATIVE;
      // 최상위 행이면 헤더로 넘어가지 않도록 막는다
      return rowIndex <= firstRowIndex ? BLOCK : { type: 'row', rowIndex: rowIndex - 1 };

    case 'ArrowDown':
      if (ctx.dropdownOpen) return NATIVE;
      return rowIndex >= lastRowIndex ? BLOCK : { type: 'row', rowIndex: rowIndex + 1 };

    case 'ArrowLeft':
      // 텍스트가 왼쪽에 남아 있으면 캐럿부터 옮긴다 (선택 상태면 선택을 접는다)
      if (caret && caret.end > 0) return NATIVE;
      return colIndex <= 0 ? BLOCK : { type: 'cell', direction: -1 };

    case 'ArrowRight':
      if (caret && caret.start < caret.length) return NATIVE;
      return colIndex >= lastColIndex ? BLOCK : { type: 'cell', direction: 1 };

    default:
      return NATIVE;
  }
}

/** 캐럿을 노출하지 않는 input 타입 (selectionStart 접근이 예외거나 항상 null) */
const NO_CARET_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
  'number',
  'submit',
  'reset',
  'button',
  'image',
  'hidden',
]);

/**
 * 포커스된 요소에서 캐럿을 읽는다. 텍스트 입력이 아니면 null.
 *
 * 검색어가 비어 있는 antd Select 는 length 0 이라 좌/우가 자동으로 칸 이동이 되고,
 * 글자를 입력한 뒤에는 캐럿 이동이 된다. 별도 분기가 필요 없다.
 */
export function readCaret(el: Element | null): Caret | null {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return null;
  if (el.readOnly || el.disabled) return null;
  if (el instanceof HTMLInputElement && NO_CARET_INPUT_TYPES.has(el.type)) return null;

  const { selectionStart, selectionEnd, value } = el;
  if (selectionStart == null || selectionEnd == null) return null;

  return { start: selectionStart, end: selectionEnd, length: value.length };
}

/** antd Select/AutoComplete 드롭다운이 열려 있는지. rc-select 가 input 에 aria-expanded 를 붙인다 */
export function isDropdownOpen(el: Element | null): boolean {
  return el?.closest('[aria-expanded]')?.getAttribute('aria-expanded') === 'true';
}

/**
 * 이동 가능한 행 범위. 페이지네이션이 켜져 있으면 현재 페이지 안으로 제한한다.
 * (다른 페이지로 넘어가면 편집 중이던 행이 화면에서 사라진다)
 */
function getRowBounds(api: GridApi): { first: number; last: number } {
  const count = api.getDisplayedRowCount();
  if (!api.getGridOption('pagination')) return { first: 0, last: count - 1 };

  const pageSize = api.paginationGetPageSize();
  const first = api.paginationGetCurrentPage() * pageSize;
  return { first, last: Math.min(first + pageSize - 1, count - 1) };
}

/**
 * fullRow 편집 중 방향키 핸들러. 그리드 래퍼의 capture 단계에 붙인다.
 *
 * 편집 중이 아니면 아무것도 하지 않으므로 AG Grid 기본 셀 이동이 그대로 동작한다.
 */
export function handleEditNavigation(api: GridApi, event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  // 편집 중이 아니면 AG Grid 기본 동작에 맡긴다
  if (api.getEditingCells().length === 0) return;

  const focused = api.getFocusedCell();
  if (!focused) return;

  const columns = api.getAllDisplayedColumns();
  const colId = focused.column.getColId();
  const colIndex = columns.findIndex((col) => col.getColId() === colId);
  if (colIndex === -1) return;

  const target = event.target as Element | null;
  const { first, last } = getRowBounds(api);

  const action = resolveEditNavigation({
    key: event.key,
    rowIndex: focused.rowIndex,
    firstRowIndex: first,
    lastRowIndex: last,
    colIndex,
    lastColIndex: columns.length - 1,
    caret: readCaret(target),
    dropdownOpen: isDropdownOpen(target),
  });

  if (action.type === 'native') return;

  // preventDefault 를 하면 AG Grid 의 processKeyboardEvent 도 조기 return 한다 (중복 처리 방지)
  event.preventDefault();

  // block: 경계라서 갈 곳이 없다 / defer: AG Grid 만 막고 에디터가 처리하게 둔다
  if (action.type === 'block' || action.type === 'defer') return;

  if (action.type === 'cell') {
    // fullRow 편집 중 셀 간 에디터 포커스 이동은 AG Grid 가 처리한다.
    // 행 경계는 위에서 block 으로 걸러지므로 다른 행으로 넘어가지 않는다.
    if (action.direction === 1) api.tabToNextCell();
    else api.tabToPreviousCell();
    return;
  }

  // 편집 중이던 값을 커밋하고 옮겨간 행에서 같은 컬럼을 편집한다
  api.stopEditing();
  api.setFocusedCell(action.rowIndex, colId);
  api.startEditingCell({ rowIndex: action.rowIndex, colKey: colId });
}
