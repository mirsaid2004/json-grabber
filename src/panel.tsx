import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { logStore } from './store/logStore';
import { Panel } from './ui/Panel';

const container = document.getElementById('root');
if (container) {
  logStore.add('panel ready — capturing while DevTools is open on this tab');
  createRoot(container).render(
    <StrictMode>
      <Panel />
    </StrictMode>
  );
}
