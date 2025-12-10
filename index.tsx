import React from 'react';
import ReactDOM from 'react-dom/client';
// FIX: Corrected import to use the default export from App.tsx.
import App from './App';
import { NotificationProvider } from './components/GlobalNotification';
// Import PWA Service Worker registration (will be handled by vite-plugin-pwa automatically, 
// but we can add explicit update logic here if needed later)

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root element not found");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <NotificationProvider>
        <App />
    </NotificationProvider>
  </React.StrictMode>
);