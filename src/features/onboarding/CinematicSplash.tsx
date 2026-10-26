import { useState } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION } from "@/lib/app-version";

export function CinematicSplash({ failed, onLogin }: { failed: boolean; onLogin: () => void }) {
  const [report, setReport] = useState<"idle" | "sending" | "sent" | "signin" | "failed">("idle");
  async function sendReport() {
    setReport("sending");
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setReport("signin");
        return;
      }
      const { error } = await supabase.from("bug_reports").insert({
        user_id: data.user.id,
        trip_id: null,
        page: "Splash · Can't connect",
        description: "App did not finish loading before the connection screen appeared.",
        screenshot_path: null,
        user_agent: navigator.userAgent.slice(0, 400),
        app_version: APP_VERSION,
      });
      setReport(error ? "failed" : "sent");
    } catch {
      setReport("failed");
    }
  }
  return (
    <main
      className={`cinematic-splash ${failed ? "cinematic-splash-failed" : ""}`}
      aria-busy={!failed}
    >
      <div className="cinematic-splash-inner">
        <BrandLockup className="cinematic-splash-brand" />
        {failed ? (
          <div className="cinematic-splash-error">
            <p className="cinematic-splash-board">FLIGHT TJ000 · CAN'T CONNECT</p>
            <h1>We couldn't take off</h1>
            <p>Check your connection and try again. Your trips and stamps are safe.</p>
            <div className="cinematic-splash-actions">
              <Button className="cinematic-splash-retry" onClick={() => window.location.reload()}>
                Try again
              </Button>
              <Button className="cinematic-splash-back" onClick={onLogin}>
                Back to login
              </Button>
            </div>
            <Button
              variant="link"
              className="cinematic-splash-report"
              onClick={() => void sendReport()}
              disabled={report === "sending"}
            >
              ⚑ {report === "sending" ? "Sending…" : "Report this problem"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Need a hand?{" "}
              <a href="mailto:support@tripjunkies.app" className="underline">
                support@tripjunkies.app
              </a>
            </p>
            {report !== "idle" && report !== "sending" && (
              <p role="status" className="cinematic-splash-report-status">
                {report === "sent"
                  ? "Thanks — the founder has it."
                  : report === "signin"
                    ? "Sign in first to send a report to the founder."
                    : "Couldn't send the report. Please try again."}
              </p>
            )}
          </div>
        ) : (
          <div className="cinematic-splash-flight" aria-hidden="true">
            <span className="cinematic-splash-arc" />
            <span className="cinematic-splash-plane">✈</span>
            <span className="cinematic-splash-progress" />
          </div>
        )}
      </div>
    </main>
  );
}
