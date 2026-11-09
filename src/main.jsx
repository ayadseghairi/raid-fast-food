import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './app/App.jsx';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
