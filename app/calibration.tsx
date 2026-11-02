import { Placeholder, Screen } from '../src/components/Screen';
import { strings } from '../src/strings';

/** Calibration (SPEC 3.3). Built in step 9. */
export default function CalibrationScreen() {
  return (
    <Screen title={strings.calibration.title}>
      <Placeholder step={9} />
    </Screen>
  );
}
