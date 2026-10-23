import { BrandLockup } from "@/components/BrandLockup";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Brand() {
  return <BrandLockup className="text-xl" compact />;
}

export function ExplorePrompt({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="app-card mb-4 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-extrabold">Explore the app ✨</h2>
        <Button variant="link" className="h-auto p-0 text-blue" onClick={onOpen}>
          See the tour <ArrowRight size={16} />
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={onDismiss}>
        Got it
      </Button>
    </div>
  );
}
