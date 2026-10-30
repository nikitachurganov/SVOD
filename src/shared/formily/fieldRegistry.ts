import { createSchemaField } from '@formily/react';
import { Schema } from '@formily/json-schema';
import {
  Checkbox,
  DatePicker,
  FormItem,
  Input,
  Radio,
  Select,
  TimePicker,
} from '@formily/antd-v5';

import { FormGroupTitle } from './components/FormGroupTitle';
import { FormTextBlock } from './components/FormTextBlock';
import { FormilyAddressInput } from './components/FormilyAddressInput';
import { FormilyCountryCityInput } from './components/FormilyCountryCityInput';
import { FormilyLocationInput } from './components/FormilyLocationInput';
import { FormilyRatingInput } from './components/FormilyRatingInput';
import { FormilyFileUpload } from './components/FormilyFileUpload';
import { FormilyRadioChoice, FormilyCheckboxChoice, FormilyDropdownChoice } from './components/FormilyChoiceInputs';
import { FormilyPhoneInput } from './components/FormilyPhoneInput';

// Labels, descriptions and option names are typed by form authors and end up in the schema.
// Formily evaluates any string that looks like "{{ ... }}" as JavaScript, so a form could run
// code in a respondent's browser. Our schemas never use expressions: keep such text as plain text.
Schema.registerCompiler((expression: string) => `{{${expression}}}`);

/** Shared SchemaField registry for Formily runtime */
export const SchemaField = createSchemaField({
  components: {
    FormItem,
    Input,
    Select,
    DatePicker,
    TimePicker,
    Checkbox,
    Radio,
    FormGroupTitle,
    FormTextBlock,
    FormilyAddressInput,
    FormilyCountryCityInput,
    FormilyLocationInput,
    FormilyRatingInput,
    FormilyFileUpload,
    FormilyRadioChoice,
    FormilyCheckboxChoice,
    FormilyDropdownChoice,
    FormilyPhoneInput,
  },
});
