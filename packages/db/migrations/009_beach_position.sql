-- Optional geographic position of a beach club, set by its manager so the public
-- map can show it. A club without coordinates simply stays off the map.

ALTER TABLE beach
  ADD COLUMN latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  -- Either a full position or none: a lone coordinate would be meaningless.
  ADD CONSTRAINT beach_position_both_or_none CHECK ((latitude IS NULL) = (longitude IS NULL));

-- The manager updates the position of their own club. The beach_settings policy
-- (004) already limits every UPDATE on beach to the current beach club.
GRANT UPDATE (latitude, longitude) ON beach TO ombre_app;
