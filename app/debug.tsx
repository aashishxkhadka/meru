import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { appReadyMs } from '../src/appStart';
import { ScreenLayout } from '../src/components/ScreenLayout';
import { space } from '../src/components/theme';
import { Button, Card, KeyValue, SectionTitle, text } from '../src/components/ui';
import { countByType } from '../src/core/eventLog';
import { elevationAt } from '../src/core/dem';
import { useEventLogStore } from '../src/store/eventLogStore';
import { usePackStore } from '../src/store/packStore';
import { useSceneStore } from '../src/store/sceneStore';
import { strings } from '../src/strings';

const ms = (v: number) => `${v.toFixed(0)} ms`;

/** Hidden diagnostics (long-press "Meru" on About): pack, timings, scene, offline event log. */
export default function DebugScreen() {
  const state = usePackStore((s) => s.state);
  const sceneState = useSceneStore();
  const events = useEventLogStore((s) => s.events);
  const [exporting, setExporting] = useState(false);
  const D = strings.debug;
  if (state.status !== 'ready') return <ScreenLayout title={D.title}>{null}</ScreenLayout>;
  const { pack, timing, demBytes } = state;
  const h = pack.dem.header;
  const sc = sceneState.scene;
  const ready = appReadyMs();
  const counts = Object.entries(countByType(events)).sort((a, b) => b[1] - a[1]);

  const exportLog = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await useEventLogStore
        .getState()
        .exportLog(`${pack.manifest.regionId} v${pack.manifest.version}`);
    } catch (e) {
      Alert.alert(D.exportFailed, e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };
  const clearLog = () =>
    Alert.alert(D.clearConfirm, undefined, [
      { text: strings.cancel, style: 'cancel' },
      {
        text: D.clearEvents,
        style: 'destructive',
        onPress: () => void useEventLogStore.getState().clear(),
      },
    ]);

  return (
    <ScreenLayout title={D.title}>
      <SectionTitle>{D.pack}</SectionTitle>
      <Card>
        <KeyValue
          label={D.region}
          value={`${pack.manifest.regionId} · v${pack.manifest.version} · ${pack.manifest.createdAt}`}
        />
        <KeyValue
          label={D.demGrid}
          value={`${h.width} × ${h.height} · ${(demBytes / 1e6).toFixed(2)} MB`}
        />
        <KeyValue label={D.bounds} value={`N${h.north} S${h.south} W${h.west} E${h.east}`} />
        <KeyValue
          label={D.peaksViewpoints}
          value={`${pack.peaks.length} / ${pack.viewpoints.length}`}
          last
        />
      </Card>

      <SectionTitle>{D.loadTime}</SectionTitle>
      <Card>
        <KeyValue label={D.resolveAsset} value={ms(timing.resolveMs)} />
        <KeyValue label={D.readDem} value={ms(timing.readMs)} />
        <KeyValue label={D.parse} value={ms(timing.parseMs)} />
        <KeyValue label={D.total} value={ms(timing.totalMs)} />
        <KeyValue label={D.startup} value={ready === null ? D.notAvailable : ms(ready)} last />
      </Card>

      <SectionTitle>{D.scene}</SectionTitle>
      <Card>
        <KeyValue
          label={D.status}
          value={`${sceneState.status}${sceneState.label ? ` · ${sceneState.label}` : ''}`}
        />
        {sc ? (
          <>
            <KeyValue label={D.horizon} value={ms(sc.timing.horizonMs)} />
            <KeyValue label={D.visibility} value={ms(sc.timing.visibilityMs)} />
            <KeyValue
              label={D.wallTime}
              value={`${ms(sc.timing.totalMs)} · ${D.chunks(sc.timing.chunks)}`}
            />
            <KeyValue
              label={D.observer}
              value={`${sc.observer.lat.toFixed(5)}, ${sc.observer.lon.toFixed(5)} @ ${sc.observer.elevationM.toFixed(0)} m`}
            />
            <KeyValue
              label={D.visiblePeaks}
              value={D.visibleOf(sc.peaks.filter((r) => r.visible).length, sc.peaks.length)}
            />
          </>
        ) : null}
        <KeyValue
          label={D.computes}
          value={`${sceneState.computeCount} / ${sceneState.cacheHits}`}
          last
        />
      </Card>

      <SectionTitle>{D.events}</SectionTitle>
      <Card>
        <KeyValue label={D.eventCount} value={String(events.length)} last={counts.length === 0} />
        {counts.map(([type, n], i) => (
          <KeyValue key={type} label={type} value={String(n)} last={i === counts.length - 1} />
        ))}
      </Card>
      <Text style={[text.small, { marginTop: space.sm }]}>{D.eventsHint}</Text>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button
          label={exporting ? D.exporting : D.exportEvents}
          icon="share-outline"
          onPress={exportLog}
        />
        <Button label={D.clearEvents} icon="trash-outline" variant="secondary" onPress={clearLog} />
      </View>

      <SectionTitle>{D.spotCheck}</SectionTitle>
      <Card>
        {pack.viewpoints.slice(0, 3).map((v, i) => {
          const e = elevationAt(pack.dem, v.lat, v.lon);
          return (
            <KeyValue
              key={v.id}
              label={v.name}
              value={e === null ? D.notAvailable : `${e.toFixed(0)} m`}
              last={i === 2}
            />
          );
        })}
      </Card>
      <Text style={[text.small, { marginTop: space.sm }]}>{D.spotCheckHint}</Text>
    </ScreenLayout>
  );
}
