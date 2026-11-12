(() => {
  "use strict";

  const CONFIG = window.MYFINANCE_CONFIG || {};
  const KEY = CONFIG.storageKey || "myfinance_local_v1";
  const API_URL = CONFIG.apiUrl || "";
  const $ = (id) => document.getElementById(id);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const emptyData = () => ({ transactions: [], budgets: [], goals: [], bills: [] });

  let data = loadData();
  let simpleMode = "";
  let accounts = [];
  let categories = [];
  let online = false;

  function loadData() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...emptyData(), ...parsed };
      }
    } catch (_) {}
    return emptyData();
  }

  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
  }

  function money(n) {
    return new Intl.NumberFormat("th-TH", {
      style: "currency", currency: CONFIG.currency || "THB"
    }).format(Number(n) || 0);
  }

  function monthKey(d) { return String(d || "").slice(0, 7); }
  function monthTransactions() {
    return data.transactions.filter(t => monthKey(t.date) === today.slice(0, 7));
  }
  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2300);
  }
  function safe(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function sum(items, type) {
    return items.filter(x => x.type === type)
      .reduce((a, b) => a + Number(b.amount || 0), 0);
  }
  function makeId(prefix) {
    return prefix + "_" + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : Date.now());
  }

  async function api(action, sheet, payload = {}) {
    if (!API_URL) throw new Error("ยังไม่ได้ตั้งค่า API URL");
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, sheet, ...payload })
    });
    if (!response.ok) throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (" + response.status + ")");
    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Backend แจ้งข้อผิดพลาด");
    return result.data;
  }

  function setConnection(isOnline, message) {
    online = isOnline;
    document.querySelectorAll(".sidebar-bottom").forEach(el => {
      el.innerHTML = '<span class="status-dot" style="background:' +
        (isOnline ? "#4ade80" : "#f59e0b") + '"></span> ' +
        (message || (isOnline ? "ซิงก์ Google Sheets แล้ว" : "โหมดออฟไลน์: เก็บในอุปกรณ์"));
    });
    const footer = document.querySelector("footer");
    if (footer) footer.textContent = isOnline
      ? "MyFinance • เชื่อมต่อ Google Sheets แล้ว"
      : "MyFinance • ออฟไลน์: ข้อมูลใหม่เก็บในอุปกรณ์นี้ก่อน";
  }

  function activeAccountId() {
    const account = accounts.find(a => String(a.IsActive).toLowerCase() !== "false") || accounts[0];
    return account ? account.AccountID : "";
  }
  function categoryIdByName(name, type) {
    const aliases = {
      "งานเสริม": "รายได้เสริม",
      "บิล/ค่าสาธารณูปโภค": "บิลและค่าสาธารณูปโภค",
      "อื่น ๆ": "อื่นๆ"
    };
    const wanted = aliases[name] || name;
    const item = categories.find(c =>
      c.CategoryName === wanted &&
      String(c.Type).toUpperCase() === type.toUpperCase()
    );
    return item ? item.CategoryID : "";
  }
  function dateOnly(value) { return String(value || today).slice(0, 10); }

  async function loadFromSheets() {
    const [remoteAccounts, remoteCategories, tx, budgets, goals, bills] = await Promise.all([
      api("list", "Accounts", { limit: 1000 }),
      api("list", "Categories", { limit: 1000 }),
      api("list", "Transactions", { limit: 1000 }),
      api("list", "Budgets", { limit: 1000 }),
      api("list", "SavingsGoals", { limit: 1000 }),
      api("list", "BillGroups", { limit: 1000 })
    ]);

    accounts = remoteAccounts || [];
    categories = remoteCategories || [];
    data.transactions = (tx || []).map(t => {
      const cat = categories.find(c => c.CategoryID === t.CategoryID);
      return {
        id: t.TransactionID,
        type: String(t.Type).toUpperCase() === "INCOME" ? "income" : "expense",
        amount: Number(t.Amount) || 0,
        category: cat ? cat.CategoryName : "ไม่ระบุหมวดหมู่",
        date: dateOnly(t.Date),
        note: t.Note || "",
        accountId: t.AccountID || ""
      };
    });
    data.budgets = (budgets || []).map(b => {
      const cat = categories.find(c => c.CategoryID === b.CategoryID);
      return {
        id: b.BudgetID, category: cat ? cat.CategoryName : "ไม่ระบุหมวดหมู่",
        categoryId: b.CategoryID, limit: Number(b.LimitAmount) || 0,
        month: b.Month || today.slice(0, 7)
      };
    });
    data.goals = (goals || []).map(g => ({
      id: g.GoalID, name: g.GoalName, target: Number(g.TargetAmount) || 0,
      saved: 0, date: dateOnly(g.TargetDate), note: g.Note || ""
    }));
    data.bills = (bills || []).map(b => ({
      id: b.BillID, name: b.BillName, amount: Number(b.TotalAmount) || 0,
      date: dateOnly(b.Date), note: b.Note || "", status: b.Status || ""
    }));
    saveLocal();
    setConnection(true);
    render();
  }

  async function createRemote(sheet, record) {
    if (!online) return null;
    return api("create", sheet, { data: record });
  }

  function render() {
    const mt = monthTransactions();
    const income = sum(mt, "income");
    const expense = sum(mt, "expense");
    const allIncome = sum(data.transactions, "income");
    const allExpense = sum(data.transactions, "expense");

    $("balanceValue").textContent = money(allIncome - allExpense);
    $("incomeValue").textContent = money(income);
    $("expenseValue").textContent = money(expense);
    $("incomeBar").style.height = (income || expense ? Math.max(5, income / Math.max(income, expense) * 125) : 5) + "px";
    $("expenseBar").style.height = (income || expense ? Math.max(5, expense / Math.max(income, expense) * 125) : 5) + "px";

    const cats = {};
    mt.filter(t => t.type === "expense").forEach(t => cats[t.category] = (cats[t.category] || 0) + Number(t.amount));
    const catEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    $("categorySummary").innerHTML = catEntries.length
      ? catEntries.map(([name, val]) => `<div class="category-line"><span>${safe(name)}</span><strong>${money(val)}</strong><div class="category-track"><div class="category-fill" style="width:${val / Math.max(...catEntries.map(x => x[1])) * 100}%"></div></div></div>`).join("")
      : '<p class="empty-state">ยังไม่มีข้อมูลรายจ่าย</p>';

    const sorted = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date));
    $("recentTransactions").innerHTML = transactionHTML(sorted.slice(0, 5));
    const query = ($("searchInput")?.value || "").toLowerCase();
    $("allTransactions").innerHTML = transactionHTML(sorted.filter(t =>
      (t.category + " " + t.note).toLowerCase().includes(query)
    ));

    $("budgetList").innerHTML = data.budgets.length ? data.budgets.map(b => {
      const used = monthTransactions().filter(t =>
        t.type === "expense" && t.category === b.category
      ).reduce((s, t) => s + Number(t.amount), 0);
      const pct = Math.min(100, used / Math.max(1, b.limit) * 100);
      return `<div class="list-card"><div class="list-card-top"><div><strong>${safe(b.category)}</strong><br><small>งบประมาณเดือนนี้</small></div><strong>${money(used)} / ${money(b.limit)}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>`;
    }).join("") : '<p class="empty-state">ยังไม่มีงบประมาณ กด “เพิ่มงบ” เพื่อเริ่มต้น</p>';

    $("goalList").innerHTML = data.goals.length ? data.goals.map(g => {
      const pct = Math.min(100, Number(g.saved) / Math.max(1, Number(g.target)) * 100);
      return `<div class="goal-card"><strong>${safe(g.name)}</strong><p class="muted">${safe(g.date || "ไม่กำหนดวันเป้าหมาย")}</p><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="goal-meta"><span>${money(g.saved)} สะสมแล้ว</span><strong>${money(g.target)}</strong></div></div>`;
    }).join("") : '<p class="empty-state">ยังไม่มีเป้าหมายออมเงิน</p>';

    $("billList").innerHTML = data.bills.length ? data.bills.map(b =>
      `<div class="list-card"><div class="list-card-top"><div><strong>${safe(b.name)}</strong><br><small>${safe(b.date)}</small></div><strong>${money(b.amount)}</strong></div><small>${safe(b.note || "บันทึกบิลแล้ว")}</small></div>`
    ).join("") : '<p class="empty-state">ยังไม่มีบิลที่บันทึก</p>';
  }

  function transactionHTML(items) {
    if (!items.length) return '<p class="empty-state">ยังไม่มีรายการ</p>';
    return items.map(t => `<div class="transaction-row"><div class="transaction-icon">${t.type === "income" ? "↙" : "↗"}</div><div class="transaction-info"><strong>${safe(t.category)}</strong><small>${safe(t.date)}${t.note ? " • " + safe(t.note) : ""}</small></div><div class="transaction-amount ${t.type === "income" ? "positive" : "negative"}">${t.type === "income" ? "+" : "−"}${money(t.amount)}</div></div>`).join("");
  }

  function showPage(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === "page-" + page));
    document.querySelectorAll(".nav-link").forEach(b => b.classList.toggle("active", b.dataset.page === page));
    const titles = { dashboard: "ภาพรวม", transactions: "ธุรกรรม", budgets: "งบประมาณ", goals: "เป้าหมายออมเงิน", bills: "หารบิลกับเพื่อน" };
    $("pageTitle").textContent = titles[page] || "MyFinance";
    $("sideNav").classList.remove("open");
  }

  document.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => showPage(b.dataset.page)));
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => showPage(b.dataset.go)));
  $("menuButton").addEventListener("click", () => $("sideNav").classList.toggle("open"));
  $("themeButton").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("myfinance_dark", document.body.classList.contains("dark") ? "1" : "0");
  });
  if (localStorage.getItem("myfinance_dark") === "1") document.body.classList.add("dark");

  function openTransaction() {
    $("date").value = today;
    $("transactionDialog").showModal();
  }
  document.querySelectorAll("[data-open-add]").forEach(b => b.addEventListener("click", openTransaction));
  document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

  $("transactionForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const type = fd.get("type");
    const category = String(fd.get("category") || "");
    const amount = Number(fd.get("amount"));
    const date = dateOnly(fd.get("date"));
    const note = String(fd.get("note") || "");
    if (!(amount > 0)) return toast("กรุณาระบุจำนวนเงินให้ถูกต้อง");

    const record = {
      TransactionID: makeId("TXN"),
      Date: date,
      Type: type === "income" ? "INCOME" : "EXPENSE",
      CategoryID: categoryIdByName(category, type === "income" ? "INCOME" : "EXPENSE"),
      AccountID: activeAccountId(),
      Amount: amount,
      TransferToAccountID: "",
      Note: note
    };

    try {
      if (online) {
        if (!record.CategoryID || !record.AccountID) throw new Error("ไม่พบหมวดหมู่หรือบัญชีใน Google Sheets");
        await createRemote("Transactions", record);
      }
      data.transactions.push({ id: record.TransactionID, type, amount, category, date, note });
      saveLocal(); render();
      form.reset(); $("transactionDialog").close();
      toast(online ? "บันทึกและซิงก์ Google Sheets แล้ว" : "บันทึกในอุปกรณ์แล้ว (ยังไม่ซิงก์)");
    } catch (err) { toast("บันทึกไม่สำเร็จ: " + err.message); }
  });

  $("searchInput").addEventListener("input", render);

  function simpleDialog(mode, title, fields) {
    simpleMode = mode;
    $("simpleTitle").textContent = title;
    $("simpleFields").innerHTML = fields.map(f =>
      `<label for="sf_${f.name}">${f.label}</label><input id="sf_${f.name}" name="${f.name}" type="${f.type || "text"}" ${f.required === false ? "" : "required"} ${f.placeholder ? `placeholder="${safe(f.placeholder)}"` : ""}>`
    ).join("");
    $("simpleDialog").showModal();
  }

  $("addBudgetButton").addEventListener("click", () => simpleDialog("budget", "เพิ่มงบประมาณ", [
    { name: "category", label: "หมวดหมู่", placeholder: "เช่น อาหาร" },
    { name: "limit", label: "วงเงิน (บาท)", type: "number" }
  ]));
  $("addGoalButton").addEventListener("click", () => simpleDialog("goal", "เพิ่มเป้าหมายออมเงิน", [
    { name: "name", label: "ชื่อเป้าหมาย" },
    { name: "target", label: "จำนวนเงินเป้าหมาย (บาท)", type: "number" },
    { name: "saved", label: "ยอดที่ออมแล้ว (บาท)", type: "number" },
    { name: "date", label: "วันที่ต้องการบรรลุ", type: "date", required: false }
  ]));
  $("addBillButton").addEventListener("click", () => simpleDialog("bill", "สร้างบิล", [
    { name: "name", label: "ชื่อบิล" },
    { name: "amount", label: "ยอดรวม (บาท)", type: "number" },
    { name: "date", label: "วันที่", type: "date" },
    { name: "note", label: "หมายเหตุ", required: false }
  ]));

  $("simpleForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const o = Object.fromEntries(new FormData(form).entries());

    try {
      if (simpleMode === "budget") {
        const categoryId = categoryIdByName(o.category, "EXPENSE");
        if (online && !categoryId) throw new Error("ไม่พบหมวดหมู่นี้ใน Google Sheets");
        const record = {
          BudgetID: makeId("BUD"),
          Month: today.slice(0, 7),
          CategoryID: categoryId,
          LimitAmount: Number(o.limit)
        };
        if (online) await createRemote("Budgets", record);
        data.budgets.push({ id: record.BudgetID, category: o.category, categoryId, limit: Number(o.limit), month: record.Month });
      }

      if (simpleMode === "goal") {
        const record = {
          GoalID: makeId("GOAL"),
          GoalName: o.name,
          TargetAmount: Number(o.target),
          TargetDate: o.date || "",
          Status: "ACTIVE",
          Note: ""
        };
        if (online) await createRemote("SavingsGoals", record);
        data.goals.push({ id: record.GoalID, name: o.name, target: Number(o.target), saved: Number(o.saved || 0), date: o.date });
      }

      if (simpleMode === "bill") {
        const record = {
          BillID: makeId("BILL"),
          BillName: o.name,
          Date: o.date || today,
          TotalAmount: Number(o.amount),
          Currency: "THB",
          SplitMethod: "EQUAL",
          PaidByAccountID: activeAccountId(),
          Note: o.note || "",
          Status: "OPEN"
        };
        if (online) await createRemote("BillGroups", record);
        data.bills.push({ id: record.BillID, name: o.name, amount: Number(o.amount), date: o.date || today, note: o.note });
      }

      saveLocal(); render();
      $("simpleDialog").close(); form.reset();
      toast(online ? "บันทึกและซิงก์ Google Sheets แล้ว" : "บันทึกในอุปกรณ์แล้ว (ยังไม่ซิงก์)");
    } catch (err) { toast("บันทึกไม่สำเร็จ: " + err.message); }
  });

  render();
  setConnection(false, "กำลังเชื่อมต่อ Google Sheets…");
  loadFromSheets().catch(err => {
    setConnection(false, "ออฟไลน์: " + (err.message || "เชื่อมต่อไม่ได้"));
    render();
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
