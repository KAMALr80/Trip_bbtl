-- M3-02 content admin: list and edit the content library, admins only, every save logged; kind and
-- source can't change and the table's checks still apply.
BEGIN;
\ir ../_helpers.psql
SELECT plan(13);
SELECT tests.create_user('admin', 40);
SELECT tests.create_user('alice', 30);
INSERT INTO public.app_admins (user_id) VALUES (tests.user_id('admin'));
-- An item whose text has no % or _ (the search strips them) so it can be found by its own words.
CREATE TEMP TABLE item AS SELECT id, kind, body, source_ref FROM public.content_items
WHERE kind = 'daily_card' AND active AND body !~ '[%_]' ORDER BY id LIMIT 1;
GRANT SELECT ON item TO PUBLIC;

SELECT tests.authenticate_as(tests.user_id('alice'));
SELECT throws_like($$SELECT * FROM public.admin_content_items()$$, 'Admins only', 'players can''t list content');
SELECT throws_like($$SELECT public.admin_save_content_item((SELECT id FROM item), '{"body": "Hacked"}')$$, 'Admins only',
                   'or edit it');
SELECT tests.authenticate_as_anon();
SELECT throws_ok($$SELECT * FROM public.admin_content_items()$$, '42501', NULL, 'signed-out visitors can''t call it at all');

SELECT tests.authenticate_as(tests.user_id('admin'));
SELECT is((SELECT count(*)::int FROM public.admin_content_items('daily_card') WHERE kind <> 'daily_card'), 0, 'filter by kind');
SELECT ok((SELECT count(*) FROM public.admin_content_items('daily_card')) BETWEEN 1 AND 50, 'one page of at most 50');
SELECT is((SELECT id FROM public.admin_content_items('daily_card', (SELECT body FROM item)) WHERE id = (SELECT id FROM item)),
          (SELECT id FROM item), 'search finds an item by its text');
SELECT is((SELECT body || '|' || reviewed::text || '|' || review_note
           FROM public.admin_save_content_item((SELECT id FROM item),
                                               '{"body": "Try one new snack today.", "reviewed": true, "review_note": "ok"}')),
          'Try one new snack today.|true|ok', 'an admin edits the wording and marks it reviewed');
SELECT is((SELECT kind || '|' || source_ref FROM public.admin_content_items('daily_card', (SELECT source_ref FROM item))
           WHERE id = (SELECT id FROM item)),
          'daily_card|' || (SELECT source_ref FROM item), 'other fields are kept (and the exact source_ref finds it)');
SELECT throws_like($$SELECT public.admin_save_content_item((SELECT id FROM item), '{"kind": "drop_bingo"}')$$,
                   'These can''t be edited here: kind', 'kind can''t change');
SELECT throws_like($$SELECT public.admin_save_content_item((SELECT id FROM item), '{"modes": ["moon"]}')$$, '%check%',
                   'the table''s tag checks still apply');
SELECT throws_like($$SELECT public.admin_save_content_item(gen_random_uuid(), '{"active": false}')$$, 'That item doesn''t exist',
                   'unknown items are refused');
SELECT is((SELECT count(*)::int FROM public.admin_content_items('daily_card', NULL, true) WHERE id = (SELECT id FROM item)), 1,
          'the reviewed filter finds it');
SELECT tests.clear_authentication();
SELECT is((SELECT action || ':' || note FROM public.admin_actions WHERE target_content = (SELECT id FROM item)),
          'edit_content:body, review_note, reviewed', 'the save is logged with the fields it changed');
SELECT * FROM finish();
ROLLBACK;
