import { useCallback, useState } from 'react';
import { Modal, type ModalProps } from 'antd';

export interface CommonModalProps extends Omit<ModalProps, 'onOk' | 'confirmLoading'> {
  /** Promise를 반환하면 완료까지 확인 버튼이 로딩 상태가 된다 */
  onOk?: () => void | Promise<void>;
}

export function CommonModal({
  onOk,
  okText = '확인',
  cancelText = '취소',
  maskClosable = false,
  destroyOnClose = true,
  centered = true,
  children,
  ...rest
}: CommonModalProps) {
  const [loading, setLoading] = useState(false);

  const handleOk = useCallback(async () => {
    if (!onOk) return;
    try {
      setLoading(true);
      await onOk();
    } finally {
      setLoading(false);
    }
  }, [onOk]);

  return (
    <Modal
      onOk={handleOk}
      confirmLoading={loading}
      okText={okText}
      cancelText={cancelText}
      maskClosable={maskClosable}
      destroyOnClose={destroyOnClose}
      centered={centered}
      {...rest}
    >
      {children}
    </Modal>
  );
}

/** 삭제 등 위험한 동작 확인용 단축 함수 */
export function confirmModal(options: {
  title: string;
  content?: React.ReactNode;
  onOk: () => void | Promise<void>;
  danger?: boolean;
}) {
  const { danger, ...rest } = options;
  return Modal.confirm({
    okText: '확인',
    cancelText: '취소',
    centered: true,
    okButtonProps: danger ? { danger: true } : undefined,
    ...rest,
  });
}
