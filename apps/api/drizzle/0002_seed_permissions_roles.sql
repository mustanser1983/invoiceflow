-- 0002_seed_permissions_roles: permission catalogue and system role templates
-- (ARCHITECTURE_AND_API.md §6.2). Code checks permission codes only, never role names (ROLE-001).
-- Needs human review.

INSERT INTO permissions (permission_code, module, description) VALUES
  ('tenant.view',              'tenant',       'View business details'),
  ('tenant.update',            'tenant',       'Edit business details'),
  ('tenant.settings.update',   'tenant',       'Change business settings and numbering'),
  ('user.view',                'users',        'View users'),
  ('user.invite',              'users',        'Invite users'),
  ('user.update',              'users',        'Change user role or status'),
  ('role.view',                'users',        'View roles and permissions'),
  ('role.manage',              'users',        'Create and edit roles'),
  ('subscription.view',        'subscription', 'View subscription'),
  ('subscription.manage',      'subscription', 'Change subscription'),
  ('customer.view',            'customers',    'View customers'),
  ('customer.create',          'customers',    'Create customers'),
  ('customer.update',          'customers',    'Edit customers'),
  ('supplier.view',            'suppliers',    'View suppliers'),
  ('supplier.create',          'suppliers',    'Create suppliers'),
  ('supplier.update',          'suppliers',    'Edit suppliers'),
  ('item.view',                'items',        'View products and services'),
  ('item.create',              'items',        'Create products and services'),
  ('item.update',              'items',        'Edit products and services'),
  ('quotation.view',           'quotations',   'View quotations'),
  ('quotation.create',         'quotations',   'Create quotations'),
  ('quotation.update',         'quotations',   'Edit quotations'),
  ('quotation.send',           'quotations',   'Send quotations'),
  ('quotation.convert',        'quotations',   'Convert quotations to invoices'),
  ('invoice.view',             'invoices',     'View invoices'),
  ('invoice.create',           'invoices',     'Create draft invoices'),
  ('invoice.update',           'invoices',     'Edit draft invoices'),
  ('invoice.issue',            'invoices',     'Issue invoices'),
  ('invoice.cancel',           'invoices',     'Cancel invoices'),
  ('credit_note.create',       'invoices',     'Create credit notes'),
  ('credit_note.issue',        'invoices',     'Issue credit notes'),
  ('credit_note.void',         'invoices',     'Void credit notes'),
  ('receipt.view',             'receipts',     'View receipts'),
  ('receipt.create',           'receipts',     'Record receipts'),
  ('receipt.allocate',         'receipts',     'Allocate receipts to invoices'),
  ('receipt.void',             'receipts',     'Void receipts'),
  ('purchase.view',            'purchases',    'View purchase bills'),
  ('purchase.create',          'purchases',    'Create purchase bills'),
  ('purchase.post',            'purchases',    'Post purchase bills'),
  ('purchase.void',            'purchases',    'Void purchase bills'),
  ('supplier_payment.view',    'purchases',    'View supplier payments'),
  ('supplier_payment.create',  'purchases',    'Record supplier payments'),
  ('supplier_payment.void',    'purchases',    'Void supplier payments'),
  ('expense.view',             'expenses',     'View expenses'),
  ('expense.create',           'expenses',     'Create expenses'),
  ('expense.post',             'expenses',     'Post expenses'),
  ('expense.void',             'expenses',     'Void expenses'),
  ('bank.view',                'banking',      'View bank and cash accounts'),
  ('bank.manage',              'banking',      'Create and edit bank and cash accounts'),
  ('bank.transaction.create',  'banking',      'Record deposits and withdrawals'),
  ('bank.transfer.create',     'banking',      'Transfer between accounts'),
  ('tax.view',                 'tax',          'View tax settings and codes'),
  ('tax.settings.update',      'tax',          'Change tax settings'),
  ('report.sales',             'reports',      'Sales reports'),
  ('report.purchases',         'reports',      'Purchase reports'),
  ('report.banking',           'reports',      'Bank and cash reports'),
  ('report.tax',               'reports',      'VAT reports'),
  ('report.profit_loss',       'reports',      'Management profit and loss'),
  ('report.export',            'reports',      'Export reports'),
  ('document.upload',          'documents',    'Upload attachments'),
  ('document.view',            'documents',    'View attachments'),
  ('document.delete',          'documents',    'Delete attachments'),
  ('audit.view',               'audit',        'View activity log');
--> statement-breakpoint

INSERT INTO roles (tenant_id, code, name, is_system) VALUES
  (NULL, 'owner',         'Owner',          true),
  (NULL, 'administrator', 'Administrator',  true),
  (NULL, 'accountant',    'Accountant',     true),
  (NULL, 'sales_user',    'Sales User',     true),
  (NULL, 'purchase_user', 'Purchase User',  true),
  (NULL, 'cashier',       'Cashier',        true);
--> statement-breakpoint

-- Owner: everything.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'owner';
--> statement-breakpoint

-- Administrator: everything except managing the subscription.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'administrator'
  AND p.permission_code <> 'subscription.manage';
--> statement-breakpoint

-- Accountant: all financial modules and reports; no user, role or subscription management.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.tenant_id IS NULL AND r.code = 'accountant'
  AND p.module NOT IN ('users', 'subscription')
  AND p.permission_code NOT IN ('tenant.update', 'tenant.settings.update');
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_code = ANY (ARRAY[
  'tenant.view',
  'customer.view', 'customer.create', 'customer.update',
  'item.view',
  'quotation.view', 'quotation.create', 'quotation.update', 'quotation.send', 'quotation.convert',
  'invoice.view', 'invoice.create', 'invoice.update', 'invoice.issue',
  'receipt.view',
  'report.sales'
])
WHERE r.tenant_id IS NULL AND r.code = 'sales_user';
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_code = ANY (ARRAY[
  'tenant.view',
  'supplier.view', 'supplier.create', 'supplier.update',
  'item.view',
  'purchase.view', 'purchase.create', 'purchase.post', 'purchase.void',
  'expense.view', 'expense.create', 'expense.post', 'expense.void',
  'supplier_payment.view',
  'document.upload', 'document.view',
  'report.purchases'
])
WHERE r.tenant_id IS NULL AND r.code = 'purchase_user';
--> statement-breakpoint

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_code = ANY (ARRAY[
  'tenant.view',
  'customer.view', 'supplier.view',
  'receipt.view', 'receipt.create', 'receipt.allocate', 'receipt.void',
  'supplier_payment.view', 'supplier_payment.create', 'supplier_payment.void',
  'bank.view', 'bank.transaction.create',
  'report.banking'
])
WHERE r.tenant_id IS NULL AND r.code = 'cashier';
