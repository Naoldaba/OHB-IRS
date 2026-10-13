/**
 * Capability catalogue — the shared, code-backed whitelist of "things a role may
 * be allowed to do". Each capability key maps to a real action the API guards
 * with `@RequireCapability(...)`; you cannot invent a capability here without
 * code that checks it.
 *
 * Phase 28 split authorization into two things:
 *  - the **keys** (this catalogue) stay in code — the whitelist of grantable
 *    capabilities; and
 *  - the **grants** (role → capability) move to the database (`RolePermission`),
 *    so a Bureau admin can edit each role's capabilities through the matrix UI.
 *
 * The backend stays authoritative: `ROLE_CAPABILITIES` below is only the
 * seed/default used to initialise the DB grants (and as a safe fallback); live
 * authorization reads the DB grants, never this constant.
 */

import { RoleName, RoleScope } from './enums';

/** The data boundary each system role is seeded with (Phase 28b). */
export const SYSTEM_ROLE_SCOPES: Record<RoleName, RoleScope> = {
  [RoleName.BUREAU_ADMIN]: RoleScope.BUREAU,
  [RoleName.REGIONAL_LAB_HEAD]: RoleScope.LAB,
};

/** A single named permission shown in the matrix. */
export interface Capability {
  /** Stable identifier. */
  key: string;
  /** Short human label. */
  label: string;
  /** One-line explanation. */
  description: string;
  /** Display grouping (see CAPABILITY_GROUPS for order). */
  group: string;
}

/** Display order for capability groups. */
export const CAPABILITY_GROUPS = [
  'Administration',
  'Report configuration',
  'Submitting reports',
  'Reports & review',
  'Analytics & monitoring',
  'Account & security',
] as const;

export type CapabilityGroup = (typeof CAPABILITY_GROUPS)[number];

/** Human metadata for each role (label + what it is for). */
export const ROLE_META: Record<RoleName, { label: string; description: string }> = {
  [RoleName.BUREAU_ADMIN]: {
    label: 'Bureau Administrator',
    description:
      'Oromia Health Bureau staff who configure reports, review submissions across all laboratories, and administer the system.',
  },
  [RoleName.REGIONAL_LAB_HEAD]: {
    label: 'Regional Lab Head',
    description:
      'Head of a regional laboratory who prepares, submits and corrects that laboratory’s own reports.',
  },
};

/** The full catalogue of capabilities, in no particular order (grouped on display). */
export const CAPABILITIES: Capability[] = [
  // Administration
  { key: 'manage_laboratories', group: 'Administration', label: 'Manage laboratories', description: 'Create and edit regional laboratories and their coordinates.' },
  { key: 'manage_users', group: 'Administration', label: 'Manage users', description: 'Provision accounts, reset passwords, activate or deactivate users.' },
  { key: 'manage_roles', group: 'Administration', label: 'Manage roles', description: 'View the permission matrix and assign users to roles.' },

  // Report configuration
  { key: 'manage_categories', group: 'Report configuration', label: 'Manage categories', description: 'Create and organise the report-category tree.' },
  { key: 'manage_report_types', group: 'Report configuration', label: 'Manage report types', description: 'Create and configure report types.' },
  { key: 'author_definitions', group: 'Report configuration', label: 'Author definitions & rules', description: 'Author report structure and business rules, and publish versions.' },
  { key: 'manage_periods', group: 'Report configuration', label: 'Manage reporting periods', description: 'Define Ethiopian-calendar reporting periods.' },
  { key: 'manage_requirements', group: 'Report configuration', label: 'Manage requirements', description: 'Set which laboratories must submit which reports.' },

  // Submitting reports
  { key: 'create_reports', group: 'Submitting reports', label: 'Create reports', description: 'Start report drafts for the laboratory.' },
  { key: 'edit_report_drafts', group: 'Submitting reports', label: 'Edit drafts', description: 'Fill and edit drafts and reports awaiting revision.' },
  { key: 'submit_reports', group: 'Submitting reports', label: 'Submit & resubmit', description: 'Submit and resubmit reports for review.' },
  { key: 'manage_attachments', group: 'Submitting reports', label: 'Manage attachments', description: 'Add and remove supporting attachments on own reports.' },

  // Reports & review
  { key: 'view_all_reports', group: 'Reports & review', label: 'View all reports', description: 'Open any laboratory’s submissions.' },
  { key: 'view_own_reports', group: 'Reports & review', label: 'View own reports', description: 'Open the laboratory’s own submissions.' },
  { key: 'review_submissions', group: 'Reports & review', label: 'Review submissions', description: 'Start a review on a submitted report.' },
  { key: 'request_revisions', group: 'Reports & review', label: 'Request revisions', description: 'Request corrections on a submitted report.' },
  { key: 'approve_reports', group: 'Reports & review', label: 'Approve reports', description: 'Approve and complete a report review.' },
  { key: 'give_feedback', group: 'Reports & review', label: 'Give feedback', description: 'Post feedback and reply within threads.' },
  { key: 'resolve_feedback', group: 'Reports & review', label: 'Resolve threads', description: 'Resolve or reopen feedback threads.' },

  // Analytics & monitoring
  { key: 'view_bureau_analytics', group: 'Analytics & monitoring', label: 'Bureau dashboard', description: 'View the bureau-wide compliance dashboard, SLA and map.' },
  { key: 'view_lab_analytics', group: 'Analytics & monitoring', label: 'Lab dashboard', description: 'View the laboratory’s own compliance dashboard.' },
  { key: 'view_audit', group: 'Analytics & monitoring', label: 'View audit log', description: 'View the system-wide audit history.' },
  { key: 'export_reports', group: 'Analytics & monitoring', label: 'Export reports', description: 'Export submissions to Excel/Word/PDF (scoped to what you can view).' },
  { key: 'search', group: 'Analytics & monitoring', label: 'Search', description: 'Full-text search across reports, submissions and feedback (scoped).' },
  { key: 'run_reminders', group: 'Analytics & monitoring', label: 'Run reminders', description: 'Trigger the deadline / overdue reminder sweep.' },

  // Account & security
  { key: 'manage_own_profile', group: 'Account & security', label: 'Manage own profile', description: 'Update own name, picture, password and preferences.' },
  { key: 'manage_two_factor', group: 'Account & security', label: 'Two-step verification', description: 'Enrol in or disable two-step verification.' },
];

/**
 * Which capabilities each role holds. This is the matrix the admin UI renders;
 * it reflects the `@Roles` guards + lab scoping the API enforces.
 */
export const ROLE_CAPABILITIES: Record<RoleName, string[]> = {
  [RoleName.BUREAU_ADMIN]: [
    'manage_laboratories',
    'manage_users',
    'manage_roles',
    'manage_categories',
    'manage_report_types',
    'author_definitions',
    'manage_periods',
    'manage_requirements',
    'view_all_reports',
    'review_submissions',
    'request_revisions',
    'approve_reports',
    'give_feedback',
    'resolve_feedback',
    'view_bureau_analytics',
    'view_audit',
    'export_reports',
    'search',
    'run_reminders',
    'manage_own_profile',
    'manage_two_factor',
  ],
  [RoleName.REGIONAL_LAB_HEAD]: [
    'create_reports',
    'edit_report_drafts',
    'submit_reports',
    'manage_attachments',
    'view_own_reports',
    'give_feedback',
    'resolve_feedback',
    'view_lab_analytics',
    'export_reports',
    'search',
    'manage_own_profile',
    'manage_two_factor',
  ],
};

/** Whether `role` holds the capability `key` (per the seed defaults above). */
export function roleHasCapability(role: RoleName, key: string): boolean {
  return ROLE_CAPABILITIES[role]?.includes(key) ?? false;
}

/** Every valid capability key — the code-backed whitelist for grant editing. */
export const CAPABILITY_KEYS: readonly string[] = CAPABILITIES.map((c) => c.key);

/** Whether `key` is a known, grantable capability. */
export function isCapabilityKey(key: string): boolean {
  return CAPABILITY_KEYS.includes(key);
}

/**
 * Capabilities that may never be left ungranted across all active users —
 * removing the last grant would lock administration out of the system. The
 * backend enforces the "at least one active user keeps this" invariant; the UI
 * disables the corresponding cell when it is the last grant.
 */
export const NON_REVOCABLE_CAPABILITIES: readonly string[] = ['manage_roles'];

// ---- API payload shapes (shared by the roles admin API + the web UI) --------

/** A role column in the matrix (Phase 28b: roles are data, not a fixed enum). */
export interface RoleColumn {
  /** The role's unique name (system roles keep their RoleName value). */
  name: string;
  label: string;
  description: string;
  scope: RoleScope;
  /** System roles cannot be renamed, rescoped or deleted. */
  isSystem: boolean;
  isActive: boolean;
}

/** A role plus its live member count and the capabilities it holds. */
export interface RoleSummary extends RoleColumn {
  memberCount: number;
  capabilityKeys: string[];
}

/** The full permission matrix for display: roles × grouped capabilities. */
export interface PermissionMatrix {
  roles: RoleColumn[];
  groups: { group: string; capabilities: Capability[] }[];
  /** grants[capabilityKey][roleName] === true when the role holds it. */
  grants: Record<string, Record<string, boolean>>;
}

/** A member of a role (for the roles screen's per-role member list). */
export interface RoleMember {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  laboratory: { id: string; name: string; code: string } | null;
}
