import { describe, expect, it } from 'vitest';
import { defaultTypeCards, parseTypeCardContent, resolveTypeCard, spotMarks, typeCardLimits, type TypeCardContent } from '../src/index';

const gazebo = { name: 'Gazebo Vista Mare', mark: 'gazebo' as const, umbrellas: 0, sunbeds: 2, maxGuests: 4 };

describe('the default cards of the platform (D61)', () => {
  it('covers every mark of the repertoire with honest texts and its own photograph', () => {
    for (const mark of spotMarks) {
      const card = defaultTypeCards[mark];
      expect(card.descriptionIt.length).toBeGreaterThan(10);
      expect(card.descriptionEn.length).toBeGreaterThan(10);
      expect(card.equipmentNoteIt.length).toBeGreaterThan(5);
      expect(card.equipmentNoteEn.length).toBeGreaterThan(5);
      expect(card.photo).toBe(`/demo/tipi/${mark}.jpg`);
    }
  });
});

describe('parseTypeCardContent', () => {
  it('accepts a full card and trims its texts', () => {
    const parsed = parseTypeCardContent({
      title: '  Gazebo Vista Mare  ',
      descriptionIt: 'Un gazebo in prima fila.',
      descriptionEn: 'A front-row gazebo.',
      photos: [{ id: 'riva', captionIt: 'La riva' }, { id: 'dune' }],
      equipmentNote: { it: 'Due lettini e un tavolino.', en: 'Two sunbeds and a small table.' },
      capacityNote: { it: 'Fino a quattro persone.' },
      details: [{ labelIt: 'Ombra', valueIt: 'Tutto il giorno', labelEn: 'Shade', valueEn: 'All day' }],
    });
    expect(parsed.title).toBe('Gazebo Vista Mare');
    expect(parsed.photos).toHaveLength(2);
    expect(parsed.details![0]!.labelEn).toBe('Shade');
  });

  it('refuses unknown fields, wherever they hide', () => {
    expect(() => parseTypeCardContent({ titolo: 'x' })).toThrow(/unknown field: titolo/);
    expect(() => parseTypeCardContent({ title: 'x', photos: [{ id: 'riva', href: 'https://x' }] })).toThrow(/unknown field: href/);
    expect(() => parseTypeCardContent({ details: [{ labelIt: 'a', valueIt: 'b', note: 'c' }] })).toThrow(/unknown field: note/);
    expect(() => parseTypeCardContent({ equipmentNote: { it: 'a', fr: 'b' } })).toThrow(/unknown field: fr/);
  });

  it('refuses too many photos or details, markup, oversize and empty texts', () => {
    expect(() => parseTypeCardContent({ photos: Array.from({ length: 7 }, () => ({ id: 'riva' })) })).toThrow(/1 to 6/);
    expect(() => parseTypeCardContent({ photos: [] })).toThrow(/1 to 6/);
    expect(() => parseTypeCardContent({ details: Array.from({ length: 7 }, () => ({ labelIt: 'a', valueIt: 'b' })) })).toThrow(/1 to 6/);
    expect(() => parseTypeCardContent({ title: 'Ciao <b>mare</b>' })).toThrow(/plain text/);
    expect(() => parseTypeCardContent({ title: 'a'.repeat(typeCardLimits.title + 1) })).toThrow(/80/);
    expect(() => parseTypeCardContent({ descriptionIt: 'a'.repeat(typeCardLimits.description + 1) })).toThrow(/1200/);
    expect(() => parseTypeCardContent({ photos: [{ id: 'riva', captionIt: 'a'.repeat(161) }] })).toThrow(/160/);
    expect(() => parseTypeCardContent({ title: '   ' })).toThrow(/empty/);
    expect(() => parseTypeCardContent({ photos: [{ id: 'Fuori Formato' }] })).toThrow(/sample library/);
  });

  it('refuses a card that customizes nothing', () => {
    expect(() => parseTypeCardContent({})).toThrow(/at least one field/);
    expect(() => parseTypeCardContent('testo')).toThrow(/object/);
  });
});

describe('resolveTypeCard: field by field (D61)', () => {
  it('without content, the card is the default of the mark with the name of the type as title', () => {
    const card = resolveTypeCard(gazebo, null, 'it');
    expect(card).toMatchObject({
      title: 'Gazebo Vista Mare',
      description: defaultTypeCards.gazebo.descriptionIt,
      equipmentNote: defaultTypeCards.gazebo.equipmentNoteIt,
      umbrellas: 0,
      sunbeds: 2,
      maxGuests: 4,
      customized: false,
      customFields: [],
    });
    expect(card.photos).toEqual([{ src: '/demo/tipi/gazebo.jpg', alt: defaultTypeCards.gazebo.descriptionIt, caption: null }]);
    expect(resolveTypeCard(gazebo, null, 'en').description).toBe(defaultTypeCards.gazebo.descriptionEn);
  });

  it('takes the custom field where there is one and the default elsewhere', () => {
    const content: TypeCardContent = { descriptionIt: 'Il nostro gazebo in prima fila.', photos: [{ id: 'riva', captionIt: 'La riva' }] };
    const card = resolveTypeCard(gazebo, content, 'it');
    expect(card.description).toBe('Il nostro gazebo in prima fila.');
    expect(card.photos[0]).toMatchObject({ src: '/demo/riva.jpg', caption: 'La riva' });
    // The rest stays default: title from the type, equipment note from the mark.
    expect(card.title).toBe('Gazebo Vista Mare');
    expect(card.equipmentNote).toBe(defaultTypeCards.gazebo.equipmentNoteIt);
    expect(card.customized).toBe(true);
    expect(card.customFields).toEqual(['description', 'photos']);
  });

  it('falls back on the Italian when the English is missing, like the site', () => {
    const content: TypeCardContent = {
      descriptionIt: 'Solo in italiano.',
      equipmentNote: { it: 'Dotazione in italiano.' },
      details: [{ labelIt: 'Ombra', valueIt: 'Sempre' }],
      photos: [{ id: 'riva', captionIt: 'Solo didascalia italiana' }],
    };
    const card = resolveTypeCard(gazebo, content, 'en');
    expect(card.description).toBe('Solo in italiano.');
    expect(card.equipmentNote).toBe('Dotazione in italiano.');
    expect(card.details).toEqual([{ label: 'Ombra', value: 'Sempre' }]);
    expect(card.photos[0]!.caption).toBe('Solo didascalia italiana');
    // The photo alt comes from the sample library in the right language.
    expect(card.photos[0]!.alt).toContain('wave');
  });

  it('uses the capacity note of the default only where the mark has one', () => {
    // The reviewed texts (docs/testi-schede-tipi.md) give the gazebo a tip and none to the umbrella, sunbed or canopy.
    expect(resolveTypeCard(gazebo, null, 'it').capacityNote).toBe(defaultTypeCards.gazebo.tipIt);
    expect(resolveTypeCard({ ...gazebo, mark: 'umbrella' }, null, 'it').capacityNote).toBeNull();
    expect(resolveTypeCard({ ...gazebo, mark: 'sunbed' }, null, 'it').capacityNote).toBeNull();
    expect(resolveTypeCard({ ...gazebo, mark: 'canopy' }, null, 'it').capacityNote).toBeNull();
    expect(resolveTypeCard(gazebo, { capacityNote: { it: 'In quattro, comodi.' } }, 'it').capacityNote).toBe('In quattro, comodi.');
  });
});
