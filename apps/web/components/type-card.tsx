import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  beachPath,
  config,
  getDictionary,
  resolveTypeCard,
  spotTypeCardPath,
  spotTypesSegment,
  type Locale,
  type ResolvedTypeCard,
} from '@ombre/shared';
import { api, uuidPattern, type ApiTypeCard } from '@/lib/api';
import { privateMetadata } from '@/lib/seo';
import { crumbsFor, DemoBadge, loadBeach, otherLocale } from './beach';
import { PageHead, PageShell } from './PageShell';
import '@ombre/ui/media.css';

// La scheda della postazione (D61–D63): la pagina pubblica del tipo, il corpo
// condiviso con l'anteprima del gestionale e gli ingressi («Vedi la scheda»,
// il riquadro «I tipi di postazione»). Tutto reso dal server, senza JavaScript.

/** The spot types of one club, asked once per request wherever an entry link needs them. */
export const loadSpotTypes = cache((slug: string) => api.spotTypes(slug));

/** The types of the club, or an empty list when the API cannot answer: the entry links simply stay away. */
export async function spotTypesOf(slug: string): Promise<ApiTypeCard[]> {
  const result = await loadSpotTypes(slug);
  return result.ok ? result.data.types : [];
}

/** The type of a given name, to link the card from pages that only carry the name. */
export function typeByName(types: ApiTypeCard[], name: string): ApiTypeCard | undefined {
  return types.find((type) => type.name === name);
}

/**
 * The validated «torna» target (D63): ONLY an internal relative path, so the
 * card can bring the Guest back to the exact purchase point and never off-site.
 * Anything else answers null and the page falls back on the beach club page.
 */
export function returnTarget(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.length > 600) return null;
  // One leading slash (never two: that is a protocol-relative address), no
  // backslash, no colon (no scheme), no whitespace or control characters.
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/[\s\\:]/.test(raw)) return null;
  return raw;
}

/** Address of the card of a type, with the exact return point in «torna». */
export function typeCardHref(locale: Locale, beachSlug: string, typeId: string, torna?: string): string {
  const base = spotTypeCardPath(locale, beachSlug, typeId);
  return torna ? `${base}?torna=${encodeURIComponent(torna)}` : base;
}

/** «Vedi la scheda» with the type name for the screen reader, as the reviewed texts prescribe. */
export function TypeCardLink({ locale, href, typeName }: { locale: Locale; href: string; typeName: string }) {
  const k = getDictionary(locale, config.brandName).typeCards;
  return (
    <Link href={href} prefetch={false}>
      {k.link}
      <span className="visually-hidden">: {typeName}</span>
    </Link>
  );
}

/**
 * The body of the card, THE SAME for the public page and the manager's preview
 * (D63): photographs with optional captions, description, the REAL equipment
 * and capacity of the type with the equipment note under them, the tip, the
 * custom details, and the sober «Scheda del lido» note only when customized.
 */
export function TypeCardView({ locale, card, headingLevel = 'h2' }: { locale: Locale; card: ResolvedTypeCard; headingLevel?: 'h2' | 'h3' }) {
  const t = getDictionary(locale, config.brandName);
  const k = t.typeCards;
  const b = t.booking;
  const H = headingLevel;
  return (
    <div className="stack">
      {/* La nota sobria: solo la scheda personalizzata dice di chi è; la predefinita non si vanta. */}
      {card.customized ? <p className="type-note">{k.clubCardNote}</p> : null}
      <ul className="site-gallery type-photos" aria-label={k.photosLabel}>
        {card.photos.map((photo) => (
          <li key={photo.src}>
            <figure>
              <img src={photo.src} alt={photo.alt} width={1200} height={800} loading="lazy" />
              {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
            </figure>
          </li>
        ))}
      </ul>
      <p className="prose">{card.description}</p>
      <div>
        <H>{k.equipmentTitle}</H>
        {/* La dotazione e la capienza VERE del tipo, con le stesse parole di ovunque. */}
        <p className="prose">
          <strong>
            {b.equipment(card.umbrellas, card.sunbeds)}. {b.guests(card.maxGuests)}.
          </strong>
        </p>
        {/* La nota «Di norma… dove indicato» è una nota SOTTO la dotazione vera, mai una dotazione certa. */}
        <p className="prose type-note">{card.equipmentNote}</p>
      </div>
      {card.capacityNote ? (
        <p className="prose">
          <strong>{k.tipLabel}:</strong> {card.capacityNote}
        </p>
      ) : null}
      {card.details.length > 0 ? (
        <div>
          <H>{k.detailsTitle}</H>
          <dl className="summary">
            {card.details.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/** Anchor of the «I tipi di postazione» panel on the beach club page, used by its «torna». */
export const typesPanelAnchor = 'tipi-postazione';

/**
 * Il riquadro «I tipi di postazione» sulla scheda del lido (D63): i tipi offerti,
 * ciascuno con la miniatura della foto risolta, il nome e il collegamento.
 */
export function TypeCardsPanel({ locale, beachSlug, types, torna }: { locale: Locale; beachSlug: string; types: ApiTypeCard[]; torna: string }) {
  if (types.length === 0) return null;
  const k = getDictionary(locale, config.brandName).typeCards;
  return (
    <section className="section" id={typesPanelAnchor} aria-labelledby="tipi-postazione-titolo">
      <div className="container">
        <h2 id="tipi-postazione-titolo">{k.panelTitle}</h2>
        <ul className="type-panel">
          {types.map((type) => {
            const card = resolveTypeCard(type, type.content, locale);
            return (
              <li key={type.typeId}>
                <img src={card.photos[0]!.src} alt="" width={132} height={88} loading="lazy" />
                <Link href={typeCardHref(locale, beachSlug, type.typeId, torna)} prefetch={false}>
                  {type.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Loads the club and the asked type, or answers 404. Shared by the page and its metadata. */
async function loadTypeCard(lang: string, section: string, slug: string, step: string, typeId: string) {
  const { locale, beach } = await loadBeach(lang, section, slug);
  if (step !== spotTypesSegment[locale] || !uuidPattern.test(typeId)) notFound();
  const result = await loadSpotTypes(beach.slug);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error(`API not available (${result.code})`);
  }
  const type = result.data.types.find((entry) => entry.typeId === typeId);
  if (!type) notFound();
  return { locale, beach, type, card: resolveTypeCard(type, type.content, locale) };
}

export async function typeCardMetadata(lang: string, section: string, slug: string, step: string, typeId: string): Promise<Metadata> {
  const { locale, beach, card } = await loadTypeCard(lang, section, slug, step, typeId);
  return privateMetadata(locale, card.title, { club: beach.name, follow: true });
}

/**
 * La pagina pubblica della scheda (D63): /bagni/{slug}/postazioni/{typeId}.
 * In fondo il ritorno ESATTO al punto d'acquisto via «torna» (solo percorso
 * interno convalidato); senza parametro si torna alla scheda del lido.
 */
export async function TypeCardPage({
  lang,
  section,
  slug,
  step,
  typeId,
  query,
}: {
  lang: string;
  section: string;
  slug: string;
  step: string;
  typeId: string;
  query: Record<string, string | string[] | undefined>;
}) {
  const { locale, beach, card } = await loadTypeCard(lang, section, slug, step, typeId);
  const k = getDictionary(locale, config.brandName).typeCards;
  const back = returnTarget(query.torna);
  // Il cambio di lingua apre la stessa scheda; il «torna» resta nella lingua di origine e non viaggia.
  const alternate = spotTypeCardPath(otherLocale(locale), beach.slug, typeId);
  return (
    <PageShell locale={locale} page="search" alternatePath={alternate} crumbs={crumbsFor(locale, beach, card.title)}>
      <PageHead title={card.title} lead={k.lead(beach.name)} />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container stack">
          <TypeCardView locale={locale} card={card} />
          <p className="actions">
            <Link className="button button--secondary" href={back ?? beachPath(locale, beach.slug)} prefetch={false}>
              {back ? k.backExact : k.backToClub}
            </Link>
          </p>
        </div>
      </section>
    </PageShell>
  );
}
