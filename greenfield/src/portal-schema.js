'use strict';

// Compatibility gate for the existing PostgreSQL schema. This module is metadata-only:
// it never creates, alters, or writes database records.
const REQUIRED_PORTAL_COLUMNS = Object.freeze({
  organizations: ['id', 'status'],
  customers: ['id', 'organization_id', 'display_name', 'email', 'phone', 'preferred_locale', 'status'],
  customer_portal_accounts: ['id', 'organization_id', 'customer_id', 'email', 'password_hash', 'status', 'invitation_token_hash', 'invitation_expires_at', 'activated_at', 'last_login_at'],
  customer_portal_sessions: ['id', 'account_id', 'token_hash', 'expires_at', 'last_seen_at', 'created_at'],
  projects: ['id', 'organization_id', 'customer_id', 'reference', 'name', 'status', 'preview_url', 'target_date', 'client_approved_at', 'updated_at'],
  project_stages: ['id', 'project_id', 'name', 'status', 'sort_order', 'due_at'],
  customer_project_updates: ['id', 'organization_id', 'project_id', 'visibility', 'title', 'body', 'created_at'],
  project_approvals: ['id', 'organization_id', 'project_id', 'status', 'created_at'],
  notifications: ['id', 'organization_id', 'user_id', 'kind', 'title', 'body', 'created_at']
});

const OPTIONAL_PORTAL_COLUMNS = Object.freeze({
  project_files: ['id', 'organization_id', 'project_id', 'customer_id', 'storage_key', 'file_name', 'content_type', 'size_bytes', 'created_at'],
  project_comments: ['id', 'organization_id', 'project_id', 'customer_id', 'body', 'visibility', 'created_at']
});

function inspectPortalCompatibility(columns) {
  const present = new Map();
  for (const column of Array.isArray(columns) ? columns : []) {
    if (!column || typeof column.table_name !== 'string' || typeof column.column_name !== 'string') continue;
    if (column.table_schema && column.table_schema !== 'public') continue;
    if (!present.has(column.table_name)) present.set(column.table_name, new Set());
    present.get(column.table_name).add(column.column_name);
  }

  const evaluate = requirements => Object.entries(requirements).map(([table, requiredColumns]) => {
    const actual = present.get(table) || new Set();
    const missingColumns = requiredColumns.filter(name => !actual.has(name));
    return { table, present: actual.size > 0, ready: missingColumns.length === 0, missingColumns };
  });
  const required = evaluate(REQUIRED_PORTAL_COLUMNS);
  const optional = evaluate(OPTIONAL_PORTAL_COLUMNS);
  return {
    readOnly: true,
    ready: required.every(item => item.ready),
    required,
    optional,
    missingRequired: required.filter(item => !item.ready).map(({ table, missingColumns }) => ({ table, missingColumns }))
  };
}

module.exports = { inspectPortalCompatibility, REQUIRED_PORTAL_COLUMNS, OPTIONAL_PORTAL_COLUMNS };
