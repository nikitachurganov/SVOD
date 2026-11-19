import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useTeamBilling } from '../../hooks/teamBilling.hooks';
import { getAiModel, setAiModel } from '../../lib/aiModel';

// The names people know; the cost note follows the weight of a strong model (1 instead of 0.2)
const KNOWN: Record<string, string> = {
  'z-ai/glm-5.3': 'GLM-5.3 — точнее, рекомендуем',
  'openai/gpt-5.4-mini': 'GPT-5.4 mini',
};

const label = (model: string, index: number): string =>
  index === 0 ? 'Базовая — быстрая и в 5 раз экономнее' : KNOWN[model] ?? model.split('/').pop() ?? model;

/**
 * The choice of the model for AI actions. Shown only while the team has Токены+: the server sends the
 * list it will accept, the base model first. A choice the team can no longer use is dropped.
 */
export const AiModelSelect = ({ className }: { className?: string }) => {
  const { summary } = useTeamBilling();
  const models = summary?.models ?? [];
  const [value, setValue] = useState<string | null>(getAiModel());

  useEffect(() => {
    // A choice the team can no longer use must not go to the server with the next request
    if (summary && value && !summary.models.includes(value)) setAiModel(null);
  }, [summary, value]);

  if (models.length < 2) return null;
  const selected = value && models.includes(value) ? value : models[0];
  return (
    <Select
      className={className}
      size="small"
      aria-label="Модель ИИ"
      value={selected}
      onChange={(next: string) => {
        const model = next === models[0] ? null : next;
        setAiModel(model);
        setValue(model);
      }}
      options={models.map((model, index) => ({ value: model, label: label(model, index) }))}
      popupMatchSelectWidth={false}
    />
  );
};
