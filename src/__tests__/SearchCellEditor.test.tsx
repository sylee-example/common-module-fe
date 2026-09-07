import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchCellEditor } from '../components/grid/editors/SearchCellEditor';
import type { CommonSelectOption } from '../components/select/CommonSelect';

// ag-grid-react 를 붙이지 않고 에디터만 검증한다. focusIn/focusOut 은 그리드가 부르는 콜백이라 여기선 무시
vi.mock('ag-grid-react', () => ({ useGridCellEditor: () => {} }));

type Props = Parameters<typeof SearchCellEditor<unknown, string>>[0];

function renderEditor(overrides: Partial<Props> = {}) {
  const onValueChange = vi.fn();
  const props = {
    value: null,
    initialValue: null,
    onValueChange,
    onSearch: vi.fn(async () => []),
    ...overrides,
  } as unknown as Props;

  render(<SearchCellEditor<unknown, string> {...props} />);
  return { onValueChange, onSearch: props.onSearch };
}

const opt = (label: string, value: string): CommonSelectOption<string> => ({ label, value });

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('SearchCellEditor', () => {
  it('debounce 시간이 지난 뒤 한 번만 조회한다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSearch = vi.fn(async () => [opt('서울', 'SEOUL')]);
    renderEditor({ onSearch, debounceMs: 300 });

    await user.type(screen.getByRole('combobox'), '서울');
    expect(onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    await waitFor(() => expect(onSearch).toHaveBeenCalledTimes(1));
    expect(onSearch).toHaveBeenCalledWith('서울');
  });

  it('minLength 미만이면 조회하지 않는다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSearch = vi.fn(async () => []);
    renderEditor({ onSearch, minLength: 2, debounceMs: 0 });

    await user.type(screen.getByRole('combobox'), 'a');
    vi.advanceTimersByTime(50);
    expect(onSearch).not.toHaveBeenCalled();

    await user.type(screen.getByRole('combobox'), 'b');
    vi.advanceTimersByTime(50);
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('ab'));
  });

  it('늦게 도착한 이전 요청 결과가 최신 결과를 덮어쓰지 않는다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolveSlow: (v: CommonSelectOption<string>[]) => void = () => {};

    const onSearch = vi
      .fn<(k: string) => Promise<CommonSelectOption<string>[]>>()
      // 첫 요청: 느리게 응답
      .mockImplementationOnce(() => new Promise((res) => (resolveSlow = res)))
      // 두 번째 요청: 즉시 응답
      .mockImplementationOnce(async () => [opt('부산', 'BUSAN')]);

    renderEditor({ onSearch, debounceMs: 0 });
    const input = screen.getByRole('combobox');

    await user.type(input, '가');
    vi.advanceTimersByTime(10);
    await user.type(input, '나');
    vi.advanceTimersByTime(10);

    await waitFor(() => expect(screen.getByTitle('부산')).toBeInTheDocument());

    // 뒤늦게 도착한 첫 요청 결과는 무시되어야 한다
    resolveSlow([opt('서울', 'SEOUL')]);
    await Promise.resolve();

    expect(screen.getByTitle('부산')).toBeInTheDocument();
    expect(screen.queryByTitle('서울')).not.toBeInTheDocument();
  });

  it('목록에서 고른 항목의 value 를 커밋하고 label 을 표시한다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSearch = vi.fn(async () => [opt('서울', 'SEOUL')]);
    const { onValueChange } = renderEditor({ onSearch, debounceMs: 0 });

    const input = screen.getByRole('combobox');
    await user.type(input, '서');
    vi.advanceTimersByTime(10);

    await user.click(await screen.findByTitle('서울'));

    expect(onValueChange).toHaveBeenCalledWith('SEOUL');
    expect(input).toHaveValue('서울');
  });

  it('조회가 실패하면 목록을 비우고 onError 로 알린다', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const error = new Error('boom');
    const onSearch = vi.fn(async () => {
      throw error;
    });
    const onError = vi.fn();
    renderEditor({ onSearch, onError, debounceMs: 0 });

    await user.type(screen.getByRole('combobox'), '서울');
    vi.advanceTimersByTime(10);

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(screen.queryByTitle('서울')).not.toBeInTheDocument();
  });

  it('toLabel 로 초기 셀 값의 표시 텍스트를 만든다', () => {
    renderEditor({
      value: 'SEOUL',
      toLabel: (v: string | null | undefined) => (v === 'SEOUL' ? '서울' : ''),
    });
    expect(screen.getByRole('combobox')).toHaveValue('서울');
  });
});
