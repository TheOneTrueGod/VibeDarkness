/**
 * Bootstrap: start the app on DOMContentLoaded and expose on window.app
 */

import { GameApp } from './GameApp.js';

declare global {
    interface Window {
        app?: GameApp;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new GameApp();
});
