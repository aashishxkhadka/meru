import { ComingSoon } from '../src/components/ComingSoon';
import { strings } from '../src/strings';

/** Calibration (SPEC 3.3). Built in step 9. */
export default function CalibrationScreen() {
  return (
    <ComingSoon
      title={strings.calibration.title}
      icon="compass-outline"
      text={strings.calibration.text}
    />
  );
}
