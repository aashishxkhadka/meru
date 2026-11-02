import { useEffect } from 'react';

import { selectObserverPosition, useLocationStore } from './locationStore';
import { usePack } from './packStore';
import { useSceneStore } from './sceneStore';

/** Keep SceneStore in step with LocationStore. Mount once, below the pack-loading gate. */
export function useSceneSync(): void {
  const pack = usePack();
  useEffect(() => {
    const push = () =>
      useSceneStore.getState().update(pack, selectObserverPosition(useLocationStore.getState()));
    push();
    return useLocationStore.subscribe(push);
  }, [pack]);
}
