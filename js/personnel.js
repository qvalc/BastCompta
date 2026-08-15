if (new URLSearchParams(window.location.search).get('embedded') === '1') document.body.classList.add('bast-embedded');

const STORAGE_KEY = 'bastcompta-personnel-v1';
const DRIVE_SYNC_FILE_NAME = 'bastcompta-personnel-sync.json';
let googleAccessToken = null;
let selectedWorkerId = '';
let selectedTab = 'overview';
let selectedSummaryYear = String(new Date().getFullYear());
let data = loadData();
let driveSaveTimer = null;

const money = value => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
const dateLabel = value => value ? new Date(value + (String(value).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-BE') : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const today = () => new Date().toISOString().slice(0,10);
const num = value => Number(String(value ?? '').replace(',', '.')) || 0;

function blankData(){ return { version: 1, updatedAt: new Date().toISOString(), workers: [] }; }
function normalizeWorker(w={}){
  return {
    id:w.id||uid('worker'), firstName:w.firstName||'', lastName:w.lastName||'', type:w.type||'worker', active:w.active!==false,
    birthDate:w.birthDate||'', nationalNumber:w.nationalNumber||'', address:w.address||'', phone:w.phone||'', email:w.email||'', emergencyContact:w.emergencyContact||'',
    functionTitle:w.functionTitle||'', department:w.department||'', jointCommittee:w.jointCommittee||'', contractType:w.contractType||'CDI', startDate:w.startDate||'', endDate:w.endDate||'',
    workRegime:w.workRegime||'Temps plein', weeklyHours:num(w.weeklyHours)||38, wageType:w.wageType||'monthly', baseWage:num(w.baseWage), annualLeaveDays:num(w.annualLeaveDays)||20,
    iban:w.iban||'', notes:w.notes||'',
    salaries:Array.isArray(w.salaries)?w.salaries:[], bonuses:Array.isArray(w.bonuses)?w.bonuses:[], leaves:Array.isArray(w.leaves)?w.leaves:[], absences:Array.isArray(w.absences)?w.absences:[],
    timeEntries:Array.isArray(w.timeEntries)?w.timeEntries:[], documents:Array.isArray(w.documents)?w.documents:[], trainings:Array.isArray(w.trainings)?w.trainings:[], equipment:Array.isArray(w.equipment)?w.equipment:[], history:Array.isArray(w.history)?w.history:[]
  };
}
function normalizeData(source){ const base=blankData(); if(source&&typeof source==='object') Object.assign(base,source); base.workers=Array.isArray(base.workers)?base.workers.map(normalizeWorker):[]; return base; }
function loadData(){ try{return normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'));}catch{return blankData();} }
function saveLocal(detail='Modification du personnel'){
  data.updatedAt=new Date().toISOString(); localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  try{window.parent?.BastComptaPortal?.markChanged?.('personnel',detail);}catch{}
  if(googleAccessToken){ clearTimeout(driveSaveTimer); driveSaveTimer=setTimeout(()=>saveSyncToDrive(false),1000); }
}
function workerName(w){ return `${w.firstName||''} ${w.lastName||''}`.trim() || 'Sans nom'; }
function getWorker(){ return data.workers.find(w=>w.id===selectedWorkerId)||null; }
function recordYear(item){ return String(item.date||item.startDate||item.month||'').slice(0,4); }
function inSelectedYear(item){ return selectedSummaryYear==='all' || recordYear(item)===selectedSummaryYear; }
function daysInclusive(start,end){ if(!start)return 0; const a=new Date(start+'T00:00:00'), b=new Date((end||start)+'T00:00:00'); return Math.max(1,Math.round((b-a)/86400000)+1); }
function salaryCost(s){ return num(s.gross)+num(s.employerCharges)+num(s.mealVouchers)+num(s.benefits)+num(s.reimbursements); }
function bonusCost(b){ return num(b.amount)+num(b.employerCharges); }
function isCurrentAbsence(a){ const t=today(); return a.startDate<=t && (!a.endDate || a.endDate>=t); }
function usedLegalLeave(w, year=selectedSummaryYear){ return w.leaves.filter(l=>(year==='all'||recordYear(l)===year)&&l.type==='legal'&&l.status!=='cancelled').reduce((sum,l)=>sum+(num(l.days)||daysInclusive(l.startDate,l.endDate)),0); }

function notify(message){ const t=document.getElementById('toast'); t.textContent=message; t.classList.add('show'); clearTimeout(t._timer); t._timer=setTimeout(()=>t.classList.remove('show'),2600); }
function setDriveState(connected){ const el=document.getElementById('driveState'); if(!el)return; el.textContent=`Google Drive : ${connected?'connecté':'non connecté'}`; el.classList.toggle('connected',connected); }

function buildYearOptions(){
  const years=new Set([String(new Date().getFullYear())]);
  data.workers.forEach(w=>['salaries','bonuses','leaves','absences','timeEntries'].forEach(k=>(w[k]||[]).forEach(r=>{const y=recordYear(r);if(/^\d{4}$/.test(y))years.add(y);}))); 
  const sel=document.getElementById('summaryYearFilter'); if(!sel)return;
  sel.innerHTML=[...years].sort((a,b)=>b.localeCompare(a)).map(y=>`<option value="${y}">${y}</option>`).join('')+'<option value="all">Toutes années</option>';
  if(![...sel.options].some(o=>o.value===selectedSummaryYear)) selectedSummaryYear=String(new Date().getFullYear()); sel.value=selectedSummaryYear;
}
function setSummaryYear(value){ selectedSummaryYear=value; renderSummary(); renderMain(); }

function renderSummary(){
  const active=data.workers.filter(w=>w.active); const workers=active.filter(w=>w.type==='worker').length, employees=active.filter(w=>w.type==='employee').length;
  let gross=0,cost=0,abs=0,leave=0;
  data.workers.forEach(w=>{
    w.salaries.filter(inSelectedYear).forEach(s=>{gross+=num(s.gross);cost+=salaryCost(s)});
    w.bonuses.filter(inSelectedYear).forEach(b=>cost+=bonusCost(b));
    abs+=w.absences.filter(a=>isCurrentAbsence(a)).length;
    if(w.active) leave+=Math.max(0,num(w.annualLeaveDays)-usedLegalLeave(w,selectedSummaryYear==='all'?String(new Date().getFullYear()):selectedSummaryYear));
  });
  document.getElementById('metricActive').textContent=active.length;
  document.getElementById('metricActiveSub').textContent=`${workers} ouvrier${workers!==1?'s':''} · ${employees} employé${employees!==1?'s':''}`;
  document.getElementById('metricGross').textContent=money(gross); document.getElementById('metricEmployerCost').textContent=money(cost);
  document.getElementById('metricAbsences').textContent=abs; document.getElementById('metricLeave').textContent=`${leave.toLocaleString('fr-BE',{maximumFractionDigits:1})} j`;
}
function renderWorkerList(){
  const q=(document.getElementById('workerSearch')?.value||'').toLowerCase(); const status=document.getElementById('workerStatusFilter')?.value||'active'; const type=document.getElementById('workerTypeFilter')?.value||'all';
  const list=data.workers.filter(w=>{ if(status==='active'&&!w.active)return false;if(status==='inactive'&&w.active)return false;if(type!=='all'&&w.type!==type)return false;return `${workerName(w)} ${w.functionTitle} ${w.department}`.toLowerCase().includes(q);}).sort((a,b)=>workerName(a).localeCompare(workerName(b),'fr'));
  document.getElementById('workerList').innerHTML=list.length?list.map(w=>`<button class="worker-item ${w.id===selectedWorkerId?'active':''}" onclick="selectWorker('${w.id}')"><div class="worker-name">${esc(workerName(w))}</div><div class="worker-meta"><span class="badge ${w.active?'active':'inactive'}">${w.active?'Actif':'Inactif'}</span><span>${w.type==='worker'?'Ouvrier':'Employé'}</span>${w.functionTitle?`<span>· ${esc(w.functionTitle)}</span>`:''}</div></button>`).join(''):'<div class="empty-state" style="min-height:180px"><div>Aucun travailleur.</div></div>';
}
function selectWorker(id){ selectedWorkerId=id; selectedTab='overview'; renderWorkerList(); renderMain(); }

const tabLabels={overview:'Résumé',salary:'Salaires',time:'Prestations',leave:'Congés',absence:'Maladies & absences',bonus:'Primes & avantages',document:'Documents',training:'Formations',equipment:'Matériel',history:'Historique'};
function setWorkerTab(tab){ selectedTab=tab; renderMain(); }
function renderMain(){
  const root=document.getElementById('mainContent'), w=getWorker();
  if(!w){ root.innerHTML=`<div class="empty-state"><div><h2>Gestion du personnel</h2><p>Sélectionnez un travailleur ou créez une nouvelle fiche.</p><button class="primary" onclick="openWorkerModal()">+ Ajouter un travailleur</button></div></div>`; return; }
  const period=selectedSummaryYear==='all'?'toutes années':selectedSummaryYear;
  const salaries=w.salaries.filter(inSelectedYear), bonuses=w.bonuses.filter(inSelectedYear), time=w.timeEntries.filter(inSelectedYear);
  const cost=salaries.reduce((s,x)=>s+salaryCost(x),0)+bonuses.reduce((s,x)=>s+bonusCost(x),0); const hours=time.reduce((s,x)=>s+num(x.hours)+num(x.overtimeHours),0); const leaveRemaining=Math.max(0,num(w.annualLeaveDays)-usedLegalLeave(w,selectedSummaryYear==='all'?String(new Date().getFullYear()):selectedSummaryYear));
  root.innerHTML=`<div class="profile-head"><div class="profile-title"><h2>${esc(workerName(w))}</h2><p>${esc(w.functionTitle||'Fonction non renseignée')} · ${w.type==='worker'?'Ouvrier':'Employé'} · ${esc(w.workRegime)}</p></div><div class="profile-actions"><button onclick="openWorkerModal('${w.id}')">Modifier</button><button onclick="window.print()">Imprimer</button></div></div>
  <div class="mini-grid"><div class="mini-card"><span>Coût employeur (${period})</span><strong>${money(cost)}</strong></div><div class="mini-card"><span>Heures enregistrées</span><strong>${hours.toLocaleString('fr-BE',{maximumFractionDigits:2})} h</strong></div><div class="mini-card"><span>Coût réel / heure</span><strong>${hours?money(cost/hours):'—'}</strong></div><div class="mini-card"><span>Congés restants</span><strong>${leaveRemaining.toLocaleString('fr-BE',{maximumFractionDigits:1})} j</strong></div></div>
  <div class="tabs">${Object.entries(tabLabels).map(([k,v])=>`<button class="tab-btn ${selectedTab===k?'active':''}" onclick="setWorkerTab('${k}')">${v}</button>`).join('')}</div>${renderTab(w)}`;
}
function renderTab(w){
  if(selectedTab==='overview') return renderOverview(w);
  const cfg={
    salary:{title:'Salaires',button:'Ajouter un salaire',type:'salary',records:w.salaries,cols:[['month','Mois'],['gross','Brut','money'],['net','Net','money'],['employerCharges','Charges patronales','money'],['cost','Coût total','calcSalary']]},
    time:{title:'Prestations / pointage',button:'Ajouter des prestations',type:'time',records:w.timeEntries,cols:[['date','Date','date'],['hours','Heures'],['overtimeHours','Heures supp.'],['client','Client / chantier'],['note','Note']]},
    leave:{title:'Congés',button:'Ajouter un congé',type:'leave',records:w.leaves,cols:[['startDate','Début','date'],['endDate','Fin','date'],['type','Type','leaveType'],['days','Jours'],['status','Statut']]},
    absence:{title:'Maladies & absences',button:'Ajouter une absence',type:'absence',records:w.absences,cols:[['startDate','Début','date'],['endDate','Fin','date'],['type','Type','absenceType'],['certificate','Certificat'],['note','Note']]},
    bonus:{title:'Primes & avantages',button:'Ajouter une prime / avantage',type:'bonus',records:w.bonuses,cols:[['date','Date','date'],['type','Type'],['description','Description'],['amount','Montant','money'],['employerCharges','Charges','money']]},
    document:{title:'Documents',button:'Ajouter un document',type:'document',records:w.documents,cols:[['date','Date','date'],['type','Type'],['name','Nom'],['expiryDate','Échéance','date'],['driveFileId','Drive','drive']]},
    training:{title:'Formations & habilitations',button:'Ajouter une formation',type:'training',records:w.trainings,cols:[['name','Formation / brevet'],['obtainedDate','Obtention','date'],['expiryDate','Expiration','date'],['provider','Organisme'],['note','Note']]},
    equipment:{title:'Matériel attribué',button:'Attribuer du matériel',type:'equipment',records:w.equipment,cols:[['name','Matériel'],['serial','N° / référence'],['assignedDate','Remis le','date'],['returnedDate','Restitué le','date'],['condition','État']]},
    history:{title:'Historique',button:'Ajouter une note historique',type:'history',records:w.history,cols:[['date','Date','date'],['type','Type'],['description','Description'],['author','Auteur']]}
  }[selectedTab];
  if(!cfg)return '';
  const records=[...cfg.records].sort((a,b)=>String(b.date||b.startDate||b.month||b.obtainedDate||b.assignedDate||'').localeCompare(String(a.date||a.startDate||a.month||a.obtainedDate||a.assignedDate||'')));
  const extra=selectedTab==='leave'?`<div class="notice">Droit annuel : <strong>${w.annualLeaveDays} j</strong> · Congés légaux utilisés (${selectedSummaryYear==='all'?new Date().getFullYear():selectedSummaryYear}) : <strong>${usedLegalLeave(w,selectedSummaryYear==='all'?String(new Date().getFullYear()):selectedSummaryYear)} j</strong></div>`:'';
  return `${extra}<div class="section-head"><h3>${cfg.title}</h3><button class="primary small" onclick="openRecordModal('${cfg.type}')">+ ${cfg.button}</button></div>${renderTable(cfg,records)}`;
}
function cellValue(item,key,format){
  if(format==='money')return money(item[key]); if(format==='date')return dateLabel(item[key]); if(format==='calcSalary')return money(salaryCost(item));
  if(format==='leaveType')return ({legal:'Congé légal',extra:'Extra-légal',recovery:'Récupération',unpaid:'Sans solde',circumstantial:'Petit chômage / circonstanciel'}[item[key]]||item[key]||'—');
  if(format==='absenceType')return ({illness:'Maladie',work_accident:'Accident du travail',justified:'Absence justifiée',unjustified:'Absence injustifiée',other:'Autre'}[item[key]]||item[key]||'—');
  if(format==='drive')return item.driveFileId?`<button class="small" onclick="openDriveDocument('${item.id}')">Ouvrir</button>`:'—'; return esc(item[key]??'—');
}
function renderTable(cfg,records){ if(!records.length)return '<div class="empty-state" style="min-height:220px"><div>Aucune donnée enregistrée.</div></div>';
  return `<div style="overflow:auto"><table class="data-table"><thead><tr>${cfg.cols.map(c=>`<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${records.map(r=>`<tr>${cfg.cols.map(c=>`<td class="${c[2]==='money'||c[2]==='calcSalary'?'num':''}">${cellValue(r,c[0],c[2])}</td>`).join('')}<td><div class="row-actions"><button class="small" onclick="openRecordModal('${cfg.type}','${r.id}')">Modifier</button><button class="small danger" onclick="deleteRecord('${cfg.type}','${r.id}')">Supprimer</button></div></td></tr>`).join('')}</tbody></table></div>`; }
function renderOverview(w){
  const activeAbs=w.absences.filter(isCurrentAbsence); const expiring=w.trainings.filter(t=>t.expiryDate&&t.expiryDate>=today()).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate)).slice(0,4);
  return `<div class="section-head"><h3>Fiche travailleur</h3><button class="small" onclick="openWorkerModal('${w.id}')">Modifier la fiche</button></div><div class="info-grid">
  ${info('Statut',w.active?'Actif':'Inactif')} ${info('Contrat',`${w.contractType} · ${w.startDate?dateLabel(w.startDate):'date non renseignée'}`)} ${info('Commission paritaire',w.jointCommittee||'—')} ${info('Régime',`${w.workRegime} · ${w.weeklyHours} h/sem.`)}
  ${info('Rémunération de base',w.baseWage?`${money(w.baseWage)} ${w.wageType==='hourly'?'/ h':'/ mois'}`:'—')} ${info('Téléphone / e-mail',[w.phone,w.email].filter(Boolean).join(' · ')||'—')} ${info('Adresse',w.address||'—')} ${info('IBAN',w.iban||'—')}</div>
  ${activeAbs.length?`<div class="notice"><strong>Absence en cours :</strong> ${activeAbs.map(a=>esc(cellValue(a,'type','absenceType'))+' depuis le '+dateLabel(a.startDate)).join(', ')}</div>`:''}
  ${expiring.length?`<div class="notice"><strong>Prochaines échéances formations :</strong> ${expiring.map(t=>`${esc(t.name)} (${dateLabel(t.expiryDate)})`).join(' · ')}</div>`:''}
  ${w.notes?`<div class="section-head"><h3>Notes</h3></div><div class="notice">${esc(w.notes).replace(/\n/g,'<br>')}</div>`:''}`;
}
function info(label,value){return `<div class="info"><span>${label}</span><strong>${esc(value)}</strong></div>`;}

function openModal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('modalBackdrop').classList.add('open'); }
function closeModal(){ document.getElementById('modalBackdrop').classList.remove('open'); document.getElementById('modal').innerHTML=''; }
function field(label,id,value='',type='text',extra='',full=false){ return `<div class="form-row ${full?'full':''}"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${extra}></div>`; }
function selectField(label,id,value,options,full=false){ return `<div class="form-row ${full?'full':''}"><label for="${id}">${label}</label><select id="${id}">${options.map(([v,l])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select></div>`; }
function textareaField(label,id,value='',full=true){return `<div class="form-row ${full?'full':''}"><label for="${id}">${label}</label><textarea id="${id}">${esc(value)}</textarea></div>`;}
function val(id){return document.getElementById(id)?.value||'';}

function openWorkerModal(id=''){
  const w=id?data.workers.find(x=>x.id===id):normalizeWorker({}); const editing=!!id;
  openModal(`<div class="modal-head"><div><h2>${editing?'Modifier':'Nouveau'} travailleur</h2><div class="metric-sub">Informations contractuelles et administratives internes.</div></div><button class="ghost small" onclick="closeModal()">✕</button></div><div class="form-grid">
  ${field('Prénom','fFirst',w.firstName)}${field('Nom','fLast',w.lastName)}${selectField('Statut','fType',w.type,[['worker','Ouvrier'],['employee','Employé']])}${selectField('Situation','fActive',String(w.active),[['true','Actif'],['false','Sorti / inactif']])}
  ${field('Fonction','fFunction',w.functionTitle)}${field('Service / équipe','fDepartment',w.department)}${field('Date de naissance','fBirth',w.birthDate,'date')}${field('N° registre / référence interne','fNational',w.nationalNumber)}
  ${field('Téléphone','fPhone',w.phone,'tel')}${field('E-mail','fEmail',w.email,'email')}${field('Adresse','fAddress',w.address,'text','',true)}${field('Contact urgence','fEmergency',w.emergencyContact,'text','',true)}
  ${selectField('Type de contrat','fContract',w.contractType,[['CDI','CDI'],['CDD','CDD'],['Remplacement','Remplacement'],['Intérim','Intérim'],['Étudiant','Étudiant'],['Autre','Autre']])}${field('Commission paritaire','fCP',w.jointCommittee)}${field('Date d’entrée','fStart',w.startDate,'date')}${field('Date de sortie / fin','fEnd',w.endDate,'date')}
  ${field('Régime de travail','fRegime',w.workRegime)}${field('Heures / semaine','fWeekly',w.weeklyHours,'number','step="0.01" min="0"')}${selectField('Type de rémunération','fWageType',w.wageType,[['monthly','Mensuelle'],['hourly','Horaire']])}${field('Salaire / taux de base','fBaseWage',w.baseWage||'','number','step="0.01" min="0"')}
  ${field('Droit annuel congés (jours)','fAnnualLeave',w.annualLeaveDays,'number','step="0.5" min="0"')}${field('IBAN','fIban',w.iban)}${textareaField('Notes','fNotes',w.notes)}
  </div><div class="modal-actions"><button onclick="closeModal()">Annuler</button>${editing?'<button class="danger" onclick="deleteWorker()">Supprimer la fiche</button>':''}<button class="primary" onclick="saveWorker('${id}')">Enregistrer</button></div>`);
}
function saveWorker(id){
  let w=id?data.workers.find(x=>x.id===id):normalizeWorker({}); if(!val('fFirst').trim()&&!val('fLast').trim())return notify('Indiquez au moins un nom ou un prénom.');
  Object.assign(w,{firstName:val('fFirst').trim(),lastName:val('fLast').trim(),type:val('fType'),active:val('fActive')==='true',functionTitle:val('fFunction'),department:val('fDepartment'),birthDate:val('fBirth'),nationalNumber:val('fNational'),phone:val('fPhone'),email:val('fEmail'),address:val('fAddress'),emergencyContact:val('fEmergency'),contractType:val('fContract'),jointCommittee:val('fCP'),startDate:val('fStart'),endDate:val('fEnd'),workRegime:val('fRegime'),weeklyHours:num(val('fWeekly')),wageType:val('fWageType'),baseWage:num(val('fBaseWage')),annualLeaveDays:num(val('fAnnualLeave')),iban:val('fIban'),notes:val('fNotes')});
  if(!id){data.workers.push(w);selectedWorkerId=w.id;w.history.push({id:uid('hist'),date:today(),type:'Création',description:'Création de la fiche travailleur.',author:''});}
  else w.history.push({id:uid('hist'),date:today(),type:'Modification',description:'Fiche travailleur mise à jour.',author:''});
  saveLocal(`${workerName(w)} : fiche mise à jour`);closeModal();buildYearOptions();renderAll();notify('Fiche travailleur enregistrée.');
}
function deleteWorker(){ const w=getWorker(); if(!w||!confirm(`Supprimer définitivement la fiche de ${workerName(w)} et toutes ses données ?`))return; data.workers=data.workers.filter(x=>x.id!==w.id);selectedWorkerId='';saveLocal(`${workerName(w)} : fiche supprimée`);closeModal();renderAll(); }

const recordConfigs={
 salary:{array:'salaries',title:'Salaire',fields:r=>`${field('Mois','rMonth',r.month||today().slice(0,7),'month')}${field('Brut','rGross',r.gross||'','number','step="0.01" min="0"')}${field('Net payé','rNet',r.net||'','number','step="0.01" min="0"')}${field('Charges patronales','rCharges',r.employerCharges||'','number','step="0.01" min="0"')}${field('Chèques-repas / part employeur','rMeal',r.mealVouchers||'','number','step="0.01" min="0"')}${field('Avantages / ATN / autres coûts','rBenefits',r.benefits||'','number','step="0.01" min="0"')}${field('Remboursements / indemnités','rReimb',r.reimbursements||'','number','step="0.01" min="0"')}${field('Date paiement','rPaid',r.paidDate||'','date')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({month:val('rMonth'),gross:num(val('rGross')),net:num(val('rNet')),employerCharges:num(val('rCharges')),mealVouchers:num(val('rMeal')),benefits:num(val('rBenefits')),reimbursements:num(val('rReimb')),paidDate:val('rPaid'),note:val('rNote')})},
 time:{array:'timeEntries',title:'Prestations',fields:r=>`${field('Date','rDate',r.date||today(),'date')}${field('Heures normales','rHours',r.hours||'','number','step="0.01" min="0"')}${field('Heures supplémentaires','rOvertime',r.overtimeHours||'','number','step="0.01" min="0"')}${field('Client / chantier','rClient',r.client||'')}${field('Déplacement / km','rTravel',r.travelKm||'','number','step="0.1" min="0"')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({date:val('rDate'),hours:num(val('rHours')),overtimeHours:num(val('rOvertime')),client:val('rClient'),travelKm:num(val('rTravel')),note:val('rNote')})},
 leave:{array:'leaves',title:'Congé',fields:r=>`${field('Début','rStart',r.startDate||today(),'date')}${field('Fin','rEnd',r.endDate||r.startDate||today(),'date')}${selectField('Type','rType',r.type||'legal',[['legal','Congé légal'],['extra','Extra-légal'],['recovery','Récupération'],['unpaid','Sans solde'],['circumstantial','Petit chômage / circonstanciel']])}${field('Nombre de jours','rDays',r.days||'','number','step="0.5" min="0"')}${selectField('Statut','rStatus',r.status||'approved',[['approved','Approuvé'],['requested','Demandé'],['cancelled','Annulé']])}${textareaField('Note','rNote',r.note||'')}`,read:()=>({startDate:val('rStart'),endDate:val('rEnd'),type:val('rType'),days:num(val('rDays'))||daysInclusive(val('rStart'),val('rEnd')),status:val('rStatus'),note:val('rNote')})},
 absence:{array:'absences',title:'Maladie / absence',fields:r=>`${field('Début','rStart',r.startDate||today(),'date')}${field('Fin','rEnd',r.endDate||'','date')}${selectField('Type','rType',r.type||'illness',[['illness','Maladie'],['work_accident','Accident du travail'],['justified','Absence justifiée'],['unjustified','Absence injustifiée'],['other','Autre']])}${selectField('Certificat médical','rCertificate',r.certificate||'no',[['no','Non'],['yes','Oui'],['not_required','Non requis']])}${field('Date de reprise','rReturn',r.returnDate||'','date')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({startDate:val('rStart'),endDate:val('rEnd'),type:val('rType'),certificate:val('rCertificate'),returnDate:val('rReturn'),note:val('rNote')})},
 bonus:{array:'bonuses',title:'Prime / avantage',fields:r=>`${field('Date','rDate',r.date||today(),'date')}${selectField('Type','rType',r.type||'Prime',[['Prime','Prime'],['Prime fin année','Prime de fin d’année'],['Bonus','Bonus'],['Commission','Commission'],['Déplacement','Indemnité déplacement'],['Vélo','Indemnité vélo'],['Chèques-repas','Chèques-repas'],['Écochèques','Écochèques'],['Téléphone','Téléphone'],['Véhicule','Véhicule / ATN'],['Autre','Autre']])}${field('Description','rDesc',r.description||'')}${field('Montant / coût employeur','rAmount',r.amount||'','number','step="0.01" min="0"')}${field('Charges patronales supplémentaires','rCharges',r.employerCharges||'','number','step="0.01" min="0"')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({date:val('rDate'),type:val('rType'),description:val('rDesc'),amount:num(val('rAmount')),employerCharges:num(val('rCharges')),note:val('rNote')})},
 training:{array:'trainings',title:'Formation / habilitation',fields:r=>`${field('Formation / brevet','rName',r.name||'')}${field('Organisme','rProvider',r.provider||'')}${field('Date obtention','rObtained',r.obtainedDate||today(),'date')}${field('Date expiration','rExpiry',r.expiryDate||'','date')}${field('N° certificat / référence','rRef',r.reference||'')}${textareaField('Note','rNote',r.note||'')}`,read:()=>({name:val('rName'),provider:val('rProvider'),obtainedDate:val('rObtained'),expiryDate:val('rExpiry'),reference:val('rRef'),note:val('rNote')})},
 equipment:{array:'equipment',title:'Matériel attribué',fields:r=>`${field('Matériel / EPI','rName',r.name||'')}${field('N° série / référence','rSerial',r.serial||'')}${field('Date remise','rAssigned',r.assignedDate||today(),'date')}${field('Date restitution','rReturned',r.returnedDate||'','date')}${selectField('État','rCondition',r.condition||'Bon',[['Neuf','Neuf'],['Bon','Bon'],['Usagé','Usagé'],['À remplacer','À remplacer'],['Perdu','Perdu']])}${textareaField('Note','rNote',r.note||'')}`,read:()=>({name:val('rName'),serial:val('rSerial'),assignedDate:val('rAssigned'),returnedDate:val('rReturned'),condition:val('rCondition'),note:val('rNote')})},
 history:{array:'history',title:'Note historique',fields:r=>`${field('Date','rDate',r.date||today(),'date')}${selectField('Type','rType',r.type||'Note',[['Note','Note'],['Changement salaire','Changement salaire'],['Changement fonction','Changement fonction'],['Avertissement','Avertissement'],['Entretien','Entretien'],['Contrat','Contrat / avenant'],['Départ','Départ'],['Autre','Autre']])}${field('Auteur','rAuthor',r.author||'')}${textareaField('Description','rDesc',r.description||'')}`,read:()=>({date:val('rDate'),type:val('rType'),author:val('rAuthor'),description:val('rDesc')})},
 document:{array:'documents',title:'Document',fields:r=>`${field('Date','rDate',r.date||today(),'date')}${selectField('Type','rType',r.type||'Contrat',[['Contrat','Contrat'],['Avenant','Avenant'],['Fiche de paie','Fiche de paie'],['Certificat médical','Certificat médical'],['Attestation','Attestation'],['Document social','Document social'],['Permis / brevet','Permis / brevet'],['Autre','Autre']])}${field('Nom / description','rName',r.name||'')}${field('Date échéance','rExpiry',r.expiryDate||'','date')}<div class="form-row full"><label>Fichier (optionnel — stocké dans Google Drive appDataFolder)</label><input id="rFile" type="file"><div class="metric-sub">${r.driveFileId?'Un fichier Drive est déjà lié. Choisir un nouveau fichier le remplacera.':'Google Drive doit être connecté pour envoyer le fichier.'}</div></div>${textareaField('Note','rNote',r.note||'')}`,read:()=>({date:val('rDate'),type:val('rType'),name:val('rName'),expiryDate:val('rExpiry'),note:val('rNote')})}
};
function openRecordModal(type,id=''){
  const w=getWorker(), cfg=recordConfigs[type]; if(!w||!cfg)return; const arr=w[cfg.array], r=id?(arr.find(x=>x.id===id)||{}):{};
  openModal(`<div class="modal-head"><div><h2>${id?'Modifier':'Ajouter'} — ${cfg.title}</h2><div class="metric-sub">${esc(workerName(w))}</div></div><button class="small ghost" onclick="closeModal()">✕</button></div><div class="form-grid">${cfg.fields(r)}</div><div class="modal-actions"><button onclick="closeModal()">Annuler</button><button class="primary" onclick="saveRecord('${type}','${id}')">Enregistrer</button></div>`);
}
async function saveRecord(type,id=''){
  const w=getWorker(), cfg=recordConfigs[type]; if(!w||!cfg)return; const arr=w[cfg.array]; let r=id?arr.find(x=>x.id===id):null; const values=cfg.read(); if(!r){r={id:uid(type)};arr.push(r);} Object.assign(r,values);
  if(type==='document'){
    const file=document.getElementById('rFile')?.files?.[0];
    if(file){ if(!googleAccessToken){notify('Connectez Google Drive pour stocker le fichier. Les informations du document sont enregistrées sans fichier.');} else { const old=r.driveFileId; const uploaded=await uploadDocumentFile(w,file); if(uploaded){r.driveFileId=uploaded.id;r.driveFileName=uploaded.name;if(old&&old!==uploaded.id)deleteDriveFile(old);} } }
  }
  saveLocal(`${workerName(w)} : ${cfg.title.toLowerCase()} enregistré`); closeModal(); buildYearOptions(); renderAll(); notify('Enregistrement effectué.');
}
async function deleteRecord(type,id){ const w=getWorker(),cfg=recordConfigs[type];if(!w||!cfg)return; const arr=w[cfg.array],r=arr.find(x=>x.id===id);if(!r||!confirm('Supprimer cet enregistrement ?'))return; if(type==='document'&&r.driveFileId&&googleAccessToken&&confirm('Supprimer aussi le fichier associé de Google Drive ?')) await deleteDriveFile(r.driveFileId); w[cfg.array]=arr.filter(x=>x.id!==id);saveLocal(`${workerName(w)} : ${cfg.title.toLowerCase()} supprimé`);renderAll(); }

function renderAll(){ buildYearOptions();renderSummary();renderWorkerList();renderMain(); }

function toggleFileMenu(event){event?.stopPropagation();document.getElementById('fileDropdown').classList.toggle('open');}
function closeFileMenu(){document.getElementById('fileDropdown').classList.remove('open');}
function exportDataLocal(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`bastcompta-personnel-${today()}.json`;a.click();URL.revokeObjectURL(a.href);}
async function importDataLocal(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;try{const parsed=JSON.parse(await file.text());if(!confirm('Importer ce fichier remplacera les données Personnel actuelles. Continuer ?'))return;data=normalizeData(parsed);selectedWorkerId='';saveLocal('Import des données personnel');renderAll();notify('Données Personnel importées.');}catch{notify('Fichier invalide.');}}

function safePostToParent(message){try{window.parent?.postMessage(message,window.location.origin&&window.location.origin!=='null'?window.location.origin:'*');}catch{}}
async function driveList(){
  const q=encodeURIComponent(`name='${DRIVE_SYNC_FILE_NAME}' and trashed=false`); const res=await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=10`,{headers:{Authorization:`Bearer ${googleAccessToken}`}}); if(res.status===401){googleAccessToken=null;setDriveState(false);safePostToParent({type:'BASTCOMPTA_REFRESH_TOKEN'});return [];} if(!res.ok)throw new Error('Drive list '+res.status);return (await res.json()).files||[];
}
async function saveSyncToDrive(showToast=true){ if(!googleAccessToken){if(showToast)notify('Google Drive non connecté via le portail.');return false;} try{const existing=(await driveList())[0];const metadata=existing?{name:DRIVE_SYNC_FILE_NAME}:{name:DRIVE_SYNC_FILE_NAME,parents:['appDataFolder']};const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('file',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const url=existing?`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name`:'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';const res=await fetch(url,{method:existing?'PATCH':'POST',headers:{Authorization:`Bearer ${googleAccessToken}`},body:form});if(res.status===401){googleAccessToken=null;setDriveState(false);safePostToParent({type:'BASTCOMPTA_REFRESH_TOKEN'});return false;}if(!res.ok)throw new Error('Drive save '+res.status);if(showToast)notify('Personnel sauvegardé sur Google Drive.');return true;}catch(e){console.error(e);if(showToast)notify('Sauvegarde Google Drive impossible.');return false;} }
async function loadSyncDataFromDrive(confirmReplace=false,onlyIfNewer=false){if(!googleAccessToken)return false;try{const file=(await driveList())[0];if(!file)return false;if(confirmReplace&&!confirm('Charger les données Personnel depuis Google Drive et remplacer les données locales ?'))return false;const res=await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});if(!res.ok)throw new Error('Drive load '+res.status);const parsed=normalizeData(await res.json());if(onlyIfNewer&&data.workers.length&&String(parsed.updatedAt||'')<=String(data.updatedAt||''))return false;data=parsed;localStorage.setItem(STORAGE_KEY,JSON.stringify(data));selectedWorkerId='';renderAll();return true;}catch(e){console.error(e);return false;}}
async function exportJsonToDrive(){await saveSyncToDrive(true);}
async function loadFromDrive(){if(!googleAccessToken)return notify('Google Drive non connecté via le portail.');const ok=await loadSyncDataFromDrive(true);notify(ok?'Personnel chargé depuis Google Drive.':'Aucune sauvegarde Personnel trouvée sur Drive.');}
async function uploadDocumentFile(worker,file){
  const safeName=file.name.replace(/[^a-zA-Z0-9._ -]/g,'_');const name=`personnel-${worker.id}-${Date.now()}-${safeName}`;const metadata={name,parents:['appDataFolder'],appProperties:{module:'personnel',workerId:worker.id,originalName:file.name}};const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('file',file);const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{Authorization:`Bearer ${googleAccessToken}`},body:form});if(!res.ok){notify('Envoi du document sur Drive impossible.');return null;}return await res.json();
}
async function deleteDriveFile(id){try{await fetch(`https://www.googleapis.com/drive/v3/files/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${googleAccessToken}`}});}catch(e){console.warn(e);}}
async function openDriveDocument(recordId){const w=getWorker(),r=w?.documents.find(x=>x.id===recordId);if(!r?.driveFileId)return;if(!googleAccessToken)return notify('Google Drive non connecté.');try{const res=await fetch(`https://www.googleapis.com/drive/v3/files/${r.driveFileId}?alt=media`,{headers:{Authorization:`Bearer ${googleAccessToken}`}});if(!res.ok)throw new Error();const blob=await res.blob();const url=URL.createObjectURL(blob);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{notify('Impossible d’ouvrir ce document Drive.');}}

window.addEventListener('message',async event=>{
  if(window.location.origin&&window.location.origin!=='null'&&event.origin!==window.location.origin)return;const m=event.data||{};
  if(m.type==='BASTCOMPTA_GOOGLE_TOKEN'){googleAccessToken=m.accessToken||null;setDriveState(!!googleAccessToken);if(googleAccessToken){const loaded=await loadSyncDataFromDrive(false,true);if(loaded)notify('Personnel actualisé depuis Google Drive.');}}
  if(m.type==='BASTCOMPTA_GOOGLE_LOGOUT'){googleAccessToken=null;setDriveState(false);}
  if(m.type==='BASTCOMPTA_SET_ACTIVE_PAGE'){
    const map={summary:'overview',workers:'overview',salary:'salary',time:'time',leave:'leave',absence:'absence',bonus:'bonus',document:'document',training:'training',equipment:'equipment'};if(map[m.pageKey]){selectedTab=map[m.pageKey];renderMain();}
  }
});
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){data=loadData();renderAll();}});
document.addEventListener('click',e=>{if(!e.target.closest('#fileDropdown'))closeFileMenu();if(e.target===document.getElementById('modalBackdrop'))closeModal();});

async function saveFromPortalGlobal(options={}){saveLocal('Sauvegarde globale Personnel');const drive=googleAccessToken?await saveSyncToDrive(false):false;return{ok:true,module:'personnel',local:true,drive:!!drive};}
window.BastComptaModule={name:'Personnel',save:saveFromPortalGlobal,saveData:saveFromPortalGlobal,getChangeSnapshot:()=>data,getStatus:()=>({ready:true,module:'personnel'})};

setDriveState(false);renderAll();safePostToParent({type:'BASTCOMPTA_DRIVE_STATUS_REQUEST'});
