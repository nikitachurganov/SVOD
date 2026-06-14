import { useEffect } from 'react';
import { createForm, type Form as FormilyFormType } from '@formily/core';
import { FormProvider } from '@formily/react';
import { Form } from '@formily/antd-v5';
import type { ISchema } from '@formily/json-schema';

import { SchemaField } from './fieldRegistry';

interface FormilyFormRendererProps {
  schema: ISchema;
  form?: FormilyFormType;
  onFormReady?: (form: FormilyFormType) => void;
}

export const FormilyFormRenderer = ({
  schema,
  form: externalForm,
  onFormReady,
}: FormilyFormRendererProps) => {
  const form = externalForm ?? createForm();

  useEffect(() => {
    onFormReady?.(form);
  }, [form, onFormReady]);

  return (
    <FormProvider form={form}>
      <Form component="form" layout="vertical">
        <SchemaField schema={schema} />
      </Form>
    </FormProvider>
  );
};

export default FormilyFormRenderer;
