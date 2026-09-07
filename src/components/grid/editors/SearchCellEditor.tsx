import { useCallback, useEffect, useRef, useState } from 'react';
import { AutoComplete, type RefSelectProps } from 'antd';
import { useGridCellEditor, type CustomCellEditorProps } from 'ag-grid-react';
import type { CommonSelectOption, SelectValue } from '../../select/CommonSelect';

/** colDef.cellEditorParams 로 넘기는 값 */
export interface SearchCellEditorParams<T extends SelectValue = SelectValue> {
  /** 키워드로 후보 목록을 조회한다 */
  onSearch: (keyword: string) => Promise<CommonSelectOption<T>[]>;
  /** 입력이 멈춘 뒤 조회까지 대기 시간(ms). 기본 300 */
  debounceMs?: number;
  /** 조회를 시작할 최소 글자수. 기본 1 */
  minLength?: number;
  /** 셀 값을 입력창에 표시할 텍스트로 바꾼다. 없으면 값을 그대로 쓴다 */
  toLabel?: (value: T | null | undefined) => string;
  /** 조회 실패 시 호출. 없으면 목록만 비운다 */
  onError?: (error: unknown) => void;
  placeholder?: string;
}

export type SearchCellEditorProps<TData = unknown, T extends SelectValue = SelectValue> =
  CustomCellEditorProps<TData, T> & SearchCellEditorParams<T>;

/** AutoComplete 는 입력창에 option.value 를 채우므로 label 을 value 자리에 쓰고 원본은 item 으로 들고 간다 */
interface SearchOption<T extends SelectValue> {
  value: string;
  key: string;
  item: CommonSelectOption<T>;
}

function defaultLabel<T extends SelectValue>(value: T | null | undefined): string {
  return value == null ? '' : String(value);
}

/**
 * fullRow 편집용 비동기 검색 에디터.
 *
 * 목록에서 고른 항목만 셀 값으로 확정한다. 자유 입력은 커밋하지 않고 포커스가 빠질 때 되돌린다
 * (코드성 컬럼에 없는 값이 들어가는 걸 막는다).
 */
export function SearchCellEditor<TData = unknown, T extends SelectValue = SelectValue>({
  value,
  onValueChange,
  cellStartedEdit,
  onSearch,
  debounceMs = 300,
  minLength = 1,
  toLabel = defaultLabel,
  onError,
  placeholder = '검색어 입력',
}: SearchCellEditorProps<TData, T>) {
  const inputRef = useRef<RefSelectProps>(null);
  // 확정된 값의 표시 텍스트. 자유 입력을 되돌릴 기준점이다
  const committedLabel = useRef(toLabel(value));
  const [text, setText] = useState(committedLabel.current);
  const [options, setOptions] = useState<SearchOption<T>[]>([]);
  const [loading, setLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  // 늦게 도착한 이전 요청 결과가 최신 결과를 덮어쓰지 않게 한다
  const requestSeq = useRef(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const runSearch = useCallback(
    async (keyword: string) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      try {
        const result = await onSearch(keyword);
        if (seq !== requestSeq.current) return;
        setOptions(
          result.map((item) => ({ value: item.label, key: String(item.value), item })),
        );
      } catch (error) {
        if (seq !== requestSeq.current) return;
        setOptions([]);
        onError?.(error);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [onSearch, onError],
  );

  const handleTextChange = useCallback(
    (next: string) => {
      setText(next);
      clearTimeout(timerRef.current);

      if (next.length < minLength) {
        // 진행 중이던 요청 결과를 버린다
        requestSeq.current += 1;
        setOptions([]);
        setLoading(false);
        return;
      }
      timerRef.current = setTimeout(() => void runSearch(next), debounceMs);
    },
    [debounceMs, minLength, runSearch],
  );

  const handleSelect = useCallback(
    (_: string, option: SearchOption<T>) => {
      committedLabel.current = option.item.label;
      setText(option.item.label);
      onValueChange(option.item.value);
    },
    [onValueChange],
  );

  const focusIn = useCallback(() => inputRef.current?.focus(), []);

  const focusOut = useCallback(() => {
    clearTimeout(timerRef.current);
    // 고르지 않고 떠나면 확정된 값의 텍스트로 되돌린다
    setText(committedLabel.current);
    setOptions([]);
    inputRef.current?.blur();
  }, []);

  useGridCellEditor({ focusIn, focusOut });

  // 편집을 시작한 셀에는 AG Grid 가 focusIn 을 부르지 않는다 (셀 간 이동할 때만 부른다)
  useEffect(() => {
    if (cellStartedEdit) focusIn();
  }, [cellStartedEdit, focusIn]);

  return (
    <AutoComplete<string, SearchOption<T>>
      ref={inputRef}
      value={text}
      options={options}
      onChange={handleTextChange}
      onSelect={handleSelect}
      placeholder={placeholder}
      notFoundContent={loading ? '검색 중…' : '결과가 없습니다.'}
      style={{ width: '100%' }}
    />
  );
}
