-- Bookings made at the front desk: same inventory and same rules as the website,
-- no email required, paid at the desk.

ALTER TABLE booking ALTER COLUMN guest_email DROP NOT NULL;
ALTER TABLE booking ADD COLUMN source text NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'desk'));
ALTER TABLE booking ADD CONSTRAINT booking_online_has_email CHECK (source = 'desk' OR guest_email IS NOT NULL);
GRANT UPDATE ON pass TO ombre_app;
