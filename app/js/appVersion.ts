/** App version from package.json (injected at build/dev time by Vite). */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '0.0.0-dev';
