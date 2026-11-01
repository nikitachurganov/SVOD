import { createContext, type CSSProperties } from 'react';

/**
 * Id of the droppable under the pointer while a field from the tool panel is being dragged,
 * null otherwise. Cards and the canvas read it to draw where the new field will land.
 */
export const PanelDropTargetContext = createContext<string | null>(null);

/** Height of the gap opened for a field dragged in from the panel */
export const PANEL_DROP_PLACEHOLDER_HEIGHT = 120;

/** The slot a field will drop into: used by both a field moved on the canvas and one from the panel */
export const DROP_SLOT_STYLE: CSSProperties = {
  boxSizing: 'border-box',
  border: '2px dashed var(--app-primary)',
  borderRadius: 4,
  background: 'var(--app-highlight)',
};
