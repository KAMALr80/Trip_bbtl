import { CaptainCrown } from "@/components/CaptainCrown";

import { ShortList } from "@/components/ShortList";

import { Button } from "@/components/ui/button";

import { CrewStandings } from "@/features/points/CrewStandings";
import { type TripWithRole, type Member } from "@/lib/trips";
import { Avatar, AvatarButton, RoleStamp } from "@/features/players/PlayerCards";
import { type PlayerWithAvatar } from "@/lib/player-cards";

import { WaitingToJoin } from "@/features/admin/BetaCodes";
import { dicebearUrl as betaAvatarUrl } from "@/lib/player-cards";

export function SquadView({
  trip,
  members,
  cards,
  userId,
  onMember,
  open,
  viewOnly = false,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  onMember: (id: string) => void;
  open: (value: string) => void;
  viewOnly?: boolean;
}) {
  const mine = cards.find((c) => c.user_id === userId);
  const membership = members.find((m) => m.user_id === userId);
  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[28px] font-extrabold">
          The <span className="text-blue">Squad</span>
        </h2>
        {!viewOnly && (
          <Button
            variant="outline"
            size="sm"
            className="text-primary border-primary"
            onClick={() => {
              import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
              open("Invite");
            }}
          >
            + Invite
          </Button>
        )}
      </div>
      {!viewOnly && <WaitingToJoin trip={trip} avatarUrl={(st, sd) => betaAvatarUrl(st, sd)} />}
      <div className="squad-neon-header rounded-[24px] border border-border p-5 mt-[14px] flex items-center gap-4">
        <span className="captain-avatar-wrap">
          <AvatarButton
            userId={userId}
            onOpen={onMember}
            url={mine?.avatarUrl}
            name={mine?.game_name || "Player"}
            className="h-[72px] w-[72px] rounded-[22px] border-2 border-foreground"
          />
          {membership?.role === "captain" && <CaptainCrown badge />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[22px] font-extrabold truncate">
            {mine?.game_name || "Player"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {membership?.role === "captain"
              ? "👑 Captain"
              : membership?.role === "co_captain"
                ? "★ Co-Captain"
                : "Player"}
          </p>
        </div>
      </div>
      <CrewStandings
        trip={trip}
        members={members}
        cards={cards}
        userId={userId}
        onMember={onMember}
      />
      <h2 className="mt-6 font-display text-xl font-extrabold">Squad players</h2>
      <div className="mt-[14px] space-y-2">
        <ShortList
          items={members.filter((m) => m.user_id !== userId)}
          id={`squad-members-${trip.id}`}
          scrollPanel={true}
          current={(m) => m.user_id === userId}
        >
          {(m) => {
            const card = cards.find((c) => c.user_id === m.user_id);
            return (
              <Button
                key={m.user_id}
                variant="outline"
                disabled={!card}
                data-view-navigation="true"
                onClick={() => {
                  import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
                  onMember(m.user_id);
                }}
                className="w-full h-auto min-h-16 justify-start gap-3 rounded-[18px] px-3 py-2 text-left"
              >
                <span className="captain-avatar-wrap">
                  <Avatar
                    url={card?.avatarUrl}
                    name={card?.game_name || "New player"}
                    className="h-[34px] w-[34px]"
                  />
                  {m.role === "captain" && <CaptainCrown badge />}
                </span>
                <span className="flex-1 font-bold truncate">
                  {card?.game_name || "Making their card…"}
                </span>
                <RoleStamp role={m.role} />
              </Button>
            );
          }}
        </ShortList>
      </div>
    </>
  );
}
