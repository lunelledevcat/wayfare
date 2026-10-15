"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Leg } from "@/lib/planner/types";
import { MODE_COLOR } from "./mode-icon";

const RESOLVED: Record<string, string> = {
  "var(--wf-mode-metro)": "#16a34a",
  "var(--wf-mode-train)": "#b91c1c",
  "var(--wf-mode-bus)": "#ea580c",
  "var(--wf-mode-coach)": "#7c3aed",
  "var(--wf-mode-van)": "#0891b2",
  "var(--wf-mode-boat)": "#0284c7",
  "var(--wf-mode-flight)": "#1463ff",
  "var(--wf-mode-taxi)": "#ca8a04",
  "var(--wf-mode-win)": "#db2777",
  "var(--wf-mode-walk)": "#64748b",
  "var(--wf-mode-car)": "#475569",
};

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [24, 24] });
    else if (points.length === 1) map.setView(points[0], 14);
  }, [map, points]);
  return null;
}

/** Leaflet + OpenStreetMap tiles; loaded with next/dynamic (ssr: false). */
export default function RouteMap({ legs, labels, className }: { legs: Leg[]; labels: { from: string; to: string }; className?: string }) {
  const rides = legs.filter((l) => l.path.length > 0 && (l.kind === "ride" || l.mode === "walk"));
  const points = rides.flatMap((l) => l.path);
  const first = legs[0]?.from;
  const last = legs.at(-1)?.to;
  return (
    <div className={className}>
      <MapContainer center={[first?.lat ?? 13.75, first?.lon ?? 100.5]} zoom={12} scrollWheelZoom={false} className="h-full w-full rounded-2xl" attributionControl>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
        {rides.map((l) => (
          <Polyline
            key={l.id}
            positions={l.path}
            pathOptions={{ color: l.line?.color ?? RESOLVED[MODE_COLOR[l.mode]] ?? "#1463ff", weight: l.mode === "walk" ? 3 : 5, dashArray: l.mode === "walk" ? "4 6" : l.mode === "flight" ? "10 8" : undefined, opacity: 0.9 }}
          />
        ))}
        {first && (
          <CircleMarker center={[first.lat, first.lon]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#1463ff", fillOpacity: 1 }}>
            <Tooltip permanent direction="top">{labels.from}</Tooltip>
          </CircleMarker>
        )}
        {last && (
          <CircleMarker center={[last.lat, last.lon]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: "#12a150", fillOpacity: 1 }}>
            <Tooltip permanent direction="top">{labels.to}</Tooltip>
          </CircleMarker>
        )}
        <Fit points={points} />
      </MapContainer>
    </div>
  );
}
