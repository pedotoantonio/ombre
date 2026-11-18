-- The cart and the order (D46). A cart lives on the server, belongs to ONE beach
-- club and reserves nothing; its items are a spot over a dal–al period with a
-- free-text holder, an optional promotion code and extras per item. The order is
-- born at confirmation: one booking group (D38) per item, one payment on the
-- whole order. The quick no-account purchase keeps its own path untouched.

CREATE TABLE cart (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  -- NULL while the cart lives behind the signed ticket alone; set at the claim.
  user_id uuid REFERENCES app_user (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, beach_id)
);
-- One live cart per account and beach club; anonymous carts are unbounded.
CREATE UNIQUE INDEX cart_one_per_user_beach ON cart (user_id, beach_id) WHERE user_id IS NOT NULL;

CREATE TABLE cart_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES cart (id) ON DELETE CASCADE,
  spot_id uuid NOT NULL REFERENCES spot (id),
  day_from date NOT NULL,
  day_to date NOT NULL,
  -- «Per chi è»: free text, empty means the orderer (D46).
  guest_name text NOT NULL DEFAULT '' CHECK (length(guest_name) <= 120),
  promo_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Same ceiling as every period (D38): at most 31 consecutive days.
  CHECK (day_to >= day_from AND day_to - day_from < 31)
);
CREATE INDEX cart_item_by_cart ON cart_item (cart_id);

CREATE TABLE cart_item_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_item_id uuid NOT NULL REFERENCES cart_item (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES extra_service (id),
  quantity smallint NOT NULL CHECK (quantity > 0 AND quantity <= 20),
  UNIQUE (cart_item_id, service_id)
);
CREATE INDEX cart_item_extra_by_item ON cart_item_extra (cart_item_id);

-- The order: one code per beach club (ORD-YYMMDD-NNN, numbered under an advisory
-- lock like the booking codes), the orderer's name and email, the account when
-- there is one, and the total frozen at confirmation.
CREATE TABLE order_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beach_id uuid NOT NULL REFERENCES beach (id),
  code text NOT NULL,
  guest_name text NOT NULL CHECK (length(guest_name) BETWEEN 1 AND 120),
  guest_email text NOT NULL CHECK (guest_email = lower(guest_email) AND position('@' IN guest_email) > 1),
  user_id uuid REFERENCES app_user (id),
  locale text NOT NULL DEFAULT 'it',
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beach_id, code),
  UNIQUE (id, beach_id)
);
CREATE INDEX order_group_by_user ON order_group (user_id) WHERE user_id IS NOT NULL;

-- Each item of a confirmed order is an ordinary booking group that names it.
ALTER TABLE booking_group ADD COLUMN order_id uuid;
ALTER TABLE booking_group ADD CONSTRAINT booking_group_order_fk
  FOREIGN KEY (order_id, beach_id) REFERENCES order_group (id, beach_id);
CREATE INDEX booking_group_by_order ON booking_group (order_id) WHERE order_id IS NOT NULL;

-- One payment for the whole order (D46): it references the order and neither a
-- group nor a first-day booking. Every payment keeps naming a group OR an order.
ALTER TABLE payment ADD COLUMN order_id uuid;
ALTER TABLE payment ADD CONSTRAINT payment_order_fk
  FOREIGN KEY (order_id, beach_id) REFERENCES order_group (id, beach_id);
CREATE INDEX payment_by_order ON payment (order_id) WHERE order_id IS NOT NULL;
ALTER TABLE payment ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE payment ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE payment ADD CONSTRAINT payment_group_or_order CHECK (group_id IS NOT NULL OR order_id IS NOT NULL);
ALTER TABLE payment ADD CONSTRAINT payment_booking_or_order CHECK (booking_id IS NOT NULL OR order_id IS NOT NULL);

-- Tenant boundary as everywhere, plus the owner's read path (D47): with
-- app.user_id set and no beach context, the signed-in guest reads their own
-- carts, orders and the order payments. Writes stay beach-scoped only.
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_item_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_group ENABLE ROW LEVEL SECURITY;

CREATE POLICY cart_tenant ON cart TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY cart_owner_read ON cart FOR SELECT TO ombre_app
  USING (app_beach_id() IS NULL AND user_id = app_user_id());
CREATE POLICY cart_item_tenant ON cart_item TO ombre_app
  USING (EXISTS (SELECT 1 FROM cart c WHERE c.id = cart_item.cart_id AND c.beach_id = app_beach_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM cart c WHERE c.id = cart_item.cart_id AND c.beach_id = app_beach_id()));
CREATE POLICY cart_item_owner_read ON cart_item FOR SELECT TO ombre_app
  USING (app_beach_id() IS NULL AND EXISTS (SELECT 1 FROM cart c WHERE c.id = cart_item.cart_id AND c.user_id = app_user_id()));
CREATE POLICY cart_item_extra_tenant ON cart_item_extra TO ombre_app
  USING (EXISTS (SELECT 1 FROM cart_item i JOIN cart c ON c.id = i.cart_id WHERE i.id = cart_item_extra.cart_item_id AND c.beach_id = app_beach_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM cart_item i JOIN cart c ON c.id = i.cart_id WHERE i.id = cart_item_extra.cart_item_id AND c.beach_id = app_beach_id()));
CREATE POLICY cart_item_extra_owner_read ON cart_item_extra FOR SELECT TO ombre_app
  USING (app_beach_id() IS NULL AND EXISTS (SELECT 1 FROM cart_item i JOIN cart c ON c.id = i.cart_id WHERE i.id = cart_item_extra.cart_item_id AND c.user_id = app_user_id()));

-- Like booking_group: the order never updates from the application (no UPDATE).
CREATE POLICY order_group_tenant ON order_group TO ombre_app
  USING (beach_id = app_beach_id()) WITH CHECK (beach_id = app_beach_id());
CREATE POLICY order_group_owner_read ON order_group FOR SELECT TO ombre_app
  USING (app_beach_id() IS NULL AND user_id = app_user_id());
CREATE POLICY payment_owner_order_read ON payment FOR SELECT TO ombre_app
  USING (app_beach_id() IS NULL AND EXISTS (
    SELECT 1 FROM order_group o WHERE o.id = payment.order_id AND o.user_id = app_user_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON cart TO ombre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON cart_item TO ombre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON cart_item_extra TO ombre_app;
GRANT SELECT, INSERT ON order_group TO ombre_app;

-- A cart ticket names a cart, not a beach club: this finds the beach club,
-- like payment_request_beach for the /paga page.
CREATE FUNCTION cart_beach(p_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT beach_id FROM cart WHERE id = p_id $$;
REVOKE ALL ON FUNCTION cart_beach(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cart_beach(uuid) TO ombre_app;
