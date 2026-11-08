/**
 * Animated gradient behind the hero block of the sign-in style pages.
 * Soft orange blobs drift over a dark base and melt into black at the bottom.
 * Pure CSS (see AuthPage.css); the motion is switched off for prefers-reduced-motion.
 */
export const AuthHeroBackground = () => (
  <>
    <div className="auth-page__hero-bg">
      <span className="auth-page__blob auth-page__blob--sun" />
      <span className="auth-page__blob auth-page__blob--core" />
      <span className="auth-page__blob auth-page__blob--ember" />
    </div>
    <div className="auth-page__hero-overlay" />
  </>
);
