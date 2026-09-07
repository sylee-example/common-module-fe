import { describe, expect, it } from 'vitest';
import {
  resolveEditNavigation,
  readCaret,
  isDropdownOpen,
  type EditNavContext,
} from '../components/grid/gridEditNavigation';

/** 기본 컨텍스트: 5행(0~4) x 3열(0~2) 그리드의 한가운데 셀, 캐럿 없음 */
function ctx(overrides: Partial<EditNavContext> = {}): EditNavContext {
  return {
    key: 'ArrowRight',
    rowIndex: 2,
    firstRowIndex: 0,
    lastRowIndex: 4,
    colIndex: 1,
    lastColIndex: 2,
    caret: null,
    dropdownOpen: false,
    ...overrides,
  };
}

describe('resolveEditNavigation - 상/하 이동', () => {
  it('최상위 로우에서 위로 가면 차단한다 (헤더로 이동 금지)', () => {
    expect(resolveEditNavigation(ctx({ key: 'ArrowUp', rowIndex: 0 }))).toEqual({ type: 'block' });
  });

  it('마지막 로우에서 아래로 가면 차단한다', () => {
    expect(resolveEditNavigation(ctx({ key: 'ArrowDown', rowIndex: 4 }))).toEqual({ type: 'block' });
  });

  it('중간 로우에서는 위/아래로 편집 행을 옮긴다', () => {
    expect(resolveEditNavigation(ctx({ key: 'ArrowUp' }))).toEqual({ type: 'row', rowIndex: 1 });
    expect(resolveEditNavigation(ctx({ key: 'ArrowDown' }))).toEqual({ type: 'row', rowIndex: 3 });
  });

  it('페이지네이션으로 firstRowIndex가 밀려도 그 경계를 지킨다', () => {
    const paged = { firstRowIndex: 50, lastRowIndex: 99, rowIndex: 50 };
    expect(resolveEditNavigation(ctx({ key: 'ArrowUp', ...paged }))).toEqual({ type: 'block' });
    expect(resolveEditNavigation(ctx({ key: 'ArrowDown', ...paged }))).toEqual({
      type: 'row',
      rowIndex: 51,
    });
  });

  it('드롭다운이 열려 있으면 상/하를 select 에 넘긴다 (옵션 이동)', () => {
    expect(resolveEditNavigation(ctx({ key: 'ArrowUp', dropdownOpen: true }))).toEqual({
      type: 'native',
    });
    expect(resolveEditNavigation(ctx({ key: 'ArrowDown', dropdownOpen: true }))).toEqual({
      type: 'native',
    });
  });

  it('드롭다운이 열려 있어도 상/하가 그리드 경계를 넘지는 않는지와 무관하게 native 가 우선한다', () => {
    expect(
      resolveEditNavigation(ctx({ key: 'ArrowUp', rowIndex: 0, dropdownOpen: true })),
    ).toEqual({ type: 'native' });
  });
});

describe('resolveEditNavigation - 좌/우 이동', () => {
  it('캐럿이 없으면(빈 입력·readonly) 좌/우는 칸을 옮긴다', () => {
    expect(resolveEditNavigation(ctx({ key: 'ArrowLeft' }))).toEqual({
      type: 'cell',
      direction: -1,
    });
    expect(resolveEditNavigation(ctx({ key: 'ArrowRight' }))).toEqual({
      type: 'cell',
      direction: 1,
    });
  });

  it('맨 왼쪽 칸에서 왼쪽으로 가면 차단한다', () => {
    expect(resolveEditNavigation(ctx({ key: 'ArrowLeft', colIndex: 0 }))).toEqual({
      type: 'block',
    });
  });

  it('맨 오른쪽 칸에서 오른쪽으로 가면 차단한다', () => {
    expect(resolveEditNavigation(ctx({ key: 'ArrowRight', colIndex: 2 }))).toEqual({
      type: 'block',
    });
  });

  it('텍스트 중간에 캐럿이 있으면 input 안에서 이동한다', () => {
    const caret = { start: 2, end: 2, length: 5 };
    expect(resolveEditNavigation(ctx({ key: 'ArrowLeft', caret }))).toEqual({ type: 'native' });
    expect(resolveEditNavigation(ctx({ key: 'ArrowRight', caret }))).toEqual({ type: 'native' });
  });

  it('텍스트 맨 왼쪽이면 이전 칸으로 이동한다', () => {
    const caret = { start: 0, end: 0, length: 5 };
    expect(resolveEditNavigation(ctx({ key: 'ArrowLeft', caret }))).toEqual({
      type: 'cell',
      direction: -1,
    });
  });

  it('텍스트 맨 오른쪽이면 다음 칸으로 이동한다', () => {
    const caret = { start: 5, end: 5, length: 5 };
    expect(resolveEditNavigation(ctx({ key: 'ArrowRight', caret }))).toEqual({
      type: 'cell',
      direction: 1,
    });
  });

  it('텍스트 맨 왼쪽이라도 첫 칸이면 차단한다', () => {
    const caret = { start: 0, end: 0, length: 5 };
    expect(resolveEditNavigation(ctx({ key: 'ArrowLeft', caret, colIndex: 0 }))).toEqual({
      type: 'block',
    });
  });

  it('전체 선택 상태에서는 먼저 선택을 접도록 input 에 넘긴다', () => {
    const caret = { start: 0, end: 5, length: 5 };
    expect(resolveEditNavigation(ctx({ key: 'ArrowLeft', caret }))).toEqual({ type: 'native' });
    expect(resolveEditNavigation(ctx({ key: 'ArrowRight', caret }))).toEqual({ type: 'native' });
  });
});

describe('resolveEditNavigation - 드롭다운이 열린 동안의 확정/취소 키', () => {
  it('드롭다운이 열려 있으면 Enter 를 AG Grid 로부터 지킨다', () => {
    // AG Grid 가 Enter 를 먼저 잡으면 편집이 끝나버려 하이라이트된 옵션이 버려진다
    expect(resolveEditNavigation(ctx({ key: 'Enter', dropdownOpen: true }))).toEqual({
      type: 'defer',
    });
  });

  it('드롭다운이 열려 있으면 Escape 도 지킨다 (편집 전체가 아니라 목록만 닫아야 한다)', () => {
    expect(resolveEditNavigation(ctx({ key: 'Escape', dropdownOpen: true }))).toEqual({
      type: 'defer',
    });
  });

  it('드롭다운이 닫혀 있으면 Enter/Escape 는 AG Grid 기본 동작에 맡긴다', () => {
    expect(resolveEditNavigation(ctx({ key: 'Enter' }))).toEqual({ type: 'native' });
    expect(resolveEditNavigation(ctx({ key: 'Escape' }))).toEqual({ type: 'native' });
  });
});

describe('resolveEditNavigation - 그 외 키', () => {
  it.each(['Tab', 'a', 'F2'])('%s 는 건드리지 않는다', (key) => {
    expect(resolveEditNavigation(ctx({ key }))).toEqual({ type: 'native' });
  });
});

describe('readCaret', () => {
  it('일반 text input 의 캐럿을 읽는다', () => {
    const el = document.createElement('input');
    el.value = 'hello';
    document.body.appendChild(el);
    el.setSelectionRange(2, 4);
    expect(readCaret(el)).toEqual({ start: 2, end: 4, length: 5 });
    el.remove();
  });

  it('textarea 도 읽는다', () => {
    const el = document.createElement('textarea');
    el.value = 'abc';
    document.body.appendChild(el);
    el.setSelectionRange(3, 3);
    expect(readCaret(el)).toEqual({ start: 3, end: 3, length: 3 });
    el.remove();
  });

  it('readonly / disabled input 은 캐럿 없음으로 본다', () => {
    const ro = document.createElement('input');
    ro.readOnly = true;
    expect(readCaret(ro)).toBeNull();

    const disabled = document.createElement('input');
    disabled.disabled = true;
    expect(readCaret(disabled)).toBeNull();
  });

  it('input 이 아닌 요소는 캐럿 없음으로 본다', () => {
    expect(readCaret(document.createElement('div'))).toBeNull();
    expect(readCaret(null)).toBeNull();
  });

  it('selectionStart 를 제공하지 않는 input 타입은 캐럿 없음으로 본다', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    expect(readCaret(checkbox)).toBeNull();
  });
});

describe('isDropdownOpen', () => {
  it('aria-expanded="true" 인 조상이 있으면 열린 것으로 본다', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div><input role="combobox" aria-expanded="true" /></div>';
    const input = wrap.querySelector('input');
    expect(isDropdownOpen(input)).toBe(true);
  });

  it('aria-expanded="false" 면 닫힌 것으로 본다', () => {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<input role="combobox" aria-expanded="false" />';
    expect(isDropdownOpen(wrap.querySelector('input'))).toBe(false);
  });

  it('aria-expanded 가 없으면 닫힌 것으로 본다', () => {
    expect(isDropdownOpen(document.createElement('input'))).toBe(false);
    expect(isDropdownOpen(null)).toBe(false);
  });
});
