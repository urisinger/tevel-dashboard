import { createContext, useContext } from 'react';
import { ReadyState } from 'react-use-websocket';
import { WebSocketLike, WebSocketMessage } from 'react-use-websocket/dist/lib/types';

export interface WebSocketContextType {
    sendMessage: (message: WebSocketMessage, keep?: boolean) => void;
    getWebSocket: () => WebSocketLike | null;
    readyState: ReadyState;
}

export const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function useWebSocketContext(): WebSocketContextType {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocketContext must be used within a WebSocketProvider');
    }
    return context;
}