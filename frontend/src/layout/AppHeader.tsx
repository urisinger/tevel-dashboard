import { JSX } from 'solid-js';
import { socketReady } from '../state';

export default function AppHeader(): JSX.Element {
    return (
        <header class="app-header">
            <div class="header-top">
                <h1 class="app-title">Data Structure Builder</h1>
                <span class={`socket-status ${socketReady() === WebSocket.OPEN ? 'connected' : 'disconnected'}`}>
                    <span class={`socket-status-indicator ${socketReady() === WebSocket.OPEN ? 'connected' : 'disconnected'}`} />
                    WebSocket: {socketReady() === WebSocket.OPEN ? 'Connected' : 'Disconnected'}
                </span>
            </div>
            <p class="app-subtitle">Build and transmit binary data structures</p>
        </header>
    );
};
