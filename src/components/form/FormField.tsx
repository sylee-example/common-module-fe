import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Form } from 'antd';
import { Controller, useFormContext, type FieldValues, type Path } from 'react-hook-form';

export interface FormFieldProps<T extends FieldValues = FieldValues> {
  name: Path<T>;
  label?: ReactNode;
  /** 라벨 옆 별표 표시만 담당. 실제 검증은 zod 스키마가 한다 */
  required?: boolean;
  extra?: ReactNode;
  /** CommonInput / CommonSelect / DatePicker 등 value·onChange를 받는 단일 엘리먼트 */
  children: ReactElement;
}

/**
 * RHF Controller + antd Form.Item 연결 어댑터.
 * 자식 엘리먼트에 value/onChange/status를 주입하므로 자식은 제어 컴포넌트여야 한다.
 */
export function FormField<T extends FieldValues = FieldValues>({
  name,
  label,
  required,
  extra,
  children,
}: FormFieldProps<T>) {
  const { control } = useFormContext<T>();

  if (!isValidElement(children)) {
    throw new Error('FormField의 children은 단일 React 엘리먼트여야 합니다.');
  }

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item
          label={label}
          required={required}
          extra={extra}
          validateStatus={fieldState.error ? 'error' : undefined}
          help={fieldState.error?.message}
        >
          {cloneElement(children as ReactElement<Record<string, unknown>>, {
            ...field,
            value: field.value ?? undefined,
            status: fieldState.error ? 'error' : undefined,
          })}
        </Form.Item>
      )}
    />
  );
}
