import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './app/App';

const stored = (() => {
  try {
    return localStorage.getItem('du.theme') as 'dark' | 'light' | null;
  } catch {
    return null;
  }
})();
const theme = stored ?? 'dark';
document.documentElement.classList.toggle('dark', theme === 'dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App initialTheme={theme} />
  </React.StrictMode>,
);
