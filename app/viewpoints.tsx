import { router } from 'expo-router';
import { Text } from 'react-native';

import { elevationAt } from '../src/core/dem';
import { ScreenLayout } from '../src/components/ScreenLayout';
import { Card, ListRow, SectionTitle, text } from '../src/components/ui';
import { useLocationStore } from '../src/store/locationStore';
import { usePack } from '../src/store/packStore';
import { strings } from '../src/strings';

/** Places (SPEC 3.6): live GPS, or stand at a known viewpoint. */
export default function ViewpointsScreen() {
  const { viewpoints, dem } = usePack();
  const { simulate, startGps, source, viewpoint, gpsStatus, fix } = useLocationStore();
  const V = strings.viewpoints;
  const gpsSub =
    gpsStatus === 'fixed' && fix
      ? strings.location.chipGps(Math.round(fix.accuracyM ?? 0))
      : gpsStatus === 'searching'
        ? strings.location.chipSearching
        : V.myLocationSub;

  return (
    <ScreenLayout title={V.title}>
      <SectionTitle>{V.yourLocation}</SectionTitle>
      <Card>
        <ListRow
          icon="navigate"
          title={V.myLocation}
          subtitle={gpsSub}
          selected={source === 'gps'}
          last
          onPress={() => {
            startGps();
            router.back();
          }}
        />
      </Card>

      <SectionTitle>{V.viewpoints}</SectionTitle>
      <Text style={[text.muted, { marginBottom: 8, marginLeft: 4 }]}>{V.viewpointsHint}</Text>
      <Card>
        {viewpoints.map((v, i) => {
          const elevationM = elevationAt(dem, v.lat, v.lon);
          return (
            <ListRow
              key={v.id}
              icon="location"
              title={v.name}
              subtitle={
                elevationM === null
                  ? undefined
                  : `${Math.round(elevationM).toLocaleString('en-US')} m`
              }
              selected={source === 'simulated' && viewpoint?.id === v.id}
              last={i === viewpoints.length - 1}
              onPress={() => {
                simulate(v);
                router.back();
              }}
            />
          );
        })}
      </Card>
    </ScreenLayout>
  );
}
