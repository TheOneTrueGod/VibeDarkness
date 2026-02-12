/**
 * Toast notifications (showToast)
 */

export class ToastManager {
    private toastContainer: HTMLElement;

    constructor(containerId = 'toast-container') {
        const el = document.getElementById(containerId);
        if (!el) throw new Error(containerId + ' not found');
        this.toastContainer = el;
    }

    showToast(message: string, type = 'info', duration = 4000): void {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}
