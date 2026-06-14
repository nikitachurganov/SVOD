import {
  forwardRef,
  Suspense,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { Spin } from 'antd';
import { createForm, type Form as FormilyFormType } from '@formily/core';

import type { FormStoreInstance } from '../../hooks/formStore.types';
import type { FormPageInstance } from '../../types/form-builder.types';
import { collectFieldIds } from '../../formily/collectFieldIds';
import { LazyFormilyFormRenderer } from '../../formily/lazyFormilyFormRenderer';
import { pageToFormilySchema } from '../../formily/schemaMapper';
import { shouldUseFormilyRuntime } from '../../formily/supportedTypes';
import { LegacyFormFill } from './LegacyFormFill';

export interface FormFillRendererHandle {
  validateFields: (names?: string[]) => Promise<Record<string, unknown>>;
  getFieldsValue: () => Record<string, unknown>;
  setFieldsValue: (values: Record<string, unknown>) => void;
  resetFields: () => void;
}

export interface FormFillRendererProps {
  pages: FormPageInstance[];
  pageIndex: number;
  legacyStore: FormStoreInstance;
}

const buildPagesIdentity = (pages: FormPageInstance[]): string =>
  pages
    .map((page) => `${page.id}:${collectFieldIds(page.fields).join(',')}`)
    .join('|');

export const FormFillRenderer = forwardRef<FormFillRendererHandle, FormFillRendererProps>(
  function FormFillRenderer({ pages, pageIndex, legacyStore }, ref) {
    const useFormily = shouldUseFormilyRuntime(pages);
    const currentPage = pages[pageIndex];
    const currentFields = useMemo(
      () => currentPage?.fields ?? [],
      [currentPage],
    );
    const formilyFormRef = useRef<FormilyFormType | null>(null);

    const allFieldIds = useMemo(
      () => pages.flatMap((page) => collectFieldIds(page.fields)),
      [pages],
    );

    const pageSchema = useMemo(
      () => (currentPage ? pageToFormilySchema(currentPage) : { type: 'object', properties: {} }),
      [currentPage],
    );

    const formCache = useMemo(() => {
      const identity = buildPagesIdentity(pages);
      return { identity, form: createForm() };
    }, [pages]);

    const pagesIdentity = formCache.identity;
    const formilyForm = formCache.form;

    useImperativeHandle(
      ref,
      () => ({
        validateFields: async (names?: string[]) => {
          if (useFormily && formilyFormRef.current) {
            const targets = names ?? allFieldIds;
            await Promise.all(targets.map((name) => formilyFormRef.current!.validate(name)));
            return formilyFormRef.current.values as Record<string, unknown>;
          }
          return legacyStore.validateFields(names);
        },
        getFieldsValue: () => {
          if (useFormily && formilyFormRef.current) {
            return formilyFormRef.current.values as Record<string, unknown>;
          }
          return legacyStore.getFieldsValue();
        },
        setFieldsValue: (values: Record<string, unknown>) => {
          if (useFormily && formilyFormRef.current) {
            formilyFormRef.current.setValues(values);
            return;
          }
          legacyStore.setFieldsValue(values);
        },
        resetFields: () => {
          if (useFormily && formilyFormRef.current) {
            formilyFormRef.current.reset();
            return;
          }
          legacyStore.resetFields();
        },
      }),
      [allFieldIds, legacyStore, useFormily],
    );

    if (!useFormily) {
      return <LegacyFormFill fields={currentFields} store={legacyStore} />;
    }

    return (
      <Suspense fallback={<Spin />}>
        <LazyFormilyFormRenderer
          key={pagesIdentity}
          schema={pageSchema}
          form={formilyForm}
          onFormReady={(form) => {
            formilyFormRef.current = form;
          }}
        />
      </Suspense>
    );
  },
);
