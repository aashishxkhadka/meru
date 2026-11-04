import { View } from 'react-native';

import { ScreenLayout } from '../src/components/ScreenLayout';
import { EmptyState } from '../src/components/ui';
import { strings } from '../src/strings';

/**
 * Calibration happens on the live camera (Home → Calibrate, SPEC 3.3). This route is only
 * reached where there is no camera (web) and explains that.
 */
export default function CalibrationScreen() {
  return (
    <ScreenLayout title={strings.calibration.title} scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon="compass-outline"
          title={strings.calibration.webTitle}
          text={strings.calibration.webText}
        />
      </View>
    </ScreenLayout>
  );
}
