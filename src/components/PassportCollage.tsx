export function PassportCollage() {
  const stamps = [
    { text: "✈ TAKEOFF", color: "border-primary text-primary", position: "left-[9%] top-[12%] -rotate-12" },
    { text: "◉ EXPLORE", color: "border-blue text-blue", position: "right-[8%] top-[10%] rotate-12" },
    { text: "★ SQUAD", color: "border-orange text-orange", position: "left-[26%] top-[36%] rotate-6" },
    { text: "✳ MEMORY", color: "border-green text-green", position: "left-[6%] bottom-[9%] rotate-12" },
    { text: "✈ LET'S GO", color: "border-primary text-primary", position: "right-[7%] bottom-[12%] -rotate-6" },
  ];
  return <div aria-label="A collage of colorful passport stamps" role="img" className="relative h-64 w-full overflow-hidden rounded-[24px] border border-border bg-card">
    {stamps.map(stamp => <span key={stamp.text} className={`passport-stamp absolute grid h-20 w-28 place-items-center rounded-[50%] border-[2.5px] bg-card font-display text-sm font-extrabold ${stamp.color} ${stamp.position}`}>{stamp.text}</span>)}
  </div>;
}