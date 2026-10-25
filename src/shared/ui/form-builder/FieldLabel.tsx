interface FieldLabelProps {
  label: string;
  required?: boolean;
  /** Если задан — рендерится как `<label htmlFor="...">`, иначе как `<div>` (например, для read-only). */
  htmlFor?: string;
  /** Заголовок вопроса при заполнении: как у FormItem (крупнее, звёздочка слева). */
  question?: boolean;
}

/**
 * Лейбл поля формы: размер, цвет, нижний отступ через `.app-field-label`.
 * Обязательность — красная звёздочка после текста.
 */
export const FieldLabel = ({ label, required, htmlFor, question }: FieldLabelProps) => {
  const className = question ? 'app-field-label app-field-label--question' : 'app-field-label';
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
      <label className={className} htmlFor={htmlFor}>
        {inner}
      </label>
    );
  }

  return <div className={className}>{inner}</div>;
};
