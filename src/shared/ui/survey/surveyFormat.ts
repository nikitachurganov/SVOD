export const formatNumber = (value: number): string =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

export const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
};

export const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

export const formatP = (p: number): string => (p < 0.0001 ? '< 0,0001' : formatNumber(p));
