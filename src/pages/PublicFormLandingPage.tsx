import { useCallback } from 'react';
import { Alert, Button, Input, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { PublicFormErrorScreen } from '../components/public/PublicFormErrorScreen';
import { PublicFormSuccessScreen } from '../components/public/PublicFormSuccessScreen';
import { PublicFormSuggestionCard } from '../components/public/PublicFormSuggestionCard';
import { PublicOrgHeader } from '../components/public/PublicOrgHeader';
import {
  mapPublicApiError,
  suggestPublicForms,
} from '../shared/api/public.api';
import { usePublicFormFlow } from '../shared/hooks/publicFormFlow.hooks';
import {
  MIN_PUBLIC_DESCRIPTION_LENGTH,
  savePublicDescriptionDraft,
} from '../shared/utils/publicDescriptionDraft';

const { TextArea } = Input;

const SUGGEST_MIN_LOADING_MS = 1500;

export const PublicFormLandingPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const flow = usePublicFormFlow();

  const {
    pageData,
    pageLoading,
    errorCode,
    errorMessage,
    step,
    setStep,
    description,
    setDescription,
    suggestions,
    setSuggestions,
    suggestHint,
    setSuggestHint,
    suggestError,
    setSuggestError,
    showManualList,
    setShowManualList,
    restoreSuggestionsFromCache,
    cacheSuggestions,
    success,
    resetFlow,
    goBackToLanding,
  } = flow;

  const organization = pageData?.organization ?? null;
  const organizationName = pageData?.organization_name ?? organization?.name ?? '';
  const landingTitle =
    pageData?.link?.custom_title?.trim() || 'Опишите, что вам нужно';
  const landingSubtitle =
    pageData?.link?.custom_description?.trim() ||
    'Мы подберём подходящую форму для вашей заявки';

  const descriptionReady = description.trim().length >= MIN_PUBLIC_DESCRIPTION_LENGTH;

  const activeForms = (pageData?.forms ?? []).filter((form) => !form.is_universal);

  const handleSuggest = useCallback(async () => {
    if (!token || !descriptionReady) return;
    const trimmed = description.trim();
    savePublicDescriptionDraft(token, trimmed);

    if (restoreSuggestionsFromCache(trimmed)) {
      return;
    }

    setStep('suggesting');
    setSuggestError(null);
    setSuggestHint(null);
    setShowManualList(false);

    const startedAt = Date.now();
    try {
      const result = await suggestPublicForms(token, trimmed);
      const elapsed = Date.now() - startedAt;
      if (elapsed < SUGGEST_MIN_LOADING_MS) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, SUGGEST_MIN_LOADING_MS - elapsed);
        });
      }
      setSuggestions(result.forms);
      setSuggestHint(result.hint ?? null);
      setStep('suggestions');
      if (result.forms.length === 0) {
        setShowManualList(true);
      }
      cacheSuggestions(trimmed, {
        forms: result.forms,
        hint: result.hint ?? null,
        suggestError: null,
        showManualList: result.forms.length === 0,
      });
    } catch (err: unknown) {
      const elapsed = Date.now() - startedAt;
      if (elapsed < SUGGEST_MIN_LOADING_MS) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, SUGGEST_MIN_LOADING_MS - elapsed);
        });
      }
      const mapped = mapPublicApiError(err);
      setSuggestError(mapped.message);
      setSuggestions([]);
      setStep('suggestions');
      setShowManualList(true);
      cacheSuggestions(trimmed, {
        forms: [],
        hint: null,
        suggestError: mapped.message,
        showManualList: true,
      });
    }
  }, [
    token,
    description,
    descriptionReady,
    cacheSuggestions,
    restoreSuggestionsFromCache,
    setShowManualList,
    setStep,
    setSuggestError,
    setSuggestHint,
    setSuggestions,
  ]);

  const handleSelectForm = useCallback(
    (formId: string) => {
      if (!token) return;
      savePublicDescriptionDraft(token, description.trim());
      navigate(`/form/${token}/fill/${formId}`);
    },
    [token, description, navigate],
  );

  const handleSubmitAnother = useCallback(() => {
    resetFlow();
    if (token) navigate(`/form/${token}`, { replace: true });
  }, [resetFlow, token, navigate]);

  if (pageLoading) {
    return (
      <div className="public-form-flow public-form-flow--centered">
        <Spin size="large" />
      </div>
    );
  }

  if (success) {
    return (
      <PublicFormSuccessScreen
        organizationName={success.organizationName}
        requestNumber={success.requestNumber}
        onSubmitAnother={handleSubmitAnother}
      />
    );
  }

  if (step === 'error') {
    return <PublicFormErrorScreen code={errorCode} message={errorMessage ?? undefined} />;
  }

  if (!pageData || !token) {
    return <PublicFormErrorScreen />;
  }

  return (
    <div className="public-form-flow">
      <PublicOrgHeader
        organization={organization}
        organizationName={organizationName}
        subtitle="Подать заявку"
      />

      <main className="public-form-flow__content">
        {step === 'landing' && (
          <div className="public-form-flow__panel public-form-flow--fade-in">
            <h1 className="public-form-flow__title">{landingTitle}</h1>
            <p className="public-form-flow__subtitle">{landingSubtitle}</p>

            {pageData.organization_description ? (
              <p className="public-form-flow__org-description">
                {pageData.organization_description}
              </p>
            ) : null}

            <TextArea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Например: нужно заказать визитки для офиса, 500 штук, двусторонняя печать"
              rows={5}
              maxLength={4000}
              showCount
            />

            <Button
              type="primary"
              size="large"
              block
              disabled={!descriptionReady}
              onClick={() => void handleSuggest()}
              style={{ marginTop: 16 }}
            >
              Подобрать форму
            </Button>

            <button
              type="button"
              className="public-form-flow__manual-link"
              onClick={() => setShowManualList(!showManualList)}
            >
              Или выберите форму вручную
            </button>

            {showManualList && activeForms.length > 0 && (
              <div className="public-form-flow__manual-list">
                <p className="public-form-flow__section-title">Выберите форму вручную:</p>
                {activeForms.map((form) => (
                  <PublicFormSuggestionCard
                    key={form.id}
                    form={form}
                    onSelect={() => handleSelectForm(form.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {step === 'suggesting' && (
          <div className="public-form-flow__panel public-form-flow__loading public-form-flow--fade-in">
            <Spin size="large" />
            <p>Анализируем вашу заявку...</p>
          </div>
        )}

        {step === 'suggestions' && (
          <div className="public-form-flow__panel public-form-flow--fade-in">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={goBackToLanding}
              style={{ marginBottom: 12, paddingInline: 0 }}
            >
              Назад
            </Button>

            {suggestError ? (
              <Alert
                type="warning"
                showIcon
                message="Не удалось автоматически подобрать форму"
                description={suggestError}
                style={{ marginBottom: 16 }}
              />
            ) : suggestions.length === 0 ? (
              <Alert
                type="info"
                showIcon
                message="Не удалось автоматически подобрать форму"
                style={{ marginBottom: 16 }}
              />
            ) : (
              <p className="public-form-flow__section-title">Рекомендуемые формы</p>
            )}

            {suggestHint ? (
              <Alert type="info" showIcon description={suggestHint} style={{ marginBottom: 16 }} />
            ) : null}

            {suggestions.map((form) => (
              <PublicFormSuggestionCard
                key={form.id}
                form={form}
                onSelect={() => handleSelectForm(form.id)}
              />
            ))}

            {(showManualList || suggestions.length === 0) && activeForms.length > 0 && (
              <div className="public-form-flow__manual-list">
                <p className="public-form-flow__section-title">Выберите форму вручную:</p>
                {activeForms.map((form) => (
                  <PublicFormSuggestionCard
                    key={form.id}
                    form={form}
                    onSelect={() => handleSelectForm(form.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
