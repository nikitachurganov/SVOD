import type { CSSProperties, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { IS_SURVEYS_APP } from '../../config/appMode';
import './skeletons.css';

type BoneProps = {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  className?: string;
  style?: CSSProperties;
};

/** One grey placeholder bar */
export const Bone = ({ w = '100%', h = 14, r, className, style }: BoneProps) => (
  <span
    className={className ? `sk ${className}` : 'sk'}
    style={{ width: w, height: h, borderRadius: r, ...style }}
    aria-hidden="true"
  />
);

/** Root of every placeholder: screen readers hear «Загрузка…» once instead of a pile of empty shapes */
const Busy = ({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) => (
  <div className={className} style={style} role="status" aria-busy="true" aria-live="polite">
    <span className="sk-sr-only">Загрузка…</span>
    {children}
  </div>
);

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

export const ChartSkeleton = ({ height = 220 }: { height?: number }) => <Bone h={height} r={8} />;

/** Grid of project folders (the surveys home page) */
export const ProjectGridSkeleton = ({ count = 6 }: { count?: number }) => (
  <div className="project-grid" aria-hidden="true">
    {range(count).map((index) => (
      <div key={index} className="sk-folder">
        <Bone w="42%" h={18} className="sk-folder__tab" />
        <Bone className="sk-folder__body" />
      </div>
    ))}
  </div>
);

/** Grid of survey cards (a project page) */
export const SurveyCardsSkeleton = ({ count = 6 }: { count?: number }) => (
  <ul className="survey-grid" aria-hidden="true">
    {range(count).map((index) => (
      <li key={index} className="survey-card sk-card">
        <Bone w={84} h={22} r={11} />
        <Bone w="72%" h={18} />
        <div className="sk-row" style={{ gap: 32 }}>
          <div className="sk-stack" style={{ gap: 6 }}>
            <Bone w={80} h={16} />
            <Bone w={120} h={12} />
          </div>
          <div className="sk-stack" style={{ gap: 6 }}>
            <Bone w={32} h={16} />
            <Bone w={64} h={12} />
          </div>
        </div>
      </li>
    ))}
  </ul>
);

export const SurveysHomeSkeleton = () => (
  <Busy className="registry-page">
    <div className="registry-page__content">
      <Bone w={120} h={24} style={{ marginBottom: 16 }} />
      <ProjectGridSkeleton />
    </div>
  </Busy>
);

export const ProjectSurveysSkeleton = () => (
  <Busy className="registry-page">
    <div className="registry-page__header">
      <div className="registry-page__title-row">
        <Bone w={260} h={28} />
        <Bone w={148} h={32} r={8} />
      </div>
    </div>
    <div className="registry-page__content">
      <div className="project-page__toolbar">
        <Bone h={32} r={8} style={{ flex: '1 1 240px', maxWidth: 360 }} />
        <Bone w={170} h={32} r={8} />
        <Bone w={170} h={32} r={8} className="sk-hide-mobile" />
      </div>
      <SurveyCardsSkeleton />
    </div>
  </Busy>
);

/** Rows of a registry table */
export const TableRowsSkeleton = ({ rows = 8 }: { rows?: number }) => (
  <div aria-hidden="true">
    {range(rows).map((index) => (
      <div key={index} className="sk-table__row">
        <Bone w={index % 3 === 0 ? '64%' : '82%'} />
        <Bone w="70%" />
        <Bone w="56%" />
        <Bone w={72} h={22} r={11} />
      </div>
    ))}
  </div>
);

export const RegistryPageSkeleton = ({ tabs = false, rows = 8 }: { tabs?: boolean; rows?: number }) => (
  <Busy className="registry-page">
    <div className="registry-page__header" style={tabs ? undefined : { paddingBottom: 0 }}>
      <div className="registry-page__title-row">
        <Bone w={220} h={28} />
        <Bone w={140} h={32} r={8} />
      </div>
      {tabs && (
        <div className="sk-tabs" style={{ height: 40 }}>
          {[96, 120, 88].map((w) => (
            <Bone key={w} w={w} h={16} />
          ))}
        </div>
      )}
    </div>
    <div className="registry-page__content">
      <div className="sk-panel">
        <div className="sk-row" style={{ marginBottom: 12 }}>
          <Bone w={280} h={32} r={8} />
          <Bone w={140} h={32} r={8} className="sk-hide-mobile" />
        </div>
        <TableRowsSkeleton rows={rows} />
      </div>
    </div>
  </Busy>
);

/** Body of the survey overview tab: the figure cards and the chart */
export const SurveyOverviewSkeleton = () => (
  <div aria-hidden="true">
    <div className="sk-stats">
      {range(4).map((index) => (
        <div key={index} className="sk-panel sk-stack">
          <Bone w="58%" h={12} />
          <Bone w="36%" h={28} />
        </div>
      ))}
    </div>
    <div className="sk-panel sk-stack" style={{ gap: 16 }}>
      <Bone w={200} h={18} />
      <ChartSkeleton />
    </div>
  </div>
);

export const SurveyViewSkeleton = () => (
  <Busy className="survey-page">
    <header className="survey-page__header">
      <div className="survey-page__container">
        <div className="sk-row sk-row--wrap">
          <Bone w={32} h={32} r={8} />
          <Bone w={300} h={28} />
          <Bone w={72} h={22} r={6} />
          <div className="sk-row__end sk-hide-mobile">
            <Bone w={124} h={32} r={8} />
            <Bone w={124} h={32} r={8} />
            <Bone w={32} h={32} r={8} />
          </div>
        </div>
      </div>
      <div className="survey-page__container">
        <div className="sk-tabs">
          {[56, 72, 88, 80].map((w) => (
            <Bone key={w} w={w} h={16} />
          ))}
        </div>
      </div>
    </header>
    <div className="survey-page__body">
      <div className="survey-page__container">
        <SurveyOverviewSkeleton />
      </div>
    </div>
  </Busy>
);

export const FormEditorSkeleton = () => (
  <Busy className="sk-editor">
    <div className="sk-editor__header">
      <Bone w={32} h={32} r={8} />
      <Bone w={220} h={24} />
      <div className="sk-row__end">
        <Bone w={140} h={32} r={8} className="sk-hide-mobile" />
        <Bone w={32} h={32} r={8} />
        <Bone w={110} h={32} r={8} />
      </div>
    </div>
    <div className="sk-editor__body">
      <aside className="sk-editor__tools" aria-hidden="true">
        <Bone w={120} h={16} style={{ marginBottom: 8 }} />
        {range(9).map((index) => (
          <Bone key={index} h={36} r={8} />
        ))}
      </aside>
      <div className="sk-editor__canvas">
        <div className="sk-editor__sheet">
          <div className="sk-panel sk-stack">
            <Bone w="52%" h={28} />
            <Bone w="76%" />
          </div>
          {range(3).map((index) => (
            <div key={index} className="sk-panel sk-stack">
              <Bone w={index === 1 ? '34%' : '46%'} />
              <Bone h={36} r={8} />
            </div>
          ))}
        </div>
      </div>
    </div>
  </Busy>
);

/** A record page (request, form): a header and two columns of cards */
export const DetailPageSkeleton = () => (
  <Busy className="registry-page">
    <div className="registry-page__header" style={{ paddingBottom: 0 }}>
      <div className="registry-page__title-row">
        <div className="sk-row">
          <Bone w={32} h={32} r={8} />
          <Bone w={280} h={28} />
        </div>
        <Bone w={140} h={32} r={8} />
      </div>
    </div>
    <div className="registry-page__content">
      <DetailBodySkeleton />
    </div>
  </Busy>
);

/** Body of a record page under a header that is already drawn */
export const DetailBodySkeleton = () => (
  <Busy className="sk-detail" style={{ padding: 24 }}>
    <div className="sk-panel sk-stack" style={{ gap: 14 }}>
      <Bone w="40%" h={18} />
      {range(6).map((index) => (
        <Bone key={index} w={index % 2 ? '88%' : '100%'} />
      ))}
    </div>
    <div className="sk-panel sk-stack" style={{ gap: 14 }}>
      <Bone w="50%" h={18} />
      {range(4).map((index) => (
        <Bone key={index} w={index % 2 ? '64%' : '80%'} />
      ))}
    </div>
  </Busy>
);

/** A form being filled in, under a header that is already drawn */
export const FormBodySkeleton = () => (
  <Busy className="sk-editor__canvas">
    <div className="sk-editor__sheet">
      <div className="sk-panel sk-stack">
        <Bone w="52%" h={28} />
        <Bone w="76%" />
      </div>
      {range(4).map((index) => (
        <div key={index} className="sk-panel sk-stack">
          <Bone w={index % 2 ? '34%' : '46%'} />
          <Bone h={36} r={8} />
        </div>
      ))}
    </div>
  </Busy>
);

// Own classes: ProfilePage.css comes with the page chunk, which is exactly what is still loading
export const ProfileSkeleton = () => (
  <Busy className="sk-profile">
    <div className="sk-profile__layout">
      <Bone w={160} h={32} style={{ gridColumn: '1 / -1' }} />
      <div className="sk-stack sk-hide-mobile" aria-hidden="true">
        {range(4).map((index) => (
          <Bone key={index} h={36} r={8} />
        ))}
      </div>
      <div className="sk-panel sk-stack" style={{ gap: 16, padding: 24 }}>
        <Bone w={180} h={18} />
        {range(3).map((index) => (
          <div key={index} className="sk-stack" style={{ gap: 6 }}>
            <Bone w={100} h={12} />
            <Bone h={36} r={8} />
          </div>
        ))}
        <Bone w={120} h={32} r={8} />
      </div>
    </div>
  </Busy>
);

/** Respondent's questionnaire: a title and a few questions */
export const PublicFormSkeleton = ({ embedded = false }: { embedded?: boolean }) => (
  <Busy className={embedded ? 'sk-public sk-public--embedded' : 'sk-public'}>
    <div className="sk-public__card">
      <div className="sk-stack" style={{ gap: 12 }}>
        <Bone w="64%" h={30} />
        <Bone w="88%" />
      </div>
      {range(4).map((index) => (
        <div key={index} className="sk-panel sk-stack" style={{ gap: 12 }}>
          <Bone w={index % 2 ? '42%' : '58%'} h={16} />
          <Bone h={36} r={8} />
        </div>
      ))}
      <Bone w={140} h={40} r={8} style={{ alignSelf: 'flex-end' }} />
    </div>
  </Busy>
);

/** Placeholder that matches the page about to open, by its address */
export const RouteSkeleton = () => {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/surveys') return <SurveysHomeSkeleton />;
  if (path.startsWith('/surveys/projects/')) return <ProjectSurveysSkeleton />;
  if (/^\/(surveys|forms)\/(create|[^/]+\/edit)$/.test(path)) return <FormEditorSkeleton />;
  if (path.startsWith('/surveys/')) return <SurveyViewSkeleton />;
  if (/^\/(requests|forms)\/[^/]+$/.test(path)) return <DetailPageSkeleton />;
  if (path === '/profile') return <ProfileSkeleton />;
  if (path === '/admin') return <RegistryPageSkeleton tabs />;
  return <RegistryPageSkeleton />;
};

/** The whole shell (header, sidebar and the page) while the session is checked */
export const AppShellSkeleton = () => (
  <div className={IS_SURVEYS_APP ? 'app-shell-grid app-shell-grid--no-sidebar' : 'app-shell-grid'}>
    {!IS_SURVEYS_APP && (
      <aside className="sk-sidebar" aria-hidden="true">
        <Bone w={120} h={28} style={{ marginBottom: 16 }} />
        {range(5).map((index) => (
          <Bone key={index} h={32} r={8} />
        ))}
      </aside>
    )}
    <div className="app-shell-main">
      <div className="app-content-header sk-header" aria-hidden="true">
        <Bone w={140} h={24} />
        <Bone w={32} h={32} r="50%" />
      </div>
      <main className="app-shell-content">
        <RouteSkeleton />
      </main>
    </div>
  </div>
);
