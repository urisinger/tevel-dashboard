import { createMemo, JSX } from 'solid-js';
import { websocket } from '../state';

export default function AppHeader(): JSX.Element {
    const isSocketReady = createMemo(() => websocket.readyState === WebSocket.OPEN);

    return (
        <header class="app-header">
            <div class="header-top">
                <h1 class="app-title">Data Structure Builder</h1>
                <span class={`socket-status ${isSocketReady() ? 'connected' : 'disconnected'}`}>
                    <span class={`socket-status-indicator ${isSocketReady() ? 'connected' : 'disconnected'}`} />
                    WebSocket: {isSocketReady() ? 'Connected' : 'Disconnected'}
                </span>
            </div>
            <p class="app-subtitle">Build and transmit binary data structures</p>
        </header>
    );
};
