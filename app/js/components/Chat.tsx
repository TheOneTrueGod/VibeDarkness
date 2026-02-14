/**
 * Chat sidebar component
 */
import React, { useState, useRef, useEffect } from 'react';

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

export type MessageEntry = ChatMessageEntry | SystemMessageEntry;

function isSystemEntry(entry: MessageEntry): entry is SystemMessageEntry {
    return 'system' in entry && (entry as SystemMessageEntry).system === true;
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface ChatProps {
    messages: MessageEntry[];
    connectionStatus: 'disconnected' | 'connecting' | 'connected';
    enabled: boolean;
    onSend: (message: string) => void;
    isSlideOver?: boolean;
    onClose?: () => void;
    topContent?: React.ReactNode;
    bottomContent?: React.ReactNode;
    /** Rendered in the header to the right of the connection status */
    headerRightContent?: React.ReactNode;
}

const STATUS_STYLES: Record<string, string> = {
    connected: 'bg-success text-secondary',
    disconnected: 'bg-danger text-white',
    connecting: 'bg-warning text-secondary',
};

export default function Chat({
    messages,
    connectionStatus,
    enabled,
    onSend,
    isSlideOver = false,
    onClose,
    topContent,
    bottomContent,
    headerRightContent,
}: ChatProps) {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        const msg = inputValue.trim();
        if (!msg) return;
        onSend(msg);
        setInputValue('');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div
            className={
                isSlideOver
                    ? 'flex flex-col h-full bg-surface'
                    : 'w-80 bg-surface flex flex-col border-l border-border-custom max-md:w-full max-md:h-[300px] max-md:border-l-0 max-md:border-t max-md:border-border-custom'
            }
        >
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-border-custom shrink-0">
                <h3 className="text-base font-semibold">Chat</h3>
                <div className="flex items-center gap-2">
                    <span
                        className={`text-xs px-2 py-1 rounded capitalize ${STATUS_STYLES[connectionStatus] ?? ''}`}
                    >
                        {connectionStatus}
                    </span>
                    {headerRightContent}
                    {isSlideOver && onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded bg-surface-light hover:bg-surface-light/80 transition-colors"
                            aria-label="Close chat"
                        >
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Optional top content (e.g. resource display on mobile) */}
            {topContent && <div className="px-4 py-2 border-b border-border-custom shrink-0">{topContent}</div>}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
                {messages.map((entry, i) =>
                    isSystemEntry(entry) ? (
                        <div key={i} className="px-3 py-2 border-l-[3px] border-l-muted text-muted italic text-sm">
                            <div>{entry.message}</div>
                        </div>
                    ) : (
                        <div
                            key={i}
                            className="px-3 py-2 bg-surface-light rounded border-l-[3px]"
                            style={{ borderLeftColor: entry.playerColor ?? '#4ECDC4' }}
                        >
                            <div className="font-semibold text-[13px] mb-1" style={{ color: entry.playerColor ?? '' }}>
                                {entry.playerName}
                            </div>
                            <div className="text-sm break-words">{entry.message}</div>
                            <div className="text-[11px] text-muted mt-1">
                                {entry.timestamp ? formatTime(entry.timestamp) : ''}
                            </div>
                        </div>
                    )
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 p-4 border-t border-border-custom shrink-0">
                <input
                    type="text"
                    className="flex-1 px-4 py-3 border border-border-custom rounded bg-surface-light text-white text-base focus:outline-none focus:border-primary placeholder:text-muted disabled:opacity-50"
                    placeholder="Type a message..."
                    maxLength={200}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyPress}
                    disabled={!enabled}
                />
                <button
                    className="px-4 py-3 bg-primary text-secondary font-semibold rounded hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleSend}
                    disabled={!enabled}
                >
                    Send
                </button>
            </div>

            {/* Optional bottom content (e.g. leave button on mobile) */}
            {bottomContent && <div className="p-4 border-t border-border-custom shrink-0">{bottomContent}</div>}
        </div>
    );
}
