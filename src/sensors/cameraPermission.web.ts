/** Web: no live camera view, so there is nothing to ask for. */
export function useCameraPermission() {
  return { hasPermission: false, requestPermission: async () => false };
}
