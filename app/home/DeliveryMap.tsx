"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";

type LatLng = { lat: number; lng: number };

/** A small colored pin — no image assets needed, just a styled div marker. Distinguishes pickup (warehouse), drop (customer), and rider (live) without pretending any of them is a photo/real icon. */
function pin(color: string, label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font:700 11px system-ui;">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const pickupIcon = pin("#6b7280", "P");
const dropIcon = pin("#025632", "D");
const riderIcon = pin("#10b981", "●");

/** Fits the map's viewport to include every real point passed in — re-runs whenever the actual set of points changes (e.g. once a rider's live position first appears). */
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const pointsKey = points.map((p) => `${p.lat},${p.lng}`).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
      return;
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lng]),
      { padding: [32, 32] }
    );
    // points itself is intentionally omitted — pointsKey is the stable,
    // content-based stand-in (a new array reference every render would
    // otherwise re-fit on every unrelated re-render); points is read fresh
    // from this render's closure once pointsKey actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey]);
  return null;
}

/**
 * A real delivery map — pickup (warehouse), drop (customer address), and a
 * live rider position, only ever plotted from real Borzo-geocoded
 * coordinates (see lib/shipping/providers/borzo.ts). Never derived from a
 * pincode, city center, or any invented distance calculation. Renders
 * whichever of the three points are actually available; a route line
 * between pickup and drop is drawn as a plain dashed line (not a real road
 * path — Borzo doesn't return route geometry, only endpoint coordinates
 * and a real total driving distance).
 */
export function DeliveryMap({
  pickup,
  drop,
  rider,
}: {
  pickup: LatLng | null;
  drop: LatLng | null;
  rider: LatLng | null;
}) {
  const points = [pickup, drop, rider].filter((p): p is LatLng => p !== null);
  if (points.length === 0) return null;
  const center = points[0];

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <FitBounds points={points} />
      {pickup && drop ? (
        <Polyline positions={[[pickup.lat, pickup.lng], [drop.lat, drop.lng]]} pathOptions={{ color: "#9ca3af", weight: 2, dashArray: "6 6" }} />
      ) : null}
      {pickup ? (
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
          <Popup>Pickup — warehouse</Popup>
        </Marker>
      ) : null}
      {drop ? (
        <Marker position={[drop.lat, drop.lng]} icon={dropIcon}>
          <Popup>Drop — your address</Popup>
        </Marker>
      ) : null}
      {rider ? (
        <Marker position={[rider.lat, rider.lng]} icon={riderIcon}>
          <Popup>Rider — live position</Popup>
        </Marker>
      ) : null}
    </MapContainer>
  );
}
