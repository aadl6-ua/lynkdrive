import { ReactNode } from 'react';
import { href } from '../lib/router';
import { fullName } from '../lib/format';
import type { AdminUser } from '../lib/types';

const NAV_ITEMS = [
  { path: '/', label: 'Resumen' },
  { path: '/users', label: 'Usuarios' },
  { path: '/vehicles', label: 'Vehículos' },
  { path: '/bookings', label: 'Reservas' },
  { path: '/reviews', label: 'Reseñas' },
  { path: '/incidents', label: 'Incidencias' }
];

function isActive(current: string, path: string): boolean {
  return path === '/' ? current === '/' : current === path || current.startsWith(`${path}/`);
}

export function Layout({
  path,
  admin,
  onSignOut,
  children
}: {
  path: string;
  admin: AdminUser;
  onSignOut: () => void;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark" aria-hidden>
            L
          </span>
          <div>
            <strong>LynkDrive</strong>
            <span>Backoffice</span>
          </div>
        </div>
        <nav className="nav" aria-label="Secciones">
          {NAV_ITEMS.map((item) => (
            <a key={item.path} href={href(item.path)} className={isActive(path, item.path) ? 'nav__item nav__item--active' : 'nav__item'}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__user">
            <strong>{fullName(admin)}</strong>
            <span>{admin.email}</span>
          </div>
          <button className="btn btn--ghost-dark" onClick={onSignOut}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
