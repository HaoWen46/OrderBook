// utils/authStorage.js
export function saveSession(username, token, userObj) {
  // sessionStorage is scoped per‑tab, so each tab keeps its own user
  sessionStorage.setItem(`token_${username}`, token);
  sessionStorage.setItem(`user_${username}`, JSON.stringify(userObj));
}

export function loadSession(username) {
  const token = sessionStorage.getItem(`token_${username}`);
  const user  = JSON.parse(sessionStorage.getItem(`user_${username}`) || 'null');
  return { token, user };
}

export function clearSession(username) {
  sessionStorage.removeItem(`token_${username}`);
  sessionStorage.removeItem(`user_${username}`);
}
