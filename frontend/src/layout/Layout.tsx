import { createSignal, JSX } from "solid-js";
import Sidebar from "./Sidebar";
import { AppHeader } from "./AppHeader";
import { ContentArea } from "./ContentArea";

export default function Layout(): JSX.Element {
    const [refreshKey, setRefreshKey] = createSignal(0);

    const handleRefresh = () => {
        setRefreshKey((k) => k + 1);
    };

    return (
        <div class="app-container">
            <Sidebar onRefresh={handleRefresh} />
            <div class="main-content">
                <AppHeader />
                <ContentArea refreshKey={refreshKey()} />
            </div>
        </div>
    );
}