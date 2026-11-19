import { useEffect, useState } from 'react';

import { getSurveyProjects, type SurveyProject } from '../../api/surveys.api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MoveSurveyModalProps {
  open: boolean;
  organizationId: string | null;
  surveyName: string;
  currentProjectId: string;
  onMove: (project: SurveyProject) => Promise<void>;
  onClose: () => void;
}

/** Pick the project to move a survey to. The id, public link and answers do not change. */
export const MoveSurveyModal = ({
  open,
  organizationId,
  surveyName,
  currentProjectId,
  onMove,
  onClose,
}: MoveSurveyModalProps) => {
  const [projects, setProjects] = useState<SurveyProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    setSelected(null);
    setError(null);
    setLoadFailed(false);
    setLoading(true);
    getSurveyProjects(organizationId)
      .then((list) => { if (!cancelled) setProjects(list); })
      .catch(() => { if (!cancelled) setLoadFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, organizationId]);

  const submit = async () => {
    const target = projects.find((project) => project.id === selected);
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await onMove(target);
    } catch {
      setError('Не удалось переместить опрос. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-[460px]" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Переместить в проект</DialogTitle>
          <DialogDescription className="break-words text-xs">
            Опрос «{surveyName}» переедет в выбранный проект. Ссылка для респондентов, ответы и аналитика останутся прежними.
          </DialogDescription>
        </DialogHeader>
        <Select value={selected ?? undefined} onValueChange={setSelected} disabled={loading || loadFailed}>
          <SelectTrigger aria-label="Проект назначения" className="h-10 w-full text-sm">
            <SelectValue placeholder={loading ? 'Загрузка…' : projects.length ? 'Выберите проект' : 'Проектов нет'} />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id} disabled={project.id === currentProjectId}>
                {project.id === currentProjectId ? `${project.name} (текущий)` : project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loadFailed && <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-xs text-destructive">Не удалось загрузить список проектов</div>}
        {error && <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-xs text-destructive">{error}</div>}
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onClose}>Отмена</Button>
          <Button type="button" size="sm" disabled={!selected || loadFailed || saving} aria-busy={saving} onClick={() => void submit()}>Переместить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
