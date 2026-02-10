/**
 * Chat Manager
 * Handles chat UI and message display
 */

interface ChatMessageEntry {
    playerId?: string;
    playerName?: string;
    playerColor?: string;
    message?: string;
    timestamp?: number;
}

interface SystemMessageEntry {
    system: true;
    message: string;
    timestamp: number;
}

type MessageEntry = ChatMessageEntry | SystemMessageEntry;

function isSystemEntry(entry: MessageEntry): entry is SystemMessageEntry {
    return 'system' in entry && entry.system === true;
}

class ChatManager extends EventEmitter {
    private container: HTMLElement;
    private input: HTMLInputElement;
    private sendButton: HTMLButtonElement;
    private messages: MessageEntry[] = [];
    private maxMessages = 100;

    constructor(
        containerElement: HTMLElement,
        inputElement: HTMLInputElement,
        sendButton: HTMLButtonElement
    ) {
        super();
        this.container = containerElement;
        this.input = inputElement;
        this.sendButton = sendButton;
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keypress', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    sendMessage(): void {
        const message = this.input.value.trim();
        if (!message) return;
        this.emit('send', message);
        this.input.value = '';
        this.input.focus();
    }

    addMessage(data: ChatMessageEntry): void {
        const entry: ChatMessageEntry = {
            playerId: data.playerId,
            playerName: data.playerName,
            playerColor: data.playerColor,
            message: data.message,
            timestamp: data.timestamp,
        };
        this.messages.push(entry);
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
            this.container.removeChild(this.container.firstChild!);
        }
        this.renderMessage(entry);
        this.scrollToBottom();
    }

    addSystemMessage(message: string): void {
        const entry: SystemMessageEntry = {
            system: true,
            message,
            timestamp: Date.now() / 1000,
        };
        this.messages.push(entry);
        this.renderSystemMessage(entry);
        this.scrollToBottom();
    }

    private renderMessage(entry: ChatMessageEntry): void {
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.style.borderLeftColor = entry.playerColor ?? '';
        const time = this.formatTime(entry.timestamp ?? 0);
        div.innerHTML = `
            <div class="sender" style="color: ${entry.playerColor ?? ''}">${this.escapeHtml(entry.playerName ?? '')}</div>
            <div class="content">${this.escapeHtml(entry.message ?? '')}</div>
            <div class="timestamp">${time}</div>
        `;
        this.container.appendChild(div);
    }

    private renderSystemMessage(entry: SystemMessageEntry): void {
        const div = document.createElement('div');
        div.className = 'chat-message system';
        div.innerHTML = `<div class="content">${this.escapeHtml(entry.message)}</div>`;
        this.container.appendChild(div);
    }

    loadHistory(history: MessageEntry[]): void {
        this.clear();
        for (const entry of history) {
            if (isSystemEntry(entry)) {
                this.renderSystemMessage(entry);
            } else {
                this.renderMessage({
                    playerId: entry.playerId,
                    playerName: entry.playerName,
                    playerColor: entry.playerColor,
                    message: entry.message,
                    timestamp: entry.timestamp,
                });
            }
        }
        this.messages = [...history];
        this.scrollToBottom();
    }

    clear(): void {
        this.container.innerHTML = '';
        this.messages = [];
    }

    private scrollToBottom(): void {
        this.container.scrollTop = this.container.scrollHeight;
    }

    private formatTime(timestamp: number): string {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setEnabled(enabled: boolean): void {
        this.input.disabled = !enabled;
        this.sendButton.disabled = !enabled;
    }
}
