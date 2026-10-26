interface FormTextBlockProps {
  title?: string;
  text?: string;
}

/** Static content between questions: a greeting, an instruction, a section explanation */
export const FormTextBlock = ({ title, text }: FormTextBlockProps) => {
  if (!title && !text) return null;

  return (
    <section className="app-form-text-block">
      {title ? <h3 className="app-form-text-block__title">{title}</h3> : null}
      {text ? <p className="app-form-text-block__text">{text}</p> : null}
    </section>
  );
};
