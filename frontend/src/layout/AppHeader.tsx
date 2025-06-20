import React from 'react';

export const AppHeader: React.FC = () => {
    return (
        <header className="app-header">
            <div className="header-top">
                <h1 className="app-title">Data Structure Builder</h1>
            </div>
            <p className="app-subtitle">Build and transmit binary data structures</p>
        </header>
    );
};
