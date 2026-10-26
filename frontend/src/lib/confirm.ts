import { Alert, Platform } from 'react-native';

/** Destructive confirmation: window.confirm on web, a native alert elsewhere. */
export function confirmAction(title: string, body: string, yes: string, cancel: string, onYes: () => void): void {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${body}`)) onYes();
    return;
  }
  Alert.alert(title, body, [
    { text: cancel, style: 'cancel' },
    { text: yes, style: 'destructive', onPress: onYes },
  ]);
}
