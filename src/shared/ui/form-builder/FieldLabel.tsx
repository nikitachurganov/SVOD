interface FieldLabelProps {
  label: string;
  required?: boolean;
  /** Если задан — рендерится как `<label htmlFor="...">`, иначе как `<div>` (например, для read-only). */
  htmlFor?: string;
}

/**
 * Лейбол в стиле Carbon (класс `.cds--label`): размер, цвет, нижний отступ.
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
      <label className="cds--label app-field-label" htmlFor={htmlFor}>
        {inner}
      </label>
    );
  }

  return <div className="cds--label app-field-label">{inner}</div>;
};
