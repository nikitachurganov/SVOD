import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import {
  buildPhoneBlurDisplay,
  buildPhoneMaskDisplay,
  clampCursor,
  cursorAfterDigitCount,
  digitIndexAtOrAfterCursor,
  digitIndexBeforeCursor,
  formatPhoneStorage,
  insertDigitsAt,
  moveCursorLeft,
  moveCursorRight,
  normalizePastedPhoneDigits,
  parsePhoneValueToNationalDigits,
  removeDigitAt,
} from '../utils/phoneMask';

export interface PhoneInputProps {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
  status?: 'error' | 'warning';
  'aria-invalid'?: boolean;
}

const renderStyledMask = (display: string) =>
  display.split('').map((char, index) => (
    <span
      key={`${index}-${char}`}
      className={
        char === '_'
          ? 'app-phone-input__char app-phone-input__char--placeholder'
          : 'app-phone-input__char'
      }
    >
      {char}
    </span>
  ));

export const PhoneInput = ({
  id,
  value = '',
  onChange,
  onBlur,
  onFocus,
  disabled = false,
  autoComplete = 'tel',
  className,
  status,
  'aria-invalid': ariaInvalid,
}: PhoneInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [digits, setDigits] = useState(() => parsePhoneValueToNationalDigits(value));
  const [focused, setFocused] = useState(false);
  const pendingCursor = useRef<number | null>(null);

  useEffect(() => {
    setDigits(parsePhoneValueToNationalDigits(value));
  }, [value]);

  const emitChange = useCallback(
    (nextDigits: string) => {
      setDigits(nextDigits);
      onChange?.(nextDigits.length ? formatPhoneStorage(nextDigits) : '');
    },
    [onChange],
  );

  const showMaskPlaceholder = !focused && digits.length === 0;

  const displayValue = focused
    ? buildPhoneMaskDisplay(digits, true)
    : digits.length > 0
      ? buildPhoneBlurDisplay(digits)
      : '';

  const mirrorContent = showMaskPlaceholder
    ? buildPhoneMaskDisplay('', true)
    : displayValue;

  const inputValue = showMaskPlaceholder ? '' : displayValue;

  useLayoutEffect(() => {
    if (pendingCursor.current === null || !inputRef.current) return;
    const pos = clampCursor(pendingCursor.current, digits.length);
    inputRef.current.setSelectionRange(pos, pos);
    pendingCursor.current = null;
  }, [digits, inputValue, focused]);

  const scheduleCursor = (position: number) => {
    pendingCursor.current = position;
  };

  const insertDigits = (incoming: string, atIndex: number) => {
    if (!incoming) return;
    const room = 10 - digits.length;
    if (room <= 0) return;
    const chunk = incoming.slice(0, room);
    const index = Math.min(atIndex, digits.length);
    const next = insertDigitsAt(digits, chunk, index);
    emitChange(next);
    scheduleCursor(cursorAfterDigitCount(next.length));
  };

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    scheduleCursor(cursorAfterDigitCount(digits.length));
    onFocus?.(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    onBlur?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.ctrlKey || event.metaKey) return;

    const input = inputRef.current;
    const cursor = input?.selectionStart ?? cursorAfterDigitCount(digits.length);
    const selectionEnd = input?.selectionEnd ?? cursor;

    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault();
      const at = digitIndexAtOrAfterCursor(cursor, digits.length);
      insertDigits(event.key, at);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      if (!digits.length) return;

      if (selectionEnd > cursor) {
        const start = digitIndexAtOrAfterCursor(cursor, digits.length);
        const end = digitIndexBeforeCursor(selectionEnd, digits.length);
        let next = digits;
        for (let i = end; i >= start; i -= 1) {
          next = removeDigitAt(next, i);
        }
        emitChange(next);
        scheduleCursor(cursorAfterDigitCount(Math.min(start, next.length)));
        return;
      }

      const removeIndex = digitIndexBeforeCursor(cursor, digits.length);
      if (removeIndex < 0) return;
      const next = removeDigitAt(digits, removeIndex);
      emitChange(next);
      scheduleCursor(cursorAfterDigitCount(next.length));
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      const removeIndex = digitIndexAtOrAfterCursor(cursor, digits.length);
      if (removeIndex >= digits.length) return;
      const next = removeDigitAt(digits, removeIndex);
      emitChange(next);
      scheduleCursor(clampCursor(cursor, next.length));
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scheduleCursor(moveCursorLeft(cursor, digits.length));
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      scheduleCursor(moveCursorRight(cursor, digits.length));
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      scheduleCursor(4);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      scheduleCursor(cursorAfterDigitCount(digits.length));
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = normalizePastedPhoneDigits(event.clipboardData.getData('text'));
    if (!pasted) return;
    const input = inputRef.current;
    const cursor = input?.selectionStart ?? cursorAfterDigitCount(digits.length);
    const at = digitIndexAtOrAfterCursor(cursor, digits.length);
    insertDigits(pasted, at);
  };

  const handleSelect = () => {
    const input = inputRef.current;
    if (!input) return;
    const start = clampCursor(input.selectionStart ?? 4, digits.length);
    const end = clampCursor(input.selectionEnd ?? start, digits.length);
    if (start !== input.selectionStart || end !== input.selectionEnd) {
      input.setSelectionRange(start, end);
    }
  };

  const handleClick = () => {
    scheduleCursor(clampCursor(inputRef.current?.selectionStart ?? 4, digits.length));
  };

  return (
    <div
      className={[
        'app-phone-input',
        focused ? 'app-phone-input--focused' : '',
        showMaskPlaceholder ? 'app-phone-input--placeholder' : '',
        status === 'error' ? 'app-phone-input--error' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {mirrorContent ? (
        <div
          className={[
            'app-phone-input__mirror',
            showMaskPlaceholder ? 'app-phone-input__mirror--placeholder' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        >
          {renderStyledMask(mirrorContent)}
        </div>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className="app-phone-input__field"
        value={inputValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={handleSelect}
        onClick={handleClick}
        onChange={() => {
          // Controlled via keyboard/paste handlers only.
        }}
      />
    </div>
  );
};
