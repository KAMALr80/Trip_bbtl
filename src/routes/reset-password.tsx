import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — TripJunkies" },
      { name: "description", content: "Choose a new password for your TripJunkies account." },
      { property: "og:title", content: "Set a new password — TripJunkies" },
      {
        property: "og:description",
        content: "Choose a new password for your TripJunkies account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("type") !== "recovery") return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === "PASSWORD_RECOVERY") setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage("Passwords don't match.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage("This link couldn't be used. Request a new one from Log in.");
    else setDone(true);
  }
  return (
    <main className="min-h-dvh max-w-lg mx-auto px-[18px] py-10">
      <h1 className="font-display text-3xl font-extrabold">Set a new password</h1>
      {done ? (
        <>
          <p role="status" className="mt-5">
            You're all set. Your trip is waiting.
          </p>
          <Link to="/" className="inline-block mt-5 font-bold text-primary">
            Continue to TripJunkies →
          </Link>
        </>
      ) : ready ? (
        <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4">
          <label className="block font-bold">
            New password
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full h-12 rounded-2xl border border-border bg-card px-4"
            />
          </label>
          <label className="block font-bold">
            Confirm password
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 w-full h-12 rounded-2xl border border-border bg-card px-4"
            />
          </label>
          <Button type="submit" variant="playful" className="w-full" disabled={busy}>
            Save new password
          </Button>
        </form>
      ) : (
        <p className="mt-5 text-muted-foreground">
          This reset link isn't ready. Open the link from your latest reset email, or request a new
          one from Log in.
        </p>
      )}
      {message && (
        <p role="alert" className="mt-4 text-destructive">
          {message}
        </p>
      )}
      <Link to="/" className="inline-block mt-6 text-sm text-primary">
        Back to Log in
      </Link>
    </main>
  );
}
