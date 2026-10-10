import { useCallback, useState } from 'preact/hooks';

export interface Toast {
  id: number;
  text: string;
  kind: string;
}

let nextId = 0;

export function useToasts(): [Toast[], (text: string, kind?: 'info' | 'warn' | 'good') => void] {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'info' | 'warn' | 'good' = 'info') => {
    const id = ++nextId;
    setToasts((list) => [...list.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 2200);
  }, []);
  return [toasts, push];
}
