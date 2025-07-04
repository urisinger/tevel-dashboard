import { createContext, useContext } from 'react';
import { ReadyState } from 'react-use-websocket';
import { SendMessage, WebSocketLike } from 'react-use-websocket/dist/lib/types';

export interface WebSocketContextType {
    sendMessage: SendMessage;
    getWebSocket: () => WebSocketLike | null;
    readyState: ReadyState;
}

export const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function useWebSocketContext(): WebSocketContextType {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocketContext must be used within a WebSocketProvider');
    }
    return context;
}