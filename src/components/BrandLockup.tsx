/** The one public-facing brand signature. Scaling never changes its copy or proportions. */
export function BrandLockup({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return <div className={`brand-lockup font-display text-center ${className}`} aria-label="TripJunkies trademark. Collect the world with your squad.">
    <div className="brand-lockup-name font-extrabold leading-none"><span className="night-word-trip">Trip</span><span className="night-word-junkies">Junkies</span><sup className="brand-trademark">™</sup></div>
    <p className={`brand-lockup-tagline font-medium text-muted-foreground ${compact ? "text-[9px]" : "text-xs"}`}>Collect the world with your squad.</p>
  </div>;
}