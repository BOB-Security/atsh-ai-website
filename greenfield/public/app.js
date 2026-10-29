'use strict';
const menu=document.getElementById('menuToggle');
const nav=document.getElementById('mainNav');
if(menu&&nav){
  menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open?'true':'false');});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');}));
}
const year=document.getElementById('year');if(year)year.textContent=String(new Date().getFullYear());
const wizard=document.getElementById('projectWizard');
if(wizard){
 const steps=[
  {title:'ما الذي تريد بناءه؟',intro:'اختر أقرب نوع لاحتياجك. يمكنك توضيح التفاصيل لاحقًا.',key:'service',type:'choice',required:true,options:[['موقع أو منصة','مواقع الشركات، صفحات الهبوط، بوابات العملاء والمنصات.'],['تطبيق أو نظام','تطبيقات الويب والموبايل والأنظمة الداخلية.'],['ذكاء اصطناعي أو أتمتة','مساعدات ذكية، وكلاء وتدفقات عمل مؤتمتة.'],['تكامل أو دعم تقني','ربط الأنظمة، API، الصيانة والتحسين.'],['أحتاج إلى التوجيه','ساعدوني في تحديد الحل والنطاق المناسب.']]},
  {title:'ما حجم المشروع؟',intro:'اختَر تقديرًا مبدئيًا؛ يمكن تعديل النطاق بعد مراجعة المتطلبات.',key:'scope',type:'fields',fields:[{key:'size',label:'حجم الحل',kind:'select',required:true,options:['صفحة واحدة / تجربة أولية','موقع صغير','موقع متعدد الصفحات','منصة أو نظام متعدد الوحدات','غير محدد بعد']},{key:'pages',label:'عدد الصفحات أو الوحدات (إن عُرف)',kind:'text',placeholder:'مثال: 8 صفحات أو 4 وحدات'},{key:'languages',label:'اللغات المطلوبة',kind:'select',required:true,options:['العربية','العربية والإنجليزية','الإنجليزية','أكثر من لغتين','غير محدد بعد']}]},
  {title:'الهوية والمحتوى',intro:'حدد ما هو جاهز وما تحتاج المساعدة في إعداده.',key:'brand',type:'choice',required:true,options:[['لدي شعار وهوية ومحتوى','سأوفر الأصول المعتمدة.'],['لدي بعض الأصول','أحتاج استكمال أجزاء محددة.'],['أحتاج تصميم الهوية والمحتوى','أحتاج مساعدة في التأسيس.'],['أحتاج مراجعة وتوجيهًا','نحدد المطلوب أثناء التحليل.']]},
  {title:'الخصائص والتكاملات',intro:'يمكنك اختيار أكثر من عنصر. هذه الاختيارات لا تعني أن التكامل متاح قبل المراجعة.',key:'features',type:'multi',options:['لوحة إدارة ومستخدمون وصلاحيات','تسجيل دخول وبوابة عميل','الدفع الإلكتروني أو الفواتير','ذكاء اصطناعي أو chatbot','أتمتة n8n وربط API','بحث أو تقارير أو لوحات مؤشرات','إشعارات بريدية أو رسائل','تحليلات وSEO','صيانة ودعم بعد الإطلاق','أحتاج توصية من الفريق']},
  {title:'الاستضافة والنطاق',intro:'اختر احتياجك فقط؛ لن تُعرض باقة أو رسوم تجديد غير معتمدة.',key:'hosting',type:'choice',required:true,options:[['لدي استضافة ونطاق','أحتاج النشر على البنية الحالية.'],['أحتاج استضافة ونطاق','تحديد المزود والتكلفة لاحقًا.'],['أحتاج استضافة مُدارة ونسخًا احتياطيًا','نحدد حدود الخدمة ووتيرة النسخ.'],['أريد عرضًا منفصلًا للاستضافة','افصل رسوم التشغيل المتكررة عن التطوير.'],['غير متأكد','ساعدوني في اختيار الأنسب.']]},
  {title:'بيانات التواصل',intro:'لن تُرسل بياناتك إلا بعد موافقتك الصريحة والضغط على إرسال الطلب. سنعرض رقم الطلب فقط إذا أكد الخادم حفظه بنجاح.',key:'contact',type:'fields',fields:[{key:'name',label:'الاسم',kind:'text',required:true,placeholder:'اسمك'},{key:'email',label:'البريد الإلكتروني',kind:'email',required:true,placeholder:'you@example.com'},{key:'phone',label:'رقم الهاتف (اختياري)',kind:'tel',placeholder:'+20'},{key:'company',label:'الشركة أو المشروع (اختياري)',kind:'text',placeholder:'اسم النشاط'}]},
  {title:'الهدف والقيود',intro:'أضف ما يساعد على فهم النجاح المطلوب والقيود المهمة.',key:'details',type:'fields',fields:[{key:'goal',label:'ما الهدف أو المشكلة التي تريد حلها؟',kind:'textarea',required:true,placeholder:'صف الهدف والنتيجة المتوقعة (20 حرفًا على الأقل).'},{key:'audience',label:'من سيستخدم الحل؟',kind:'text',placeholder:'العملاء، الموظفون، شركاء العمل...'},{key:'integrations',label:'أنظمة أو تكاملات محددة (إن وجدت)',kind:'text',placeholder:'أسماء الأنظمة أو الروابط المتاحة'},{key:'deadline',label:'الموعد المستهدف (إن وجد)',kind:'text',placeholder:'مثال: خلال 6 أسابيع'},{key:'constraints',label:'قيود أو متطلبات خاصة (اختياري)',kind:'textarea',placeholder:'الميزانية التقريبية، متطلبات الأمان، أو أمور يجب تجنبها'}]},
  {title:'مراجعة الملخص',intro:'راجع المعلومات قبل اعتمادها. لا توجد أسعار أو إرسال طلب في هذه النسخة.',key:'review',type:'review'}
 ];
 const data={features:[],consent:false};let current=0;
 const body=document.getElementById('wizardBody'),title=document.getElementById('wizardTitle'),label=document.getElementById('wizardStepLabel'),percent=document.getElementById('wizardPercent'),fill=document.getElementById('wizardProgressFill'),progress=document.getElementById('wizardProgress'),back=document.getElementById('wizardBack'),next=document.getElementById('wizardNext'),error=document.getElementById('wizardError'),footnote=document.getElementById('wizardFootnote');
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const digits=['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];const arnum=n=>String(n).replace(/\d/g,d=>digits[Number(d)]);
 function fieldMarkup(f){
  const value=data[f.key]||'',required=f.required?' required':'',placeholder=f.placeholder?' placeholder="'+esc(f.placeholder)+'"':'';
  if(f.kind==='select')return '<label class="field"><span>'+esc(f.label)+(f.required?' *':'')+'</span><select data-field="'+esc(f.key)+'"'+required+'><option value="">اختر</option>'+f.options.map(o=>'<option'+(value===o?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select></label>';
  if(f.kind==='textarea')return '<label class="field"><span>'+esc(f.label)+(f.required?' *':'')+'</span><textarea data-field="'+esc(f.key)+'" rows="3"'+required+(f.key==='goal'?' minlength="20"':'')+placeholder+'>'+esc(value)+'</textarea></label>';
  return '<label class="field"><span>'+esc(f.label)+(f.required?' *':'')+'</span><input data-field="'+esc(f.key)+'" type="'+esc(f.kind)+'" value="'+esc(value)+'"'+required+placeholder+(f.kind==='email'?' maxlength="254"':'')+'></label>';
 }
 function summaryRows(){
  const rows=[['نوع الحل',data.service],['حجم الحل',data.size],['عدد الصفحات/الوحدات',data.pages],['اللغات',data.languages],['الهوية والمحتوى',data.brand],['الخصائص',data.features.join('، ')],['الاستضافة والنطاق',data.hosting],['الاسم',data.name],['البريد',data.email],['الهاتف',data.phone],['الشركة',data.company],['الهدف',data.goal],['المستخدمون المستهدفون',data.audience],['التكاملات',data.integrations],['الموعد المستهدف',data.deadline],['القيود',data.constraints]].filter(r=>r[1]&&String(r[1]).trim());
  return '<dl class="review-list">'+rows.map(r=>'<div><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd></div>').join('')+'</dl><p class="estimate-note">السعر: لم يُحدد. يحتاج التسعير إلى قواعد معتمدة ومراجعة النطاق، ولن نعرض تقديرًا مخترعًا.</p><p class="estimate-note">الحالة: مسودة محلية غير مرسلة. لا يوجد رقم طلب حتى يتم تفعيل التخزين الآمن.</p>';
 }
 function render(){
  const step=steps[current],pct=Math.round((current+1)/steps.length*100);
  title.textContent=step.title;label.textContent='الخطوة '+arnum(current+1)+' من '+arnum(steps.length);percent.textContent=arnum(pct)+'٪';fill.style.width=pct+'%';progress.setAttribute('aria-valuenow',String(current+1));back.disabled=current===0;next.textContent=current===steps.length-1?'إعادة مراجعة الاختيارات':'التالي ↗';footnote.textContent=current===steps.length-1?'المراجعة لا تُنشئ طلبًا ولا ترسل بيانات. زر الإرسال سيُفعّل بعد ربط قاعدة البيانات والتحقق من الحفظ.':'الأسعار والعروض النهائية تعتمد من ATSH AI ولا تُحسب من قيم تخمينية.';error.hidden=true;
  if(step.type==='choice'){
   body.innerHTML='<p class="wizard-intro">'+esc(step.intro)+'</p><div class="choice-grid">'+step.options.map(o=>'<button type="button" class="choice-card'+(data[step.key]===o[0]?' selected':'')+'" data-choice="'+esc(o[0])+'" aria-pressed="'+(data[step.key]===o[0]?'true':'false')+'"><span class="choice-check">'+(data[step.key]===o[0]?'✓':'+')+'</span><strong>'+esc(o[0])+'</strong><small>'+esc(o[1])+'</small></button>').join('')+'</div>';
   body.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>{data[step.key]=b.dataset.choice;render();}));
  }else if(step.type==='multi'){
   body.innerHTML='<p class="wizard-intro">'+esc(step.intro)+'</p><div class="multi-grid">'+step.options.map(o=>'<label class="multi-option"><input type="checkbox" data-feature="'+esc(o)+'"'+(data.features.includes(o)?' checked':'')+'><span>'+esc(o)+'</span></label>').join('')+'</div>';
   body.querySelectorAll('[data-feature]').forEach(i=>i.addEventListener('change',()=>{if(i.checked){if(!data.features.includes(i.dataset.feature))data.features.push(i.dataset.feature);}else data.features=data.features.filter(x=>x!==i.dataset.feature);}));
  }else if(step.type==='fields'){
   body.innerHTML='<p class="wizard-intro">'+esc(step.intro)+'</p><div class="field-grid">'+step.fields.map(fieldMarkup).join('')+'</div>';
   body.querySelectorAll('[data-field]').forEach(i=>{i.addEventListener('input',()=>{data[i.dataset.field]=i.value;});i.addEventListener('change',()=>{data[i.dataset.field]=i.value;});});
  }else{
   body.innerHTML='<p class="wizard-intro">'+esc(step.intro)+'</p>'+summaryRows()+'<div class="review-actions"><button type="button" class="text-link" id="editContact">تعديل بيانات التواصل</button><button type="button" class="text-link" id="editDetails">تعديل الهدف والقيود</button></div><label class="consent-row"><input id="inquiryConsent" type="checkbox"'+(data.consent?' checked':'')+'><span>أوافق على استخدام بياناتي للرد على الطلب وفق <a href="/privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a>.</span></label><div class="actions" style="margin-top:14px"><button type="button" class="btn primary" id="submitInquiry">إرسال طلب المشروع</button></div><div id="submissionStatus" class="submission-disabled" role="status" aria-live="polite"><strong>لم يتم إرسال الطلب بعد</strong><span>لن نعرض رسالة نجاح إلا بعد تأكيد حفظ الطلب من الخادم.</span></div>';
   document.getElementById('editContact').addEventListener('click',()=>{current=5;render();});document.getElementById('editDetails').addEventListener('click',()=>{current=6;render();});
   document.getElementById('inquiryConsent').addEventListener('change',event=>{data.consent=event.target.checked;});
   document.getElementById('submitInquiry').addEventListener('click',submitInquiry);
  }
 }
 async function submitInquiry(){
  const button=document.getElementById('submitInquiry'),status=document.getElementById('submissionStatus');
  if(!data.consent){status.innerHTML='<strong>الموافقة مطلوبة</strong><span>وافق على سياسة الخصوصية قبل إرسال بيانات الطلب.</span>';return;}
  const contact=['name','email','service','goal'];
  if(contact.some(key=>!String(data[key]||'').trim())){status.innerHTML='<strong>بيانات غير مكتملة</strong><span>ارجع إلى بيانات التواصل والهدف وأكمل الحقول المطلوبة.</span>';return;}
  button.disabled=true;button.textContent='جارٍ إرسال الطلب…';status.innerHTML='<strong>جارٍ التحقق من الحفظ</strong><span>انتظر رد الخادم قبل إغلاق الصفحة.</span>';
  const payload={...data,features:Array.isArray(data.features)?data.features:[],consent:true};
  try{
   const response=await fetch('/api/public/inquiries',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),credentials:'same-origin'});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||result.ok!==true||!result.inquiry||!result.inquiry.reference)throw new Error(result.message||'تعذر تأكيد حفظ الطلب. لم يتم تأكيد التسجيل.');
   status.innerHTML='<strong>تم حفظ الطلب بنجاح</strong><span>رقم طلبك: '+esc(result.inquiry.reference)+' — احتفظ به عند التواصل معنا.</span>';
   button.textContent='تم إرسال الطلب';button.disabled=true;
  }catch(error){
   status.innerHTML='<strong>لم يتم تأكيد حفظ الطلب</strong><span>'+esc(error.message||'تعذر الاتصال بالخادم. حاول لاحقًا.')+'</span>';
   button.disabled=false;button.textContent='إعادة محاولة الإرسال';
  }
 }
 function valid(){
  const step=steps[current];
  if(step.type==='choice'&&step.required&&!data[step.key])return 'اختر أحد الخيارات للمتابعة.';
  if(step.type==='fields')for(const f of step.fields){const v=String(data[f.key]||'').trim();if(f.required&&!v)return 'يرجى إكمال حقل «'+f.label+'».';if(f.kind==='email'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return 'تحقق من صيغة البريد الإلكتروني.';if(f.key==='goal'&&v.length<20)return 'اكتب وصفًا للهدف لا يقل عن ٢٠ حرفًا.';}
  return '';
 }
 back.addEventListener('click',()=>{if(current>0){current--;render();}});
 next.addEventListener('click',()=>{if(current===steps.length-1){current=0;render();wizard.scrollIntoView({behavior:'smooth',block:'start'});return;}const msg=valid();if(msg){error.textContent=msg;error.hidden=false;return;}current++;render();wizard.scrollIntoView({behavior:'smooth',block:'start'});});
 document.querySelectorAll('[data-service]').forEach(a=>a.addEventListener('click',()=>{const aliases={'المواقع والمنصات':'موقع أو منصة','التطبيقات والأنظمة':'تطبيق أو نظام','الذكاء الاصطناعي والأتمتة':'ذكاء اصطناعي أو أتمتة','التكامل والدعم التقني':'تكامل أو دعم تقني'};const wanted=aliases[a.dataset.service]||a.dataset.service;const found=steps[0].options.find(o=>o[0]===wanted);if(found){data.service=found[0];current=0;render();wizard.scrollIntoView({behavior:'smooth',block:'start'});}}));
 render();
 const serviceFromUrl=new URLSearchParams(window.location.search).get('service');
 const queryServices={web:'موقع أو منصة',software:'تطبيق أو نظام',ai:'ذكاء اصطناعي أو أتمتة',integration:'تكامل أو دعم تقني',consult:'أحتاج إلى التوجيه'};
 if(serviceFromUrl&&queryServices[serviceFromUrl]){data.service=queryServices[serviceFromUrl];render();}
}

const pricingRoot=document.getElementById('livePricing');
if(pricingRoot){
 const notice=document.getElementById('pricingNotice');
 const escapeHtml=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const amountLabel=(minor,currency)=>{
  const amount=Number(minor);
  if(!Number.isFinite(amount)||amount<=0)return '';
  try{
   const options=new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions();
   const digits=Number.isInteger(options.maximumFractionDigits)?options.maximumFractionDigits:2;
   return new Intl.NumberFormat('ar-EG',{style:'currency',currency,maximumFractionDigits:digits}).format(amount/(10**digits));
  }catch{return '';}
 };
 const amountLine=(label,value,currency)=>{
  const formatted=amountLabel(value,currency);
  return formatted?'<div class="live-price-line"><span>'+label+'</span><strong>'+escapeHtml(formatted)+'</strong></div>':'';
 };
 fetch('/api/public/catalog',{headers:{accept:'application/json'},credentials:'same-origin'})
  .then(response=>{if(!response.ok)throw new Error('catalog unavailable');return response.json();})
  .then(result=>{
   if(result.ok!==true||!Array.isArray(result.categories))return;
   const plans=result.categories.flatMap(category=>(Array.isArray(category.plans)?category.plans:[]).map(plan=>({category,plan})));
   if(!plans.length)return;
   pricingRoot.innerHTML=plans.map(({category,plan})=>{
    const currency=/^[A-Z]{3}$/.test(plan.currency||'')?plan.currency:'';
    const amounts=plan.amountsMinor||{};
    const prices=currency?amountLine('رسوم التأسيس',amounts.setup,currency)+amountLine('شهريًا',amounts.monthly,currency)+amountLine('سنويًا',amounts.annual,currency):'';
    const features=Array.isArray(plan.features)?plan.features.filter(v=>typeof v==='string'&&v.trim()).map(v=>'<li>'+escapeHtml(v)+'</li>').join(''):'';
    return '<article class="live-plan-card"><small>'+escapeHtml(category.name?.ar||'خدمة')+'</small><h2>'+escapeHtml(plan.name?.ar||'باقة')+'</h2><p>'+escapeHtml(plan.description?.ar||'')+'</p><div class="live-price-lines">'+(prices||'<div class="live-price-pending">السعر قيد التحديد بعد مراجعة النطاق.</div>')+'</div>'+(features?'<ul>'+features+'</ul>':'')+'<a class="btn primary" href="/#contact">ناقش احتياجك ↗</a></article>';
   }).join('');
   if(notice)notice.hidden=true;
  })
  .catch(()=>{});
}

const serviceCatalogRoot=document.getElementById('liveServiceCatalog');
if(serviceCatalogRoot){
 const staticCatalog=document.getElementById('staticServiceCatalog');
 const escapeService=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const serviceAmount=(minor,currency)=>{
  const amount=Number(minor);
  if(!Number.isFinite(amount)||amount<=0||!/^[A-Z]{3}$/.test(currency||''))return '';
  try{
   const digits=new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
   return new Intl.NumberFormat('ar-EG',{style:'currency',currency,maximumFractionDigits:digits}).format(amount/(10**digits));
  }catch{return '';}
 };
 fetch('/api/public/catalog',{headers:{accept:'application/json'},credentials:'same-origin'})
  .then(response=>{if(!response.ok)throw new Error('catalog unavailable');return response.json();})
  .then(result=>{
   if(result.ok!==true||!Array.isArray(result.categories)||!result.categories.length)return;
   const categories=result.categories.filter(category=>category&&category.id);
   if(!categories.length)return;
   serviceCatalogRoot.innerHTML='<div class="service-catalog">'+categories.map(category=>{
    const plans=Array.isArray(category.plans)?category.plans:[];
    const planMarkup=plans.map(plan=>{
     const currency=plan.currency||'';
     const amounts=plan.amountsMinor||{};
     const priceParts=[['التأسيس',amounts.setup],['شهريًا',amounts.monthly],['سنويًا',amounts.annual]].map(([label,value])=>{
      const formatted=serviceAmount(value,currency);
      return formatted?'<div class="live-price-line"><span>'+label+'</span><strong>'+escapeService(formatted)+'</strong></div>':'';
     }).join('');
     const features=Array.isArray(plan.features)?plan.features.filter(value=>typeof value==='string'&&value.trim()).map(value=>'<li>'+escapeService(value)+'</li>').join(''):'';
     return '<div class="service-live-plan"><h3>'+escapeService(plan.name?.ar||'')+'</h3>'+(plan.description?.ar?'<p>'+escapeService(plan.description.ar)+'</p>':'')+'<div class="live-price-lines">'+(priceParts||'<div class="live-price-pending">السعر قيد التحديد بعد مراجعة النطاق.</div>')+'</div>'+(features?'<ul>'+features+'</ul>':'')+'</div>';
    }).join('');
    return '<article><small>'+escapeService(category.slug||'SERVICE')+'</small><h2>'+escapeService(category.name?.ar||'خدمات')+'</h2>'+(category.description?.ar?'<p>'+escapeService(category.description.ar)+'</p>':'')+(planMarkup||'<p>تواصل معنا لتحديد النطاق المناسب لهذه الخدمة.</p>')+'<a class="text-link" href="/#contact">ناقش احتياجك ←</a></article>';
   }).join('')+'</div>';
   if(staticCatalog)staticCatalog.hidden=true;
  })
  .catch(()=>{});
}
