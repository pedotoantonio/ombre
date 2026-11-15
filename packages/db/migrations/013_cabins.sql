-- Sea cabins: the register of cabins, their assignments to holders and the sublets
-- the holders propose for the manager to decide. No money in the system: periods,
-- people and approvals only, like the season contracts. A holder may have an
-- account (new membership role cabin_holder, per beach club) and then sees exactly
-- their own cabins, assignments and proposals through row level security.

ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'cabin_holder';

CREATE TABLE cabin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 10),
  -- The cabin block drawn on the layout, when there is one. Erasing the block keeps
  -- the cabins and simply detaches them from the drawing.
  element_id uuid,
  notes text CHECK (notes IS NULL OR length(notes) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beach_id, code),
  UNIQUE (id, beach_id),
  FOREIGN KEY (element_id, beach_id) REFERENCES layout_element (id, beach_id) ON DELETE SET NULL (element_id)
);

CREATE TABLE cabin_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  cabin_id uuid NOT NULL,
  -- The holder may have an account, a written name and contact, or both; never neither.
  holder_account_id uuid REFERENCES app_user (id),
  holder_name text CHECK (holder_name IS NULL OR length(holder_name) BETWEEN 1 AND 120),
  holder_contact text CHECK (holder_contact IS NULL OR length(holder_contact) BETWEEN 1 AND 200),
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (cabin_id, beach_id) REFERENCES cabin (id, beach_id),
  UNIQUE (id, beach_id),
  CHECK (valid_from <= valid_to),
  CHECK (holder_account_id IS NOT NULL OR holder_name IS NOT NULL),
  -- A cabin cannot be assigned to two holders on the same day, like season contracts.
  EXCLUDE USING gist (cabin_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&) WHERE (status <> 'ended')
);

CREATE TABLE cabin_sublet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  assignment_id uuid NOT NULL,
  from_day date NOT NULL,
  to_day date NOT NULL,
  occupant_name text NOT NULL CHECK (length(occupant_name) BETWEEN 1 AND 120),
  occupant_contact text CHECK (occupant_contact IS NULL OR length(occupant_contact) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'ended')),
  decided_by uuid REFERENCES app_user (id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (assignment_id, beach_id) REFERENCES cabin_assignment (id, beach_id),
  UNIQUE (id, beach_id),
  CHECK (from_day <= to_day),
  -- Approved sublets of the same assignment never overlap. The application also
  -- checks that the period stays inside the assignment.
  EXCLUDE USING gist (assignment_id WITH =, daterange(from_day, to_day, '[]') WITH &&) WHERE (status = 'approved')
);
CREATE INDEX cabin_sublet_assignment ON cabin_sublet (assignment_id, status);

ALTER TABLE cabin ENABLE ROW LEVEL SECURITY;
ALTER TABLE cabin_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE cabin_sublet ENABLE ROW LEVEL SECURITY;

-- The manager works inside the current beach club, as everywhere else.
CREATE POLICY cabin_tenant ON cabin TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY assignment_tenant ON cabin_assignment TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY sublet_tenant ON cabin_sublet TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());

-- A holder, before any beach club is chosen, sees exactly their own rows: the
-- assignments naming their account, the cabins and sublets of those assignments,
-- the beach club and the drawn block those cabins hang from. Nothing else.
CREATE POLICY assignment_holder ON cabin_assignment FOR SELECT TO ombre_app
  USING (holder_account_id = app_user_id());
CREATE POLICY cabin_holder_read ON cabin FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM cabin_assignment a WHERE a.cabin_id = cabin.id AND a.holder_account_id = app_user_id()));
CREATE POLICY sublet_holder_read ON cabin_sublet FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM cabin_assignment a WHERE a.id = cabin_sublet.assignment_id AND a.holder_account_id = app_user_id()));
-- A holder may only add a fresh proposal on their own assignment, never a decision.
CREATE POLICY sublet_holder_propose ON cabin_sublet FOR INSERT TO ombre_app
  WITH CHECK (
    status = 'proposed' AND decided_by IS NULL
    AND EXISTS (
      SELECT 1 FROM cabin_assignment a
      WHERE a.id = cabin_sublet.assignment_id AND a.beach_id = cabin_sublet.beach_id AND a.holder_account_id = app_user_id()
    )
  );
CREATE POLICY beach_cabin_holder ON beach FOR SELECT TO ombre_app
  USING (EXISTS (SELECT 1 FROM cabin_assignment a WHERE a.beach_id = beach.id AND a.holder_account_id = app_user_id()));
CREATE POLICY element_cabin_holder ON layout_element FOR SELECT TO ombre_app
  USING (EXISTS (
    SELECT 1 FROM cabin c
    WHERE c.element_id = layout_element.id
      AND EXISTS (SELECT 1 FROM cabin_assignment a WHERE a.cabin_id = c.id AND a.holder_account_id = app_user_id())
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON cabin TO ombre_app;
GRANT SELECT, INSERT, UPDATE ON cabin_assignment TO ombre_app;
GRANT SELECT, INSERT, UPDATE ON cabin_sublet TO ombre_app;
