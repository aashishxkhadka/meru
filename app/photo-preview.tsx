import { Placeholder, Screen } from '../src/components/Screen';
import { strings } from '../src/strings';

/** Photo preview (SPEC 3.7). Built in step 10. */
export default function PhotoPreviewScreen() {
  return (
    <Screen title={strings.photo.title}>
      <Placeholder step={10} />
    </Screen>
  );
}
