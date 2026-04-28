"use strict";

const state = {
  students: [],
  layout: "circle",
  freePositions: {},
  links: [],
  history: [],
  lineMode: false,
  lineSource: null,
  drag: null
};

const layoutTitles = {
  circle: "Circle Discussion",
  seminar: "Seminar U",
  rows: "Classroom Rows",
  pods: "Small Group Pods",
  free: "Free Seating"
};

const FREE_GRID_SIZE = 34;

const els = {
  studentName: document.getElementById("studentName"),
  addStudent: document.getElementById("addStudent"),
  bulkNames: document.getElementById("bulkNames"),
  addBulk: document.getElementById("addBulk"),
  rosterList: document.getElementById("rosterList"),
  fromStudent: document.getElementById("fromStudent"),
  toStudent: document.getElementById("toStudent"),
  addConnection: document.getElementById("addConnection"),
  lineMode: document.getElementById("lineMode"),
  chartHint: document.getElementById("chartHint"),
  downloadReport: document.getElementById("downloadReport"),
  undo: document.getElementById("undo"),
  reset: document.getElementById("reset"),
  clearLines: document.getElementById("clearLines"),
  seatingChart: document.getElementById("seatingChart"),
  studentLayer: document.getElementById("studentLayer"),
  conversationLines: document.getElementById("conversationLines"),
  emptyState: document.getElementById("emptyState"),
  barChart: document.getElementById("barChart"),
  conversationLog: document.getElementById("conversationLog"),
  layoutTitle: document.getElementById("layoutTitle"),
  totalStudents: document.getElementById("totalStudents"),
  totalTurns: document.getElementById("totalTurns"),
  totalConnections: document.getElementById("totalConnections")
};

function snapshot() {
  state.history.push(JSON.stringify({
    students: state.students,
    links: state.links,
    layout: state.layout,
    freePositions: state.freePositions
  }));
  state.history = state.history.slice(-30);
}

function restore(saved) {
  const parsed = JSON.parse(saved);
  state.students = parsed.students;
  state.links = parsed.links;
  state.layout = parsed.layout;
  state.freePositions = parsed.freePositions || {};
}

function addStudent(name) {
  const cleaned = name.trim();
  if (!cleaned) return;
  snapshot();
  state.students.push({
    id: crypto.randomUUID(),
    name: cleaned,
    count: 0,
    order: state.students.length
  });
  render();
}

function deleteStudent(id) {
  snapshot();
  state.students = state.students.filter((student) => student.id !== id);
  state.links = state.links.filter((link) => link.from !== id && link.to !== id);
  delete state.freePositions[id];
  if (state.lineSource === id) state.lineSource = null;
  render();
}

function addParticipation(id) {
  const student = state.students.find((item) => item.id === id);
  if (!student) return;
  snapshot();
  student.count += 1;
  updateParticipationViews();
}

function addDirectedTurn(from, to) {
  if (!from || !to || from === to) return;
  const speaker = state.students.find((student) => student.id === from);
  const recipient = state.students.find((student) => student.id === to);
  if (!speaker || !recipient) return;

  snapshot();
  speaker.count += 1;
  state.links.push({ from, to, time: Date.now() });
  state.lineSource = null;
  render();
}

function handleSeatPress(id) {
  if (!state.lineMode) {
    addParticipation(id);
    return;
  }

  if (!state.lineSource) {
    state.lineSource = id;
    render();
    return;
  }

  if (state.lineSource === id) {
    state.lineSource = null;
    render();
    return;
  }

  addDirectedTurn(state.lineSource, id);
}

function participationClass(count, max) {
  if (count === 0) return "zero";
  if (count === max && max > 1) return "most";
  return "some";
}

function studentColor(count, max) {
  if (count === 0) return "#d94747";
  if (count === max && max > 1) return "#3e9c65";
  return "#e4b63f";
}

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getRelativePoint(event) {
  const rect = els.seatingChart.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToGrid(value) {
  return Math.round(value / FREE_GRID_SIZE) * FREE_GRID_SIZE;
}

function getSnappedPoint(x, y) {
  const width = els.seatingChart.clientWidth || 1;
  const height = els.seatingChart.clientHeight || 1;
  return {
    x: clamp(snapToGrid(x), 58, width - 58),
    y: clamp(snapToGrid(y), 39, height - 39)
  };
}

function getSnappedSeatCenter(pointerX, pointerY, offsetX, offsetY) {
  const width = els.seatingChart.clientWidth || 1;
  const height = els.seatingChart.clientHeight || 1;
  const snappedPointer = {
    x: snapToGrid(pointerX),
    y: snapToGrid(pointerY)
  };

  return {
    x: clamp(snappedPointer.x - offsetX, 58, width - 58),
    y: clamp(snappedPointer.y - offsetY, 39, height - 39)
  };
}

function saveFreePosition(id, x, y, shouldSnap = false) {
  const width = els.seatingChart.clientWidth || 1;
  const height = els.seatingChart.clientHeight || 1;
  const point = shouldSnap ? getSnappedPoint(x, y) : { x, y };
  state.freePositions[id] = {
    x: clamp(point.x / width, 0.06, 0.94),
    y: clamp(point.y / height, 0.08, 0.92)
  };
}

function seedFreePositions() {
  const width = els.seatingChart.clientWidth || 1;
  const height = els.seatingChart.clientHeight || 1;
  const current = getPositions(width, height);

  state.students.forEach((student) => {
    if (state.freePositions[student.id]) return;
    const pos = current.get(student.id);
    if (pos) saveFreePosition(student.id, pos.x, pos.y);
  });
}

function getPositions(width, height) {
  const students = state.students;
  const count = students.length;
  const centerX = width / 2;
  const centerY = height / 2;
  const positions = new Map();

  if (!count) return positions;

  if (state.layout === "free") {
    const fallback = Math.ceil(Math.sqrt(count || 1));
    students.forEach((student, index) => {
      const saved = state.freePositions[student.id];
      if (saved) {
        positions.set(student.id, {
          x: saved.x * width,
          y: saved.y * height
        });
        return;
      }

      const col = index % fallback;
      const row = Math.floor(index / fallback);
      positions.set(student.id, {
        x: width * 0.18 + (width * 0.64 * (col + 0.5)) / fallback,
        y: height * 0.2 + (height * 0.6 * (row + 0.5)) / Math.ceil(count / fallback)
      });
    });
  }

  if (state.layout === "circle") {
    const radiusX = Math.max(135, width * 0.36);
    const radiusY = Math.max(120, height * 0.34);
    students.forEach((student, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
      positions.set(student.id, {
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY
      });
    });
  }

  if (state.layout === "seminar") {
    students.forEach((student, index) => {
      const t = count === 1 ? 0.5 : index / (count - 1);
      let x;
      let y;
      if (t < 0.34) {
        x = width * 0.2;
        y = height * (0.18 + t * 1.7);
      } else if (t < 0.67) {
        x = width * (0.2 + (t - 0.34) * 1.82);
        y = height * 0.82;
      } else {
        x = width * 0.8;
        y = height * (0.76 - (t - 0.67) * 1.7);
      }
      positions.set(student.id, { x, y });
    });
  }

  if (state.layout === "rows") {
    const cols = Math.ceil(Math.sqrt(count * 1.45));
    const rows = Math.ceil(count / cols);
    students.forEach((student, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions.set(student.id, {
        x: width * 0.12 + (width * 0.76 * (col + 0.5)) / cols,
        y: height * 0.18 + (height * 0.64 * (row + 0.5)) / rows
      });
    });
  }

  if (state.layout === "pods") {
    const podCenters = [
      [0.32, 0.28],
      [0.68, 0.28],
      [0.32, 0.68],
      [0.68, 0.68]
    ];
    students.forEach((student, index) => {
      const pod = Math.floor(index / 4) % podCenters.length;
      const seat = index % 4;
      const angle = -Math.PI / 2 + (Math.PI * 2 * seat) / 4;
      positions.set(student.id, {
        x: width * podCenters[pod][0] + Math.cos(angle) * 70,
        y: height * podCenters[pod][1] + Math.sin(angle) * 54
      });
    });
  }

  return positions;
}

function renderStudents(positions) {
  const max = Math.max(0, ...state.students.map((student) => student.count));
  els.studentLayer.innerHTML = "";

  state.students.forEach((student) => {
    const pos = positions.get(student.id);
    const seat = document.createElement("div");
    seat.setAttribute("role", "button");
    seat.tabIndex = 0;
    seat.setAttribute("aria-label", `${student.name}, ${student.count} spoken turns`);
    seat.className = studentSeatClass(student, max);
    seat.dataset.studentId = student.id;
    seat.style.left = `${pos.x}px`;
    seat.style.top = `${pos.y}px`;
    seat.innerHTML = `<strong>${student.name}</strong><span>${student.count}</span><small>spoken turns</small>`;
    els.studentLayer.appendChild(seat);
  });
}

function studentSeatClass(student, max) {
  const classes = ["student-seat", participationClass(student.count, max)];
  if (state.layout === "free") classes.push("draggable");
  if (student.id === state.lineSource) classes.push("selected");
  return classes.join(" ");
}

function updateParticipationViews() {
  const max = Math.max(0, ...state.students.map((student) => student.count));

  state.students.forEach((student) => {
    const seat = els.studentLayer.querySelector(`[data-student-id="${student.id}"]`);
    if (!seat) return;
    seat.className = studentSeatClass(student, max);
    seat.setAttribute("aria-label", `${student.name}, ${student.count} spoken turns`);
    const count = seat.querySelector("span");
    if (count) count.textContent = student.count;
  });

  renderLines(getPositions(els.seatingChart.clientWidth, els.seatingChart.clientHeight));
  renderBars();
  renderTotals();
}

function renderLines(positions) {
  const width = els.seatingChart.clientWidth;
  const height = els.seatingChart.clientHeight;
  const max = Math.max(0, ...state.students.map((student) => student.count));
  els.conversationLines.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.conversationLines.innerHTML = `
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <path d="M0,0 L0,6 L9,3 z" fill="#2f6f9f"></path>
      </marker>
    </defs>
  `;

  state.links.forEach((link, index) => {
    const from = positions.get(link.from);
    const to = positions.get(link.to);
    if (!from || !to) return;

    const curve = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const bend = index % 2 === 0 ? 34 : -34;
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 + bend;
    curve.setAttribute("d", `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`);
    curve.setAttribute("fill", "none");
    curve.setAttribute("stroke", "#2f6f9f");
    curve.setAttribute("stroke-width", "3");
    curve.setAttribute("stroke-linecap", "round");
    curve.setAttribute("opacity", "0.62");
    curve.setAttribute("marker-end", "url(#arrow)");
    els.conversationLines.appendChild(curve);

    const fromStudent = state.students.find((student) => student.id === link.from);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", from.x);
    dot.setAttribute("cy", from.y);
    dot.setAttribute("r", "6");
    dot.setAttribute("fill", studentColor(fromStudent?.count || 0, max));
    dot.setAttribute("stroke", "#fff");
    dot.setAttribute("stroke-width", "2");
    els.conversationLines.appendChild(dot);
  });
}

function renderSelects() {
  if (!state.students.length) {
    els.fromStudent.innerHTML = `<option value="">Add students first</option>`;
    els.toStudent.innerHTML = `<option value="">Add students first</option>`;
    return;
  }

  const options = state.students
    .map((student) => `<option value="${student.id}">${student.name}</option>`)
    .join("");
  els.fromStudent.innerHTML = options;
  els.toStudent.innerHTML = options;
}

function renderRoster() {
  if (!state.students.length) {
    els.rosterList.innerHTML = "";
    return;
  }

  els.rosterList.innerHTML = "";
  state.students.forEach((student) => {
    const item = document.createElement("div");
    item.className = "roster-item";

    const name = document.createElement("span");
    name.textContent = student.name;
    name.title = student.name;

    const button = document.createElement("button");
    button.className = "delete-student";
    button.type = "button";
    button.setAttribute("aria-label", `Delete ${student.name}`);
    button.textContent = "x";
    button.addEventListener("click", () => deleteStudent(student.id));

    item.append(name, button);
    els.rosterList.appendChild(item);
  });
}

function renderBars() {
  const max = Math.max(1, ...state.students.map((student) => student.count));
  const sorted = [...state.students].sort((a, b) => b.count - a.count || a.order - b.order);
  els.barChart.innerHTML = sorted.map((student) => {
    const width = Math.max(student.count ? 8 : 0, (student.count / max) * 100);
    const color = studentColor(student.count, max);
    return `
      <div class="bar-row">
        <span class="bar-name" title="${student.name}">${student.name}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${width}%;background:${color}"></span></span>
        <span class="bar-count">${student.count}</span>
      </div>
    `;
  }).join("");
}

function renderLog() {
  els.conversationLog.innerHTML = state.links.slice().reverse().map((link) => {
    const from = state.students.find((student) => student.id === link.from);
    const to = state.students.find((student) => student.id === link.to);
    return `<li><strong>${from?.name || "Student"}</strong> to <strong>${to?.name || "Student"}</strong></li>`;
  }).join("");
}

function renderTotals() {
  els.totalStudents.textContent = state.students.length;
  els.totalTurns.textContent = state.students.reduce((sum, student) => sum + student.count, 0);
  els.totalConnections.textContent = state.links.length;
}

function makeReportName(extension) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `student-participation-report-${stamp}.${extension}`;
}

function downloadSpreadsheet() {
  const totalsById = new Map(state.students.map((student) => [
    student.id,
    { outgoing: 0, incoming: 0 }
  ]));

  state.links.forEach((link) => {
    totalsById.get(link.from).outgoing += 1;
    totalsById.get(link.to).incoming += 1;
  });

  const lines = [
    ["Forest Ridge Innovation Lab Student Tracker"],
    ["Generated", new Date().toLocaleString()],
    [],
    ["Student", "Participation Turns", "Directed Comments Made", "Directed Comments Received"],
    ...state.students.map((student) => {
      const totals = totalsById.get(student.id);
      return [student.name, student.count, totals.outgoing, totals.incoming];
    }),
    [],
    ["Conversation Lines"],
    ["Speaker", "Directed To"],
    ...state.links.map((link) => {
      const from = state.students.find((student) => student.id === link.from);
      const to = state.students.find((student) => student.id === link.to);
      return [from?.name || "Deleted student", to?.name || "Deleted student"];
    })
  ];

  const csv = lines.map((row) => row.map(csvValue).join(",")).join("\r\n");
  downloadFile(makeReportName("csv"), "text/csv;charset=utf-8", csv);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  const lines = [];

  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);

  lines.slice(0, 2).forEach((item, index) => {
    ctx.fillText(item, x, y + index * lineHeight);
  });
}

function drawArrow(ctx, from, to, color) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLength = 16;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle - Math.PI / 6),
    to.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    to.x - headLength * Math.cos(angle + Math.PI / 6),
    to.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function downloadChartImage() {
  const chartWidth = Math.max(900, els.seatingChart.clientWidth);
  const chartHeight = Math.max(620, els.seatingChart.clientHeight);
  const headerHeight = 96;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = chartWidth * scale;
  canvas.height = (chartHeight + headerHeight) * scale;

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fbfdfd";
  ctx.fillRect(0, 0, chartWidth, chartHeight + headerHeight);

  ctx.fillStyle = "#17212b";
  ctx.font = "800 28px Segoe UI, Arial, sans-serif";
  ctx.fillText("Forest Ridge Innovation Lab", 28, 38);
  ctx.font = "900 36px Segoe UI, Arial, sans-serif";
  ctx.fillText("Student Tracker", 28, 78);

  ctx.fillStyle = "#60707f";
  ctx.font = "700 16px Segoe UI, Arial, sans-serif";
  ctx.fillText(`Students: ${state.students.length}`, chartWidth - 260, 35);
  ctx.fillText(`Turns: ${state.students.reduce((sum, student) => sum + student.count, 0)}`, chartWidth - 260, 58);
  ctx.fillText(`Lines: ${state.links.length}`, chartWidth - 260, 81);

  ctx.save();
  ctx.translate(0, headerHeight);
  ctx.fillStyle = "#fbfdfd";
  ctx.strokeStyle = "#d8e1e7";
  ctx.lineWidth = 1;
  ctx.fillRect(0, 0, chartWidth, chartHeight);
  for (let x = 0; x <= chartWidth; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, chartHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= chartHeight; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartWidth, y);
    ctx.stroke();
  }

  const positions = getPositions(chartWidth, chartHeight);
  const max = Math.max(0, ...state.students.map((student) => student.count));

  ctx.strokeStyle = "#2f6f9f";
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.65;
  state.links.forEach((link, index) => {
    const from = positions.get(link.from);
    const to = positions.get(link.to);
    if (!from || !to) return;
    const bend = index % 2 === 0 ? 34 : -34;
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 + bend;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(midX, midY, to.x, to.y);
    ctx.stroke();
    drawArrow(ctx, { x: midX, y: midY }, to, "#2f6f9f");
  });
  ctx.globalAlpha = 1;

  state.students.forEach((student) => {
    const pos = positions.get(student.id);
    const width = 118;
    const height = 78;
    const x = pos.x - width / 2;
    const y = pos.y - height / 2;

    roundedRect(ctx, x, y, width, height, 8);
    ctx.fillStyle = studentColor(student.count, max);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = participationClass(student.count, max) === "some" ? "#2e2510" : "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "800 14px Segoe UI, Arial, sans-serif";
    drawWrappedText(ctx, student.name, pos.x, y + 23, width - 16, 16);
    ctx.font = "900 24px Segoe UI, Arial, sans-serif";
    ctx.fillText(String(student.count), pos.x, y + 57);
  });

  ctx.restore();
  downloadDataUrl(makeReportName("png"), canvas.toDataURL("image/png"));
}

function downloadReport() {
  downloadSpreadsheet();
  downloadChartImage();
}

function renderLayoutButtons() {
  document.querySelectorAll(".layout-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.layout === state.layout);
  });
  els.layoutTitle.textContent = layoutTitles[state.layout];
}

function renderLineMode() {
  els.lineMode.classList.toggle("active", state.lineMode);
  els.lineMode.textContent = state.lineMode ? "Line Mode On" : "Line Mode";

  if (!state.lineMode) {
    els.chartHint.textContent = state.layout === "free"
      ? "Drag students to snap them to the grid, or click a student to add a spoken turn."
      : "Click a student to add a spoken turn.";
    return;
  }

  const source = state.students.find((student) => student.id === state.lineSource);
  els.chartHint.textContent = source
    ? `Now click who ${source.name} directed the comment to.`
    : state.layout === "free"
      ? "Line Mode: drag seats to the grid, or click the speaker then who they spoke to."
      : "Line Mode: click the speaker, then click who they spoke to.";
}

function render() {
  const positions = getPositions(els.seatingChart.clientWidth, els.seatingChart.clientHeight);
  els.emptyState.hidden = state.students.length > 0;
  renderLayoutButtons();
  renderLineMode();
  renderStudents(positions);
  renderLines(positions);
  renderSelects();
  renderRoster();
  renderBars();
  renderLog();
  renderTotals();
}

els.addStudent.addEventListener("click", () => {
  addStudent(els.studentName.value);
  els.studentName.value = "";
  els.studentName.focus();
});

els.studentName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.addStudent.click();
  }
});

els.addBulk.addEventListener("click", () => {
  const names = els.bulkNames.value.split(/\r?\n|,/).map((name) => name.trim()).filter(Boolean);
  if (!names.length) return;
  snapshot();
  names.forEach((name) => {
    state.students.push({
      id: crypto.randomUUID(),
      name,
      count: 0,
      order: state.students.length
    });
  });
  els.bulkNames.value = "";
  render();
});

els.studentLayer.addEventListener("pointerdown", (event) => {
  const seat = event.target.closest(".student-seat");
  if (!seat) return;
  event.preventDefault();
  const point = getRelativePoint(event);
  const positions = getPositions(els.seatingChart.clientWidth, els.seatingChart.clientHeight);
  const current = positions.get(seat.dataset.studentId) || point;
  state.drag = {
    id: seat.dataset.studentId,
    pointerId: event.pointerId,
    startX: point.x,
    startY: point.y,
    offsetX: point.x - current.x,
    offsetY: point.y - current.y,
    x: current.x,
    y: current.y,
    moved: false,
    snapshotted: false
  };
  seat.setPointerCapture?.(event.pointerId);
});

els.studentLayer.addEventListener("pointermove", (event) => {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  const point = getRelativePoint(event);
  const dx = point.x - state.drag.startX;
  const dy = point.y - state.drag.startY;
  if (Math.hypot(dx, dy) > 5) state.drag.moved = true;
  const centerX = point.x - state.drag.offsetX;
  const centerY = point.y - state.drag.offsetY;
  const snapped = getSnappedSeatCenter(
    point.x,
    point.y,
    state.drag.offsetX,
    state.drag.offsetY
  );
  state.drag.x = centerX;
  state.drag.y = centerY;

  if (state.layout !== "free" || !state.drag.moved) return;
  if (!state.drag.snapshotted) {
    snapshot();
    state.drag.snapshotted = true;
  }
  saveFreePosition(state.drag.id, snapped.x, snapped.y);
  const seat = [...els.studentLayer.querySelectorAll(".student-seat")]
    .find((item) => item.dataset.studentId === state.drag.id);
  if (seat) {
    const saved = state.freePositions[state.drag.id];
    seat.style.left = `${saved.x * els.seatingChart.clientWidth}px`;
    seat.style.top = `${saved.y * els.seatingChart.clientHeight}px`;
  }
});

els.studentLayer.addEventListener("pointerup", (event) => {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  const drag = state.drag;
  const point = getRelativePoint(event);
  const snapped = getSnappedSeatCenter(
    point.x,
    point.y,
    drag.offsetX,
    drag.offsetY
  );
  state.drag = null;

  if (state.layout === "free" && drag.moved) {
    saveFreePosition(drag.id, snapped.x, snapped.y);
    render();
    return;
  }

  handleSeatPress(drag.id);
});

els.studentLayer.addEventListener("pointercancel", () => {
  state.drag = null;
});

els.studentLayer.addEventListener("keydown", (event) => {
  const seat = event.target.closest(".student-seat");
  if (!seat || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  handleSeatPress(seat.dataset.studentId);
});

document.querySelectorAll(".layout-button").forEach((button) => {
  button.addEventListener("click", () => {
    snapshot();
    if (button.dataset.layout === "free" && state.layout !== "free") {
      seedFreePositions();
    }
    state.layout = button.dataset.layout;
    render();
  });
});

els.addConnection.addEventListener("click", () => {
  const from = els.fromStudent.value;
  const to = els.toStudent.value;
  addDirectedTurn(from, to);
});

els.lineMode.addEventListener("click", () => {
  state.lineMode = !state.lineMode;
  state.lineSource = null;
  render();
});

els.downloadReport.addEventListener("click", downloadReport);

els.clearLines.addEventListener("click", () => {
  snapshot();
  state.links = [];
  state.lineSource = null;
  render();
});

els.undo.addEventListener("click", () => {
  const previous = state.history.pop();
  if (!previous) return;
  restore(previous);
  render();
});

els.reset.addEventListener("click", () => {
  snapshot();
  state.students.forEach((student) => {
    student.count = 0;
  });
  state.links = [];
  state.lineSource = null;
  render();
});

window.addEventListener("resize", render);

render();
