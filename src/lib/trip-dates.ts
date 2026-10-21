export function friendlyDate(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function friendlyRange(start: string, end: string) {
  return `${friendlyDate(start)} – ${friendlyDate(end)}`;
}