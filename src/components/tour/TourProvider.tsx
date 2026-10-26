import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AxiosResponse } from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../shared/lib/api';
import { updateTourState } from '../../shared/api/onboarding.api';
import { removeDemoResponses } from '../../shared/api/surveys.api';
import { useNotifications } from '../../shared/context/notifications.context';
import { useAuth } from '../../shared/hooks/auth.hooks';
import { TourContext, type TourContextValue } from './tour.context';
import { TourRunner } from './TourRunner';
import {
  TOUR_START_PATH,
  TOUR_STEPS,
  hasTourData,
  nextTourStep,
  type TourData,
  type TourStepId,
} from './tourSteps';

const STORAGE_KEY = 'svod.tour.v1';

interface TourState {
  step: TourStepId;
  data: TourData;
}

/** Where the person stopped; the server only knows the step, the ids of what they made stay here */
const readStored = (userId: string): TourState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<TourState> & { userId?: string };
    const step = stored.step;
    if (stored.userId !== userId || !step || !TOUR_STEPS.some((item) => item.id === step)) return null;
    const data = stored.data ?? {};
    return hasTourData(step, data) ? { step, data } : null;
  } catch {
    return null;
  }
};

const writeStored = (userId: string, state: TourState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, ...state }));
  } catch {
    // Without storage the tour still works until the page is reloaded
  }
};

const clearStored = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
};

/** What happened in the app that moves the tour on, read from the answers of the API */
type TourEvent =
  | { type: 'project-created'; id: string }
  | { type: 'survey-created'; id: string }
  | { type: 'survey-published'; id: string }
  | { type: 'demo-generated' };

const toTourEvent = (response: AxiosResponse): TourEvent | null => {
  const method = response.config.method?.toLowerCase();
  const url = response.config.url ?? '';
  const id = typeof response.data?.id === 'string' ? (response.data.id as string) : null;

  if (method === 'post' && url === '/survey-projects' && id) return { type: 'project-created', id };
  if (method === 'post' && url === '/surveys' && id) return { type: 'survey-created', id };

  const match = url.match(/^\/surveys\/([^/]+)\/(status|demo-responses)$/);
  if (!match) return null;
  if (method === 'patch' && match[2] === 'status' && response.data?.status === 'open') {
    return { type: 'survey-published', id: match[1] };
  }
  if (method === 'post' && match[2] === 'demo-responses') return { type: 'demo-generated' };
  return null;
};

/**
 * Runs the guided tour. The person does the real things (creates a project, a survey, publishes it);
 * the tour watches the answers of the API and the address, and moves on when the step is done.
 */
export const TourProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, profile, refreshProfile } = useAuth();
  const { notifySuccess, notifyError } = useNotifications();
  const userId = user?.id ?? null;

  // A tour accepted earlier and not finished goes on from where it stopped
  const [state, setState] = useState<TourState | null>(() => {
    if (!userId || profile?.onboarding.tourStatus !== 'accepted') return null;
    return readStored(userId) ?? { step: 'project', data: {} };
  });
  // The events come from outside of React: they read the latest state from here
  const stateRef = useRef<TourState | null>(state);

  const go = useCallback(
    (step: TourStepId, data: TourData) => {
      const next = { step, data };
      stateRef.current = next;
      setState(next);
      if (userId) writeStored(userId, next);
      void updateTourState('accepted', step).catch(() => undefined);
    },
    [userId],
  );

  const end = useCallback(
    async (status: 'completed' | 'pending') => {
      stateRef.current = null;
      setState(null);
      clearStored();
      try {
        await updateTourState(status, null);
        await refreshProfile();
      } catch {
        // The tour is over here either way; the server catches up with the next answer
      }
    },
    [refreshProfile],
  );

  const start = useCallback(async () => {
    const first: TourState = { step: 'project', data: {} };
    stateRef.current = first;
    setState(first);
    if (userId) writeStored(userId, first);
    navigate(TOUR_START_PATH);
    try {
      await updateTourState('accepted', first.step);
      await refreshProfile();
    } catch {
      // Local progress still works
    }
  }, [userId, navigate, refreshProfile]);

  const next = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const following = nextTourStep(current.step);
    if (following) go(following, current.data);
    else void end('completed');
  }, [go, end]);

  const exit = useCallback(() => void end('pending'), [end]);

  const finish = useCallback(async () => {
    await end('completed');
    notifySuccess('Обучение пройдено', 'Его можно повторить из меню профиля');
  }, [end, notifySuccess]);

  const finishAndRemoveDemo = useCallback(async () => {
    const surveyId = stateRef.current?.data.surveyId;
    if (surveyId) {
      try {
        await removeDemoResponses(surveyId);
      } catch {
        notifyError('Не удалось удалить тестовые ответы', 'Попробуйте ещё раз');
        return;
      }
    }
    await end('completed');
    notifySuccess('Обучение пройдено', 'Тестовые ответы удалены');
    // The survey page shows the removed answers until it is loaded again
    if (surveyId && window.location.pathname.startsWith(`/surveys/${surveyId}`)) {
      window.location.reload();
    }
  }, [end, notifySuccess, notifyError]);

  const handleEvent = useCallback(
    (event: TourEvent) => {
      const current = stateRef.current;
      if (!current) return;
      const { step, data } = current;
      if (event.type === 'project-created' && step === 'project') {
        go('survey', { ...data, projectId: event.id });
        navigate(`/surveys/projects/${event.id}`);
      } else if (
        event.type === 'survey-created' &&
        (step === 'survey' || step === 'builder' || step === 'save')
      ) {
        go('publish', { ...data, surveyId: event.id });
      } else if (event.type === 'survey-published' && step === 'publish' && data.surveyId === event.id) {
        go('share', data);
      } else if (event.type === 'demo-generated' && step === 'demo') {
        go('responses-tab', data);
      }
    },
    [go, navigate],
  );

  useEffect(() => {
    const interceptor = api.interceptors.response.use((response) => {
      const event = toTourEvent(response);
      if (event) handleEvent(event);
      return response;
    });
    return () => api.interceptors.response.eject(interceptor);
  }, [handleEvent]);

  // Steps that are done by going somewhere
  useEffect(() => {
    if (!state) return;
    const { step, data } = state;
    const surveyId = data.surveyId;
    const surveyPath = `/surveys/${surveyId}`;
    let target: TourStepId | null = null;
    if (step === 'survey' && pathname === '/surveys/create') {
      target = 'builder';
    } else if (
      surveyId &&
      ['responses-tab', 'responses', 'analytics-tab'].includes(step) &&
      pathname === `${surveyPath}/analytics`
    ) {
      target = 'ai-summary';
    } else if (surveyId && step === 'responses-tab' && pathname.startsWith(`${surveyPath}/responses`)) {
      target = 'responses';
    }
    if (!target) return;
    const destination = target;
    const timer = window.setTimeout(() => go(destination, data), 0);
    return () => window.clearTimeout(timer);
  }, [pathname, state, go]);

  const value = useMemo<TourContextValue>(
    () => ({
      step: state?.step ?? null,
      data: state?.data ?? {},
      start,
      next,
      exit,
      finish,
      finishAndRemoveDemo,
    }),
    [state, start, next, exit, finish, finishAndRemoveDemo],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourRunner />
    </TourContext.Provider>
  );
};
