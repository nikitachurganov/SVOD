import { useLayoutEffect, useRef, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';

const HEIGHT = 210;
const TAB_WIDTH = 132;
const SHELL_TOP = 20;

/**
 * Outline of the project folder: the same tab, fillet and corners as the coloured folders, so the
 * "new project" slot reads as an empty folder. Drawn for the real width, so corners never stretch.
 */
const folderPath = (w: number, h: number): string => {
  const s = 1; // half of the stroke: the line stays inside the box
  return [
    `M${s} ${16 + s}`,
    `A${16 - s} ${16 - s} 0 0 1 ${16} ${s}`,
    `H${TAB_WIDTH - 12}`,
    `A${12 - s} ${12 - s} 0 0 1 ${TAB_WIDTH - s} 12`,
    `A8 8 0 0 0 ${TAB_WIDTH + 8 - s} ${SHELL_TOP}`,
    `H${w - 16}`,
    `A${16 - s} ${16 - s} 0 0 1 ${w - s} ${SHELL_TOP + 16}`,
    `V${h - 16}`,
    `A${16 - s} ${16 - s} 0 0 1 ${w - 16} ${h - s}`,
    `H16`,
    `A${16 - s} ${16 - s} 0 0 1 ${s} ${h - 16}`,
    'Z',
  ].join(' ');
};

interface NewProjectFolderProps {
  onClick: () => void;
}

export const NewProjectFolder = ({ onClick }: NewProjectFolderProps) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(288);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(Math.max(TAB_WIDTH + 40, Math.round(node.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <button ref={ref} type="button" className="new-folder" onClick={onClick}>
      <svg
        className="new-folder__outline"
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        aria-hidden
      >
        <path d={folderPath(width, HEIGHT)} />
      </svg>
      <span className="new-folder__icon" aria-hidden>
        <PlusOutlined />
      </span>
      <span className="new-folder__label">Новый проект</span>
    </button>
  );
};
