import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ErpProvider } from './context/ErpContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ErpProvider>
      <App />
    </ErpProvider>
  </ErrorBoundary>
);
