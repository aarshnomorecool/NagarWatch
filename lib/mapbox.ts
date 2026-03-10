export const defaultMapCenter = {
  latitude: 19.076,
  longitude: 72.8777,
};

export function getMapboxToken() {
  // Support both env var names for compatibility
  return (
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ??
    ""
  );
}