"use strict";

const methods = {
  "dom-jepa": "DOM-JEPA",
  "occ-robust": "Occ-robust",
  "no-env": "JEPA w/o env",
  "action-head": "Action head",
  "time-series": "Time-series",
  gnn: "GNN-based",
};

const spongeBaselines = ["occ-robust", "no-env", "action-head", "time-series", "gnn"];
const scenes = {
  visible: {
    key: "sponge-visible",
    label: "visible sponge",
    description: "Pre-grasped sponge in full view.",
    baselines: spongeBaselines,
    initialBaseline: "occ-robust",
  },
  occluded: {
    key: "sponge-occluded",
    label: "occluded sponge",
    description: "A white strip temporarily occludes the pre-grasped sponge.",
    baselines: spongeBaselines,
    initialBaseline: "occ-robust",
    notes: {
      gnn: "The GNN trial stopped when the sponge slipped.",
      "time-series": "The time-series trial stopped to avoid overstretching the sponge.",
    },
  },
  cable: {
    key: "cable-target-",
    label: "cable",
    description: "The robot grasps the cable, then shapes it.",
    baselines: ["action-head", "no-env"],
    initialBaseline: "action-head",
  },
};

const state = { scene: "visible", target: "1", baseline: scenes.visible.initialBaseline };
const sceneButtons = Array.from(document.querySelectorAll("[data-scene]"));
const targetButtons = Array.from(document.querySelectorAll("[data-target]"));
const targetPicker = document.getElementById("target-picker");
const baselinePicker = document.getElementById("baseline-picker");
const baselineName = document.getElementById("baseline-name");
const sceneDescription = document.getElementById("scene-description");
const trialNote = document.getElementById("trial-note");
const proposedVideo = document.getElementById("proposed-video");
const baselineVideo = document.getElementById("baseline-video");
const videos = [proposedVideo, baselineVideo];
const trialButtons = new Map(videos.map((video) => [video, video.parentElement.querySelector(".trial-start")]));
const playBoth = document.getElementById("play-both");
const playBothLabel = document.getElementById("play-both-label");
const status = document.getElementById("video-status");
let videoRevision = 0;

function setStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

function updatePlayLabel() {
  const playing = videos.every((video) => !video.paused && !video.ended);
  playBothLabel.textContent = playing ? "Pause both" : "Play both";
  playBoth.querySelector(".play-icon").classList.toggle("pause-icon", playing);
}

function setTrialControls(video, active) {
  video.controls = active;
  const button = trialButtons.get(video);
  if (active && document.activeElement === button) video.focus({ preventScroll: true });
  button.setAttribute("aria-label", "Play " + video.getAttribute("aria-label"));
  button.hidden = active;
}

function playTrial(video) {
  setTrialControls(video, true);
  return video.play();
}

function setClip(video, stem, label) {
  const source = "assets/video/" + stem + ".mp4";
  video.setAttribute("aria-label", label);
  video.poster = "assets/img/" + stem + ".webp";
  if (video.getAttribute("src") !== source) {
    video.src = source;
    video.load();
  } else if (video.readyState > 0) {
    video.currentTime = 0;
  }

  const fallback = video.querySelector("a");
  fallback.href = source;
  fallback.textContent = "Download " + label;
  setTrialControls(video, false);
}

function renderComparison() {
  videoRevision += 1;
  videos.forEach((video) => video.pause());
  setStatus("");
  const scene = scenes[state.scene];
  const cable = state.scene === "cable";
  const key = cable ? scene.key + state.target : scene.key;
  const trial = cable ? "cable, target " + state.target : scene.label;

  sceneButtons.forEach((button) => button.setAttribute("aria-pressed", button.dataset.scene === state.scene));
  targetButtons.forEach((button) => button.setAttribute("aria-pressed", button.dataset.target === state.target));
  targetPicker.hidden = !cable;
  sceneDescription.textContent = scene.description;
  baselinePicker.replaceChildren(...scene.baselines.map((key) => new Option(methods[key], key)));
  baselinePicker.value = state.baseline;
  baselineName.textContent = methods[state.baseline];
  setClip(proposedVideo, key + "-dom-jepa", "DOM-JEPA trial on " + trial);
  setClip(baselineVideo, key + "-" + state.baseline, methods[state.baseline] + " trial on " + trial);
  trialNote.textContent = "Example trials at 8× speed.";
  if (scene.notes && scene.notes[state.baseline]) trialNote.textContent += " " + scene.notes[state.baseline];
  updatePlayLabel();
}

sceneButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const scene = button.dataset.scene;
    if (scene === state.scene) return;
    state.scene = scene;
    if (!scenes[scene].baselines.includes(state.baseline)) state.baseline = scenes[scene].initialBaseline;
    renderComparison();
  });
});

targetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (state.target === button.dataset.target) return;
    state.target = button.dataset.target;
    renderComparison();
  });
});

baselinePicker.addEventListener("change", () => {
  state.baseline = baselinePicker.value;
  renderComparison();
});

videos.forEach((video) => {
  setTrialControls(video, false);
  trialButtons.get(video).addEventListener("click", () => {
    setStatus("");
    const revision = videoRevision;
    playTrial(video).catch(() => {
      if (revision === videoRevision) setStatus("Use the individual playback controls if the trial did not start.");
    });
  });
  ["play", "pause", "ended", "emptied"].forEach((event) => video.addEventListener(event, updatePlayLabel));
  video.addEventListener("error", () => setStatus("One of the trial videos could not be loaded."));
});

playBoth.addEventListener("click", async () => {
  if (videos.every((video) => !video.paused && !video.ended)) {
    videos.forEach((video) => video.pause());
    return;
  }

  setStatus("");
  const revision = videoRevision;
  const times = videos.map((video) => video.currentTime);
  const restart = videos.some((video) => video.ended);
  if (restart || Math.abs(times[0] - times[1]) > .18) {
    const startTime = restart ? 0 : Math.min(...times);
    videos.forEach((video) => { video.currentTime = startTime; });
  }

  const results = await Promise.allSettled(videos.map(playTrial));
  if (revision === videoRevision && results.some((result) => result.status === "rejected")) {
    setStatus("Use the individual playback controls if either trial did not start.");
  }
});

const dialog = document.getElementById("media-dialog");
const dialogTitle = document.getElementById("media-dialog-title");
const dialogContent = document.getElementById("dialog-content");

function openMedia(title, content) {
  dialogTitle.textContent = title;
  dialogContent.replaceChildren(content);
  dialog.showModal();
}

document.querySelectorAll("[data-overview]").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !dialog.showModal) return;
    event.preventDefault();
    const overview = document.createElement("video");
    overview.controls = true;
    overview.playsInline = true;
    overview.src = link.href;
    overview.poster = "assets/img/cable-hero.webp";
    overview.setAttribute("aria-label", "Full experiment overview");
    openMedia("Experiment overview", overview);
    overview.play().catch(() => {});
  });
});

document.querySelectorAll("[data-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    const figure = button.querySelector("img");
    if (!dialog.showModal) {
      window.open(figure.src, "_blank", "noopener");
      return;
    }
    const enlarged = new Image();
    enlarged.src = figure.src;
    enlarged.alt = figure.alt;
    openMedia(button.dataset.zoom, enlarged);
  });
});

dialog.addEventListener("close", () => {
  const video = dialogContent.querySelector("video");
  if (video) video.pause();
  dialogContent.replaceChildren();
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

const sectionLinks = Array.from(document.querySelectorAll(".site-nav a"));
function updateNavigation() {
  sectionLinks.forEach((link) => {
    if (link.hash === window.location.hash) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}
window.addEventListener("hashchange", updateNavigation);
updateNavigation();
updatePlayLabel();
