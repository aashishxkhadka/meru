import { router } from 'expo-router';
import { Text } from 'react-native';

import { NavButton, Screen, screenStyles } from '../src/components/Screen';
import { useLocationStore } from '../src/store/locationStore';
import { usePack } from '../src/store/packStore';
import { strings } from '../src/strings';

/** Viewpoint picker (SPEC 3.6): simulate standing at a known viewpoint, or go back to GPS. */
export default function ViewpointsScreen() {
  const { viewpoints } = usePack();
  const { simulate, startGps, source, viewpoint } = useLocationStore();
  return (
    <Screen title={strings.viewpoints.title}>
      <NavButton
        label={`${source === 'gps' ? '● ' : ''}${strings.viewpoints.startGps}`}
        onPress={() => {
          startGps();
          router.back();
        }}
      />
      {viewpoints.map((v) => (
        <NavButton
          key={v.id}
          label={`${source === 'simulated' && viewpoint?.id === v.id ? '● ' : ''}${v.name}`}
          onPress={() => {
            simulate(v);
            router.back();
          }}
        />
      ))}
      <Text style={screenStyles.muted}>{viewpoints.length} viewpoints in this pack</Text>
    </Screen>
  );
}
