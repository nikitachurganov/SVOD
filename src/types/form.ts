import type { AuthorPreview } from './author';

export interface FieldOption {
  id: string;
  label: string;
}

export interface Field {
  id: string;
  label: string;
  type: string;
  /** Present when request was created with a form snapshot that includes flags. */
  required?: boolean;
  options?: FieldOption[];
}

export interface FormEntity {
  id: string;
  title: string;
  fields: Field[];
  author?: AuthorPreview | null;
}

