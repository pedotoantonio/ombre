'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';

// The map box and its three states. The server renders the static invitation, which is all
// a visitor without JavaScript ever sees. With JavaScript, the box shows "map not available"
// while Leaflet and the pins are not there yet, and loads them only when the box appears in
// the viewport or is touched first: the map is an enrichment, never a requirement.

/** One beach club on the map. Only what the pin and its card need. */
export interface MapMarker {
  slug: string;
  name: string;
  locality: string;
  latitude: number;
  longitude: number;
  /** Page of the beach club, already localized by the server. */
  href: string;
  /** Lowest price of the searched day, already formatted. Only on the explore page. */
  priceFromText?: string;
}

/** Every text of the map, as plain strings: dictionary functions cannot cross to the client. */
export interface MapLabels {
  invite: string;
  inviteCta: string;
  inviteHref: string;
  unavailable: string;
  region: string;
  open: string;
  zoomIn: string;
  zoomOut: string;
}

interface MapView {
  Map: ComponentType<{ markers: MapMarker[]; labels: MapLabels; onError: () => void }>;
  markers: MapMarker[];
}

export function MapPanel({ markers, sourceUrl, labels }: { markers?: MapMarker[]; sourceUrl?: string; labels: MapLabels }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // True only after hydration: without JavaScript the box never mentions the map.
  const [scripted, setScripted] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [view, setView] = useState<MapView | 'error' | null>(null);

  useEffect(() => setScripted(true), []);

  // The box asks for the map when it comes into view. Without the observer, right away.
  useEffect(() => {
    if (wanted) return;
    const node = boxRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setWanted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setWanted(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [wanted]);

  // Script and data arrive together; any failure leaves the invitation in place.
  useEffect(() => {
    if (!wanted || view !== null) return;
    let alive = true;
    const data: Promise<MapMarker[]> = markers
      ? Promise.resolve(markers)
      : fetch(sourceUrl ?? '', { headers: { Accept: 'application/json' } }).then(async (response) => {
          if (!response.ok) throw new Error('markers not available');
          const body = (await response.json()) as { markers?: MapMarker[] };
          if (!Array.isArray(body.markers)) throw new Error('markers not available');
          return body.markers;
        });
    Promise.all([import('./beaches-map'), data])
      .then(([loaded, pins]) => {
        if (!alive) return;
        if (pins.length === 0) setView('error');
        else setView({ Map: loaded.BeachesMap, markers: pins });
      })
      .catch(() => {
        if (alive) setView('error');
      });
    return () => {
      alive = false;
    };
    // markers and sourceUrl come from the server and never change on the page.
  }, [wanted, view, markers, sourceUrl]);

  const want = () => setWanted(true);
  const ready = view !== null && view !== 'error';

  return (
    <div className="portal-map" ref={boxRef} onPointerEnter={want} onTouchStart={want} onFocusCapture={want} data-state={ready ? 'loaded' : 'empty'}>
      {ready ? (
        <view.Map markers={view.markers} labels={labels} onError={() => setView('error')} />
      ) : (
        <div className="portal-map__invite">
          <p>{labels.invite}</p>
          <p>
            <a className="button button--secondary" href={labels.inviteHref}>
              {labels.inviteCta}
            </a>
          </p>
          {scripted ? (
            <p className="portal-map__status" role="status">
              {labels.unavailable}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
