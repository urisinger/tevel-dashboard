import Layout from "./layout/Layout";
import HistoryPage from "./pages/HistoryPage";
import SendPage from './pages/SendPage';
import 'solid-devtools';

import './index.css';
import { Route, Router, } from "@solidjs/router";
import { render } from "solid-js/web";


render(() =>
  <Router>
    <Route path="/" component={Layout}>
      <Route path="" component={SendPage} />
      <Route path="send" component={SendPage} />
      <Route path="history" component={HistoryPage} />
    </Route>
  </Router>
  , document.getElementById("root")!);