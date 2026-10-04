import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootTheme } from './theme';
import './styles/tokens.css';
import './styles/global.css';

bootTheme(); // before the first paint; Shell reconciles with settings.get() once it resolves
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
