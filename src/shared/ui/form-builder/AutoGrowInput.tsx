import { useLayoutEffect, useRef, type CSSProperties, type TextareaHTMLAttributes } from 'react';

interface AutoGrowInputProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value' | 'rows'> {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  /** Allows line breaks (paragraphs of a text block); by default it behaves like an input */
  multiline?: boolean;
}

/**
 * A borderless one-line field that grows to show a long text instead of cutting it off.
 * By default it behaves like an input: Enter does not add a line break, pasted line breaks become spaces.
 */
export const AutoGrowInput = ({
  value,
  onChange,
  style,
  onKeyDown,
  multiline = false,
  ...rest
}: AutoGrowInputProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) =>
        onChange(multiline ? event.target.value : event.target.value.replace(/\r?\n/g, ' '))
      }
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !multiline) event.preventDefault();
        onKeyDown?.(event);
      }}
      style={{
        display: 'block',
        resize: 'none',
        overflow: 'hidden',
        fontFamily: 'inherit',
        lineHeight: 'inherit',
        ...style,
      }}
    />
  );
};
