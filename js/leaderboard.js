// js/leaderboard.js
//
// The leaderboard panel: opens from the header button, fetches
// /api/leaderboard every time it opens, and draws one row per player.

const leaderboardBtn = document.getElementById("leaderboard-btn");
const leaderboardPanel = document.getElementById("leaderboard-panel");
const leaderboardClose = document.getElementById("leaderboard-close");
const leaderboardList = document.getElementById("leaderboard-list");

async function loadLeaderboard() {
  leaderboardList.textContent = "Loading…";

  try {
    const result = await api("/api/leaderboard"); // BLANK 1

    leaderboardList.textContent = ""; // clear "Loading…"

    if (result.data.length === 0) {
      leaderboardList.textContent = "No players yet.";
      return;
    }

    for (const row of result.data) { // BLANK 2
      const li = document.createElement("li");
      li.className = "leaderboard-row";
      if (row.username === Auth.getUsername()) { // BLANK 3
        li.classList.add("leaderboard-row--me");
      }

      const rank = document.createElement("span");
      rank.className = "leaderboard-rank";
      rank.textContent = "#" + row.rank;

      const player = document.createElement("div");
      player.className = "leaderboard-player";

      const name = document.createElement("span");
      name.className = "leaderboard-name";
      name.textContent = row.username;

      const stats = document.createElement("span");
      stats.className = "leaderboard-stats";
      stats.textContent = `${row.zones_held} zones · ${row.votes_received} votes`;

      player.append(name, stats);

      const score = document.createElement("span");
      score.className = "leaderboard-score";
      score.textContent = row.score;

      li.append(rank, player, score);
      leaderboardList.appendChild(li);
    }
  } catch (err) {
    leaderboardList.textContent = "Couldn't load leaderboard: " + err.message;
  }
}

leaderboardBtn.addEventListener("click", () => {
  leaderboardPanel.classList.toggle("hidden"); // BLANK 4
  if (!leaderboardPanel.classList.contains("hidden")) {
    loadLeaderboard();
  }
});

leaderboardClose.addEventListener("click", () => {
  leaderboardPanel.classList.add("hidden");
});