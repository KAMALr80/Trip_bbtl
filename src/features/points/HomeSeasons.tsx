import { JourneyPhases } from "@/features/trip/JourneyPhases";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { TripFeedbackForm, useFeedbackDone } from "@/features/me/TripFeedback";

import {
  ActiveSeasonBoard,
  MysteryPrizes,
  tripHasEnded,
  useSeasonsData,
} from "@/features/points/Seasons";
import { type TripWithRole, type Member } from "@/lib/trips";
import { type PlayerWithAvatar } from "@/lib/player-cards";

export function HomeSeasons({
  trip,
  members,
  cards,
  userId,
  onMember,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  onMember: (id: string) => void;
}) {
  const data = useSeasonsData(trip.id);
  const [asking, setAsking] = useState(false);
  const [feedbackDone, setFeedbackDone] = useFeedbackDone(trip.id);
  const ended = tripHasEnded(trip) || !!trip.ended_at;
  return (
    <>
      <JourneyPhases trip={trip} members={members} cards={cards} userId={userId} />
      {ended && feedbackDone === false && !asking && (
        <Button variant="outline" className="mt-4 w-full min-h-11" onClick={() => setAsking(true)}>
          How was the trip? Tell the founder
        </Button>
      )}
      {asking && (
        <TripFeedbackForm
          trip={trip}
          onDone={() => {
            setAsking(false);
            setFeedbackDone(true);
          }}
        />
      )}
      <MysteryPrizes
        trip={trip}
        members={members}
        cards={cards}
        userId={userId}
        data={data}
        onMember={onMember}
      />
      <ActiveSeasonBoard trip={trip} members={members} cards={cards} userId={userId} />
    </>
  );
}
