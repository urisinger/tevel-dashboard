import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';
import { ContentArea } from './ContentArea';

export default function Layout() {
    const [refreshKey, setRefreshKey] = useState(0);

    const handleRefresh = () => {
        setRefreshKey(k => k + 1)
    }

    return (
        <div className="app-container">
            <Sidebar onRefresh={handleRefresh} />
            <div className="main-content">
                <AppHeader />
                <ContentArea refreshKey={refreshKey} />
            </div>
        </div>
    )
};

