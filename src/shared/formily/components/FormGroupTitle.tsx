interface FormGroupTitleProps {
  title?: string;
  description?: string;
}

export const FormGroupTitle = ({ title, description }: FormGroupTitleProps) => {
  if (!title && !description) return null;

  return (
    <section className="app-form-field-group" style={{ marginBottom: 24 }}>
      {title ? (
        <div className="app-form-field-group__header">
          <h3 className="app-form-field-group__title">{title}</h3>
        </div>
      ) : null}
      {description ? (
        <p className="app-form-field-group__description">{description}</p>
      ) : null}
    </section>
  );
};
