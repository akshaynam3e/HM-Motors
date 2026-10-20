(() => {
  const qs=(selector,root=document)=>root.querySelector(selector);
  const qsa=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const formatINR=(value)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);
  const track=(type,vehicleId='')=>{
    const data={type,page:location.pathname};if(vehicleId)data.vehicleId=vehicleId;
    fetch('/api/public/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),keepalive:true}).catch(()=>{});
  };

  const menu=qs('.menu-toggle');
  if(menu){menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')==='true';menu.setAttribute('aria-expanded',String(!open));qs('#primary-navigation')?.classList.toggle('is-open',!open);});}

  document.addEventListener('click',(event)=>{
    const trackLink=event.target.closest('[data-track]');
    if(trackLink){track(trackLink.dataset.track,trackLink.dataset.vehicle||'');}
    const compare=event.target.closest('[data-compare-add]');
    if(compare){
      const slug=compare.dataset.compareAdd;let items=[];try{items=JSON.parse(localStorage.getItem('showroom-compare')||'[]');}catch{}
      if(items.includes(slug)){announce('This vehicle is already in your comparison.');return;}
      if(items.length>=3){announce('Compare up to three vehicles. Remove one on the comparison page first.');return;}
      items.push(slug);localStorage.setItem('showroom-compare',JSON.stringify(items));track('compare_add');announce('Vehicle added. Open Compare to review the selected listings.');
    }
  });
  function announce(message){let node=qs('#site-toast');if(!node){node=document.createElement('div');node.id='site-toast';node.className='site-toast';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.append(node);}node.textContent=message;node.classList.add('is-visible');clearTimeout(window._toastTimer);window._toastTimer=setTimeout(()=>node.classList.remove('is-visible'),3500);}

  qsa('[data-enquiry-form]').forEach((form)=>form.addEventListener('submit',async(event)=>{
    event.preventDefault();const button=qs('button[type="submit"]',form);const status=qs('.form-status',form);const data=Object.fromEntries(new FormData(form).entries());data.type=form.dataset.enquiryForm;data.source=location.pathname;
    if(button)button.disabled=true;if(status)status.textContent='Sending your request…';
    try{const response=await fetch('/api/public/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Your request could not be sent.');if(status)status.textContent=`${result.message}${result.reference?` Reference: ${result.reference}.`:''}`;form.reset();track('enquiry_submitted');}
    catch(error){if(status)status.textContent=error.message||'A connection error occurred. Please try again.';}
    finally{if(button)button.disabled=false;}
  }));

  const emi=qs('#emi-form');
  if(emi)emi.addEventListener('submit',(event)=>{
    event.preventDefault();const values=new FormData(emi);const price=Number(values.get('price')),down=Number(values.get('downPayment')),annual=Number(values.get('rate')),months=Number(values.get('months'));const result=qs('#emi-result');
    try{const estimate=window.calculateShowroomEmi(price,down,annual,months);result.innerHTML=`<div class="result-row"><span>Estimated monthly EMI</span><strong>${formatINR(estimate.monthlyEmi)}</strong></div><div class="result-row"><span>Loan amount</span><strong>${formatINR(estimate.principal)}</strong></div><div class="result-row"><span>Total estimated interest</span><strong>${formatINR(estimate.totalInterest)}</strong></div><div class="result-row"><span>Total estimated repayment</span><strong>${formatINR(estimate.totalRepayment)}</strong></div>`;}catch(error){result.textContent=error.message;}
  });

  const compareRoot=qs('#compare-content');
  if(compareRoot){
    let slugs=[];try{slugs=JSON.parse(localStorage.getItem('showroom-compare')||'[]').slice(0,3);}catch{}
    if(!slugs.length){compareRoot.innerHTML='<div class="empty-state"><h2>No vehicles selected</h2><p>Use “Add to compare” on listed vehicle cards to add up to three vehicles.</p><a class="button" href="/vehicles">Browse vehicles</a></div>';}
    else fetch(`/api/public/vehicles?slugs=${encodeURIComponent(slugs.join(','))}`).then((r)=>r.json()).then(({vehicles=[]})=>{
      if(!vehicles.length){compareRoot.innerHTML='<div class="empty-state"><h2>Selected listings are no longer available</h2><button class="button" type="button" id="clear-compare">Clear comparison</button></div>';return;}
      const allSpecKeys=[...new Set(vehicles.flatMap((v)=>Object.keys(v.specifications||{})))];
      const rows=[['Condition',v=>v.condition==='PRE_OWNED'?'Second-hand':'New'],['Category',v=>({SCOOTER:'Scooty',MOTORCYCLE:'Bike',CAR:'Car'}[v.category]||'Vehicle')],['Brand',v=>v.brand],['Model / variant',v=>[v.model,v.variant].filter(Boolean).join(' · ')],['Price',v=>v.price_verified&&v.ex_showroom_price!==null?`${v.condition==='PRE_OWNED'?'Asking price':'Ex-showroom price'} · ${formatINR(Number(v.ex_showroom_price))}`:'Not verified — enquire'],['Availability',v=>({ASK:'Ask showroom',IN_STOCK:'Listed in stock; confirm',LIMITED:'Limited; confirm',OUT_OF_STOCK:'Unavailable',DISCONTINUED:'Discontinued'}[v.availability]||'Ask showroom')],['Engine capacity',v=>v.engine_cc?`${v.engine_cc} cc`:'Not provided'],['Colours',v=>(v.colours||[]).join(', ')||'Not provided'],...allSpecKeys.map((key)=>[key,v=>v.specifications?.[key]||'Not provided'])];
      const table=document.createElement('div');table.className='table-wrap';const html=document.createElement('table');html.className='compare-table';const thead=document.createElement('thead');const hr=document.createElement('tr');const blank=document.createElement('th');blank.textContent='Details';hr.append(blank);vehicles.forEach((v)=>{const th=document.createElement('th');th.textContent=[v.brand,v.model,v.variant].filter(Boolean).join(' ');hr.append(th);});thead.append(hr);html.append(thead);const tbody=document.createElement('tbody');rows.forEach(([label,fn])=>{const tr=document.createElement('tr');const th=document.createElement('th');th.scope='row';th.textContent=label;tr.append(th);vehicles.forEach((v)=>{const td=document.createElement('td');td.textContent=String(fn(v));tr.append(td);});tbody.append(tr);});html.append(tbody);table.append(html);compareRoot.replaceChildren(table);const actions=document.createElement('div');actions.className='compare-actions';const clear=document.createElement('button');clear.type='button';clear.className='button button--outline';clear.id='clear-compare';clear.textContent='Clear comparison';clear.addEventListener('click',()=>{localStorage.removeItem('showroom-compare');location.reload();});actions.append(clear);compareRoot.append(actions);
    }).catch(()=>{compareRoot.textContent='Comparison could not be loaded. Refresh the page or return to the catalogue.';});
  }
  document.addEventListener('click',(event)=>{if(event.target.id==='clear-compare'){localStorage.removeItem('showroom-compare');location.reload();}});

  const vehicleMatch=location.pathname.match(/^\/vehicles\/([^/]+)$/);if(vehicleMatch)track('vehicle_view');
})();
