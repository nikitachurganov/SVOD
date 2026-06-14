interface FieldLabelProps {
  label: string;
  required?: boolean;
  /** Если задан — рендерится как `<label htmlFor="...">`, иначе как `<div>` (например, для read-only). */
  htmlFor?: string;
}

/**
 * Лейбл поля формы: размер, цвет, нижний отступ через `.app-field-label`.
 * Обязательность — красная звёздочка после текста.
 */
export const FieldLabel = ({ label, required, htmlFor }: FieldLabelProps) => {
  const inner = (
    <>
      <span>{label}</span>
      {required && (
        <span className="app-field-label__required" aria-hidden>
          *
        </span>
      )}
    </>
  );

  if (htmlFor) {
    return (
      <label className="app-field-label" htmlFor={htmlFor}>
        {inner}
      </label>
    );
  }

  return <div className="app-field-label">{inner}</div>;
};
