const $ = (sel) => document.querySelector(sel);

const homeView = $("#home-view");
const projectView = $("#project-view");
const projectsList = $("#projects-list");
const projectTitle = $("#project-title");
const doneList = $("#done-list");
const todoList = $("#todo-list");
const taskInput = $("#task-input");
const notesInput = $("#notes-input");
const notesList = $("#notes-list");
const modalOverlay = $("#modal-overlay");
const readmeOverlay = $("#readme-overlay");
const projectNameInput = $("#project-name-input");
const guideBtn = $("#guide-btn");
const readmeBtn = $("#readme-btn");

let currentProject = null;
let animating = false;
let tourActive = false;
let tourDragOnly = false;
let tourLockElements = [];
let editingTaskId = null;
let editingNoteId = null;
let draggingTodoId = null;
let todoOrderBeforeDrag = null;
let suppressTaskClick = false;

// ── Views ────────────────────────────────────────────────────────────────────

function showHome() {
  currentProject = null;
  document.title = "Projects";
  projectView.classList.remove("active");
  homeView.classList.add("active");
  loadProjects();
}

function showProject(project, { tour = false } = {}) {
  currentProject = project;
  document.title = project.name;
  projectTitle.textContent = project.name;
  homeView.classList.remove("active");
  projectView.classList.add("active");
  taskInput.value = "";
  notesInput.value = "";
  resetFieldHeight(taskInput);
  resetFieldHeight(notesInput);
  window.api.touchProject(project.id);
  return Promise.all([loadTasks(), loadNotes()]).then(() => {
    const scroll = document.querySelector("#project-view .view-scroll");
    if (tour) {
      if (scroll) scroll.scrollTop = 0;
    } else {
      scrollProjectToBottom();
      taskInput.focus();
    }
  });
}

// ── Projects ─────────────────────────────────────────────────────────────────

async function loadProjects() {
  const projects = await window.api.listProjects();
  projectsList.innerHTML = "";
  homeView.classList.toggle("home-empty", projects.length === 0);

  if (projects.length === 0) {
    projectsList.innerHTML = `
      <div class="empty-welcome">
        <p class="empty-welcome-title">Welcome to Projects</p>
        <p class="empty-hint">New here? Take a quick hands-on tour to see how everything works.</p>
      </div>`;
    return;
  }

  projects.forEach(async (project, i) => {
    const row = document.createElement("div");
    row.className = "project-row";
    row.style.animationDelay = `${(projects.length - 1 - i) * 50}ms`;

    const folderPath = await window.api.getProjectPath(project.name);

    row.innerHTML = `
      <span class="project-name">${escapeHtml(project.name)}</span>
      <div class="project-actions">
        ${folderPath ? '<button class="btn btn-cursor" title="Open in Cursor">Cursor</button>' : ""}
        <button class="btn btn-delete" title="Delete project">✕</button>
      </div>
    `;

    row.querySelector(".project-name").addEventListener("click", () => showProject(project));
    row.addEventListener("click", (e) => {
      if (e.target.closest(".project-actions")) return;
      showProject(project);
    });

    const cursorBtn = row.querySelector(".btn-cursor");
    if (cursorBtn) {
      cursorBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openProjectInCursor(project.name, cursorBtn);
      });
    }

    row.querySelector(".btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProject(project, row);
    });

    projectsList.appendChild(row);
  });
}

async function openProjectInCursor(projectName, btn) {
  try {
    await window.api.openInCursor(projectName);
    const original = btn.textContent;
    btn.textContent = "Opened";
    btn.classList.add("opened");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("opened");
    }, 1200);
  } catch (err) {
    alert(err.message || "Could not open in Cursor.");
  }
}

async function deleteProject(project, row) {
  if (!confirm(`Delete "${project.name}" and all its tasks?`)) return;

  row.classList.add("removing");
  await wait(300);
  await window.api.deleteProject(project.id);
  loadProjects();
}

function notifyTour(action, detail = null) {
  if (!tourActive) return;
  window.GuideTour?.onAction?.(action, detail);
}

function setTourLock(targets) {
  tourLockElements.forEach((el) => el.classList.remove("tour-allowed"));
  tourLockElements = [];

  if (!tourActive) {
    document.body.classList.remove("tour-locked");
    return;
  }

  document.body.classList.add("tour-locked");
  if (!targets?.length) return;

  for (const target of targets) {
    const nodes =
      typeof target === "string"
        ? [...document.querySelectorAll(target)]
        : target instanceof Element
          ? [target]
          : [];
    nodes.forEach((el) => {
      el.classList.add("tour-allowed");
      tourLockElements.push(el);
    });
  }
}

function clearTourLock() {
  tourLockElements.forEach((el) => el.classList.remove("tour-allowed"));
  tourLockElements = [];
  tourDragOnly = false;
  document.body.classList.remove("tour-locked");
}

function openNewProjectModal() {
  if (tourActive) {
    notifyTour("new-project-clicked");
    return;
  }
  modalOverlay.classList.remove("hidden");
  projectNameInput.value = "";
  projectNameInput.focus();
}

function closeModal() {
  modalOverlay.classList.add("hidden");
}

function openReadme() {
  if (tourActive) return;
  readmeOverlay.classList.remove("hidden");
}

function closeReadme() {
  readmeOverlay.classList.add("hidden");
}

function openGuide() {
  if (window.GuideTour) window.GuideTour.start();
}

async function createProject() {
  const name = projectNameInput.value.trim();
  if (!name) return;
  closeModal();
  await window.api.createProject(name);
  loadProjects();
}

// ── Tasks ────────────────────────────────────────────────────────────────────

async function loadTasks({ highlightId = null, arrivingDoneId = null } = {}) {
  if (!currentProject) return;

  const [doneTasks, todoTasks] = await Promise.all([
    window.api.listTasks(currentProject.id, true),
    window.api.listTasks(currentProject.id, false),
  ]);

  renderTaskList(doneList, doneTasks, true, { arrivingDoneId });
  renderTaskList(todoList, todoTasks, false, { highlightId });
}

function renderTaskList(container, tasks, isDone, { highlightId = null, arrivingDoneId = null } = {}) {
  container.innerHTML = "";

  if (tasks.length === 0) {
    showTaskEmptyHint(container, isDone);
    return;
  }

  tasks.forEach((task, i) => {
    appendTaskRow(container, task, isDone, {
      animationDelay: (tasks.length - 1 - i) * 40,
      highlight: task.id === highlightId,
      arrivingDone: task.id === arrivingDoneId,
    });
  });
}

function showTaskEmptyHint(container, isDone) {
  if (container.querySelector(".task-row")) return;

  const hint = isDone
    ? "Completed tasks appear here"
    : "Nothing here yet — add a task below";
  container.innerHTML = `<p class="empty-hint">${hint}</p>`;
}

function clearListHint(container) {
  const hint = container.querySelector(".empty-hint");
  if (hint) hint.remove();
}

function createTaskRow(task, isDone, { animationDelay = 0, highlight = false, arrivingDone = false } = {}) {
  const row = document.createElement("div");
  row.className = "task-row" + (isDone ? " done-row" : "");
  row.dataset.id = task.id;

  if (animationDelay && !highlight && !arrivingDone) {
    row.style.animationDelay = `${animationDelay}ms`;
  }
  if (highlight) row.classList.add("highlight");
  if (arrivingDone) row.classList.add("arriving-done");

  row.innerHTML = isDone
    ? `
      <button type="button" class="task-done-label" title="Move back to To Do">DONE</button>
      <span class="task-text">${escapeHtml(task.text)}</span>
      <button class="btn btn-delete" title="Delete">✕</button>
    `
    : `
      <button class="btn btn-delete" title="Delete">✕</button>
      <span class="task-text">${escapeHtml(task.text)}</span>
      <button class="btn btn-copy" title="Copy">Copy</button>
      <button class="btn btn-done">Done</button>
    `;

  if (!isDone) {
    const doneBtn = row.querySelector(".btn-done");
    const copyBtn = row.querySelector(".btn-copy");
    const deleteBtn = row.querySelector(".btn-delete");

    wireTodoActionButton(deleteBtn, task, row, "delete", () => removeTask(task, row, false));
    wireTodoActionButton(copyBtn, task, row, "copy", () => copyTask(task.text, copyBtn));
    wireTodoActionButton(doneBtn, task, row, "done", () => markDone(task, row));
    setupTodoRowDrag(row, task.id);
  } else {
    const undoBtn = row.querySelector(".task-done-label");
    const deleteBtn = row.querySelector(".btn-delete");

    wireDoneActionButton(undoBtn, task, row, "undo", () => markUndone(task, row));
    wireDoneActionButton(deleteBtn, task, row, "delete", () => removeTask(task, row, true));
  }

  const textEl = row.querySelector(".task-text");
  textEl.addEventListener("click", () => {
    if (suppressTaskClick || tourDragOnly) return;
    startEditTask(task, textEl, row);
  });

  return row;
}

function prependTaskRow(container, task, isDone, options = {}) {
  clearListHint(container);
  const row = createTaskRow(task, isDone, options);
  const firstRow = container.querySelector(".task-row");
  if (firstRow) {
    container.insertBefore(row, firstRow);
  } else {
    container.appendChild(row);
  }
}

function appendTaskRow(container, task, isDone, options = {}) {
  clearListHint(container);
  container.appendChild(createTaskRow(task, isDone, options));
}

function getTodoOrderIds() {
  return [...todoList.querySelectorAll(".task-row")].map((row) => Number(row.dataset.id));
}

function getDragAfterElement(container, y) {
  const rows = [...container.querySelectorAll(".task-row:not(.dragging)")];
  return rows.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function setupTodoRowDrag(row, taskId) {
  row.draggable = true;

  row.addEventListener("dragstart", (e) => {
    if (animating || editingTaskId || row.classList.contains("editing")) {
      e.preventDefault();
      return;
    }
    if (e.target.closest("button")) {
      e.preventDefault();
      return;
    }

    suppressTaskClick = true;
    draggingTodoId = taskId;
    todoOrderBeforeDrag = getTodoOrderIds();
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(taskId));
  });

  row.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    draggingTodoId = null;
    persistTodoOrder(todoOrderBeforeDrag);
    todoOrderBeforeDrag = null;
    setTimeout(() => {
      suppressTaskClick = false;
    }, 0);
  });
}

function setupTodoListDragDrop() {
  if (todoList.dataset.dndReady) return;
  todoList.dataset.dndReady = "1";

  todoList.addEventListener("dragover", (e) => {
    if (!draggingTodoId) return;
    e.preventDefault();

    const dragging = todoList.querySelector(".task-row.dragging");
    if (!dragging) return;

    const after = getDragAfterElement(todoList, e.clientY);
    if (after == null) {
      todoList.appendChild(dragging);
    } else if (after !== dragging) {
      todoList.insertBefore(dragging, after);
    }
  });

  todoList.addEventListener("drop", (e) => e.preventDefault());
}

async function persistTodoOrder(previousOrder) {
  if (!currentProject) return;

  const ids = getTodoOrderIds();
  if (ids.length === 0) return;

  const sameOrder =
    previousOrder &&
    previousOrder.length === ids.length &&
    previousOrder.every((id, i) => id === ids[i]);
  if (sameOrder) return;

  await window.api.reorderTasks(currentProject.id, ids);
  notifyTour("todo-reordered");
}

async function moveTodoRowForTour(row, beforeRow) {
  if (animating || !row?.parentElement) return;

  const list = row.parentElement;
  const previousOrder = getTodoOrderIds();

  row.classList.add("dragging");
  await wait(280);

  if (beforeRow && beforeRow !== row) {
    list.insertBefore(row, beforeRow);
  } else if (!beforeRow) {
    list.appendChild(row);
  }

  await wait(220);
  row.classList.remove("dragging");
  await persistTodoOrder(previousOrder);
}

function startEditTask(task, textEl, row) {
  if (animating || editingTaskId || editingNoteId || tourDragOnly) return;

  editingTaskId = task.id;
  row.classList.add("editing");
  row.draggable = false;

  const input = document.createElement("textarea");
  input.className = "task-text-input";
  input.value = task.text;
  input.rows = 1;

  const autoResize = () => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };

  textEl.replaceWith(input);
  autoResize();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  input.addEventListener("input", autoResize);

  let finished = false;

  const restore = (text) => {
    if (finished) return;
    finished = true;
    editingTaskId = null;
    row.classList.remove("editing");
    row.draggable = true;

    const label = document.createElement("span");
    label.className = "task-text";
    label.textContent = text;
    label.addEventListener("click", () => startEditTask(task, label, row));
    input.replaceWith(label);
  };

  const commit = async () => {
    if (finished) return;

    const newText = input.value.trim();
    if (!newText) {
      restore(task.text);
      return;
    }

    if (newText !== task.text) {
      await window.api.updateTask(task.id, newText);
      task.text = newText;
    }
    restore(newText);
  };

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      restore(task.text);
    }
  });

  input.addEventListener("blur", commit);
}

async function addTask(textOverride = null) {
  if ((!tourActive && animating) || !currentProject) return;

  const text = (textOverride ?? taskInput.value).trim();
  if (!text) return;

  const taskId = await window.api.addTask(currentProject.id, text);
  taskInput.value = "";
  resetFieldHeight(taskInput);

  appendTaskRow(todoList, { id: taskId, text }, false, { highlight: true });
  if (!tourActive) scrollProjectToBottom();
  notifyTour("task-added", { taskId });
}

async function addTaskWithText(text) {
  taskInput.value = text;
  await addTask(text);
}

async function addNote(textOverride = null) {
  if (!currentProject) return;

  const text = (textOverride ?? notesInput.value).trim();
  if (!text) return;

  const noteId = await window.api.addNote(currentProject.id, text);
  notesInput.value = "";
  resetFieldHeight(notesInput);
  await loadNotes({ highlightId: noteId });
  if (!tourActive) scrollProjectToBottom();
  notifyTour("note-added");
}

async function addNoteWithText(text) {
  notesInput.value = text;
  await addNote(text);
}

async function markDone(task, row) {
  if (tourDragOnly) return;
  if (animating) return;
  animating = true;

  notifyTour("task-done", { row, task });

  row.classList.add("completing");
  await wait(tourActive ? 600 : 450);

  await window.api.markTaskDone(task.id);
  row.remove();
  showTaskEmptyHint(todoList, false);
  appendTaskRow(doneList, task, true, { arrivingDone: true });

  animating = false;
}

async function markUndone(task, row) {
  if (tourDragOnly) return;
  if (animating) return;
  animating = true;

  row.classList.add("removing");
  await wait(300);

  await window.api.markTaskUndone(task.id);
  row.remove();
  showTaskEmptyHint(doneList, true);
  prependTaskRow(todoList, task, false, { highlight: true });

  animating = false;
}

async function removeTask(task, row, isDone) {
  if (tourDragOnly) return;
  if (animating) return;
  animating = true;

  const container = row.parentElement;
  row.classList.add("removing");
  if (tourActive) {
    notifyTour("task-removing", { row, isDone });
  }
  await wait(tourActive ? 480 : 300);

  await window.api.deleteTask(task.id);
  row.remove();
  showTaskEmptyHint(container, isDone);
  animating = false;
  notifyTour(isDone ? "task-deleted-done" : "task-deleted-todo");
}

async function copyTask(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = "Copied";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("copied");
    }, 1200);
  } catch {
    btn.textContent = "Failed";
    setTimeout(() => {
      btn.textContent = "Copy";
    }, 1200);
  }
}

// ── Notes ────────────────────────────────────────────────────────────────────

async function loadNotes({ highlightId = null } = {}) {
  if (!currentProject) return;

  const notes = await window.api.listNotes(currentProject.id);
  renderNotesList(notes, highlightId);
}

function renderNotesList(notes, highlightId = null) {
  notesList.innerHTML = "";

  if (notes.length === 0) {
    notesList.innerHTML = `<p class="empty-hint">Notes appear here</p>`;
    return;
  }

  notes.forEach((note, i) => {
    const row = document.createElement("div");
    row.className = "note-row";
    row.dataset.id = note.id;
    row.style.animationDelay = `${(notes.length - 1 - i) * 40}ms`;

    if (note.id === highlightId) row.classList.add("highlight");

    row.innerHTML = `
      <span class="note-text">${escapeHtml(note.text)}</span>
      <button class="btn btn-copy" title="Copy">Copy</button>
      <button class="btn btn-delete" title="Delete">✕</button>
    `;

    const textEl = row.querySelector(".note-text");
    const copyBtn = row.querySelector(".btn-copy");
    const deleteBtn = row.querySelector(".btn-delete");

    wireNoteText(note, textEl, row);
    wireNoteActionButton(copyBtn, note, row, "copy", () => copyTask(note.text, copyBtn));
    wireNoteActionButton(deleteBtn, note, row, "delete", () => removeNote(note, row));

    notesList.appendChild(row);
  });
}

function showNoteEmptyHint() {
  if (notesList.querySelector(".note-row")) return;
  notesList.innerHTML = `<p class="empty-hint">Notes appear here</p>`;
}

function wireNoteText(note, textEl, row) {
  textEl.tabIndex = 0;
  textEl.addEventListener("click", () => startEditNote(note, textEl, row));
  textEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      startEditNote(note, textEl, row);
      return;
    }
    handleNoteKeydown(e);
  });
}

function startEditNote(note, textEl, row) {
  if (animating || editingNoteId || editingTaskId) return;

  editingNoteId = note.id;
  row.classList.add("editing");

  const input = document.createElement("textarea");
  input.className = "note-text-input";
  input.value = note.text;
  input.rows = 1;

  const autoResize = () => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };

  textEl.replaceWith(input);
  autoResize();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  input.addEventListener("input", autoResize);

  let finished = false;

  const restore = (text) => {
    if (finished) return;
    finished = true;
    editingNoteId = null;
    row.classList.remove("editing");

    const label = document.createElement("span");
    label.className = "note-text";
    label.textContent = text;
    wireNoteText(note, label, row);
    input.replaceWith(label);
  };

  const commit = async () => {
    if (finished) return;

    const newText = input.value.trim();
    if (!newText) {
      restore(note.text);
      return;
    }

    if (newText !== note.text) {
      await window.api.updateNote(note.id, newText);
      note.text = newText;
    }
    restore(newText);
  };

  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      restore(note.text);
    }
  });

  input.addEventListener("blur", commit);
}

async function removeNote(note, row) {
  if (animating) return;
  animating = true;

  row.classList.add("removing");
  await wait(300);
  await window.api.deleteNote(note.id);
  row.remove();
  showNoteEmptyHint();
  animating = false;
}

// ── Todo keyboard navigation ─────────────────────────────────────────────────

const TODO_BTN_COLS = ["delete", "copy", "done"];
const DONE_BTN_COLS = ["undo", "delete"];

function getTodoRows() {
  return [...todoList.querySelectorAll(".task-row:not(.editing)")];
}

function getDoneRows() {
  return [...doneList.querySelectorAll(".task-row:not(.editing)")];
}

function getTodoRowButton(row, col) {
  if (col === "delete") return row.querySelector(".btn-delete");
  if (col === "copy") return row.querySelector(".btn-copy");
  if (col === "done") return row.querySelector(".btn-done");
  return null;
}

function getDoneRowButton(row, col) {
  if (col === "undo") return row.querySelector(".task-done-label");
  if (col === "delete") return row.querySelector(".btn-delete");
  return null;
}

function getTodoButtonCol(btn) {
  if (btn.classList.contains("btn-delete")) return "delete";
  if (btn.classList.contains("btn-copy")) return "copy";
  if (btn.classList.contains("btn-done")) return "done";
  return null;
}

function getDoneButtonCol(btn) {
  if (btn.classList.contains("task-done-label")) return "undo";
  if (btn.classList.contains("btn-delete")) return "delete";
  return null;
}

function mapTodoColToDoneCol(col) {
  if (col === "done") return "delete";
  return "undo";
}

function mapDoneColToTodoCol(col) {
  if (col === "delete") return "done";
  return "delete";
}

function focusTodoButton(row, col) {
  const btn = getTodoRowButton(row, col);
  if (!btn) return;
  btn.focus();
  btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function focusDoneButton(row, col) {
  const btn = getDoneRowButton(row, col);
  if (!btn) return;
  btn.focus();
  btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function focusTodoButtonAfterRemove(removedIndex, col) {
  const rows = getTodoRows();
  if (rows.length === 0) {
    taskInput.focus();
    return;
  }
  const nextIndex = Math.min(removedIndex, rows.length - 1);
  focusTodoButton(rows[nextIndex], col);
}

function focusDoneButtonAfterRemove(removedIndex, col) {
  const rows = getDoneRows();
  if (rows.length === 0) {
    const todos = getTodoRows();
    if (todos.length > 0) {
      focusTodoButton(todos[0], mapDoneColToTodoCol(col));
    } else {
      taskInput.focus();
    }
    return;
  }
  const nextIndex = Math.min(removedIndex, rows.length - 1);
  focusDoneButton(rows[nextIndex], col);
}

function isTextareaOnFirstLine(textarea) {
  const before = textarea.value.slice(0, textarea.selectionStart);
  return !before.includes("\n");
}

function isTextareaOnLastLine(textarea) {
  const after = textarea.value.slice(textarea.selectionStart);
  return !after.includes("\n");
}

function wireTodoActionButton(btn, task, row, col, action) {
  const run = async () => {
    if (animating || editingTaskId || tourDragOnly) return;
    const rowIndex = getTodoRows().indexOf(row);
    await action();
    if (col !== "copy") {
      focusTodoButtonAfterRemove(rowIndex, col);
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    run();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
      return;
    }
    handleTodoButtonKeydown(e);
  });
}

function wireDoneActionButton(btn, task, row, col, action) {
  const run = async () => {
    if (animating || editingTaskId) return;
    const rowIndex = getDoneRows().indexOf(row);
    await action();
    focusDoneButtonAfterRemove(rowIndex, col);
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    run();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
      return;
    }
    handleDoneButtonKeydown(e);
  });
}

function handleTodoButtonKeydown(e) {
  if (animating || editingTaskId || tourDragOnly) return;

  const rows = getTodoRows();
  const row = e.currentTarget.closest(".task-row");
  const rowIndex = rows.indexOf(row);
  const col = getTodoButtonCol(e.currentTarget);
  if (rowIndex === -1 || !col) return;

  const colIndex = TODO_BTN_COLS.indexOf(col);

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (colIndex > 0) focusTodoButton(row, TODO_BTN_COLS[colIndex - 1]);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    if (colIndex < TODO_BTN_COLS.length - 1) focusTodoButton(row, TODO_BTN_COLS[colIndex + 1]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (rowIndex > 0) {
      focusTodoButton(rows[rowIndex - 1], col);
    } else {
      const doneRows = getDoneRows();
      if (doneRows.length > 0) {
        focusDoneButton(doneRows[doneRows.length - 1], mapTodoColToDoneCol(col));
      }
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (rowIndex < rows.length - 1) {
      focusTodoButton(rows[rowIndex + 1], col);
    } else {
      taskInput.focus();
    }
  }
}

function handleDoneButtonKeydown(e) {
  if (animating || editingTaskId) return;

  const rows = getDoneRows();
  const row = e.currentTarget.closest(".task-row");
  const rowIndex = rows.indexOf(row);
  const col = getDoneButtonCol(e.currentTarget);
  if (rowIndex === -1 || !col) return;

  const colIndex = DONE_BTN_COLS.indexOf(col);

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (colIndex > 0) focusDoneButton(row, DONE_BTN_COLS[colIndex - 1]);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    if (colIndex < DONE_BTN_COLS.length - 1) focusDoneButton(row, DONE_BTN_COLS[colIndex + 1]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (rowIndex > 0) focusDoneButton(rows[rowIndex - 1], col);
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (rowIndex < rows.length - 1) {
      focusDoneButton(rows[rowIndex + 1], col);
    } else {
      const todos = getTodoRows();
      if (todos.length > 0) {
        focusTodoButton(todos[0], mapDoneColToTodoCol(col));
      } else {
        taskInput.focus();
      }
    }
  }
}

function focusLowestTodoDone() {
  const rows = getTodoRows();
  if (rows.length === 0) return false;
  focusTodoButton(rows[rows.length - 1], "done");
  return true;
}

// ── Note keyboard navigation ───────────────────────────────────────────────────

const NOTE_COLS = ["text", "copy", "delete"];

function getNoteRows() {
  return [...notesList.querySelectorAll(".note-row:not(.editing)")];
}

function getNoteColElement(row, col) {
  if (col === "text") return row.querySelector(".note-text");
  if (col === "copy") return row.querySelector(".btn-copy");
  if (col === "delete") return row.querySelector(".btn-delete");
  return null;
}

function getNoteCol(el) {
  if (el.classList.contains("note-text")) return "text";
  if (el.classList.contains("btn-copy")) return "copy";
  if (el.classList.contains("btn-delete")) return "delete";
  return null;
}

function focusNoteCol(row, col) {
  const el = getNoteColElement(row, col);
  if (!el) return;
  el.focus();
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function focusNoteColAfterRemove(removedIndex, col) {
  const rows = getNoteRows();
  if (rows.length === 0) {
    notesInput.focus();
    return;
  }
  const nextIndex = Math.min(removedIndex, rows.length - 1);
  focusNoteCol(rows[nextIndex], col);
}

function focusTopNoteCopy() {
  const rows = getNoteRows();
  if (rows.length === 0) return false;
  focusNoteCol(rows[0], "copy");
  return true;
}

function wireNoteActionButton(btn, note, row, col, action) {
  const run = async () => {
    if (animating || editingNoteId) return;
    const rowIndex = getNoteRows().indexOf(row);
    await action();
    if (col !== "copy") {
      focusNoteColAfterRemove(rowIndex, col);
    }
  };

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    run();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
      return;
    }
    handleNoteKeydown(e);
  });
}

function handleNoteKeydown(e) {
  if (animating || editingNoteId) return;

  const rows = getNoteRows();
  const row = e.currentTarget.closest(".note-row");
  const rowIndex = rows.indexOf(row);
  const col = getNoteCol(e.currentTarget);
  if (rowIndex === -1 || !col) return;

  const colIndex = NOTE_COLS.indexOf(col);

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    if (colIndex > 0) focusNoteCol(row, NOTE_COLS[colIndex - 1]);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    if (colIndex < NOTE_COLS.length - 1) focusNoteCol(row, NOTE_COLS[colIndex + 1]);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (rowIndex > 0) {
      focusNoteCol(rows[rowIndex - 1], col);
    } else {
      notesInput.focus();
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (rowIndex < rows.length - 1) {
      focusNoteCol(rows[rowIndex + 1], col);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scrollProjectToBottom() {
  const scroll = document.querySelector("#project-view .view-scroll");
  if (!scroll) return;
  requestAnimationFrame(() => {
    scroll.scrollTop = scroll.scrollHeight;
  });
}

const FIELD_MAX_HEIGHT = 280;

function autoResizeField(field) {
  if (!field) return;

  field.style.height = "auto";
  const maxHeight = Math.min(FIELD_MAX_HEIGHT, window.innerHeight * 0.32);
  const nextHeight = Math.min(field.scrollHeight, maxHeight);
  field.style.height = `${nextHeight}px`;
  field.style.overflowY = field.scrollHeight > maxHeight ? "auto" : "hidden";
}

function resetFieldHeight(field) {
  if (!field) return;
  field.style.height = "auto";
  field.style.overflowY = "hidden";
  autoResizeField(field);
}

// ── Events ───────────────────────────────────────────────────────────────────

$("#new-project-btn").addEventListener("click", openNewProjectModal);
$("#modal-cancel").addEventListener("click", closeModal);
$("#modal-create").addEventListener("click", createProject);
guideBtn.addEventListener("click", openGuide);
readmeBtn.addEventListener("click", openReadme);
$("#readme-close").addEventListener("click", closeReadme);
$("#back-btn").addEventListener("click", showHome);

projectNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") createProject();
  if (e.key === "Escape") closeModal();
});

modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeModal();
});

readmeOverlay.addEventListener("click", (e) => {
  if (e.target === readmeOverlay) closeReadme();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!readmeOverlay.classList.contains("hidden")) closeReadme();
});

taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    addTask();
    return;
  }

  if (e.key === "ArrowUp" && isTextareaOnFirstLine(taskInput)) {
    if (focusLowestTodoDone()) e.preventDefault();
    return;
  }

  if (e.key === "ArrowDown" && isTextareaOnLastLine(taskInput)) {
    e.preventDefault();
    notesInput.focus();
  }
});

taskInput.addEventListener("input", () => autoResizeField(taskInput));

notesInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.shiftKey) {
    e.preventDefault();
    addNote();
    return;
  }

  if (e.key === "ArrowUp" && isTextareaOnFirstLine(notesInput)) {
    e.preventDefault();
    taskInput.focus();
    return;
  }

  if (e.key === "ArrowDown" && isTextareaOnLastLine(notesInput)) {
    if (focusTopNoteCopy()) e.preventDefault();
  }
});

notesInput.addEventListener("input", () => autoResizeField(notesInput));

window.addEventListener("resize", () => {
  autoResizeField(taskInput);
  autoResizeField(notesInput);
});

// ── Init ─────────────────────────────────────────────────────────────────────

window.GuideTourDeps = {
  wait,
  showHome,
  showProject,
  loadProjects,
  closeModal,
  closeReadme,
  setTourLock,
  clearTourLock,
  setTourDragOnly(active) {
    tourDragOnly = active;
  },
  setTourActive(active) {
    tourActive = active;
    if (!active) {
      tourDragOnly = false;
      clearTourLock();
    }
  },
  get taskInput() {
    return taskInput;
  },
  get notesInput() {
    return notesInput;
  },
  addTaskWithText,
  addNoteWithText,
  markDone,
  markUndone,
  removeTask,
  moveTodoRowForTour,
  copyTask,
  taskFromRow(row) {
    return {
      id: Number(row.dataset.id),
      text: row.querySelector(".task-text")?.textContent ?? "",
    };
  },
  async editTaskText(task, textEl, row, newText) {
    startEditTask(task, textEl, row);
    await wait(200);
    const input = row.querySelector(".task-text-input");
    if (!input) return;
    input.value = newText;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await wait(350);
  },
  scrollToTodo() {
    const scroll = document.querySelector("#project-view .view-scroll");
    const todo = document.querySelector("#todo-list");
    if (scroll && todo) {
      scroll.scrollTop = Math.max(0, todo.offsetTop - 80);
    }
  },
  scrollToNotes() {
    const scroll = document.querySelector("#project-view .view-scroll");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  },
};

setupTodoListDragDrop();
loadProjects();
