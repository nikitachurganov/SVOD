import { createSchemaField } from '@formily/react';
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
import { FormilyAddressInput } from './components/FormilyAddressInput';
import { FormilyCountryCityInput } from './components/FormilyCountryCityInput';
import { FormilyLocationInput } from './components/FormilyLocationInput';
import { FormilyRatingInput } from './components/FormilyRatingInput';
import { FormilyFileUpload } from './components/FormilyFileUpload';
import { FormilyRadioChoice, FormilyCheckboxChoice, FormilyDropdownChoice } from './components/FormilyChoiceInputs';
import { FormilyPhoneInput } from './components/FormilyPhoneInput';

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
