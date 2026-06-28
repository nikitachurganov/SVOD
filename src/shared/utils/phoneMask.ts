export const PHONE_MASK_TEMPLATE = '+7 (___) ___-__-__';
export const PHONE_MASK_PLACEHOLDER = PHONE_MASK_TEMPLATE;
export const PHONE_MASK_DISPLAY_LENGTH = 18;
export const PHONE_NATIONAL_DIGITS = 10;

const DIGIT_SLOT_STARTS = [4, 5, 6, 9, 10, 11, 13, 14, 16, 17] as const;
const MIN_CURSOR = 4;

/** Extract up to 10 national digits (without country code). */
export const extractNationalPhoneDigits = (value: string): string => {
  if (!value) return '';

  let digits = value.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('8')) {
    digits = digits.slice(1);
  } else if (digits.startsWith('7')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, PHONE_NATIONAL_DIGITS);
};

export const extractPhoneDigits = extractNationalPhoneDigits;

export const formatPhoneStorage = (nationalDigits: string): string => {
  if (!nationalDigits) return '';
  return `+7${nationalDigits}`;
};

export const parsePhoneValueToNationalDigits = (value: unknown): string =>
  typeof value === 'string' ? extractNationalPhoneDigits(value) : '';

const slotChar = (digits: string, index: number, showPlaceholders: boolean): string => {
  if (index < digits.length) return digits[index] ?? '_';
  return showPlaceholders ? '_' : '';
};

/** Focused mask with optional underscore placeholders. */
export const buildPhoneMaskDisplay = (
  nationalDigits: string,
  showPlaceholders: boolean,
): string => {
  const d = nationalDigits.slice(0, PHONE_NATIONAL_DIGITS);
  return `+7 (${slotChar(d, 0, showPlaceholders)}${slotChar(d, 1, showPlaceholders)}${slotChar(d, 2, showPlaceholders)}) ${slotChar(d, 3, showPlaceholders)}${slotChar(d, 4, showPlaceholders)}${slotChar(d, 5, showPlaceholders)}-${slotChar(d, 6, showPlaceholders)}${slotChar(d, 7, showPlaceholders)}-${slotChar(d, 8, showPlaceholders)}${slotChar(d, 9, showPlaceholders)}`;
};

/** Blur view: only entered groups, no trailing placeholders. */
export const buildPhoneBlurDisplay = (nationalDigits: string): string => {
  const d = nationalDigits.slice(0, PHONE_NATIONAL_DIGITS);
  if (!d) return '';

  let out = '+7';
  out += ` (${d.slice(0, 3)}`;
  if (d.length < 3) return out;
  out += ')';

  if (d.length <= 3) return out;
  out += ` ${d.slice(3, 6)}`;
  if (d.length <= 6) return out;

  out += `-${d.slice(6, 8)}`;
  if (d.length <= 8) return out;

  out += `-${d.slice(8, 10)}`;
  return out;
};

export const normalizePastedPhoneDigits = (text: string): string => {
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = digits.slice(1);
  if (digits.startsWith('7')) digits = digits.slice(1);
  return digits.slice(0, PHONE_NATIONAL_DIGITS);
};

export const cursorAfterDigitCount = (digitCount: number): number => {
  if (digitCount <= 0) return MIN_CURSOR;
  if (digitCount >= PHONE_NATIONAL_DIGITS) return PHONE_MASK_DISPLAY_LENGTH;
  return DIGIT_SLOT_STARTS[digitCount];
};

export const clampCursor = (position: number, digitCount: number): number => {
  const min = MIN_CURSOR;
  const max = cursorAfterDigitCount(digitCount);
  return Math.min(Math.max(position, min), max);
};

export const digitIndexBeforeCursor = (cursor: number, digitCount: number): number => {
  let index = -1;
  for (let i = 0; i < digitCount; i += 1) {
    const slot = DIGIT_SLOT_STARTS[i];
    if (cursor > slot) index = i;
  }
  return index;
};

export const digitIndexAtOrAfterCursor = (cursor: number, digitCount: number): number => {
  for (let i = 0; i < digitCount; i += 1) {
    if (cursor <= DIGIT_SLOT_STARTS[i]) return i;
  }
  return digitCount;
};

export const moveCursorLeft = (cursor: number, digitCount: number): number => {
  const index = digitIndexBeforeCursor(cursor, digitCount);
  if (index < 0) return MIN_CURSOR;
  return DIGIT_SLOT_STARTS[index];
};

export const moveCursorRight = (cursor: number, digitCount: number): number => {
  const index = digitIndexAtOrAfterCursor(cursor, digitCount);
  if (index >= digitCount) return cursorAfterDigitCount(digitCount);
  return DIGIT_SLOT_STARTS[index] + 1;
};

export const insertDigitsAt = (
  current: string,
  insert: string,
  startIndex: number,
): string =>
  (current.slice(0, startIndex) + insert + current.slice(startIndex)).slice(0, PHONE_NATIONAL_DIGITS);

export const removeDigitAt = (current: string, index: number): string => {
  if (index < 0 || index >= current.length) return current;
  return current.slice(0, index) + current.slice(index + 1);
};

export const normalizePhoneDigits = (value: string): string => {
  const national = extractNationalPhoneDigits(value);
  return national.length === PHONE_NATIONAL_DIGITS ? formatPhoneStorage(national) : '';
};

export const applyPhoneMaskChange = (raw: string): string => {
  const national = extractNationalPhoneDigits(raw);
  return national ? formatPhoneStorage(national) : '';
};
