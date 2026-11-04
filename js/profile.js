// js/profile.js
//
// Player profiles: the page at /u/<username> and the "Edit profile" window.
//
// The profile takes the explore screen's place while it's open (no page
// reload). Its address changes to /u/<username> so it can be shared and
// the browser's back button works. Any link with data-profile-link (made
// by profileLinkHTML() in api.js) opens one.
//
// Everything a player typed — bio, city, gear, usernames — goes through
// escapeHTML() before it's put on the page.

const profileView = document.getElementById("profile-view");
const profileBack = document.getElementById("profile-back");
const profileStatus = document.getElementById("profile-status");
const profileContent = document.getElementById("profile-content");

const accountProfileLink = document.getElementById("account-profile-link");
const accountEditProfile = document.getElementById("account-edit-profile");

const profileModal = document.getElementById("profile-modal");
const profileModalClose = document.getElementById("profile-modal-close");
const profileForm = document.getElementById("profile-form");
const profileFormAvatar = document.getElementById("profile-form-avatar");
const profileFormFile = document.getElementById("profile-form-file");
const profileFormRemove = document.getElementById("profile-form-remove");
const profileFormCity = document.getElementById("profile-form-city");
const profileFormGear = document.getElementById("profile-form-gear");
const profileFormBio = document.getElementById("profile-form-bio");
const profileFormBioCount = document.getElementById("profile-form-bio-count");
const profileFormError = document.getElementById("profile-form-error");
const profileFormCancel = document.getElementById("profile-form-cancel");
const profileFormSave = document.getElementById("profile-form-save");
const profileCityOptions = document.getElementById("profile-city-options");

let shownProfile = null; // the profile data currently on screen
let myProfile = null; // your own profile (for the header avatar + edit form)

const PIN_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
const CAMERA_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
const CALENDAR_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>';
const LINK_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const PENCIL_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

// ---------------------------------------------------------------------------
// 1. Opening and closing (and the /u/<username> address)
// ---------------------------------------------------------------------------

function profileNameFromPath(pathname) {
  const match = pathname.match(/^\/u\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

// push: false when the address already says /u/<username> (page load, or
// the back/forward buttons) — only clicks inside the app add a history step.
function openProfile(username, { push = true } = {}) {
  if (push) history.pushState({ profile: username, fromApp: true }, "", profilePath(username));

  // Panels belong to the explore screen; close them first.
  if (activeZoneId) closePanel();
  closeLeaderboard();
  hideMapPreview();

  document.body.classList.add("view-profile");
  profileView.classList.remove("hidden");
  profileView.scrollTop = 0;
  loadProfile(username);
}

function closeProfile() {
  document.body.classList.remove("view-profile");
  profileView.classList.add("hidden");
  shownProfile = null;
  document.title = "Vantage";
  // The map was hidden while the profile was up; make sure Leaflet knows
  // its size again.
  map.invalidateSize();
}

// "Explore" button: go back if you got here from inside the app (so the
// browser's history stays tidy), otherwise just head to the home page.
profileBack.addEventListener("click", () => {
  if (history.state && history.state.fromApp) {
    history.back();
  } else {
    history.replaceState(null, "", "/");
    closeProfile();
  }
});

// Back/forward buttons: show whatever the address says.
window.addEventListener("popstate", () => {
  const username = profileNameFromPath(location.pathname);
  if (username) {
    openProfile(username, { push: false });
  } else {
    closeProfile();
  }
});

// Any profile link anywhere in the app. Ctrl/Cmd-click still opens a new
// tab like a normal link.
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-profile-link]");
  if (!link || !link.dataset.profileLink) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof closeAccountMenu === "function") closeAccountMenu();
  openProfile(link.dataset.profileLink);
});

// ---------------------------------------------------------------------------
// 2. Loading and drawing a profile
// ---------------------------------------------------------------------------

async function loadProfile(username) {
  profileStatus.textContent = "Loading…";
  profileContent.innerHTML = "";
  try {
    const profile = await api(`/api/users/${encodeURIComponent(username)}`);
    // You clicked a different profile while this one was loading.
    if (profileNameFromPath(location.pathname) !== username) return;
    shownProfile = profile;
    if (profile.username === Auth.getUsername()) setMyProfile(profile);
    profileStatus.textContent = "";
    renderProfile();
  } catch (err) {
    profileStatus.textContent = "";
    profileContent.innerHTML = `
      <div class="profile-missing">
        <h1 class="display-title">Player not found</h1>
        <p class="panel-desc">${escapeHTML(err.message)}</p>
      </div>`;
    document.title = "Player not found · Vantage";
  }
}

function joinedText(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// (plural() lives in leaderboard.js.)

function renderProfile() {
  const profile = shownProfile;
  if (!profile) return;
  const isMe = profile.username === Auth.getUsername();
  document.title = `${profile.username} · Vantage`;

  profileContent.innerHTML = `
    <div class="profile-layout">
      <aside class="profile-side">
        ${identityCardHTML(profile, isMe)}
        ${factsHTML(profile)}
        <div class="profile-actions">
          ${isMe ? `<button type="button" class="outline-btn profile-action" data-action="edit">${PENCIL_ICON}Edit profile</button>` : ""}
          <button type="button" class="text-btn profile-action" data-action="copy">${LINK_ICON}<span>Copy profile link</span></button>
        </div>
      </aside>

      <div class="profile-main">
        ${aboutHTML(profile, isMe)}

        <section class="profile-section">
          <div class="section-head">
            <h2 class="display-subtitle">Turf held</h2>
            <span class="mono-label mono-label--dim">${plural(profile.heldZoneIds.length, "zone")}</span>
          </div>
          <ul id="profile-turf" class="card-grid profile-turf-grid"></ul>
        </section>

        <section class="profile-section">
          <div class="section-head">
            <h2 class="display-subtitle">Frames</h2>
            <span class="mono-label mono-label--dim">${plural(profile.photos.length, "photo")}</span>
          </div>
          ${framesHTML(profile, isMe)}
        </section>
      </div>
    </div>
  `;
  renderProfileTurf();
  fitProfileName();
  // Screen readers: say whose profile this is.
  profileView.setAttribute("aria-label", `${profile.username}'s profile`);
}

// Shrinks the name until it fits on one line (down to a floor), so a long
// username never breaks in the middle of a word. Past the floor it wraps.
function fitProfileName() {
  const nameEl = profileContent.querySelector(".profile-name");
  if (!nameEl) return;
  nameEl.style.fontSize = "";
  nameEl.style.whiteSpace = "nowrap";
  let size = parseFloat(getComputedStyle(nameEl).fontSize);
  while (nameEl.scrollWidth > nameEl.clientWidth && size > 18) {
    size -= 1;
    nameEl.style.fontSize = `${size}px`;
  }
  nameEl.style.whiteSpace = "";
}

window.addEventListener("resize", () => {
  if (shownProfile) fitProfileName();
});
// Once the brand font arrives, it's narrower than the fallback: re-fit.
if (document.fonts) document.fonts.ready.then(() => shownProfile && fitProfileName());

// Long usernames get a smaller font, so they stay on one line when they can.
function nameSizeClass(username) {
  if (username.length > 14) return " profile-name--xlong";
  if (username.length > 9) return " profile-name--long";
  return "";
}

// The card at the top left, like a host card on Airbnb: who they are on
// the left, their numbers on the right.
function identityCardHTML(profile, isMe) {
  const { stats } = profile;
  const rank = stats.rank ? `#${stats.rank}` : "—";
  return `
    <div class="profile-card">
      <div class="profile-card-id">
        <div class="profile-avatar vf${isMe ? "" : " vf--held"}">
          ${avatarHTML(profile.username, profile.avatarUrl, { size: "xl", me: isMe })}
        </div>
        <h1 class="profile-name${nameSizeClass(profile.username)}">${escapeHTML(profile.username)}</h1>
        ${stats.rank === 1 && stats.score > 0 ? '<span class="profile-badge">Top of the board</span>' : ""}
      </div>
      <dl class="profile-card-stats">
        <div class="profile-stat">
          <dt>Zones held</dt>
          <dd>${stats.zonesHeld}</dd>
        </div>
        <div class="profile-stat">
          <dt>Votes</dt>
          <dd>${stats.votesReceived}</dd>
        </div>
        <div class="profile-stat">
          <dt>Rank</dt>
          <dd>${rank}<span class="profile-stat-of">${stats.players ? ` of ${stats.players}` : ""}</span></dd>
        </div>
      </dl>
    </div>
  `;
}

function factsHTML(profile) {
  const facts = [];
  if (profile.homeCity) facts.push(`${PIN_ICON}<span>Based in <strong>${escapeHTML(profile.homeCity)}</strong></span>`);
  if (profile.gear) facts.push(`${CAMERA_ICON}<span>Shoots on <strong>${escapeHTML(profile.gear)}</strong></span>`);
  facts.push(`${CALENDAR_ICON}<span>Joined ${escapeHTML(joinedText(profile.joinedAt))}</span>`);
  return `<ul class="profile-facts">${facts.map((fact) => `<li>${fact}</li>`).join("")}</ul>`;
}

function aboutHTML(profile, isMe) {
  if (profile.bio) {
    return `
      <section class="profile-section profile-about">
        <h2 class="display-subtitle">About ${escapeHTML(profile.username)}</h2>
        <p class="profile-bio">${escapeHTML(profile.bio)}</p>
      </section>`;
  }
  if (isMe) {
    return `
      <section class="profile-section profile-about">
        <h2 class="display-subtitle">About you</h2>
        <div class="profile-empty">
          <p>Add a short bio, your home city and what you shoot on, so other players know who's behind the lens.</p>
          <button type="button" class="outline-btn" data-action="edit">Finish your profile</button>
        </div>
      </section>`;
  }
  return "";
}

// Their turf uses the exact same cards as the explore feed (cardHTML()
// from feed.js), drawn from the zone data app.js already has.
function renderProfileTurf() {
  const list = document.getElementById("profile-turf");
  if (!list || !shownProfile) return;
  const isMe = shownProfile.username === Auth.getUsername();
  const held = new Set(shownProfile.heldZoneIds);
  const heldZones = allZones().filter((zone) => held.has(zone.id));

  if (shownProfile.heldZoneIds.length === 0) {
    list.innerHTML = `<li class="profile-empty profile-empty--wide">${
      isMe
        ? "You don't hold any turf yet. Pick an open zone, go shoot it, and it's yours."
        : `${escapeHTML(shownProfile.username)} doesn't hold any turf right now.`
    }</li>`;
    return;
  }
  // Zones haven't loaded yet (the page opened straight on a profile).
  if (heldZones.length === 0) {
    list.innerHTML = '<li class="profile-empty profile-empty--wide">Loading turf…</li>';
    return;
  }
  list.innerHTML = heldZones.map(cardHTML).join("");
}

// Their photos, newest first. Each one opens its zone.
function framesHTML(profile, isMe) {
  if (profile.photos.length === 0) {
    return `<p class="profile-empty">${
      isMe ? "Photos you submit to zones will show up here." : "No frames yet."
    }</p>`;
  }
  return `
    <ul class="profile-frames">
      ${profile.photos
        .map(
          (photo) => `
        <li>
          <button type="button" class="profile-frame" data-zone-id="${escapeHTML(photo.zoneId)}" aria-label="Open ${escapeHTML(photo.zoneName)}">
            <span class="profile-frame-media${photo.holding ? ` vf${isMe ? "" : " vf--held"}` : ""}">
              <img src="${escapeHTML(photo.photoUrl)}" alt="Photo of ${escapeHTML(photo.zoneName)} by ${escapeHTML(profile.username)}" loading="lazy" />
              ${photo.holding ? `<span class="turf-submission-badge${isMe ? " turf-submission-badge--mine" : ""}">HOLDING</span>` : ""}
            </span>
            <span class="profile-frame-info">
              <span class="film-caption">#${String(photo.id).padStart(3, "0")} · ${escapeHTML(photo.zoneName)}</span>
              <span class="profile-frame-votes">${HEART_ICON} ${photo.voteCount}</span>
            </span>
          </button>
        </li>`
        )
        .join("")}
    </ul>`;
}

// Clicks inside the profile: a turf card or a photo opens that zone on the
// map; the action buttons edit or copy the link.
profileContent.addEventListener("click", async (event) => {
  if (event.target.closest("a")) return; // photo credits, profile links

  const action = event.target.closest("[data-action]");
  if (action) {
    if (action.dataset.action === "edit") openProfileModal();
    if (action.dataset.action === "copy") copyProfileLink(action);
    return;
  }

  const target = event.target.closest(".zone-card, .profile-frame");
  if (target && target.dataset.zoneId) openZoneFromProfile(target.dataset.zoneId);
});

function openZoneFromProfile(zoneId) {
  if (!zones[zoneId]) return;
  if (history.state && history.state.fromApp) {
    history.back(); // closes the profile (popstate)
  } else {
    history.replaceState(null, "", "/");
    closeProfile();
  }
  // On a phone/tablet, show the map so the zone has some context.
  if (isCompact.matches) setView("map");
  openPanel(zoneId);
}

async function copyProfileLink(button) {
  const url = location.origin + profilePath(shownProfile.username);
  const label = button.querySelector("span");
  try {
    await navigator.clipboard.writeText(url);
    label.textContent = "Link copied";
  } catch (_) {
    // Clipboard blocked: show the link so it can be copied by hand.
    label.textContent = url;
  }
  setTimeout(() => {
    if (label.isConnected) label.textContent = "Copy profile link";
  }, 2500);
}

// Zone data arrives (or changes after a vote): keep the turf cards fresh.
document.addEventListener("vantage:zones-changed", () => {
  if (shownProfile) renderProfileTurf();
});

// ---------------------------------------------------------------------------
// 3. Your own profile: header avatar + account menu
// ---------------------------------------------------------------------------

function setMyProfile(profile) {
  myProfile = profile;
  accountAvatar.className = profile.avatarUrl ? "avatar avatar--me avatar--img" : "avatar avatar--me";
  accountAvatar.innerHTML = profile.avatarUrl
    ? `<img src="${escapeHTML(profile.avatarUrl)}" alt="" />`
    : escapeHTML(profile.username.charAt(0));
}

async function loadMyProfile() {
  const username = Auth.getUsername();
  accountProfileLink.dataset.profileLink = username || "";
  accountProfileLink.href = username ? profilePath(username) : "/";
  if (!Auth.isLoggedIn() || !username) {
    myProfile = null;
    return;
  }
  try {
    setMyProfile(await api(`/api/users/${encodeURIComponent(username)}`));
  } catch (_) {
    // Not fatal: the header just keeps showing your initial.
  }
}

accountEditProfile.addEventListener("click", () => {
  closeAccountMenu();
  openProfileModal();
});

document.addEventListener("vantage:auth-changed", () => {
  loadMyProfile();
  if (shownProfile) renderProfile(); // the Edit button comes and goes
});

// ---------------------------------------------------------------------------
// 4. Edit profile window
// ---------------------------------------------------------------------------

let pendingAvatar = null; // a newly picked File, or "remove", or null
let pendingAvatarUrl = null; // a temporary preview URL for the picked file

function showFormAvatar(url) {
  const username = Auth.getUsername() || "";
  profileFormAvatar.className = url ? "avatar avatar--xl avatar--me avatar--img" : "avatar avatar--xl avatar--me";
  profileFormAvatar.innerHTML = url ? `<img src="${escapeHTML(url)}" alt="" />` : escapeHTML(username.charAt(0));
  profileFormRemove.classList.toggle("hidden", !url);
}

function updateBioCount() {
  profileFormBioCount.textContent = `${profileFormBio.value.length} / 160`;
}

async function openProfileModal() {
  if (!Auth.isLoggedIn()) return openAuthModal("login");
  if (!myProfile) await loadMyProfile();

  const profile = myProfile || {};
  profileForm.reset();
  profileFormError.textContent = "";
  pendingAvatar = null;
  if (pendingAvatarUrl) URL.revokeObjectURL(pendingAvatarUrl);
  pendingAvatarUrl = null;

  showFormAvatar(profile.avatarUrl);
  profileFormCity.value = profile.homeCity || "";
  profileFormGear.value = profile.gear || "";
  profileFormBio.value = profile.bio || "";
  updateBioCount();

  // Suggest the cities Vantage has zones in.
  const cities = [...new Set(allZones().map((zone) => zone.city).filter(Boolean))].sort();
  profileCityOptions.innerHTML = cities.map((city) => `<option value="${escapeHTML(city)}"></option>`).join("");

  profileModal.classList.remove("hidden");
  profileFormCity.focus();
}

function closeProfileModal() {
  profileModal.classList.add("hidden");
}

profileFormFile.addEventListener("change", () => {
  const file = profileFormFile.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    profileFormError.textContent = "That photo is over 5MB. Try a smaller one.";
    profileFormFile.value = "";
    return;
  }
  profileFormError.textContent = "";
  pendingAvatar = file;
  if (pendingAvatarUrl) URL.revokeObjectURL(pendingAvatarUrl);
  pendingAvatarUrl = URL.createObjectURL(file);
  showFormAvatar(pendingAvatarUrl);
});

profileFormRemove.addEventListener("click", () => {
  pendingAvatar = "remove";
  profileFormFile.value = "";
  showFormAvatar(null);
});

profileFormBio.addEventListener("input", updateBioCount);
profileModalClose.addEventListener("click", closeProfileModal);
profileFormCancel.addEventListener("click", closeProfileModal);
profileModal.addEventListener("click", (event) => {
  if (event.target === profileModal) closeProfileModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !profileModal.classList.contains("hidden")) closeProfileModal();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  profileFormError.textContent = "";
  profileFormSave.disabled = true;
  profileFormSave.textContent = "Saving…";

  const formData = new FormData();
  formData.append("homeCity", profileFormCity.value);
  formData.append("gear", profileFormGear.value);
  formData.append("bio", profileFormBio.value);
  if (pendingAvatar instanceof File) formData.append("avatar", pendingAvatar);
  if (pendingAvatar === "remove") formData.append("removeAvatar", "1");

  try {
    const profile = await api("/api/users/me", { method: "PUT", body: formData, auth: true });
    setMyProfile(profile);
    closeProfileModal();
    if (shownProfile && shownProfile.username === profile.username) {
      shownProfile = profile;
      renderProfile();
    }
    // Your new picture shows on the cards, leaderboard and photos too.
    announceProfileChanged();
  } catch (err) {
    profileFormError.textContent = err.message;
  } finally {
    profileFormSave.disabled = false;
    profileFormSave.textContent = "Save profile";
  }
});

// After saving, re-fetch the zones so cards pick up your new avatar.
async function announceProfileChanged() {
  try {
    const zoneList = await api("/api/zones");
    zoneList.forEach(renderZone);
    announceZonesChanged();
  } catch (_) {
    /* the next refresh will catch it */
  }
  if (activeZoneId) loadSubmissions(activeZoneId);
}

// ---------------------------------------------------------------------------
// 5. Start-up
// ---------------------------------------------------------------------------

loadMyProfile();

// Opened straight on a /u/<username> address (a shared link, or a reload).
const startingProfile = profileNameFromPath(location.pathname);
if (startingProfile) {
  history.replaceState({ profile: startingProfile, fromApp: false }, "", location.pathname);
  openProfile(startingProfile, { push: false });
}
