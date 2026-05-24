import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global fetch wrapper to automatically attach JWT token and user ID for auditing
const originalFetch = window.fetch;
const customFetch = async function (input: any, init: any) {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  
  const newInit = init ? { ...init } : {};
  const headers = newInit.headers ? { ...newInit.headers } : {};

  if (token) {
    (headers as any)['Authorization'] = `Bearer ${token}`;
  }
  if (userStr) {
    try {
      const userObj = JSON.parse(userStr);
      if (userObj && userObj.id) {
        (headers as any)['X-User-Id'] = userObj.id.toString();
      }
    } catch (e) {
      // ignore JSON parse failures
    }
  }

  newInit.headers = headers;
  return originalFetch(input, newInit);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    configurable: true,
    writable: true,
  });
} catch (e) {
  try {
    Object.defineProperty(globalThis, 'fetch', {
      value: customFetch,
      configurable: true,
      writable: true,
    });
  } catch (err) {
    console.error("Failed to override standard fetch:", err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
