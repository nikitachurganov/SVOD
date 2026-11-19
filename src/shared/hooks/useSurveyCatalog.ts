import { useCallback, useEffect, useState } from 'react';
import { getSurveyProjects, getSurveys, SURVEYS_CHANGED_EVENT, type SurveyListItem, type SurveyProject } from '../api/surveys.api';

type Result<T> = { key: string; data: T[]; failed: boolean };

/** Never expose results from a previous workspace or an obsolete request. */
export const useSurveyCatalog = (organizationId: string | null, enabled = true) => {
  const [revision, setRevision] = useState(0);
  const [surveys, setSurveys] = useState<Result<SurveyListItem>>();
  const [projects, setProjects] = useState<Result<SurveyProject>>();
  const key = `${organizationId}:${revision}`;
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    window.addEventListener(SURVEYS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SURVEYS_CHANGED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!organizationId || !enabled) return;
    let current = true;
    getSurveys(organizationId, { includeArchived: true }).then(
      (data) => { if (current) setSurveys({ key, data, failed: false }); },
      () => { if (current) setSurveys({ key, data: [], failed: true }); },
    );
    getSurveyProjects(organizationId).then(
      (data) => { if (current) setProjects({ key, data, failed: false }); },
      () => { if (current) setProjects({ key, data: [], failed: true }); },
    );
    return () => { current = false; };
  }, [organizationId, enabled, key]);

  return {
    surveys: surveys?.key === key ? surveys.data : [],
    projects: projects?.key === key ? projects.data : [],
    surveysLoading: !!organizationId && enabled && surveys?.key !== key,
    projectsLoading: !!organizationId && enabled && projects?.key !== key,
    surveysFailed: surveys?.key === key && surveys.failed,
    projectsFailed: projects?.key === key && projects.failed,
    refresh,
  };
};
