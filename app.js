(() => {
  const KEY = window.MYFINANCE_CONFIG.storageKey;
  const $ = (id) => document.getElementById(id);
  const today = new Date().toISOString().slice(0,10);
  let data = loadData();
  let simpleMode = "";

  function loadData(){
    try {
      const saved = localStorage.getItem(KEY);
      if(saved) return JSON.parse(saved);
    } catch(e) {}
    return {transactions:[],budgets:[],goals:[],bills:[]};
  }
  function save(){ localStorage.setItem(KEY, JSON.stringify(data)); render(); }
  function money(n){ return new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB"}).format(Number(n)||0); }
  function monthKey(d){ return String(d||"").slice(0,7); }
  function monthTransactions(){ return data.transactions.filter(t=>monthKey(t.date)===today.slice(0,7)); }
  function toast(msg){ const el=$("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2300); }
  function safe(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function sum(items,type){return items.filter(x=>x.type===type).reduce((a,b)=>a+Number(b.amount||0),0);}
  function render(){
    const mt=monthTransactions(), income=sum(mt,"income"), expense=sum(mt,"expense");
    const allIncome=sum(data.transactions,"income"), allExpense=sum(data.transactions,"expense");
    $("balanceValue").textContent=money(allIncome-allExpense);
    $("incomeValue").textContent=money(income);$("expenseValue").textContent=money(expense);
    $("incomeBar").style.height=(income||expense?Math.max(5,income/Math.max(income,expense)*125):5)+"px";
    $("expenseBar").style.height=(income||expense?Math.max(5,expense/Math.max(income,expense)*125):5)+"px";
    const cats={};mt.filter(t=>t.type==="expense").forEach(t=>cats[t.category]=(cats[t.category]||0)+Number(t.amount));
    const catEntries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
    $("categorySummary").innerHTML=catEntries.length?catEntries.map(([name,val])=>`<div class="category-line"><span>${safe(name)}</span><strong>${money(val)}</strong><div class="category-track"><div class="category-fill" style="width:${val/Math.max(...catEntries.map(x=>x[1]))*100}%"></div></div></div>`).join(""):'<p class="empty-state">ยังไม่มีข้อมูลรายจ่าย</p>';
    const sorted=[...data.transactions].sort((a,b)=>b.date.localeCompare(a.date));
    $("recentTransactions").innerHTML=transactionHTML(sorted.slice(0,5));
    const query=($("searchInput")?.value||"").toLowerCase();
    $("allTransactions").innerHTML=transactionHTML(sorted.filter(t=>(t.category+" "+t.note).toLowerCase().includes(query)));
    $("budgetList").innerHTML=data.budgets.length?data.budgets.map(b=>{
      const used=monthTransactions().filter(t=>t.type==="expense"&&t.category===b.category).reduce((s,t)=>s+Number(t.amount),0);
      const pct=Math.min(100,used/Math.max(1,b.limit)*100);
      return `<div class="list-card"><div class="list-card-top"><div><strong>${safe(b.category)}</strong><br><small>งบประมาณเดือนนี้</small></div><strong>${money(used)} / ${money(b.limit)}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>`;
    }).join(""):'<p class="empty-state">ยังไม่มีงบประมาณ กด “เพิ่มงบ” เพื่อเริ่มต้น</p>';
    $("goalList").innerHTML=data.goals.length?data.goals.map(g=>{let pct=Math.min(100,Number(g.saved)/Math.max(1,Number(g.target))*100);return `<div class="goal-card"><strong>${safe(g.name)}</strong><p class="muted">${safe(g.date||"ไม่กำหนดวันเป้าหมาย")}</p><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="goal-meta"><span>${money(g.saved)} สะสมแล้ว</span><strong>${money(g.target)}</strong></div></div>`}).join(""):'<p class="empty-state">ยังไม่มีเป้าหมายออมเงิน</p>';
    $("billList").innerHTML=data.bills.length?data.bills.map(b=>`<div class="list-card"><div class="list-card-top"><div><strong>${safe(b.name)}</strong><br><small>${safe(b.date)}</small></div><strong>${money(b.amount)}</strong></div><small>${safe(b.note||"บันทึกบิลแล้ว")}</small></div>`).join(""):'<p class="empty-state">ยังไม่มีบิลที่บันทึก</p>';
  }
  function transactionHTML(items){
    if(!items.length)return '<p class="empty-state">ยังไม่มีรายการ</p>';
    return items.map(t=>`<div class="transaction-row"><div class="transaction-icon">${t.type==="income"?"↙":"↗"}</div><div class="transaction-info"><strong>${safe(t.category)}</strong><small>${safe(t.date)}${t.note?" • "+safe(t.note):""}</small></div><div class="transaction-amount ${t.type==="income"?"positive":"negative"}">${t.type==="income"?"+":"−"}${money(t.amount)}</div></div>`).join("");
  }
  function showPage(page){
    document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
    document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    const titles={dashboard:"ภาพรวม",transactions:"ธุรกรรม",budgets:"งบประมาณ",goals:"เป้าหมายออมเงิน",bills:"หารบิลกับเพื่อน"};
    $("pageTitle").textContent=titles[page]||"MyFinance";
    $("sideNav").classList.remove("open");
  }
  document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.go)));
  $("menuButton").addEventListener("click",()=>$("sideNav").classList.toggle("open"));
  $("themeButton").addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("myfinance_dark",document.body.classList.contains("dark")?"1":"0");});
  if(localStorage.getItem("myfinance_dark")==="1")document.body.classList.add("dark");
  function openTransaction(){ $("date").value=today;$("transactionDialog").showModal(); }
  document.querySelectorAll("[data-open-add]").forEach(b=>b.addEventListener("click",openTransaction));
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>{b.closest("dialog").close();}));
  $("transactionForm").addEventListener("submit",e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    data.transactions.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),type:fd.get("type"),amount:Number(fd.get("amount")),category:fd.get("category"),date:fd.get("date"),note:fd.get("note")});
    save();e.currentTarget.reset();$("transactionDialog").close();toast("บันทึกรายการแล้ว");
  });
  $("searchInput").addEventListener("input",render);
  function simpleDialog(mode,title,fields){
    simpleMode=mode;$("simpleTitle").textContent=title;
    $("simpleFields").innerHTML=fields.map(f=>`<label for="sf_${f.name}">${f.label}</label><input id="sf_${f.name}" name="${f.name}" type="${f.type||"text"}" ${f.required===false?"":"required"} ${f.placeholder?`placeholder="${f.placeholder}"`:""}>`).join("");
    $("simpleDialog").showModal();
  }
  $("addBudgetButton").addEventListener("click",()=>simpleDialog("budget","เพิ่มงบประมาณ",[{name:"category",label:"หมวดหมู่",placeholder:"เช่น อาหาร"},{name:"limit",label:"วงเงิน (บาท)",type:"number"}]));
  $("addGoalButton").addEventListener("click",()=>simpleDialog("goal","เพิ่มเป้าหมายออมเงิน",[{name:"name",label:"ชื่อเป้าหมาย"},{name:"target",label:"จำนวนเงินเป้าหมาย (บาท)",type:"number"},{name:"saved",label:"ยอดที่ออมแล้ว (บาท)",type:"number"},{name:"date",label:"วันที่ต้องการบรรลุ",type:"date",required:false}]));
  $("addBillButton").addEventListener("click",()=>simpleDialog("bill","สร้างบิล",[{name:"name",label:"ชื่อบิล"},{name:"amount",label:"ยอดรวม (บาท)",type:"number"},{name:"date",label:"วันที่",type:"date"},{name:"note",label:"หมายเหตุ",required:false}]));
  $("simpleForm").addEventListener("submit",e=>{
    e.preventDefault();const o=Object.fromEntries(new FormData(e.currentTarget).entries());
    if(simpleMode==="budget")data.budgets.push({category:o.category,limit:Number(o.limit)});
    if(simpleMode==="goal")data.goals.push({name:o.name,target:Number(o.target),saved:Number(o.saved||0),date:o.date});
    if(simpleMode==="bill")data.bills.push({name:o.name,amount:Number(o.amount),date:o.date||today,note:o.note});
    save();$("simpleDialog").close();e.currentTarget.reset();toast("บันทึกข้อมูลแล้ว");
  });
  render();
  if("serviceWorker" in navigator && location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
})();