import { StrictMode, } from 'react'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./layout/Layout";
import HistoryPage from "./pages/HistoryPage";
import SendPage from './pages/SendPage'
import { WebSocketProvider } from './contexts/WebSocketProvider';
import { ThemeProvider } from './contexts/ThemeContext';

import './index.css'
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <WebSocketProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<SendPage />} />
              <Route path="send" element={<SendPage />} />
              <Route path="history" element={<HistoryPage />} />
            </Route>
          </Routes>
        </Router>
      </WebSocketProvider>
    </ThemeProvider>
  </StrictMode>
);