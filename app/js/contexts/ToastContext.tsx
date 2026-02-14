/**
 * Toast notification context - provides showToast() to all components
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface Toast {
    id: number;
    message: string;
    type: 'info' | 'success' | 'error' | 'warning';
    fading: boolean;
}

interface ToastContextValue {
    showToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning', duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

const BORDER_COLORS: Record<string, string> = {
    info: 'border-l-primary',
    success: 'border-l-success',
    error: 'border-l-danger',
    warning: 'border-l-warning',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(0);

    const showToast = useCallback(
        (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', duration = 4000) => {
            const id = nextId.current++;
            setToasts((prev) => [...prev, { id, message, type, fading: false }]);
            setTimeout(() => {
                setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, fading: true } : t)));
                setTimeout(() => {
                    setToasts((prev) => prev.filter((t) => t.id !== id));
                }, 300);
            }, duration);
        },
        []
    );

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-5 right-5 z-[1000] flex flex-col gap-2">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`px-5 py-4 bg-surface rounded shadow border-l-4 ${BORDER_COLORS[toast.type] ?? ''} flex items-center gap-3 min-w-[280px] ${
                            toast.fading ? 'animate-fade-out' : 'animate-slide-in'
                        }`}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
