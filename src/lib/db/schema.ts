import { bigint, boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { Thresholds } from '../analytics/investigate';
import type { ImportIssue } from '../import/normalize';
import type { ImportMapping } from '../import/mapping';
import type { ReportSnapshot } from '../reports/snapshot';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ---------------------------------------------------------------------------
 * Authentication tables. Shapes follow Better Auth's core schema; the adapter
 * maps by property name, so column names can stay snake_case.
 * ------------------------------------------------------------------------- */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/* ---------------------------------------------------------------------------
 * Tenancy. An agency is the tenant. Every business table carries agency_id and
 * every query in src/lib/services filters on it.
 * ------------------------------------------------------------------------- */
export const roleEnum = pgEnum('member_role', ['owner', 'analyst', 'viewer']);

export const agencies = pgTable('agencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** Demo sandboxes are created per visitor, seeded with fictional data and deleted after they expire. */
  isDemo: boolean('is_demo').notNull().default(false),
  demoExpiresAt: timestamp('demo_expires_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('memberships_agency_user_uq').on(t.agencyId, t.userId), index('memberships_user_idx').on(t.userId)],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: roleEnum('role').notNull(),
    /** SHA-256 of the invite token. The token itself is shown once and never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('invitations_agency_idx').on(t.agencyId)],
);

/* ---------------------------------------------------------------------------
 * Client workspaces and their data.
 * ------------------------------------------------------------------------- */
export interface ClientBranding {
  /** Accent colour used on the client's reports, as #RRGGBB. */
  color: string;
  /** Name shown on reports as "Prepared by". */
  preparedBy: string;
  /** Optional footer line, e.g. a confidentiality note. */
  footer: string;
}

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** One currency per client. Imports in another currency are rejected, never converted or combined. */
    currency: text('currency').notNull(),
    /** IANA timezone that defines the calendar day for imported dates and "today" for pacing. */
    timezone: text('timezone').notNull(),
    /** What a "conversion" means for this client, shown on reports so numbers are read in context. */
    conversionDefinition: text('conversion_definition').notNull().default(''),
    branding: jsonb('branding').$type<ClientBranding>().notNull(),
    thresholds: jsonb('thresholds').$type<Thresholds>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('clients_agency_name_uq').on(t.agencyId, t.name)],
);

export const imports = pgTable(
  'imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    /** Free-text provenance, e.g. "Google Ads campaign report". */
    source: text('source').notNull(),
    /** SHA-256 of the file text, to recognise the same file being imported again. */
    fileHash: text('file_hash').notNull(),
    mapping: jsonb('mapping').$type<ImportMapping>().notNull(),
    conflictPolicy: text('conflict_policy').$type<'replace' | 'keep'>().notNull(),
    rowsInFile: integer('rows_in_file').notNull(),
    inserted: integer('inserted').notNull(),
    replaced: integer('replaced').notNull(),
    unchanged: integer('unchanged').notNull(),
    keptExisting: integer('kept_existing').notNull(),
    rejected: integer('rejected').notNull(),
    errorCount: integer('error_count').notNull(),
    warningCount: integer('warning_count').notNull(),
    /** Up to 200 issues are stored so rejected rows remain reviewable after the import. */
    issues: jsonb('issues').$type<ImportIssue[]>().notNull(),
    coverageStart: date('coverage_start', { mode: 'string' }),
    coverageEnd: date('coverage_end', { mode: 'string' }),
    currency: text('currency').notNull(),
    timezone: text('timezone').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdByName: text('created_by_name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('imports_client_idx').on(t.clientId, t.createdAt)],
);

export const campaignDays = pgTable(
  'campaign_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    channel: text('channel').notNull(),
    campaign: text('campaign').notNull(),
    /** Money in minor units (cents). */
    spendCents: bigint('spend_cents', { mode: 'number' }).notNull(),
    impressions: bigint('impressions', { mode: 'number' }).notNull(),
    clicks: bigint('clicks', { mode: 'number' }).notNull(),
    /** Fractional conversions are legitimate (data-driven attribution); 4 decimals are kept. */
    conversions: numeric('conversions', { precision: 16, scale: 4 }).notNull(),
    revenueCents: bigint('revenue_cents', { mode: 'number' }).notNull(),
    /** The import that last wrote this row. */
    importId: uuid('import_id').references(() => imports.id, { onDelete: 'set null' }),
  },
  (t) => [
    // The row grain. Repeat imports resolve against this key.
    uniqueIndex('campaign_days_grain_uq').on(t.clientId, t.date, t.channel, t.campaign),
    index('campaign_days_agency_idx').on(t.agencyId),
  ],
);

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    /** 'client' budgets cover all channels; 'campaign' budgets cover one channel + campaign. */
    scope: text('scope').$type<'client' | 'campaign'>().notNull(),
    channel: text('channel'),
    campaign: text('campaign'),
    /** Inclusive calendar dates in the client's reporting timezone. */
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('budgets_client_idx').on(t.clientId, t.periodStart)],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: text('status').$type<'draft' | 'final'>().notNull().default('draft'),
    commentary: text('commentary').notNull().default(''),
    sections: jsonb('sections').$type<string[]>().notNull(),
    /** The exact data the report shows. Frozen when the report is finalized. */
    snapshot: jsonb('snapshot').$type<ReportSnapshot>().notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  },
  (t) => [index('reports_client_idx').on(t.clientId, t.createdAt)],
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    /** SHA-256 of the share token. The token is shown once at creation and cannot be recovered. */
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdByName: text('created_by_name').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('share_links_report_idx').on(t.reportId)],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type ClientRow = typeof clients.$inferSelect;
export type ImportRow = typeof imports.$inferSelect;
export type BudgetRow = typeof budgets.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type ShareLinkRow = typeof shareLinks.$inferSelect;
