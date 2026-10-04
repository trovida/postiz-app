// Controlled retail shot-type taxonomy for the content-mix audit + auto-tagged
// library (Pillar A / #1). One category per image, so "mix" and "coverage"
// (Pillar B2) are comparable and retail-meaningful.
export const SHOT_TYPES = [
  'storefront_exterior',
  'interior_ambiance',
  'product_closeup',
  'product_styled',
  'people_staff',
  'customer_ugc',
  'flatlay',
  'signage_promo',
  'event',
  'behind_the_scenes',
  'food_drink',
  'other',
] as const;

export type ShotType = (typeof SHOT_TYPES)[number];

// Categories a brick-and-mortar retailer's feed benefits from having present —
// an empty one of these is surfaced as a gap in the audit (never a benchmark).
export const RETAIL_GAP_CATEGORIES: ShotType[] = [
  'storefront_exterior',
  'people_staff',
  'customer_ugc',
];
