import { Tabs } from 'expo-router';

/**
 * The five bottom-nav screens as real tabs: switching is instant, each screen stays mounted (scroll position, selected
 * sub-tab and loaded data are kept) and refreshes in the background when shown again. The group adds nothing to the
 * URL, so the routes stay /home, /analysis, /bookkeeping, /statements and /profile.
 *
 * Each screen draws its own BottomNav (through ScreenShell), so the navigator's tab bar is hidden.
 */
export default function TabsLayout() {
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false, animation: 'none' }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="analysis" />
      <Tabs.Screen name="bookkeeping" />
      <Tabs.Screen name="statements" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
