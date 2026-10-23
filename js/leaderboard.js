// js/leaderboard.js
//
// The leaderboard panel: opens from the header button, fetches
// /api/leaderboard every time it opens, and draws one row per player.
// Everything a player typed (their username) goes in with textContent,
// never innerHTML, so it can't run as code.

const leaderboardBtn = document.getElementById("leaderboard-btn");
const leaderboardPanel = document.getElementById("leaderboard-panel");
const leaderboardClose = document.getElementById("leaderboard-close");
const leaderboardList = document.getElementById("leaderboard-list");

// Small helper: make an element with a class and (optionally) some text.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function loadLeaderboard() {
  leaderboardList.textContent = "Loading…";

  try {
    const result = await api("/api/leaderboard");

    leaderboardList.textContent = ""; // clear "Loading…"

    if (result.data.length === 0) {
      leaderboardList.textContent = "No players yet.";
      return;
    }

    const me = Auth.getUsername();

    for (const row of result.data) {
      const isMe = row.username === me;

      // Your own row gets viewfinder corners (the "vf" class).
      const li = el("li", isMe ? "leaderboard-row leaderboard-row--me vf" : "leaderboard-row");

      const avatar = el("span", isMe ? "avatar avatar--me" : "avatar", row.username.charAt(0));

      const player = el("div", "leaderboard-player");
      const name = el("span", "leaderboard-name", row.username);
      if (isMe) name.append(" ", el("span", "leaderboard-you", "(you)"));
      const stats = el(
        "span",
        "film-caption",
        `${plural(row.zones_held, "zone")} · ${plural(row.votes_received, "vote")}`
      );
      player.append(name, stats);

      li.append(
        el("span", "leaderboard-rank", String(row.rank)),
        avatar,
        player,
        el("span", "leaderboard-score", String(row.score))
      );
      leaderboardList.appendChild(li);
    }
  } catch (err) {
    leaderboardList.textContent = "Couldn't load leaderboard: " + err.message;
  }
}

function openLeaderboard() {
  // On a phone the panels are bottom sheets, so close the zone panel first.
  if (isPhone.matches && activeZoneId) closePanel();
  leaderboardPanel.classList.remove("hidden");
  loadLeaderboard();
}

// Global on purpose: app.js calls this when a zone opens on a phone.
function closeLeaderboard() {
  leaderboardPanel.classList.add("hidden");
}

leaderboardBtn.addEventListener("click", () => {
  if (leaderboardPanel.classList.contains("hidden")) {
    openLeaderboard();
  } else {
    closeLeaderboard();
  }
});

leaderboardClose.addEventListener("click", closeLeaderboard);

// If you log in or out while it's open, re-draw it so "(you)" moves.
document.addEventListener("vantage:auth-changed", () => {
  if (!leaderboardPanel.classList.contains("hidden")) loadLeaderboard();
});
