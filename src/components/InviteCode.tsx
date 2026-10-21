export function InviteCode({ code }: { code: string }) {
  return (
    <div className="flex justify-center gap-2" aria-label={`Join code ${code}`}>
      {code
        .slice(0, 8)
        .split("")
        .map((letter, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="invite-tile grid place-items-center font-display text-xl font-extrabold"
          >
            {letter}
          </span>
        ))}
    </div>
  );
}
