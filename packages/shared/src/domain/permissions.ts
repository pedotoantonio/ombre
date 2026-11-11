export const membershipRoles = ['manager', 'reception', 'accounting'] as const;
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
  'reports.read',
  'site.read',
  'site.edit',
] as const;
export type Action = (typeof actions)[number];

/** What each role of a beach club may do. Anything not listed is refused. */
export const permissions: Record<MembershipRole, readonly Action[]> = {
  manager: actions,
  reception: ['inventory.read', 'inventory.block', 'access.check', 'bookings.read', 'bookings.create', 'bookings.move', 'site.read'],
  accounting: ['reports.read'],
};

export function can(role: MembershipRole, action: Action): boolean {
  return permissions[role].includes(action);
}
