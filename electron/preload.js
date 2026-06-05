const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  listProjects: () => ipcRenderer.invoke("projects:list"),
  resetTutorial: () => ipcRenderer.invoke("tutorial:reset"),
  deleteTutorial: () => ipcRenderer.invoke("tutorial:delete"),
  createProject: (name) => ipcRenderer.invoke("projects:create", name),
  deleteProject: (id) => ipcRenderer.invoke("projects:delete", id),
  touchProject: (id) => ipcRenderer.invoke("projects:touch", id),
  getProjectPath: (name) => ipcRenderer.invoke("projects:getPath", name),
  openInCursor: (name) => ipcRenderer.invoke("projects:openInCursor", name),
  listTasks: (projectId, done) => ipcRenderer.invoke("tasks:list", projectId, done),
  addTask: (projectId, text) => ipcRenderer.invoke("tasks:add", projectId, text),
  markTaskDone: (taskId) => ipcRenderer.invoke("tasks:done", taskId),
  markTaskUndone: (taskId) => ipcRenderer.invoke("tasks:undone", taskId),
  deleteTask: (taskId) => ipcRenderer.invoke("tasks:delete", taskId),
  updateTask: (taskId, text) => ipcRenderer.invoke("tasks:update", taskId, text),
  reorderTasks: (projectId, orderedIds) =>
    ipcRenderer.invoke("tasks:reorder", projectId, orderedIds),
  listNotes: (projectId) => ipcRenderer.invoke("notes:list", projectId),
  addNote: (projectId, text) => ipcRenderer.invoke("notes:add", projectId, text),
  deleteNote: (noteId) => ipcRenderer.invoke("notes:delete", noteId),
  updateNote: (noteId, text) => ipcRenderer.invoke("notes:update", noteId, text),
});
