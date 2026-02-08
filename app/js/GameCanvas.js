/**
 * Game Canvas Manager
 * Handles the game area, click tracking, and marker display
 */
class GameCanvas extends EventEmitter {
    constructor(containerElement, markersElement) {
        super();
        this.container = containerElement;
        this.markersContainer = markersElement;
        this.clicks = new Map(); // playerId -> click data
        this.markers = new Map(); // playerId -> DOM element

        this.setupEventListeners();
    }

    /**
     * Set up click listeners
     */
    setupEventListeners() {
        this.container.addEventListener('click', (e) => {
            const rect = this.container.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            this.emit('click', { x, y });
        });
    }

    /**
     * Add or update a click marker
     */
    setClick(playerId, playerName, color, x, y) {
        // Store click data
        this.clicks.set(playerId, { playerName, color, x, y, timestamp: Date.now() });

        // Get or create marker element
        let marker = this.markers.get(playerId);
        
        if (!marker) {
            marker = document.createElement('div');
            marker.className = 'click-marker';
            marker.id = `marker-${playerId}`;
            this.markersContainer.appendChild(marker);
            this.markers.set(playerId, marker);
        }

        // Update marker position and style
        marker.style.left = `${x}%`;
        marker.style.top = `${y}%`;
        marker.style.backgroundColor = color;
        marker.style.color = color;
        marker.setAttribute('data-name', playerName);
    }

    /**
     * Remove a player's click marker
     */
    removeClick(playerId) {
        this.clicks.delete(playerId);
        
        const marker = this.markers.get(playerId);
        if (marker) {
            marker.remove();
            this.markers.delete(playerId);
        }
    }

    /**
     * Load all clicks from game state
     */
    loadClicks(clicksData) {
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

    /**
     * Clear all markers
     */
    clear() {
        this.clicks.clear();
        this.markersContainer.innerHTML = '';
        this.markers.clear();
    }

    /**
     * Get current click state
     */
    getState() {
        return Object.fromEntries(this.clicks);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameCanvas;
}
