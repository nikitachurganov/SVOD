export const GlobalScrollbarStyles = () => {
  const css = `
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: var(--app-text-placeholder, rgba(0,0,0,0.25));
      border-radius: 999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--app-text-secondary, rgba(0,0,0,0.45));
    }
    * {
      scrollbar-width: thin;
      scrollbar-color: var(--app-text-placeholder, rgba(0,0,0,0.25)) transparent;
    }
  `;

  return <style data-purpose="global-scrollbar">{css}</style>;
};
