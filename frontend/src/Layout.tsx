import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useWebSocketContext } from './contexts/WebSocketContext';
import { ReadyState } from 'react-use-websocket';

const Layout: React.FC = () => {
    const { readyState } = useWebSocketContext();
    const isSocketReady = readyState === ReadyState.OPEN;

    return (
        <div className="app-container">
            <div className="sidebar">
                <div className="sidebar-header">
                    <h2>Dashboard</h2>
                </div>
                <div className="sidebar-content">
                    <NavLink
                        to="/"
                        className={({ isActive }) =>
                            `sidebar-item ${isActive ? 'active' : ''}`
                        }
                    >
                        Send
                    </NavLink>
                    <NavLink
                        to="/history"
                        className={({ isActive }) =>
                            `sidebar-item ${isActive ? 'active' : ''}`
                        }
                    >
                        History
                    </NavLink>
                </div>
            </div>

            <div className="main-content">
                <div className="app-header">
                    <div className="header-top">
                        <h1 className="app-title">Data Structure Builder</h1>
                        <span className={`socket-status ${isSocketReady ? 'connected' : 'disconnected'}`}>
                            <span className={`socket-status-indicator ${isSocketReady ? 'connected' : 'disconnected'}`}></span>
                            WebSocket: {isSocketReady ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                    <p className="app-subtitle">Build and transmit binary data structures</p>
                </div>

                <div className="content-area">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default Layout; 