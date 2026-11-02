import { ComingSoon } from '../src/components/ComingSoon';
import { strings } from '../src/strings';

/** Photo preview (SPEC 3.7). Built in step 10. */
export default function PhotoPreviewScreen() {
  return <ComingSoon title={strings.photo.title} icon="camera-outline" text={strings.photo.text} />;
}
