import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './components/layout/AuthGate';
import { purgeLegacyCaches } from './lib/cache';
import { installErrorReporter } from './lib/errorReporter';
import './index.css';

// Remove business-data snapshots left in the browser by older builds
purgeLegacyCaches();
// Crashes are reported to client_errors (Super Admins read them; docs/OPERATIONS.md)
installErrorReporter();

// AuthProvider + AuthGate sit outside <App> so no business data (FleetProvider) loads
// before a signed-in, active profile exists. The <AuthProvider> still inside App.tsx
// detects this outer one and becomes a pass-through.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>
);
