'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapLabels, MapMarker } from './map-panel';

// The Leaflet map. Loaded only by the dynamic import of the map panel: Leaflet and its CSS
// come from npm and are served by this site; only the raster tiles come from OpenStreetMap,
// with their attribution always visible. Every pin carries a text label, is reached with Tab
// and opens its card with Enter; Esc closes the card. The visitor is never located.

/** Pin with the name in sight: the state of a club is text, never a colour or a dot alone. */
function pinIcon(marker: MapMarker): L.DivIcon {
  const pin = document.createElement('span');
  pin.className = 'map-pin';
  const dot = document.createElement('span');
  dot.className = 'map-pin__dot';
  dot.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'map-pin__name';
  name.textContent = marker.name;
  const place = document.createElement('span');
  place.className = 'visually-hidden';
  place.textContent = `, ${marker.locality}`;
  pin.append(dot, name, place);
  return L.divIcon({ className: 'map-pin-anchor', html: pin, iconSize: [0, 0], popupAnchor: [0, -14] });
}

/** The card of a pin: name, locality, lowest price when known, link to the club page. */
function pinCard(marker: MapMarker, labels: MapLabels): HTMLElement {
  const card = document.createElement('div');
  card.className = 'map-card';
  const name = document.createElement('p');
  name.className = 'map-card__name';
  name.textContent = marker.name;
  const place = document.createElement('p');
  place.className = 'map-card__place';
  place.textContent = marker.locality;
  card.append(name, place);
  if (marker.priceFromText) {
    const price = document.createElement('p');
    price.className = 'map-card__price';
    price.textContent = marker.priceFromText;
    card.append(price);
  }
  const link = document.createElement('a');
  link.className = 'map-card__link';
  link.href = marker.href;
  link.textContent = labels.open;
  card.append(link);
  return card;
}

export function BeachesMap({ markers, labels, onError }: { markers: MapMarker[]; labels: MapLabels; onError: () => void }) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || markers.length === 0) return;

    const map = L.map(node, { zoomControl: false, scrollWheelZoom: false });
    L.control.zoom({ zoomInTitle: labels.zoomIn, zoomOutTitle: labels.zoomOut }).addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    // If no tile ever arrives, the box goes back to the invitation instead of staying blank.
    let seenTile = false;
    tiles.on('tileload', () => {
      seenTile = true;
    });
    tiles.on('tileerror', () => {
      if (!seenTile) errorRef.current();
    });
    tiles.addTo(map);

    for (const marker of markers) {
      L.marker([marker.latitude, marker.longitude], { icon: pinIcon(marker), keyboard: true })
        .bindPopup(pinCard(marker, labels), { closeButton: true })
        .addTo(map);
    }
    const bounds = L.latLngBounds(markers.map((marker) => [marker.latitude, marker.longitude] as [number, number]));
    if (markers.length === 1) map.setView(bounds.getCenter(), 13);
    else map.fitBounds(bounds.pad(0.25), { maxZoom: 13 });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') map.closePopup();
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      map.remove();
    };
    // Markers and labels come from the server and never change on the page.
  }, []);

  return <div className="portal-map__canvas" ref={nodeRef} role="region" aria-label={labels.region} />;
}
