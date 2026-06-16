import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, Input, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import {
  mapPublicApiError,
  submitPublicRequest,
  type PublicFormSummary,
} from '../shared/api/public.api';
import {
  pagesPayloadToInstances,
  type CreateFormPagePayload,
} from '../shared/api/forms.api';
import { mapDataToSnapshot } from '../shared/utils/mapDataToSnapshot';
import type { FormPageInstance } from '../shared/types/form-builder.types';
import { collectFieldIds, collectLeafFields } from '../shared/formily/collectFieldIds';
import {
  buildFormSnapshot,
  serializeFormValuesWithFields,
} from '../shared/formily/formSubmit.utils';
import {
  FormFillRenderer,
  type FormFillRendererHandle,
} from '../shared/ui/form-fill/FormFillRenderer';
import { FormFillWizardLayout } from '../shared/ui/form-fill/FormFillWizardLayout';
import { useFormStore } from '../shared/hooks/useFormStore';
import { usePublicFormFlow } from '../shared/hooks/publicFormFlow.hooks';
import type { PublicContactFormValues } from '../shared/context/publicFormFlow.context';
import { PublicOrgHeader } from '../components/public/PublicOrgHeader';
import { PhoneInput } from '../shared/ui/PhoneInput';
import { requiredRule } from '../shared/utils/formRules';
import { validateEmailValue, validatePhoneValue } from '../shared/utils/fieldValueValidation';

const EMPTY_CONTACTS: PublicContactFormValues = {
  fullName: '',
  email: '',
  phone: '',
  company: '',
};

const safeTrim = (value: string | undefined | null): string =>
  typeof value === 'string' ? value.trim() : '';

const findFirstTextFieldId = (pages: FormPageInstance[]): string | null => {
  for (const page of pages) {
    const leaves = collectLeafFields(page.fields);
    const hit = leaves.find((field) => field.type === 'shortText' || field.type === 'longText');
    if (hit) return hit.id;
  }
  return null;
};

export const PublicFormFillPage = () => {
  const { token, formId } = useParams<{ token: string; formId: string }>();
  const navigate = useNavigate();
  const [contactForm] = Form.useForm<PublicContactFormValues>();
  const flow = usePublicFormFlow();

  const {
    pageData,
    pageLoading,
    description,
    saveFormData,
    getFormData,
    saveContactData,
    getContactData,
    clearFormSession,
    setSuccess,
    goBackToSuggestions,
  } = flow;

  const [submitError, setSubmitError] = useState<string | null>(null);

  const formStore = useFormStore();
  const fillRef = useRef<FormFillRendererHandle>(null);
  const contactSectionRef = useRef<HTMLDivElement | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);

  const selectedForm: PublicFormSummary | undefined = useMemo(
    () => pageData?.forms.find((form) => form.id === formId),
    [pageData, formId],
  );

  const pageInstances: FormPageInstance[] = useMemo(
    () =>
      selectedForm
        ? pagesPayloadToInstances(selectedForm.pages as CreateFormPagePayload[])
        : [],
    [selectedForm],
  );

  const hasPages = pageInstances.length > 0;
  const currentPage = hasPages
    ? pageInstances[Math.min(pageIndex, pageInstances.length - 1)]
    : null;
  const isFirst = pageIndex === 0;
  const isLast = hasPages && pageIndex === pageInstances.length - 1;
  const showContacts = !hasPages || isLast;

  useEffect(() => {
    if (!formId) return;
    restoredRef.current = false;
    setPageIndex(0);
    fillRef.current?.resetFields();
    contactForm.resetFields();
  }, [formId, contactForm]);

  useEffect(() => {
    if (!formId || restoredRef.current) return;

    const savedValues = getFormData(formId);
    const savedContacts = getContactData(formId);

    if (savedValues && Object.keys(savedValues).length > 0) {
      fillRef.current?.setFieldsValue(savedValues);
      restoredRef.current = true;
    } else if (description && pageInstances.length > 0) {
      const fieldId = findFirstTextFieldId(pageInstances);
      if (fieldId) {
        fillRef.current?.setFieldsValue({ [fieldId]: description });
        restoredRef.current = true;
      }
    }

    if (savedContacts) {
      contactForm.setFieldsValue({ ...EMPTY_CONTACTS, ...savedContacts });
    }
  }, [formId, getFormData, getContactData, description, pageInstances, contactForm]);

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToContacts = () => {
    contactSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const persistDraftAndGoBack = () => {
    if (!token || !formId) return;
    const values = fillRef.current?.getFieldsValue() ?? {};
    saveFormData(formId, values);
    const contacts = contactForm.getFieldsValue(true) as PublicContactFormValues;
    saveContactData(formId, { ...EMPTY_CONTACTS, ...contacts });
    goBackToSuggestions();
    navigate(`/form/${token}`);
  };

  const handleBack = () => {
    persistDraftAndGoBack();
  };

  const handleNextPage = async () => {
    if (!currentPage) return;
    const ids = collectFieldIds(currentPage.fields);
    try {
      await fillRef.current?.validateFields(ids);
      setPageIndex((idx) => Math.min(idx + 1, pageInstances.length - 1));
      scrollToTop();
    } catch {
      // inline errors
    }
  };

  const handlePrevPage = () => {
    if (isFirst) {
      handleBack();
      return;
    }
    setPageIndex((idx) => Math.max(0, idx - 1));
    scrollToTop();
  };

  const handleSubmit = async () => {
    if (!token || !selectedForm || !formId) return;
    setSubmitError(null);

    try {
      await fillRef.current?.validateFields();
    } catch {
      scrollToTop();
      return;
    }

    let contacts: PublicContactFormValues;
    try {
      contacts = await contactForm.validateFields();
    } catch {
      scrollToContacts();
      return;
    }

    try {
      setIsSubmitting(true);

      const rawValues = fillRef.current?.getFieldsValue() ?? {};
      const allLeafFields = pageInstances.flatMap((page) => collectLeafFields(page.fields));
      const processed = serializeFormValuesWithFields(rawValues, allLeafFields);

      const snapshot = buildFormSnapshot(selectedForm, pageInstances);
      const alignedData = mapDataToSnapshot(processed, snapshot);

      const titleBase =
        safeTrim(description).slice(0, 120) || selectedForm.name || 'Заявка';

      const created = await submitPublicRequest(token, {
        full_name: safeTrim(contacts.fullName),
        applicant_company: safeTrim(contacts.company) || undefined,
        email: safeTrim(contacts.email),
        phone: safeTrim(contacts.phone) || undefined,
        form_id: selectedForm.id,
        title: titleBase.slice(0, 500),
        data: alignedData,
        form_snapshot: snapshot,
        applicant_description: safeTrim(description) || undefined,
      });

      clearFormSession(formId);
      setSuccess({
        requestNumber: created.request_number ?? created.id,
        organizationName: pageData?.organization_name ?? '',
      });
      navigate(`/form/${token}`, { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error && !('errorFields' in err)) {
        setSubmitError(mapPublicApiError(err).message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token || !formId) {
    return null;
  }

  if (pageLoading) {
    return (
      <div className="public-form-flow public-form-flow--centered">
        <Spin size="large" tip="Загрузка формы…" />
      </div>
    );
  }

  if (!pageData || !selectedForm) {
    return (
      <div className="public-form-flow">
        <div className="public-form-flow__content">
          <Alert type="error" message="Ошибка" description="Форма не найдена" showIcon />
          <Button type="link" onClick={() => navigate(`/form/${token}`)} style={{ marginTop: 16 }}>
            Вернуться назад
          </Button>
        </div>
      </div>
    );
  }

  const organization = pageData.organization ?? null;

  const fillActions = (
    <div className="public-form-flow__submit-bar">
      {hasPages && currentPage && currentPage.fields.length > 0 ? (
        <>
          <Button onClick={handlePrevPage}>Назад</Button>
          {!isLast && (
            <Button type="primary" onClick={() => void handleNextPage()}>
              Далее
            </Button>
          )}
          {isLast && (
            <Button type="primary" onClick={() => void handleSubmit()} loading={isSubmitting}>
              {isSubmitting ? 'Отправка…' : 'Отправить заявку'}
            </Button>
          )}
        </>
      ) : (
        <Button type="primary" onClick={() => void handleSubmit()} loading={isSubmitting}>
          {isSubmitting ? 'Отправка…' : 'Отправить заявку'}
        </Button>
      )}
    </div>
  );

  return (
    <div className="public-form-flow public-form-flow--fill">
      <PublicOrgHeader
        organization={organization}
        organizationName={pageData.organization_name}
        subtitle={selectedForm.name}
      />

      <div className="public-form-flow__fill-toolbar">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          aria-label="Назад к подбору форм"
        >
          Назад
        </Button>
      </div>

      <div className="public-form-flow__fill-main">
        <FormFillWizardLayout
          contentRef={contentRef}
          pageIndex={pageIndex}
          pageCount={pageInstances.length}
          pageTitle={currentPage?.title}
          notification={
            submitError ? (
              <Alert
                type="error"
                message="Ошибка отправки"
                description={submitError}
                closable
                onClose={() => setSubmitError(null)}
                style={{ marginBottom: 16 }}
              />
            ) : null
          }
          actions={fillActions}
        >
          <h1 className="public-form-flow__form-title">{selectedForm.name}</h1>

          {hasPages && currentPage && currentPage.fields.length > 0 ? (
            <FormFillRenderer
              ref={fillRef}
              pages={pageInstances}
              pageIndex={pageIndex}
              legacyStore={formStore}
            />
          ) : (
            <p style={{ color: 'var(--app-text-secondary)' }}>У выбранной формы нет полей.</p>
          )}

          {showContacts ? (
            <div ref={contactSectionRef} className="public-form-flow__contacts">
              <h2 className="public-form-flow__contacts-title">Ваши контакты</h2>
              <Form
                form={contactForm}
                layout="vertical"
                initialValues={EMPTY_CONTACTS}
                scrollToFirstError={{ behavior: 'smooth', block: 'center' }}
              >
                <Form.Item name="fullName" label="Имя" rules={[requiredRule('Укажите имя')]}>
                  <Input placeholder="Иван Иванов" />
                </Form.Item>
                <Form.Item
                  name="email"
                  label="Email"
                  rules={[
                    requiredRule('Укажите email'),
                    {
                      validator: async (_, value: string) => {
                        const emailError = validateEmailValue(value, true);
                        if (emailError) throw new Error(emailError);
                      },
                    },
                  ]}
                >
                  <Input placeholder="example@mail.com" />
                </Form.Item>
                <Form.Item
                  name="phone"
                  label="Телефон"
                  rules={[
                    {
                      validator: async (_, value: string | undefined) => {
                        if (!value?.trim()) return;
                        const phoneError = validatePhoneValue(value, false);
                        if (phoneError) throw new Error(phoneError);
                      },
                    },
                  ]}
                >
                  <PhoneInput />
                </Form.Item>
                <Form.Item name="company" label="Организация">
                  <Input placeholder="Название вашей организации" />
                </Form.Item>
              </Form>
            </div>
          ) : null}
        </FormFillWizardLayout>
      </div>
    </div>
  );
};
