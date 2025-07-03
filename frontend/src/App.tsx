import Layout from "./layout/Layout";
import HistoryPage from "./pages/HistoryPage";
import SendPage from './pages/SendPage'

import './index.css';
import { Route, Router, Routes } from "solid-app-router";
import { createRoot } from "solid-js";


createRoot(() =>
  <Router>
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route path="" element={<SendPage />} />
        <Route path="send" element={<SendPage />} />
        <Route path="history" element={<HistoryPage />} />
      </Route>
    </Routes>
  </Router>
);