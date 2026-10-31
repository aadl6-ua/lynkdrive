import { useCallback, useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { EmptyState, Loading } from './components/ui';
import { api, ApiError } from './lib/api';
import { useHashPath } from './lib/router';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { AdminUser } from './lib/types';
import { BookingDetailPage } from './pages/BookingDetailPage';
import { BookingsPage } from './pages/BookingsPage';
import { DashboardPage } from './pages/DashboardPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { LoginPage } from './pages/LoginPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { UserDetailPage } from './pages/UserDetailPage';
import { UsersPage } from './pages/UsersPage';
import { VehiclesPage } from './pages/VehiclesPage';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out'; error?: string }
  | { status: 'signed_in'; admin: AdminUser };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const path = useHashPath();

  // Con sesión de Supabase se confirma el rol consultando /admin/me (la API decide).
  const resolveAdmin = useCallback(async () => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

    if (!data.session) {
      setAuth({ status: 'signed_out' });
      return;
    }

    try {
      const admin = await api.get<AdminUser>('/admin/me');
      setAuth({ status: 'signed_in', admin });
    } catch (error) {
      await supabase?.auth.signOut();
      const forbidden = error instanceof ApiError && error.status === 403;
      setAuth({
        status: 'signed_out',
        error: forbidden ? 'Esta cuenta no tiene permisos de administración.' : (error as Error).message
      });
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuth({ status: 'signed_out' });
      return;
    }

    void resolveAdmin();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setAuth({ status: 'signed_out' });
    });
    return () => data.subscription.unsubscribe();
  }, [resolveAdmin]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setAuth({ status: 'signed_out' });
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="centered">
        <EmptyState
          title="Falta configuración"
          description="Define VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_API_URL en apps/admin/.env"
        />
      </div>
    );
  }

  if (auth.status === 'loading') {
    return (
      <div className="centered">
        <Loading label="Comprobando sesión…" />
      </div>
    );
  }

  if (auth.status === 'signed_out') {
    return <LoginPage initialError={auth.error} onSignedIn={resolveAdmin} />;
  }

  return (
    <Layout path={path} admin={auth.admin} onSignOut={signOut}>
      {renderRoute(path, auth.admin)}
    </Layout>
  );
}

function renderRoute(path: string, admin: AdminUser) {
  const [section, id] = path.split('/').filter(Boolean);

  switch (section) {
    case undefined:
      return <DashboardPage />;
    case 'users':
      return id ? <UserDetailPage key={id} id={id} currentAdminId={admin.id} /> : <UsersPage />;
    case 'vehicles':
      return <VehiclesPage />;
    case 'bookings':
      return id ? <BookingDetailPage key={id} id={id} /> : <BookingsPage />;
    case 'reviews':
      return <ReviewsPage />;
    case 'incidents':
      return id ? <IncidentDetailPage key={id} id={id} /> : <IncidentsPage />;
    default:
      return <EmptyState title="Página no encontrada" description="Usa el menú lateral para navegar." />;
  }
}
