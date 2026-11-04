// js/auth.js
//
// Everything about who's logged in:
//   - the "Log in" / "Sign up" buttons in the header (logged out)
//   - the account pill + its little menu with "Log out" (logged in)
//   - the log in / sign up window (one window, two modes)
// app.js doesn't touch any of this directly — it just listens for the
// "vantage:auth-changed" event (dispatched below) to know when to re-check
// who's logged in, and calls openAuthModal() from its "Log in" prompt.

const authLoggedOut = document.getElementById("auth-logged-out");
const authLoggedIn = document.getElementById("auth-logged-in");
const authOpenLoginBtn = document.getElementById("auth-open-login");
const authOpenSignupBtn = document.getElementById("auth-open-signup");

const accountBtn = document.getElementById("account-btn");
const accountMenu = document.getElementById("account-menu");
const accountAvatar = document.getElementById("account-avatar");
const authUsernameDisplay = document.getElementById("auth-username-display");
const authLogoutBtn = document.getElementById("auth-logout-btn");

const authModal = document.getElementById("auth-modal");
const authModalTitle = document.getElementById("auth-modal-title");
const authModalSubtitle = document.getElementById("auth-modal-subtitle");
const authModalClose = document.getElementById("auth-modal-close");
const authForm = document.getElementById("auth-form");
const authUsernameInput = document.getElementById("auth-username");
const authPasswordInput = document.getElementById("auth-password");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authError = document.getElementById("auth-error");
const authSwitchText = document.getElementById("auth-switch-text");
const authSwitchBtn = document.getElementById("auth-switch-btn");

// The words that change between the two modes of the window.
const AUTH_MODES = {
  login: {
    title: "Log in",
    subtitle: "Welcome back. Your turf missed you.",
    submit: "Log in",
    switchText: "New to Vantage?",
    switchBtn: "Sign up",
    endpoint: "login",
    passwordAutocomplete: "current-password",
  },
  signup: {
    title: "Sign up",
    subtitle: "Pick a name. It's what the city will see on your turf.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchBtn: "Log in",
    endpoint: "signup",
    passwordAutocomplete: "new-password",
  },
};

let authMode = "login";

function announceAuthChanged() {
  document.dispatchEvent(new CustomEvent("vantage:auth-changed"));
}

// ---------------------------------------------------------------------------
// Header: which buttons show
// ---------------------------------------------------------------------------

function renderAuthPanel() {
  const loggedIn = Auth.isLoggedIn();
  authLoggedOut.classList.toggle("hidden", loggedIn);
  authLoggedIn.classList.toggle("hidden", !loggedIn);
  closeAccountMenu();

  if (loggedIn) {
    const username = Auth.getUsername();
    authUsernameDisplay.textContent = username;
    // Your initial for now; profile.js swaps in your profile picture once
    // it has loaded your profile.
    accountAvatar.className = "avatar avatar--me";
    accountAvatar.textContent = username.charAt(0);
  }
}

// ---------------------------------------------------------------------------
// Account menu
// ---------------------------------------------------------------------------

function closeAccountMenu() {
  accountMenu.classList.add("hidden");
  accountBtn.setAttribute("aria-expanded", "false");
}

accountBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const opening = accountMenu.classList.contains("hidden");
  accountMenu.classList.toggle("hidden", !opening);
  accountBtn.setAttribute("aria-expanded", String(opening));
});

// Clicking anywhere else closes the menu.
document.addEventListener("click", (event) => {
  if (!accountMenu.contains(event.target)) closeAccountMenu();
});

authLogoutBtn.addEventListener("click", () => {
  Auth.clearSession();
  renderAuthPanel();
  announceAuthChanged();
});

// ---------------------------------------------------------------------------
// Log in / sign up window
// ---------------------------------------------------------------------------

function setAuthMode(mode) {
  authMode = mode;
  const words = AUTH_MODES[mode];
  authModalTitle.textContent = words.title;
  authModalSubtitle.textContent = words.subtitle;
  authSubmitBtn.textContent = words.submit;
  authSwitchText.textContent = words.switchText;
  authSwitchBtn.textContent = words.switchBtn;
  authPasswordInput.setAttribute("autocomplete", words.passwordAutocomplete);
  authError.textContent = "";
}

// Global on purpose: app.js calls this from the zone panel's "Log in" button.
function openAuthModal(mode) {
  setAuthMode(mode);
  authForm.reset();
  authModal.classList.remove("hidden");
  authUsernameInput.focus();
}

function closeAuthModal() {
  authModal.classList.add("hidden");
}

authOpenLoginBtn.addEventListener("click", () => openAuthModal("login"));
authOpenSignupBtn.addEventListener("click", () => openAuthModal("signup"));
authModalClose.addEventListener("click", closeAuthModal);
authSwitchBtn.addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));

// Clicking the dark backdrop (but not the window itself) closes it.
authModal.addEventListener("click", (event) => {
  if (event.target === authModal) closeAuthModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!authModal.classList.contains("hidden")) closeAuthModal();
  closeAccountMenu();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;
  authError.textContent = "";
  authSubmitBtn.disabled = true;

  try {
    const data = await api(`/api/auth/${AUTH_MODES[authMode].endpoint}`, {
      method: "POST",
      body: { username, password },
    });
    Auth.setSession(data.token, data.username);
    closeAuthModal();
    renderAuthPanel();
    announceAuthChanged();
  } catch (err) {
    authError.textContent = err.message;
  } finally {
    authSubmitBtn.disabled = false;
  }
});

renderAuthPanel();
