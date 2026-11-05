import { Image } from 'react-native';

/** The national flag of Cambodia (blue / red / blue with Angkor Wat), cropped to the middle so the temple shows in a round badge. */
export function CambodiaFlag({ size = 60 }: { size?: number }) {
  return (
    <Image source={require('../../assets/images/cambodia-flag.png')} style={{ width: size, height: size }} resizeMode="cover" accessibilityLabel="Cambodia" />
  );
}

/** The Union Jack, cropped to the middle so the cross shows in a round badge. */
export function UkFlag({ size = 60 }: { size?: number }) {
  return (
    <Image source={require('../../assets/images/uk-flag.png')} style={{ width: size, height: size }} resizeMode="cover" accessibilityLabel="United Kingdom" />
  );
}
