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

async function sendSubmission(url, payload, statusEl, button) {
  const originalText = button.textContent;
  button.disabled = true;
  statusEl.textContent = "جارٍ إرسال الطلب بأمان...";
  statusEl.classList.remove("hidden");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "تعذر إرسال الطلب.");
    statusEl.textContent = result.reference
      ? result.message + " الرقم المرجعي: " + result.reference
      : result.message || "تم استلام الطلب.";
    statusEl.classList.remove("hidden");
  } catch (error) {
    statusEl.textContent = error.message || "تعذر الاتصال بالخادم. حاول مرة أخرى لاحقًا.";
    statusEl.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}
function showPrototypeNotice(statusEl, message) {
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}
$("#contactForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  sendSubmission("/api/contact", {
    name: data.get("name"),
    email: data.get("email"),
    subject: data.get("type"),
    message: data.get("brief"),
    website: data.get("website") || ""
  }, $("#contactStatus"), form.querySelector('button[type="submit"]')).then(() => {});
});
$("#referral").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  sendSubmission("/api/referrals", {
    name: data.get("referrer"),
    email: data.get("email"),
    organization: "إحالة عبر موقع atsh-ai",
    subject: data.get("service"),
    message: data.get("brief"),
    website: data.get("website") || ""
  }, $("#referralStatus"), form.querySelector('button[type="submit"]'));
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
    return "يمكنك الانتقال إلى قسم «شركاء الإحالة» وتقديم بيانات أولية. قبول الفرصة أو إسنادها أو اعتماد عمولة يتطلب مراجعة وموافقة رسمية من الإدارة.";
  }
  if (q.includes("مشروع") || q.includes("تواصل")) {
    return "يمكنك استخدام نموذج «طلب تواصل أو مشروع» أسفل الصفحة لإرسال طلب للمراجعة الإدارية.";
  }
  return "شكرًا لتواصلك. أنا مساعد واجهة تجريبي بإجابات محدودة، ولست موظف دعم بشريًا ولا أستطيع اعتماد عروض أو اتفاقات. يمكنك إرسال طلب للمراجعة الإدارية عبر النموذج.";
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
  status.textContent = "تم اختيار " + file.name + " محليًا فقط؛ رفع المرفقات غير متاح حاليًا.";
});
$("#makeTicket").addEventListener("click", () => {
  closeChat();
  $("#contact").scrollIntoView({behavior:"smooth"});
  $("#contactType").value = "أخرى";
  $("#contactBrief").focus();
  $("#contactStatus").textContent = "يمكنك كتابة طلبك في النموذج لإرساله إلى النظام ومراجعته إداريًا.";
});
