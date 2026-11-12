// The one question before a join request (N-2): the name the Captain sees while approving.
import { useT } from "@/i18n";
import { JOIN_NAME_MAX } from "@/lib/join-name";
import type { useJoinName } from "./use-join-name";

export function JoinNameField({
  name,
  className,
}: {
  name: ReturnType<typeof useJoinName>;
  className?: string;
}) {
  const t = useT();
  return (
    <label className="block text-xs font-extrabold text-muted-foreground">
      {t("join.nameLabel")}
      <input
        required
        autoComplete="name"
        maxLength={JOIN_NAME_MAX}
        value={name.value}
        onChange={(event) => name.onChange(event.target.value)}
        placeholder={t("join.namePlaceholder")}
        className={
          className ??
          "mt-2 w-full h-12 rounded-2xl border-2 border-border bg-background px-4 text-base font-normal text-foreground"
        }
      />
      <span className="mt-1 block font-normal">{t("join.nameHint")}</span>
    </label>
  );
}
