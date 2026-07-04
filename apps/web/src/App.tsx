import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSessionStore } from '@/store/session';
import { Layout } from '@/components/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { SetupPage } from '@/pages/SetupPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProvidersPage } from '@/pages/ProvidersPage';
import { ApiKeysPage } from '@/pages/ApiKeysPage';
import { PayloadPage } from '@/pages/PayloadPage';
import { UsagePage } from '@/pages/UsagePage';
import { ModelsPage } from '@/pages/ModelsPage';
import { ConfigPage } from '@/pages/ConfigPage';

function Protected({ children }: { children: ReactNode }) {
  const connected = useSessionStore((state) => state.connected);
  if (!connected) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/setup"
        element={
          <Protected>
            <SetupPage />
          </Protected>
        }
      />
      <Route
        path="/"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
      <Route
        path="/providers"
        element={
          <Protected>
            <ProvidersPage />
          </Protected>
        }
      />
      <Route
        path="/api-keys"
        element={
          <Protected>
            <ApiKeysPage />
          </Protected>
        }
      />
      <Route
        path="/payload"
        element={
          <Protected>
            <PayloadPage />
          </Protected>
        }
      />
      <Route
        path="/usage"
        element={
          <Protected>
            <UsagePage />
          </Protected>
        }
      />
      <Route
        path="/models"
        element={
          <Protected>
            <ModelsPage />
          </Protected>
        }
      />
      <Route
        path="/config"
        element={
          <Protected>
            <ConfigPage />
          </Protected>
        }
      />
    </Routes>
  );
}
