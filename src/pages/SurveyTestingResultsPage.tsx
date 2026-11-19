import { useId, useState } from 'react';
import { Flame, Maximize2, MousePointer2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/segmented';
import { TESTING_RUNS, TESTING_SCENES } from '../shared/data/surveyTesting';
import type { TestingMap } from '../shared/data/surveyTesting';

const overview = TESTING_RUNS[TESTING_RUNS.length - 1];
const runOptions = [overview, ...TESTING_RUNS.slice(0, -1)].map(({ id, name }) => ({ value: id, label: name }));
const scale = 65;
const assetUrl = (image: string) => `${import.meta.env.BASE_URL}survey-testing/${image}`;

interface MapLayers {
  showHeat: boolean;
  showClicks: boolean;
}

function TestingMapView({ map, title, showHeat, showClicks }: MapLayers & { map: TestingMap; title: string }) {
  const gradientId = useId();

  return (
    <div className="relative overflow-hidden rounded-lg bg-white">
      <img src={assetUrl(map.image)} alt={`Снимок экрана «${title}»`} width={1440} height={1000} className="block h-auto w-full" />
      <svg viewBox="0 0 1440 1000" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0" stopColor="#de301c" />
            <stop offset=".45" stopColor="#f9691d" stopOpacity=".76" />
            <stop offset=".74" stopColor="#ffb834" stopOpacity=".45" />
            <stop offset="1" stopColor="#ffcd45" stopOpacity="0" />
          </radialGradient>
        </defs>
        {showHeat && [...map.zones].sort((a, b) => a.weight - b.weight).map((zone) => (
          <ellipse
            key={zone.label}
            cx={zone.x + zone.width / 2}
            cy={zone.y + zone.height / 2}
            rx={Math.max(29, Math.min(90, zone.width * .39 + 19))}
            ry={Math.max(22, Math.min(57, zone.height * .45 + 17))}
            fill={`url(#${gradientId})`}
            opacity={.12 + .67 * zone.weight / scale}
          />
        ))}
        {showClicks && map.clicks.map(({ x, y, n }) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={6 + Math.min(n - 1, 5) * 1.7} fill="#13509b" stroke="#fff" strokeWidth={2} />
        ))}
      </svg>
    </div>
  );
}

export function SurveyTestingResultsPage() {
  const [params, setParams] = useSearchParams();
  const [showHeat, setShowHeat] = useState(true);
  const [showClicks, setShowClicks] = useState(true);
  const run = TESTING_RUNS.find(({ id }) => id === params.get('run')) ?? overview;
  const sceneIndex = Math.max(0, TESTING_SCENES.findIndex(({ id }) => id === params.get('screen')));
  const scene = TESTING_SCENES[sceneIndex];
  const map = run.maps[sceneIndex];
  const layers = { showHeat, showClicks };
  const zones = [...map.zones].sort((a, b) => b.weight - a.weight);

  function select(key: 'run' | 'screen', value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { preventScrollReset: true });
  }

  return (
    <main className="sv-ui h-dvh overflow-y-auto bg-[var(--app-bg)]" aria-labelledby="testing-results-title" tabIndex={0}>
      <div className="mx-auto grid w-full max-w-[1184px] gap-6 px-4 py-6 text-foreground md:p-8">
        <header>
          <h1 id="testing-results-title" className="text-[22px] leading-tight font-bold">Наблюдения за использованием СВОД</h1>
        </header>

        <section aria-label="Карты тестирования" className="grid min-w-0 gap-4">
          <div>
            <Segmented
              aria-label="Набор тепловых карт"
              value={run.id}
              options={runOptions}
              onChange={(id) => select('run', id)}
              className="max-w-full flex-wrap"
            />
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Экран тестирования">
            {TESTING_SCENES.map(({ id, title }) => (
              <Button
                key={id}
                type="button"
                variant={id === scene.id ? 'secondary' : 'outline'}
                aria-pressed={id === scene.id}
                onClick={() => select('screen', id)}
              >
                {title}
              </Button>
            ))}
          </div>

          <Card className="min-w-0">
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{scene.title}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1" role="group" aria-label="Слои карты">
                  <Button type="button" size="sm" variant={showHeat ? 'secondary' : 'ghost'} aria-pressed={showHeat} onClick={() => setShowHeat(!showHeat)}>
                    <Flame aria-hidden="true" /> Модель частоты
                  </Button>
                  <Button type="button" size="sm" variant={showClicks ? 'secondary' : 'ghost'} aria-pressed={showClicks} onClick={() => setShowClicks(!showClicks)}>
                    <MousePointer2 aria-hidden="true" /> Тестовые клики
                  </Button>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm"><Maximize2 aria-hidden="true" /> Увеличить</Button>
                  </DialogTrigger>
                  <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-auto sm:max-w-[min(1060px,calc(100%-2rem))]">
                    <div className="flex items-center justify-between gap-4">
                      <DialogTitle>{scene.title} · {run.name}</DialogTitle>
                      <DialogClose asChild>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Закрыть карту"><X aria-hidden="true" /></Button>
                      </DialogClose>
                    </div>
                    <DialogDescription className="sr-only">Увеличенный снимок с выбранными слоями карты кликов.</DialogDescription>
                    <TestingMapView map={map} title={scene.title} {...layers} />
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_230px]">
              <figure className="m-0 min-w-0">
                <div className="rounded-lg border border-border">
                  <TestingMapView map={map} title={scene.title} {...layers} />
                </div>
              </figure>
              <section aria-label="Статистика по зонам" className="min-w-0">
                <h3 className="text-sm font-semibold">Зоны кликов</h3>
                <p className="mb-1 mt-1 text-xs text-muted-foreground">Модель частоты по шкале 0–{scale}. Синие метки показывают тестовые клики.</p>
                <ul className="divide-y divide-border">
                  {zones.map((zone) => (
                    <li key={zone.label} className="grid gap-1 py-2.5">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span>{zone.label}</span>
                        <strong className="tabular-nums">{zone.weight.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</strong>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`Вес зоны «${zone.label}»`}
                        aria-valuenow={zone.weight}
                        aria-valuemin={0}
                        aria-valuemax={scale}
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${100 * zone.weight / scale}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">Кликов: {zone.hits}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader><h2 className="text-base font-semibold">Что проверить в самом СВОД</h2></CardHeader>
          <CardContent className="grid gap-4 text-sm leading-relaxed">
            <div><h3 className="font-semibold">Понимают ли исследователи, что черновик можно изменить?</h3>
              <p>Во всех четырёх сценариях черновик открыли в конструкторе и перешли к публикации. В следующем тесте дать анкету с наводящим вопросом и попросить подготовить её к отправке. Замерить, сколько участников заметят и исправят формулировку без подсказки.</p></div>
            <div><h3 className="font-semibold">Понятно ли, что делать после ошибки публикации?</h3>
              <p>При тестовой ошибке анкета сохранилась, повторная публикация сработала. Показать участникам два варианта сообщения об ошибке, один — с действием «Попробовать снова». Сравнить долю тех, кто опубликует ту же анкету без помощи.</p></div>
            <div><h3 className="font-semibold">Помогает ли ссылка на вопрос проверить вывод ИИ?</h3>
              <p>Во всех четырёх сценариях ссылка из резюме открыла статистику нужного вопроса. Дать исследователям вывод и попросить решить, стоит ли менять продукт. Сравнить резюме со ссылкой и без неё по доле участников, которые верно назовут исходные числа и предложат проверяемую гипотезу.</p></div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
