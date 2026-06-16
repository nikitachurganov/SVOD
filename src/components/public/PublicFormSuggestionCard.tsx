import { Button, Card } from 'antd';
import type { PublicFormSummary, PublicSuggestedFormCard } from '../../shared/api/public.api';

const fieldCountLabel = (count: number): string => {
  if (count <= 0) return 'Несколько полей';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} поле`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} поля`;
  }
  return `${count} полей`;
};

const estimateMinutes = (count: number): string => {
  const minutes = Math.max(2, Math.min(15, Math.ceil(Math.max(count, 3) * 0.8)));
  return `~${minutes} мин на заполнение`;
};

interface PublicFormSuggestionCardProps {
  form: PublicSuggestedFormCard | PublicFormSummary;
  reason?: string;
  onSelect: () => void;
}

export const PublicFormSuggestionCard = ({
  form,
  reason,
  onSelect,
}: PublicFormSuggestionCardProps) => {
  const description =
    'short_description' in form && form.short_description
      ? form.short_description
      : 'description' in form
        ? form.description
        : '';
  const fieldCount = 'field_count' in form ? (form.field_count ?? 0) : 0;
  const cardReason = reason ?? ('reason' in form ? form.reason : '');

  return (
    <Card className="public-form-flow__suggestion-card" styles={{ body: { padding: 16 } }}>
      <div className="public-form-flow__suggestion-title">{form.name}</div>
      {description ? (
        <div className="public-form-flow__suggestion-description">{description}</div>
      ) : null}
      <div className="public-form-flow__suggestion-meta">
        {fieldCountLabel(fieldCount)} · {estimateMinutes(fieldCount)}
      </div>
      {cardReason ? (
        <div className="public-form-flow__suggestion-reason">{cardReason}</div>
      ) : null}
      <Button type="primary" onClick={onSelect} style={{ marginTop: 12 }}>
        Выбрать
      </Button>
    </Card>
  );
};
