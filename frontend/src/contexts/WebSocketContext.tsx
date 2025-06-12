import React, { createContext, useContext, ReactNode } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { WebSocketLike } from 'react-use-websocket/dist/lib/types';

interface WebSocketContextType {
    sendMessage: (message: any) => void;
    getWebSocket: () => WebSocketLike | null;
    readyState: ReadyState;
}

export const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
    const { sendMessage, getWebSocket, readyState } = useWebSocket(
        `ws://${window.location.host}/ws`,
        {
            protocols: ["websocket-to-tcp"],
            shouldReconnect: () => true,
        }
    );

    return (
        <WebSocketContext.Provider value={{ sendMessage, getWebSocket, readyState }}>
            {children}
        </WebSocketContext.Provider>
    );
}

export function useWebSocketContext() {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error('useWebSocketContext must be used within a WebSocketProvider');
    }
    return context;
} 