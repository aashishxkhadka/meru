import { Redirect } from 'expo-router';

/** Until the camera (step 8) becomes home, the panorama IS the home screen. */
export default function PanoramaRoute() {
  return <Redirect href="/" />;
}
