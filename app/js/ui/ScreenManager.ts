/**
 * Screen transitions (showScreen)
 */

export class ScreenManager {
    private currentScreen = 'lobby-screen';

    showScreen(screenId: string): void {
        document.querySelectorAll('.screen').forEach((screen) => {
            screen.classList.remove('active');
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;
        }
    }

    getCurrentScreen(): string {
        return this.currentScreen;
    }
}
