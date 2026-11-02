import { StyleSheet, Text, View } from 'react-native';

// Placeholder home screen. The camera view replaces this in step 5/8.
export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Meru</Text>
      <Text style={styles.subtitle}>Offline mountain peak finder</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1220',
  },
  title: { fontSize: 40, fontWeight: '700', color: '#ffffff' },
  subtitle: { marginTop: 8, fontSize: 16, color: '#9fb0c8' },
});
