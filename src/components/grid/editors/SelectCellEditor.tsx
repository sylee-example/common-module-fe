import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefSelectProps } from 'antd';
import { useGridCellEditor, type CustomCellEditorProps } from 'ag-grid-react';
import {
  CommonSelect,
  type CommonSelectOption,
  type CommonSelectProps,
  type SelectValue,
} from '../../select/CommonSelect';

/** colDef.cellEditorParams 로 넘기는 값 */
export interface SelectCellEditorParams<T extends SelectValue = SelectValue> {
  options: CommonSelectOption<T>[];
  /** CommonSelect 에 그대로 전달할 나머지 옵션 */
  selectProps?: Omit<CommonSelectProps<T>, 'options' | 'selectRef'>;
}

export type SelectCellEditorProps<TData = unknown, T extends SelectValue = SelectValue> =
  CustomCellEditorProps<TData, T> & SelectCellEditorParams<T>;

/**
 * fullRow 편집용 Select 에디터.
 *
 * 포커스가 들어온 셀의 드롭다운만 열린다. fullRow 는 행의 모든 에디터가 동시에 마운트되므로
 * defaultOpen 을 쓰면 전부 열려버린다. AG Grid 가 호출하는 focusIn/focusOut 으로 제어한다.
 */
export function SelectCellEditor<TData = unknown, T extends SelectValue = SelectValue>({
  value,
  onValueChange,
  cellStartedEdit,
  options,
  selectProps,
}: SelectCellEditorProps<TData, T>) {
  const selectRef = useRef<RefSelectProps>(null);
  const [open, setOpen] = useState(false);

  const focusIn = useCallback(() => {
    selectRef.current?.focus();
    setOpen(true);
  }, []);

  const focusOut = useCallback(() => {
    setOpen(false);
    selectRef.current?.blur();
  }, []);

  useGridCellEditor({ focusIn, focusOut });

  // AG Grid 는 편집을 시작한 셀에는 focusIn 을 부르지 않는다 (셀 간 이동할 때만 부른다).
  // 더블클릭·Enter 로 편집을 연 칸도 드롭다운이 열리도록 직접 처리한다.
  useEffect(() => {
    if (cellStartedEdit) focusIn();
  }, [cellStartedEdit, focusIn]);

  return (
    <CommonSelect<T>
      {...selectProps}
      selectRef={selectRef}
      options={options}
      value={value ?? undefined}
      open={open}
      // Enter/Escape 로 닫힌 상태를 aria-expanded 에 반영해야 상/하 방향키가 행 이동으로 넘어간다
      onOpenChange={setOpen}
      // fullRow 편집이라 값이 바뀌어도 편집을 끝내지 않는다. 행 전체가 함께 커밋된다
      onChange={(next) => onValueChange(next ?? null)}
    />
  );
}
