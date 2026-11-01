import { Button, Switch } from 'antd';
import { AutoGrowInput } from './AutoGrowInput';

import { PlusOutlined, CloseOutlined } from '@ant-design/icons';

import type { FieldOption } from '../../types/form-builder.types';

import { createOtherOption } from '../../utils/choiceField.utils';



interface FieldOptionsEditorProps {

  fieldType: 'radio' | 'checkbox' | 'dropdown';

  options: FieldOption[];

  onChange: (options: FieldOption[]) => void;

}



const OptionIndicator = ({

  fieldType,

}: {

  fieldType: FieldOptionsEditorProps['fieldType'];

}) => {

  if (fieldType === 'radio') {

    return (

      <input

        type="radio"

        disabled

        style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--app-primary)' }}

      />

    );

  }

  if (fieldType === 'checkbox') {

    return (

      <input

        type="checkbox"

        disabled

        style={{ pointerEvents: 'none', margin: 0, accentColor: 'var(--app-primary)' }}

      />

    );

  }

  return (

    <span

      style={{

        display: 'inline-flex',

        alignItems: 'center',

        justifyContent: 'center',

        width: 16,

        height: 16,

        flexShrink: 0,

      }}

    >

      <span

        style={{

          width: 6,

          height: 6,

          borderRadius: '50%',

          background: 'var(--app-text-helper)',

          display: 'block',

        }}

      />

    </span>

  );

};



export const FieldOptionsEditor = ({ fieldType, options, onChange }: FieldOptionsEditorProps) => {

  const regularOptions = options.filter((opt) => !opt.isOther);

  const otherOption = options.find((opt) => opt.isOther);



  const handleLabelChange = (id: string, label: string) => {

    onChange(options.map((opt) => (opt.id === id ? { ...opt, label } : opt)));

  };



  const handleRemove = (id: string) => {

    const target = options.find((opt) => opt.id === id);

    if (!target || target.isOther) {

      onChange(options.filter((opt) => opt.id !== id));

      return;

    }

    if (regularOptions.length <= 1) return;

    onChange(options.filter((opt) => opt.id !== id));

  };



  const handleAdd = () => {

    // «Другое» always stays the last option
    onChange([

      ...regularOptions,

      { id: crypto.randomUUID(), label: `Вариант ${regularOptions.length + 1}` },

      ...(otherOption ? [otherOption] : []),

    ]);

  };



  const handleToggleOther = () => {

    if (otherOption) {

      onChange(options.filter((opt) => !opt.isOther));

      return;

    }

    onChange([...options, createOtherOption()]);

  };



  return (

    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {regularOptions.map((opt) => (

        <div

          key={opt.id}

          style={{

            display: 'flex',

            alignItems: 'center',

            gap: 6,

            padding: '3px 0',

          }}

        >

          <span

            style={{

              pointerEvents: 'none',

              display: 'flex',

              alignItems: 'center',

              flexShrink: 0,

            }}

          >

            <OptionIndicator fieldType={fieldType} />

          </span>



          <AutoGrowInput

            value={opt.label}

            placeholder="Вариант"

            disabled={opt.isOther}

            onChange={(next) => handleLabelChange(opt.id, next)}

            style={{

              flex: 1,

              minWidth: 0,

              padding: '1px 4px',

              fontSize: 'inherit',

              border: 'none',

              outline: 'none',

              background: 'transparent',

              color: opt.isOther ? 'var(--app-text-secondary)' : 'var(--app-text)',

            }}

          />



          <button

            onClick={() => handleRemove(opt.id)}

            disabled={!opt.isOther && regularOptions.length <= 1}

            style={{

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'center',

              width: 22,

              height: 22,

              padding: 0,

              border: 'none',

              background: 'transparent',

              cursor: !opt.isOther && regularOptions.length <= 1 ? 'not-allowed' : 'pointer',

              color: 'var(--app-text-placeholder)',

              flexShrink: 0,

              opacity: !opt.isOther && regularOptions.length <= 1 ? 0.4 : 1,

            }}

            aria-label={`Удалить вариант ${opt.label}`}

          >

            <CloseOutlined style={{ fontSize: 12 }} />

          </button>

        </div>

      ))}



      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 2 }}>

        <Button

          type="text"

          size="small"

          icon={<PlusOutlined />}

          onClick={handleAdd}

          style={{ alignSelf: 'flex-start', paddingInline: 0 }}

        >

          Добавить вариант

        </Button>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>

          <Switch size="small" checked={Boolean(otherOption)} onChange={handleToggleOther} />

          Вариант «Другое»

        </label>

      </div>

    </div>

  );

};


