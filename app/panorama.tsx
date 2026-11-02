import { Placeholder, Screen } from '../src/components/Screen';
import { strings } from '../src/strings';

/** Panorama mode (SPEC 3.4). Built in step 7. */
export default function PanoramaScreen() {
  return (
    <Screen title={strings.panorama.title}>
      <Placeholder step={7} />
    </Screen>
  );
}
