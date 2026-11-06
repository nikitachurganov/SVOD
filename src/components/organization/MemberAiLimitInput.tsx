import { useEffect, useState } from 'react';
import { InputNumber, Tooltip } from 'antd';

/** One credit+ is 1000 tokens; the server counts in tokens */
export const TOKENS_PER_CREDIT = 1000;

const toCredits = (tokens: number | null): number | null =>
  tokens === null ? null : Math.round(tokens / TOKENS_PER_CREDIT);

interface MemberAiLimitInputProps {
  /** The personal cap in tokens; null means the member spends the team pool without a cap */
  value: number | null;
  disabled?: boolean;
  /** Called with the new cap in tokens (null: no cap) once the person finished typing */
  onCommit: (tokens: number | null) => void;
}

export const MemberAiLimitInput = ({ value, disabled, onCommit }: MemberAiLimitInputProps) => {
  const [draft, setDraft] = useState<number | null>(toCredits(value));

  // Follow the server: after a save, or when the list is reloaded
  useEffect(() => {
    setDraft(toCredits(value));
  }, [value]);

  const commit = () => {
    const next = draft === null ? null : Math.max(0, Math.round(draft)) * TOKENS_PER_CREDIT;
    if (next !== value) onCommit(next);
  };

  return (
    <Tooltip title="Сколько кредитов+ в месяц этот человек может потратить из общего пула команды. Пусто — без личного лимита.">
      <InputNumber
        size="small"
        min={0}
        max={1_000_000}
        precision={0}
        controls={false}
        style={{ width: 130 }}
        placeholder="без лимита"
        suffix="кр+"
        value={draft}
        disabled={disabled}
        onChange={(next) => setDraft(typeof next === 'number' ? next : null)}
        onBlur={commit}
        onPressEnter={commit}
      />
    </Tooltip>
  );
};
