import { Text } from 'react-native';

import { NavButton, Placeholder, Screen, screenStyles } from '../src/components/Screen';
import { usePack } from '../src/store/packStore';
import { strings } from '../src/strings';

/** Viewpoint picker (SPEC 3.6). Selecting sets a simulated location in step 6. */
export default function ViewpointsScreen() {
  const { viewpoints } = usePack();
  return (
    <Screen title={strings.viewpoints.title}>
      <Placeholder step={6} />
      <NavButton label={strings.viewpoints.useGps} onPress={() => {}} />
      {viewpoints.map((v) => (
        <NavButton key={v.id} label={v.name} onPress={() => {}} />
      ))}
      <Text style={screenStyles.muted}>{viewpoints.length} viewpoints in this pack</Text>
    </Screen>
  );
}
