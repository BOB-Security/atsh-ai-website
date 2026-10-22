'use strict';
const translations = {
  ar: {
    skip:'تخطي إلى المحتوى', navServices:'خدماتنا', navProcess:'كيف نعمل', navAbout:'عن الشركة', navContact:'ابدأ مشروعك',
    eyebrow:'هندسة رقمية برؤية عملية', heroTitle:'نبني التقنية<br><span>لتصنع أثرًا.</span>', heroText:'نحوّل الأفكار إلى حلول رقمية واضحة وقابلة للتطوير — من المواقع والأنظمة المخصصة إلى بوتات الأعمال والخدمات السحابية.',
    startProject:'ابدأ مشروعك', exploreServices:'استكشف الخدمات', heroNote:'نطاق واضح. تنفيذ مدروس. وعود واقعية.', chipBuild:'بناء الأنظمة', chipCloud:'بنية سحابية', chipSecure:'أمان من البداية', heroBottom:'من الفكرة إلى حل رقمي قابل للاستخدام', scroll:'اكتشف المزيد',
    servicesEyebrow:'ما الذي نبنيه؟', servicesTitle:'حلول تقنية تخدم<br><span>احتياجًا حقيقيًا.</span>', servicesIntro:'اختر الخدمة التي تحتاجها، أو اجمع أكثر من مسار في مشروع واحد. نحدد النطاق والتسليمات قبل التنفيذ.',
    serviceWeb:'المواقع والأنظمة', serviceWebText:'مواقع احترافية، تطبيقات ويب، لوحات تحكم، وأنظمة مخصصة تناسب طريقة عملك.', serviceBots:'بوتات الأعمال', serviceBotsText:'مساعدات لخدمة العملاء والدعم الفني وتأهيل العملاء، مع تحويل الحالات التي تحتاج إلى تدخل بشري.', serviceCloud:'الخدمات السحابية', serviceCloudText:'إعداد الاستضافة والنشر وقواعد البيانات والمراقبة والنسخ الاحتياطي وفق احتياج المشروع.', serviceSecurity:'الأمن والجودة', serviceSecurityText:'مراجعات وضوابط أمنية واختبارات وجودة تشغيلية تتناسب مع طبيعة الحل ونطاق الخدمة.', discussService:'ناقش احتياجك', serviceFootnote:'تُحدد إتاحة كل خدمة ونطاقها وتكلفتها بعد مراجعة الاحتياج؛ لا نعرض خدمات غير جاهزة على أنها متاحة.',
    approachEyebrow:'طريقة العمل', approachTitle:'خطوات واضحة.<br><span>نتائج قابلة للفحص.</span>', approachText:'كل مشروع يبدأ بفهم المشكلة وتحديد ما يعنيه النجاح. ثم نخطط وننفذ ونختبر ونسلم ضمن نطاق متفق عليه.', talkToUs:'تحدث معنا عن مشروعك',
    step1Title:'نفهم الاحتياج',step1Text:'نحدد المشكلة والمستخدمين والقيود والنتيجة المطلوبة.',step2Title:'نحدد النطاق',step2Text:'نتفق على المخرجات والأولويات والمدة والتكلفة المتوقعة.',step3Title:'نبني ونختبر',step3Text:'ننّفذ على مراحل ونراجع الجودة والأمان والوظائف المطلوبة.',step4Title:'نسلّم وندعم',step4Text:'نسلم المخرجات المتفق عليها ونوضح طريقة التشغيل والدعم المشمول.',
    aboutEyebrow:'عن atsh-ai',aboutTitle:'التقنية ليست استعراضًا.<br><span>إنها حلّ لمشكلة.</span>',aboutText:'نعمل على تحويل الاحتياجات إلى منتجات وخدمات رقمية مفهومة وقابلة للصيانة والتطوير. نختار التقنية وفق المهمة، ونوضح ما هو جاهز وما يحتاج إلى عمل إضافي.',principle1:'وضوح قبل التنفيذ',principle2:'أمان وخصوصية',principle3:'اختبار قبل الإطلاق',
    contactEyebrow:'ابدأ من هنا',contactTitle:'لديك فكرة؟<br><span>لنحدد خطوتها التالية.</span>',contactText:'أخبرنا بما تريد بناءه. سيُستخدم وصفك لتقييم الاحتياج وتحديد الخطوة المناسبة، دون افتراض ميزانية أو نطاق لم نتفق عليه.',contactCallout:'املأ التفاصيل المتاحة فقط. يمكن استكمال بقية المعلومات أثناء مراجعة الطلب.',
    requiredNote:'* حقول مطلوبة',nameLabel:'الاسم الكامل *',emailLabel:'البريد الإلكتروني *',serviceLabel:'ما الخدمة التي تحتاجها؟',chooseService:'اختر خدمة (اختياري)',optionWeb:'موقع أو نظام',optionBots:'بوت أعمال',optionCloud:'خدمات سحابية',optionSecurity:'أمن وجودة',optionOther:'أخرى / غير متأكد',budgetLabel:'ميزانية تقريبية',notSure:'لم أحدد بعد',budget1:'أقل من 500 دولار',budget2:'500–2,000 دولار',budget3:'أكثر من 2,000 دولار',timelineLabel:'الموعد المستهدف',flexible:'مرن',timeline1:'في أقرب وقت',timeline2:'خلال شهر',timeline3:'خلال 3 أشهر',messageLabel:'صف فكرتك أو المشكلة التي تريد حلها *',messageHint:'لا تضع كلمات مرور أو بيانات سرية في هذا النموذج.',consent:'أوافق على استخدام بياناتي للرد على هذا الطلب وفق سياسة الخصوصية.',submitRequest:'إرسال طلب المشروع',formDisclaimer:'لن نعرض نجاح الإرسال إلا بعد تأكيده من الخدمة المستقبلة. قد لا يكون الإرسال الإلكتروني مفعّلًا حتى إعداد التكامل.',
    footerTagline:'نبني حلولًا رقمية مفيدة، واضحة، وقابلة للتطور.',backTop:'العودة للأعلى ↑',footerStatus:'المحتوى التعريفي لا يمثل ضمانًا بإتاحة كل خدمة.',
    missingFields:'يرجى استكمال الحقول المطلوبة والموافقة على سياسة الخصوصية.',sending:'جارٍ إرسال الطلب…',sent:'تم إرسال الطلب بنجاح. رقم المتابعة: ',failedPrefix:'لم يتم تأكيد الإرسال: ',networkError:'تعذر الاتصال بالخدمة. لم نؤكد استلام طلبك؛ حاول لاحقًا.',
    englishLabel:'EN',languageLabel:'Switch language'
  },
  en: {
    skip:'Skip to content',navServices:'Services',navProcess:'Our process',navAbout:'About',navContact:'Start a project',
    eyebrow:'Digital engineering with purpose',heroTitle:'We build technology<br><span>that makes an impact.</span>',heroText:'We turn ideas into clear, scalable digital solutions — from websites and custom systems to business bots and cloud services.',
    startProject:'Start a project',exploreServices:'Explore services',heroNote:'Clear scope. Thoughtful execution. Realistic promises.',chipBuild:'System development',chipCloud:'Cloud infrastructure',chipSecure:'Security from day one',heroBottom:'From an idea to a usable digital solution',scroll:'Explore more',
    servicesEyebrow:'What we build',servicesTitle:'Technology for<br><span>real-world needs.</span>',servicesIntro:'Choose the service you need or combine several in one project. Scope and deliverables are defined before work begins.',
    serviceWeb:'Websites & systems',serviceWebText:'Professional websites, web apps, dashboards, and custom systems built around how you work.',serviceBots:'Business bots',serviceBotsText:'Customer service, technical support, and lead qualification assistants, with human escalation when needed.',serviceCloud:'Cloud services',serviceCloudText:'Hosting, deployment, databases, monitoring, and backups tailored to project requirements.',serviceSecurity:'Security & quality',serviceSecurityText:'Security reviews, controls, testing, and operational quality appropriate to the solution and agreed scope.',discussService:'Discuss your needs',serviceFootnote:'Availability, scope, and pricing are confirmed after reviewing requirements. Services are not presented as ready before they are.',
    approachEyebrow:'How we work',approachTitle:'Clear steps.<br><span>Verifiable outcomes.</span>',approachText:'Every project starts by understanding the problem and defining success. We then plan, build, test, and deliver against an agreed scope.',talkToUs:'Talk to us about your project',
    step1Title:'Understand the need',step1Text:'Define the problem, users, constraints, and intended outcome.',step2Title:'Set the scope',step2Text:'Agree on deliverables, priorities, timeline, and expected cost.',step3Title:'Build and test',step3Text:'Deliver in stages and check quality, security, and required functionality.',step4Title:'Deliver and support',step4Text:'Hand over agreed deliverables and clarify operations and included support.',
    aboutEyebrow:'About atsh-ai',aboutTitle:'Technology is not a showpiece.<br><span>It solves a problem.</span>',aboutText:'We turn needs into digital products and services that are understandable, maintainable, and built to evolve. We choose technology for the task and are clear about what is ready and what still needs work.',principle1:'Clarity before execution',principle2:'Security and privacy',principle3:'Test before launch',
    contactEyebrow:'Start here',contactTitle:'Have an idea?<br><span>Let’s define the next step.</span>',contactText:'Tell us what you want to build. Your description helps us assess the need and suggest a next step, without assuming a budget or scope we have not agreed on.',contactCallout:'Share what you know now. We can clarify the remaining details during review.',
    requiredNote:'* Required fields',nameLabel:'Full name *',emailLabel:'Email address *',serviceLabel:'What service do you need?',chooseService:'Choose a service (optional)',optionWeb:'Website or system',optionBots:'Business bot',optionCloud:'Cloud services',optionSecurity:'Security and quality',optionOther:'Other / not sure',budgetLabel:'Approximate budget',notSure:'Not decided yet',budget1:'Under $500',budget2:'$500–$2,000',budget3:'Over $2,000',timelineLabel:'Target timeline',flexible:'Flexible',timeline1:'As soon as possible',timeline2:'Within a month',timeline3:'Within 3 months',messageLabel:'Describe your idea or the problem to solve *',messageHint:'Do not include passwords or confidential information in this form.',consent:'I agree to the use of my information to respond to this request under the privacy policy.',submitRequest:'Submit project request',formDisclaimer:'Success is shown only after the receiving service confirms submission. Online submission may remain disabled until integration is configured.',
    footerTagline:'Useful, clear digital solutions built to evolve.',backTop:'Back to top ↑',footerStatus:'Service descriptions do not guarantee every service is currently available.',
    missingFields:'Please complete required fields and accept the privacy notice.',sending:'Sending request…',sent:'Request sent successfully. Reference: ',failedPrefix:'Submission was not confirmed: ',networkError:'The service could not be reached. Your request was not confirmed; please try again later.',
    englishLabel:'EN',languageLabel:'تغيير اللغة'
  }
};
let currentLang = 'ar';
const $ = (selector) => document.querySelector(selector);
function setLanguage(lang) {
  currentLang = lang;
  const dict = translations[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = lang === 'ar' ? 'atsh-ai | نبني التقنية لتصنع أثرًا' : 'atsh-ai | Technology that makes an impact';
  document.querySelector('meta[name="description"]').content = lang === 'ar'
    ? 'atsh-ai — نبني حلولًا رقمية عملية من المواقع والأنظمة إلى البوتات والخدمات السحابية.'
    : 'atsh-ai builds practical digital solutions: websites, custom systems, business bots, and cloud services.';
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.innerHTML = dict[key];
  });
  $('#lang-switch').innerHTML = lang === 'ar' ? 'EN <span aria-hidden="true">↗</span>' : 'عربي <span aria-hidden="true">↗</span>';
  $('#lang-switch').setAttribute('aria-label', lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية');
  $('#menu-toggle').setAttribute('aria-label', lang === 'ar' ? 'فتح القائمة' : 'Open menu');
  document.querySelectorAll('a[data-service]').forEach(link => link.addEventListener('click', () => {
    $('#service').value = link.dataset.service;
  }, { once: true }));
}
$('#lang-switch').addEventListener('click', () => setLanguage(currentLang === 'ar' ? 'en' : 'ar'));
$('#menu-toggle').addEventListener('click', () => {
  const nav = $('#primary-nav');
  const open = nav.classList.toggle('open');
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('#primary-nav a').forEach(link => link.addEventListener('click', () => {
  $('#primary-nav').classList.remove('open');
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
}));
$('#year').textContent = new Date().getFullYear();

const form = $('#project-form');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const status = $('#form-status');
  status.className = 'form-status';
  status.textContent = '';
  if (!form.reportValidity() || !$('#consent').checked) {
    status.classList.add('error');
    status.textContent = translations[currentLang].missingFields;
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  const original = button.innerHTML;
  button.disabled = true;
  button.style.opacity = '.65';
  button.querySelector('span').textContent = translations[currentLang].sending;
  const data = Object.fromEntries(new FormData(form).entries());
  data.language = currentLang;
  try {
    const response = await fetch('/api/project-inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || translations[currentLang].networkError);
    status.classList.add('success');
    status.textContent = translations[currentLang].sent + result.reference;
    form.reset();
  } catch (error) {
    status.classList.add('error');
    status.textContent = translations[currentLang].failedPrefix + (error.message || translations[currentLang].networkError);
  } finally {
    button.disabled = false;
    button.style.opacity = '';
    button.innerHTML = original;
    // Restore button language after the request.
    button.querySelector('span').textContent = translations[currentLang].submitRequest;
  }
});
