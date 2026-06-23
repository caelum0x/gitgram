import { useState, useCallback } from 'react';
import Toast from '../components/common/Toast';

interface ToastState {
  message: string;
  type?: 'success' | 'error' | 'info';
  visible: boolean;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    message: '',
    type: 'info',
    visible: false,
  });

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      setToast({ message, type, visible: true });
    },
    []
  );

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const ToastComponent = toast.visible ? (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={hideToast}
    />
  ) : null;

  return {
    showToast,
    hideToast,
    ToastComponent,
  };
}

