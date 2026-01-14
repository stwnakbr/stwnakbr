// ===================================
// GOOGLE SHEETS CONFIGURATION
// ===================================

const PROJECTS_SPREADSHEET_ID = "18lOZdnclKFFqA-j_DtWbtjFegjn8VUDWVQP9gGPAOA4";
const DEPARTMENT_SHEETS = [
  { name: "Riset", displayName: "Riset" },
  { name: "Digitalisasi", displayName: "Digitalisasi" },
  { name: "System Development", displayName: "System Development" },
];
const PROJECTS_RANGE = "A:M";

const TODO_SPREADSHEET_ID = "1OApZRZFEj-RgtyrFq2wrRCIdUX6Spk6Y-MrGc4fZSOM";
const TODO_SHEET_NAME = "Sheet1";
const TODO_RANGE = "A:G";

const API_KEY = "AIzaSyA2aIyDp9P2NoxsH2efHpANcfKwsWL1RXw";

let projectsData = [];
let departmentData = {};
let todoData = [];
let departmentPieChart = null;

document.addEventListener("DOMContentLoaded", function () {
  loadAllData();
  setupEventListeners();
});

// ===================================
// GOOGLE SHEETS DATA LOADING
// ===================================

async function loadAllData() {
  try {
    await Promise.all([loadProjectsData(), loadTodoData()]);
    updateStatistics();
    updateProjectDetails();
    initializeDepartmentChart();
    updateTodoList();
  } catch (error) {
    console.error("Error loading data:", error);
    showError("Failed to load data from Google Sheets");
  }
}

async function loadProjectsData() {
  try {
    projectsData = [];
    departmentData = {};

    for (const dept of DEPARTMENT_SHEETS) {
      const sheetData = await loadSheetData(dept.name, dept.displayName);
      departmentData[dept.displayName] = sheetData;
      projectsData.push(...sheetData);
    }

    console.log("✅ All projects data loaded:", projectsData.length, "activities");
  } catch (error) {
    console.error("Error loading projects data:", error);
    throw error;
  }
}

async function loadSheetData(sheetName, departmentName) {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${PROJECTS_SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!${PROJECTS_RANGE}?key=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values || data.values.length <= 1) {
      console.warn(`⚠️ No data found in ${sheetName} sheet`);
      return [];
    }

    const headers = data.values[0].map((h) => (h ? h.toString().toLowerCase().trim() : ""));

    const colMap = {
      no: headers.findIndex((h) => h.includes("no") && !h.includes("note")),
      projectType: headers.findIndex((h) => (h.includes("project") && h.includes("type")) || h === "project type" || h === "project"),
      prokerBacklog: headers.findIndex((h) => h.includes("proker") || h.includes("backlog")),
      priority: headers.findIndex((h) => h.includes("priority")),
      aktivitas: headers.findIndex((h) => h.includes("aktivitas") || h.includes("activity")),
      role: headers.findIndex((h) => h.includes("role")),
      mandays: headers.findIndex((h) => h.includes("mandays") || h.includes("man days") || (h.includes("est") && h.includes("day"))),
      status: headers.findIndex((h) => (h.includes("status") && !h.includes("plan") && !h.includes("actual")) || h === "status"),
      plan: headers.findIndex((h) => h === "plan" || (h.includes("plan") && !h.includes("start") && !h.includes("end"))),
      actual: headers.findIndex((h) => h === "actual" || (h.includes("actual") && !h.includes("start") && !h.includes("end"))),
    };

    if (colMap.projectType === -1 || colMap.status === -1) {
      if (colMap.no === -1) colMap.no = 0;
      if (colMap.projectType === -1) colMap.projectType = 1;
      if (colMap.prokerBacklog === -1) colMap.prokerBacklog = 2;
      if (colMap.priority === -1) colMap.priority = 3;
      if (colMap.aktivitas === -1) colMap.aktivitas = 4;
      if (colMap.role === -1) colMap.role = 5;
      if (colMap.mandays === -1) colMap.mandays = 6;
      if (colMap.status === -1) colMap.status = 7;
      if (colMap.plan === -1) colMap.plan = 8;
      if (colMap.actual === -1) colMap.actual = 10;
    }

    const rows = data.values.slice(1);

    let currentProjectType = null;
    let currentProkerBacklog = null;
    let currentPriority = null;

    console.log(`🔍 ${sheetName} - Processing ${rows.length} rows`);

    const sheetActivities = rows
      .map((row, index) => {
        if (row[colMap.projectType] && row[colMap.projectType] !== "-" && row[colMap.projectType].toString().trim() !== "") {
          currentProjectType = row[colMap.projectType];
          console.log(`  📌 Row ${index + 2}: New ProjectType = "${currentProjectType}"`);
        }

        if (row[colMap.prokerBacklog] && row[colMap.prokerBacklog] !== "-" && row[colMap.prokerBacklog].toString().trim() !== "") {
          currentProkerBacklog = row[colMap.prokerBacklog];
          console.log(`  📌 Row ${index + 2}: New Proker = "${currentProkerBacklog}"`);
        }

        if (row[colMap.priority] && row[colMap.priority] !== "-" && row[colMap.priority].toString().trim() !== "") {
          currentPriority = row[colMap.priority];
          console.log(`  📌 Row ${index + 2}: New Priority = "${currentPriority}"`);
        }

        if (!row[colMap.aktivitas] || row[colMap.aktivitas] === "-" || row[colMap.aktivitas].toString().trim() === "") {
          return null;
        }

        const aktivitasStr = row[colMap.aktivitas].toString().toLowerCase();

        // Check if this is a Total Mandays row (summary row) - FIX #4
        const isTotalRow = aktivitasStr.includes("total mandays");

        const item = {
          no: row[colMap.no] || "-",
          projectType: currentProjectType || "-",
          prokerBacklog: currentProkerBacklog || "-",
          priority: currentPriority || "-",
          aktivitas: row[colMap.aktivitas] || "-",
          role: row[colMap.role] || "-",
          mandays: parseFloat(row[colMap.mandays]) || 0,
          status: normalizeStatus(row[colMap.status]),
          planStart: row[colMap.plan] || "-",
          planEnd: row[colMap.plan + 1] || "-",
          actualStart: row[colMap.actual] || "-",
          actualEnd: row[colMap.actual + 1] || "-",
          departemen: departmentName,
          pic: "-",
          projectId: `${departmentName}_${currentProjectType}_${currentProkerBacklog}`.replace(/\s+/g, "_"),
          isTotalRow: isTotalRow,
        };

        console.log(`  ✅ Row ${index + 2}: Activity "${item.aktivitas}" | Priority: ${item.priority}${isTotalRow ? " | TOTAL ROW" : ""}`);

        return item;
      })
      .filter((task) => task !== null && task.projectType !== "-" && task.projectType && task.aktivitas !== "-");

    console.log(`✅ ${sheetName} loaded: ${sheetActivities.length} activities`);

    return sheetActivities;
  } catch (error) {
    console.error(`Error loading ${sheetName}:`, error);
    return [];
  }
}

async function loadTodoData() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${TODO_SPREADSHEET_ID}/values/${TODO_SHEET_NAME}!${TODO_RANGE}?key=${API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.values && data.values.length > 1) {
      const rows = data.values.slice(1);

      todoData = rows
        .map((row) => ({
          no: row[0] || "-",
          tipe: row[1] || "-",
          departemen: row[2] || "-",
          item: row[3] || "-",
          pic: row[4] || "-",
          dueDate: row[5] || "-",
          status: normalizeStatus(row[6]),
        }))
        .filter((task) => task.item !== "-" && task.item);

      console.log("✅ To-Do data loaded:", todoData.length, "items");
    }
  } catch (error) {
    console.error("Error loading to-do data:", error);
    throw error;
  }
}

function normalizeStatus(status) {
  if (!status || status === "-" || status === "NaN" || status === "nan" || status.toString().trim() === "") {
    return "Outstanding";
  }

  const statusLower = status.toString().toLowerCase().trim();

  if (statusLower === "done" || statusLower === "completed" || statusLower === "complete") {
    return "Complete";
  } else if (statusLower === "in progress" || statusLower === "progress") {
    return "In Progress";
  } else {
    return "Outstanding";
  }
}

// ===================================
// STATISTICS UPDATE - FIX #4: Exclude total rows from count
// ===================================

function updateStatistics() {
  if (projectsData.length === 0) {
    console.log("No projects data available for statistics");
    return;
  }

  const projectGroups = {};
  
  // FIX #4: Filter out total rows from project counting
  const regularActivities = projectsData.filter(task => !task.isTotalRow);
  
  regularActivities.forEach((task) => {
    const id = task.projectId;
    if (id && id !== "-_-" && id !== "--") {
      if (!projectGroups[id]) {
        projectGroups[id] = {
          id: id,
          projectType: task.projectType,
          prokerBacklog: task.prokerBacklog,
          departemen: task.departemen,
          activities: [],
          totalMandays: 0,
        };
      }
      projectGroups[id].activities.push(task);
      projectGroups[id].totalMandays += task.mandays || 0;
    }
  });

  const projects = Object.values(projectGroups);

  const totalProjects = projects.length;
  document.getElementById("totalProjects").textContent = totalProjects;

  let completedCount = 0;
  let progressCount = 0;

  projects.forEach((project) => {
    const allComplete = project.activities.every((act) => act.status === "Complete");
    const hasProgress = project.activities.some((act) => act.status === "In Progress");
    const hasComplete = project.activities.some((act) => act.status === "Complete");

    if (allComplete) {
      completedCount++;
    } else if (hasProgress || hasComplete) {
      progressCount++;
    }
  });

  document.getElementById("completedProjects").textContent = completedCount;
  document.getElementById("inProgressProjects").textContent = progressCount;

  const totalMandays = projects.reduce((sum, project) => sum + project.totalMandays, 0);
  document.getElementById("totalMandays").textContent = totalMandays.toFixed(0);

  console.log("📊 Statistics Updated:");
  console.log("- Total Projects:", totalProjects);
  console.log("- Completed Projects:", completedCount);
  console.log("- In Progress Projects:", progressCount);
}

// ===================================
// PROJECT DETAILS UPDATE - FIX #4
// ===================================

function updateProjectDetails() {
  const detailsList = document.getElementById("projectDetailsList");

  if (projectsData.length === 0) {
    detailsList.innerHTML = '<div class="no-data">No projects available</div>';
    return;
  }

  const projectGroups = {};
  
  // FIX #4: Exclude total rows from project details
  const regularActivities = projectsData.filter(task => !task.isTotalRow);
  
  regularActivities.forEach((task) => {
    const id = task.projectId;
    if (id && id !== "-_-" && id !== "--") {
      if (!projectGroups[id]) {
        projectGroups[id] = {
          id: id,
          projectType: task.projectType,
          prokerBacklog: task.prokerBacklog,
          departemen: task.departemen,
          activities: [],
          totalMandays: 0,
          completed: 0,
          inProgress: 0,
          outstanding: 0,
        };
      }
      projectGroups[id].activities.push(task);
      projectGroups[id].totalMandays += task.mandays || 0;
      if (task.status === "Complete") projectGroups[id].completed++;
      else if (task.status === "In Progress") projectGroups[id].inProgress++;
      else projectGroups[id].outstanding++;
    }
  });

  const projects = Object.values(projectGroups).slice(0, 5);

  detailsList.innerHTML = projects
    .map(
      (project) => `
    <div class="detail-item" data-project-id="${escapeHtml(project.id)}" onclick="showProjectActivitiesModal('${escapeHtml(project.id)}')">
      <div class="detail-item-header">
        <div class="detail-item-icon">
          <i class="fas fa-folder"></i>
        </div>
        <div class="detail-item-info">
          <h4>${escapeHtml(project.projectType)}</h4>
          <span class="detail-item-count">${escapeHtml(project.prokerBacklog)} • ${escapeHtml(project.departemen)}</span>
        </div>
      </div>
      <div class="detail-item-meta">
        <span class="detail-meta-badge"><i class="fas fa-tasks"></i> ${project.activities.length} activities</span>
      </div>
      <div class="detail-item-stats">
        <div class="detail-stat">
          <span class="detail-stat-label">Complete</span>
          <span class="detail-stat-value">${project.completed}</span>
        </div>
        <div class="detail-stat">
          <span class="detail-stat-label">In Progress</span>
          <span class="detail-stat-value">${project.inProgress}</span>
        </div>
        <div class="detail-stat">
          <span class="detail-stat-label">Est. Days</span>
          <span class="detail-stat-value">${project.totalMandays.toFixed(0)}</span>
        </div>
      </div>
      <div class="detail-item-progress">
        <div class="progress-bar-wrapper">
          <div class="progress-bar-fill" style="width: ${project.activities.length > 0 ? ((project.completed / project.activities.length) * 100).toFixed(0) : 0}%"></div>
        </div>
        <span class="progress-percentage">${project.activities.length > 0 ? ((project.completed / project.activities.length) * 100).toFixed(0) : 0}%</span>
      </div>
    </div>
  `
    )
    .join("");
}

// Show project activities without filters - direct from homepage
function showProjectActivitiesModal(projectId) {
  const modal = document.getElementById("detailModal");
  if (!modal) return;

  const activities = projectsData.filter((task) => task.projectId === projectId);

  if (activities.length === 0) {
    console.error("No activities found for project:", projectId);
    return;
  }

  const projectInfo = activities[0];

  const modalTitle = modal.querySelector(".modal-header h2");
  modalTitle.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <button class="back-btn" onclick="backToProjectsList()" style="margin: 0; padding: 10px 16px;">
        <i class="fas fa-arrow-left"></i> Back
      </button>
      <div>
        <i class="fas fa-folder-open"></i> ${escapeHtml(projectInfo.projectType)}
        <span style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-left: 8px;">
          • ${escapeHtml(projectInfo.prokerBacklog)} • ${escapeHtml(projectInfo.departemen)}
        </span>
      </div>
    </div>
  `;

  // HIDE filters when opening from homepage project click
  const filtersDiv = modal.querySelector(".detail-filters");
  if (filtersDiv) {
    filtersDiv.style.display = "none";
  }

  // Show ALL activities without filtering
  let displayActivities = activities;

  const content = document.getElementById("detailModalContent");

  if (displayActivities.length === 0) {
    content.innerHTML = `
      <div class="no-data">
        <p>No activities found</p>
        <p style="font-size: 12px; margin-top: 8px;">Total activities in this project: ${activities.length}</p>
      </div>
    `;
  } else {
    const regularActivities = displayActivities.filter((act) => !act.isTotalRow);
    const totalRows = displayActivities.filter((act) => act.isTotalRow);

    const activitiesHTML = regularActivities
      .map((activity) => {
        let priorityText = activity.priority;
        let priorityClass = "priority-medium";

        if (activity.priority === "1" || activity.priority === 1) {
          priorityText = "High";
          priorityClass = "priority-high";
        } else if (activity.priority === "2" || activity.priority === 2) {
          priorityText = "Medium";
          priorityClass = "priority-medium";
        } else if (activity.priority === "3" || activity.priority === 3) {
          priorityText = "Low";
          priorityClass = "priority-low";
        } else if (activity.priority.toString().toLowerCase() === "high") {
          priorityText = "High";
          priorityClass = "priority-high";
        } else if (activity.priority.toString().toLowerCase() === "medium") {
          priorityText = "Medium";
          priorityClass = "priority-medium";
        } else if (activity.priority.toString().toLowerCase() === "low") {
          priorityText = "Low";
          priorityClass = "priority-low";
        }

        return `
      <div class="activity-item-modal">
        <div class="activity-header">
          <div class="activity-title-row">
            <h4><i class="fas fa-tasks"></i> ${escapeHtml(activity.aktivitas)}</h4>
            <span class="todo-item-status status-${activity.status.toLowerCase().replace(" ", "-")}">${activity.status}</span>
          </div>
          <div class="activity-badges">
            <span class="activity-badge ${priorityClass}">
              <i class="fas fa-exclamation-circle"></i> ${priorityText}
            </span>
            <span class="activity-badge role-badge">
              <i class="fas fa-user-tag"></i> ${escapeHtml(activity.role)}
            </span>
            <span class="activity-badge mandays-badge">
              <i class="fas fa-clock"></i> ${activity.mandays} days
            </span>
          </div>
        </div>
        
        <div class="activity-details">
          <div class="activity-timeline">
            <div class="timeline-section">
              <div class="timeline-header">
                <i class="fas fa-calendar-check"></i> Planned Timeline
              </div>
              <div class="timeline-dates">
                <span class="timeline-date">
                  <strong>Start:</strong> ${activity.planStart !== "-" ? formatDate(activity.planStart) : "Not set"}
                </span>
                <span class="timeline-separator">→</span>
                <span class="timeline-date">
                  <strong>End:</strong> ${activity.planEnd !== "-" ? formatDate(activity.planEnd) : "Not set"}
                </span>
              </div>
            </div>
            
            <div class="timeline-section">
              <div class="timeline-header">
                <i class="fas fa-calendar-alt"></i> Actual Timeline
              </div>
              <div class="timeline-dates">
                <span class="timeline-date">
                  <strong>Start:</strong> ${activity.actualStart !== "-" ? formatDate(activity.actualStart) : "Not started"}
                </span>
                <span class="timeline-separator">→</span>
                <span class="timeline-date">
                  <strong>End:</strong> ${activity.actualEnd !== "-" ? formatDate(activity.actualEnd) : "Not finished"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
      })
      .join("");

    // FIX #6: More compact display for Total Mandays
    const totalRowsHTML = totalRows
      .map(
        (activity) => `
      <div class="activity-item-modal activity-total-row">
        <div class="activity-header">
          <div class="activity-title-row">
            <h4><i class="fas fa-calculator"></i> ${escapeHtml(activity.aktivitas)}</h4>
          </div>
        </div>
        <div class="total-mandays-display">
          <span class="total-label">Total Mandays</span>
          <span class="total-value">${activity.mandays} days</span>
        </div>
      </div>
    `
      )
      .join("");

    content.innerHTML = `
      <div class="activities-grid-2col">
        ${activitiesHTML}
      </div>
      ${
        totalRows.length > 0
          ? `
        <div class="total-rows-grid-2col">
          ${totalRowsHTML}
        </div>
      `
          : ""
      }
    `;
  }

  modal.classList.add("show");
  document.body.style.overflow = "hidden";
}

function backToProjectsList() {
  const modal = document.getElementById("detailModal");
  if (!modal) return;

  const modalTitle = modal.querySelector(".modal-header h2");
  modalTitle.innerHTML = '<i class="fas fa-list-alt"></i> All Projects';

  const filtersDiv = modal.querySelector(".detail-filters");
  if (filtersDiv) filtersDiv.style.display = "flex";

  filterDetailModal();
}

// FIX #3: Improved date formatting - consistent format
function formatDate(dateString) {
  if (!dateString || dateString === "-") return "-";
  
  try {
    // Try to parse the date
    let date;
    
    // Check if it's in DD/MM/YYYY format
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        // Assume DD/MM/YYYY or MM/DD/YYYY
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        // If day > 12, it's DD/MM/YYYY
        if (day > 12) {
          date = new Date(year, month - 1, day);
        } else {
          // Try both interpretations
          date = new Date(year, month - 1, day);
        }
      }
    } else {
      // Try standard Date parsing
      date = new Date(dateString);
    }
    
    if (isNaN(date.getTime())) return dateString;

    // Indonesian month names
    const monthNames = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();

    return `${day.toString().padStart(2, "0")} ${month} ${year}`;
  } catch (e) {
    console.error("Error formatting date:", dateString, e);
    return dateString;
  }
}

// ===================================
// TODO LIST UPDATE
// ===================================

function updateTodoList() {
  const todoList = document.getElementById("todoList");

  if (todoData.length === 0) {
    todoList.innerHTML = '<div class="no-data">No tasks available</div>';
    return;
  }

  todoList.innerHTML = "";

  todoData.forEach((task) => {
    const todoItem = createTodoItem(task);
    todoList.appendChild(todoItem);
  });

  updateTodoCount();
}

function createTodoItem(task) {
  const div = document.createElement("div");
  div.className = "todo-item";

  div.setAttribute("data-due", task.dueDate);
  div.setAttribute("data-status", task.status);
  div.setAttribute("data-department", task.departemen);

  const isChecked = task.status === "Complete";
  if (isChecked) {
    div.classList.add("checked");
  }

  const dueDateDisplay = formatDueDate(task.dueDate);
  const formattedItem = formatItemText(task.item);

  div.innerHTML = `
    <input type="checkbox" ${isChecked ? "checked" : ""} />
    <div class="todo-item-content">
      <div class="todo-item-title">${formattedItem}</div>
      <div class="todo-item-meta">
        <span class="todo-item-pic"><i class="fas fa-user"></i> ${escapeHtml(task.pic)}</span>
        <span class="todo-item-due ${getDueDateClass(task.dueDate)}">${dueDateDisplay}</span>
      </div>
      <span class="todo-item-status status-${task.status.toLowerCase().replace(" ", "-")}">${task.status}</span>
    </div>
  `;

  div.onclick = function () {
    toggleTodoItem(this);
  };

  return div;
}

function formatItemText(text) {
  if (!text) return "";
  const escaped = escapeHtml(text);
  return escaped.replace(/\n/g, "<br>").replace(/\r\n/g, "<br>");
}

function formatDueDate(dueDate) {
  if (!dueDate || dueDate === "-" || dueDate === "NaN" || dueDate === "nan") {
    return "No due date";
  }

  try {
    const date = new Date(dueDate);
    if (isNaN(date.getTime())) {
      return "No due date";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dueDateTime = new Date(date);
    dueDateTime.setHours(0, 0, 0, 0);

    if (dueDateTime.getTime() === today.getTime()) {
      return "Due: Today";
    } else if (dueDateTime.getTime() === tomorrow.getTime()) {
      return "Due: Tomorrow";
    } else if (dueDateTime < today) {
      const options = { month: "short", day: "numeric" };
      return `Overdue (${date.toLocaleDateString("en-US", options)})`;
    } else {
      const options = { month: "short", day: "numeric" };
      return `Due: ${date.toLocaleDateString("en-US", options)}`;
    }
  } catch (e) {
    return "No due date";
  }
}

function getDueDateClass(dueDate) {
  if (!dueDate || dueDate === "-" || dueDate === "NaN" || dueDate === "nan") {
    return "";
  }

  try {
    const date = new Date(dueDate);
    if (isNaN(date.getTime())) {
      return "";
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDateTime = new Date(date);
    dueDateTime.setHours(0, 0, 0, 0);

    if (dueDateTime < today) {
      return "overdue";
    }
    return "";
  } catch (e) {
    return "";
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getPriorityText(priority) {
  if (priority === "1" || priority === 1) return "High";
  if (priority === "2" || priority === 2) return "Medium";
  if (priority === "3" || priority === 3) return "Low";

  const priorityStr = priority.toString().toLowerCase();
  if (priorityStr === "high") return "High";
  if (priorityStr === "medium") return "Medium";
  if (priorityStr === "low") return "Low";
  if (priorityStr === "critical") return "Critical";

  return priority;
}

function getPriorityClass(priority) {
  if (priority === "1" || priority === 1) return "high";
  if (priority === "2" || priority === 2) return "medium";
  if (priority === "3" || priority === 3) return "low";

  const priorityStr = priority.toString().toLowerCase();
  if (priorityStr === "high") return "high";
  if (priorityStr === "medium") return "medium";
  if (priorityStr === "low") return "low";
  if (priorityStr === "critical") return "critical";

  return "medium";
}

// ===================================
// CHART INITIALIZATION
// ===================================

function initializeDepartmentChart() {
  const ctx = document.getElementById("departmentPieChart");
  if (!ctx) return;

  const projectGroups = {};
  
  // FIX #4: Exclude total rows from department chart
  const regularActivities = projectsData.filter(task => !task.isTotalRow);
  
  regularActivities.forEach((task) => {
    const id = task.projectId;
    if (id && id !== "-_-" && id !== "--") {
      projectGroups[id] = task.departemen;
    }
  });

  const deptCounts = {};
  Object.values(projectGroups).forEach((dept) => {
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  const risetCount = deptCounts["Riset"] || 0;
  const digitalisasiCount = deptCounts["Digitalisasi"] || 0;
  const systemCount = deptCounts["System Development"] || 0;
  const totalCount = risetCount + digitalisasiCount + systemCount;

  document.getElementById("allCount").textContent = totalCount;
  document.getElementById("risetCount").textContent = risetCount;
  document.getElementById("digitalisasiCount").textContent = digitalisasiCount;
  document.getElementById("systemCount").textContent = systemCount;

  if (departmentPieChart) {
    departmentPieChart.destroy();
  }

  departmentPieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Riset", "Digitalisasi", "System Development"],
      datasets: [
        {
          data: [risetCount, digitalisasiCount, systemCount],
          backgroundColor: ["#8b5cf6", "#3b82f6", "#10b981"],
          borderWidth: 2,
          borderColor: "#ffffff",
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // FIX #2: Removed Department Distribution Details modal - direct to detail view
      onClick: (event, activeElements) => {
        if (activeElements.length > 0) {
          const index = activeElements[0].index;
          const departmentNames = ["Riset", "Digitalisasi", "System Development"];
          const clickedDepartment = departmentNames[index];
          showDepartmentDetail(clickedDepartment);
        }
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: true,
          backgroundColor: "rgba(0, 0, 0, 0.9)",
          padding: 16,
          titleFont: {
            size: 15,
            weight: "bold",
            family: "Outfit",
          },
          bodyFont: {
            size: 14,
            family: "Manrope",
          },
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const value = context.parsed || 0;
              return `${label}: ${value} projects`;
            },
          },
        },
      },
      cutout: "0%",
      animation: {
        animateRotate: true,
        animateScale: false,
        duration: 1000,
        easing: "easeInOutQuart",
      },
      interaction: {
        mode: "nearest",
        intersect: true,
      },
    },
  });
}

// ===================================
// DEPARTMENT DETAIL FUNCTIONS - FIX #2: Removed modal, direct to detail
// ===================================

// FIX #2: Removed showDepartmentModal function - no longer needed

function showDepartmentDetail(departmentName) {
  // Instead of showing a modal, directly show activities in the main detail modal
  const modal = document.getElementById("detailModal");
  if (!modal) return;

  let activities = [];
  if (departmentName === "All") {
    activities = projectsData.filter(task => !task.isTotalRow); // FIX #4
  } else {
    const deptData = departmentData[departmentName] || [];
    activities = deptData.filter(task => !task.isTotalRow); // FIX #4
  }

  if (activities.length === 0) {
    console.error("No activities found for department:", departmentName);
    return;
  }

  const completeCount = activities.filter((a) => a.status === "Complete").length;
  const inProgressCount = activities.filter((a) => a.status === "In Progress").length;
  const outstandingCount = activities.filter((a) => a.status === "Outstanding").length;

  const projectTypeMap = {};
  activities.forEach((a) => {
    const key = `${a.projectType}|${a.prokerBacklog}|${a.departemen}`;
    if (!projectTypeMap[key] && a.projectType && a.projectType !== "-") {
      projectTypeMap[key] = {
        displayName: a.projectType,
        prokerBacklog: a.prokerBacklog,
        department: a.departemen,
        count: 0,
      };
    }
    if (projectTypeMap[key]) {
      projectTypeMap[key].count++;
    }
  });

  const projectTypes = Object.entries(projectTypeMap);

  const modalBody = modal.querySelector(".modal-body");
  modalBody.innerHTML = `
    <div class="department-detail-header" style="margin-bottom: 24px;">
      <h3 style="font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; margin-bottom: 16px;">
        <i class="fas fa-building" style="color: var(--primary-blue);"></i> ${departmentName === "All" ? "All Departments" : escapeHtml(departmentName)}
      </h3>
      
      <div class="status-summary" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
        <div class="status-card" style="background: linear-gradient(135deg, #d1fae5, #a7f3d0); border-radius: 12px; padding: 16px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;"><i class="fas fa-check-circle" style="color: #047857;"></i></div>
          <div style="font-size: 28px; font-weight: 800; color: #047857; font-family: 'Outfit', sans-serif;">${completeCount}</div>
          <div style="font-size: 12px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 0.5px;">Complete</div>
        </div>
        <div class="status-card" style="background: linear-gradient(135deg, #dbeafe, #bfdbfe); border-radius: 12px; padding: 16px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;"><i class="fas fa-spinner" style="color: #1e40af;"></i></div>
          <div style="font-size: 28px; font-weight: 800; color: #1e40af; font-family: 'Outfit', sans-serif;">${inProgressCount}</div>
          <div style="font-size: 12px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">In Progress</div>
        </div>
        <div class="status-card" style="background: linear-gradient(135deg, #fee2e2, #fecaca); border-radius: 12px; padding: 16px; text-align: center;">
          <div style="font-size: 32px; margin-bottom: 8px;"><i class="fas fa-exclamation-circle" style="color: #dc2626;"></i></div>
          <div style="font-size: 28px; font-weight: 800; color: #dc2626; font-family: 'Outfit', sans-serif;">${outstandingCount}</div>
          <div style="font-size: 12px; font-weight: 700; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px;">Outstanding</div>
        </div>
      </div>
    </div>

    <div class="activities-list">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h4 style="font-size: 16px; font-weight: 800; margin: 0; color: var(--text-primary);">
          <i class="fas fa-tasks"></i> Activities
        </h4>
        <div class="project-type-filter" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="filter-chip active" data-filter="all" onclick="filterActivitiesByProjectType('${escapeHtml(departmentName)}', 'all', 'all', 'all')">
            All (${activities.length})
          </button>
          ${projectTypes
            .map(([key, info]) => {
              const filterKey = key;
              let displayName = info.displayName;

              const sameProjectType = projectTypes.filter(([k, i]) => i.displayName === info.displayName);
              if (sameProjectType.length > 1) {
                displayName = `${info.displayName} - ${info.prokerBacklog}`;
              }

              if (departmentName === "All") {
                displayName += ` (${info.department})`;
              }

              return `<button class="filter-chip" data-filter="${escapeHtml(filterKey)}" onclick="filterActivitiesByProjectType('${escapeHtml(departmentName)}', '${escapeHtml(info.displayName)}', '${escapeHtml(
                info.prokerBacklog
              )}', '${escapeHtml(info.department)}')">${escapeHtml(displayName)} (${info.count})</button>`;
            })
            .join("")}
        </div>
      </div>
      
      <div id="activitiesContainer" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
        ${activities
          .map(
            (activity) => `
          <div class="activity-item-compact" data-project-type="${escapeHtml(activity.projectType)}" data-proker-backlog="${escapeHtml(activity.prokerBacklog)}" data-department="${escapeHtml(activity.departemen)}">
            <div class="activity-compact-header">
              <h5>${escapeHtml(activity.aktivitas)}</h5>
              <span class="todo-item-status status-${activity.status.toLowerCase().replace(" ", "-")}">${activity.status}</span>
            </div>
            <div class="activity-compact-badges">
              <span class="badge-mini priority-${getPriorityClass(activity.priority)}">${getPriorityText(activity.priority)}</span>
              <span class="badge-mini role-badge">${escapeHtml(activity.role)}</span>
              <span class="badge-mini mandays-badge">${activity.mandays}d</span>
            </div>
            <div class="activity-compact-info">
              ${
                departmentName === "All"
                  ? `
              <div class="info-row">
                <span class="info-label">Dept:</span>
                <span class="info-value">${escapeHtml(activity.departemen)}</span>
              </div>
              `
                  : ""
              }
              <div class="info-row">
                <span class="info-label">Project:</span>
                <span class="info-value">${escapeHtml(activity.projectType)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Proker:</span>
                <span class="info-value">${escapeHtml(activity.prokerBacklog)}</span>
              </div>
            </div>
            <div class="activity-compact-timeline">
              <div class="timeline-compact">
                <span class="timeline-label">Plan:</span>
                <span class="timeline-value">${activity.planStart !== "-" ? formatDateCompact(activity.planStart) : "Not set"} → ${activity.planEnd !== "-" ? formatDateCompact(activity.planEnd) : "Not set"}</span>
              </div>
              <div class="timeline-compact">
                <span class="timeline-label">Actual:</span>
                <span class="timeline-value">${activity.actualStart !== "-" ? formatDateCompact(activity.actualStart) : "Not started"} → ${activity.actualEnd !== "-" ? formatDateCompact(activity.actualEnd) : "Not finished"}</span>
              </div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;

  modal.classList.add("show");
  document.body.style.overflow = "hidden";
}

// FIX #2: Removed closeDepartmentModal - no longer needed

// ===================================
// TODO LIST INTERACTIONS
// ===================================

function toggleTodoItem(element) {
  const checkbox = element.querySelector('input[type="checkbox"]');
  checkbox.checked = !checkbox.checked;

  if (checkbox.checked) {
    element.classList.add("checked");
  } else {
    element.classList.remove("checked");
  }

  updateTodoCount();
}

function updateTodoCount() {
  const todoList = document.getElementById("todoList");
  if (!todoList) return;

  const visibleItems = todoList.querySelectorAll(".todo-item:not(.hidden)");
  const uncheckedCount = Array.from(visibleItems).filter((item) => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    return checkbox && !checkbox.checked;
  }).length;

  const todoCountEl = document.getElementById("todoCount");
  if (todoCountEl) {
    todoCountEl.textContent = uncheckedCount;
  }

  const badge = document.querySelector(".todo-count-badge");
  const deptFilter = document.getElementById("departmentFilter")?.value || "all";
  const dateFilter = document.getElementById("dueDateFilter")?.value || "all";

  let filterText = "";
  if (deptFilter !== "all" || dateFilter !== "all") {
    const filters = [];
    if (deptFilter !== "all") filters.push(deptFilter);
    if (dateFilter !== "all") filters.push(dateFilter.replace("-", " "));
    filterText = ` (${filters.join(", ")})`;
  }

  if (badge) {
    badge.innerHTML = `<span id="todoCount">${uncheckedCount}</span> tasks pending${filterText}`;
  }
}

// ===================================
// TODO FILTER
// ===================================

function applyFilters() {
  const departmentFilter = document.getElementById("departmentFilter").value;
  const dueDateFilter = document.getElementById("dueDateFilter").value;

  const todoList = document.getElementById("todoList");
  if (!todoList) return;

  const todoItems = todoList.querySelectorAll(".todo-item");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  todoItems.forEach((item) => {
    const itemDept = item.getAttribute("data-department");
    const dueDate = item.getAttribute("data-due");

    let passDeptFilter = false;
    if (departmentFilter === "all") {
      passDeptFilter = true;
    } else {
      passDeptFilter = itemDept === departmentFilter;
    }

    let passDateFilter = false;

    if (dueDateFilter === "all") {
      passDateFilter = true;
    } else {
      if (!dueDate || dueDate === "-" || dueDate === "NaN" || dueDate === "nan") {
        passDateFilter = false;
      } else {
        const itemDate = parseDateSafely(dueDate);

        if (itemDate) {
          passDateFilter = checkDateFilter(itemDate, today, dueDateFilter);
        } else {
          passDateFilter = false;
        }
      }
    }

    if (passDeptFilter && passDateFilter) {
      item.classList.remove("hidden");
    } else {
      item.classList.add("hidden");
    }
  });

  updateTodoCount();
}

function parseDateSafely(dateString) {
  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return null;
    }

    date.setHours(0, 0, 0, 0);
    return date;
  } catch (e) {
    return null;
  }
}

function checkDateFilter(itemDate, today, filter) {
  switch (filter) {
    case "today":
      return isSameDay(itemDate, today);

    case "tomorrow":
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return isSameDay(itemDate, tomorrow);

    case "this-week":
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return itemDate >= today && itemDate <= weekEnd;

    case "overdue":
      return itemDate < today;

    default:
      return true;
  }
}

function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate();
}

// ===================================
// DETAIL MODAL FUNCTIONS
// ===================================

function showDetailModal() {
  const modal = document.getElementById("detailModal");
  if (modal) {
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
    populateDetailModal();
  }
}

function closeDetailModal() {
  const modal = document.getElementById("detailModal");
  if (modal) {
    modal.classList.remove("show");
    document.body.style.overflow = "auto";

    const modalTitle = modal.querySelector(".modal-header h2");
    modalTitle.innerHTML = '<i class="fas fa-list-alt"></i> All Projects';

    const filtersDiv = modal.querySelector(".detail-filters");
    if (filtersDiv) {
      filtersDiv.style.display = "flex";
    }

    document.querySelectorAll("[data-department]").forEach((btn) => {
      if (btn.getAttribute("data-department") === "all") {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    document.querySelectorAll("[data-status]").forEach((btn) => {
      if (btn.getAttribute("data-status") === "all") {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }
}

function populateDetailModal() {
  const modal = document.getElementById("detailModal");
  const modalTitle = modal.querySelector(".modal-header h2");
  modalTitle.innerHTML = '<i class="fas fa-list-alt"></i> All Projects';

  const uniqueDepartments = ["Riset", "Digitalisasi", "System Development"];
  const uniqueStatuses = ["Complete", "In Progress", "Outstanding"];

  const filtersDiv = modal.querySelector(".detail-filters");
  if (filtersDiv) {
    filtersDiv.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        <div>
          <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block;">By Department</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="filter-chip active" data-department="all" onclick="filterDetailModalByDepartment('all')">All</button>
            ${uniqueDepartments.map((dept) => `<button class="filter-chip" data-department="${escapeHtml(dept)}" onclick="filterDetailModalByDepartment('${escapeHtml(dept)}')">${escapeHtml(dept)}</button>`).join("")}
          </div>
        </div>
        <div>
          <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: block;">Status</label>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="filter-chip active" data-status="all" onclick="filterDetailModalByStatus('all')">All</button>
            ${uniqueStatuses.map((status) => `<button class="filter-chip" data-status="${escapeHtml(status)}" onclick="filterDetailModalByStatus('${escapeHtml(status)}')">${escapeHtml(status)}</button>`).join("")}
          </div>
        </div>
      </div>
    `;
  }

  filterDetailModal();
}

function filterDetailModalByDepartment(department) {
  console.log("🔘 Clicking Department:", department);

  document.querySelectorAll("[data-department]").forEach((btn) => {
    if (btn.getAttribute("data-department") === department) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  setTimeout(() => {
    filterDetailModal();
  }, 10);
}

function filterDetailModalByStatus(status) {
  console.log("🔘 Clicking Status:", status);

  document.querySelectorAll("[data-status]").forEach((btn) => {
    if (btn.getAttribute("data-status") === status) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  setTimeout(() => {
    filterDetailModal();
  }, 10);
}

function filterDetailModal() {
  const modal = document.getElementById("detailModal");
  const activeDeptBtn = modal.querySelector("[data-department].active");
  const activeStatusBtn = modal.querySelector("[data-status].active");

  const deptFilter = activeDeptBtn ? activeDeptBtn.getAttribute("data-department") : "all";
  const statusFilter = activeStatusBtn ? activeStatusBtn.getAttribute("data-status") : "all";

  console.log("=== FILTER DETAIL MODAL ===");
  console.log("🔍 Active Dept Button:", activeDeptBtn?.textContent, "| Value:", deptFilter);
  console.log("🔍 Active Status Button:", activeStatusBtn?.textContent, "| Value:", statusFilter);

  const allProjectGroups = {};
  
  // FIX #4: Exclude total rows from filtering
  const regularActivities = projectsData.filter(task => !task.isTotalRow);
  
  regularActivities.forEach((task) => {
    const id = task.projectId;
    if (id && id !== "-_-" && id !== "--") {
      if (!allProjectGroups[id]) {
        allProjectGroups[id] = {
          id: id,
          projectType: task.projectType,
          prokerBacklog: task.prokerBacklog,
          departemen: task.departemen,
          activities: [],
          totalMandays: 0,
          completed: 0,
          inProgress: 0,
          outstanding: 0,
        };
      }
      allProjectGroups[id].activities.push(task);
      allProjectGroups[id].totalMandays += task.mandays || 0;
      if (task.status === "Complete") allProjectGroups[id].completed++;
      else if (task.status === "In Progress") allProjectGroups[id].inProgress++;
      else allProjectGroups[id].outstanding++;
    }
  });

  let filteredProjects = Object.values(allProjectGroups);
  console.log("📊 Total projects before filter:", filteredProjects.length);

  if (deptFilter !== "all") {
    filteredProjects = filteredProjects.filter((project) => {
      const match = project.departemen === deptFilter;
      if (!match) {
        console.log(`  ❌ Filtered out: ${project.projectType} (${project.departemen}) - doesn't match ${deptFilter}`);
      }
      return match;
    });
    console.log(`📊 After dept filter (${deptFilter}):`, filteredProjects.length, "projects");
    console.log(
      "  ✅ Remaining projects:",
      filteredProjects.map((p) => `${p.projectType} (${p.departemen})`)
    );
  }

  if (statusFilter !== "all") {
    const beforeStatusFilter = filteredProjects.length;
    filteredProjects = filteredProjects.filter((project) => {
      const allComplete = project.activities.every((act) => act.status === "Complete");
      const hasComplete = project.activities.some((act) => act.status === "Complete");
      const hasInProgress = project.activities.some((act) => act.status === "In Progress");

      let match = false;
      if (statusFilter === "Complete") {
        match = allComplete;
      } else if (statusFilter === "In Progress") {
        match = (hasInProgress || hasComplete) && !allComplete;
      } else if (statusFilter === "Outstanding") {
        match = !hasComplete && !hasInProgress;
      }

      if (!match) {
        console.log(`  ❌ Status filtered out: ${project.projectType} (Complete:${project.completed}, Progress:${project.inProgress}, Outstanding:${project.outstanding})`);
      }

      return match;
    });
    console.log(`📊 After status filter (${statusFilter}):`, beforeStatusFilter, "→", filteredProjects.length, "projects");
  }

  console.log("=== FINAL RESULT:", filteredProjects.length, "projects ===\n");

  const content = document.getElementById("detailModalContent");

  if (filteredProjects.length === 0) {
    content.innerHTML = '<div class="no-data">No projects found with the selected filters</div>';
    return;
  }

  content.innerHTML = filteredProjects
    .map(
      (project) => `
    <div class="detail-item-modal" onclick="showProjectActivitiesModal('${escapeHtml(project.id)}')" style="cursor: pointer;">
      <div class="detail-modal-header">
        <div class="detail-modal-type">
          <i class="fas fa-folder"></i>
          <strong>${escapeHtml(project.projectType)}</strong>
          <span style="font-size: 11px; font-weight: 600; color: var(--text-muted); margin-left: 8px;">• ${escapeHtml(project.prokerBacklog)} • ${escapeHtml(project.departemen)}</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span style="font-size: 11px; font-weight: 600; color: var(--text-muted);">${project.activities.length} activities</span>
          <i class="fas fa-chevron-right" style="color: var(--primary-blue); font-size: 12px;"></i>
        </div>
      </div>
      <div class="detail-modal-stats" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px;">
        <div class="detail-stat">
          <span class="detail-stat-label">Complete</span>
          <span class="detail-stat-value">${project.completed}</span>
        </div>
        <div class="detail-stat">
          <span class="detail-stat-label">In Progress</span>
          <span class="detail-stat-value">${project.inProgress}</span>
        </div>
        <div class="detail-stat">
          <span class="detail-stat-label">Est. Days</span>
          <span class="detail-stat-value">${project.totalMandays.toFixed(0)}</span>
        </div>
      </div>
      <div class="detail-item-progress" style="margin-top: 12px;">
        <div class="progress-bar-wrapper">
          <div class="progress-bar-fill" style="width: ${project.activities.length > 0 ? ((project.completed / project.activities.length) * 100).toFixed(0) : 0}%"></div>
        </div>
        <span class="progress-percentage">${project.activities.length > 0 ? ((project.completed / project.activities.length) * 100).toFixed(0) : 0}%</span>
      </div>
    </div>
  `
    )
    .join("");
}

// ===================================
// TODO MODAL FUNCTIONS
// ===================================

function showTodoModal() {
  const modal = document.getElementById("todoModal");
  if (modal) {
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
    updateModalContent();
    switchTodoTab("pending");
  }
}

function closeTodoModal() {
  const modal = document.getElementById("todoModal");
  if (modal) {
    modal.classList.remove("show");
    document.body.style.overflow = "auto";
  }
}

function updateModalContent() {
  const pendingTasks = todoData.filter((t) => t.status === "Outstanding");
  const progressTasks = todoData.filter((t) => t.status === "In Progress");
  const doneTasks = todoData.filter((t) => t.status === "Complete");

  document.getElementById("pendingTabCount").textContent = `(${pendingTasks.length})`;
  document.getElementById("progressTabCount").textContent = `(${progressTasks.length})`;
  document.getElementById("doneTabCount").textContent = `(${doneTasks.length})`;

  updateModalTab("tabPending", pendingTasks, "planned");
  updateModalTab("tabProgress", progressTasks, "progress");
  updateModalTab("tabDone", doneTasks, "done");
}

function updateModalTab(tabId, tasks, statusClass) {
  const tab = document.getElementById(tabId);
  if (!tab) return;

  if (tasks.length === 0) {
    tab.innerHTML = '<div class="no-data">No tasks in this category</div>';
    return;
  }

  tab.innerHTML = tasks
    .map(
      (task) => `
    <div class="todo-item-modal ${statusClass === "done" ? "done" : ""}">
      <i class="fas ${getStatusIcon(statusClass)} todo-status-icon status-${statusClass}"></i>
      <div class="todo-item-content">
        <h4>${formatItemText(task.item)}</h4>
        <p><strong>PIC:</strong> ${escapeHtml(task.pic)} | <strong>Department:</strong> ${escapeHtml(task.departemen)} | <strong>Type:</strong> ${escapeHtml(task.tipe)}</p>
        <span class="todo-meta">
          <i class="fas fa-calendar"></i> 
          ${task.dueDate && task.dueDate !== "-" ? formatDueDate(task.dueDate) : "No due date"}
        </span>
      </div>
    </div>
  `
    )
    .join("");
}

function getStatusIcon(statusClass) {
  switch (statusClass) {
    case "planned":
      return "fa-circle";
    case "progress":
      return "fa-spinner";
    case "done":
      return "fa-check-circle";
    default:
      return "fa-circle";
  }
}

function switchTodoTab(tabName) {
  const tabs = document.querySelectorAll(".todo-tab");
  tabs.forEach((tab) => {
    if (tab.getAttribute("data-tab") === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  const panes = document.querySelectorAll(".todo-tab-pane");
  panes.forEach((pane) => {
    const paneId = "tab" + tabName.charAt(0).toUpperCase() + tabName.slice(1);
    if (pane.id === paneId) {
      pane.classList.add("active");
    } else {
      pane.classList.remove("active");
    }
  });
}

function filterActivitiesByProjectType(departmentName, projectType, prokerBacklog, department = null) {
  const container = document.getElementById("activitiesContainer");
  const activities = container.querySelectorAll(".activity-item-compact");
  const filterChips = document.querySelectorAll(".filter-chip");

  filterChips.forEach((chip) => {
    const chipFilter = chip.getAttribute("data-filter");
    if ((projectType === "all" && chipFilter === "all") || (prokerBacklog && department && chipFilter === `${projectType}|${prokerBacklog}|${department}`)) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });

  activities.forEach((activity) => {
    const activityProjectType = activity.getAttribute("data-project-type");
    const activityProkerBacklog = activity.getAttribute("data-proker-backlog");
    const activityDepartment = activity.getAttribute("data-department");

    if (projectType === "all") {
      activity.style.display = "block";
    } else if (prokerBacklog && department) {
      if (activityProjectType === projectType && activityProkerBacklog === prokerBacklog && activityDepartment === department) {
        activity.style.display = "block";
      } else {
        activity.style.display = "none";
      }
    } else if (department) {
      if (activityProjectType === projectType && activityDepartment === department) {
        activity.style.display = "block";
      } else {
        activity.style.display = "none";
      }
    } else {
      if (activityProjectType === projectType) {
        activity.style.display = "block";
      } else {
        activity.style.display = "none";
      }
    }
  });
}

// FIX #3: Consistent compact date format
function formatDateCompact(dateString) {
  if (!dateString || dateString === "-") return "-";
  
  try {
    let date;
    
    // Check if it's in DD/MM/YYYY format
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        if (day > 12) {
          date = new Date(year, month - 1, day);
        } else {
          date = new Date(year, month - 1, day);
        }
      }
    } else {
      date = new Date(dateString);
    }
    
    if (isNaN(date.getTime())) return dateString;

    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const day = date.getDate();
    const month = monthNamesShort[date.getMonth()];

    return `${day} ${month}`;
  } catch (e) {
    console.error("Error formatting compact date:", dateString, e);
    return dateString;
  }
}

// ===================================
// EVENT LISTENERS
// ===================================

function setupEventListeners() {
  const tabs = document.querySelectorAll(".todo-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", function () {
      const tabName = this.getAttribute("data-tab");
      switchTodoTab(tabName);
    });
  });

  window.addEventListener("click", function (event) {
    const todoModal = document.getElementById("todoModal");
    const detailModal = document.getElementById("detailModal");

    if (event.target === todoModal) {
      closeTodoModal();
    }
    if (event.target === detailModal) {
      closeDetailModal();
    }
  });
}

// ===================================
// ERROR HANDLING
// ===================================

function showError(message) {
  const todoList = document.getElementById("todoList");
  if (todoList) {
    todoList.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <span>${message}</span>
      </div>
    `;
  }
}

// ===================================
// UTILITY FUNCTIONS
// ===================================

function showDebugInfo() {
  console.log("=== DEBUG INFO ===");
  console.log("Projects Data Sample:", projectsData.slice(0, 5));
  console.log(
    "Department Data:",
    Object.keys(departmentData).map((dept) => `${dept}: ${departmentData[dept].length} activities`)
  );
  console.log("Todo Data Sample:", todoData.slice(0, 5));
  console.log("Total Projects:", projectsData.length);
  console.log("Total Todos:", todoData.length);

  const uniqueTypes = [...new Set(projectsData.map((t) => t.projectType).filter((t) => t && t !== "-"))];
  console.log("Unique Project Types:", uniqueTypes);

  const statusBreakdown = projectsData.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});
  console.log("Status Breakdown:", statusBreakdown);

  alert("Debug info logged to console. Press F12 to view.");
}

function refreshDashboard() {
  loadAllData();
}