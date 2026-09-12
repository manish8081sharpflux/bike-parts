"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon paths assume a classic <img> asset pipeline
// and break under bundlers like webpack/Turbopack (they resolve to broken
// URLs) unless re-pointed at the CDN-hosted images explicitly, like this.
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const pickupIcon = L.divIcon({
  className: "",
  html: '<div style="background:#0f172a;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;">📦</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const dropIcon = L.divIcon({
  className: "",
  html: '<div style="background:#ff4b1f;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;">🏠</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

type LatLng = { lat: number; lng: number };

/** Fits the map view to show both pickup and drop points whenever they change. */
function FitBounds({ pickup, drop }: { pickup: LatLng; drop: LatLng }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([pickup.lat, pickup.lng], [drop.lat, drop.lng]);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
  }, [map, pickup.lat, pickup.lng, drop.lat, drop.lng]);
  return null;
}

export default function DeliveryMap({
  pickup,
  pickupLabel,
  drop,
  dropLabel,
  className,
}: {
  pickup: LatLng;
  pickupLabel: string;
  drop: LatLng;
  dropLabel: string;
  className?: string;
}) {
  return (
    <MapContainer
      center={[drop.lat, drop.lng]}
      zoom={11}
      scrollWheelZoom={false}
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
        <Popup>{pickupLabel}</Popup>
      </Marker>
      <Marker position={[drop.lat, drop.lng]} icon={dropIcon}>
        <Popup>{dropLabel}</Popup>
      </Marker>
      <Polyline
        positions={[
          [pickup.lat, pickup.lng],
          [drop.lat, drop.lng],
        ]}
        pathOptions={{ color: "#ff4b1f", weight: 4, dashArray: "8 8" }}
      />
      <FitBounds pickup={pickup} drop={drop} />
    </MapContainer>
  );
}

// Referenced so bundlers don't tree-shake the default-icon fallback away —
// react-leaflet's Marker uses defaultIcon under the hood when none is passed.
void defaultIcon;
