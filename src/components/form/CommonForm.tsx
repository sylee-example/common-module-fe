import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, Space, type FormProps } from 'antd';
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';
import type { ZodType } from 'zod';

export interface CommonFormProps<T extends FieldValues> {
  /** zod 스키마. 검증은 전부 여기서만 정의한다 (antd rules 사용 안 함) */
  schema: ZodType<T>;
  defaultValues?: DefaultValues<T>;
  onSubmit: SubmitHandler<T>;
  children: ReactNode | ((methods: UseFormReturn<T>) => ReactNode);
  layout?: FormProps['layout'];
  labelCol?: FormProps['labelCol'];
  wrapperCol?: FormProps['wrapperCol'];
  /** 지정하면 하단에 제출 버튼을 그린다. null이면 그리지 않음 */
  submitText?: string | null;
  resetText?: string | null;
  disabled?: boolean;
}

/**
 * react-hook-form + zod 검증을 antd 레이아웃에 얹은 폼.
 * 필드는 FormField로 감싸서 넣는다.
 */
export function CommonForm<T extends FieldValues>({
  schema,
  defaultValues,
  onSubmit,
  children,
  layout = 'vertical',
  labelCol,
  wrapperCol,
  submitText = '저장',
  resetText = null,
  disabled = false,
}: CommonFormProps<T>) {
  const methods = useForm<T>({
    resolver: zodResolver(schema) as Resolver<T>,
    defaultValues,
    mode: 'onTouched',
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = methods;

  return (
    <FormProvider {...methods}>
      <Form
        layout={layout}
        labelCol={labelCol}
        wrapperCol={wrapperCol}
        disabled={disabled}
        onFinish={() => void handleSubmit(onSubmit)()}
      >
        {typeof children === 'function' ? children(methods) : children}

        {(submitText || resetText) && (
          <Form.Item>
            <Space>
              {submitText && (
                <Button type="primary" htmlType="submit" loading={isSubmitting}>
                  {submitText}
                </Button>
              )}
              {resetText && (
                <Button htmlType="button" onClick={() => reset()}>
                  {resetText}
                </Button>
              )}
            </Space>
          </Form.Item>
        )}
      </Form>
    </FormProvider>
  );
}
