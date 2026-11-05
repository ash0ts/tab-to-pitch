import React from 'react';
import { createRoot } from 'react-dom/client';
import { useRegisterSW } from 'virtual:pwa-register/react';
import App from './App';
import './style.css';

function OfflineUpdate() {
  const {
    needRefresh: [needed, setNeeded],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needed) return null;
  return (
    <div className="update-notice" role="status">
      <span>A new version is ready. Finish your practice before updating.</span>
      <button onClick={() => void updateServiceWorker(true)}>Update</button>
      <button onClick={() => setNeeded(false)}>Later</button>
    </div>
  );
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal-error">
        <h1>The practice room needs a restart.</h1>
        <p>
          Reload to try again. Only files and progress successfully saved in this browser can be
          restored.
        </p>
        <button onClick={() => location.reload()}>Reload the app</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
    <OfflineUpdate />
  </ErrorBoundary>,
);
