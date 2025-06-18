import React from 'react';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';
import { ContentArea } from './ContentArea';

export const Layout: React.FC = () => (
    <div className="app-container">
        <Sidebar />
        <div className="main-content">
            <AppHeader />
            <ContentArea />
        </div>
    </div>
);

export default Layout;
