import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { startaLagring } from './store.js';
import './styles.css';
import './v3.css';

// Del 254 · Appens data läses ur webbläsarens stora lagring innan något ritas (startaLagring ger aldrig fel:
// går den stora lagringen inte att öppna gäller den lilla som förut).
void startaLagring().finally(() => {
  createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
});
