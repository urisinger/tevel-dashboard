import Layout from "./layout/Layout";
import HistoryPage from "./pages/HistoryPage";
import SendPage from './pages/SendPage';
import DataViewerPage from './pages/DataViewerPage';

import './index.css';
import { Route, Router, } from "@solidjs/router";
import { render } from "solid-js/web";
import 'solid-devtools';



render(() =>
  <Router>
    <Route path="/" component={Layout}>
      <Route path="" component={SendPage} />
      <Route path="send" component={SendPage} />
      <Route path="history" component={HistoryPage} />
      <Route path="custom" component={DataViewerPage} />
    </Route>
  </Router>
  , document.getElementById("root")!);