export const defaultMapCenter = {
  latitude: 40.7128,
  longitude: -74.006,
};

export function getMapboxToken() {
  return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
}