import React from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { ReadyState } from 'react-use-websocket';

export const AppHeader: React.FC = () => {
    const { readyState } = useWebSocketContext();
    const isSocketReady = readyState === ReadyState.OPEN;

    return (
        <header className="app-header">
            <div className="header-top">
                <h1 className="app-title">Data Structure Builder</h1>
                <span className={`socket-status ${isSocketReady ? 'connected' : 'disconnected'}`}>
                    <span className={`socket-status-indicator ${isSocketReady ? 'connected' : 'disconnected'}`} />
                    WebSocket: {isSocketReady ? 'Connected' : 'Disconnected'}
                </span>
            </div>
            <p className="app-subtitle">Build and transmit binary data structures</p>
        </header>
    );
};
