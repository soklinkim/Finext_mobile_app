import { View } from 'react-native';
import { DateInput } from './DateInput';
import { SelectField } from './SelectField';
import { TextField } from './TextField';
import { useI18n, type TKey } from '@/i18n';
import { formatInputDate, parseInputDate } from '@/lib/format';
import type { Settings } from '@/services/bookkeeping';

export interface BusinessProfileValues {
  businessName: string;
  businessIndustry: string;
  registrationStatus: 'registered' | 'unregistered' | '';
  registrationNumber: string;
  startOperationDate: string; // DD/MM/YY
  ownerName: string;
  location: string;
  contact: string;
  mainProducts: string;
}

export const EMPTY_PROFILE: BusinessProfileValues = {
  businessName: '',
  businessIndustry: '',
  registrationStatus: '',
  registrationNumber: '',
  startOperationDate: '',
  ownerName: '',
  location: '',
  contact: '',
  mainProducts: '',
};

const INDUSTRIES: { value: string; key: TKey }[] = [
  { value: 'convenience', key: 'industry.convenience' },
  { value: 'restaurant', key: 'industry.restaurant' },
  { value: 'retail', key: 'industry.retail' },
  { value: 'wholesale', key: 'industry.wholesale' },
  { value: 'services', key: 'industry.services' },
  { value: 'manufacturing', key: 'industry.manufacturing' },
  { value: 'other', key: 'industry.other' },
];

const LOCATIONS = [
  'Banteay Meanchey',
  'Battambang',
  'Kampong Cham',
  'Kampong Chhnang',
  'Kampong Speu',
  'Kampong Thom',
  'Kampot',
  'Kandal',
  'Kep',
  'Koh Kong',
  'Kratie',
  'Mondulkiri',
  'Oddar Meanchey',
  'Pailin',
  'Phnom Penh (Capital)',
  'Preah Sihanouk',
  'Preah Vihear',
  'Prey Veng',
  'Pursat',
  'Ratanakiri',
  'Siem Reap',
  'Stung Treng',
  'Svay Rieng',
  'Takeo',
  'Tbong Khmum',
];

interface Props {
  values: BusinessProfileValues;
  onChange: (patch: Partial<BusinessProfileValues>) => void;
  errors?: Partial<Record<keyof BusinessProfileValues, string>>;
  showStartDate?: boolean;
  showContact?: boolean;
  showOwner?: boolean;
  fieldBackgroundColor?: string;
}

/** §6.30 — Business Name, Industry, Registration Status (+ number when Registered), Start Date, Owner, Location, Contact, Products. */
export function BusinessProfileForm({ values, onChange, errors = {}, showStartDate = true, showContact = true, showOwner = true, fieldBackgroundColor }: Props) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 20 }}>
      <TextField variant="form" label={t('profile.businessName')} value={values.businessName} onChangeText={(v) => onChange({ businessName: v })} placeholder={t('profile.businessNamePlaceholder')} error={errors.businessName} fieldBackgroundColor={fieldBackgroundColor} />
      <SelectField
        size="form"
        label={t('profile.industry')}
        placeholder={t('profile.select')}
        options={INDUSTRIES.map((i) => ({ value: i.value, label: t(i.key) }))}
        value={values.businessIndustry || null}
        onChange={(v) => onChange({ businessIndustry: v })}
        error={errors.businessIndustry}
        fieldBackgroundColor={fieldBackgroundColor}
      />
      <SelectField
        size="form"
        label={t('profile.registration')}
        placeholder={t('profile.select')}
        options={[
          { value: 'registered', label: t('profile.registered') },
          { value: 'unregistered', label: t('profile.unregistered') },
        ]}
        value={values.registrationStatus || null}
        onChange={(v) => onChange({ registrationStatus: v as 'registered' | 'unregistered' })}
        fieldBackgroundColor={fieldBackgroundColor}
      />
      {values.registrationStatus === 'registered' && (
        <View style={{ paddingLeft: 20 }}>
          <TextField variant="form" label={t('profile.registrationNumber')} value={values.registrationNumber} onChangeText={(v) => onChange({ registrationNumber: v })} error={errors.registrationNumber} fieldBackgroundColor={fieldBackgroundColor} />
        </View>
      )}
      {showStartDate ? (
        <DateInput
          label={t('profile.startDate')}
          value={parseInputDate(values.startOperationDate)}
          onChange={(ms) => onChange({ startOperationDate: ms ? formatInputDate(ms) : '' })}
        />
      ) : null}
      {showOwner ? <TextField variant="form" label={t('profile.owner')} value={values.ownerName} onChangeText={(v) => onChange({ ownerName: v })} fieldBackgroundColor={fieldBackgroundColor} /> : null}
      <SelectField
        size="form"
        label={t('profile.location')}
        placeholder={t('profile.select')}
        options={LOCATIONS.map((location) => ({ value: location, label: location }))}
        value={values.location || null}
        onChange={(location) => onChange({ location })}
        fieldBackgroundColor={fieldBackgroundColor}
      />
      {showContact ? <TextField variant="form" label={t('profile.contact')} value={values.contact} onChangeText={(v) => onChange({ contact: v })} autoCapitalize="none" fieldBackgroundColor={fieldBackgroundColor} /> : null}
      <TextField variant="form" label={t('profile.products')} value={values.mainProducts} onChangeText={(v) => onChange({ mainProducts: v })} fieldBackgroundColor={fieldBackgroundColor} />
    </View>
  );
}

export function toProfileValues(s: Settings): BusinessProfileValues {
  return {
    businessName: s.businessName ?? '',
    businessIndustry: s.businessIndustry ?? '',
    registrationStatus: s.registrationStatus ?? '',
    registrationNumber: s.registrationNumber ?? '',
    startOperationDate: s.startOperationDate ?? '',
    ownerName: s.ownerName ?? '',
    location: s.location ?? '',
    contact: s.contact ?? '',
    mainProducts: s.mainProducts ?? '',
  };
}

/** Form values → settings columns (empty strings become null). */
export function fromProfileValues(v: BusinessProfileValues) {
  const n = (x: string) => (x.trim() ? x.trim() : null);
  return {
    businessName: n(v.businessName),
    businessIndustry: n(v.businessIndustry),
    registrationStatus: v.registrationStatus || null,
    registrationNumber: v.registrationStatus === 'registered' ? n(v.registrationNumber) : null,
    startOperationDate: n(v.startOperationDate),
    ownerName: n(v.ownerName),
    location: n(v.location),
    contact: n(v.contact),
    mainProducts: n(v.mainProducts),
  };
}
