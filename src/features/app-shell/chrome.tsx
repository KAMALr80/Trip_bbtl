import { BrandLockup } from "@/components/BrandLockup";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

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
  const t = useT();
  return (
    <div className="app-card mb-4 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-extrabold">{t("explorePrompt.title")}</h2>
        <Button variant="link" className="h-auto p-0 text-blue" onClick={onOpen}>
          {t("explorePrompt.open")} <ArrowRight size={16} />
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={onDismiss}>
        {t("common.gotIt")}
      </Button>
    </div>
  );
}
