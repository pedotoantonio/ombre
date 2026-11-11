-- The beach club website: content kept as revisions. A draft is edited, checked and then
-- published; the previous published revision is archived, never overwritten.

CREATE TYPE site_template AS ENUM ('riviera', 'boutique', 'essential');
CREATE TYPE revision_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE site_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  number integer NOT NULL CHECK (number > 0),
  status revision_status NOT NULL DEFAULT 'draft',
  template site_template NOT NULL,
  content jsonb NOT NULL,
  -- Grows at every save of the draft: two editors cannot silently overwrite each other.
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (beach_id, number)
);
CREATE UNIQUE INDEX site_one_draft ON site_revision (beach_id) WHERE status = 'draft';
CREATE UNIQUE INDEX site_one_published ON site_revision (beach_id) WHERE status = 'published';

ALTER TABLE site_revision ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_revision_tenant ON site_revision TO ombre_app USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
GRANT SELECT, INSERT, UPDATE ON site_revision TO ombre_app;
