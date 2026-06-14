export interface YMapsSuggestView {
  destroy: () => void;
  events: {
    add: (event: string, handler: (event: { get: (key: string) => { value: string } }) => void) => void;
  };
}

export interface YMapsApi {
  ready: (callback: () => void) => void;
  suggest: (request: string, options: Record<string, unknown>) => Promise<unknown>;
  SuggestView: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => YMapsSuggestView;
  vow?: {
    resolve: <T>(value: T) => Promise<T>;
  };
}

declare global {
  interface Window {
    ymaps?: YMapsApi;
  }
}

export {};
