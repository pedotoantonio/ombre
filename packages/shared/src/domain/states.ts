/**
 * The five independent state machines of the project: paying is not entering,
 * holding is not confirming. Each map lists the states reachable from a state.
 */
export const transitions = {
  inventory: {
    unpublishable: ['available', 'blocked'],
    available: ['held', 'blocked', 'unpublishable'],
    held: ['occupied', 'available'],
    occupied: ['available'],
    blocked: ['available', 'unpublishable'],
  },
  booking: {
    draft: ['under_review', 'confirmed', 'cancelled'],
    under_review: ['confirmed', 'cancelled'],
    confirmed: ['cancelled', 'completed'],
    cancelled: [],
    completed: [],
  },
  payment: {
    not_started: ['in_progress'],
    in_progress: ['succeeded', 'failed', 'under_review'],
    under_review: ['succeeded', 'failed'],
    succeeded: [],
    failed: ['in_progress'],
  },
  refund: {
    not_requested: ['requested'],
    requested: ['in_progress'],
    in_progress: ['completed', 'failed'],
    completed: [],
    failed: ['in_progress'],
  },
  presence: {
    expected: ['inside', 'ended'],
    inside: ['outside_reentry_allowed', 'ended'],
    outside_reentry_allowed: ['inside', 'ended'],
    ended: [],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type Machine = keyof typeof transitions;
export type StateOf<M extends Machine> = keyof (typeof transitions)[M] & string;

export function canTransition<M extends Machine>(machine: M, from: StateOf<M>, to: StateOf<M>): boolean {
  const table = transitions[machine] as Record<string, readonly string[]>;
  return table[from]?.includes(to) ?? false;
}

export function assertTransition<M extends Machine>(machine: M, from: StateOf<M>, to: StateOf<M>): void {
  if (!canTransition(machine, from, to)) {
    throw new Error(`${machine}: transition from ${from} to ${to} is not allowed`);
  }
}
