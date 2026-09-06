import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CommonForm } from '../components/form/CommonForm';
import { FormField } from '../components/form/FormField';
import { CommonInput } from '../components/input/CommonInput';

const schema = z.object({
  name: z.string().min(1, '이름은 필수입니다'),
});
type FormValues = z.infer<typeof schema>;

function renderForm(onSubmit: (values: FormValues) => void) {
  return render(
    <CommonForm schema={schema} defaultValues={{ name: '' }} onSubmit={onSubmit}>
      <FormField<FormValues> name="name" label="이름" required>
        <CommonInput placeholder="이름 입력" />
      </FormField>
    </CommonForm>,
  );
}

describe('CommonForm', () => {
  it('zod 검증에 실패하면 에러 메시지를 보여주고 onSubmit을 호출하지 않는다', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(screen.getByText('이름은 필수입니다')).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('검증을 통과하면 입력값으로 onSubmit을 호출한다', async () => {
    const onSubmit = vi.fn();
    renderForm(onSubmit);

    await userEvent.type(screen.getByPlaceholderText('이름 입력'), '홍길동');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toEqual({ name: '홍길동' });
  });
});
