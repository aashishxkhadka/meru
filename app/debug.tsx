import { Text } from 'react-native';

import { elevationAt } from '../src/core/dem';
import { Row, Screen, screenStyles } from '../src/components/Screen';
import { usePackStore } from '../src/store/packStore';
import { useSceneStore } from '../src/store/sceneStore';
import { strings } from '../src/strings';

const ms = (v: number) => `${v.toFixed(0)} ms`;

/** Hidden debug screen (long-press the app name on About): pack info and load time. */
export default function DebugScreen() {
  const state = usePackStore((s) => s.state);
  const sceneState = useSceneStore();
  if (state.status !== 'ready') return <Screen title={strings.debug.title} />;
  const { pack, timing, demBytes } = state;
  const h = pack.dem.header;
  return (
    <Screen title={strings.debug.title}>
      <Text style={screenStyles.section}>{strings.debug.pack}</Text>
      <Row label="Region" value={`${pack.manifest.regionId} (${pack.manifest.name})`} />
      <Row
        label="Version / created"
        value={`v${pack.manifest.version} · ${pack.manifest.createdAt}`}
      />
      <Row label="DEM grid" value={`${h.width} × ${h.height}`} />
      <Row label="DEM bounds" value={`N${h.north} S${h.south} W${h.west} E${h.east}`} />
      <Row label="DEM size" value={`${(demBytes / 1e6).toFixed(2)} MB (Int16Array)`} />
      <Row label="Peaks / viewpoints" value={`${pack.peaks.length} / ${pack.viewpoints.length}`} />

      <Text style={screenStyles.section}>{strings.debug.loadTime}</Text>
      <Row label="Resolve asset" value={ms(timing.resolveMs)} />
      <Row label="Read dem.bin" value={ms(timing.readMs)} />
      <Row label="Validate + parse" value={ms(timing.parseMs)} />
      <Row label="Total" value={ms(timing.totalMs)} />

      <Text style={screenStyles.section}>Scene</Text>
      <Row
        label="Status"
        value={`${sceneState.status}${sceneState.label ? ` · ${sceneState.label}` : ''}`}
      />
      {sceneState.scene && (
        <>
          <Row label="Horizon compute" value={ms(sceneState.scene.timing.horizonMs)} />
          <Row label="Visibility compute" value={ms(sceneState.scene.timing.visibilityMs)} />
          <Row
            label="Wall time (chunked)"
            value={`${ms(sceneState.scene.timing.totalMs)} in ${sceneState.scene.timing.chunks} chunks`}
          />
          <Row
            label="Observer"
            value={`${sceneState.scene.observer.lat.toFixed(5)}, ${sceneState.scene.observer.lon.toFixed(5)} @ ${sceneState.scene.observer.elevationM.toFixed(0)} m`}
          />
          <Row
            label="Visible peaks"
            value={`${sceneState.scene.peaks.filter((r) => r.visible).length} of ${sceneState.scene.peaks.length}`}
          />
        </>
      )}
      <Row
        label="Computes / cache hits"
        value={`${sceneState.computeCount} / ${sceneState.cacheHits}`}
      />

      <Text style={screenStyles.section}>{strings.debug.spotCheck}</Text>
      {pack.viewpoints.slice(0, 3).map((v) => {
        const e = elevationAt(pack.dem, v.lat, v.lon);
        return <Row key={v.id} label={v.name} value={e === null ? 'n/a' : `${e.toFixed(0)} m`} />;
      })}
      <Text style={screenStyles.muted}>
        Expected from the pipeline: Sarangkot about 1564 m, Pagoda about 1094 m, Lakeside about 796
        m.
      </Text>
    </Screen>
  );
}
