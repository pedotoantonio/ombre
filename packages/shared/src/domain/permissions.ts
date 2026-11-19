export const membershipRoles = ['manager', 'reception', 'accounting', 'cabin_holder'] as const;
export type MembershipRole = (typeof membershipRoles)[number];

export const actions = [
  'inventory.read',
  'inventory.publish',
  'inventory.block',
  'inventory.price',
  'access.check',
  'bookings.read',
  'bookings.create',
  'bookings.move',
  'bookings.cancel',
  'sharing.manage',
  // Commercial codes: promotions and hotel conventions share this one permission
  // (spec §4.1). Introduced with the conventions, since promotions were only ever
  // seeded owner-side and had no management permission of their own.
  'promotions.manage',
  'reports.read',
  'site.read',
  'site.edit',
  'layout.edit',
  'layout.gaps',
  'cabins.manage',
  // Moderation of the verified reviews (D51): flag with a written reason, reply.
  // Manager only: the actions list below gives it to no other role.
  'reviews.moderate',
] as const;
export type Action = (typeof actions)[number];

/** What each role of a beach club may do. Anything not listed is refused. */
export const permissions: Record<MembershipRole, readonly Action[]> = {
  manager: actions,
  // Reception adjusts the zone distances (the owner's "bagnino"), never the structure.
  reception: ['inventory.read', 'inventory.block', 'access.check', 'bookings.read', 'bookings.create', 'bookings.move', 'site.read', 'layout.gaps'],
  accounting: ['reports.read'],
  // A cabin holder reaches only their own cabins, through dedicated routes: no club-wide action.
  cabin_holder: [],
};

export function can(role: MembershipRole, action: Action): boolean {
  return permissions[role].includes(action);
}
