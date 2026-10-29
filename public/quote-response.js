'use strict';
const $=id=>document.getElementById(id);
let token='',quote=null;
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function money(amount,currency){const value=Number(amount||0)/100;try{return new Intl.NumberFormat('ar-EG',{style:'currency',currency:String(currency||'EGP').trim(),maximumFractionDigits:2}).format(value);}catch{return value.toFixed(2)+' '+String(currency||'EGP').trim();}}
function showError(message){$('quoteLoading').hidden=false;$('quotePanel').hidden=true;$('quoteStatus').textContent=message;}
function renderQuote(data){
 quote=data;$('quoteLoading').hidden=true;$('quotePanel').hidden=false;$('quoteReference').textContent=data.reference;
 $('quoteExpiry').textContent=data.valid_until?'صالح حتى '+String(data.valid_until).slice(0,10):'صالح لمدة محدودة';
 $('setupTotal').textContent=money(data.setup_total_minor,data.currency);$('monthlyTotal').textContent=money(data.monthly_total_minor,data.currency);$('annualTotal').textContent=money(data.annual_total_minor,data.currency);
 $('quoteItems').replaceChildren();
 const items=Array.isArray(data.snapshot?.items)?data.snapshot.items:[];
 items.forEach((item,index)=>{const card=el('article','quote-item');const heading=el('h3',null,(index+1)+'. '+item.description);const quantity=el('p','muted','الكمية: '+item.quantity);card.append(heading,quantity);const costs=el('div','quote-line-costs');costs.append(el('span',null,'تأسيس: '+money(item.setup_total_minor,data.currency)),el('span',null,'شهري: '+money(item.monthly_total_minor,data.currency)),el('span',null,'سنوي: '+money(item.annual_total_minor,data.currency)));card.append(costs);$('quoteItems').append(card);});
 if(data.snapshot?.customer_note){$('customerNote').hidden=false;$('customerNote').textContent='ملاحظات العرض: '+data.snapshot.customer_note;}else $('customerNote').hidden=true;
}
async function loadQuote(){
 token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
 if(token.length<20){showError('رابط عرض السعر غير مكتمل. افتح الرابط الذي أرسله فريق ATSH AI.');return;}
 try{const response=await fetch('/api/public/quotes/lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const result=await response.json().catch(()=>({}));if(!response.ok){showError(result.message||'رابط العرض غير صالح أو منتهي الصلاحية.');return;}renderQuote(result.quote);}
 catch{showError('تعذر الاتصال بالخادم. لم يتم تسجيل أي قرار.');}
}
async function respond(decision){
 if(!quote||!token)return;
 if(decision==='accepted'&&!$('acceptConfirm').checked){$('decisionStatus').textContent='يرجى تأكيد مراجعة النطاق والتكاليف قبل الموافقة.';return;}
 if(decision==='rejected'&&!window.confirm('هل تريد رفض عرض السعر؟ سيتم تسجيل قرار الرفض لهذا الرابط.'))return;
 $('acceptQuote').disabled=true;$('rejectQuote').disabled=true;$('decisionStatus').textContent='جارٍ تسجيل ردك والتحقق من صلاحية العرض…';
 try{const response=await fetch('/api/public/quotes/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,decision})});const result=await response.json().catch(()=>({}));if(!response.ok){$('acceptQuote').disabled=false;$('rejectQuote').disabled=false;$('decisionStatus').textContent=result.message||'تعذر تسجيل الرد؛ لم يتم تأكيد القرار.';return;}
 $('quotePanel').hidden=true;$('quoteDone').hidden=false;$('doneHeading').textContent=decision==='accepted'?'تم تسجيل موافقتك':'تم تسجيل رفض العرض';$('doneMessage').textContent=decision==='accepted'?'تم حفظ موافقتك على العرض. سيتواصل معك فريق ATSH AI بشأن الخطوات التالية.':'تم تسجيل رفض العرض. يمكنك التواصل مع فريق ATSH AI إذا أردت مناقشة نطاق مختلف.';
 history.replaceState(null,'',location.pathname);
 }catch{$('acceptQuote').disabled=false;$('rejectQuote').disabled=false;$('decisionStatus').textContent='تعذر الاتصال بالخادم؛ لم يتم تأكيد تسجيل ردك.';}
}
$('acceptQuote').addEventListener('click',()=>respond('accepted'));$('rejectQuote').addEventListener('click',()=>respond('rejected'));$('year').textContent=new Date().getFullYear();loadQuote();
