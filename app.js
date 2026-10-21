const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];

$("#year").textContent = new Date().getFullYear();

const menuToggle = $("#menuToggle");
const mainNav = $("#mainNav");
menuToggle.addEventListener("click", () => {
  const open = mainNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});
$$(".main-nav a").forEach(link => link.addEventListener("click", () => {
  mainNav.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
}));

function showPrototypeNotice(statusEl, message) {
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}
$("#contactForm").addEventListener("submit", event => {
  event.preventDefault();
  showPrototypeNotice($("#contactStatus"), "تم التحقق من الحقول محليًا فقط. لم يُرسل الطلب لأن ربط الخادم لم يُنفذ بعد.");
});
$("#referral").addEventListener("submit", event => {
  event.preventDefault();
  showPrototypeNotice($("#referralStatus"), "تم التحقق من الحقول محليًا فقط. لم تُنشأ تذكرة إحالة فعلية؛ يلزم ربط النظام الخلفي ولوحة الإدارة.");
});

const chatPanel = $("#chatPanel");
const chatLauncher = $("#chatLauncher");
function openChat() {
  chatPanel.hidden = false;
  $("#chatInput").focus();
}
function closeChat() {
  chatPanel.hidden = true;
  chatLauncher.focus();
}
chatLauncher.addEventListener("click", openChat);
$("#openChatTop").addEventListener("click", openChat);
$("#closeChat").addEventListener("click", closeChat);

function addBubble(text, kind="bot") {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble " + (kind === "user" ? "user-bubble" : "bot-bubble");
  bubble.textContent = text;
  $("#chatMessages").appendChild(bubble);
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}
function respondTo(question) {
  const q = question.toLowerCase();
  if (q.includes("خدمات") || q.includes("خدمة")) {
    return "نركز على حلول الذكاء الاصطناعي والبرمجيات والتكامل والتنفيذ. نحدد الحل المناسب بعد فهم احتياجك، ولا نعد بقدرة قبل تقييمها.";
  }
  if (q.includes("إحالة") || q.includes("وسيط") || q.includes("عميل")) {
    return "يمكنك الانتقال إلى قسم «شركاء الإحالة» وتقديم بيانات أولية. قبول الفرصة أو إسنادها أو اعتماد عمولة يتطلب مراجعة وموافقة رسمية من الإدارة. نموذج الإحالة الحالي تجريبي وغير متصل بالخادم.";
  }
  if (q.includes("مشروع") || q.includes("تواصل")) {
    return "يمكنك استخدام نموذج «طلب تواصل أو مشروع» أسفل الصفحة. النموذج الحالي واجهة أولية ولا يرسل بيانات فعليًا حتى ربط الخادم.";
  }
  return "شكرًا لتواصلك. أنا مساعد واجهة تجريبي حاليًا، وإجاباتي محدودة بالمعلومات العامة المعروضة هنا. يمكنك إرسال طلب عبر النموذج، لكن الإرسال الفعلي يحتاج تفعيل الخادم.";
}
$("#chatForm").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("#chatInput");
  const value = input.value.trim();
  if (!value) return;
  addBubble(value, "user");
  input.value = "";
  addBubble(respondTo(value));
});
$$("[data-question]").forEach(button => button.addEventListener("click", () => {
  addBubble(button.dataset.question, "user");
  addBubble(respondTo(button.dataset.question));
}));
$("#chatAttachment").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  const allowed = /\.(pdf|png|jpe?g|webp|txt|docx?)$/i;
  const status = $("#attachmentStatus");
  if (!allowed.test(file.name)) {
    status.textContent = "نوع الملف غير مسموح به في الواجهة التجريبية.";
    event.target.value = "";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    status.textContent = "الحد التجريبي لحجم الملف 5 ميجابايت.";
    event.target.value = "";
    return;
  }
  status.textContent = "تم اختيار " + file.name + " محليًا فقط؛ لم يُرفع الملف إلى خادم.";
});
$("#makeTicket").addEventListener("click", () => {
  closeChat();
  $("#contact").scrollIntoView({behavior:"smooth"});
  $("#contactType").value = "أخرى";
  $("#contactBrief").focus();
  $("#contactStatus").textContent = "يمكنك كتابة طلبك في النموذج. إنشاء التذكرة وإعطاء رقم مرجعي يحتاجان إلى ربط النظام الخلفي.";
});
