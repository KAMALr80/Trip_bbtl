INSERT INTO public.game_cards (trip_id,game_number,category,prompt)
SELECT NULL,g.number,c.category,
CASE c.category
WHEN 'travel' THEN replace(t.prompt,'{topic}',g.name)
WHEN 'food' THEN replace(t.prompt,'{topic}',g.name)
WHEN 'childhood' THEN replace(t.prompt,'{topic}',g.name)
WHEN 'deep' THEN replace(t.prompt,'{topic}',g.name)
ELSE replace(t.prompt,'{topic}',g.name) END
FROM public.game_catalog g CROSS JOIN (VALUES ('travel'),('food'),('childhood'),('deep'),('spicy')) c(category)
CROSS JOIN (VALUES
(1,'{topic}: Pitch a surprising first stop in {destination}; let your squad improve it.'),
(2,'{topic}: Choose a local art form to try in {destination}; show how you would introduce it.'),
(3,'{topic}: Invent a one-hour walking game in {destination}; everyone adds a stop.'),
(4,'{topic}: Pick a greeting to learn in {destination}; invite someone to practice with you.'),
(5,'{topic}: Design a tiny souvenir you could make rather than buy in {destination}.'),
(6,'{topic}: Name a sound you hope to hear in {destination}; the squad guesses where.'),
(7,'{topic}: Choose a color for {destination}; defend it with a scene you imagine.'),
(8,'{topic}: Build a snack tasting challenge inspired by {destination}, with an allergy-friendly option.'),
(9,'{topic}: Recreate a favorite childhood game with a {destination} twist; explain the rules.'),
(10,'{topic}: Describe a moment you felt brave learning something new; invite another story.'),
(11,'{topic}: Pitch a group photo pose that tells a story about {destination}; act it out.'),
(12,'{topic}: Pick a song for arriving in {destination}; hum the opening and let everyone guess.'),
(13,'{topic}: Debate the boldest harmless activity to try in {destination}; swap sides halfway.'),
(14,'{topic}: Reveal an unexpected skill you could teach the squad in {destination}; demonstrate it.'),
(15,'{topic}: Plan a friendly challenge in {destination} that nobody must spend money to complete.'),
(16,'{topic}: Make a case for getting up early in {destination}; someone argues for sleeping in.'),
(17,'{topic}: Say what you would miss most about home while exploring {destination}; pass the mic.'),
(18,'{topic}: Act out a funny, harmless mix-up you might have in {destination}; squad solves it.'),
(19,'{topic}: Invent a one-sentence postcard from {destination}; everyone votes for the funniest.'),
(20,'{topic}: Choose between learning a new dance or painting a scene in {destination}; show a move.'),
(21,'{topic}: Tell a time a friend made an unfamiliar place feel welcoming; nominate their superpower.'),
(22,'{topic}: Pick an unusual but safe way to explore {destination} together; convince the squad.'),
(23,'{topic}: Challenge a friend to describe {destination} without naming sights, food or weather.'),
(24,'{topic}: Design a three-clue scavenger hunt about everyday design in {destination}.'),
(25,'{topic}: Give the squad a playful compliment you would put on a {destination} postcard.'),
(26,'{topic}: Name the most ambitious new hobby you could try on this trip; make a 30-second pitch.'),
(27,'{topic}: Which squad tradition would you retire and what new {destination} tradition replaces it?'),
(28,'{topic}: Defend an unpopular but harmless travel preference; invite a friendly rebuttal.'),
(29,'{topic}: What would you say yes to in {destination} that you normally shy away from?'),
(30,'{topic}: Pick one skill to learn from a willing local instructor; explain why it matters.')
) t(n,prompt)
WHERE (c.category='spicy' AND t.n BETWEEN 23 AND 30)
OR (c.category='travel' AND t.n BETWEEN 1 AND 12)
OR (c.category='food' AND t.n BETWEEN 8 AND 19)
OR (c.category='childhood' AND t.n BETWEEN 9 AND 20)
OR (c.category='deep' AND t.n BETWEEN 17 AND 28);