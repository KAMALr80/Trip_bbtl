-- inspiration-photos: pin the uploader into the file path, matching culture-photos.
-- Path becomes  <card_id>/<uploader_id>/<random>.<ext>  (was <card_id>/<random>.<ext>).
-- Only the card's creator could ever upload, so this changes no one's access today;
-- it makes "who uploaded this file" provable from the path itself.
-- Safe to run now: the bucket holds 0 files and there are 0 inspiration cards.
-- Reads keep using the stored photo_path, and trip deletion cleans up with the admin
-- key, so neither is affected.

-- Upload: still only the card's creator, on a live card with the feature on,
-- and now only into their own folder.
DROP POLICY IF EXISTS inspiration_photo_upload ON storage.objects;
CREATE POLICY inspiration_photo_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'inspiration-photos'
  AND lower(name) ~ '\.(jpe?g|png|webp)$'
  AND split_part(name, '/', 2) = (auth.uid())::text
  AND CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    THEN EXISTS (SELECT 1 FROM public.cultural_inspirations c
                 WHERE c.id = (split_part(name, '/', 1))::uuid
                   AND c.creator_id = auth.uid()
                   AND c.hidden_at IS NULL
                   AND trip_private.feature_on(c.trip_id, 'inspiration'))
    ELSE false END
);

-- Delete: you must own the card AND the file has to sit in your own folder.
DROP POLICY IF EXISTS inspiration_photo_remove ON storage.objects;
CREATE POLICY inspiration_photo_remove ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'inspiration-photos'
  AND split_part(name, '/', 2) = (auth.uid())::text
  AND CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    THEN EXISTS (SELECT 1 FROM public.cultural_inspirations c
                 WHERE c.id = (split_part(name, '/', 1))::uuid
                   AND c.creator_id = auth.uid())
    ELSE false END
);

-- Viewing is unchanged: the card id is still the first folder, so the existing
-- member / reveal-date / Preview rules keep applying exactly as before.
