import { Text } from 'react-native';

import { elevationAt } from '../src/core/dem';
import { ScreenLayout } from '../src/components/ScreenLayout';
import { Card, KeyValue, SectionTitle, text } from '../src/components/ui';
import { usePackStore } from '../src/store/packStore';
import { useSceneStore } from '../src/store/sceneStore';
import { strings } from '../src/strings';

const ms = (v: number) => `${v.toFixed(0)} ms`;

/** Hidden diagnostics (long-press "Meru" on About): pack info, load and compute times. */
export default function DebugScreen() {
  const state = usePackStore((s) => s.state);
  const sceneState = useSceneStore();
  const D = strings.debug;
  if (state.status !== 'ready') return <ScreenLayout title={D.title}>{null}</ScreenLayout>;
  const { pack, timing, demBytes } = state;
  const h = pack.dem.header;
  const sc = sceneState.scene;
  return (
    <ScreenLayout title={D.title}>
      <SectionTitle>{D.pack}</SectionTitle>
      <Card>
        <KeyValue
          label="Region"
          value={`${pack.manifest.regionId} · v${pack.manifest.version} · ${pack.manifest.createdAt}`}
        />
        <KeyValue
          label="DEM grid"
          value={`${h.width} × ${h.height} · ${(demBytes / 1e6).toFixed(2)} MB`}
        />
        <KeyValue label="Bounds" value={`N${h.north} S${h.south} W${h.west} E${h.east}`} />
        <KeyValue
          label="Peaks / viewpoints"
          value={`${pack.peaks.length} / ${pack.viewpoints.length}`}
          last
        />
      </Card>

      <SectionTitle>{D.loadTime}</SectionTitle>
      <Card>
        <KeyValue label="Resolve asset" value={ms(timing.resolveMs)} />
        <KeyValue label="Read dem.bin" value={ms(timing.readMs)} />
        <KeyValue label="Validate + parse" value={ms(timing.parseMs)} />
        <KeyValue label="Total" value={ms(timing.totalMs)} last />
      </Card>

      <SectionTitle>{D.scene}</SectionTitle>
      <Card>
        <KeyValue
          label="Status"
          value={`${sceneState.status}${sceneState.label ? ` · ${sceneState.label}` : ''}`}
        />
        {sc ? (
          <>
            <KeyValue label="Horizon compute" value={ms(sc.timing.horizonMs)} />
            <KeyValue label="Visibility compute" value={ms(sc.timing.visibilityMs)} />
            <KeyValue
              label="Wall time"
              value={`${ms(sc.timing.totalMs)} · ${sc.timing.chunks} chunks`}
            />
            <KeyValue
              label="Observer"
              value={`${sc.observer.lat.toFixed(5)}, ${sc.observer.lon.toFixed(5)} @ ${sc.observer.elevationM.toFixed(0)} m`}
            />
            <KeyValue
              label="Visible peaks"
              value={`${sc.peaks.filter((r) => r.visible).length} of ${sc.peaks.length}`}
            />
          </>
        ) : null}
        <KeyValue
          label="Computes / cache hits"
          value={`${sceneState.computeCount} / ${sceneState.cacheHits}`}
          last
        />
      </Card>

      <SectionTitle>{D.spotCheck}</SectionTitle>
      <Card>
        {pack.viewpoints.slice(0, 3).map((v, i) => {
          const e = elevationAt(pack.dem, v.lat, v.lon);
          return (
            <KeyValue
              key={v.id}
              label={v.name}
              value={e === null ? 'n/a' : `${e.toFixed(0)} m`}
              last={i === 2}
            />
          );
        })}
      </Card>
      <Text style={[text.small, { marginTop: 8 }]}>
        Pipeline values: Sarangkot ≈ 1564 m, Pagoda ≈ 1094 m, Lakeside ≈ 796 m.
      </Text>
    </ScreenLayout>
  );
}
