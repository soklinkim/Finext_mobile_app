import { View } from 'react-native';
import { DateInput } from './DateInput';
import { SelectField } from './SelectField';
import { TextField } from './TextField';
import { useI18n, type TKey } from '@/i18n';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
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
  /** 'row' = fields as rows inside a card (edit profile); 'box' = filled fields (onboarding, sign-up) */
  appearance?: 'box' | 'row';
}

/** §6.30 — Business Name, Industry, Registration Status (+ number when Registered), Start Date, Owner, Location, Contact, Products. */
export function BusinessProfileForm({ values, onChange, errors = {}, showStartDate = true, showContact = true, showOwner = true, fieldBackgroundColor, appearance = 'box' }: Props) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const look = { fieldBackgroundColor, appearance };
  const fields = [
    <TextField key="name" variant="form" label={t('profile.businessName')} value={values.businessName} onChangeText={(v) => onChange({ businessName: v })} placeholder={t('profile.businessNamePlaceholder')} error={errors.businessName} {...look} />,
    <SelectField
      key="industry"
      size="form"
      label={t('profile.industry')}
      placeholder={t('profile.select')}
      options={INDUSTRIES.map((i) => ({ value: i.value, label: t(i.key) }))}
      value={values.businessIndustry || null}
      onChange={(v) => onChange({ businessIndustry: v })}
      error={errors.businessIndustry}
      {...look}
    />,
    <SelectField
      key="registration"
      size="form"
      label={t('profile.registration')}
      placeholder={t('profile.select')}
      options={[
        { value: 'registered', label: t('profile.registered') },
        { value: 'unregistered', label: t('profile.unregistered') },
      ]}
      value={values.registrationStatus || null}
      onChange={(v) => onChange({ registrationStatus: v as 'registered' | 'unregistered' })}
      {...look}
    />,
    values.registrationStatus === 'registered' && (
      <View key="number" style={{ paddingLeft: appearance === 'row' ? 0 : 20 }}>
        <TextField variant="form" label={t('profile.registrationNumber')} value={values.registrationNumber} onChangeText={(v) => onChange({ registrationNumber: v })} error={errors.registrationNumber} {...look} />
      </View>
    ),
    showStartDate && (
      <DateInput
        key="start"
        label={t('profile.startDate')}
        value={parseInputDate(values.startOperationDate)}
        onChange={(ms) => onChange({ startOperationDate: ms ? formatInputDate(ms) : '' })}
      />
    ),
    showOwner && <TextField key="owner" variant="form" label={t('profile.owner')} value={values.ownerName} onChangeText={(v) => onChange({ ownerName: v })} {...look} />,
    <SelectField
      key="location"
      size="form"
      label={t('profile.location')}
      placeholder={t('profile.select')}
      options={LOCATIONS.map((location) => ({ value: location, label: location }))}
      value={values.location || null}
      onChange={(location) => onChange({ location })}
      {...look}
    />,
    showContact && <TextField key="contact" variant="form" label={t('profile.contact')} value={values.contact} onChangeText={(v) => onChange({ contact: v })} autoCapitalize="none" {...look} />,
    <TextField key="products" variant="form" label={t('profile.products')} value={values.mainProducts} onChangeText={(v) => onChange({ mainProducts: v })} {...look} />,
  ].filter(Boolean);

  if (appearance === 'row') {
    // Rows inside a card, divided by thin lines.
    const line = dark ? colors.dark.border : colors.neutral[200];
    return <View>{fields.map((field, i) => <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: line }}>{field}</View>)}</View>;
  }
  return <View style={{ gap: 20 }}>{fields}</View>;
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
