'use strict';
(()=>{
 const qs=new URLSearchParams(location.search),token=qs.get('token'),requestForm=document.getElementById('request-form'),confirmForm=document.getElementById('confirm-form'),status=document.getElementById('reset-status'),title=document.getElementById('reset-title');
 if(token){requestForm.hidden=true;confirmForm.hidden=false;title.textContent='تعيين كلمة مرور جديدة';}
 async function submit(form,path,payload){
  const button=form.querySelector('button');button.disabled=true;status.textContent='جارٍ التنفيذ...';
  try{const r=await fetch('/api/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر إتمام الطلب.');status.textContent=d.message||'تم بنجاح.';if(path.endsWith('confirm')){confirmForm.reset();history.replaceState({},'',location.pathname);}}
  catch(e){status.textContent=e.message||'حدث خطأ. حاول مجددًا.';}finally{button.disabled=false;}
 }
 requestForm.addEventListener('submit',e=>{e.preventDefault();submit(requestForm,'auth/password-reset/request',{email:requestForm.elements.email.value.trim()});});
 confirmForm.addEventListener('submit',e=>{e.preventDefault();if(!token){status.textContent='رابط الاستعادة غير موجود.';return;}submit(confirmForm,'auth/password-reset/confirm',{token,password:confirmForm.elements.password.value});});
})();