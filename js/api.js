// js/api.js
//
// One small helper for talking to the backend, so app.js and auth.js don't
// each have to repeat "add the auth header, parse the JSON, handle errors"
// every time they call fetch().

const TOKEN_KEY = "vantage:token";
const USERNAME_KEY = "vantage:username";

const Auth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  getUsername() {
    return localStorage.getItem(USERNAME_KEY);
  },
  isLoggedIn() {
    return Boolean(this.getToken());
  },
  setSession(token, username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
  },
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  },
};

// api(path, { method, body, auth })
//   path   e.g. "/api/zones" or "/api/zones/goose-creek-high-school/submissions"
//   method defaults to "GET"
//   body   a plain object (sent as JSON) OR a FormData (sent as-is, for
//          photo uploads) — either way, just pass it and this figures out
//          which one it is.
//   auth   pass true to attach "Authorization: Bearer <token>"
//
// Resolves with the parsed JSON body on success (2xx). On failure, rejects
// with an Error whose .message is the server's own error string when it
// sent one (e.g. "Incorrect username or password."), so callers can show
// it directly to the user.
async function api(path, { method = "GET", body, auth = false } = {}) {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const headers = {};
  // Don't set Content-Type for FormData — the browser sets it itself,
  // including the multipart boundary string the server needs to parse it.
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = Auth.getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  // Every response from this API is JSON, success or failure, so this is
  // safe even for error statuses.
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Player avatars and profile links (used all over the app)
// ---------------------------------------------------------------------------
// These build little HTML strings, so everything a player typed goes
// through escapeHTML() (defined in app.js) first.

// A round avatar: their profile picture if they have one, otherwise the
// first letter of their name. size: "sm" (cards), "" (default), "xl"
// (profile page). me: true for your own (orange).
function avatarHTML(username, avatarUrl, { size = "", me = false } = {}) {
  const classes = ["avatar"];
  if (size) classes.push(`avatar--${size}`);
  if (me) classes.push("avatar--me");
  if (avatarUrl) {
    classes.push("avatar--img");
    return `<span class="${classes.join(" ")}"><img src="${escapeHTML(avatarUrl)}" alt="" loading="lazy" /></span>`;
  }
  return `<span class="${classes.join(" ")}" aria-hidden="true">${escapeHTML(String(username || "?").charAt(0))}</span>`;
}

// Where a player's profile lives: /u/<username>.
function profilePath(username) {
  return `/u/${encodeURIComponent(username)}`;
}

// A link to a player's profile. js/profile.js catches clicks on these
// (data-profile-link) and opens the profile without reloading the page.
function profileLinkHTML(username, text = username, className = "user-link") {
  return `<a class="${className}" href="${profilePath(username)}" data-profile-link="${escapeHTML(username)}">${escapeHTML(text)}</a>`;
}
