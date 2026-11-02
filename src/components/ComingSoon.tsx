import { View } from 'react-native';

import { ScreenLayout } from './ScreenLayout';
import { EmptyState, type IconName } from './ui';
import { strings } from '../strings';

export function ComingSoon({ title, icon, text }: { title: string; icon: IconName; text: string }) {
  return (
    <ScreenLayout title={title} scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState icon={icon} title={strings.comingSoon} text={text} />
      </View>
    </ScreenLayout>
  );
}
