-- AutoCOB schema. Every row that holds customer data carries workspace_id, and every query
-- filters on it: a workspace is one clinic or one billing company.
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists users_email_key on users (lower(email));

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  user_id uuid primary key references users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);
create index if not exists memberships_workspace on memberships (workspace_id);

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists invites (
  code_hash text primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists login_attempts (
  email text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_email_at on login_attempts (email, at);

create table if not exists cases (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  id text not null,
  data jsonb not null,
  version integer not null default 1,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists documents (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  id text not null,
  case_id text not null,
  name text not null,
  content_type text not null,
  size integer not null,
  bytes bytea not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index if not exists documents_case on documents (workspace_id, case_id);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  job text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_runs_workspace_at on agent_runs (workspace_id, created_at);
