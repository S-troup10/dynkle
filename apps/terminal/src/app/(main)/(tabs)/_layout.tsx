import { Tabs } from 'expo-router';
import { TabBar } from '@/components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <TabBar
          active={state.routes[state.index].name}
          onSelect={(name) => {
            const target = state.routes.find((r) => r.name === name);
            if (!target) return;
            // Re-tapping the active tab pops back to its root (e.g. Items -> Menu).
            if (state.routes[state.index].name === name) navigation.navigate(name, { screen: 'index' });
            else navigation.navigate(name);
          }}
        />
      )}
    >
      <Tabs.Screen name="keypad" />
      <Tabs.Screen name="items" />
      <Tabs.Screen name="activity" />
    </Tabs>
  );
}
