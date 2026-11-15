export function getFirstName(fullName?: string): string {
  if (!fullName) return "User";
  return fullName.split(" ")[0];
}

export function getAccountDisplayName(user?: { name?: string; email?: string }): string {
  if (!user) return "Account";
  return user.name || user.email || "Account";
}

export function useLoginGreeting(user?: { name?: string }): string {
  const name = getFirstName(user?.name);
  return \Welcome back, \!\;
}
