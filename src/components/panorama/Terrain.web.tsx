/** Web: load CanvasKit (public/canvaskit.wasm) first, then the Skia terrain component. */
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { ActivityIndicator, View } from 'react-native';

import type { PanoramaTerrainProps } from './PanoramaTerrain';

export default function Terrain(props: PanoramaTerrainProps) {
  return (
    <WithSkiaWeb
      opts={{ locateFile: () => '/canvaskit.wasm' }}
      getComponent={() => import('./PanoramaTerrain')}
      componentProps={props}
      fallback={
        <View
          style={{
            width: props.layout.width,
            height: props.layout.height,
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator />
        </View>
      }
    />
  );
}
