import type { Ref } from 'react';
import { Select, type RefSelectProps, type SelectProps } from 'antd';

export type SelectValue = string | number;

export interface CommonSelectOption<T extends SelectValue = SelectValue> {
  label: string;
  value: T;
  disabled?: boolean;
}

export interface CommonSelectProps<T extends SelectValue = SelectValue>
  extends Omit<SelectProps<T>, 'options'> {
  options: CommonSelectOption<T>[];
  /** antd Select 인스턴스 접근용. 제네릭을 유지하려고 forwardRef 대신 prop 으로 받는다 */
  selectRef?: Ref<RefSelectProps>;
}

/** label 기준 검색 + allowClear 가 기본으로 켜진 Select */
export function CommonSelect<T extends SelectValue = SelectValue>({
  options,
  selectRef,
  showSearch = true,
  allowClear = true,
  placeholder = '선택하세요',
  style,
  ...rest
}: CommonSelectProps<T>) {
  return (
    <Select<T>
      ref={selectRef}
      options={options}
      showSearch={showSearch}
      allowClear={allowClear}
      placeholder={placeholder}
      optionFilterProp="label"
      style={{ width: '100%', ...style }}
      {...rest}
    />
  );
}
