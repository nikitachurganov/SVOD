/** Feature flags (opt-out: disabled only when env is exactly 'false'). */

const isEnabled = (value: string | undefined): boolean => value !== 'false';

export const featureFlags = {
  executorMatching: isEnabled(import.meta.env.VITE_ENABLE_EXECUTOR_MATCHING),
  requestAssistant: isEnabled(import.meta.env.VITE_ENABLE_REQUEST_ASSISTANT),
} as const;
