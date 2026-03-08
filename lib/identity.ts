export function getOrCreateGuestUserId() {
  if (typeof window === "undefined") {
    return "guest-server";
  }

  const existing = window.localStorage.getItem("nagarwatch_guest_user_id");
  if (existing) {
    return existing;
  }

  const generated = `guest-${crypto.randomUUID()}`;
  window.localStorage.setItem("nagarwatch_guest_user_id", generated);
  return generated;
}
