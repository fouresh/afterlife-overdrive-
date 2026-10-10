import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/cyrillic-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/pixelify-sans/cyrillic-700.css';
import './styles.css';
import { render } from 'preact';
import { captureConsole, diagSet } from './core/diagnostics';
import { installErrorHandlers } from './core/errors';
import { registerServiceWorker } from './core/pwa';
import { App } from './ui/App';

installErrorHandlers();
captureConsole();
diagSet('boot', new Date().toISOString());

// iOS Safari ignores user-scalable=no: block pinch / double-tap zoom gestures explicitly.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

render(<App />, document.getElementById('app')!);
registerServiceWorker();
