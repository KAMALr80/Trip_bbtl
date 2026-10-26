INSERT INTO public.at_home_pack_items(pack,category,title,body,adult)
SELECT p.pack,'question','Squad Question',replace(q.body,'{place}',p.place),false
FROM (VALUES ('japan','Japan'),('mexico','Mexico'),('thailand','Thailand')) p(pack,place)
CROSS JOIN (VALUES
('Which {place}-inspired color would you paint on a postcard, and why?'),
('Pick one food texture you would love to try in {place}; describe it in three words.'),
('What sound or music style from {place} would you like to learn more about?'),
('If you could learn one craft connected to {place}, what would you make?')) q(body);
INSERT INTO public.at_home_pack_items(pack,category,title,body,adult)
SELECT p.pack,'culture',a.title,replace(a.body,'{place}',p.place),false
FROM (VALUES ('japan','Japan'),('mexico','Mexico'),('thailand','Thailand')) p(pack,place)
CROSS JOIN (VALUES
('Paint A Postcard','Paint or sketch a colorful postcard inspired by a landscape in {place}; share it live.'),
('Try A Greeting','Learn one friendly greeting from a reputable {place} language guide and say it on the call.'),
('Dance A Minute','Find a family-friendly dance tutorial connected to {place}; learn one step together.'),
('Make A Pattern','Draw a simple repeating pattern inspired by {place} art, then explain your choices.')) a(title,body);