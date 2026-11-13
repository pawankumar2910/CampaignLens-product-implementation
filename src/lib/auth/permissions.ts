import type { Role } from '../db/schema';

/**
 * Authorization model. An Actor is a signed-in user acting inside one agency.
 * Services receive an Actor and (1) check the action against the role and
 * (2) scope every query to actor.agencyId. Nothing in the UI is trusted.
 */
export interface Actor {
  userId: string;
  userName: string;
  email: string;
  agencyId: string;
  agencyName: string;
  role: Role;
  /** True inside an "Explore demo" sandbox. */
  isDemo: boolean;
}

export type Action =
  | 'workspace:view'
  | 'client:create'
  | 'client:update'
  | 'client:delete'
  | 'data:import'
  | 'budget:write'
  | 'report:write'
  | 'report:delete'
  | 'share:write'
  | 'member:manage';

const ALL: readonly Role[] = ['owner', 'analyst', 'viewer'];
const EDITORS: readonly Role[] = ['owner', 'analyst'];
const OWNERS: readonly Role[] = ['owner'];

export const PERMISSIONS: Record<Action, readonly Role[]> = {
  'workspace:view': ALL,
  'client:create': EDITORS,
  'client:update': EDITORS,
  'client:delete': OWNERS,
  'data:import': EDITORS,
  'budget:write': EDITORS,
  'report:write': EDITORS,
  'report:delete': EDITORS,
  'share:write': EDITORS,
  'member:manage': OWNERS,
};

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', analyst: 'Analyst', viewer: 'Viewer' };
export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Everything an analyst can do, plus managing members and deleting clients.',
  analyst: 'Create clients, import data, set budgets, build and share reports.',
  viewer: 'Read-only access to dashboards and reports.',
};

export const can = (role: Role, action: Action): boolean => PERMISSIONS[action].includes(role);

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** Also used when a record belongs to another agency, so its existence is never revealed. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = 'Not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function assertCan(actor: Actor, action: Action): void {
  if (!can(actor.role, action)) {
    throw new ForbiddenError(`Your role (${ROLE_LABEL[actor.role]}) cannot do this. Ask an agency owner for access.`);
  }
}
