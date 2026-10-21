-- M1-11: content from the tables being retired, shaped as candidates for the M3 content library
-- (content_items, dev-docs/04 §2.3). The suggested_* columns are a starting point for the founder's
-- review, not decisions. Run through scripts/content/export-candidates.sh.
COPY (
  SELECT * FROM (
    -- Talk / trivia cards (old game nights) → Games on the Flight; cards with an answer can also be
    -- Daily Card questions.
    SELECT 'game_cards' AS source, id::text AS source_ref,
           CASE WHEN answer IS NOT NULL THEN 'daily_card' ELSE 'flight_game' END AS suggested_kind,
           'trip,window_seat,explore_culture,show_culture,game_night' AS suggested_rooms,
           'trip,at_home,solo' AS suggested_modes,
           NULL::text AS suggested_focus, NULL::text AS culture, category,
           NULL::text AS title, prompt AS body, answer AS extra,
           CASE WHEN category = 'spicy' THEN 18 ELSE 13 END AS min_age, false AS alcohol,
           CASE WHEN category = 'spicy' THEN 'spicy deck: check wording for 18+' END AS review_note
    FROM public.game_cards WHERE trip_id IS NULL
    UNION ALL
    SELECT 'game_catalog', number::text, 'flight_game', 'game_night,trip', 'trip,at_home', NULL, NULL,
           'game', name, how_to_play,
           concat_ws(' | ', 'twist: ' || twist, 'win: ' || how_to_win, 'prep: ' || prep),
           13, false, 'a whole game: candidate for the one-night Game Night room (R-008)'
    FROM public.game_catalog
    UNION ALL
    SELECT 'game_format_prompts', id::text, 'flight_game', 'trip,window_seat,game_night', 'trip,at_home,solo',
           NULL, NULL, format || ' / ' || depth, title, prompt, icon, 13, false, NULL
    FROM public.game_format_prompts
    UNION ALL
    -- Question of the Week → Daily Discovery question days / Daily Card.
    SELECT 'weekly_question_pool', id::text, 'daily_card', 'trip,window_seat,explore_culture,show_culture',
           'trip,at_home,solo', NULL, NULL, CASE WHEN spicy THEN 'spicy' ELSE 'question' END, NULL, prompt, NULL,
           CASE WHEN spicy THEN 18 ELSE 13 END, false, CASE WHEN spicy THEN 'spicy: check wording for 18+' END
    FROM public.weekly_question_pool
    UNION ALL
    -- Mission and quest cards. kind: trip = Airport Missions, home = Home Missions / Showcase,
    -- checkin = old Early Check-In tasks (fit sealed quests), solo = Window Seat guide quests.
    SELECT 'security_missions', id::text,
           CASE kind WHEN 'trip' THEN 'airport_mission' WHEN 'home' THEN
                       CASE WHEN presentation_tag IN ('trip_meetup', 'at_home_finale') THEN 'showcase' ELSE 'home_mission' END
                     WHEN 'checkin' THEN 'sealed_quest' ELSE 'trip_quest' END,
           CASE kind WHEN 'trip' THEN 'trip' WHEN 'home' THEN 'explore_culture,show_culture'
                     WHEN 'solo' THEN 'window_seat' ELSE 'trip,window_seat,explore_culture,show_culture' END,
           CASE kind WHEN 'trip' THEN 'trip' WHEN 'home' THEN 'at_home' WHEN 'solo' THEN 'solo' ELSE 'trip,at_home,solo' END,
           NULL, NULL, category, title, text,
           concat_ws(' | ', nullif(backstory, ''), 'insight: ' || nullif(insight, ''), 'budget: ' || budget_note,
                     'keywords: ' || array_to_string(keywords, ', ')),
           13, category ILIKE '%adult%', CASE WHEN kind = 'solo' THEN 'Window Seat daily quest (R-351)' END
    FROM public.security_missions WHERE trip_id IS NULL
    UNION ALL
    -- At Home culture packs → Explore a Culture: prep items become Home Missions, facts Daily Discovery.
    SELECT 'at_home_pack_items', id::text,
           CASE WHEN category IN ('question', 'trivia') THEN 'daily_card'
                WHEN category IN ('culture', 'phrase') THEN 'daily_discovery' ELSE 'home_mission' END,
           'explore_culture,show_culture', 'at_home',
           CASE category WHEN 'dish' THEN 'Food & drink' WHEN 'snack' THEN 'Food & drink' WHEN 'starter' THEN 'Food & drink'
                         WHEN 'order_in' THEN 'Food & drink' WHEN 'playlist' THEN 'Music & dance'
                         WHEN 'phrase' THEN 'Language & slang' WHEN 'dress_up' THEN 'Fashion & dress'
                         WHEN 'movie' THEN 'Film & pop culture' WHEN 'build' THEN 'Art & crafts'
                         WHEN 'culture' THEN 'Holidays & traditions' END,
           pack, category, title, body,
           concat_ws(' | ', 'want: ' || want, 'alt: ' || alt, nullif(backstory, '')),
           CASE WHEN adult THEN 21 ELSE 13 END, adult, CASE WHEN adult THEN 'adult item: 21+ / alcohol tag' END
    FROM public.at_home_pack_items
  ) c ORDER BY source, suggested_kind, source_ref
) TO STDOUT WITH (FORMAT csv, HEADER true);
