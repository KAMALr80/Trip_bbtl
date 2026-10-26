import { ArrowRight, Backpack, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modes, type PlayArrangement } from "@/lib/play-arrangement";
import { RoomPriceNote } from "@/lib/prices";

const icons = { solo: Backpack, online: Users, offline: Smartphone };
export function PlayingChoice({
  onChoose,
  exclude = [],
  price,
}: {
  onChoose: (mode: PlayArrangement) => void;
  exclude?: PlayArrangement[];
  price?: "window" | "culture" | "trip";
}) {
  return (
    <>
      <div className="grid gap-3 mt-5">
        {modes
          .filter((m) => !exclude.includes(m.id))
          .map((item) => {
            const Icon = icons[item.id];
            return (
              <Button
                key={item.id}
                type="button"
                variant="outline"
                className="min-h-24 h-auto w-full justify-start whitespace-normal text-left gap-4 p-4"
                onClick={() => onChoose(item.id)}
              >
                <Icon size={28} className="shrink-0 text-primary" />
                <span className="flex-1 min-w-0">
                  <strong className="block text-base">{item.title}</strong>
                  <span className="block text-sm text-muted-foreground font-normal">
                    {item.line}
                  </span>
                </span>
                <ArrowRight size={18} className="shrink-0" />
              </Button>
            );
          })}
      </div>
      {price && <RoomPriceNote room={price} />}
    </>
  );
}
