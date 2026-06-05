/**
 * Interactive hands-on guide — user performs each action before continuing.
 */
(function () {
  const overlay = document.getElementById("tour-overlay");
  const spotlight = document.getElementById("tour-spotlight");
  const card = document.getElementById("tour-card");
  const titleEl = document.getElementById("tour-title");
  const messageEl = document.getElementById("tour-message");
  const skipFloat = document.getElementById("tour-skip-float");
  const nextBtn = document.getElementById("tour-next");

  let running = false;
  let stepIndex = 0;
  let tutorialProject = null;
  let currentTargetEl = null;
  let currentMultiTargets = null;
  let currentMultiGroups = null;
  let currentStepMultiSpotlight = false;
  let refreshScheduled = false;
  let currentCardPlacement = "docked";
  let pendingWaitActions = null;
  let completedWaitActions = new Set();
  let autoAdvanceTimer = null;
  let currentStepAutoAdvance = false;
  let advancingStep = false;
  let followingDoneAnimation = false;
  let followingAddedTaskHighlight = false;
  let followingDeleteToNotes = false;
  let followingDeleteTransition = false;
  let skipNotesScrollOnEnter = false;
  let skipMarkDoneSpotlightOnEnter = false;
  let skipMarkDoneScrollOnEnter = false;
  let markDoneTourTarget = null;
  let deleteStepPhase = 0;
  let currentDeleteAnchor = null;
  let finishing = false;

  const AUTO_ADVANCE_PAUSE_MS = 400;
  const MARK_DONE_STEP_INDEX = 3;
  const ADD_TASK_STEP_INDEX = 2;
  const DELETE_STEP_INDEX = 5;
  const MARK_DONE_COMPLETING_TRACK_MS = 600;
  const MARK_DONE_ARRIVE_TRACK_MS = 560;
  const MARK_DONE_TO_LIST_MS = 520;
  const MARK_DONE_LIST_HIGHLIGHT_MS = 900;
  const ADD_TASK_HIGHLIGHT_MS = 1100;
  const ADD_TASK_TO_LIST_MS = 520;
  const ADD_TASK_LIST_HIGHLIGHT_MS = 950;
  const ADD_TASK_LIST_TO_DONE_MS = 500;
  const PAUSE_BEFORE_DRAG_STEP_MS = 700;
  const DELETE_TO_NOTES_TRANSITION_MS = 580;
  const DELETE_BTN_FOCUS_MS = 480;
  const DELETE_REMOVE_TRACK_MS = 480;
  const DELETE_DONE_TO_TODO_MS = 580;
  const MULTI_SPOTLIGHT_PAD = 12;
  const FOUR_PART_OUTLINE_GAP = 10;
  const TOUR_MASK_NS = "http://www.w3.org/2000/svg";

  const spotlightEls = [spotlight];
  let tourMaskSvg = null;
  let tourMaskDimRect = null;
  let tourMaskDef = null;

  function ensureSpotlightCount(count) {
    while (spotlightEls.length < count) {
      const el = document.createElement("div");
      el.className = "tour-spotlight hidden";
      el.setAttribute("aria-hidden", "true");
      overlay.insertBefore(el, card);
      spotlightEls.push(el);
    }
  }

  function hideExtraSpotlights(fromIndex) {
    for (let i = fromIndex; i < spotlightEls.length; i++) {
      spotlightEls[i].classList.add("hidden");
    }
  }

  function hideAllSpotlights() {
    spotlightEls.forEach((el) => el.classList.add("hidden"));
  }

  function normalizeHighlightGroup(group) {
    if (!group) return [];
    if (group.elements) {
      return group.elements.filter((el) => el && document.contains(el));
    }
    if (Array.isArray(group)) {
      return group.filter((el) => el && document.contains(el));
    }
    if (group instanceof Element) {
      return document.contains(group) ? [group] : [];
    }
    return [];
  }

  function getSectionPartElements(listSelector) {
    const list = query(listSelector);
    const section = list?.closest(".section");
    if (!section) return [];

    const label = section.querySelector(".section-label");
    const rows = [...list.querySelectorAll(".task-row")];
    return [label, ...rows].filter(Boolean);
  }

  function sectionPartLayout(elements) {
    const label = elements.find((el) => el.matches?.(".section-label"));
    const rows = elements.filter((el) => el.matches?.(".task-row"));
    if (!label || !rows.length) return unionRect(elements);

    const labelRect = label.getBoundingClientRect();
    const rowRects = rows.map((row) => row.getBoundingClientRect());
    const top = labelRect.top;
    const left = Math.min(labelRect.left, ...rowRects.map((rect) => rect.left));
    const right = Math.max(labelRect.right, ...rowRects.map((rect) => rect.right));
    const bottom = rowRects[rowRects.length - 1].bottom;

    return {
      top,
      left,
      width: right - left,
      height: bottom - top,
    };
  }

  function notesPartLayout(elements) {
    const input = elements.find((el) => el.querySelector?.("#notes-input"));
    const note = elements.find((el) => el.matches?.(".note-row"));
    if (!input || !note) return unionRect(elements);

    const inputRect = input.getBoundingClientRect();
    const noteRect = note.getBoundingClientRect();
    const top = inputRect.top;
    const left = Math.min(inputRect.left, noteRect.left);
    const right = Math.max(inputRect.right, noteRect.right);

    return {
      top,
      left,
      width: right - left,
      height: noteRect.bottom - top,
    };
  }

  function getFourPartHighlightGroups() {
    return [
      {
        layout: "section",
        elements: getSectionPartElements("#done-list"),
        pad: { top: 5, right: 5, bottom: 5, left: 5 },
      },
      {
        layout: "section",
        elements: getSectionPartElements("#todo-list"),
        pad: { top: 5, right: 5, bottom: 4, left: 5 },
      },
      {
        elements: [query("#task-input")?.closest(".field-wrap")].filter(Boolean),
        pad: { top: 4, right: 4, bottom: 4, left: 4 },
        visualOutset: 10,
      },
      {
        layout: "notes",
        elements: [
          query("#notes-input")?.closest(".field-wrap"),
          query("#notes-list .note-row"),
        ].filter(Boolean),
        pad: { top: 5, right: 4, bottom: 4, left: 4 },
      },
    ].filter((spec) => spec.elements.length > 0);
  }

  async function waitForFourPartHighlights() {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const groups = getFourPartHighlightGroups();
      const ready =
        groups.length === 4 &&
        groups[0].elements.some((el) => el.matches?.(".task-row")) &&
        groups[1].elements.filter((el) => el.matches?.(".task-row")).length >= 2 &&
        groups[3].elements.some((el) => el.matches?.(".note-row"));
      if (ready) return groups;
      await wait(50);
    }
    return getFourPartHighlightGroups();
  }

  function scrollForFourPartTour() {
    const scroll = query("#project-view .view-scroll");
    if (!scroll) return;

    const elements = getFourPartHighlightGroups().flatMap((group) => group.elements);
    if (!elements.length) return;

    let minTop = Infinity;
    let maxBottom = -Infinity;
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      minTop = Math.min(minTop, rect.top);
      maxBottom = Math.max(maxBottom, rect.bottom);
    }

    const scrollRect = scroll.getBoundingClientRect();
    const span = maxBottom - minTop;
    const available = scrollRect.height;

    if (span <= available - 20) {
      const delta = minTop - scrollRect.top - (available - span) / 2;
      scroll.scrollTop = Math.max(0, scroll.scrollTop + delta);
    } else {
      scroll.scrollTop = 0;
    }
  }

  function ensureTourMask() {
    if (tourMaskSvg) return;
    tourMaskSvg = document.getElementById("tour-mask");
    tourMaskDimRect = document.getElementById("tour-mask-dim");
    tourMaskDef = document.getElementById("tour-spotlight-mask");
  }

  function syncTourMaskViewport() {
    ensureTourMask();
    if (!tourMaskSvg || !tourMaskDimRect || !tourMaskDef) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    tourMaskSvg.setAttribute("width", String(w));
    tourMaskSvg.setAttribute("height", String(h));
    tourMaskDimRect.setAttribute("width", String(w));
    tourMaskDimRect.setAttribute("height", String(h));

    let fill = tourMaskDef.querySelector("#tour-mask-fill");
    if (!fill) {
      fill = document.createElementNS(TOUR_MASK_NS, "rect");
      fill.setAttribute("id", "tour-mask-fill");
      fill.setAttribute("fill", "white");
      tourMaskDef.insertBefore(fill, tourMaskDef.firstChild);
    }
    fill.setAttribute("width", String(w));
    fill.setAttribute("height", String(h));
  }

  function normalizePad(pad) {
    if (typeof pad === "number") {
      return { top: pad, right: pad, bottom: pad, left: pad };
    }
    const fallback = MULTI_SPOTLIGHT_PAD;
    return {
      top: pad?.top ?? fallback,
      right: pad?.right ?? fallback,
      bottom: pad?.bottom ?? fallback,
      left: pad?.left ?? fallback,
    };
  }

  function rectBottomWithOutset(rect, groups, index) {
    const outset = groups[index]?.visualOutset ?? 0;
    return rect.top + rect.height + outset;
  }

  function balanceFourPartOutlineRects(rects, groups, minGap = FOUR_PART_OUTLINE_GAP) {
    if (rects.length <= 1) return rects.map((rect) => ({ ...rect }));

    const result = rects.map((rect) => ({ ...rect }));
    const minHeight = 28;

    for (let pass = 0; pass < 5; pass += 1) {
      for (let i = 0; i < result.length - 1; i += 1) {
        const current = result[i];
        const next = result[i + 1];
        const overlap = rectBottomWithOutset(current, groups, i) + minGap - next.top;
        if (overlap > 0) {
          const trimCurrent = overlap * 0.55;
          const trimNext = overlap * 0.45;
          current.height = Math.max(minHeight, current.height - trimCurrent);
          next.top += trimNext;
          next.height = Math.max(minHeight, next.height - trimNext);
        }
      }

      const gaps = [];
      for (let i = 0; i < result.length - 1; i += 1) {
        gaps.push(result[i + 1].top - rectBottomWithOutset(result[i], groups, i));
      }

      const targetGap = Math.max(minGap, gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
      let adjusted = false;

      for (let i = 0; i < result.length - 1; i += 1) {
        const delta = targetGap - gaps[i];
        if (Math.abs(delta) < 0.5) continue;
        adjusted = true;
        const shift = delta * 0.5;
        if (delta > 0) {
          result[i].height = Math.max(minHeight, result[i].height - shift);
          result[i + 1].top += shift;
          result[i + 1].height = Math.max(minHeight, result[i + 1].height - shift);
        } else {
          result[i].height -= shift;
          result[i + 1].top += shift;
          result[i + 1].height -= shift;
        }
      }

      if (!adjusted) break;
    }

    return result;
  }

  function computeMultiSpotlightRects(groups) {
    const rawRects = groups.map((group) => highlightRectForGroup(group));
    const isFourPartStep = isFourPartTourStep(groups);

    if (isFourPartStep) {
      return balanceFourPartOutlineRects(rawRects, groups, FOUR_PART_OUTLINE_GAP);
    }

    return rawRects;
  }

  function highlightRectForGroup(group) {
    const layout = layoutForHighlightGroup(group);
    if (!layout) return null;
    const pad = group?.pad ?? MULTI_SPOTLIGHT_PAD;
    return clipRectToViewport(layout, pad);
  }

  function isFourPartTourStep(groups) {
    if (groups.length !== 4) return false;
    const inList = (group, selector) =>
      normalizeHighlightGroup(group).some((el) => el.closest?.(selector));
    const hasTaskInput = normalizeHighlightGroup(groups[2]).some(
      (el) => el.querySelector?.("#task-input") || el.matches?.("#task-input")
    );
    return (
      inList(groups[0], "#done-list") &&
      inList(groups[1], "#todo-list") &&
      hasTaskInput &&
      groups[3]?.layout === "notes"
    );
  }

  function updateTourDimMask(groups, outlineRects = null) {
    ensureTourMask();
    if (!tourMaskDef) return;

    if (isFourPartTourStep(groups)) {
      tourMaskDef.querySelectorAll(".tour-mask-hole").forEach((el) => el.remove());
      tourMaskSvg?.classList.add("hidden");
      overlay?.classList.add("tour-multi-uniform-dim");
      return;
    }

    overlay?.classList.remove("tour-multi-uniform-dim");
    syncTourMaskViewport();
    tourMaskDef.querySelectorAll(".tour-mask-hole").forEach((el) => el.remove());

    const rects = outlineRects ?? computeMultiSpotlightRects(groups);
    rects.forEach((clipped) => {
      if (!clipped) return;

      const hole = document.createElementNS(TOUR_MASK_NS, "rect");
      hole.setAttribute("class", "tour-mask-hole");
      hole.setAttribute("x", String(clipped.left));
      hole.setAttribute("y", String(clipped.top));
      hole.setAttribute("width", String(clipped.width));
      hole.setAttribute("height", String(clipped.height));
      hole.setAttribute("rx", "12");
      hole.setAttribute("fill", "black");
      tourMaskDef.appendChild(hole);
    });

    tourMaskSvg?.classList.remove("hidden");
  }

  function hideTourDimMask() {
    ensureTourMask();
    tourMaskSvg?.classList.add("hidden");
    tourMaskDef?.querySelectorAll(".tour-mask-hole").forEach((el) => el.remove());
    overlay?.classList.remove("tour-multi-spotlight", "tour-multi-uniform-dim");
    spotlightEls.forEach((el) => el.classList.remove("tour-spotlight-ring"));
  }

  function layoutForHighlightGroup(group) {
    const elements = normalizeHighlightGroup(group);
    if (!elements.length) return null;

    if (group?.layout === "section") {
      return sectionPartLayout(elements);
    }
    if (group?.layout === "notes") {
      return notesPartLayout(elements);
    }
    if (elements.length === 1) {
      return getLayoutRect(elements[0]) || elements[0].getBoundingClientRect();
    }
    return unionRect(elements);
  }

  function positionMultipleSpotlights(groups, { scroll = true } = {}) {
    const validGroups = groups.filter((group) => normalizeHighlightGroup(group).length > 0);
    if (!validGroups.length) {
      hideTourDimMask();
      hideAllSpotlights();
      overlay.classList.toggle("has-spotlight", false);
      return;
    }

    ensureSpotlightCount(validGroups.length);
    currentMultiGroups = validGroups;
    currentStepMultiSpotlight = true;
    overlay.classList.add("has-spotlight", "tour-multi-spotlight");
    const outlineRects = computeMultiSpotlightRects(validGroups);
    updateTourDimMask(validGroups, outlineRects);
    if (!card.classList.contains("hidden")) positionTourCard();

    validGroups.forEach((group, index) => {
      const clipped = outlineRects[index];
      if (!clipped) return;
      const spot = spotlightEls[index];
      spot.classList.remove("hidden");
      spot.classList.add("tour-spotlight-ring");
      spot.style.top = `${clipped.top}px`;
      spot.style.left = `${clipped.left}px`;
      spot.style.width = `${clipped.width}px`;
      spot.style.height = `${clipped.height}px`;
    });
    hideExtraSpotlights(validGroups.length);

    currentMultiTargets = validGroups
      .flatMap((group) => normalizeHighlightGroup(group))
      .filter((el) => el && document.contains(el));
    currentTargetEl = currentMultiTargets[0] || null;

    if (scroll && currentTargetEl) {
      scrollForFourPartTour();
    }
  }

  function getDeps() {
    return window.GuideTourDeps;
  }

  async function wait(ms) {
    return getDeps().wait(ms);
  }

  function query(selector) {
    return document.querySelector(selector);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setNextEnabled(enabled) {
    nextBtn.disabled = !enabled;
    nextBtn.classList.toggle("tour-next-ready", enabled && pendingWaitActions !== null);
  }

  function clearAutoAdvance() {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
  }

  function clearStepWait() {
    clearAutoAdvance();
    pendingWaitActions = null;
    completedWaitActions = new Set();
    nextBtn.classList.remove("tour-next-ready");
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function easeInOutCubic(amount) {
    return amount < 0.5
      ? 4 * amount * amount * amount
      : 1 - Math.pow(-2 * amount + 2, 3) / 2;
  }

  function getSpotlightBox() {
    const spot = spotlightEls[0];
    const rect = spot.getBoundingClientRect();
    return {
      top: Number.parseFloat(spot.style.top) || rect.top,
      left: Number.parseFloat(spot.style.left) || rect.left,
      width: Number.parseFloat(spot.style.width) || rect.width,
      height: Number.parseFloat(spot.style.height) || rect.height,
    };
  }

  function getNotesHighlightTarget() {
    return query("#notes-input")?.closest(".field-wrap") || query("#notes-input");
  }

  function getNotesScrollTop() {
    const scroll = query("#project-view .view-scroll");
    const notesTarget = getNotesHighlightTarget();
    if (!scroll || !notesTarget) return scroll?.scrollTop ?? 0;

    const scrollRect = scroll.getBoundingClientRect();
    const notesRect = notesTarget.getBoundingClientRect();
    const margin = 28;
    const targetTop = notesRect.top - scrollRect.top + scroll.scrollTop - margin;

    return Math.max(
      0,
      Math.min(targetTop, scroll.scrollHeight - scroll.clientHeight)
    );
  }

  function getHighlightBoxForElement(el, pad = 6) {
    const layout = getLayoutRect(el) || el.getBoundingClientRect();
    return clipRectToViewport(layout, pad);
  }

  function getTodoListHighlightBox() {
    const elements = getSectionPartElements("#todo-list");
    if (!elements.length) {
      const list = query("#todo-list");
      return list ? getHighlightBoxForElement(list, 5) : null;
    }
    const layout = sectionPartLayout(elements);
    return layout ? clipRectToViewport(layout, 5) : null;
  }

  function getDoneListHighlightBox() {
    const elements = getSectionPartElements("#done-list");
    if (!elements.length) {
      const list = query("#done-list");
      return list ? getHighlightBoxForElement(list, 5) : null;
    }
    const layout = sectionPartLayout(elements);
    return layout ? clipRectToViewport(layout, 5) : null;
  }

  function applySpotlightBox(box) {
    const spot = spotlightEls[0];
    spot.classList.remove("hidden");
    overlay.classList.add("has-spotlight");
    spot.style.top = `${box.top}px`;
    spot.style.left = `${box.left}px`;
    spot.style.width = `${box.width}px`;
    spot.style.height = `${box.height}px`;
  }

  async function animateSpotlightToBox(getEndBox, durationMs) {
    const endBoxInitial = typeof getEndBox === "function" ? getEndBox() : getEndBox;
    if (!endBoxInitial) return;

    const spot = spotlightEls[0];
    const startBox = getSpotlightBox();
    overlay.classList.add("has-spotlight");
    spot.classList.remove("hidden");
    spotlightEls.forEach((el) => el.classList.add("tour-spotlight-tracking"));

    const startTime = performance.now();
    try {
      while (performance.now() - startTime < durationMs) {
        const t = easeInOutCubic(Math.min(1, (performance.now() - startTime) / durationMs));
        const endBox = typeof getEndBox === "function" ? getEndBox() : endBoxInitial;
        if (!endBox) break;

        spot.style.top = `${lerp(startBox.top, endBox.top, t)}px`;
        spot.style.left = `${lerp(startBox.left, endBox.left, t)}px`;
        spot.style.width = `${lerp(startBox.width, endBox.width, t)}px`;
        spot.style.height = `${lerp(startBox.height, endBox.height, t)}px`;

        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      const finalBox = typeof getEndBox === "function" ? getEndBox() : endBoxInitial;
      if (finalBox) applySpotlightBox(finalBox);
    } finally {
      spotlightEls.forEach((el) => el.classList.remove("tour-spotlight-tracking"));
    }
  }

  async function animateSpotlightToElement(el, durationMs, pad = 6) {
    if (!el) return;
    await animateSpotlightToBox(() => getHighlightBoxForElement(el, pad), durationMs);
  }

  async function trackBoxSpotlight(getBox, durationMs) {
    spotlightEls.forEach((el) => el.classList.add("tour-spotlight-tracking"));
    const deadline = performance.now() + durationMs;
    try {
      while (performance.now() < deadline) {
        const box = typeof getBox === "function" ? getBox() : getBox;
        if (box) applySpotlightBox(box);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    } finally {
      spotlightEls.forEach((el) => el.classList.remove("tour-spotlight-tracking"));
    }
  }

  async function transitionDeleteToNotesSpotlight() {
    if (followingDeleteToNotes) return;
    followingDeleteToNotes = true;
    pendingWaitActions = null;
    resetTourInteractionModes();
    getDeps()?.setTourLock([]);

    const scroll = query("#project-view .view-scroll");
    const notesTarget = getNotesHighlightTarget();
    if (!scroll || !notesTarget) {
      followingDeleteToNotes = false;
      advanceToNextStep(DELETE_STEP_INDEX, { pauseMs: 0 });
      return;
    }

    const spot = spotlightEls[0];
    const startBox = getSpotlightBox();
    const startScrollTop = scroll.scrollTop;
    const endScrollTop = getNotesScrollTop();

    overlay.classList.add("has-spotlight");
    spot.classList.remove("hidden");
    spotlightEls.forEach((el) => el.classList.add("tour-spotlight-tracking"));

    const startTime = performance.now();
    try {
      while (performance.now() - startTime < DELETE_TO_NOTES_TRANSITION_MS) {
        const raw = (performance.now() - startTime) / DELETE_TO_NOTES_TRANSITION_MS;
        const t = easeInOutCubic(Math.min(1, raw));

        scroll.scrollTop = lerp(startScrollTop, endScrollTop, t);

        const endBox = getHighlightBoxForElement(notesTarget);
        spot.style.top = `${lerp(startBox.top, endBox.top, t)}px`;
        spot.style.left = `${lerp(startBox.left, endBox.left, t)}px`;
        spot.style.width = `${lerp(startBox.width, endBox.width, t)}px`;
        spot.style.height = `${lerp(startBox.height, endBox.height, t)}px`;

        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      scroll.scrollTop = endScrollTop;
      positionSpotlight(notesTarget, { scroll: false });
    } finally {
      spotlightEls.forEach((el) => el.classList.remove("tour-spotlight-tracking"));
    }

    skipNotesScrollOnEnter = true;
    followingDeleteToNotes = false;
    advanceToNextStep(DELETE_STEP_INDEX, { pauseMs: 120 });
  }

  function resetTourInteractionModes() {
    document.body.classList.remove("tour-lock-no-child-buttons", "tour-lock-drag-only");
    getDeps()?.setTourDragOnly?.(false);
  }

  function applyStepLock(step) {
    const deps = getDeps();
    if (!deps) return;
    resetTourInteractionModes();
    document.body.classList.toggle("tour-lock-no-child-buttons", !!step.lockRowBodyOnly);
    document.body.classList.toggle("tour-lock-drag-only", !!step.lockDragOnly);
    deps.setTourDragOnly?.(!!step.lockDragOnly);
    if (typeof step.lock === "function") {
      deps.setTourLock(step.lock());
    } else {
      deps.setTourLock([]);
    }
  }

  function beginStepWait(actions) {
    pendingWaitActions = Array.isArray(actions) ? actions : [actions];
    completedWaitActions = new Set();
    setNextEnabled(false);
  }

  function getTodoRow(matchText) {
    const rows = [...document.querySelectorAll("#todo-list .task-row")];
    if (matchText) {
      return rows.find((row) => row.querySelector(".task-text")?.textContent.includes(matchText));
    }
    return rows[0];
  }

  function getDoneRow(matchText) {
    const rows = [...document.querySelectorAll("#done-list .task-row")];
    if (matchText) {
      return rows.find((row) => row.querySelector(".task-text")?.textContent.includes(matchText));
    }
    return rows[0];
  }

  function getFirstDoneButton() {
    return getTodoRow()?.querySelector(".btn-done") || null;
  }

  function getDoneDeleteButton() {
    return (
      getDoneRow("Example completed")?.querySelector(".btn-delete") ||
      query("#done-list .task-row .btn-delete")
    );
  }

  function getTodoDeleteButton() {
    return (
      getTodoRow("Sample task")?.querySelector(".btn-delete") ||
      getTodoRow("Drag me to reorder")?.querySelector(".btn-delete") ||
      query("#todo-list .task-row .btn-delete")
    );
  }

  function getTodoDeleteScrollTop(todoDel) {
    const scroll = query("#project-view .view-scroll");
    if (!scroll || !todoDel) return 0;

    const scrollRect = scroll.getBoundingClientRect();
    const btnRect = todoDel.getBoundingClientRect();
    const margin = 72;
    const targetTop = btnRect.top - scrollRect.top + scroll.scrollTop - margin;

    return Math.max(
      0,
      Math.min(targetTop, scroll.scrollHeight - scroll.clientHeight)
    );
  }

  function trackDeleteRemoveSpotlight(row) {
    if (!row) return;
    void trackElementSpotlight(
      () => {
        if (!row.isConnected) return null;
        return row.querySelector(".btn-delete") || row;
      },
      DELETE_REMOVE_TRACK_MS,
      { snap: true }
    );
  }

  async function setupDeletePhase1({ animateIn = false } = {}) {
    deleteStepPhase = 1;
    currentStepAutoAdvance = false;
    resetTourInteractionModes();
    currentDeleteAnchor = getDoneDeleteButton();

    card.classList.remove("hidden");
    nextBtn.classList.add("hidden");
    titleEl.textContent = steps[DELETE_STEP_INDEX].title;
    messageEl.innerHTML = steps[DELETE_STEP_INDEX].message;
    currentCardPlacement = "beside-delete";

    const lockTarget = currentDeleteAnchor || query("#done-list .task-row .btn-delete");
    getDeps().setTourLock(lockTarget ? [lockTarget] : ["#done-list .btn-delete"]);
    beginStepWait("task-deleted-done");

    if (animateIn && lockTarget) {
      await animateSpotlightToElement(lockTarget, DELETE_BTN_FOCUS_MS, 5);
    } else {
      positionSpotlight(lockTarget || currentDeleteAnchor, { scroll: false });
    }
    positionTourCard();
  }

  async function transitionDoneDeleteToTodoDelete() {
    if (followingDeleteTransition || !running || stepIndex !== DELETE_STEP_INDEX) return;
    followingDeleteTransition = true;

    deleteStepPhase = 2;
    currentDeleteAnchor = null;
    currentStepAutoAdvance = true;
    resetTourInteractionModes();
    card.classList.add("hidden");
    pendingWaitActions = ["task-deleted-todo"];
    completedWaitActions = new Set();

    let todoDel = getTodoDeleteButton();
    if (!todoDel || !document.contains(todoDel)) {
      todoDel = query("#todo-list .task-row .btn-delete");
    }

    if (!todoDel) {
      followingDeleteTransition = false;
      return;
    }

    const scroll = query("#project-view .view-scroll");
    const startScrollTop = scroll?.scrollTop ?? 0;
    const endScrollTop = getTodoDeleteScrollTop(todoDel);
    const spot = spotlightEls[0];
    const startBox = getSpotlightBox();

    overlay.classList.add("has-spotlight");
    spot.classList.remove("hidden");
    spotlightEls.forEach((el) => el.classList.add("tour-spotlight-tracking"));

    try {
      const startTime = performance.now();
      while (performance.now() - startTime < DELETE_DONE_TO_TODO_MS) {
        const t = easeInOutCubic(
          Math.min(1, (performance.now() - startTime) / DELETE_DONE_TO_TODO_MS)
        );
        if (scroll) scroll.scrollTop = lerp(startScrollTop, endScrollTop, t);

        const endBox = getHighlightBoxForElement(todoDel, 5);
        spot.style.top = `${lerp(startBox.top, endBox.top, t)}px`;
        spot.style.left = `${lerp(startBox.left, endBox.left, t)}px`;
        spot.style.width = `${lerp(startBox.width, endBox.width, t)}px`;
        spot.style.height = `${lerp(startBox.height, endBox.height, t)}px`;

        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      if (scroll) scroll.scrollTop = endScrollTop;
      positionSpotlight(todoDel, { scroll: false });
      getDeps()?.setTourLock([todoDel]);
    } finally {
      spotlightEls.forEach((el) => el.classList.remove("tour-spotlight-tracking"));
      followingDeleteTransition = false;
    }
  }

  async function advanceToNextStep(fromIndex, { pauseMs = AUTO_ADVANCE_PAUSE_MS } = {}) {
    if (advancingStep || !running || stepIndex !== fromIndex) return;
    advancingStep = true;
    clearStepWait();
    if (pauseMs > 0) await wait(pauseMs);
    advancingStep = false;
    if (!running || stepIndex !== fromIndex) return;

    if (stepIndex >= steps.length - 1) {
      await finish();
      return;
    }

    stepIndex += 1;
    await showStep(stepIndex);
  }

  function completeStepWait() {
    pendingWaitActions = null;
    nextBtn.title = "";
    scheduleSpotlightRefresh();

    if (currentStepAutoAdvance) {
      advanceToNextStep(stepIndex);
    } else {
      setNextEnabled(true);
    }
  }

  async function trackElementSpotlight(getEl, durationMs, { snap = false } = {}) {
    if (snap) spotlightEls.forEach((el) => el.classList.add("tour-spotlight-tracking"));
    const deadline = performance.now() + durationMs;
    try {
      while (performance.now() < deadline) {
        const el = typeof getEl === "function" ? getEl() : getEl;
        if (el && document.contains(el)) {
          positionSpotlight(el, { scroll: false });
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    } finally {
      if (snap) spotlightEls.forEach((el) => el.classList.remove("tour-spotlight-tracking"));
    }
  }

  function findDoneRowForTask(taskId) {
    if (taskId) {
      return query(`#done-list .task-row[data-id="${taskId}"]`);
    }
    return query("#done-list .task-row.arriving-done") || query("#done-list .task-row:last-child");
  }

  async function followDoneSpotlight(sourceRow) {
    if (followingDoneAnimation) return;
    followingDoneAnimation = true;
    pendingWaitActions = null;

    const taskId = sourceRow?.dataset?.id;
    spotlightEls.forEach((el) => el.classList.add("tour-spotlight-tracking"));

    try {
      const completingDeadline = performance.now() + MARK_DONE_COMPLETING_TRACK_MS;
      while (performance.now() < completingDeadline) {
        if (sourceRow?.isConnected) {
          positionSpotlight(sourceRow, { scroll: false });
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      let doneRow = null;
      for (let i = 0; i < 60; i++) {
        doneRow = findDoneRowForTask(taskId);
        if (doneRow) break;
        await wait(16);
      }

      if (doneRow) {
        doneRow.scrollIntoView({ block: "nearest" });
        positionSpotlight(doneRow, { scroll: false });
      }

      const arriveDeadline = performance.now() + MARK_DONE_ARRIVE_TRACK_MS;
      while (performance.now() < arriveDeadline) {
        const el = findDoneRowForTask(taskId) || doneRow;
        if (el?.isConnected) {
          positionSpotlight(el, { scroll: false });
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }

      const doneListBox = getDoneListHighlightBox();
      if (doneListBox) {
        await animateSpotlightToBox(getDoneListHighlightBox, MARK_DONE_TO_LIST_MS);
        await trackBoxSpotlight(getDoneListHighlightBox, MARK_DONE_LIST_HIGHLIGHT_MS);
      }
    } finally {
      spotlightEls.forEach((el) => el.classList.remove("tour-spotlight-tracking"));
    }

    await wait(PAUSE_BEFORE_DRAG_STEP_MS);
    followingDoneAnimation = false;
    advanceToNextStep(MARK_DONE_STEP_INDEX, { pauseMs: 0 });
  }

  async function followAddedTaskSpotlight(taskId) {
    if (followingAddedTaskHighlight) return;
    followingAddedTaskHighlight = true;
    pendingWaitActions = null;

    getDeps()?.setTourLock([]);

    let row = null;
    for (let i = 0; i < 24; i++) {
      row = taskId
        ? query(`#todo-list .task-row[data-id="${taskId}"]`)
        : query("#todo-list .task-row.highlight");
      if (row) break;
      await wait(30);
    }

    if (row) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      await wait(220);
      await trackElementSpotlight(
        () =>
          (taskId
            ? query(`#todo-list .task-row[data-id="${taskId}"]`)
            : row) || row,
        ADD_TASK_HIGHLIGHT_MS,
        { snap: true }
      );

      const todoListBox = getTodoListHighlightBox();
      if (todoListBox) {
        await animateSpotlightToBox(getTodoListHighlightBox, ADD_TASK_TO_LIST_MS);
        await trackBoxSpotlight(getTodoListHighlightBox, ADD_TASK_LIST_HIGHLIGHT_MS);
      }

      const doneBtn = getFirstDoneButton();
      if (doneBtn) {
        await animateSpotlightToElement(doneBtn, ADD_TASK_LIST_TO_DONE_MS);
        markDoneTourTarget = doneBtn;
        currentTargetEl = doneBtn;
        skipMarkDoneSpotlightOnEnter = true;
        skipMarkDoneScrollOnEnter = true;
      }
    } else {
      await wait(ADD_TASK_HIGHLIGHT_MS);
    }

    followingAddedTaskHighlight = false;
    advanceToNextStep(ADD_TASK_STEP_INDEX, { pauseMs: 0 });
  }

  function onTourAction(action, detail) {
    if (
      !running ||
      followingDoneAnimation ||
      followingAddedTaskHighlight ||
      followingDeleteToNotes ||
      followingDeleteTransition
    ) {
      return;
    }

    if (action === "task-removing" && stepIndex === DELETE_STEP_INDEX) {
      const row = detail?.row;
      if (!row) return;
      if (deleteStepPhase === 1 && detail.isDone) {
        trackDeleteRemoveSpotlight(row);
        return;
      }
      if (deleteStepPhase === 2 && !detail.isDone) {
        trackDeleteRemoveSpotlight(row);
        return;
      }
    }

    if (action === "task-added" && stepIndex === ADD_TASK_STEP_INDEX) {
      if (!pendingWaitActions?.includes("task-added")) return;
      void followAddedTaskSpotlight(detail?.taskId);
      return;
    }

    if (action === "task-done" && stepIndex === MARK_DONE_STEP_INDEX) {
      if (!pendingWaitActions?.includes("task-done")) return;
      followDoneSpotlight(detail?.row);
      return;
    }

    if (
      stepIndex === DELETE_STEP_INDEX &&
      deleteStepPhase === 2 &&
      action === "task-deleted-todo"
    ) {
      if (!pendingWaitActions?.includes("task-deleted-todo")) return;
      void transitionDeleteToNotesSpotlight();
      return;
    }

    if (
      stepIndex === DELETE_STEP_INDEX &&
      deleteStepPhase === 1 &&
      action === "task-deleted-done"
    ) {
      void transitionDoneDeleteToTodoDelete();
      return;
    }

    if (!pendingWaitActions) return;
    if (!pendingWaitActions.includes(action)) return;

    completedWaitActions.add(action);

    if (!pendingWaitActions.every((a) => completedWaitActions.has(a))) return;
    completeStepWait();
  }

  function getCardReservedBottom() {
    if (card.classList.contains("hidden")) return 20;
    const cardRect = card.getBoundingClientRect();
    const cardGap = 12;
    if (cardRect.height > 0 && cardRect.top > window.innerHeight * 0.5) {
      return window.innerHeight - cardRect.top + cardGap;
    }
    const cardBottom = parseFloat(card.style.bottom);
    if (!Number.isNaN(cardBottom) && cardBottom > 0) {
      return cardBottom + (cardRect.height || 140) + cardGap;
    }
    return 160;
  }

  function unionRect(elements) {
    const rects = elements
      .filter((el) => el && document.contains(el))
      .map((el) => el.getBoundingClientRect());
    if (!rects.length) return null;
    const top = Math.min(...rects.map((r) => r.top));
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { top, left, width: right - left, height: bottom - top };
  }

  function getLayoutRect(el) {
    if (!el) return null;

    if (el.id === "projects-list") {
      const home = query("#home-view");
      const header = home?.querySelector(".header");
      const footer = home?.querySelector(".home-footer");
      if (home && header && footer) {
        const listRect = el.getBoundingClientRect();
        const top = header.getBoundingClientRect().bottom;
        const reserved = getCardReservedBottom();
        const bottom = Math.min(footer.getBoundingClientRect().top, window.innerHeight - reserved);
        return {
          top,
          left: listRect.left,
          width: listRect.width,
          height: Math.max(0, bottom - top),
        };
      }
    }

    if (el.matches("#project-view .view-scroll")) {
      const header = query("#project-view .header");
      const rect = el.getBoundingClientRect();
      const top = header ? header.getBoundingClientRect().bottom : rect.top;
      const reserved = getCardReservedBottom();
      const bottom = Math.min(rect.bottom, window.innerHeight - reserved);
      return {
        top,
        left: rect.left,
        width: rect.width,
        height: Math.max(0, bottom - top),
      };
    }

    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  }

  function clipRectToViewport(rect, pad, margin = 8) {
    const p = normalizePad(pad);
    const top = Math.max(rect.top - p.top, margin);
    const left = Math.max(rect.left - p.left, margin);
    const right = Math.min(rect.left + rect.width + p.right, window.innerWidth - margin);
    const bottom = Math.min(rect.top + rect.height + p.bottom, window.innerHeight - margin);

    return {
      top,
      left,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  function positionTourCard() {
    if (card.classList.contains("hidden")) return;

    const margin = 12;
    card.classList.remove("tour-card-docked", "tour-card-centered");
    card.style.top = "";
    card.style.left = "";
    card.style.bottom = "";
    card.style.transform = "";

    const cardRect = card.getBoundingClientRect();
    const cardW = cardRect.width || (card.classList.contains("tour-card-wide") ? 400 : 320);
    const cardH = cardRect.height || 140;

    switch (currentCardPlacement) {
      case "beside-new-project": {
        const btn = query("#new-project-btn");
        if (!btn) break;
        const r = btn.getBoundingClientRect();
        let left = r.left - cardW - 14;
        let top = r.top + r.height / 2 - cardH / 2;
        if (left < margin) {
          left = clamp(r.left, margin, window.innerWidth - cardW - margin);
          top = r.bottom + 12;
        }
        card.style.top = `${clamp(top, 44, window.innerHeight - cardH - margin)}px`;
        card.style.left = `${clamp(left, margin, window.innerWidth - cardW - margin)}px`;
        return;
      }
      case "beside-delete": {
        const btn = currentDeleteAnchor || getDoneDeleteButton();
        if (!btn) break;
        const r = btn.getBoundingClientRect();
        let left = r.right + 12;
        let top = r.top + r.height / 2 - cardH / 2;
        if (left + cardW > window.innerWidth - margin) {
          left = r.left - cardW - 12;
        }
        card.style.top = `${clamp(top, 44, window.innerHeight - cardH - margin)}px`;
        card.style.left = `${clamp(left, margin, window.innerWidth - cardW - margin)}px`;
        return;
      }
      case "mid-center-below-notes": {
        const notesInput = query("#notes-input");
        const headerBottom =
          query("#project-view .header")?.getBoundingClientRect().bottom ?? 80;
        let top = notesInput
          ? notesInput.getBoundingClientRect().bottom + 40
          : window.innerHeight * 0.52;
        top = clamp(top, headerBottom + 12, window.innerHeight - cardH - margin);
        card.style.top = `${top}px`;
        card.style.left = "50%";
        card.style.transform = "translateX(-50%)";
        return;
      }
      case "elevated": {
        card.style.top = `${clamp(window.innerHeight * 0.4, 96, window.innerHeight - cardH - margin)}px`;
        card.style.left = "50%";
        card.style.transform = "translateX(-50%)";
        return;
      }
      case "elevated-notes": {
        const notesInput = query("#notes-input");
        let top = notesInput
          ? notesInput.getBoundingClientRect().top - cardH - 28
          : window.innerHeight * 0.3;
        top = clamp(top, 72, window.innerHeight - cardH - margin);
        card.style.top = `${top}px`;
        card.style.left = "50%";
        card.style.transform = "translateX(-50%)";
        return;
      }
      default: {
        card.classList.add("tour-card-docked");
        card.style.top = "auto";
        card.style.left = "50%";
        card.style.transform = "translateX(-50%)";
        const footer = query(".home-footer");
        const homeActive = query("#home-view")?.classList.contains("active");
        if (footer && homeActive) {
          card.style.bottom = `${window.innerHeight - footer.getBoundingClientRect().top + 10}px`;
        } else {
          card.style.bottom = "20px";
        }
      }
    }
  }

  function positionSpotlight(el, { scroll = true, multiSpotlight = false } = {}) {
    if (Array.isArray(el) && multiSpotlight) {
      positionMultipleSpotlights(el, { scroll });
      return;
    }

    hideTourDimMask();
    currentStepMultiSpotlight = false;
    currentMultiGroups = null;
    hideExtraSpotlights(1);

    if (Array.isArray(el)) {
      const targets = el.filter((node) => node && document.contains(node));
      currentMultiTargets = targets.length ? targets : null;
      if (!targets.length) {
        currentTargetEl = null;
        overlay.classList.toggle("has-spotlight", false);
        hideAllSpotlights();
        return;
      }
      currentTargetEl = targets[0];
      overlay.classList.toggle("has-spotlight", true);
      if (!card.classList.contains("hidden")) positionTourCard();

      const layout = targets.length === 1 ? getLayoutRect(targets[0]) : unionRect(targets);
      if (!layout) return;
      const pad = 6;
      const clipped = clipRectToViewport(layout, pad);
      spotlightEls[0].classList.remove("hidden");
      spotlightEls[0].style.top = `${clipped.top}px`;
      spotlightEls[0].style.left = `${clipped.left}px`;
      spotlightEls[0].style.width = `${clipped.width}px`;
      spotlightEls[0].style.height = `${clipped.height}px`;
      if (scroll && targets.length === 1) {
        targets[0].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      return;
    }

    currentMultiTargets = null;
    currentTargetEl = el || null;
    overlay.classList.toggle("has-spotlight", !!el);
    if (!card.classList.contains("hidden")) positionTourCard();

    if (!el) {
      hideAllSpotlights();
      return;
    }

    const layout = getLayoutRect(el);
    const pad = 6;
    const clipped = clipRectToViewport(layout, pad);

    spotlightEls[0].classList.remove("hidden");
    spotlightEls[0].style.top = `${clipped.top}px`;
    spotlightEls[0].style.left = `${clipped.left}px`;
    spotlightEls[0].style.width = `${clipped.width}px`;
    spotlightEls[0].style.height = `${clipped.height}px`;

    if (scroll) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function refreshTourLayout({ scroll = false } = {}) {
    positionTourCard();
    if (currentStepMultiSpotlight && currentMultiGroups) {
      positionMultipleSpotlights(currentMultiGroups, { scroll });
    } else if (currentMultiTargets?.length) {
      positionSpotlight(currentMultiTargets, { scroll, multiSpotlight: false });
    } else if (currentTargetEl && document.contains(currentTargetEl)) {
      positionSpotlight(currentTargetEl, { scroll });
    }
  }

  function scheduleSpotlightRefresh() {
    if (!running || refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
      refreshScheduled = false;
      if (!running) return;
      refreshTourLayout();
    });
  }

  const steps = [
    {
      title: "Create projects",
      message:
        "Projects start here. Click <strong>+ New Project</strong> to add a workspace — side projects, sprints, or anything you are tracking.",
      target: () => query("#new-project-btn"),
      cardPlacement: "beside-new-project",
      lock: () => ["#new-project-btn"],
      waitFor: "new-project-clicked",
      hideNext: true,
      autoAdvanceOnWait: true,
    },
    {
      title: "Four simple parts",
      message:
        "Each project is one scrollable view with four parts: <strong>Done</strong> at the top, active <strong>To Do</strong> below, a <strong>task input</strong>, and <strong>Notes</strong> at the bottom.",
      target: () => getFourPartHighlightGroups(),
      multiSpotlight: true,
      cardPlacement: "mid-center-below-notes",
      lock: () => [],
      onEnter: async () => {
        await getDeps().showProject(tutorialProject, { tour: true });
        await waitForFourPartHighlights();
        scrollForFourPartTour();
        await wait(120);
      },
    },
    {
      title: "Add a task",
      message:
        "Type a task and press <strong>Enter</strong> to add it. Built for quick-firing ideas — capture tasks as fast as you think of them.",
      target: () => query("#task-input"),
      cardPlacement: "elevated",
      lock: () => ["#task-input"],
      waitFor: "task-added",
      hideNext: true,
      autoAdvanceOnWait: true,
      onEnter: async () => {
        getDeps().scrollToTodo();
        await wait(200);
        getDeps().taskInput?.focus();
      },
    },
    {
      title: "Mark tasks done",
      message: "Click <strong>Done</strong> when a task is finished — it moves to the Done section above.",
      target: () => markDoneTourTarget || getFirstDoneButton() || query("#todo-list"),
      cardPlacement: "elevated",
      lock: () => {
        const btn = markDoneTourTarget || getFirstDoneButton();
        return btn ? [btn] : ["#todo-list .btn-done"];
      },
      waitFor: "task-done",
      hideNext: true,
      autoAdvanceOnWait: true,
      onEnter: async () => {
        if (skipMarkDoneScrollOnEnter) {
          skipMarkDoneScrollOnEnter = false;
          await wait(80);
        } else {
          getDeps().scrollToTodo();
          await wait(200);
        }
      },
    },
    {
      title: "Drag to reorder",
      message:
        "Click and hold anywhere on a todo card (except buttons) and <strong>drag</strong> up or down. Order saves automatically.",
      target: () => getSectionPartElements("#todo-list"),
      cardPlacement: "elevated",
      lock: () => ["#todo-list"],
      lockDragOnly: true,
      waitFor: "todo-reordered",
      hideNext: true,
      autoAdvanceOnWait: true,
      onEnter: async () => {
        getDeps().scrollToTodo();
        await wait(200);
      },
    },
    {
      title: "Delete anytime",
      message:
        "Use <strong>Delete</strong> (✕) to remove a task — nothing is permanent until you decide.",
      phasedDelete: true,
      hideNext: true,
      onEnter: async () => {
        deleteStepPhase = 0;
        const scroll = query("#project-view .view-scroll");
        if (scroll) scroll.scrollTop = 0;
        await wait(150);
        await setupDeletePhase1({ animateIn: true });
      },
    },
    {
      title: "Project notes",
      message:
        "<strong>Notes</strong> hold misc text that is not a task — env vars, API keys, shell commands, or scratch ideas. <strong>Shift+Enter</strong> saves a note below the input.",
      target: () => query("#notes-input"),
      cardPlacement: "elevated-notes",
      lock: () => ["#notes-input"],
      waitFor: "note-added",
      hideNext: true,
      autoAdvanceOnWait: true,
      onEnter: async () => {
        if (skipNotesScrollOnEnter) {
          skipNotesScrollOnEnter = false;
          await wait(80);
        } else {
          getDeps().scrollToNotes();
          await wait(200);
        }
        getDeps().notesInput?.focus();
      },
    },
    {
      title: "Local by design",
      wideCard: true,
      cardPlacement: "docked",
      lock: () => [],
      message:
        "Everything stays on your machine. Tasks and notes live in a <strong>SQLite</strong> file under your app data folder (<code>tasks.db</code> in <strong>Projects</strong> under app data on Windows, macOS, or Linux) — no accounts, no cloud sync, and no outbound network calls. Electron uses <strong>context isolation</strong> and a strict <strong>Content-Security-Policy</strong> (<strong>default-src 'self'</strong>), so renderer code only talks to the main process through a narrow preload bridge. Your notes can safely hold tokens or connection strings; they never leave disk unless you copy them yourself.",
      target: null,
    },
  ];

  async function showStep(index) {
    const step = steps[index];
    const preservedMarkDoneTarget =
      skipMarkDoneSpotlightOnEnter && markDoneTourTarget ? markDoneTourTarget : null;
    const preservedSkipMarkDoneScroll = skipMarkDoneScrollOnEnter;
    clearStepWait();
    followingDoneAnimation = false;
    followingAddedTaskHighlight = false;
    followingDeleteToNotes = false;
    followingDeleteTransition = false;
    skipNotesScrollOnEnter = false;
    skipMarkDoneSpotlightOnEnter = false;
    skipMarkDoneScrollOnEnter = false;
    markDoneTourTarget = null;
    deleteStepPhase = 0;
    currentDeleteAnchor = null;
    currentStepMultiSpotlight = !!step.multiSpotlight;
    currentMultiGroups = null;
    currentStepAutoAdvance = !!step.autoAdvanceOnWait;

    resetTourInteractionModes();

    const hideCard = !!step.hideCard && !step.phasedDelete;
    card.classList.toggle("hidden", hideCard);
    skipFloat.classList.remove("hidden");

    titleEl.textContent = step.title;
    messageEl.innerHTML = step.message || "";
    nextBtn.textContent = index === steps.length - 1 ? "Finish" : "Next";
    nextBtn.classList.toggle("hidden", !!step.hideNext || hideCard);
    card.classList.toggle("tour-card-wide", !!step.wideCard);
    currentCardPlacement = step.cardPlacement || "docked";

    if (step.onEnter) {
      nextBtn.disabled = true;
      skipFloat.disabled = true;
      if (preservedSkipMarkDoneScroll) skipMarkDoneScrollOnEnter = true;
      await step.onEnter();
      skipMarkDoneScrollOnEnter = false;
      skipFloat.disabled = false;
    }

    if (!step.phasedDelete) {
      applyStepLock(step);

      const target = step.target ? step.target() : null;
      if (preservedMarkDoneTarget && document.contains(preservedMarkDoneTarget)) {
        currentTargetEl = preservedMarkDoneTarget;
        overlay.classList.add("has-spotlight");
        spotlightEls[0].classList.remove("hidden");
        positionSpotlight(preservedMarkDoneTarget, { scroll: false });
      } else {
        positionSpotlight(target, { multiSpotlight: !!step.multiSpotlight });
      }
      requestAnimationFrame(() => {
        if (!running || stepIndex !== index) return;
        applyStepLock(step);
        refreshTourLayout();
      });

      if (step.waitFor) {
        beginStepWait(step.waitFor);
      } else if (!step.autoAdvanceMs) {
        setNextEnabled(true);
        nextBtn.title = "";
      }
    }

    if (step.autoAdvanceMs) {
      const stepAt = index;
      autoAdvanceTimer = setTimeout(async () => {
        autoAdvanceTimer = null;
        if (!running || stepIndex !== stepAt) return;
        stepIndex += 1;
        await showStep(stepIndex);
      }, step.autoAdvanceMs);
    }
  }

  async function start() {
    if (running) return;
    if (!getDeps()) return;

    running = true;
    finishing = false;
    getDeps().closeModal?.();
    getDeps().closeReadme?.();
    getDeps().setTourActive(true);
    stepIndex = 0;
    tutorialProject = await window.api.resetTutorial();

    overlay.classList.remove("hidden");
    document.body.classList.add("tour-active");
    skipFloat.classList.remove("hidden");

    if (!document.getElementById("home-view").classList.contains("active")) {
      getDeps().showHome();
      await wait(350);
    }

    await showStep(0);
  }

  async function next() {
    if (!running || nextBtn.disabled) return;

    if (stepIndex >= steps.length - 1) {
      await finish();
      return;
    }

    stepIndex += 1;
    await showStep(stepIndex);
  }

  async function cleanupTutorialProject() {
    tutorialProject = null;
    const deps = getDeps();
    deps?.showHome?.();
    await window.api.deleteTutorial();
    await deps?.loadProjects?.();
  }

  async function finish() {
    if (finishing) return;
    finishing = true;
    try {
      running = false;
      followingDoneAnimation = false;
      followingAddedTaskHighlight = false;
      followingDeleteToNotes = false;
      followingDeleteTransition = false;
      skipNotesScrollOnEnter = false;
      skipMarkDoneSpotlightOnEnter = false;
      skipMarkDoneScrollOnEnter = false;
      markDoneTourTarget = null;
      deleteStepPhase = 0;
      currentDeleteAnchor = null;
      clearStepWait();
      currentTargetEl = null;
      currentMultiTargets = null;
      currentMultiGroups = null;
      currentStepMultiSpotlight = false;
      currentCardPlacement = "docked";
      hideTourDimMask();
      overlay.classList.remove("has-spotlight", "tour-multi-spotlight", "tour-multi-uniform-dim");
      overlay.classList.add("hidden");
      hideAllSpotlights();
      card.classList.remove("tour-card-docked", "hidden");
      card.style.top = "";
      card.style.left = "";
      card.style.bottom = "";
      card.style.transform = "";
      nextBtn.classList.remove("hidden");
      skipFloat.classList.add("hidden");
      document.body.classList.remove("tour-active", "tour-lock-no-child-buttons", "tour-lock-drag-only");
      getDeps()?.clearTourLock?.();
      getDeps()?.setTourActive(false);
      nextBtn.title = "";

      await cleanupTutorialProject();
    } finally {
      finishing = false;
    }
  }

  async function skip() {
    await finish();
  }

  nextBtn.addEventListener("click", () => next());
  skipFloat.addEventListener("click", () => skip());

  document.addEventListener("keydown", (e) => {
    if (!running || overlay.classList.contains("hidden")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      skip();
    }
  });

  window.addEventListener("resize", scheduleSpotlightRefresh);
  window.addEventListener("scroll", scheduleSpotlightRefresh, true);

  window.GuideTour = { start, onAction: onTourAction };
})();
