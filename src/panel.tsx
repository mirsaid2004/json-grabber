import { createRoot } from 'react-dom/client';
import { Panel } from './ui/Panel';

// No StrictMode: its double-invoked effects would attach the network listener
// twice in development and duplicate every capture.
const container = document.getElementById('root');
if (container) createRoot(container).render(<Panel />);
