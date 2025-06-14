import React, { ReactNode } from 'react';
import useWebSocket from 'react-use-websocket';
import { WebSocketContext, } from './WebSocketContext';

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

