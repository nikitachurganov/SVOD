import { getRequestById } from '../shared/api/requests.api';
import { getFormById, pagesPayloadToInstances, type FormResponse } from '../shared/api/forms.api';
import type { FormFieldInstance, FormPageInstance } from '../shared/types/form-builder.types';
import { parseRequestData } from '../shared/utils/parseRequestData';
import type { RequestEntity } from '../types/request';
import type { Field, FieldOption, FormEntity } from '../types/form';

const collectLeafFields = (pages: FormPageInstance[]): FormFieldInstance[] => {
  const result: FormFieldInstance[] = [];

  const walk = (fields: FormFieldInstance[]) => {
    for (const field of fields) {
      if (field.type === 'group' && field.children && field.children.length > 0) {
        walk(field.children);
      } else {
        result.push(field);
      }
    }
  };

  for (const page of pages) {
    walk(page.fields);
  }

  return result;
};

const mapForm = (row: FormResponse): FormEntity => {
  const pages = pagesPayloadToInstances(row.pages);
  const leafFields = collectLeafFields(pages);

  const fields: Field[] = leafFields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    options: f.options?.map<FieldOption>((opt) => ({ id: opt.id, label: opt.label })),
  }));

  return {
    id: row.id,
    title: row.name,
    fields,
    author: row.author,
  };
};

export interface RequestWithForm {
  request: RequestEntity;
  form: FormEntity;
  parsedData: Record<string, unknown>;
}

export async function getRequestWithForm(id: string): Promise<RequestWithForm> {
  try {
    const requestRow = await getRequestById(id);
    const parsedData = parseRequestData(requestRow.data);

    let form: FormEntity;
    let snapshot: FormEntity | null = null;

    if (requestRow.form_snapshot) {
      snapshot = requestRow.form_snapshot as FormEntity;
      form = snapshot;
    } else {
      const formRow = await getFormById(requestRow.form_id);
      form = mapForm(formRow);
    }

    const request: RequestEntity = {
      id: requestRow.id,
      title: requestRow.title,
      form_id: requestRow.form_id,
      data: parsedData,
      status: requestRow.status,
      closedAt: requestRow.closedAt,
      created_by_user_id: requestRow.created_by_user_id,
      author: requestRow.author,
      created_at: requestRow.created_at,
      updated_at: requestRow.updated_at,
      form_snapshot: snapshot,
      ai_summary: requestRow.ai_summary ?? null,
      people: requestRow.people ?? [],
    };

    return { request, form, parsedData: parsedData };
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to load request details: ${err.message}`);
    }
    throw new Error('Failed to load request details');
  }
}

