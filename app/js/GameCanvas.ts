/**
 * Game Canvas Manager
 * Handles the game area, click tracking, and marker display
 */

interface ClickData {
    playerName: string;
    color: string;
    x: number;
    y: number;
    timestamp: number;
}

interface ClickDataFromState {
    playerId: string;
    playerName: string;
    color: string;
    x: number;
    y: number;
}

class GameCanvas extends EventEmitter {
    private container: HTMLElement;
    private markersContainer: HTMLElement;
    private clicks = new Map<string, ClickData>();
    private markers = new Map<string, HTMLElement>();

    constructor(containerElement: HTMLElement, markersElement: HTMLElement) {
        super();
        this.container = containerElement;
        this.markersContainer = markersElement;
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.container.addEventListener('click', (e: MouseEvent) => {
            const rect = this.container.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            this.emit('click', { x, y });
        });
    }

    setClick(playerId: string, playerName: string, color: string, x: number, y: number): void {
        this.clicks.set(playerId, { playerName, color, x, y, timestamp: Date.now() });
        let marker = this.markers.get(playerId);
        if (!marker) {
            marker = document.createElement('div');
            marker.className = 'click-marker';
            marker.id = `marker-${playerId}`;
            this.markersContainer.appendChild(marker);
            this.markers.set(playerId, marker);
        }
        marker.style.left = `${x}%`;
        marker.style.top = `${y}%`;
        marker.style.backgroundColor = color;
        marker.style.color = color;
        marker.setAttribute('data-name', playerName);
    }

    removeClick(playerId: string): void {
        this.clicks.delete(playerId);
        const marker = this.markers.get(playerId);
        if (marker) {
            marker.remove();
            this.markers.delete(playerId);
        }
    }

    loadClicks(clicksData: Record<string, ClickDataFromState>): void {
        this.clear();
        for (const click of Object.values(clicksData)) {
            this.setClick(
                click.playerId,
                click.playerName,
                click.color,
                click.x,
                click.y
            );
        }
    }

    clear(): void {
        this.clicks.clear();
        this.markersContainer.innerHTML = '';
        this.markers.clear();
    }

    getState(): Record<string, ClickData> {
        return Object.fromEntries(this.clicks);
    }
}
