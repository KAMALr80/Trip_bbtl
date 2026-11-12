// Who may approve a waiting player, the same rule as trip_private.approve_member (QA-05): the
// Captain anyone; the Co-Captain anyone 18 or older. A missing age counts as under 18 on the server.
export function canApproveMember(myRole: string, ageRange: string | null | undefined): boolean {
  if (myRole === "captain") return true;
  return myRole === "co_captain" && (ageRange === "18–20" || ageRange === "21+");
}
