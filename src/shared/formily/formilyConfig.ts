/** Feature flag: enable Formily runtime when form schema is fully supported */
export const isFormilyRuntimeEnabled = (): boolean =>
  import.meta.env.VITE_FORMILY_RUNTIME === 'true';
