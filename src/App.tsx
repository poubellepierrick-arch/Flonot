import { AuthPopupView } from './components/AuthPopupView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { isAuthPopupModeFromSearch } from './utils/embedMode';

export default function App() {
  const isAuthPopup =
    typeof window !== 'undefined' && isAuthPopupModeFromSearch(window.location.search);

  return (
    <ErrorBoundary>
      {isAuthPopup ? (
        <AuthPopupView />
      ) : (
        <WorkspaceProvider>
          <WorkspaceLayout />
        </WorkspaceProvider>
      )}
    </ErrorBoundary>
  );
}
