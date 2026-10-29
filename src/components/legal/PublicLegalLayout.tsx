import { useEffect, useRef } from 'react';
import { Breadcrumb, Button } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import logoUrl from '../../assets/logo.svg';
import { HOME_PATH } from '../../shared/config/appMode';
import { LEGAL } from '../../shared/config/legal';
import { NotificationsProvider } from '../../shared/context/notifications.context';
import { useAuth } from '../../shared/hooks/auth.hooks';
import './legal.css';

/** What the header says about the page a visitor is on */
const PAGE_TITLES: Record<string, string> = {
  '/pricing': 'Тарифы',
  '/legal': 'Документы',
};

/**
 * The shell of the pages a visitor can open without signing in: prices and the legal documents.
 * The header is the one of the service; the documents switch between themselves by anchors on their page.
 */
export const PublicLegalLayout = () => {
  const { pathname, hash } = useLocation();
  const { user } = useAuth();
  const bodyRef = useRef<HTMLDivElement>(null);

  // The scrolling area is the same for every page: a new page opens from its top,
  // unless the link points to an anchor, then the page itself scrolls there
  useEffect(() => {
    if (!hash) bodyRef.current?.scrollTo({ top: 0 });
  }, [pathname, hash]);

  const isLegal = pathname === '/legal' || pathname.startsWith('/legal');
  const isPricing = pathname === '/pricing';
  const tariffsPath = user ? '/plans' : '/pricing';

  const breadcrumbs: { title: string; path?: string }[] = [
    { title: 'Главная', path: HOME_PATH },
    ...(isLegal
      ? [
          { title: 'Тарифы', path: tariffsPath },
          { title: 'Документы' },
        ]
      : isPricing
        ? [{ title: 'Тарифы' }]
        : PAGE_TITLES[pathname]
          ? [{ title: PAGE_TITLES[pathname] }]
          : []),
  ];

  return (
    // The plans page shares its buttons with the signed-in app, and they report through notifications
    <NotificationsProvider>
      <div className="legal-shell">
        <header className="app-content-header legal-shell__header" aria-label="Верхняя панель">
          <div className="app-header-brand">
            <Link to={HOME_PATH} className="app-header-brand__link" aria-label="СВОД Опросы — в сервис">
              <img src={logoUrl} alt="СВОД" className="app-header-brand__logo" />
              <span className="app-header-brand__name">Опросы</span>
            </Link>
          </div>
          <div className="app-content-header__main">
            <div className="app-content-header__left">
              <Breadcrumb
                className="app-content-header__breadcrumb"
                items={breadcrumbs.map((item) => ({
                  title: item.path ? <Link to={item.path}>{item.title}</Link> : item.title,
                  key: item.title,
                }))}
              />
            </div>
            <div className="app-content-header__right">
              {user ? null : (
                <Link to="/auth">
                  <Button type="primary">Войти</Button>
                </Link>
              )}
            </div>
          </div>
        </header>

        <div className="legal-shell__body" ref={bodyRef}>
          <main className="legal-shell__main">
            <Outlet />
          </main>
        </div>

        {isLegal ? (
          <footer className="legal-shell__footer">
            <div>
              {LEGAL.serviceName}. {LEGAL.fullName}, ИНН {LEGAL.inn}. {LEGAL.taxStatus}.
            </div>
            <div>
              <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
            </div>
          </footer>
        ) : null}
      </div>
    </NotificationsProvider>
  );
};
