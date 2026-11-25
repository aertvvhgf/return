/// <reference types="@types/google.maps" />
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

declare global { interface Window { L?: any; google?: typeof google } }

type Point = { lat: number; lng: number };
type Marker = { id: number; position: Point; title: string; onClick?: () => void };

function drawMarkers(L: any, layer: any, markers: Marker[], map: any) {
  if (!L || !layer) return;
  layer.clearLayers();
  for (const [index, marker] of markers.entries()) {
    const icon = L.divIcon({ className: "return-map-pin", html: `<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:#0f766e;border:3px solid white;box-shadow:0 3px 10px rgba(15,23,42,.35);color:white;font:700 13px sans-serif">${index + 1}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
    const pin = L.marker([marker.position.lat, marker.position.lng], { icon }).addTo(layer);
    pin.bindPopup(`<strong>${marker.title.replace(/[&<>]/g, "")}</strong>`);
    pin.on("click", () => marker.onClick?.());
  }
  if (markers.length > 1 && map) {
    const bounds = L.latLngBounds(markers.map(marker => [marker.position.lat, marker.position.lng]));
    map.fitBounds(bounds.pad(0.18), { maxZoom: 16, animate: false });
  }
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  const existing = document.querySelector<HTMLScriptElement>('script[data-return-leaflet="true"]');
  if (existing) return new Promise(resolve => { const timer = window.setInterval(() => { if (window.L) { window.clearInterval(timer); resolve(window.L); } }, 50); });
  const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(link);
  return new Promise<any>((resolve, reject) => { const script = document.createElement("script"); script.async = true; script.dataset.returnLeaflet = "true"; script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; script.onload = () => resolve(window.L); script.onerror = () => reject(new Error("無料地図を読み込めませんでした。")); document.head.appendChild(script); });
}

interface MapViewProps {
  className?: string;
  initialCenter?: Point;
  initialZoom?: number;
  onMapReady?: (map: any) => void;
  onMapClick?: (point: Point) => void;
  fallbackMarkers?: Marker[];
  label?: string;
}

export function MapView({ className, initialCenter = { lat: 35.6812, lng: 139.7671 }, initialZoom = 12, onMapReady, onMapClick, fallbackMarkers = [], label = "地図" }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerLayer = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const onMapReadyRef = useRef(onMapReady);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  const markerSignature = fallbackMarkers.map(marker => `${marker.id}:${marker.position.lat},${marker.position.lng}`).join("|");
  useEffect(() => {
    let mounted = true;
    void loadLeaflet().then(L => {
      if (!mounted || !container.current || mapRef.current) return;
      const map = L.map(container.current, { zoomControl: true, attributionControl: true, preferCanvas: true, inertia: true, inertiaDeceleration: 2800, wheelDebounceTime: 40, zoomAnimation: true, markerZoomAnimation: true, fadeAnimation: false, touchZoom: true, dragging: true, scrollWheelZoom: true, doubleClickZoom: true, keyboard: true }).setView([initialCenter.lat, initialCenter.lng], initialZoom);
      // Use an API-key-free OSM tile host. Some hosted CARTO endpoints return
      // an "API KEY REQUIRED" watermark instead of map tiles in production.
      L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
        maxZoom: 19, maxNativeZoom: 19, detectRetina: true,
        updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 3,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      map.on("click", (event: any) => onMapClickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }));
      mapRef.current = map; markerLayer.current = L.layerGroup().addTo(map); drawMarkers(L, markerLayer.current, fallbackMarkers, map); onMapReadyRef.current?.(map);
      window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
      resizeObserverRef.current = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.invalidateSize({ animate: false })) : null;
      resizeObserverRef.current?.observe(container.current);
      let accuracyLayer: any = null;
      const locate = () => {
        if (!navigator.geolocation) return;
        map.locate({ watch: false, setView: false, enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      };
      map.on("locationfound", (event: any) => {
        const lat = Number(event?.latlng?.lat);
        const lng = Number(event?.latlng?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
        map.stop();
        map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: false });
        accuracyLayer?.remove();
        accuracyLayer = L.circle([lat, lng], { radius: Math.min(Math.max(Number(event.accuracy) || 0, 20), 500), color: "#0f766e", weight: 2, fillColor: "#2dd4bf", fillOpacity: 0.16 }).addTo(map);
      });
      map.on("locationerror", () => undefined);
      window.addEventListener("return:locate-map", locate);
      map.once("unload", () => window.removeEventListener("return:locate-map", locate));
    }).catch(() => undefined);
    return () => { mounted = false; resizeObserverRef.current?.disconnect(); resizeObserverRef.current = null; if (mapRef.current) mapRef.current.remove(); mapRef.current = null; };
  }, [initialCenter.lat, initialCenter.lng, initialZoom]);
  useEffect(() => {
    drawMarkers(window.L, markerLayer.current, fallbackMarkers, mapRef.current);
  }, [markerSignature]);
  return <div ref={container} className={cn("relative w-full overflow-hidden rounded-xl border border-border bg-muted", className)} aria-label={label} />;
}
