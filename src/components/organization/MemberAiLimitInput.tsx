import { useEffect, useState } from 'react';
import { InputNumber, Tooltip } from 'antd';

/** One credit+ is 1000 tokens; the server counts in tokens */
export const TOKENS_PER_CREDIT = 1000;

const toUnits = (tokens: number | null, perUnit: number): number | null =>
  tokens === null ? null : Math.round(tokens / perUnit);

interface MemberAiLimitInputProps {
  /** The personal cap in tokens; null means the member spends the team pool without a cap */
  value: number | null;
  disabled?: boolean;
  /** Called with the new cap in tokens (null: no cap) once the person finished typing */
  onCommit: (tokens: number | null) => void;
  /** credits: the per-person model (1 credit+ = 1000 tokens); tokens_plus: the team model counts Токены+ as they are */
  unit?: 'credits' | 'tokens_plus';
}

export const MemberAiLimitInput = ({ value, disabled, onCommit, unit = 'credits' }: MemberAiLimitInputProps) => {
  const perUnit = unit === 'credits' ? TOKENS_PER_CREDIT : 1;
  const [draft, setDraft] = useState<number | null>(toUnits(value, perUnit));

  // Follow the server: after a save, or when the list is reloaded
  useEffect(() => {
    setDraft(toUnits(value, perUnit));
  }, [value, perUnit]);

  const commit = () => {
    const next = draft === null ? null : Math.max(0, Math.round(draft)) * perUnit;
    if (next !== value) onCommit(next);
  };

  return (
    <Tooltip
      title={
        unit === 'credits'
          ? 'Сколько кредитов+ в месяц этот человек может потратить из общего пула команды. Пусто — без личного лимита.'
          : 'Сколько Токенов+ в месяц этот человек может потратить из общего баланса команды. Пусто — без личного лимита.'
      }
    >
      <InputNumber
        size="small"
        min={0}
        max={unit === 'credits' ? 1_000_000 : 1_000_000_000}
        precision={0}
        controls={false}
        style={{ width: unit === 'credits' ? 130 : 160 }}
        placeholder="без лимита"
        suffix={unit === 'credits' ? 'кр+' : 'Т+'}
        value={draft}
        disabled={disabled}
        onChange={(next) => setDraft(typeof next === 'number' ? next : null)}
        onBlur={commit}
        onPressEnter={commit}
      />
    </Tooltip>
  );
};
