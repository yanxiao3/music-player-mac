import './lib/polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from '@/components/ErrorFallback';
import { isElectron } from '@/lib/electron';
import App from './app';
import './index.css';

// Electron 桌面壳（file://）用 HashRouter；浏览器/妙搭托管沿用 BrowserRouter + basename
// eslint-disable-next-line react-refresh/only-export-components
const Router = isElectron ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router basename={!isElectron ? import.meta.env.MIAODA_CLIENT_BASE_PATH || '/' : undefined}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <App />
      </ErrorBoundary>
    </Router>
  </StrictMode>,
);
