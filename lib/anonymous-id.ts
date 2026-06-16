const STORAGE_KEY = "anonymous_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function createAnonymousId() {
  return crypto.randomUUID();
}

export function getOrCreateAnonymousId() {
  if (typeof window === "undefined") return null;

  let id = window.localStorage.getItem(STORAGE_KEY);

  if (!id) {
    id = createAnonymousId();
    window.localStorage.setItem(STORAGE_KEY, id);
  }

  document.cookie = `${STORAGE_KEY}=${id}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;

  return id;
}
