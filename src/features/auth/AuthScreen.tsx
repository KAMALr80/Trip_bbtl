import { Brand } from "@/features/app-shell/chrome";

import { friendlyError } from "@/lib/friendly-error";

import { BrandLockup } from "@/components/BrandLockup";

import { useEffect, useRef, useState } from "react";

import { ArrowLeft, Eye, EyeOff, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

import cinematicLoginCoast from "@/assets/cinematic-login-coast-tall-768.jpg";
import cinematicLoginCoastLarge from "@/assets/cinematic-login-coast.jpg";

import { readPendingCode } from "@/lib/pending-code";
import { BetaCodeField } from "@/features/admin/BetaCodes";

import { LegalCheckbox } from "@/features/onboarding/LegalConsent";
import { LEGAL_VERSION } from "@/lib/legal";

export function AuthScreen({
  allowSignup = true,
  onExplore,
  onStory,
  onBetaSaved,
}: {
  onBetaSaved?: () => void;
  allowSignup?: boolean;
  onExplore: () => void;
  onStory: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [legalChecked, setLegalChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupDob, setSignupDob] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false),
    [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verifying, setVerifying] = useState("");
  async function emailAuth(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && (!legalChecked || !signupDob)) return;
    const ageAt = (y: number) =>
      new Date(signupDob) <= new Date(new Date().setFullYear(new Date().getFullYear() - y));
    const teenInvite = readPendingCode();
    if (mode === "signup" && !Number.isFinite(new Date(signupDob).getTime())) {
      e.preventDefault();
      setMessage("Check your birthday.");
      return;
    }
    if (mode === "signup" && !ageAt(13)) {
      e.preventDefault();
      setMessage("Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.");
      return;
    }
    const isTeen = mode === "signup" && !ageAt(18);
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const { data, error } =
      mode === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: {
                legal_version: LEGAL_VERSION,
                birthday: signupDob,
                ...(isTeen && teenInvite ? { teen_invite: teenInvite } : {}),
              },
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });
    if (error && /not confirmed/i.test(error.message)) {
      await supabase.auth.resend({ type: "signup", email });
      setVerifying(email);
    } else if (error) setMessage(`Oops, that didn't work: ${friendlyError(error)}`);
    else if (mode === "signup" && !data.session) setVerifying(email);
    else if (mode === "signup" && data.session) {
      await supabase.rpc("accept_legal", { p_version: LEGAL_VERSION });
      if (isTeen)
        await (supabase.rpc as unknown as (n: string, a: object) => Promise<unknown>)(
          "set_teen_dob",
          { p_dob: signupDob, p_agree: true, p_invite: teenInvite },
        );
      else await supabase.rpc("set_my_dob", { p_dob: signupDob, p_agree: true });
    }
    setBusy(false);
  }
  async function social(provider: "google") {
    setBusy(true);
    setMessage("");
    try {
      // Supabase redirects the browser to Google and back to this origin, where the session is
      // picked up from the URL. The Google provider and redirect URLs live in Supabase Auth settings.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        setMessage(
          `Google sign-in didn't work: ${friendlyError(error) || "please try again"}. You can also use email below.`,
        );
        setBusy(false);
      }
    } catch (error) {
      setMessage(
        `Google sign-in didn't work: ${friendlyError(error) || "please try again"}. Pop-ups may be blocked — try again or use email below.`,
      );
      setBusy(false);
    }
  }
  if (verifying)
    return (
      <VerifyCode
        email={verifying}
        onBack={() => {
          setVerifying("");
          setMode("signin");
        }}
      />
    );
  return (
    <main className={`cinematic-auth ${emailOpen ? "cinematic-auth-email" : ""}`}>
      <img
        className="cinematic-auth-scene"
        src={cinematicLoginCoast}
        srcSet={`${cinematicLoginCoast} 768w, ${cinematicLoginCoastLarge} 1024w`}
        sizes="(max-width: 520px) 100vw, 520px"
        alt="Five diverse friends cheering over a tropical coastal town at sunset"
        width={768}
        height={1366}
        fetchPriority="high"
      />
      <div className="cinematic-auth-content">
        <BrandLockup className="cinematic-auth-brand" />
        <div className="cinematic-auth-spacer">
          {!emailOpen && <p className="login-hook">Think you can out-travel your crew?</p>}
        </div>
        {emailOpen ? (
          <section
            className="cinematic-auth-form"
            aria-label={
              forgot
                ? "Reset your password"
                : mode === "signup"
                  ? "Sign up with email"
                  : "Sign in with email"
            }
          >
            <Button
              variant="ghost"
              className="cinematic-auth-back"
              onClick={() => {
                setEmailOpen(false);
                setForgot(false);
                setMessage("");
              }}
            >
              <ArrowLeft size={17} /> Back
            </Button>
            <h1>
              {forgot
                ? "Reset your password"
                : mode === "signup"
                  ? "Join the squad"
                  : "Welcome back"}
            </h1>
            {forgot ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                  } finally {
                    setMessage(
                      "If an account uses that email, a reset link is on its way. Check your inbox.",
                    );
                    setBusy(false);
                  }
                }}
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="Email address"
                  aria-label="Email address"
                />
                <Button type="submit" className="cinematic-auth-submit" disabled={busy}>
                  Send reset link
                </Button>
                <Button type="button" variant="link" onClick={() => setForgot(false)}>
                  Back to Log in
                </Button>
              </form>
            ) : (
              <>
                <form onSubmit={(e) => void emailAuth(e)}>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    aria-label="Email address"
                  />
                  <div className="cinematic-auth-password">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      aria-label="Password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  {mode === "signup" && (
                    <>
                      <label className="cinematic-auth-birthday">
                        Birthday
                        <input
                          type="date"
                          required
                          max={new Date().toISOString().slice(0, 10)}
                          value={signupDob}
                          onChange={(e) => setSignupDob(e.target.value)}
                        />
                        <small>
                          Saved once. Contact support to correct it later. Ages 13 and up can sign
                          up; 13–17 join a trip with their Captain's code and approval.
                        </small>
                      </label>
                      <LegalCheckbox checked={legalChecked} onChange={setLegalChecked} />
                    </>
                  )}
                  <Button type="submit" className="cinematic-auth-submit" disabled={busy}>
                    {busy ? "One sec..." : mode === "signup" ? "Sign up" : "Log in"}
                  </Button>
                </form>
                <div className="cinematic-auth-links">
                  {mode === "signin" && (
                    <Button
                      variant="link"
                      onClick={() => {
                        setForgot(true);
                        setMessage("");
                      }}
                    >
                      Forgot password?
                    </Button>
                  )}
                  {!allowSignup && onBetaSaved && (
                    <div className="w-full mt-3">
                      <BetaCodeField signedIn={false} onRedeemed={onBetaSaved} />
                    </div>
                  )}
                  {allowSignup && (
                    <Button
                      variant="link"
                      onClick={() => {
                        setMode(mode === "signin" ? "signup" : "signin");
                        setMessage("");
                      }}
                    >
                      {mode === "signin" ? "New here? Sign up" : "Already have an account? Log in"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>
        ) : (
          <div className="cinematic-auth-actions">
            <Button
              className="cinematic-auth-google"
              onClick={() => void social("google")}
              disabled={busy}
            >
              <span className="cinematic-google-g" aria-hidden="true">
                G
              </span>
              Continue with Google
            </Button>
            <Button
              className="cinematic-auth-email-button"
              onClick={() => {
                setEmailOpen(true);
                setForgot(false);
              }}
            >
              Sign in with email
            </Button>
            <div className="cinematic-auth-chips">
              <Button variant="outline" onClick={onExplore}>
                <Eye size={17} />
                Take a look around ›
              </Button>
              <Button variant="outline" onClick={onStory}>
                <BookOpen size={17} />
                Our story ›
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Need a hand?{" "}
              <a href="mailto:support@tripjunkies.app" className="underline">
                support@tripjunkies.app
              </a>
            </p>
          </div>
        )}
        {message && (
          <p role="status" className="cinematic-auth-message">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

export function MaskedEmail({ email }: { email: string }) {
  const [revealed, setRevealed] = useState(false);
  const [local, domain] = email.split("@");
  const masked = local && domain ? `${local[0]}•••@${domain}` : "";
  return (
    <Button
      variant="ghost"
      className="h-auto max-w-full min-w-0 p-0 justify-start text-sm text-muted-foreground font-normal"
      aria-label={revealed ? "Hide email" : "Reveal email"}
      onClick={() => setRevealed((v) => !v)}
    >
      <span className="truncate">{revealed ? email : masked}</span>
      {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
    </Button>
  );
}

export function VerifyCode({ email, onBack }: { email: string; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [cooldown, setCooldown] = useState(60);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  async function verify(code: string) {
    setBusy(true);
    setError("");
    setNote("");
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    setBusy(false);
    if (error) {
      setError(
        /expired/i.test(error.message)
          ? "That code expired ⏰ Tap Resend for a fresh one."
          : "Hmm, that code doesn't match 🙈 Double-check it and try again.",
      );
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
    }
  }
  function put(i: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split("").concat(Array(6).fill("")).slice(0, 6);
      setDigits(next);
      refs.current[Math.min(clean.length, 5)]?.focus();
      if (clean.length >= 6) void verify(clean.slice(0, 6));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    setError("");
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }
  async function resend() {
    setError("");
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) setError(`Couldn't resend just yet: ${friendlyError(error)}`);
    else {
      setNote("Fresh code on its way 💌");
      setCooldown(60);
    }
  }
  return (
    <main className="min-h-dvh max-w-lg mx-auto flex flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] cinematic-auth cinematic-auth-verify">
      <img
        className="cinematic-auth-scene"
        src={cinematicLoginCoast}
        srcSet={`${cinematicLoginCoast} 768w, ${cinematicLoginCoastLarge} 1024w`}
        sizes="(max-width: 520px) 100vw, 520px"
        alt=""
        width={768}
        height={1366}
      />
      <div className="flex items-center justify-between">
        <Button variant="ghost" className="-ml-3" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Brand />
      </div>
      <div className="mt-10 text-center">
        <div className="mx-auto grid place-items-center h-28 w-28 rounded-[2rem] bg-orange-soft text-6xl float-sticker">
          💌
        </div>
        <h1 className="font-display text-4xl font-extrabold mt-6">Check your email</h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          We sent a 6-digit code to
          <br />
          <span className="font-bold text-foreground break-all">{`${email.charAt(0)}•••@${email.split("@")[1] ?? ""}`}</span>
        </p>
      </div>
      <div className="mt-8 flex justify-center gap-2" role="group" aria-label="6-digit code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={i === 0 ? 6 : 1}
            aria-label={`Digit ${i + 1}`}
            disabled={busy}
            onChange={(e) => put(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className={`h-16 w-12 rounded-2xl border-2 bg-card text-center font-display text-3xl font-extrabold outline-none transition focus:border-primary focus:scale-105 ${error ? "border-destructive" : d ? "border-blue" : "border-border"}`}
          />
        ))}
      </div>
      {busy && (
        <p role="status" className="mt-4 text-center text-sm font-bold text-blue">
          Checking… ✨
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-center text-sm font-bold text-destructive">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-4 text-center text-sm font-bold text-green">
          {note}
        </p>
      )}
      <Button
        variant="outline"
        size="lg"
        className="mt-8 w-full bg-card border-2"
        disabled={cooldown > 0}
        onClick={() => void resend()}
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </Button>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Can't find it? Peek in spam or promotions.
      </p>
    </main>
  );
}
