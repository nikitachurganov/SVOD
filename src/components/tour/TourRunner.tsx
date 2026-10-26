import { useEffect, useState } from 'react';
import { Button, Space, Tour } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTour } from './useTour';
import { TOUR_STEPS, getTourStep, tourStepNumber } from './tourSteps';
import './TourRunner.css';

const POLL_MS = 250;
/** A step that waits for a window to close moves on if the window was never there */
const MISSING_TARGET_GRACE_MS = 1500;

const findTarget = (selectors: string[]): HTMLElement | null => {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return null;
};

/** Shows the card of the current step next to the thing it is about */
export const TourRunner = () => {
  const { step, data, next, exit, finish, finishAndRemoveDemo } = useTour();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [found, setFound] = useState<{ step: string; element: HTMLElement | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const config = step ? getTourStep(step) : null;
  const here = !!config && config.isHere(pathname, data);
  const configId = config?.id;
  const waitsForGone = !!config?.advanceWhenGone;

  // The page draws the target after the step starts (and may redraw it): look for it on a timer
  useEffect(() => {
    if (!configId || !here) return;
    const targets = getTourStep(configId).targets;
    const startedAt = Date.now();
    let seen = false;

    const tick = () => {
      const element = findTarget(targets);
      setFound((previous) =>
        previous?.step === configId && previous.element === element ? previous : { step: configId, element },
      );
      if (element) seen = true;
      if (waitsForGone && ((seen && !element) || (!seen && Date.now() - startedAt > MISSING_TARGET_GRACE_MS))) {
        next();
      }
    };

    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [configId, here, waitsForGone, next]);

  // Without dimming the target is shown by an outline
  const outlined = config?.freeInteraction && found?.step === config.id ? found.element : null;
  useEffect(() => {
    if (!outlined) return;
    outlined.setAttribute('data-tour-active', 'true');
    return () => outlined.removeAttribute('data-tour-active');
  }, [outlined]);

  if (!config) return null;

  if (!here) {
    return (
      <div className="tour-resume" role="status">
        <span className="tour-resume__text">Обучение: {config.title}</span>
        <Space size={4}>
          <Button size="small" type="primary" onClick={() => navigate(config.resumePath(data))}>
            Вернуться
          </Button>
          <Button size="small" type="text" onClick={exit}>
            Выйти
          </Button>
        </Space>
      </div>
    );
  }

  const element = found?.step === config.id ? found.element : null;
  const isLast = config.id === 'finish';
  const progress = `Шаг ${tourStepNumber(config.id)} из ${TOUR_STEPS.length}`;

  const removeDemoAndFinish = async () => {
    setBusy(true);
    try {
      await finishAndRemoveDemo();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tour
      key={config.id}
      open
      zIndex={1100}
      mask={!config.freeInteraction}
      rootClassName="tour-popup"
      onClose={exit}
      steps={[
        {
          title: config.title,
          description: config.description,
          target: element,
          scrollIntoViewOptions: { block: 'center' },
        },
      ]}
      indicatorsRender={() => null}
      actionsRender={() => (
        <Space size={8} wrap>
          <span className="tour-popup__progress">{progress}</span>
          {isLast ? (
            <>
              {data.surveyId && (
                <Button size="small" loading={busy} onClick={() => void removeDemoAndFinish()}>
                  Удалить тестовые ответы
                </Button>
              )}
              <Button size="small" type="primary" disabled={busy} onClick={() => void finish()}>
                Завершить
              </Button>
            </>
          ) : (
            <>
              <Button size="small" type="text" onClick={exit}>
                Выйти из обучения
              </Button>
              {config.manualNext && (
                <Button size="small" type="primary" onClick={next}>
                  Далее
                </Button>
              )}
            </>
          )}
        </Space>
      )}
    />
  );
};
