// Approximate city-center coordinates for the map on the order tracking
// view. Nothing in this app captures a real street-level lat/lng for a
// delivery address or a live rider position (see Order.deliveryAddress —
// it's just flatNo/area/city/pincode text, and PorterAddress.lat/lng is
// never actually populated by lib/porter.ts). Until real geocoding and a
// live location feed from Porter are wired up, this is a best-effort
// approximation: it plots the pickup city (the warehouse) and the drop
// city (from the order's address) as city-center points, not the actual
// doorstep — good enough to show a sensible route on a real map, not a
// substitute for genuine live GPS tracking.
export const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  Patna: { lat: 25.5941, lng: 85.1376 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Delhi: { lat: 28.7041, lng: 77.1025 },
  "New Delhi": { lat: 28.6139, lng: 77.209 },
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Lucknow: { lat: 26.8467, lng: 80.9462 },
  Surat: { lat: 21.1702, lng: 72.8311 },
  Nagpur: { lat: 21.1458, lng: 79.0882 },
  Indore: { lat: 22.7196, lng: 75.8577 },
  Bhopal: { lat: 23.2599, lng: 77.4126 },
  Chandigarh: { lat: 30.7333, lng: 76.7794 },
  Kanpur: { lat: 26.4499, lng: 80.3319 },
  Coimbatore: { lat: 11.0168, lng: 76.9558 },
  Kochi: { lat: 9.9312, lng: 76.2673 },
  Visakhapatnam: { lat: 17.6868, lng: 83.2185 },
  Guwahati: { lat: 26.1445, lng: 91.7362 },
};

/** Falls back to the Patna warehouse's coordinates for a city not in the table (rather than crashing the map). */
export function coordinatesForCity(city: string | null | undefined) {
  if (city && CITY_COORDINATES[city]) return CITY_COORDINATES[city];
  return CITY_COORDINATES.Patna;
}
