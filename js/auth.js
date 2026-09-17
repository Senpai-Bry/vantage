// js/auth.js
//
// Wires up the account panel in the header: logging in, signing up, and
// logging out. app.js doesn't touch any of this directly — it just
// listens for the "vantage:auth-changed" event (dispatched at the bottom
// of this file) to know when to re-check who's logged in.

const authForm = document.getElementById("auth-form");
const authUsernameInput = document.getElementById("auth-username");
const authPasswordInput = document.getElementById("auth-password");
const authLoginBtn = document.getElementById("auth-login-btn");
const authSignupBtn = document.getElementById("auth-signup-btn");
const authError = document.getElementById("auth-error");

const authLoggedOut = document.getElementById("auth-logged-out");
const authLoggedIn = document.getElementById("auth-logged-in");
const authUsernameDisplay = document.getElementById("auth-username-display");
const authLogoutBtn = document.getElementById("auth-logout-btn");

function announceAuthChanged() {
  document.dispatchEvent(new CustomEvent("vantage:auth-changed"));
}

function renderAuthPanel() {
  authError.textContent = "";

  if (Auth.isLoggedIn()) {
    authLoggedOut.classList.add("hidden");
    authLoggedIn.classList.remove("hidden");
    authUsernameDisplay.textContent = "Signed in as " + Auth.getUsername();
  } else {
    authLoggedOut.classList.remove("hidden");
    authLoggedIn.classList.add("hidden");
    authForm.reset();
  }
}

async function submitAuth(endpoint) {
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;
  authError.textContent = "";

  try {
    const data = await api(`/api/auth/${endpoint}`, {
      method: "POST",
      body: { username, password },
    });
    Auth.setSession(data.token, data.username);
    renderAuthPanel();
    announceAuthChanged();
  } catch (err) {
    authError.textContent = err.message;
  }
}

// The form's default submit button (Enter key, or clicking "Log in") logs
// in; "Sign up" is a plain button that submits to the other endpoint
// instead, using the same two fields.
authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth("login");
});

authSignupBtn.addEventListener("click", () => {
  submitAuth("signup");
});

authLogoutBtn.addEventListener("click", () => {
  Auth.clearSession();
  renderAuthPanel();
  announceAuthChanged();
});

renderAuthPanel();
