import { Checkbox } from 'antd';
import { CONSENTS, type Accepted } from './consents';

interface Props {
  accepted: Accepted;
  onChange: (next: Accepted) => void;
  disabled?: boolean;
}

/** The documents to accept before going to the payment page, with the executor's details under them */
export const ConsentChecklist = ({ accepted, onChange, disabled = false }: Props) => (
  <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {CONSENTS.map(({ key, before, link, to }) => (
        <Checkbox
          key={key}
          checked={accepted[key]}
          disabled={disabled}
          onChange={(event) => onChange({ ...accepted, [key]: event.target.checked })}
        >
          {before}{' '}
          <a href={to} target="_blank" rel="noreferrer">
            {link}
          </a>
        </Checkbox>
      ))}
    </div>
    <p className="billing-note" style={{ marginBottom: 0 }}>
      Реквизиты исполнителя —{' '}
      <a href="/legal#contacts" target="_blank" rel="noreferrer">
        здесь
      </a>
      .
    </p>
  </>
);
