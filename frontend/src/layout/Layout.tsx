import { JSX, ParentProps } from "solid-js";
import Sidebar from "./Sidebar";
import AppHeader from "./AppHeader";
import { ContentArea } from "./ContentArea";

export default function Layout(props: ParentProps): JSX.Element {
    return (
        <div class="app-container">
            <Sidebar />
            <div class="main-content">
                <AppHeader />
                <ContentArea >
                    {props.children}
                </ContentArea>
            </div>
        </div>
    );
}
