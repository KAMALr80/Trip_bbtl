-- M6-04 photo-privacy audit, finding P2: every bucket accepted any file type and size. The app
-- re-encodes every photo to a small JPEG before upload (compressImage, which also drops EXIF), so
-- Storage now refuses anything that isn't an image or is over 5 MB. All buckets stay private.
-- rollback: UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL;
UPDATE storage.buckets
SET file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'],
    public = false
WHERE id IN ('trip-photos', 'quest-proofs', 'player-avatars', 'culture-photos', 'inspiration-photos',
             'window-guide', 'bug-screenshots');
