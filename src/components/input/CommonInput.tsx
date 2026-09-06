import { forwardRef } from 'react';
import { Input, InputNumber, type InputProps, type InputRef } from 'antd';
import type { TextAreaProps } from 'antd/es/input';
import type { InputNumberProps } from 'antd/es/input-number';

export type CommonInputType = 'text' | 'password' | 'textarea' | 'number';

export type CommonInputProps =
  | ({ type?: 'text' } & InputProps)
  | ({ type: 'password' } & InputProps)
  | ({ type: 'textarea' } & TextAreaProps)
  | ({ type: 'number' } & InputNumberProps);

/**
 * antd Input 계열 단일 진입점.
 * type 하나로 text / password / textarea / number 를 바꾼다.
 */
export const CommonInput = forwardRef<InputRef, CommonInputProps>(function CommonInput(props, ref) {
  const { type = 'text', ...rest } = props;

  switch (type) {
    case 'password':
      return <Input.Password ref={ref} allowClear {...(rest as InputProps)} />;
    case 'textarea':
      return <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} {...(rest as TextAreaProps)} />;
    case 'number':
      return <InputNumber style={{ width: '100%' }} {...(rest as InputNumberProps)} />;
    default:
      return <Input ref={ref} allowClear {...(rest as InputProps)} />;
  }
});
