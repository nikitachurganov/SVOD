import { useEffect, useRef } from 'react';
import type { FormFieldInstance } from '../../types/form-builder.types';
import { useFormCtx, type Rule } from '../../hooks/useFormStore';
import { useYandexMaps } from '../../hooks/useYandexMaps';
import { FieldLabel } from './FieldLabel';

interface AddressFieldProps {
  field: FormFieldInstance;
}

export const AddressField = ({ field }: AddressFieldProps) => {
  const ctx = useFormCtx();
  const { ymaps } = useYandexMaps();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggestViewRef = useRef<any | null>(null);

  useEffect(() => {
    const rules: Rule[] = field.required
      ? [{ required: true, message: 'Это поле обязательно для заполнения' }]
      : [];
    ctx.registerField(field.id, rules);
    return () => ctx.unregisterField(field.id);
  }, [field.id, field.required]);

  useEffect(() => {
    if (!ymaps || typeof window === 'undefined') return;
    if (!inputRef.current) return;
    if (suggestViewRef.current) return;

    const ymAny = ymaps as any;

    try {
      const provider = {
        suggest: (request: string, options: unknown) => {
          if (!request || request.length < 2) {
            if (ymAny.vow && typeof ymAny.vow.resolve === 'function') {
              return ymAny.vow.resolve([]);
            }
            return Promise.resolve([]);
          }

          const baseOptions = (options || {}) as Record<string, unknown>;
          return ymAny.suggest(request, {
            ...baseOptions,
            results: 5,
            boundedBy: [
              [41, 19],
              [82, 191],
            ],
            strictBounds: false,
          });
        },
      };

      const view = new ymAny.SuggestView(inputRef.current, {
        results: 5,
        provider,
      });

      suggestViewRef.current = view;
    } catch {
      // Graceful fallback — just keep the input as a normal text field
    }

    return () => {
      if (suggestViewRef.current && typeof suggestViewRef.current.destroy === 'function') {
        suggestViewRef.current.destroy();
        suggestViewRef.current = null;
      }
    };
  }, [ymaps]);

  const value = (ctx.values[field.id] as string) ?? '';
  const error = ctx.errors[field.id];

  return (
    <div style={{ marginBottom: 24 }}>
      <FieldLabel
        label={field.label || 'Адрес'}
        required={field.required}
      />
      <input
        ref={inputRef}
        placeholder="Начните вводить адрес..."
        value={value}
        onChange={(e) => ctx.setFieldValue(field.id, e.target.value)}
        style={{
          width: '100%',
          padding: '8px 16px',
          fontSize: '0.875rem',
          color: 'var(--cds-text-primary)',
          background: 'var(--cds-field)',
          border: `1px solid ${error ? 'var(--cds-support-error)' : 'var(--cds-border-strong)'}`,
          borderBottom: `2px solid ${error ? 'var(--cds-support-error)' : 'var(--cds-border-strong)'}`,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {field.description && (
        <div style={{ color: 'var(--cds-text-helper)', fontSize: '0.75rem', marginTop: 4 }}>
          {field.description}
        </div>
      )}
      {error && (
        <div style={{ color: 'var(--cds-text-error)', fontSize: '0.75rem', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
};
