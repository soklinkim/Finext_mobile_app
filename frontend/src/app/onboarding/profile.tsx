import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BusinessProfileForm, EMPTY_PROFILE, fromProfileValues, type BusinessProfileValues } from '@/components/BusinessProfileForm';
import { Button } from '@/components/Button';
import { OnboardingShell } from '@/components/OnboardingShell';
import { useI18n } from '@/i18n';
import { updateSettings } from '@/services/bookkeeping';

/** Create Business Profile. Saved to the local settings row; assets come next. */
export default function ProfileStep() {
  const router = useRouter();
  const { t } = useI18n();
  const [values, setValues] = useState<BusinessProfileValues>(EMPTY_PROFILE);
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    businessName: !values.businessName.trim() ? t('error.required') : undefined,
    businessIndustry: !values.businessIndustry ? t('error.required') : undefined,
    registrationNumber: values.registrationStatus === 'registered' && !values.registrationNumber.trim() ? t('error.required') : undefined,
  };
  const valid = !errors.businessName && !errors.businessIndustry && !errors.registrationNumber;

  return (
    <OnboardingShell title={t('onb.createProfile')} step={3} form>
      <BusinessProfileForm values={values} onChange={(p) => setValues((v) => ({ ...v, ...p }))} errors={submitted ? errors : {}} />
      <View className="items-center" style={{ marginTop: 24 }}>
        <Button
          variant="primary"
          className="w-full"
          label={t('common.next')}
          trailingIcon="chevronRight"
          onPress={async () => {
            setSubmitted(true);
            if (!valid) return;
            await updateSettings(fromProfileValues(values));
            router.push('/onboarding/assets');
          }}
        />
      </View>
    </OnboardingShell>
  );
}
