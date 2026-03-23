import { Button } from '@carbon/react';
import { Add, Close } from '@carbon/react/icons';
import type { FieldOption } from '../../types/form-builder.types';

interface FieldOptionsEditorProps {
  fieldType: 'radio' | 'checkbox' | 'dropdown';
  options: FieldOption[];
  onChange: (options: FieldOption[]) => void;
}

const OptionIndicator = ({
  fieldType,
}: {
  fieldType: FieldOptionsEditorProps['fieldType'];
}) => {
  if (fieldType === 'radio') {
    return (
      <input
        type="radio"
        disabled
        style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--cds-interactive)' }}
      />
    );
  }
  if (fieldType === 'checkbox') {
    return (
      <input
        type="checkbox"
        disabled
        style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--cds-interactive)' }}
      />
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--cds-text-helper)',
          display: 'block',
        }}
      />
    </span>
  );
};

export const FieldOptionsEditor = ({ fieldType, options, onChange }: FieldOptionsEditorProps) => {
  const handleLabelChange = (id: string, label: string) => {
    onChange(options.map((opt) => (opt.id === id ? { ...opt, label } : opt)));
  };

  const handleRemove = (id: string) => {
    if (options.length <= 1) return;
    onChange(options.filter((opt) => opt.id !== id));
  };

  const handleAdd = () => {
    onChange([
      ...options,
      { id: crypto.randomUUID(), label: `Вариант ${options.length + 1}` },
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {options.map((opt) => (
        <div
          key={opt.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 0',
          }}
        >
          <span
            style={{
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <OptionIndicator fieldType={fieldType} />
          </span>

          <input
            value={opt.label}
            placeholder="Вариант"
            onChange={(e) => handleLabelChange(opt.id, e.target.value)}
            style={{
              flex: 1,
              padding: '1px 4px',
              fontSize: 'inherit',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--cds-text-primary)',
            }}
          />

          <button
            onClick={() => handleRemove(opt.id)}
            disabled={options.length <= 1}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: options.length <= 1 ? 'not-allowed' : 'pointer',
              color: 'var(--cds-text-placeholder)',
              flexShrink: 0,
              opacity: options.length <= 1 ? 0.4 : 1,
            }}
            aria-label={`Удалить вариант ${opt.label}`}
          >
            <Close size={12} />
          </button>
        </div>
      ))}

      <Button
        kind="ghost"
        size="sm"
        renderIcon={Add}
        onClick={handleAdd}
        style={{
          alignSelf: 'flex-start',
          paddingInline: 0,
          marginTop: 2,
        }}
      >
        Добавить вариант
      </Button>
    </div>
  );
};
