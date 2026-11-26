// The three TripJunkies contacts (founder review, QA-B03): general, support and safety. Shared by the
// sign-in screen and the welcome splash so the two never list different addresses.
import { useT } from "@/i18n";

const CONTACTS = [
  ["general", "hello@tripjunkies.app"],
  ["support", "support@tripjunkies.app"],
  ["safety", "safety@tripjunkies.app"],
] as const;

export function ContactLinks({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <div className={`text-xs text-muted-foreground leading-relaxed ${className}`}>
      <p>{t("auth.contact.title")}</p>
      {CONTACTS.map(([key, email]) => (
        <p key={key}>
          {t(`auth.contact.${key}`)}:{" "}
          <a href={`mailto:${email}`} className="underline">
            {email}
          </a>
        </p>
      ))}
    </div>
  );
}
