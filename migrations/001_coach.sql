CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  token_hash text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  max_tokens bigint NOT NULL CHECK (max_tokens > 0),
  used_tokens bigint NOT NULL DEFAULT 0 CHECK (used_tokens >= 0),
  reserved_tokens bigint NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  CHECK (used_tokens + reserved_tokens <= max_tokens)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  invitation_id uuid NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE daily_token_budgets (
  day date PRIMARY KEY,
  used_tokens bigint NOT NULL DEFAULT 0 CHECK (used_tokens >= 0),
  reserved_tokens bigint NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0)
);
CREATE TABLE token_reservations (
  invitation_id uuid NOT NULL REFERENCES invitations(id),
  request_id uuid NOT NULL,
  day date NOT NULL REFERENCES daily_token_budgets(day),
  reserved_tokens bigint NOT NULL CHECK (reserved_tokens > 0),
  charged_tokens bigint CHECK (charged_tokens >= 0 AND charged_tokens <= reserved_tokens),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  PRIMARY KEY (invitation_id, request_id)
);
