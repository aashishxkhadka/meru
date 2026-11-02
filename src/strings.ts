/** All UI strings (English). Kept in one place for translation (Nepali next). */
export const strings = {
  appName: 'Meru',
  tagline: 'Offline mountain peak finder',
  loadingPack: 'Loading mountains…',
  packErrorTitle: 'Could not load the mountain data',
  retry: 'Try again',
  back: 'Back',
  comingSoon: (step: number) => `Placeholder: built in step ${step}.`,

  onboarding: {
    title: 'Welcome to Meru',
    slides: [
      'Point your phone at the mountains to see every peak named.',
      'Works with no signal and no SIM: all maps are on your phone.',
      'Calibrate once so labels sit right on the summits.',
    ],
    start: 'Start',
  },
  camera: {
    title: 'Camera',
    gpsSearching: 'Finding your location…',
    panorama: 'Panorama',
    calibrate: 'Calibrate',
    viewpoints: 'Viewpoints',
    about: 'About',
    samplePeaks: 'Example peaks in this pack',
  },
  calibration: { title: 'Calibrate' },
  panorama: { title: 'Panorama' },
  peak: {
    visibleFromHere: 'Visible from here',
    elevation: 'Elevation',
    notFound: 'Peak not found',
  },
  viewpoints: { title: 'Choose a viewpoint', useGps: 'Use my GPS location' },
  photo: { title: 'Photo preview' },
  about: {
    title: 'About',
    version: 'Version',
    dataSources: 'Data sources',
    feedback: 'Feedback',
    feedbackText: 'Tell us what worked and what did not.',
    debugHint: 'Long-press the app name for debug info.',
  },
  debug: {
    title: 'Debug',
    pack: 'Data pack',
    loadTime: 'Load time',
    spotCheck: 'Elevation spot-check',
  },
} as const;
