let rowsPerPage = 20;
let formsData = [], tasksData = [];

function renderPaginatedTable(data, targetId, paginationId, page) {
  if (!data || data.length === 0) return;
  const start = (page - 1) * rowsPerPage + 1;
  const end = Math.min(start + rowsPerPage, data.length);
  const headers = data[0];
  const rows = data.slice(start, end);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const headerRow = document.createElement("tr");
  headers.forEach(header => {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  rows.forEach(row => {
    const tr = document.createElement("tr");
    row.forEach(cell => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  const target = document.getElementById(targetId);
  target.innerHTML = '';
  target.appendChild(table);

  // Pagination
  const pageCount = Math.ceil((data.length - 1) / rowsPerPage);
  const pagination = document.getElementById(paginationId);
  pagination.innerHTML = '';

  const backButton = document.createElement("button");
  backButton.textContent = "Back";
  backButton.disabled = page === 1;
  backButton.onclick = () => renderPaginatedTable(data, targetId, paginationId, page - 1);
  pagination.appendChild(backButton);

  let startPage = Math.max(1, page - 4);
  let endPage = Math.min(startPage + 9, pageCount);
  if (endPage - startPage < 9) startPage = Math.max(1, endPage - 9);

  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    if (i === page) btn.classList.add("active");
    btn.onclick = () => renderPaginatedTable(data, targetId, paginationId, i);
    pagination.appendChild(btn);
  }

  const nextButton = document.createElement("button");
  nextButton.textContent = "Next";
  nextButton.disabled = page === pageCount;
  nextButton.onclick = () => renderPaginatedTable(data, targetId, paginationId, page + 1);
  pagination.appendChild(nextButton);
}

document.getElementById("formsFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  Papa.parse(file, {
    complete: function(results) {
      formsData = results.data;
      renderPaginatedTable(formsData, "formsTable", "formsPagination", 1);
      renderFormsAnalytics(formsData);
    }
  });
});

document.getElementById("tasksFile").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  Papa.parse(file, {
    complete: function(results) {
      tasksData = results.data;
      renderPaginatedTable(tasksData, "tasksTable", "tasksPagination", 1);
      renderTasksAnalytics(tasksData);
    }
  });
});

function renderFormsAnalytics(data) {
  const headers = data[0];
  const statusIndex = headers.indexOf("status");
  const overdueIndex = headers.indexOf("overdue");

  const statusCount = {};
  let overdueTrue = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[statusIndex];
    const overdue = row[overdueIndex];

    statusCount[status] = (statusCount[status] || 0) + 1;
    if (overdue.toLowerCase() === "true") overdueTrue++;
  }

  console.log("Forms Status Count:", statusCount);
  console.log("Overdue Forms:", overdueTrue);
}

function renderTasksAnalytics(data) {
  const headers = data[0];
  const priorityIndex = headers.indexOf("priority");
  const causeIndex = headers.indexOf("cause");

  const priorityCount = {};
  const causeCount = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const priority = row[priorityIndex];
    const cause = row[causeIndex];

    priorityCount[priority] = (priorityCount[priority] || 0) + 1;
    causeCount[cause] = (causeCount[cause] || 0) + 1;
  }

  console.log("Tasks Priority Count:", priorityCount);
  console.log("Tasks Cause Count:", causeCount);
}
