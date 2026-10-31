// Me → Notifications (M4-07, R-801, R-812): reminders on this phone, push / email per type, quiet
// hours, and a test. On iPhone, push needs the app added to the Home Screen first.
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  useNotificationSettings,
  useSetNotificationPref,
  useSetQuietHours,
} from "@/data/notifications";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { sendTestNotification } from "@/lib/notifications.functions";
import { useInstall } from "@/pwa/install";
import { pushState, turnOffPush, turnOnPush, type PushState } from "@/pwa/push";

export function NotificationSettings({ onBack }: { onBack: () => void }) {
  const t = useT();
  const settings = useNotificationSettings();
  const setPref = useSetNotificationPref();
  const setQuiet = useSetQuietHours();
  const { platform, standalone } = useInstall();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void pushState().then(setPush);
  }, []);
  const rows = settings.data ?? [];
  const quietStart = rows[0]?.quiet_start?.slice(0, 5) ?? "22:00";
  const quietEnd = rows[0]?.quiet_end?.slice(0, 5) ?? "08:00";
  const needsInstall = platform === "ios" && !standalone;

  async function toggle(on: boolean) {
    setBusy(true);
    setMessage("");
    try {
      setPush(await (on ? turnOnPush() : turnOffPush()));
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage("");
    try {
      await sendTestNotification();
      setMessage(t("notifications.testSent"));
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pb-[var(--nav-clearance)]" aria-labelledby="notifications-title">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft /> {t("common.back")}
      </Button>
      <h1 id="notifications-title" className="font-display text-2xl font-extrabold mt-2">
        {t("notifications.title")}
      </h1>

      <section className="app-card mt-4" aria-label={t("notifications.thisPhone")}>
        <p className="font-bold">{t("notifications.thisPhone")}</p>
        {needsInstall ? (
          <p className="text-sm mt-1">{t("notifications.installFirst")}</p>
        ) : push === "unsupported" ? (
          <p className="text-sm mt-1">{t("notifications.unsupported")}</p>
        ) : push === "blocked" ? (
          <p className="text-sm mt-1">{t("notifications.blocked")}</p>
        ) : (
          <div className="flex items-center justify-between gap-3 mt-2">
            <label htmlFor="push-on" className="text-sm">
              {t("notifications.pushOn")}
            </label>
            <Switch
              id="push-on"
              checked={push === "on"}
              disabled={busy || push === null}
              onCheckedChange={(on) => void toggle(on)}
            />
          </div>
        )}
        {push === "on" && (
          <Button
            variant="outline"
            className="mt-3 min-h-11"
            disabled={busy}
            onClick={() => void test()}
          >
            {t("notifications.test")}
          </Button>
        )}
        {message && (
          <p className="text-xs mt-2" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="app-card mt-3" aria-label={t("notifications.quiet")}>
        <p className="font-bold">{t("notifications.quiet")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("notifications.quietHint")}</p>
        <div className="flex gap-3 mt-2">
          <label className="text-sm grid gap-1">
            {t("notifications.from")}
            <input
              type="time"
              className="rounded-md border bg-background p-2"
              defaultValue={quietStart}
              key={`s${quietStart}`}
              onBlur={(e) => setQuiet.mutate({ start: e.target.value, end: quietEnd })}
            />
          </label>
          <label className="text-sm grid gap-1">
            {t("notifications.to")}
            <input
              type="time"
              className="rounded-md border bg-background p-2"
              defaultValue={quietEnd}
              key={`e${quietEnd}`}
              onBlur={(e) => setQuiet.mutate({ start: quietStart, end: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="app-card mt-3" aria-label={t("notifications.types")}>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-3">
          <p className="font-bold">{t("notifications.types")}</p>
          <p className="text-xs font-bold">{t("notifications.push")}</p>
          <p className="text-xs font-bold">{t("notifications.email")}</p>
          {rows.map((r) => (
            <TypeRow
              key={r.type}
              label={r.label}
              push={r.push}
              email={r.email}
              onChange={(p, e) => setPref.mutate({ type: r.type, push: p, email: e })}
            />
          ))}
        </div>
        {(setPref.error || setQuiet.error) && (
          <p className="text-xs text-destructive mt-2" role="alert">
            {friendlyError(setPref.error ?? setQuiet.error)}
          </p>
        )}
      </section>
    </main>
  );
}

function TypeRow({
  label,
  push,
  email,
  onChange,
}: {
  label: string;
  push: boolean;
  email: boolean;
  onChange: (push: boolean, email: boolean) => void;
}) {
  const t = useT();
  return (
    <>
      <span className="text-sm">{label}</span>
      <Switch
        checked={push}
        aria-label={t("notifications.pushFor", { label })}
        onCheckedChange={(on) => onChange(on, email)}
      />
      <Switch
        checked={email}
        aria-label={t("notifications.emailFor", { label })}
        onCheckedChange={(on) => onChange(push, on)}
      />
    </>
  );
}
