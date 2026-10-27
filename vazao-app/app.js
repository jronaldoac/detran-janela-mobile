(() => {
  const STORAGE_KEY='hidrosolo-vazao-v1';
  const stations=[
    {id:'torneira1',name:'Torneira 1'},
    {id:'filtro1',name:'Filtro 1'},
    {id:'filtro2',name:'Filtro 2'},
    {id:'filtro3',name:'Filtro 3'}
  ];
  let activeStation=stations[0].id;
  let data=loadData();
  let timerStartedAt=null,timerElapsed=0,timerHandle=null;
  const $=id=>document.getElementById(id), volume=$('volume'), seconds=$('seconds');

  function emptyData(){return Object.fromEntries(stations.map(s=>[s.id,[]]));}
  function loadData(){
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if(!parsed||typeof parsed!=='object')return emptyData();
      const base=emptyData();
      stations.forEach(s=>{if(Array.isArray(parsed[s.id]))base[s.id]=parsed[s.id];});
      return base;
    }catch{return emptyData();}
  }
  function saveData(){localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}
  function num(v){return Number(String(v).replace(',','.'));}
  function fmt(v,d=2){return Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});}
  function calc(){
    const ml=num(volume.value),sec=num(seconds.value);
    if(!(ml>0)||!(sec>0))return null;
    const mls=ml/sec;
    return {ml,sec,mls,lph:mls*3.6};
  }
  function updateCalc(){
    const c=calc();
    $('mlsResult').textContent=c?fmt(c.mls):'0,00';
    $('lhResult').textContent=c?fmt(c.lph):'0,00';
    $('saveMeasurement').disabled=!c;
  }
  function stationName(id){return stations.find(s=>s.id===id)?.name||id;}
  function renderStations(){
    $('stations').innerHTML=stations.map(s=>`<button type="button" class="station ${s.id===activeStation?'active':''}" data-station="${s.id}">${s.name}</button>`).join('');
    document.querySelectorAll('[data-station]').forEach(btn=>btn.addEventListener('click',()=>{
      activeStation=btn.dataset.station;
      $('currentStation').textContent=stationName(activeStation);
      renderStations();renderHistory();
    }));
  }
  function renderSummary(){
    $('summary').innerHTML=stations.map(s=>{
      const list=data[s.id]||[],latest=list[list.length-1];
      const avg=list.length?list.reduce((sum,item)=>sum+item.lph,0)/list.length:0;
      return `<div class="summary-row"><div class="top"><strong>${s.name}</strong><span>${list.length} med.</span></div><div class="values"><div class="latest">${latest?fmt(latest.lph):'—'} <small>L/h</small></div><div class="avg">média ${list.length?fmt(avg):'—'}</div></div></div>`;
    }).join('');
    $('totalSaved').textContent=stations.reduce((sum,s)=>sum+(data[s.id]?.length||0),0);
  }
  function renderHistory(){
    const list=data[activeStation]||[];
    $('historyTitle').textContent=`Histórico — ${stationName(activeStation)}`;
    $('historyCount').textContent=`${list.length} registro${list.length===1?'':'s'}`;
    if(!list.length){$('historyList').innerHTML='<div class="empty">Nenhuma medição salva neste ponto.</div>';return;}
    $('historyList').innerHTML=[...list].reverse().slice(0,30).map(item=>`<div class="history-item"><div class="meta"><strong>${fmt(item.ml,0)} mL em ${fmt(item.sec)} s</strong><span>${new Date(item.at).toLocaleString('pt-BR')}</span></div><div class="flow">${fmt(item.lph)} <small>L/h</small></div><button class="delete-one" type="button" data-delete="${item.id}" aria-label="Excluir medição">×</button></div>`).join('');
    document.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>{
      data[activeStation]=data[activeStation].filter(item=>item.id!==btn.dataset.delete);
      saveData();renderAll();
    }));
  }
  function renderAll(){renderSummary();renderHistory();}
  function toast(message){
    const el=$('toast');el.textContent=message;el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'),1300);
  }

  $('saveMeasurement').addEventListener('click',()=>{
    const c=calc();if(!c)return;
    data[activeStation].push({id:(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`),at:new Date().toISOString(),...c});
    saveData();renderAll();toast(`${stationName(activeStation)} salvo`);volume.select();
  });
  $('clearStation').addEventListener('click',()=>{
    if(!(data[activeStation]||[]).length)return;
    if(!confirm(`Apagar todo o histórico de ${stationName(activeStation)}?`))return;
    data[activeStation]=[];saveData();renderAll();
  });
  $('copyData').addEventListener('click',async()=>{
    const lines=['Ponto;Data;Volume_mL;Tempo_s;mL_s;L_h'];
    stations.forEach(s=>(data[s.id]||[]).forEach(item=>lines.push([s.name,new Date(item.at).toLocaleString('pt-BR'),fmt(item.ml,0),fmt(item.sec),fmt(item.mls),fmt(item.lph)].join(';'))));
    const text=lines.join('\n');
    try{await navigator.clipboard.writeText(text);toast('Dados copiados');}
    catch{
      const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Dados copiados');
    }
  });
  volume.addEventListener('input',updateCalc);seconds.addEventListener('input',updateCalc);

  function timerValue(){return timerStartedAt?timerElapsed+(performance.now()-timerStartedAt):timerElapsed;}
  function timerText(ms){const total=ms/1000,min=Math.floor(total/60),sec=Math.floor(total%60),cent=Math.floor((total*100)%100);return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(cent).padStart(2,'0')}`;}
  function paintTimer(){$('timerText').textContent=timerText(timerValue());}
  $('startTimer').addEventListener('click',()=>{if(timerStartedAt)return;timerStartedAt=performance.now();timerHandle=setInterval(paintTimer,33);});
  $('pauseTimer').addEventListener('click',()=>{if(!timerStartedAt)return;timerElapsed=timerValue();timerStartedAt=null;clearInterval(timerHandle);timerHandle=null;paintTimer();});
  $('resetTimer').addEventListener('click',()=>{timerStartedAt=null;timerElapsed=0;clearInterval(timerHandle);timerHandle=null;paintTimer();});
  $('insertTimer').addEventListener('click',()=>{const ms=timerValue();if(ms<=0)return;seconds.value=(ms/1000).toFixed(2);updateCalc();});

  renderStations();renderAll();updateCalc();paintTimer();
})();