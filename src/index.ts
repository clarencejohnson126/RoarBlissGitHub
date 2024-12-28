import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import './index.css';

// Initialize app
const initialize = () => {
  const container = document.getElementById('root');
  
  if (!container) {
    throw new Error('Root element not found. Please check your HTML file.');
  }

  const root = createRoot(container);

  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
};

// Handle errors during initialization
try {
  initialize();
} catch (error) {
  console.error('Failed to initialize application:', error);
  
  // Display a user-friendly error message
  const errorContainer = document.getElementById('root');
  if (errorContainer) {
    errorContainer.innerHTML = `
      <div style="
        padding: 20px;
        margin: 20px;
        border-radius: 8px;
        background: #fee2e2;
        color: #991b1b;
        text-align: center;
        font-family: system-ui, -apple-system, sans-serif;
      ">
        <h2 style="margin-bottom: 10px;">Something went wrong</h2>
        <p>We're having trouble loading the application. Please try refreshing the page.</p>
      </div>
    `;
  }
}