import { config, getDictionary, type Locale, type SiteTemplate, type SiteTexts } from '@ombre/shared';
import type { ApiBeach } from '@/lib/api';
import '@ombre/ui/media.css';

/** The beach club's own texts, drawn by one of the three templates. */
export function BeachSite({ locale, template, texts }: { locale: Locale; template: SiteTemplate; texts: SiteTexts }) {
  const t = getDictionary(locale, config.brandName).site;
  const facts: [string, string][] = [
    [t.openingPeriod, texts.openingPeriod],
    [t.openingHours, texts.openingHours],
    [t.address, texts.address],
    [t.phone, texts.phone],
    [t.accessibility, texts.accessibility],
  ];
  const filled = facts.filter(([, value]) => value !== '');
  return (
    <div className={`site-block tpl-${template}`}>
      {texts.images?.cover ? (
        <img className="site-cover" src={texts.images.cover.src} alt={texts.images.cover.alt} width={1200} height={800} fetchPriority="high" />
      ) : null}
      <div className="site-hero">
        {texts.tagline ? <p className="site-tagline">{texts.tagline}</p> : null}
        <p>{texts.description}</p>
      </div>
      <div className="site-columns">
        {texts.services.length > 0 ? (
          <div>
            <h2>{t.servicesTitle}</h2>
            <ul className="list">
              {texts.services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {filled.length > 0 ? (
          <div>
            <h2>{t.infoTitle}</h2>
            <dl className="site-facts">
              {filled.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
      {texts.images && texts.images.gallery.length > 0 ? (
        <ul className="site-gallery" aria-label={t.gallery}>
          {texts.images.gallery.map((image) => (
            <li key={image.src}>
              <img src={image.src} alt={image.alt} width={1200} height={800} loading="lazy" />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Structured data built only from the fields the beach club filled in, as shown on the page. */
export function localBusinessData(beach: ApiBeach, texts: SiteTexts, url: string): Record<string, unknown> {
  return {
    '@type': 'LocalBusiness',
    name: beach.name,
    url,
    description: texts.description,
    ...(texts.address ? { address: texts.address } : {}),
    ...(texts.phone ? { telephone: texts.phone } : {}),
    ...(texts.openingHours ? { openingHours: texts.openingHours } : {}),
  };
}
