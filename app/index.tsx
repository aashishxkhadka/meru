import { router } from 'expo-router';
import { Text } from 'react-native';

import { NavButton, Placeholder, Screen, screenStyles } from '../src/components/Screen';
import { usePack } from '../src/store/packStore';
import { strings } from '../src/strings';

/** Camera view (home, SPEC 3.2). Placeholder until step 8. */
export default function CameraScreen() {
  const pack = usePack();
  const famous = pack.peaks.filter((p) => p.rank === 1 && p.description).slice(0, 4);
  return (
    <Screen title={strings.appName} back={false}>
      <Text style={screenStyles.muted}>
        {strings.camera.title} · {strings.camera.gpsSearching}
      </Text>
      <Placeholder step={8} />
      <NavButton label={strings.camera.panorama} onPress={() => router.push('/panorama')} />
      <NavButton label={strings.camera.calibrate} onPress={() => router.push('/calibration')} />
      <NavButton label={strings.camera.viewpoints} onPress={() => router.push('/viewpoints')} />
      <NavButton label="Photo preview" onPress={() => router.push('/photo-preview')} />
      <NavButton label="Onboarding" onPress={() => router.push('/onboarding')} />
      <NavButton label={strings.camera.about} onPress={() => router.push('/about')} />
      <Text style={screenStyles.section}>{strings.camera.samplePeaks}</Text>
      {famous.map((p) => (
        <NavButton
          key={p.id}
          label={`${p.name} · ${p.elevationM} m`}
          onPress={() => router.push({ pathname: '/peak/[id]', params: { id: p.id } })}
        />
      ))}
    </Screen>
  );
}
