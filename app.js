// ══════════════════════════════════════════════════════════════
//  PharmaControl — Versión SPA (sin servidor)
//  Todos los datos en localStorage + sincronización OneDrive
//  Mismo patrón que FinFlow
// ══════════════════════════════════════════════════════════════

// ── BASE DE DATOS LOCAL ───────────────────────────────────────
const DB_KEY  = 'pharmacontrol_db';
const CFG_KEY = 'pharmacontrol_cfg';

const defaultDB = {
  maquinas: [], backups: [], tareas: [],
  usuarios: [], credenciales: [], auditLog: []
};
const defaultCFG = {
  smtp: { host:'', port:587, secure:false, user:'', pass:'', from:'' },
  notificaciones: { habilitadas:false, destinatarios:[], diasBackup:7, diasCredencial:30, hora:'08:00', soloConAlertas:true },
  planta: { nombre:'Planta Farmacéutica', responsable:'', ciudad:'' }
};

let db  = loadDB();
let cfg = loadCFG();

function loadDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || JSON.parse(JSON.stringify(defaultDB)); }
  catch(e) { return JSON.parse(JSON.stringify(defaultDB)); }
}
function saveDB() { localStorage.setItem(DB_KEY, JSON.stringify(db)); if(typeof odMarkPending==='function') odMarkPending(); }
function loadCFG() {
  try {
    const s = JSON.parse(localStorage.getItem(CFG_KEY));
    return s ? { ...defaultCFG, ...s, smtp:{...defaultCFG.smtp,...s.smtp}, notificaciones:{...defaultCFG.notificaciones,...s.notificaciones}, planta:{...defaultCFG.planta,...s.planta} } : JSON.parse(JSON.stringify(defaultCFG));
  } catch(e) { return JSON.parse(JSON.stringify(defaultCFG)); }
}
function saveCFG() { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }

// ── CAPA API — simula los endpoints del servidor ──────────────
const DB = {
  // MAQUINAS
  getMaquinas:    ()  => db.maquinas,
  addMaquina:     (m) => { const n={id:uid(),creadoEn:new Date().toISOString(),dispositivos:[],...m}; db.maquinas.push(n); saveDB(); return n; },
  updateMaquina:  (id,m)=> { const i=db.maquinas.findIndex(x=>x.id===id); if(i>=0){db.maquinas[i]={...db.maquinas[i],...m};saveDB();return db.maquinas[i];} return null; },
  deleteMaquina:  (id)=> { db.maquinas=db.maquinas.filter(x=>x.id!==id); saveDB(); },
  // DISPOSITIVOS
  addDispositivo: (mId,d) => {
    const i=db.maquinas.findIndex(m=>m.id===mId); if(i<0)return null;
    const n={id:uid(),creadoEn:new Date().toISOString(),backupEstado:'Sin backup',ultimoBackup:null,version:'',...d};
    db.maquinas[i].dispositivos.push(n); saveDB(); return n;
  },
  updateDispositivo: (mId,dId,d) => {
    const i=db.maquinas.findIndex(m=>m.id===mId); if(i<0)return null;
    const j=db.maquinas[i].dispositivos.findIndex(x=>x.id===dId); if(j<0)return null;
    db.maquinas[i].dispositivos[j]={...db.maquinas[i].dispositivos[j],...d}; saveDB(); return db.maquinas[i].dispositivos[j];
  },
  deleteDispositivo: (mId,dId) => {
    const i=db.maquinas.findIndex(m=>m.id===mId); if(i<0)return;
    db.maquinas[i].dispositivos=db.maquinas[i].dispositivos.filter(d=>d.id!==dId); saveDB();
  },
  // BACKUPS
  getBackups:   ()  => db.backups,
  addBackup:    (b) => {
    const n={id:uid(),fecha:new Date().toISOString(),...b};
    db.backups.push(n);
    // Actualizar estado del dispositivo
    const mi=db.maquinas.findIndex(m=>m.id===b.maquinaId);
    if(mi>=0){const di=db.maquinas[mi].dispositivos.findIndex(d=>d.id===b.dispositivoId);
      if(di>=0){db.maquinas[mi].dispositivos[di].backupEstado='Vigente';db.maquinas[mi].dispositivos[di].ultimoBackup=n.fecha;db.maquinas[mi].dispositivos[di].version=b.version||'';
        if(b.frecuenciaDias) db.maquinas[mi].dispositivos[di].frecuenciaDias=parseInt(b.frecuenciaDias);}}
    // Programar próxima tarea
    let tareaGenerada=null;
    const frecDias=parseInt(b.frecuenciaDias)||0;
    if(frecDias>0){
      const proxima=new Date(Date.now()+frecDias*86400000);
      tareaGenerada={id:uid(),creadoEn:new Date().toISOString(),completada:false,titulo:`Backup ${b.dispositivoTipo||'dispositivo'} — ${b.maquinaNombre||''}`,tipo:'Backup',fecha:proxima.toISOString().split('T')[0],maquinaId:b.maquinaId||'',maquinaNombre:b.maquinaNombre||'',dispositivoId:b.dispositivoId||'',dispositivoModelo:b.dispositivoModelo||'',dispositivoTipo:b.dispositivoTipo||'',responsable:b.responsable||'',notas:`Backup programado automáticamente (cada ${frecDias} días)`,esAutomatico:true,frecuenciaDias:frecDias};
      db.tareas.push(tareaGenerada);
    }
    saveDB(); return {backup:n, tareaGenerada};
  },
  deleteBackup: (id)=> { db.backups=db.backups.filter(b=>b.id!==id); saveDB(); },
  // TAREAS
  getTareas:   ()  => db.tareas,
  addTarea:    (t) => { const n={id:uid(),creadoEn:new Date().toISOString(),completada:false,...t}; db.tareas.push(n); saveDB(); return n; },
  updateTarea: (id,t)=> { const i=db.tareas.findIndex(x=>x.id===id); if(i>=0){db.tareas[i]={...db.tareas[i],...t};saveDB();return db.tareas[i];} return null; },
  deleteTarea: (id)=> { db.tareas=db.tareas.filter(t=>t.id!==id); saveDB(); },
  // USUARIOS
  getUsuarios:   ()  => db.usuarios,
  addUsuario:    (u) => { const n={id:uid(),creadoEn:new Date().toISOString(),activo:true,...u}; db.usuarios.push(n); saveDB(); return n; },
  updateUsuario: (id,u)=> { const i=db.usuarios.findIndex(x=>x.id===id); if(i>=0){db.usuarios[i]={...db.usuarios[i],...u};saveDB();return db.usuarios[i];} return null; },
  deleteUsuario: (id)=> { db.usuarios=db.usuarios.filter(u=>u.id!==id); saveDB(); },
  // CREDENCIALES
  getCredenciales: () => db.credenciales.map(c=>({...c,password:'••••••••'})),
  addCredencial:   (c) => { const n={id:uid(),creadoEn:new Date().toISOString(),ultimoCambio:new Date().toISOString(),...c}; db.credenciales.push(n); saveDB(); return {...n,password:'••••••••'}; },
  updateCredencial:(id,c)=> { const i=db.credenciales.findIndex(x=>x.id===id); if(i>=0){db.credenciales[i]={...db.credenciales[i],...c,ultimoCambio:new Date().toISOString()};saveDB();return {...db.credenciales[i],password:'••••••••'};} return null; },
  deleteCredencial:(id)=> { db.credenciales=db.credenciales.filter(c=>c.id!==id); saveDB(); },
  revelarCredencial:(id,solicitante)=> {
    const c=db.credenciales.find(x=>x.id===id); if(!c)return null;
    const entry={id:uid(),fecha:new Date().toISOString(),accion:'REVELAR_CONTRASEÑA',credencialId:c.id,maquinaNombre:c.maquinaNombre||'—',dispositivoModelo:c.dispositivoModelo||'—',usuarioDispositivo:c.usuarioDispositivo||'—',solicitante:solicitante||'(no especificado)'};
    if(!db.auditLog) db.auditLog=[];
    db.auditLog.push(entry); saveDB();
    return {password:c.password||'(sin contraseña)',auditId:entry.id};
  },
  getAuditLog: () => (db.auditLog||[]).slice().reverse(),
  // STATS
  getStats: () => {
    const hoy=new Date();
    const totalDisp=db.maquinas.reduce((a,m)=>a+(m.dispositivos||[]).length,0);
    const conBackup=db.maquinas.reduce((a,m)=>a+(m.dispositivos||[]).filter(d=>d.backupEstado==='Vigente').length,0);
    const credVencidas=db.credenciales.filter(c=>c.vencimiento&&new Date(c.vencimiento)<hoy).length;
    const credPorVencer=db.credenciales.filter(c=>{if(!c.vencimiento)return false;const d=(new Date(c.vencimiento)-hoy)/86400000;return d>0&&d<=30;}).length;
    return {totalMaquinas:db.maquinas.length,totalDispositivos:totalDisp,conBackup,sinBackup:totalDisp-conBackup,credVencidas,credPorVencer,totalUsuarios:db.usuarios.length,totalBackups:db.backups.length};
  }
};

// ── UTILS ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtDT   = iso => iso ? new Date(iso).toLocaleString('es-MX',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const fv = id => { const el=document.getElementById(id); return el?el.value.trim():''; };

function toast(msg,type='success'){
  const t=document.createElement('div'); t.className=`toast ${type}`;
  t.innerHTML=`<i class="ti ti-${type==='success'?'check':'alert-circle'}"></i>${esc(msg)}`;
  $('toast-container').appendChild(t); setTimeout(()=>t.remove(),3500);
}

const backupBadge = e => e==='Vigente'
  ? `<span class="badge b-green"><i class="ti ti-check"></i>Vigente</span>`
  : `<span class="badge b-red"><i class="ti ti-x"></i>Sin backup</span>`;
const estadoBadge = e => { const m={'Operativa':'b-green','En mantenimiento':'b-amber','Fuera de servicio':'b-red'}; return `<span class="badge ${m[e]||'b-gray'}">${esc(e)}</span>`; };
const tipoBadge   = t => { const m={PLC:'b-blue',VFD:'b-cyan',HMI:'b-gray','PC Industrial':'b-green',Otro:'b-amber'}; return `<span class="badge ${m[t]||'b-gray'}">${esc(t)}</span>`; };
const tipoCalClass= t => ({Backup:'backup',Mantenimiento:'mant','Auditoría GMP':'audit'})[t]||'otro';
const credBadge   = v => { if(!v)return `<span class="badge b-gray">Sin venc.</span>`; const d=(new Date(v)-new Date())/86400000; if(d<0)return `<span class="badge b-red"><i class="ti ti-alert-circle"></i>Vencida</span>`; if(d<=30)return `<span class="badge b-amber"><i class="ti ti-clock"></i>${Math.ceil(d)}d</span>`; return `<span class="badge b-green"><i class="ti ti-check"></i>Vigente</span>`; };



// ── SIDEBAR MÓVIL ────────────────────────────────────────────
function toggleSidebar(force) {
  const sidebar  = document.querySelector('.sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const isOpen   = sidebar.classList.contains('open');
  const newState = force !== undefined ? force : !isOpen;
  sidebar.classList.toggle('open', newState);
  if(overlay) overlay.classList.toggle('active', newState);
}

// Crear overlay dinámicamente
const _mobOverlay = document.createElement('div');
_mobOverlay.id = 'sidebar-overlay';
_mobOverlay.className = 'sidebar-overlay';
_mobOverlay.addEventListener('click', () => toggleSidebar(false));
document.body.appendChild(_mobOverlay);

// Cerrar sidebar al navegar en móvil
document.addEventListener('click', e => {
  const navItem = e.target.closest('.nav-item');
  if(navItem && window.innerWidth <= 768) toggleSidebar(false);
});

// Cerrar con tecla Escape
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') toggleSidebar(false);
});

// ── NAVEGACIÓN ────────────────────────────────────────────────
let currentView='dashboard';
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click',()=>{
    const v=item.dataset.view;
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelectorAll('.view').forEach(s=>s.classList.remove('active'));
    item.classList.add('active');
    $('view-'+v).classList.add('active');
    currentView=v;
    loadView(v);
    if(window.innerWidth<=768) toggleSidebar(false);
  });
});

function loadView(v){
  ({
    dashboard:loadDashboard, inventario:loadInventario,
    backups:loadBackups, calendario:renderCalendar,
    usuarios:loadUsuarios, credenciales:loadCredenciales,
    reportes:()=>{}, notificaciones:loadNotificaciones,
    'elec-tableros':()=>{elecRenderTableros();},'elec-componentes':()=>{elecRenderComps();},onedrive:odInitPanel, apariencia:loadApariencia
  })[v]?.();
}

// ── DASHBOARD ────────────────────────────────────────────────
function loadDashboard(){
  const now=new Date();
  $('current-date').innerHTML=`${now.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}<br><span style="font-family:var(--mono);font-size:11px">${now.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</span>`;
  const stats=DB.getStats();
  $('stats-grid').innerHTML=`
    <div class="stat-card c-blue"><div class="stat-label">Máquinas</div><div class="stat-val">${stats.totalMaquinas}</div><div class="stat-sub">registradas</div></div>
    <div class="stat-card c-cyan"><div class="stat-label">Dispositivos</div><div class="stat-val">${stats.totalDispositivos}</div><div class="stat-sub">PLCs · VFDs · HMIs · PCs</div></div>
    <div class="stat-card ${stats.sinBackup>0?'c-amber':'c-green'}"><div class="stat-label">Sin backup</div><div class="stat-val">${stats.sinBackup}</div><div class="stat-sub">${stats.conBackup} al día</div></div>
    <div class="stat-card ${stats.credVencidas>0?'c-red':'c-green'}"><div class="stat-label">Cred. vencidas</div><div class="stat-val">${stats.credVencidas}</div><div class="stat-sub">${stats.credPorVencer} por vencer</div></div>`;
  // Cobertura por línea
  const lineas={};
  DB.getMaquinas().forEach(m=>{const l=m.linea||'Sin línea';if(!lineas[l])lineas[l]={total:0,ok:0};(m.dispositivos||[]).forEach(d=>{lineas[l].total++;if(d.backupEstado==='Vigente')lineas[l].ok++;});});
  $('coverage-chart').innerHTML=Object.entries(lineas).map(([l,v])=>{const p=v.total>0?Math.round(v.ok/v.total*100):0;const c=p===100?'var(--green)':p>=70?'var(--amber)':'var(--red)';return `<div class="cov-row"><div class="cov-label"><span>${esc(l)}</span><span style="color:${c};font-family:var(--mono)">${p}%</span></div><div class="cov-bar"><div class="cov-fill" style="width:${p}%;background:${c}"></div></div></div>`;}).join('')||'<p style="color:var(--text3);font-size:12px;padding:16px">Agrega máquinas para ver la cobertura.</p>';
  // Alertas
  const alerts=[];
  DB.getMaquinas().forEach(m=>(m.dispositivos||[]).forEach(d=>{if(d.backupEstado!=='Vigente')alerts.push({type:'danger',icon:'ti-cloud-off',msg:`<strong>${esc(m.nombre)}</strong> — ${d.tipo} sin backup`});}));
  DB.getCredenciales().forEach(c=>{if(!c.vencimiento)return;const d=(new Date(c.vencimiento)-new Date())/86400000;if(d<0)alerts.push({type:'danger',icon:'ti-lock',msg:`Credencial vencida: <strong>${esc(c.maquinaNombre)}</strong> · ${esc(c.usuarioDispositivo)}`});else if(d<=30)alerts.push({type:'warn',icon:'ti-clock',msg:`Credencial por vencer (${Math.ceil(d)}d): <strong>${esc(c.maquinaNombre)}</strong>`});});
  if(!alerts.length) alerts.push({type:'info',icon:'ti-check',msg:'Sin alertas activas. Todo en orden.'});
  $('alerts-list').innerHTML=alerts.slice(0,6).map(a=>`<div class="alert-item ${a.type}"><i class="ti ${a.icon}"></i><div class="alert-text">${a.msg}</div></div>`).join('');
}

// ── INVENTARIO ────────────────────────────────────────────────
let allMaquinas=[], viewMode='cards';
let selectedMaquinas=new Set();
let sortKey=null, sortAsc=true;

const ALL_COLUMNS=[
  {id:'nombre',label:'Nombre',fixed:true,visible:true},
  {id:'objetoTecnico',label:'N° Obj. técnico',fixed:false,visible:true},
  {id:'centroTrabajo',label:'Centro de trabajo',fixed:false,visible:true},
  {id:'objetoSuperior',label:'Obj. técnico superior',fixed:false,visible:true},
  {id:'fabricante',label:'Fabricante',fixed:false,visible:true},
  {id:'ubicacion',label:'Ubicación',fixed:false,visible:true},
  {id:'serie',label:'N° Serie',fixed:false,visible:true},
  {id:'estado',label:'Estado',fixed:false,visible:true},
  {id:'dispositivos',label:'Dispositivos',fixed:false,visible:true},
  {id:'backups',label:'Backups OK',fixed:false,visible:true},
];
const COL_KEY='pharmacontrol_columns';
function loadColConfig(){try{const s=JSON.parse(localStorage.getItem(COL_KEY));if(!s||!Array.isArray(s))return ALL_COLUMNS.map(c=>({...c}));return ALL_COLUMNS.map(c=>{const x=s.find(y=>y.id===c.id);return x?{...c,visible:c.fixed?true:x.visible}:{...c};}).sort((a,b)=>{const ia=s.findIndex(x=>x.id===a.id),ib=s.findIndex(x=>x.id===b.id);if(ia===-1&&ib===-1)return 0;if(ia===-1)return 1;if(ib===-1)return -1;return ia-ib;});}catch(e){return ALL_COLUMNS.map(c=>({...c}));}}
function saveColConfig(cols){localStorage.setItem(COL_KEY,JSON.stringify(cols.map(c=>({id:c.id,visible:c.visible}))));}
let colConfig=loadColConfig();

function loadInventario(){
  allMaquinas=DB.getMaquinas();
  // En móvil siempre mostrar tarjetas por defecto
  if(window.innerWidth <= 768 && viewMode === 'table') {
    viewMode = 'cards';
    document.querySelectorAll('.vtoggle').forEach(b => b.classList.remove('active'));
    const cardsBtn = document.querySelector('.vtoggle[data-mode="cards"]');
    if(cardsBtn) cardsBtn.classList.add('active');
    const btnCol = $('btn-col-config');
    if(btnCol) btnCol.style.display = 'none';
  }
  updateLineaFilter(); renderMaquinas();
}
function updateLineaFilter(){
  const sel=$('filter-linea'); const cur=sel.value;
  const ls=[...new Set(allMaquinas.map(m=>m.linea).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Todas las líneas</option>'+ls.map(l=>`<option ${cur===l?'selected':''}>${esc(l)}</option>`).join('');
}
function renderMaquinas(){
  const s=($('search-maquinas').value||'').toLowerCase(),l=$('filter-linea').value,e=$('filter-estado').value;
  const filtered=allMaquinas.filter(m=>{const t=(m.nombre+m.linea+m.serie+(m.objetoTecnico||'')+(m.centroTrabajo||'')+(m.objetoSuperior||'')+(m.fabricante||'')+(m.ubicacion||'')+(m.dispositivos||[]).map(d=>d.modelo+d.tipo).join(' ')).toLowerCase();return(!s||t.includes(s))&&(!l||m.linea===l)&&(!e||m.estado===e);});
  $('maquinas-count').textContent=`${filtered.length} máquina${filtered.length!==1?'s':''} encontrada${filtered.length!==1?'s':''}`;
  if(viewMode==='cards'){
    $('maquinas-container').style.display=''; $('maquinas-table-wrap').style.display='none';
    $('maquinas-container').innerHTML=filtered.length?filtered.map(renderMachineCard).join(''):`<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-database-off"></i><p>No hay máquinas. Importa tu Excel o crea una.</p></div>`;
  } else {
    $('maquinas-container').style.display='none'; $('maquinas-table-wrap').style.display='';
    let rows=[...filtered];
    if(sortKey) rows.sort((a,b)=>{const va=String(a[sortKey]||'').toLowerCase(),vb=String(b[sortKey]||'').toLowerCase();return sortAsc?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0);});
    const tableEl=$('maquinas-table-wrap').querySelector('table');
    const oldThead=tableEl.querySelector('thead');
    const newThead=document.createElement('thead');
    newThead.innerHTML=buildTableHead().replace('<thead>','').replace('</thead>','');
    if(oldThead) tableEl.replaceChild(newThead,oldThead); else tableEl.insertBefore(newThead,tableEl.firstChild);
    $('maquinas-tbody').innerHTML=rows.map(m=>buildTableRow(m,selectedMaquinas)).join('');
    const allIds=filtered.map(m=>m.id);
    const allSel=allIds.length>0&&allIds.every(id=>selectedMaquinas.has(id));
    const selAll=$('select-all-check');
    if(selAll){selAll.checked=allSel;selAll.indeterminate=!allSel&&selectedMaquinas.size>0&&allIds.some(id=>selectedMaquinas.has(id));}
  }
}

function buildTableHead(){
  const vis=colConfig.filter(c=>c.visible);
  return `<thead><tr><th style="width:36px"><input type="checkbox" id="select-all-check" onchange="toggleSelectAll(this.checked)" style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent)"></th>${vis.map(c=>`<th style="cursor:pointer;user-select:none;white-space:nowrap" onclick="sortTable('${c.id}')">${c.label} <i class="ti ti-selector" style="font-size:10px;opacity:.4;vertical-align:middle"></i></th>`).join('')}<th></th></tr></thead>`;
}
function buildTableRow(m,sel){
  const plcs=(m.dispositivos||[]).filter(d=>d.tipo==='PLC').length,vfds=(m.dispositivos||[]).filter(d=>d.tipo==='VFD').length,hmis=(m.dispositivos||[]).filter(d=>d.tipo==='HMI').length,pcs=(m.dispositivos||[]).filter(d=>d.tipo==='PC Industrial').length;
  const ok=(m.dispositivos||[]).filter(d=>d.backupEstado==='Vigente').length,total=(m.dispositivos||[]).length;
  const cellMap={
    nombre:`<td><strong>${esc(m.nombre)}</strong></td>`,
    objetoTecnico:`<td><span style="font-family:var(--mono);font-size:12px;color:var(--cyan)">${esc(m.objetoTecnico||'—')}</span></td>`,
    centroTrabajo:`<td><span style="font-family:var(--mono);font-size:12px;color:var(--amber)">${esc(m.centroTrabajo||'—')}</span></td>`,
    objetoSuperior:`<td><span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${esc(m.objetoSuperior||'—')}</span></td>`,
    fabricante:`<td><span style="font-family:var(--mono);font-size:12px">${esc(m.fabricante||'—')}</span></td>`,
    ubicacion:`<td><span style="font-size:12px;color:var(--text2)">${esc(m.ubicacion||'—')}</span></td>`,
    serie:`<td><span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${esc(m.serie||'—')}</span></td>`,
    estado:`<td>${estadoBadge(m.estado||'Operativa')}</td>`,
    dispositivos:`<td>${plcs?`<span class="badge b-blue">${plcs} PLC</span> `:''}${vfds?`<span class="badge b-cyan">${vfds} VFD</span> `:''}${hmis?`<span class="badge b-gray">${hmis} HMI</span> `:''}${pcs?`<span class="badge b-green">${pcs} PC Ind.</span>`:''}</td>`,
    backups:`<td><span style="font-family:var(--mono);font-size:12px;color:${ok===total&&total>0?'var(--green)':'var(--amber)'}">${ok}/${total}</span></td>`,
  };
  const checked=sel&&sel.has(m.id)?'checked':'';
  return `<tr class="${sel&&sel.has(m.id)?'row-selected':''}"><td><input type="checkbox" class="row-check" data-id="${m.id}" ${checked} onchange="toggleRowSelect('${m.id}',this.checked)" style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent)"></td>${colConfig.filter(c=>c.visible).map(c=>cellMap[c.id]||'<td>—</td>').join('')}<td><div class="td-actions"><button class="btn btn-sm" onclick="editMaquina('${m.id}')" title="Editar"><i class="ti ti-edit"></i></button><button class="btn btn-sm" onclick="addDispositivo('${m.id}')" title="Agregar dispositivo" style="color:var(--green);border-color:var(--green);background:var(--green-bg)"><i class="ti ti-cpu"></i></button><button class="btn btn-sm btn-danger" onclick="deleteMaquina('${m.id}','${esc(m.nombre)}')" title="Eliminar"><i class="ti ti-trash"></i></button></div></td></tr>`;
}

function renderMachineCard(m){
  const devs=m.dispositivos||[];
  const di={PLC:'ti-cpu',VFD:'ti-adjustments',HMI:'ti-device-desktop','PC Industrial':'ti-device-laptop'};
  return `<div class="machine-card"><div class="mc-head"><div class="mc-name">${esc(m.nombre)}</div>${estadoBadge(m.estado||'Operativa')}</div>
    <div class="mc-meta">
      ${m.objetoTecnico?`<span class="mc-tag-ot" title="N° Objeto técnico"><i class="ti ti-barcode"></i>${esc(m.objetoTecnico)}</span>`:''}
      ${m.centroTrabajo?`<span class="mc-tag-ct" title="Centro de trabajo"><i class="ti ti-tool"></i>${esc(m.centroTrabajo)}</span>`:''}
      ${m.linea?`<span><i class="ti ti-map-pin"></i>${esc(m.linea)}</span>`:''}
      ${m.ubicacion?`<span><i class="ti ti-building"></i>${esc(m.ubicacion)}</span>`:''}
      ${m.fabricante?`<span><i class="ti ti-building-factory"></i>${esc(m.fabricante)}</span>`:''}
      ${m.serie?`<span><i class="ti ti-tag"></i>${esc(m.serie)}</span>`:''}
    </div>
    <div class="devices-list">${devs.length?devs.map(d=>`<div class="device-row">
        <i class="ti ${di[d.tipo]||'ti-cpu'}"></i>
        <div class="device-info">
          <span class="device-tipo">${esc(d.tipo)}</span>
          <span class="device-modelo">${esc(d.modelo)}${d.marca?' · '+esc(d.marca):''}</span>
          ${d.creadoEn?`<span style="font-size:10px;color:var(--text3);font-family:var(--mono);display:block;margin-top:2px"><i class="ti ti-calendar" style="font-size:10px"></i> Registrado: ${fmtDate(d.creadoEn)}</span>`:''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          ${backupBadge(d.backupEstado)}
          <button class="btn btn-sm btn-danger" onclick="deleteDispositivo('${m.id}','${d.id}','${esc(d.modelo)}')" title="Eliminar dispositivo" style="padding:2px 6px;font-size:10px"><i class="ti ti-trash"></i></button>
        </div>
      </div>`).join(''):'<div style="font-size:12px;color:var(--text3);padding:6px">Sin dispositivos</div>'}</div>
    <div class="mc-actions"><button class="btn btn-sm" onclick="editMaquina('${m.id}')"><i class="ti ti-edit"></i>Editar</button><button class="btn btn-sm" onclick="addDispositivo('${m.id}')"><i class="ti ti-plus"></i>Dispositivo</button><button class="btn btn-sm btn-danger" onclick="deleteMaquina('${m.id}','${esc(m.nombre)}')" style="margin-left:auto"><i class="ti ti-trash"></i></button></div>
  </div>`;
}

function sortTable(key){if(sortKey===key)sortAsc=!sortAsc;else{sortKey=key;sortAsc=true;}renderMaquinas();}
function toggleSelectAll(v){if(v)allMaquinas.forEach(m=>selectedMaquinas.add(m.id));else selectedMaquinas.clear();renderMaquinas();updateBulkBar();}
function toggleRowSelect(id,v){if(v)selectedMaquinas.add(id);else selectedMaquinas.delete(id);updateBulkBar();}
function updateBulkBar(){const bar=$('bulk-bar');if(bar) bar.style.display=selectedMaquinas.size>0?'':'none';}

$('search-maquinas').addEventListener('input',renderMaquinas);
$('filter-linea').addEventListener('change',renderMaquinas);
$('filter-estado').addEventListener('change',renderMaquinas);
document.querySelectorAll('.vtoggle').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.vtoggle').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); viewMode=b.dataset.mode;
  const btnCol=$('btn-col-config'); if(btnCol) btnCol.style.display=viewMode==='table'?'':'none';
  renderMaquinas();
}));

// ── MODAL ─────────────────────────────────────────────────────
let modalSaveFn=null;
function openModal(title,bodyHtml,saveFn,saveLabel='Guardar'){
  $('modal-title').textContent=title; $('modal-body').innerHTML=bodyHtml;
  $('modal-save').textContent=saveLabel; $('modal-save').style.display='';
  $('modal-cancel').textContent='Cancelar';
  modalSaveFn=saveFn; $('modal-overlay').style.display='flex';
}
function closeModal(){$('modal-overlay').style.display='none'; modalSaveFn=null;}
$('modal-close').onclick=$('modal-cancel').onclick=closeModal;
$('modal-overlay').onclick=e=>{if(e.target===$('modal-overlay'))closeModal();};
$('modal-save').onclick=()=>{if(modalSaveFn)modalSaveFn();};

// ── MÁQUINA CRUD ──────────────────────────────────────────────
$('btn-nueva-maquina').onclick=()=>newMaquinaModal();
function maquinaForm(m={}){return `<div class="form-row"><div class="form-group"><label class="form-label">Nombre <span class="req">*</span></label><input class="form-input" id="fm-nombre" value="${esc(m.nombre||'')}" placeholder="Ej: Llenadora LC-03"></div><div class="form-group"><label class="form-label">Línea / Área</label><input class="form-input" id="fm-linea" value="${esc(m.linea||'')}" placeholder="Ej: Línea 1"></div></div><div class="form-row"><div class="form-group"><label class="form-label">N° Serie</label><input class="form-input" id="fm-serie" value="${esc(m.serie||'')}"></div><div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="fm-estado"><option ${(m.estado||'Operativa')==='Operativa'?'selected':''}>Operativa</option><option ${m.estado==='En mantenimiento'?'selected':''}>En mantenimiento</option><option ${m.estado==='Fuera de servicio'?'selected':''}>Fuera de servicio</option></select></div></div><div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;padding:4px 0 8px;border-top:1px solid var(--border);margin-top:4px">SAP / CMMS</div><div class="form-row"><div class="form-group"><label class="form-label">N° Objeto técnico</label><input class="form-input" id="fm-ot" value="${esc(m.objetoTecnico||'')}" placeholder="Ej: 10045231"></div><div class="form-group"><label class="form-label">Objeto técnico superior</label><input class="form-input" id="fm-ots" value="${esc(m.objetoSuperior||'')}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Centro de trabajo</label><input class="form-input" id="fm-ct" value="${esc(m.centroTrabajo||'')}"></div><div class="form-group"><label class="form-label">Fabricante</label><input class="form-input" id="fm-fab" value="${esc(m.fabricante||'')}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Año instalación</label><input class="form-input" id="fm-ano" value="${esc(m.anoInstalacion||'')}"></div><div class="form-group"><label class="form-label">Ubicación</label><input class="form-input" id="fm-ubi" value="${esc(m.ubicacion||'')}"></div></div><div class="form-group"><label class="form-label">Notas</label><textarea class="form-textarea" id="fm-notas">${esc(m.notas||'')}</textarea></div>`;}
function collectMaquina(){return{nombre:fv('fm-nombre'),linea:fv('fm-linea'),serie:fv('fm-serie'),estado:fv('fm-estado')||'Operativa',objetoTecnico:fv('fm-ot'),objetoSuperior:fv('fm-ots'),centroTrabajo:fv('fm-ct'),fabricante:fv('fm-fab'),anoInstalacion:fv('fm-ano'),ubicacion:fv('fm-ubi'),notas:fv('fm-notas')};}
function newMaquinaModal(){openModal('Nueva máquina',maquinaForm(),()=>{const b=collectMaquina();if(!b.nombre){toast('Nombre obligatorio','error');return;}DB.addMaquina(b);closeModal();toast('Máquina creada');loadInventario();});}
function editMaquina(id){const m=DB.getMaquinas().find(x=>x.id===id);if(!m)return;openModal('Editar máquina',maquinaForm(m),()=>{const b=collectMaquina();if(!b.nombre){toast('Nombre obligatorio','error');return;}DB.updateMaquina(id,b);closeModal();toast('Máquina actualizada');loadInventario();});}
function deleteMaquina(id,nombre){if(!confirm(`¿Eliminar "${nombre}" y todos sus dispositivos?`))return;DB.deleteMaquina(id);toast(`"${nombre}" eliminada`,'info');loadInventario();}

// ── DISPOSITIVO CRUD ──────────────────────────────────────────
function dispositivoForm(d={}){return `<div class="form-row"><div class="form-group"><label class="form-label">Tipo <span class="req">*</span></label><select class="form-select" id="dv-tipo"><option ${d.tipo==='PLC'?'selected':''}>PLC</option><option ${d.tipo==='VFD'?'selected':''}>VFD</option><option ${d.tipo==='HMI'?'selected':''}>HMI</option><option ${d.tipo==='PC Industrial'?'selected':''}>PC Industrial</option><option ${d.tipo==='Otro'?'selected':''}>Otro</option></select></div><div class="form-group"><label class="form-label">Modelo <span class="req">*</span></label><input class="form-input" id="dv-modelo" value="${esc(d.modelo||'')}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Marca</label><input class="form-input" id="dv-marca" value="${esc(d.marca||'')}"></div><div class="form-group"><label class="form-label">Función</label><input class="form-input" id="dv-fun" value="${esc(d.funcion||'')}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">N° serie</label><input class="form-input" id="dv-serie" value="${esc(d.serie||'')}"></div><div class="form-group"><label class="form-label">IP / Slot</label><input class="form-input" id="dv-ip" value="${esc(d.ip||'')}"></div></div><div class="form-group"><label class="form-label">Notas</label><textarea class="form-textarea" id="dv-notas">${esc(d.notas||'')}</textarea></div>`;}
function collectDisp(){return{tipo:fv('dv-tipo'),modelo:fv('dv-modelo'),marca:fv('dv-marca'),funcion:fv('dv-fun'),serie:fv('dv-serie'),ip:fv('dv-ip'),notas:fv('dv-notas')};}
function deleteDispositivo(mId, dId, modelo) {
  if(!confirm(`¿Eliminar el dispositivo "${modelo}"? Se perderá su historial de backup.`)) return;
  DB.deleteDispositivo(mId, dId);
  toast(`Dispositivo "${modelo}" eliminado`, 'info');
  loadInventario();
}

function addDispositivo(mId){const m=DB.getMaquinas().find(x=>x.id===mId);if(!m)return;openModal(`Dispositivo — ${m.nombre}`,dispositivoForm(),()=>{const b=collectDisp();if(!b.tipo||!b.modelo){toast('Tipo y modelo obligatorios','error');return;}DB.addDispositivo(mId,b);closeModal();toast('Dispositivo agregado');loadInventario();});}

// ── IMPORTAR EXCEL ────────────────────────────────────────────
function norm(s){return String(s).replace(/[\u00A0\u200B\uFEFF]/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();}
function colMatch(row,...keys){const nk=keys.map(norm);for(const rk of Object.keys(row)){const nr=norm(rk);for(const k of nk){if(nr===k){const v=row[rk];if(v!==undefined&&String(v).trim()!=='')return String(v).trim();}}}for(const rk of Object.keys(row)){const nr=norm(rk);for(const k of nk){if(k.length>=5&&nr.includes(k)){const v=row[rk];if(v!==undefined&&String(v).trim()!=='')return String(v).trim();}}}return '';}

document.getElementById('excel-input').addEventListener('change',async function(){
  if(!this.files[0])return;
  const XLSX=await importXLSX();
  const data=await this.files[0].arrayBuffer();
  const wb=XLSX.read(data,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  let imported=0;
  rows.forEach(row=>{
    const nombre=colMatch(row,'Nombre','nombre','NOMBRE','Maquina','maquina','Machine');
    if(!nombre)return;
    const m={nombre,serie:colMatch(row,'Serie','serie','N/S','NS'),linea:colMatch(row,'Linea','linea','Línea','Area','area'),estado:colMatch(row,'Estado','estado','Status')||'Operativa',objetoTecnico:colMatch(row,'Objeto tecnico','Objeto técnico','OT','SAP OT'),objetoSuperior:colMatch(row,'Objeto superior','OT Superior'),centroTrabajo:colMatch(row,'Centro de trabajo','CT','Centro trabajo'),fabricante:colMatch(row,'Fabricante','fabricante','Brand'),anoInstalacion:colMatch(row,'Año','Ano','año','Year'),ubicacion:colMatch(row,'Ubicacion','Ubicación','ubicacion'),notas:colMatch(row,'Notas','notas','Observaciones')};
    const nm=DB.addMaquina(m);
    const plc=colMatch(row,'PLC','plc','Modelo PLC'); if(plc) DB.addDispositivo(nm.id,{tipo:'PLC',modelo:plc,marca:colMatch(row,'Marca PLC')||'',funcion:'Control principal'});
    const vfd=colMatch(row,'VFD','vfd','Variador','variador'); if(vfd) DB.addDispositivo(nm.id,{tipo:'VFD',modelo:vfd,marca:colMatch(row,'Marca VFD')||''});
    const hmi=colMatch(row,'HMI','hmi','Pantalla','pantalla'); if(hmi) DB.addDispositivo(nm.id,{tipo:'HMI',modelo:hmi,marca:colMatch(row,'Marca HMI')||'',funcion:'Interfaz operador'});
    imported++;
  });
  this.value=''; toast(`${imported} máquina${imported!==1?'s':''} importada${imported!==1?'s':''}`); loadInventario();
});

// Cargar XLSX dinámicamente desde CDN
function importXLSX(){return new Promise((res,rej)=>{if(window.XLSX)return res(window.XLSX);const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=()=>res(window.XLSX);s.onerror=rej;document.head.appendChild(s);});}

// Verificar Excel
document.getElementById('verify-input').addEventListener('change',async function(){
  if(!this.files[0])return;
  const XLSX=await importXLSX();
  const data=await this.files[0].arrayBuffer();
  const wb=XLSX.read(data,{type:'array'});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
  this.value='';
  if(!rows.length){toast('Archivo vacío','error');return;}
  const headers=Object.keys(rows[0]);
  const campos=[{campo:'Nombre de la máquina',requerido:true,claves:['Nombre','nombre','Maquina','Machine']},{campo:'N° Objeto técnico',requerido:false,claves:['Objeto tecnico','Objeto técnico','OT','SAP OT']},{campo:'Centro de trabajo',requerido:false,claves:['Centro de trabajo','CT','Work Center']},{campo:'Fabricante',requerido:false,claves:['Fabricante','Brand','fabricante']},{campo:'Línea',requerido:false,claves:['Linea','linea','Línea','Area']},{campo:'Serie',requerido:false,claves:['Serie','N/S','Serial']},{campo:'PLC',requerido:false,claves:['PLC','plc','Modelo PLC']},{campo:'VFD',requerido:false,claves:['VFD','vfd','Variador']},{campo:'HMI',requerido:false,claves:['HMI','hmi','Pantalla']}];
  const res=campos.map(c=>{const match=headers.find(h=>{const nh=norm(h),nk=c.claves.map(norm);return nk.includes(nh)||nk.some(k=>k.length>=5&&nh.includes(k));});return{...c,columnaExcel:match||null};});
  const enc=res.filter(x=>x.columnaExcel).length,noEnc=res.filter(x=>!x.columnaExcel).length;
  const req=res.filter(x=>x.requerido&&!x.columnaExcel);
  const sc=req.length>0?'#fef2f2':'#f0fdf4',sb=req.length>0?'#fecaca':'#bbf7d0',st=req.length>0?'#991b1b':'#166534';
  const sm=req.length>0?`❌ Falta columna obligatoria: <strong>${req.map(x=>x.campo).join(', ')}</strong>`:`✅ Archivo compatible — ${enc} de ${res.length} campos reconocidos`;
  openModal('Verificación del Excel',`<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap"><div style="flex:1;min-width:100px;background:var(--bg3);border-radius:8px;padding:12px;text-align:center;border-top:3px solid var(--accent)"><div style="font-size:22px;font-weight:700;color:var(--accent)">${rows.length}</div><div style="font-size:11px;color:var(--text3)">filas</div></div><div style="flex:1;min-width:100px;background:var(--bg3);border-radius:8px;padding:12px;text-align:center;border-top:3px solid var(--green)"><div style="font-size:22px;font-weight:700;color:var(--green)">${enc}</div><div style="font-size:11px;color:var(--text3)">reconocidos</div></div><div style="flex:1;min-width:100px;background:var(--bg3);border-radius:8px;padding:12px;text-align:center;border-top:3px solid var(--text3)"><div style="font-size:22px;font-weight:700;color:var(--text3)">${noEnc}</div><div style="font-size:11px;color:var(--text3)">no encontrados</div></div></div><div style="padding:10px 14px;background:${sc};border:1px solid ${sb};border-radius:8px;font-size:13px;color:${st};margin-bottom:14px">${sm}</div><table style="width:100%;border-collapse:collapse"><thead><tr style="background:var(--bg3)"><th style="padding:7px 10px;font-size:11px;font-weight:600;text-align:left;border-bottom:2px solid var(--border)">Campo</th><th style="padding:7px 10px;font-size:11px;font-weight:600;text-align:left;border-bottom:2px solid var(--border)">Columna en tu Excel</th></tr></thead><tbody>${res.map((x,i)=>`<tr style="background:${i%2===0?'var(--bg3)':'var(--bg2)'}"><td style="padding:8px 10px;font-size:12px;border-bottom:1px solid var(--border)">${x.campo}</td><td style="padding:8px 10px;border-bottom:1px solid var(--border)">${x.columnaExcel?`<span style="background:var(--green-bg);color:var(--green);padding:3px 10px;border-radius:20px;font-size:12px">✅ ${x.columnaExcel}</span>`:`<span style="background:var(--bg4);color:var(--text3);padding:3px 10px;border-radius:20px;font-size:12px">— No encontrada</span>`}</td></tr>`).join('')}</tbody></table>`,null,'Cerrar');
  $('modal-save').style.display='none'; $('modal-cancel').textContent='Cerrar';
});

function openColConfig(){
  window._colCfgTemp=colConfig.map(c=>({...c}));
  const ri=()=>window._colCfgTemp.map((c,i)=>`<div class="col-cfg-item${c.fixed?' col-fixed':''}" draggable="${!c.fixed}" ondragstart="event.dataTransfer.setData('text','${i}');event.currentTarget.style.opacity='.4'" ondragend="event.currentTarget.style.opacity='1'" ondragover="event.preventDefault()" ondrop="handleColDrop(event,${i})"><i class="ti ${c.fixed?'ti-lock':'ti-grip-vertical'}" style="font-size:15px;color:var(--text3)"></i><span style="flex:1;font-size:13px;color:${c.visible?'var(--text)':'var(--text3)'}">${c.label}</span>${c.fixed?`<span style="font-size:10px;color:var(--text3)">fija</span>`:`<label class="toggle-switch" style="width:34px;height:18px;flex-shrink:0"><input type="checkbox" ${c.visible?'checked':''} onchange="window._colCfgTemp[${i}].visible=this.checked;document.getElementById('col-cfg-list').innerHTML=renderColItems()"><span class="toggle-slider"></span></label>`}</div>`).join('');
  window.renderColItems=ri;
  window.handleColDrop=(e,to)=>{const from=parseInt(e.dataTransfer.getData('text'));if(from===to||window._colCfgTemp[from].fixed||window._colCfgTemp[to].fixed)return;const mv=window._colCfgTemp.splice(from,1)[0];window._colCfgTemp.splice(to,0,mv);document.getElementById('col-cfg-list').innerHTML=ri();};
  openModal('Configurar columnas',`<p style="font-size:12px;color:var(--text3);margin-bottom:14px">Activa/desactiva con el toggle. Arrastra ⠿ para reordenar.</p><div id="col-cfg-list" style="display:flex;flex-direction:column;gap:6px">${ri()}</div><button class="btn btn-secondary btn-sm" style="margin-top:14px" onclick="window._colCfgTemp=ALL_COLUMNS.map(c=>({...c}));document.getElementById('col-cfg-list').innerHTML=window.renderColItems()"><i class="ti ti-refresh"></i>Restablecer</button>`,
  ()=>{colConfig=[...window._colCfgTemp];saveColConfig(colConfig);renderMaquinas();closeModal();toast('Columnas actualizadas');});
}
if($('btn-col-config')) $('btn-col-config').addEventListener('click',openColConfig);

// ── BACKUPS ───────────────────────────────────────────────────
const FRECUENCIAS=[{label:'Diario',dias:1},{label:'Semanal',dias:7},{label:'Quincenal',dias:15},{label:'Mensual',dias:30},{label:'Bimestral',dias:60},{label:'Trimestral',dias:90},{label:'Semestral',dias:180},{label:'Anual',dias:365},{label:'Personalizado',dias:0}];

function loadBackups(){
  const backups=DB.getBackups();
  const s=($('search-backups').value||'').toLowerCase();
  const filtered=backups.filter(b=>!s||(b.maquinaNombre+b.dispositivoModelo+b.responsable+'').toLowerCase().includes(s));
  const hoy=new Date(),esteMes=backups.filter(b=>new Date(b.fecha).getMonth()===hoy.getMonth()).length;
  const sinBk=DB.getMaquinas().reduce((a,m)=>a+(m.dispositivos||[]).filter(d=>d.backupEstado!=='Vigente').length,0);
  $('backups-stats').innerHTML=`<div class="stat-card c-blue"><div class="stat-label">Total</div><div class="stat-val">${backups.length}</div></div><div class="stat-card c-green"><div class="stat-label">Este mes</div><div class="stat-val">${esteMes}</div></div><div class="stat-card c-amber"><div class="stat-label">Sin backup</div><div class="stat-val">${sinBk}</div></div>`;
  $('backups-empty').style.display=filtered.length?'none':'';
  $('backups-tbody').innerHTML=filtered.slice().reverse().map(b=>{
    const proxFecha = b.frecuenciaDias && b.fecha
      ? new Date(new Date(b.fecha).getTime() + b.frecuenciaDias*86400000)
      : null;
    const proxHoy = proxFecha ? (proxFecha - new Date())/86400000 : null;
    const proxColor = proxHoy === null ? 'var(--text3)' : proxHoy < 0 ? 'var(--red)' : proxHoy <= 7 ? 'var(--amber)' : 'var(--green)';
    const proxLabel = proxFecha ? fmtDate(proxFecha.toISOString()) : '—';
    return `<tr>
      <td><strong>${esc(b.maquinaNombre||'—')}</strong></td>
      <td>${esc(b.dispositivoModelo||'—')}</td>
      <td>${tipoBadge(b.dispositivoTipo||'—')}</td>
      <td><span style="font-size:11px;background:var(--bg4);color:var(--text2);padding:2px 7px;border-radius:4px">${esc(b.tipoBackup||'—')}</span></td>
      <td style="font-family:var(--mono);font-size:11px">${esc(b.version||'—')}</td>
      <td>${esc(b.dispositivoAlmacenamiento||'—')}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--text3)">${esc(b.rutaUbicacion||'—')}</td>
      <td style="font-family:var(--mono);font-size:11px">${fmtDT(b.fecha)}</td>
      <td style="font-family:var(--mono);font-size:11px;color:${proxColor};font-weight:500">${proxLabel}</td>
      <td>${esc(b.responsable||'—')}</td>
      <td style="font-size:11px;color:var(--text3)">${esc(b.notas||'')}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteBackup('${b.id}')"><i class="ti ti-trash"></i></button></td>
    </tr>`;
  }).join('');
}
$('btn-nuevo-backup').onclick=()=>newBackupModal();
$('search-backups').addEventListener('input',loadBackups);

function newBackupModal(){
  const maquinas=DB.getMaquinas();
  const mOpts=maquinas.map(m=>`<option value="${m.id}">${esc(m.nombre)}</option>`).join('');
  const fOpts=FRECUENCIAS.map(f=>`<option value="${f.dias}">${f.label}${f.dias>0?' (cada '+f.dias+' días)':''}</option>`).join('');
  openModal('Registrar backup',`<div class="form-group"><label class="form-label">Máquina <span class="req">*</span></label><select class="form-select" id="bk-maq" onchange="updateBkDisp()">${mOpts}</select></div><div class="form-group"><label class="form-label">Dispositivo <span class="req">*</span></label><select class="form-select" id="bk-disp" onchange="updateFrecuenciaInfo()"></select></div><div class="form-group"><label class="form-label">Tipo de backup <span class="req">*</span></label><select class="form-select" id="bk-tipo"><option value="">— Selecciona el tipo —</option><option>Programa de PLC</option><option>Aplicación de HMI</option><option>Parámetros de variadores o servo</option><option>Configuración</option><option>Recetas</option><option>Lotes</option><option>Base de datos</option><option>Archivos log</option><option>Sistema</option><option>Imagen de sistema</option><option>Disco duro</option><option>Usuarios-credenciales</option><option>Políticas de seguridad</option><option>Diagnóstico</option></select></div><div class="form-row"><div class="form-group"><label class="form-label">Versión</label><input class="form-input" id="bk-ver" placeholder="v2.4.1"></div><div class="form-group"><label class="form-label">Responsable</label><input class="form-input" id="bk-resp"></div></div><div class="form-group"><label class="form-label">Fecha</label><input class="form-input" type="datetime-local" id="bk-fecha" value="${new Date().toISOString().slice(0,16)}"></div><div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;padding:4px 0 8px;border-top:1px solid var(--border);margin-top:4px">Almacenamiento</div><div class="form-row"><div class="form-group"><label class="form-label">Dispositivo de almacenamiento</label><input class="form-input" id="bk-alm" placeholder="NAS-01, USB..."></div><div class="form-group"><label class="form-label">Ruta</label><input class="form-input" id="bk-ruta" placeholder="\\\\NAS01\\Backups\\PLC"></div></div><div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;padding:4px 0 8px;border-top:1px solid var(--border);margin-top:4px">Programación automática</div><div class="bk-freq-box"><div class="form-row"><div class="form-group" style="margin:0"><label class="form-label">Frecuencia</label><select class="form-select" id="bk-frec" onchange="toggleFrecCustom()">${fOpts}</select></div><div class="form-group" id="bk-custom-group" style="margin:0;display:none"><label class="form-label">Cada cuántos días</label><input class="form-input" type="number" id="bk-custom-dias" min="1" max="365" oninput="updateFrecuenciaInfo()"></div></div><div id="bk-freq-info" class="bk-freq-info"></div></div><div class="form-group"><label class="form-label">Notas</label><textarea class="form-textarea" id="bk-notas"></textarea></div>`,
  ()=>{
    const mId=fv('bk-maq'),dId=fv('bk-disp');
    if(!mId||!dId){toast('Selecciona máquina y dispositivo','error');return;}
    const m=maquinas.find(x=>x.id===mId),d=(m.dispositivos||[]).find(x=>x.id===dId);
    const selVal=parseInt(fv('bk-frec')||'7');
    const frecDias=selVal===0?(parseInt(fv('bk-custom-dias')||'0')||0):selVal;
    const r=DB.addBackup({maquinaId:mId,maquinaNombre:m.nombre,dispositivoId:dId,dispositivoModelo:d.modelo,dispositivoTipo:d.tipo,tipoBackup:fv('bk-tipo'),version:fv('bk-ver'),responsable:fv('bk-resp'),fecha:fv('bk-fecha')?new Date(fv('bk-fecha')).toISOString():new Date().toISOString(),dispositivoAlmacenamiento:fv('bk-alm'),rutaUbicacion:fv('bk-ruta'),notas:fv('bk-notas'),frecuenciaDias:frecDias});
    closeModal();
    if(r.tareaGenerada){const p=new Date(r.tareaGenerada.fecha).toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});toast(`Backup registrado ✓  Próximo: ${p}`);}
    else toast('Backup registrado');
    loadBackups();
  });
  window._bkMaq=maquinas; updateBkDisp(); setTimeout(updateFrecuenciaInfo,80);
}
function updateBkDisp(){const m=(window._bkMaq||[]).find(x=>x.id===fv('bk-maq'));const s=$('bk-disp');if(!s)return;s.innerHTML=(m&&m.dispositivos||[]).map(d=>`<option value="${d.id}">[${d.tipo}] ${esc(d.modelo)}${d.frecuenciaDias?' · cada '+d.frecuenciaDias+'d':''}</option>`).join('')||'<option value="">Sin dispositivos</option>';setTimeout(updateFrecuenciaInfo,50);}
function toggleFrecCustom(){const v=parseInt(fv('bk-frec')||'7');const g=$('bk-custom-group');if(g)g.style.display=v===0?'':'none';updateFrecuenciaInfo();}
function updateFrecuenciaInfo(){const info=$('bk-freq-info');if(!info)return;const sv=parseInt(fv('bk-frec')||'7'),cv=parseInt(fv('bk-custom-dias')||'0');const dias=sv===0?cv:sv;if(!dias||dias<=0){info.innerHTML='';return;}const proxima=new Date(Date.now()+dias*86400000);const label=FRECUENCIAS.find(f=>f.dias===dias)?.label||`Cada ${dias} días`;info.innerHTML=`<i class="ti ti-calendar-check" style="color:var(--green)"></i> <strong>${label}</strong> · próximo: <strong>${proxima.toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'})}</strong>`;}
function deleteBackup(id){if(!confirm('¿Eliminar este backup?'))return;DB.deleteBackup(id);toast('Eliminado','info');loadBackups();}

// ── CALENDARIO ────────────────────────────────────────────────
let calYear=new Date().getFullYear(),calMonth=new Date().getMonth();
const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function renderCalendar(){
  const tareas=DB.getTareas();
  $('cal-month-label').textContent=`${MESES[calMonth]} ${calYear}`;
  const fd=new Date(calYear,calMonth,1);let dow=fd.getDay();dow=dow===0?6:dow-1;
  const dim=new Date(calYear,calMonth+1,0).getDate();const hoy=new Date();
  let html='';
  for(let i=0;i<dow;i++) html+=`<div class="cal-cell other-month"><div class="day-num"></div></div>`;
  for(let d=1;d<=dim;d++){
    const isT=hoy.getFullYear()===calYear&&hoy.getMonth()===calMonth&&hoy.getDate()===d;
    const dt=tareas.filter(t=>{const x=new Date(t.fecha);return x.getFullYear()===calYear&&x.getMonth()===calMonth&&x.getDate()===d;});
    html+=`<div class="cal-cell${isT?' today':''}" onclick="newTareaModal('${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}')"><div class="day-num">${d}</div>${dt.slice(0,3).map(t=>`<div class="cal-event ${tipoCalClass(t.tipo)}" title="${esc(t.titulo)}">${esc(t.titulo)}</div>`).join('')}${dt.length>3?`<div style="font-size:10px;color:var(--text3)">+${dt.length-3}</div>`:''}</div>`;
  }
  $('calendar').innerHTML=html;
  const mth=tareas.filter(t=>{const d=new Date(t.fecha);return d.getFullYear()===calYear&&d.getMonth()===calMonth;}).sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
  $('tareas-tbody').innerHTML=mth.map(t=>`<tr><td style="font-family:var(--mono);font-size:11px">${fmtDate(t.fecha)}</td><td>${esc(t.maquinaNombre||'—')}</td><td><strong>${esc(t.titulo)}</strong></td><td><span class="cal-event ${tipoCalClass(t.tipo)}" style="display:inline-block">${esc(t.tipo||'Otro')}</span></td><td>${esc(t.responsable||'—')}</td><td><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" ${t.completada?'checked':''} onchange="toggleTarea('${t.id}',this.checked)"><span class="badge ${t.completada?'b-green':'b-gray'}">${t.completada?'Completada':'Pendiente'}</span></label></td><td><button class="btn btn-sm btn-danger" onclick="deleteTarea('${t.id}')"><i class="ti ti-trash"></i></button></td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:20px">Sin tareas este mes</td></tr>';
}
$('cal-prev').onclick=()=>{calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCalendar();};
$('cal-next').onclick=()=>{calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCalendar();};
$('btn-nueva-tarea').onclick=()=>newTareaModal();

function newTareaModal(fecha=''){
  const maquinas=DB.getMaquinas();
  openModal('Nueva tarea',`<div class="form-group"><label class="form-label">Título <span class="req">*</span></label><input class="form-input" id="ta-titulo" placeholder="Ej: Backup PLC mensual"></div><div class="form-row"><div class="form-group"><label class="form-label">Tipo</label><select class="form-select" id="ta-tipo"><option>Backup</option><option>Mantenimiento</option><option>Auditoría GMP</option><option>Otro</option></select></div><div class="form-group"><label class="form-label">Fecha <span class="req">*</span></label><input class="form-input" type="date" id="ta-fecha" value="${fecha}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Máquina</label><select class="form-select" id="ta-maq"><option value="">— Sin máquina —</option>${maquinas.map(m=>`<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Responsable</label><input class="form-input" id="ta-resp"></div></div><div class="form-group"><label class="form-label">Notas</label><textarea class="form-textarea" id="ta-notas"></textarea></div>`,
  ()=>{if(!fv('ta-titulo')||!fv('ta-fecha')){toast('Título y fecha obligatorios','error');return;}const mId=fv('ta-maq');const mN=mId?maquinas.find(m=>m.id===mId)?.nombre||'':'';DB.addTarea({titulo:fv('ta-titulo'),tipo:fv('ta-tipo'),fecha:fv('ta-fecha'),maquinaId:mId,maquinaNombre:mN,responsable:fv('ta-resp'),notas:fv('ta-notas')});closeModal();toast('Tarea creada');renderCalendar();});
}
function toggleTarea(id,c){DB.updateTarea(id,{completada:c});renderCalendar();}
function deleteTarea(id){if(!confirm('¿Eliminar esta tarea?'))return;DB.deleteTarea(id);toast('Eliminada','info');renderCalendar();}

// ── USUARIOS ──────────────────────────────────────────────────
const ROLES=['Administrador','Ing. de Control','Técnico','Supervisor','QA / Auditor'];
const ROLE_COLORS={Administrador:'b-red','Ing. de Control':'b-blue',Técnico:'b-cyan',Supervisor:'b-amber','QA / Auditor':'b-gray'};
const initials=n=>(n||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
const strColor=s=>{let h=0;for(const c of s||'')h=(h*31+c.charCodeAt(0))&0xffffffff;return['#3b82f6','#10b981','#f59e0b','#ef4444','#06b6d4','#8b5cf6','#ec4899'][Math.abs(h)%7];};

function loadUsuarios(){
  const us=DB.getUsuarios();
  $('usuarios-grid').innerHTML=us.length?us.map(u=>`<div class="user-card"><div class="user-avatar" style="background:${strColor(u.nombre)}">${initials(u.nombre)}</div><div class="user-name">${esc(u.nombre)}</div><div class="user-role"><span class="badge ${ROLE_COLORS[u.rol]||'b-gray'}">${esc(u.rol||'Sin rol')}</span></div><div class="user-meta">${u.email?`<span><i class="ti ti-mail"></i>${esc(u.email)}</span>`:''} ${u.area?`<span><i class="ti ti-map-pin"></i>${esc(u.area)}</span>`:''}</div><div class="user-actions"><button class="btn btn-sm" onclick="editUsuario('${u.id}')"><i class="ti ti-edit"></i>Editar</button><span class="badge ${u.activo?'b-green':'b-gray'}" style="margin-left:auto">${u.activo?'Activo':'Inactivo'}</span><button class="btn btn-sm btn-danger" onclick="deleteUsuario('${u.id}','${esc(u.nombre)}')"><i class="ti ti-trash"></i></button></div></div>`).join(''):`<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-users-off"></i><p>No hay usuarios</p></div>`;
}
$('btn-nuevo-usuario').onclick=()=>usuarioModal();
function usuarioForm(u={}){return `<div class="form-row"><div class="form-group"><label class="form-label">Nombre <span class="req">*</span></label><input class="form-input" id="us-nom" value="${esc(u.nombre||'')}"></div><div class="form-group"><label class="form-label">Rol</label><select class="form-select" id="us-rol">${ROLES.map(r=>`<option ${u.rol===r?'selected':''}>${r}</option>`).join('')}</select></div></div><div class="form-row"><div class="form-group"><label class="form-label">Email</label><input class="form-input" type="email" id="us-email" value="${esc(u.email||'')}"></div><div class="form-group"><label class="form-label">Área</label><input class="form-input" id="us-area" value="${esc(u.area||'')}"></div></div><div class="form-group"><label class="form-label">Estado</label><select class="form-select" id="us-activo"><option value="true" ${u.activo!==false?'selected':''}>Activo</option><option value="false" ${u.activo===false?'selected':''}>Inactivo</option></select></div>`;}
function collectUsuario(){return{nombre:fv('us-nom'),rol:fv('us-rol'),email:fv('us-email'),area:fv('us-area'),activo:$('us-activo').value==='true'};}
function usuarioModal(u={}){openModal(u.id?'Editar usuario':'Nuevo usuario',usuarioForm(u),()=>{const b=collectUsuario();if(!b.nombre){toast('Nombre obligatorio','error');return;}u.id?DB.updateUsuario(u.id,b):DB.addUsuario(b);closeModal();toast('Usuario guardado');loadUsuarios();});}
function editUsuario(id){const u=DB.getUsuarios().find(x=>x.id===id);if(u)usuarioModal(u);}
function deleteUsuario(id,n){if(!confirm(`¿Eliminar "${n}"?`))return;DB.deleteUsuario(id);toast('Eliminado','info');loadUsuarios();}

// ── CREDENCIALES ──────────────────────────────────────────────
function loadCredenciales(){
  const creds=DB.getCredenciales();
  $('credenciales-empty').style.display=creds.length?'none':'';
  $('credenciales-tbody').innerHTML=creds.map(c=>`<tr><td><strong>${esc(c.maquinaNombre||'—')}</strong></td><td>${tipoBadge(c.dispositivoTipo||'—')} <span style="font-size:11px;color:var(--text3)">${esc(c.dispositivoModelo||'')}</span></td><td style="font-family:var(--mono);font-size:12px">${esc(c.usuarioDispositivo||'—')}</td><td><div style="display:flex;align-items:center;gap:6px"><span id="pwd-display-${c.id}" style="font-family:var(--mono);font-size:12px;color:var(--text3);letter-spacing:.1em">••••••••</span><button class="btn btn-sm" id="pwd-btn-${c.id}" onclick="revelarContrasena('${c.id}')" title="Revelar" style="padding:3px 7px;color:var(--amber);border-color:var(--amber);background:var(--amber-bg)"><i class="ti ti-eye"></i></button></div></td><td style="font-family:var(--mono);font-size:11px">${fmtDate(c.ultimoCambio)}</td><td style="font-family:var(--mono);font-size:11px">${c.vencimiento?fmtDate(c.vencimiento):'—'}</td><td>${esc(c.responsable||'—')}</td><td>${credBadge(c.vencimiento)}</td><td><div class="td-actions"><button class="btn btn-sm" onclick="editCredencial('${c.id}')"><i class="ti ti-edit"></i></button><button class="btn btn-sm btn-danger" onclick="deleteCredencial('${c.id}')"><i class="ti ti-trash"></i></button></div></td></tr>`).join('');
  loadAuditLog();
}
$('btn-nueva-credencial').onclick=()=>credModal(DB.getMaquinas());

function credForm(maquinas,c={}){return `<div class="form-group"><label class="form-label">Máquina <span class="req">*</span></label><select class="form-select" id="cr-maq" onchange="updateCrDisp()">${maquinas.map(m=>`<option value="${m.id}"${c.maquinaId===m.id?' selected':''}>${esc(m.nombre)}</option>`).join('')}</select></div><div class="form-group"><label class="form-label">Dispositivo</label><select class="form-select" id="cr-disp"></select></div><div class="form-row"><div class="form-group"><label class="form-label">Usuario <span class="req">*</span></label><input class="form-input" id="cr-usr" value="${esc(c.usuarioDispositivo||'')}"></div><div class="form-group"><label class="form-label">Contraseña</label><input class="form-input" type="password" id="cr-pwd" placeholder="${c.id?'Vacío = sin cambio':'Nueva contraseña'}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">Responsable</label><input class="form-input" id="cr-resp" value="${esc(c.responsable||'')}"></div><div class="form-group"><label class="form-label">Vencimiento</label><input class="form-input" type="date" id="cr-venc" value="${c.vencimiento?c.vencimiento.split('T')[0]:''}"></div></div><div class="form-group"><label class="form-label">Notas</label><textarea class="form-textarea" id="cr-notas">${esc(c.notas||'')}</textarea></div>`;}
function credModal(maquinas,c={}){openModal(c.id?'Editar credencial':'Nueva credencial',credForm(maquinas,c),()=>{const mId=fv('cr-maq'),usr=fv('cr-usr');if(!mId||!usr){toast('Máquina y usuario obligatorios','error');return;}const m=maquinas.find(x=>x.id===mId);const dId=fv('cr-disp');const d=(m.dispositivos||[]).find(x=>x.id===dId);const pwd=$('cr-pwd').value;const body={maquinaId:mId,maquinaNombre:m.nombre,dispositivoId:dId||'',dispositivoModelo:d?.modelo||'',dispositivoTipo:d?.tipo||'',usuarioDispositivo:usr,responsable:fv('cr-resp'),vencimiento:fv('cr-venc'),notas:fv('cr-notas')};if(pwd)body.password=pwd;c.id?DB.updateCredencial(c.id,body):DB.addCredencial(body);closeModal();toast('Credencial guardada');loadCredenciales();});window._crMaq=maquinas;setTimeout(updateCrDisp,50);}
function updateCrDisp(){const m=(window._crMaq||[]).find(x=>x.id===fv('cr-maq'));const s=$('cr-disp');if(!s)return;s.innerHTML='<option value="">— Sin dispositivo —</option>'+(m&&m.dispositivos||[]).map(d=>`<option value="${d.id}">[${d.tipo}] ${esc(d.modelo)}</option>`).join('');}
function editCredencial(id){const c=DB.getCredenciales().find(x=>x.id===id);if(c)credModal(DB.getMaquinas(),c);}
function deleteCredencial(id){if(!confirm('¿Eliminar esta credencial?'))return;DB.deleteCredencial(id);toast('Eliminada','info');loadCredenciales();}

let _revealTimers={};
function revelarContrasena(credId){
  const solicitante=prompt('Ingresa tu nombre — quedará registrado en el log de auditoría:');
  if(solicitante===null)return;
  if(!solicitante.trim()){toast('Debes ingresar tu nombre','error');return;}
  const r=DB.revelarCredencial(credId,solicitante.trim());
  if(!r){toast('Credencial no encontrada','error');return;}
  const display=document.getElementById('pwd-display-'+credId);
  const btn=document.getElementById('pwd-btn-'+credId);
  if(display){display.textContent=r.password;display.style.color='var(--text)';display.style.letterSpacing='normal';display.style.fontWeight='600';}
  if(btn){btn.innerHTML='<i class="ti ti-eye-off"></i>';btn.style.cssText='padding:3px 7px;color:var(--red);border-color:var(--red);background:var(--red-bg)';btn.onclick=()=>ocultarContrasena(credId);}
  toast('Contraseña visible — se ocultará en 15 s','info');
  if(_revealTimers[credId])clearTimeout(_revealTimers[credId]);
  _revealTimers[credId]=setTimeout(()=>ocultarContrasena(credId),15000);
  loadAuditLog();
}
function ocultarContrasena(credId){
  if(_revealTimers[credId]){clearTimeout(_revealTimers[credId]);delete _revealTimers[credId];}
  const d=document.getElementById('pwd-display-'+credId);const b=document.getElementById('pwd-btn-'+credId);
  if(d){d.textContent='••••••••';d.style.color='var(--text3)';d.style.letterSpacing='.1em';d.style.fontWeight='400';}
  if(b){b.innerHTML='<i class="ti ti-eye"></i>';b.style.cssText='padding:3px 7px;color:var(--amber);border-color:var(--amber);background:var(--amber-bg)';b.onclick=()=>revelarContrasena(credId);}
}
function loadAuditLog(){
  const log=DB.getAuditLog();
  const tbody=document.getElementById('audit-tbody');
  const empty=document.getElementById('audit-empty');
  if(!tbody)return;
  if(!log.length){tbody.innerHTML='';if(empty)empty.style.display='';return;}
  if(empty)empty.style.display='none';
  tbody.innerHTML=log.map(e=>`<tr><td style="font-family:var(--mono);font-size:11px;color:var(--amber)">${fmtDT(e.fecha)}</td><td><strong>${esc(e.maquinaNombre||'—')}</strong></td><td style="font-family:var(--mono);font-size:11px">${esc(e.dispositivoModelo||'—')}</td><td style="font-family:var(--mono);font-size:11px;color:var(--cyan)">${esc(e.usuarioDispositivo||'—')}</td><td style="font-size:12px;font-weight:500">${esc(e.solicitante||'—')}</td></tr>`).join('');
}

// ── REPORTES ──────────────────────────────────────────────────
function openReport(tipo){
  const hoy=new Date();
  const maquinas=DB.getMaquinas(),backups=DB.getBackups(),credenciales=DB.getCredenciales();
  const planta=cfg.planta?.nombre||'Planta Farmacéutica';
  const hdr=(titulo,sub)=>`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title></head><body style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;padding:0"><div style="background:#1e3a5f;padding:10px 20px;display:flex;align-items:center;gap:12px;position:sticky;top:0"><span style="color:#fff;font-size:14px;font-weight:500">📄 ${titulo}</span><button onclick="window.print()" style="margin-left:auto;background:#2563eb;border:none;color:#fff;padding:7px 18px;border-radius:6px;cursor:pointer">🖨️ Imprimir / PDF</button><button onclick="window.close()" style="background:transparent;border:1px solid #4b6a9b;color:#93c5fd;padding:7px 14px;border-radius:6px;cursor:pointer">✕</button></div><div style="padding:28px 32px;max-width:960px;margin:0 auto"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e2e8f0"><div><h1 style="font-size:22px;font-weight:700;margin:0 0 2px">${planta}</h1><p style="font-size:13px;color:#64748b;margin:0">${sub}</p></div><div style="text-align:right;font-size:12px;color:#94a3b8">${hoy.toLocaleString('es-MX',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>`;
  const TH=h=>`<th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">${h}</th>`;
  const TD=(v,s='')=>`<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;${s}">${v}</td>`;
  const badge=(t,bg,c)=>`<span style="background:${bg};color:${c};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">${t}</span>`;

  let html='';
  if(tipo==='inventario'){
    const totalD=maquinas.reduce((a,m)=>a+(m.dispositivos||[]).length,0);
    const conBk=maquinas.reduce((a,m)=>a+(m.dispositivos||[]).filter(d=>d.backupEstado==='Vigente').length,0);
    html=hdr('Inventario completo',`${maquinas.length} máquinas · ${totalD} dispositivos`);
    html+=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px">${[['Máquinas',maquinas.length,'#2563eb'],['Dispositivos',totalD,'#0891b2'],['Con backup',conBk,'#16a34a'],['Sin backup',totalD-conBk,'#dc2626']].map(([l,v,c])=>`<div style="border-radius:8px;padding:14px;border-top:3px solid ${c};background:#f8fafc"><div style="font-size:24px;font-weight:700;color:${c}">${v}</div><div style="font-size:11px;color:#64748b">${l}</div></div>`).join('')}</div>`;
    html+=`<table style="width:100%;border-collapse:collapse"><thead><tr>${[TH('Máquina'),TH('N° OT'),TH('Centro trabajo'),TH('Fabricante'),TH('Tipo'),TH('Modelo'),TH('Backup'),TH('Último backup')].join('')}</tr></thead><tbody>`;
    maquinas.forEach((m,mi)=>{const devs=m.dispositivos||[];if(!devs.length){html+=`<tr style="background:${mi%2?'#f8fafc':'#fff'}">${TD(`<strong>${m.nombre}</strong>`)}${TD(m.objetoTecnico||'—')}${TD(m.centroTrabajo||'—')}${TD(m.fabricante||'—')}${TD('—')}${TD('—')}${TD('—')}${TD('—')}</tr>`;return;}devs.forEach((d,di)=>{const ok=d.backupEstado==='Vigente';html+=`<tr style="background:${mi%2?'#f8fafc':'#fff'}">${di===0?`<td rowspan="${devs.length}" style="padding:8px 10px;font-size:12px;border-bottom:1px solid #f1f5f9;vertical-align:top"><strong>${m.nombre}</strong></td>`:''} ${di===0?TD(m.objetoTecnico||'—'):''} ${di===0?TD(m.centroTrabajo||'—'):''} ${di===0?TD(m.fabricante||'—'):''} ${TD(badge(d.tipo,d.tipo==='PLC'?'#dbeafe':d.tipo==='VFD'?'#cffafe':'#f1f5f9',d.tipo==='PLC'?'#1e40af':d.tipo==='VFD'?'#0e7490':'#475569'))} ${TD(`<code style="font-size:11px">${d.modelo||'—'}</code>`)} ${TD(badge(ok?'Vigente':'Sin backup',ok?'#dcfce7':'#fee2e2',ok?'#166534':'#b91c1c'))} ${TD(d.ultimoBackup?fmtDate(d.ultimoBackup):`<span style="color:#ef4444">Nunca</span>`)}</tr>`;});});
    html+='</tbody></table>';
  } else if(tipo==='backups'){
    const sorted=backups.slice().sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    html=hdr('Historial de backups',`${sorted.length} registros`);
    if(!sorted.length){html+=`<div style="text-align:center;padding:40px;color:#94a3b8">Sin backups registrados</div>`;}
    else{html+=`<table style="width:100%;border-collapse:collapse"><thead><tr>${[TH('Fecha'),TH('Máquina'),TH('Dispositivo'),TH('Tipo'),TH('Versión'),TH('Disp. almac.'),TH('Ruta'),TH('Responsable')].join('')}</tr></thead><tbody>${sorted.map((b,i)=>`<tr style="background:${i%2?'#f8fafc':'#fff'}">${TD(fmtDT(b.fecha),'font-family:monospace;font-size:11px')}${TD(`<strong>${b.maquinaNombre||'—'}</strong>`)}${TD(`<code style="font-size:11px">${b.dispositivoModelo||'—'}</code>`)}${TD(badge(b.dispositivoTipo||'—','#f1f5f9','#475569'))}${TD(`<code style="font-size:11px">${b.version||'—'}</code>`)}${TD(b.dispositivoAlmacenamiento||'—')}${TD(b.rutaUbicacion||'—','font-family:monospace;font-size:10px;color:#64748b')}${TD(b.responsable||'—')}</tr>`).join('')}</tbody></table>`;}
  } else if(tipo==='alertas'){
    const sinBk=[];maquinas.forEach(m=>(m.dispositivos||[]).forEach(d=>{if(d.backupEstado!=='Vigente')sinBk.push({maquina:m.nombre,linea:m.linea||'—',tipo:d.tipo,modelo:d.modelo,ultimo:d.ultimoBackup});}));
    const credV=credenciales.filter(c=>c.vencimiento&&new Date(c.vencimiento)<hoy);
    const credP=credenciales.filter(c=>{if(!c.vencimiento)return false;const d=(new Date(c.vencimiento)-hoy)/86400000;return d>0&&d<=30;});
    const total=sinBk.length+credV.length+credP.length;
    html=hdr('Reporte de alertas',`${total} alerta${total!==1?'s':''} activa${total!==1?'s':''}`);
    html+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">${[[sinBk.length,'Sin backup','#dc2626'],[credV.length,'Cred. vencidas','#b91c1c'],[credP.length,'Por vencer','#d97706']].map(([v,l,c])=>`<div style="border-radius:8px;padding:14px;border-top:3px solid ${c};background:#f8fafc;text-align:center"><div style="font-size:28px;font-weight:700;color:${c}">${v}</div><div style="font-size:11px;color:#64748b">${l}</div></div>`).join('')}</div>`;
    if(!total) html+=`<div style="text-align:center;padding:40px;background:#f0fdf4;border-radius:8px;color:#16a34a">✅ Sin alertas activas</div>`;
    if(sinBk.length) html+=`<h3 style="background:#fff7ed;color:#92400e;padding:8px 14px;border-radius:6px;font-size:13px;margin:16px 0 8px">🔴 Sin backup (${sinBk.length})</h3><table style="width:100%;border-collapse:collapse"><thead><tr>${[TH('Máquina'),TH('Línea'),TH('Tipo'),TH('Modelo'),TH('Último backup')].join('')}</tr></thead><tbody>${sinBk.map((b,i)=>`<tr style="background:${i%2?'#fffbeb':'#fff'}">${TD(`<strong>${b.maquina}</strong>`)}${TD(b.linea)}${TD(badge(b.tipo,'#f1f5f9','#475569'))}${TD(`<code>${b.modelo}</code>`)}${TD(b.ultimo?fmtDate(b.ultimo):`<span style="color:#ef4444;font-weight:600">Nunca</span>`)}</tr>`).join('')}</tbody></table>`;
  } else if(tipo==='credenciales'){
    html=hdr('Registro de credenciales',`${credenciales.length} credenciales`);
    if(!credenciales.length){html+=`<div style="text-align:center;padding:40px;color:#94a3b8">Sin credenciales registradas</div>`;}
    else{html+=`<table style="width:100%;border-collapse:collapse"><thead><tr>${[TH('Máquina'),TH('Dispositivo'),TH('Usuario'),TH('Último cambio'),TH('Vence'),TH('Responsable'),TH('Estado')].join('')}</tr></thead><tbody>${credenciales.map((c,i)=>{let est='Vigente',bg='#dcfce7',tc='#166534';if(c.vencimiento){const d=(new Date(c.vencimiento)-hoy)/86400000;if(d<0){est='Vencida';bg='#fee2e2';tc='#b91c1c';}else if(d<=30){est=`${Math.ceil(d)}d`;bg='#fef3c7';tc='#92400e';}}return `<tr style="background:${i%2?'#f8fafc':'#fff'}">${TD(`<strong>${c.maquinaNombre||'—'}</strong>`)}${TD(badge(c.dispositivoTipo||'—','#f1f5f9','#475569'))}${TD(`<code style="font-size:11px">${c.usuarioDispositivo||'—'}</code>`)}${TD(fmtDate(c.ultimoCambio),'font-family:monospace;font-size:11px')}${TD(c.vencimiento?fmtDate(c.vencimiento):'—','font-family:monospace;font-size:11px')}${TD(c.responsable||'—')}${TD(badge(est,bg,tc))}</tr>`;}).join('')}</tbody></table>`;}
  }
  html+=`<div style="margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8">PharmaControl · ${tipo}</div></div></body></html>`;
  const w=window.open('','_blank'); w.document.write(html); w.document.close();
}

// ── NOTIFICACIONES ────────────────────────────────────────────
let _destinatarios=[];
function loadNotificaciones(){
  $('cfg-smtp-host').value=cfg.smtp?.host||'';
  $('cfg-smtp-port').value=cfg.smtp?.port||587;
  $('cfg-smtp-secure').value=String(cfg.smtp?.secure||false);
  $('cfg-smtp-user').value=cfg.smtp?.user||'';
  $('cfg-smtp-pass').value=cfg.smtp?.pass||'';
  $('cfg-notif-habilitadas').checked=!!cfg.notificaciones?.habilitadas;
  $('cfg-notif-soloAlertas').checked=cfg.notificaciones?.soloConAlertas!==false;
  $('cfg-notif-hora').value=cfg.notificaciones?.hora||'08:00';
  $('cfg-notif-diasB').value=cfg.notificaciones?.diasBackup||7;
  $('cfg-notif-diasC').value=cfg.notificaciones?.diasCredencial||30;
  $('cfg-planta-nombre').value=cfg.planta?.nombre||'';
  $('cfg-planta-resp').value=cfg.planta?.responsable||'';
  $('cfg-planta-ciudad').value=cfg.planta?.ciudad||'';
  _destinatarios=[...(cfg.notificaciones?.destinatarios||[])];
  renderDestinatarios();
  $('email-log').style.display='none';
}
function renderDestinatarios(){
  const list=$('destinatarios-list'),empty=$('destinatarios-empty');
  if(!list)return;
  if(!_destinatarios.length){list.innerHTML='';if(empty)empty.style.display='';return;}
  if(empty)empty.style.display='none';
  list.innerHTML=_destinatarios.map((e,i)=>`<div class="destinatario-row"><i class="ti ti-mail" style="color:var(--text3);font-size:14px"></i><span>${esc(e)}</span><button class="btn btn-sm btn-danger" onclick="removeDestinatario(${i})"><i class="ti ti-trash"></i></button></div>`).join('');
}
function removeDestinatario(i){_destinatarios.splice(i,1);renderDestinatarios();}
$('btn-add-destinatario').addEventListener('click',()=>{openModal('Agregar destinatario','<div class="form-group"><label class="form-label">Correo</label><input class="form-input" type="email" id="dest-email" placeholder="ing@empresa.com"></div>',()=>{const e=fv('dest-email');if(!e||!e.includes('@')){toast('Email inválido','error');return;}if(!_destinatarios.includes(e))_destinatarios.push(e);renderDestinatarios();closeModal();toast('Destinatario agregado');});});
$('btn-guardar-config').addEventListener('click',()=>{cfg={smtp:{host:fv('cfg-smtp-host'),port:parseInt(fv('cfg-smtp-port'))||587,secure:$('cfg-smtp-secure').value==='true',user:fv('cfg-smtp-user'),pass:$('cfg-smtp-pass').value},notificaciones:{habilitadas:$('cfg-notif-habilitadas').checked,soloConAlertas:$('cfg-notif-soloAlertas').checked,hora:fv('cfg-notif-hora'),diasBackup:parseInt(fv('cfg-notif-diasB'))||7,diasCredencial:parseInt(fv('cfg-notif-diasC'))||30,destinatarios:_destinatarios},planta:{nombre:fv('cfg-planta-nombre'),responsable:fv('cfg-planta-resp'),ciudad:fv('cfg-planta-ciudad')}};saveCFG();toast('Configuración guardada');});
$('btn-reload-config').addEventListener('click',loadNotificaciones);
$('btn-prueba-email').addEventListener('click',()=>{toast('El envío de correos requiere servidor. Usa un servicio como EmailJS para apps sin servidor.','info');});
$('btn-enviar-ahora').addEventListener('click',()=>{toast('El envío de correos requiere servidor. Considera usar EmailJS o configurar en la PC.','info');});

// ── ONEDRIVE — Optimistic Sync + Silent Refresh ──────────────
const OD_LS_TOKEN   = 'pharma_od_token';
const OD_LS_CLIENT  = 'pharma_od_clientid';
const OD_LS_SYNCED  = 'pharma_od_just_connected';
const OD_LS_LAST    = 'pharma_od_last_sync';
const OD_LS_PENDING = 'pharma_od_pending';
const OD_LS_EXPIRY  = 'pharma_od_expiry';
// Tiempo de sync configurable desde Apariencia
function getOdDebounceMs(){ return parseInt(localStorage.getItem('pharma_sync_delay')||'120000'); }

let odToken      = localStorage.getItem(OD_LS_TOKEN) || null;
let _odDebounce  = null;
let _odSyncing   = false;

// ── Redirect URI ──────────────────────────────────────────────
function odGetRedirectUri(){
  const p = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')+1);
  return window.location.origin + p + 'od-callback.html';
}

// ── Silent token refresh (sin interrumpir al usuario) ─────────
function odSilentRefresh(){
  return new Promise(resolve => {
    const clientId = localStorage.getItem(OD_LS_CLIENT);
    if(!clientId){ resolve(false); return; }
    const redirect = odGetRedirectUri();
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
      + `?client_id=${encodeURIComponent(clientId)}`
      + `&response_type=token&redirect_uri=${encodeURIComponent(redirect)}`
      + `&scope=Files.ReadWrite&response_mode=fragment&prompt=none`;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:absolute;width:0;height:0;border:none;visibility:hidden';
    document.body.appendChild(iframe);
    const timer = setTimeout(() => {
      document.body.removeChild(iframe);
      resolve(false);
    }, 8000);
    iframe.onload = () => {
      try {
        const hash = iframe.contentWindow.location.hash;
        if(hash && hash.includes('access_token')){
          const params = new URLSearchParams(hash.slice(1));
          const token  = params.get('access_token');
          const expiresIn = parseInt(params.get('expires_in')||'3600');
          if(token){
            odToken = token;
            localStorage.setItem(OD_LS_TOKEN, token);
            localStorage.setItem(OD_LS_EXPIRY, Date.now() + expiresIn*1000);
            clearTimeout(timer);
            document.body.removeChild(iframe);
            resolve(true);
            return;
          }
        }
      } catch(e) {}
      clearTimeout(timer);
      try{ document.body.removeChild(iframe); }catch(e){}
      resolve(false);
    };
    iframe.src = url;
  });
}

// ── Verificar y renovar token antes de operar ─────────────────
async function odEnsureToken(){
  if(!odToken) return false;
  const expiry = parseInt(localStorage.getItem(OD_LS_EXPIRY)||'0');
  // Si expira en menos de 5 minutos, intentar renovar
  if(expiry && Date.now() > expiry - 5*60*1000){
    const renewed = await odSilentRefresh();
    if(!renewed){
      // No se pudo renovar silenciosamente — pedir login
      odToken = null;
      localStorage.removeItem(OD_LS_TOKEN);
      odUpdateUI(false);
      toast('Sesión de OneDrive expirada — reconecta para continuar','error');
      return false;
    }
  }
  return true;
}

// ── OPTIMISTIC SYNC — sube automáticamente 2 min después de cambios ──
function odScheduleSync(){
  if(!odToken) return;
  localStorage.setItem(OD_LS_PENDING, '1');
  if(_odDebounce) clearTimeout(_odDebounce);
  _odDebounce = setTimeout(async () => {
    if(localStorage.getItem(OD_LS_PENDING)==='1'){
      await odSyncToCloud(true); // true = silencioso (sin toast)
    }
  }, getOdDebounceMs());
  odSidebarUpdateUI();
}

// ── Subir datos a OneDrive ────────────────────────────────────
async function odSyncToCloud(silent=false){
  if(!odToken){ if(!silent) toast('Conecta OneDrive primero','error'); return; }
  if(_odSyncing) return;
  _odSyncing = true;
  if(!silent) toast('Sincronizando...','info');
  // Renovar token si es necesario
  const ok = await odEnsureToken();
  if(!ok){ _odSyncing=false; return; }
  const elecData = loadElec();
  const payload  = {
    maquinas:db.maquinas, backups:db.backups, tareas:db.tareas,
    usuarios:db.usuarios, credenciales:db.credenciales, auditLog:db.auditLog||[],
    tableros:elecData.tableros||[], componentes:elecData.componentes||[],
    _syncedAt:new Date().toISOString()
  };
  let r;
  try{
    r = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/Apps/PharmaControl/data.json:/content',
      {method:'PUT', headers:{'Authorization':'Bearer '+odToken,'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  } catch(e){ _odSyncing=false; if(!silent) toast('Error de conexión','error'); return; }

  if(r.ok){
    localStorage.setItem(OD_LS_LAST,''+Date.now());
    localStorage.removeItem(OD_LS_PENDING);
    _odPendingSync = false;
    if(!silent) toast('✓ Datos guardados en OneDrive');
    try{ odUpdateUI(true); }catch(e){}
    odSidebarUpdateUI();
  } else if(r.status===401){
    // Token rechazado — intentar renovar
    const renewed = await odSilentRefresh();
    if(renewed){ _odSyncing=false; await odSyncToCloud(silent); return; }
    odToken=null; localStorage.removeItem(OD_LS_TOKEN);
    try{ odUpdateUI(false); }catch(e){}
    toast('Sesión expirada — vuelve a conectar','error');
  } else {
    if(!silent) toast('Error al guardar: '+r.status,'error');
  }
  _odSyncing = false;
}

// ── Cargar datos desde OneDrive ───────────────────────────────
async function odLoadFromCloud(silent=false){
  if(!odToken){ if(!silent) toast('Conecta OneDrive primero','error'); return false; }
  if(!silent && !confirm('¿Cargar desde OneDrive? Los datos locales se reemplazarán.')) return false;
  const ok = await odEnsureToken();
  if(!ok) return false;
  let r;
  try{
    r = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/Apps/PharmaControl/data.json:/content',
      {headers:{'Authorization':'Bearer '+odToken}});
  } catch(e){ if(!silent) toast('Error de conexión','error'); return false; }

  if(r.ok){
    const data = await r.json();
    db = {...defaultDB,...data};
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    if(data.tableros||data.componentes)
      saveElec({tableros:data.tableros||[], componentes:data.componentes||[]});
    localStorage.setItem(OD_LS_LAST,''+Date.now());
    localStorage.removeItem(OD_LS_PENDING);
    try{ odUpdateUI(true); }catch(e){}
    if(!silent) toast('✓ Datos cargados desde OneDrive');
    loadDashboard();
    if(currentView==='elec-tableros') elecRenderTableros();
    if(currentView==='elec-componentes') elecRenderComps();
    return true;
  } else if(r.status===404){
    if(!silent) toast('Sin datos en OneDrive todavía','info');
  } else if(r.status===401){
    const renewed = await odSilentRefresh();
    if(renewed){ return await odLoadFromCloud(silent); }
    odToken=null; localStorage.removeItem(OD_LS_TOKEN);
    try{ odUpdateUI(false); }catch(e){}
    toast('Sesión expirada — vuelve a conectar','error');
  }
  return false;
}

// ── Al abrir la app: verificar si hay versión más nueva ───────
async function odCheckNewVersion(){
  if(!odToken) return;
  try{
    const ok = await odEnsureToken();
    if(!ok) return;
    const r = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/Apps/PharmaControl/data.json',
      {headers:{'Authorization':'Bearer '+odToken}});
    if(!r.ok) return;
    const meta = await r.json();
    const remoteDate = new Date(meta.lastModifiedDateTime).getTime();
    const localLast  = parseInt(localStorage.getItem(OD_LS_LAST)||'0');
    if(remoteDate > localLast + 30000){ // más de 30s de diferencia
      const diff = Math.round((remoteDate - localLast)/60000);
      const load = confirm(
        `Hay datos más recientes en OneDrive (hace ${diff} min).
¿Cargar antes de continuar?`
      );
      if(load) await odLoadFromCloud(true);
    }
  } catch(e){}
}

// ── Subir al cerrar/minimizar ─────────────────────────────────
window.addEventListener('visibilitychange', async () => {
  if(document.visibilityState === 'hidden' && localStorage.getItem(OD_LS_PENDING)==='1'){
    if(_odDebounce){ clearTimeout(_odDebounce); _odDebounce=null; }
    await odSyncToCloud(true);
  }
});
window.addEventListener('beforeunload', () => {
  if(localStorage.getItem(OD_LS_PENDING)==='1'){
    if(_odDebounce){ clearTimeout(_odDebounce); _odDebounce=null; }
    // sendBeacon no funciona con OneDrive, pero marcamos para subir al reabrir
    // odSyncToCloud se llama en visibilitychange antes del unload
  }
});

// ── Al iniciar: subir pendiente anterior si existe ────────────
async function odCheckPendingOnStart(){
  if(!odToken) return;
  if(localStorage.getItem(OD_LS_PENDING)==='1'){
    await new Promise(r=>setTimeout(r,1500)); // esperar que cargue la app
    await odSyncToCloud(true);
  }
}

// ── Connect / Disconnect ──────────────────────────────────────
function odSaveClientId(v){ localStorage.setItem(OD_LS_CLIENT, v.trim()); }
function odConnect(){
  const clientId = $('od-client-id')?.value.trim() || localStorage.getItem(OD_LS_CLIENT);
  if(!clientId){ toast('Configura el Client ID primero','error'); return; }
  localStorage.setItem(OD_LS_CLIENT, clientId);
  const redirect = odGetRedirectUri();
  window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
    + `?client_id=${encodeURIComponent(clientId)}&response_type=token`
    + `&redirect_uri=${encodeURIComponent(redirect)}&scope=Files.ReadWrite`
    + `&response_mode=fragment&prompt=select_account`;
}
function odDisconnect(){
  if(!confirm('¿Desconectar OneDrive?')) return;
  odToken = null;
  localStorage.removeItem(OD_LS_TOKEN);
  localStorage.removeItem(OD_LS_EXPIRY);
  if(_odDebounce){ clearTimeout(_odDebounce); _odDebounce=null; }
  odUpdateUI(false);
  toast('Desconectado','info');
}
function odCheckCallback(){
  const s = localStorage.getItem(OD_LS_TOKEN);
  if(s){
    odToken = s;
    const j = localStorage.getItem(OD_LS_SYNCED);
    if(j){
      localStorage.removeItem(OD_LS_SYNCED);
      toast('OneDrive conectado ✓');
      setTimeout(async ()=>{
        await odCheckNewVersion();
      }, 800);
    }
  }
}
function odUpdateUI(connected){
  const dot=$('od-status-dot'),msg=$('od-status-msg'),sub=$('od-status-sub');
  const btnCon=$('btn-od-connect'),btnDis=$('btn-od-disconnect'),lastEl=$('od-last-sync');
  setTimeout(odSidebarUpdateUI, 50);
  if(!dot) return;
  if(connected){
    dot.style.background='var(--green)'; dot.style.boxShadow='0 0 6px var(--green)';
    msg.textContent='Conectado a OneDrive';
    sub.textContent='Sincronización automática activa';
    if(btnCon) btnCon.style.display='none';
    if(btnDis) btnDis.style.display='';
    const last = parseInt(localStorage.getItem(OD_LS_LAST)||'0');
    if(last && lastEl){
      lastEl.style.display='';
      lastEl.textContent='Última sincronización: '+new Date(last).toLocaleString('es-MX');
    }
  } else {
    dot.style.background='var(--text3)'; dot.style.boxShadow='none';
    msg.textContent='No conectado';
    sub.textContent='Conecta tu cuenta Microsoft para activar la sincronización automática';
    if(btnCon) btnCon.style.display='';
    if(btnDis) btnDis.style.display='none';
    if(lastEl)  lastEl.style.display='none';
  }
}
function odInitPanel(){
  const ci=$('od-client-id'), ru=$('od-redirect-uri');
  if(ci) ci.value = localStorage.getItem(OD_LS_CLIENT)||'';
  if(ru) ru.value = odGetRedirectUri();
  odUpdateUI(!!odToken);
}
function odCopyRedirect(){
  const el=$('od-redirect-uri');
  if(!el) return;
  navigator.clipboard.writeText(el.value.trim()).then(()=>toast('URI copiada'));
}



// ── ONEDRIVE SIDEBAR SYNC BAR ─────────────────────────────────
let _odPendingSync = false; // true cuando hay cambios sin sincronizar

function odSidebarUpdateUI() {
  const icon   = document.getElementById('od-sync-icon');
  const dot    = document.getElementById('od-sync-dot');
  const status = document.getElementById('od-sync-status');
  const badge  = document.getElementById('od-sync-badge');
  const btnLoad = document.getElementById('sidebar-btn-load');
  const btnSave = document.getElementById('sidebar-btn-save');
  if(!icon) return;

  if(!odToken) {
    // Sin conectar
    icon.style.color = 'var(--text3)';
    if(dot) { dot.className='od-sync-dot'; }
    if(status) status.textContent = 'Sin conectar';
    if(badge) badge.style.display='none';
    if(btnLoad) btnLoad.disabled = true;
    if(btnSave) btnSave.disabled = true;
  } else if(_odPendingSync || localStorage.getItem(OD_LS_PENDING)==='1') {
    // Conectado con cambios pendientes
    icon.style.color = 'var(--amber)';
    if(dot) { dot.className='od-sync-dot pending'; }
    if(status) status.textContent = 'Cambios pendientes...';
    if(badge) { badge.style.background='var(--amber)'; badge.style.display='block'; }
    if(btnLoad) btnLoad.disabled = false;
    if(btnSave) btnSave.disabled = false;
  } else {
    // Sincronizado
    icon.style.color = 'var(--green)';
    if(dot) { dot.className='od-sync-dot connected'; }
    const last = parseInt(localStorage.getItem(OD_LS_LAST)||'0');
    if(status) status.textContent = last
      ? 'Sincronizado ' + new Date(last).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})
      : 'Conectado';
    if(badge) badge.style.display='none';
    if(btnLoad) btnLoad.disabled = false;
    if(btnSave) btnSave.disabled = false;
  }
}

// Marcar como pendiente y programar sync automático
function odMarkPending() {
  _odPendingSync = true;
  odScheduleSync();
}

// Botones del sidebar
async function odSidebarSave() {
  const icon = document.getElementById('od-sync-icon');
  if(icon) icon.classList.add('od-spinning');
  const btnSave = document.getElementById('sidebar-btn-save');
  if(btnSave) btnSave.disabled = true;
  await odSyncToCloud();
  _odPendingSync = false;
  if(icon) icon.classList.remove('od-spinning');
  odSidebarUpdateUI();
}

async function odSidebarLoad() {
  const icon = document.getElementById('od-sync-icon');
  if(icon) icon.classList.add('od-spinning');
  const btnLoad = document.getElementById('sidebar-btn-load');
  if(btnLoad) btnLoad.disabled = true;
  await odLoadFromCloud();
  _odPendingSync = false;
  if(icon) icon.classList.remove('od-spinning');
  odSidebarUpdateUI();
}

// ══════════════════════════════════════════════════════════════
// MÓDULO ELÉCTRICO — Tableros y Componentes
// ══════════════════════════════════════════════════════════════

// DB eléctrico en localStorage
const ELEC_KEY = 'pharmacontrol_elec';
function loadElec() {
  try { return JSON.parse(localStorage.getItem(ELEC_KEY)) || {tableros:[], componentes:[]}; }
  catch(e) { return {tableros:[], componentes:[]}; }
}
function saveElec(e) { localStorage.setItem(ELEC_KEY, JSON.stringify(e)); if(typeof odMarkPending==='function') odMarkPending(); }

// ── TABLEROS ──────────────────────────────────────────────────
function diagElec() {
  const elec = localStorage.getItem('pharmacontrol_elec');
  const parsed = elec ? JSON.parse(elec) : null;
  const msg = parsed
    ? `Tableros: ${parsed.tableros?.length||0}\nComponentes: ${parsed.componentes?.length||0}\n\nDatos: ${elec.slice(0,200)}...`
    : 'pharmacontrol_elec = null (sin datos)';
  alert('DIAGNÓSTICO ELÉCTRICO:\n\n' + msg);
}

function elecRenderTableros() {
  const e = loadElec();
  const s = ($('elec-t-search')?.value||'').toLowerCase();
  const f = $('elec-t-filter')?.value||'';
  const filtered = e.tableros.filter(t =>
    (!s || (t.nombre+t.ubicacion+t.descripcion+'').toLowerCase().includes(s)) &&
    (!f || t.tipo === f)
  );
  const list = $('elec-tableros-list');
  if(!list) return;
  if(!filtered.length) {
    list.innerHTML = '<div class="empty-state"><i class="ti ti-bolt-off"></i><p>Sin tableros registrados. Crea el primero.</p></div>';
    return;
  }
  list.innerHTML = filtered.map(t => {
    const comps = e.componentes.filter(c => c.tableroId === t.id);
    const statusColor = t.estado==='Operativo'?'var(--green)':t.estado==='En mantenimiento'?'var(--amber)':'var(--red)';
    return `<div class="panel" style="margin-bottom:12px">
      <div class="panel-header" style="cursor:pointer" onclick="elecToggleTablero('${t.id}')">
        <div style="display:flex;align-items:center;gap:10px;flex:1">
          <i class="ti ti-bolt" style="color:var(--amber);font-size:16px"></i>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text)">${esc(t.nombre)}</div>
            <div style="font-size:11px;color:var(--text3)">${esc(t.tipo==='subtablero'?'Subtablero':'Tablero principal')} ${t.ubicacion?' · '+esc(t.ubicacion):''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;font-weight:600;color:${statusColor}">${esc(t.estado||'Operativo')}</span>
          <span style="font-size:11px;color:var(--text3);font-family:var(--mono)">${comps.length} comp.</span>
          <button class="btn btn-sm" onclick="event.stopPropagation();elecEditTablero('${t.id}')"><i class="ti ti-edit"></i></button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();elecDeleteTablero('${t.id}','${esc(t.nombre)}')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
      <div id="elec-t-body-${t.id}" style="display:none;padding:14px;border-top:1px solid var(--border)">
        ${t.descripcion?`<p style="font-size:12px;color:var(--text3);margin-bottom:12px">${esc(t.descripcion)}</p>`:''}
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
          ${t.voltaje?`<span style="font-size:12px"><i class="ti ti-plug" style="color:var(--amber)"></i> <strong>Voltaje:</strong> ${esc(t.voltaje)}</span>`:''}
          ${t.corriente?`<span style="font-size:12px"><i class="ti ti-wave-sine" style="color:var(--cyan)"></i> <strong>Corriente:</strong> ${esc(t.corriente)}</span>`:''}
          ${t.tableroSuperior?`<span style="font-size:12px"><i class="ti ti-git-merge" style="color:var(--text3)"></i> <strong>Superior:</strong> ${esc(t.tableroSuperior)}</span>`:''}
        </div>
        ${comps.length ? `<table class="data-table" style="font-size:12px">
          <thead><tr><th>Componente</th><th>Tipo</th><th>Marca / Modelo</th><th>Estado</th><th>Cant.</th><th></th></tr></thead>
          <tbody>${comps.map(c=>`<tr>
            <td><strong>${esc(c.nombre)}</strong></td>
            <td><span class="badge b-gray" style="font-size:10px">${esc(c.tipo)}</span></td>
            <td style="font-family:var(--mono);font-size:11px">${esc(c.marca||'—')} / ${esc(c.modelo||'—')}</td>
            <td><span style="color:${c.estado==='vigente'?'var(--green)':c.estado==='obsoleto'?'var(--red)':'var(--text3)'};font-size:11px;font-weight:500">${c.estado==='vigente'?'Vigente':c.estado==='obsoleto'?'Obsoleto':'Sin definir'}</span></td>
            <td style="font-family:var(--mono);text-align:center">${c.cantidad||1}</td>
            <td><button class="btn btn-sm btn-danger" onclick="elecDeleteComp('${c.id}','${esc(c.nombre)}')"><i class="ti ti-trash"></i></button></td>
          </tr>`).join('')}</tbody>
        </table>` : '<p style="font-size:12px;color:var(--text3)">Sin componentes registrados en este tablero.</p>'}
        <button class="btn btn-sm btn-secondary" style="margin-top:10px" 
          data-tid="${t.id}" data-tnombre="${esc(t.nombre)}"
          onclick="elecOpenCompModal(this.dataset.tid, this.dataset.tnombre)">
          <i class="ti ti-plus"></i>Agregar componente
        </button>
      </div>
    </div>`;
  }).join('');
}

function elecToggleTablero(id) {
  const body = document.getElementById('elec-t-body-'+id);
  if(body) body.style.display = body.style.display==='none' ? '' : 'none';
}

function elecOpenTableroModal(id) {
  const e = loadElec();
  const t = id ? e.tableros.find(x=>x.id===id) : {};
  const tOpts = e.tableros.filter(x=>x.id!==id).map(x=>`<option value="${esc(x.nombre)}" ${t.tableroSuperior===x.nombre?'selected':''}>${esc(x.nombre)}</option>`).join('');
  openModal(id ? 'Editar tablero' : 'Nuevo tablero', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nombre <span class="req">*</span></label>
        <input class="form-input" id="et-nombre" value="${esc(t.nombre||'')}" placeholder="Ej: TG-01 Tablero General"></div>
      <div class="form-group"><label class="form-label">Tipo</label>
        <select class="form-select" id="et-tipo">
          <option value="tablero" ${(t.tipo||'tablero')==='tablero'?'selected':''}>Tablero principal</option>
          <option value="subtablero" ${t.tipo==='subtablero'?'selected':''}>Subtablero</option>
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Ubicación</label>
        <input class="form-input" id="et-ubi" value="${esc(t.ubicacion||'')}" placeholder="Ej: Cuarto eléctrico Línea 1"></div>
      <div class="form-group"><label class="form-label">Estado</label>
        <select class="form-select" id="et-estado">
          <option ${(t.estado||'Operativo')==='Operativo'?'selected':''}>Operativo</option>
          <option ${t.estado==='En mantenimiento'?'selected':''}>En mantenimiento</option>
          <option ${t.estado==='Fuera de servicio'?'selected':''}>Fuera de servicio</option>
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Voltaje nominal</label>
        <input class="form-input" id="et-volt" value="${esc(t.voltaje||'')}" placeholder="Ej: 480V / 220V"></div>
      <div class="form-group"><label class="form-label">Corriente nominal</label>
        <input class="form-input" id="et-amp" value="${esc(t.corriente||'')}" placeholder="Ej: 200A"></div>
    </div>
    <div class="form-group"><label class="form-label">Tablero superior (si es subtablero)</label>
      <select class="form-select" id="et-superior">
        <option value="">— Ninguno —</option>${tOpts}
      </select></div>
    <div class="form-group"><label class="form-label">Descripción / Notas</label>
      <textarea class="form-textarea" id="et-desc">${esc(t.descripcion||'')}</textarea></div>`,
  () => {
    const nombre = fv('et-nombre');
    if(!nombre) { toast('El nombre es obligatorio','error'); return; }
    const data = { nombre, tipo:fv('et-tipo'), ubicacion:fv('et-ubi'), estado:fv('et-estado'), voltaje:fv('et-volt'), corriente:fv('et-amp'), tableroSuperior:fv('et-superior'), descripcion:fv('et-desc') };
    if(id) {
      const i = e.tableros.findIndex(x=>x.id===id);
      if(i>=0) { e.tableros[i]={...e.tableros[i],...data}; saveElec(e); }
    } else {
      e.tableros.push({id:uid(), creadoEn:new Date().toISOString(), ...data});
      saveElec(e);
    }
    closeModal(); toast(id?'Tablero actualizado':'Tablero creado'); elecRenderTableros();
  });
}

function elecEditTablero(id) { elecOpenTableroModal(id); }
function elecDeleteTablero(id, nombre) {
  if(!confirm(`¿Eliminar el tablero "${nombre}" y todos sus componentes?`)) return;
  const e = loadElec();
  e.tableros = e.tableros.filter(t=>t.id!==id);
  e.componentes = e.componentes.filter(c=>c.tableroId!==id);
  saveElec(e); toast(`Tablero "${nombre}" eliminado`,'info'); elecRenderTableros();
}

// ── COMPONENTES ───────────────────────────────────────────────
function elecOpenCompModal(tableroId, tableroNombre) {
  openModal(`Componente — ${tableroNombre}`, `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nombre <span class="req">*</span></label>
        <input class="form-input" id="ec-nombre" placeholder="Ej: Interruptor principal"></div>
      <div class="form-group"><label class="form-label">Tipo</label>
        <select class="form-select" id="ec-tipo">
          <option value="PLC">PLC / Controlador</option>
          <option value="VFD">VFD / Variador</option>
          <option value="IO">Tarjeta E/S</option>
          <option value="CR">Cabezal remoto</option>
          <option value="TR">Transductor</option>
          <option value="OT">Otro</option>
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Marca</label>
        <input class="form-input" id="ec-marca" placeholder="Ej: Siemens"></div>
      <div class="form-group"><label class="form-label">Modelo</label>
        <input class="form-input" id="ec-modelo" placeholder="Ej: 3RV2011"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cantidad</label>
        <input class="form-input" type="number" id="ec-cant" value="1" min="1"></div>
      <div class="form-group"><label class="form-label">Estado</label>
        <select class="form-select" id="ec-estado">
          <option value="vigente">Vigente</option>
          <option value="obsoleto">Obsoleto</option>
          <option value="nd">Sin definir</option>
        </select></div>
    </div>
    <div class="form-group"><label class="form-label">Notas</label>
      <textarea class="form-textarea" id="ec-notas"></textarea></div>`,
  () => {
    const nombre = fv('ec-nombre');
    if(!nombre) { toast('El nombre es obligatorio','error'); return; }
    const e = loadElec();
    e.componentes.push({ id:uid(), creadoEn:new Date().toISOString(), tableroId, tableroNombre, nombre, tipo:fv('ec-tipo'), marca:fv('ec-marca'), modelo:fv('ec-modelo'), cantidad:parseInt($('ec-cant')?.value||'1'), estado:fv('ec-estado'), notas:fv('ec-notas') });
    saveElec(e); closeModal(); toast('Componente agregado'); elecRenderTableros(); elecRenderComps();
  });
}

function elecDeleteComp(id, nombre) {
  if(!confirm(`¿Eliminar "${nombre}"?`)) return;
  const e = loadElec();
  e.componentes = e.componentes.filter(c=>c.id!==id);
  saveElec(e); toast(`"${nombre}" eliminado`,'info'); elecRenderTableros(); elecRenderComps();
}

function elecRenderComps() {
  const e = loadElec();
  const s = ($('elec-c-search')?.value||'').toLowerCase();
  const tipo = $('elec-c-tipo')?.value||'';
  const estado = $('elec-c-estado')?.value||'';
  const filtered = e.componentes.filter(c =>
    (!s || (c.nombre+c.marca+c.modelo+c.tableroNombre+'').toLowerCase().includes(s)) &&
    (!tipo || c.tipo===tipo) &&
    (!estado || c.estado===estado)
  );
  const tbody = $('elec-comp-tbody');
  const empty = $('elec-comp-empty');
  if(!tbody) return;
  if(!filtered.length) { tbody.innerHTML=''; if(empty) empty.style.display=''; return; }
  if(empty) empty.style.display='none';
  tbody.innerHTML = filtered.map(c => `<tr>
    <td><strong>${esc(c.nombre)}</strong>${c.notas?`<div style="font-size:10px;color:var(--text3)">${esc(c.notas)}</div>`:''}</td>
    <td style="font-size:12px;color:var(--text3)">${esc(c.tableroNombre||'—')}</td>
    <td><span class="badge b-gray" style="font-size:10px">${esc(c.tipo)}</span></td>
    <td style="font-family:var(--mono);font-size:11px">${esc(c.marca||'—')} / ${esc(c.modelo||'—')}</td>
    <td><span style="font-size:11px;font-weight:500;color:${c.estado==='vigente'?'var(--green)':c.estado==='obsoleto'?'var(--red)':'var(--text3)'}">${c.estado==='vigente'?'Vigente':c.estado==='obsoleto'?'Obsoleto':'Sin definir'}</span></td>
    <td style="font-family:var(--mono);text-align:center">${c.cantidad||1}</td>
    <td><button class="btn btn-sm btn-danger" onclick="elecDeleteComp('${c.id}','${esc(c.nombre)}')"><i class="ti ti-trash"></i></button></td>
  </tr>`).join('');
}

function elecExportExcel() {
  toast('Para exportar a Excel usa el módulo de Reportes PDF e imprime la vista','info');
}

// ── APARIENCIA ────────────────────────────────────────────────
const APARIENCIA_KEY='pharmacontrol_apariencia';
const FONTS={ibm:{name:'IBM Plex Sans',url:"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap",varSans:"'IBM Plex Sans',sans-serif",varMono:"'IBM Plex Mono',monospace"},inter:{name:'Inter',url:"https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap",varSans:"'Inter',sans-serif",varMono:"'IBM Plex Mono',monospace"},dm:{name:'DM Sans',url:"https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap",varSans:"'DM Sans',sans-serif",varMono:"'DM Mono',monospace"},roboto:{name:'Roboto',url:"https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap",varSans:"'Roboto',sans-serif",varMono:"'IBM Plex Mono',monospace"},system:{name:'Sistema',url:'',varSans:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",varMono:"'Courier New',monospace"}};
const ICON_LIST=['ti-dna','ti-building-factory-2','ti-flask','ti-pill','ti-shield-check','ti-cpu','ti-settings','ti-star','ti-bolt','ti-leaf'];

function loadAparienciaData(){try{return JSON.parse(localStorage.getItem(APARIENCIA_KEY))||{};}catch(e){return{};}}
function saveAparienciaData(d){localStorage.setItem(APARIENCIA_KEY,JSON.stringify(d));}

function applyApariencia(d){
  if(!d||!Object.keys(d).length)return;
  const r=document.documentElement;
  if(d.fontSize) r.style.fontSize=d.fontSize+'px';
  if(d.fontKey&&FONTS[d.fontKey]){const f=FONTS[d.fontKey];r.style.setProperty('--font',f.varSans);r.style.setProperty('--mono',f.varMono);if(f.url){let lk=document.getElementById('dynamic-font-link');if(!lk){lk=document.createElement('link');lk.id='dynamic-font-link';lk.rel='stylesheet';document.head.appendChild(lk);}lk.href=f.url;}}
  if(d.accentHex){r.style.setProperty('--accent',d.accentHex);r.style.setProperty('--accent2',d.accentHex);r.style.setProperty('--accent-glow',d.accentHex+'28');}
  if(d.logoUrl){document.querySelectorAll('.brand-icon').forEach(el=>{let img=el.querySelector('img.brand-logo');if(!img){img=document.createElement('img');img.className='brand-logo';img.alt='logo';img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:8px;display:block';el.insertBefore(img,el.firstChild);}img.src=d.logoUrl;img.style.display='block';const ic=el.querySelector('i');if(ic)ic.style.display='none';el.style.background='transparent';el.style.padding='0';});}
  else if(d.iconClass){document.querySelectorAll('.brand-icon i').forEach(el=>el.className=`ti ${d.iconClass}`);}
  if(d.accentHex&&!d.logoUrl) document.querySelectorAll('.brand-icon').forEach(el=>el.style.background=d.accentHex);
  if(d.nombre) document.querySelector('.brand-name').textContent=d.nombre||'PharmaControl';
  if(d.subtitulo) document.querySelector('.brand-sub').textContent=d.subtitulo||'Activos Industriales';
}

function loadApariencia(){
  // Cargar configuración de sync
  const syncDelay = localStorage.getItem('pharma_sync_delay') || '120000';
  const selDelay = document.getElementById('cfg-sync-delay');
  if(selDelay) selDelay.value = syncDelay;
  // Actualizar preview de estado
  const preview = document.getElementById('cfg-sync-status-preview');
  if(preview){
    const ms = parseInt(syncDelay);
    const label = ms===30000?'30 segundos':ms===60000?'1 minuto':ms===120000?'2 minutos':ms===300000?'5 minutos':'10 minutos';
    const pending = localStorage.getItem('pharma_od_pending')==='1';
    const last = parseInt(localStorage.getItem('pharma_od_last_sync')||'0');
    const connected = !!localStorage.getItem('pharma_od_token');
    preview.innerHTML = connected
      ? `<div style="display:flex;flex-direction:column;gap:6px">
          <span><i class="ti ti-clock" style="color:var(--accent)"></i> Sincroniza cada <strong>${label}</strong> tras un cambio</span>
          <span style="color:${pending?'var(--amber)':'var(--green)'}"><i class="ti ti-${pending?'clock':'check'}"></i> ${pending?'Cambios pendientes de sincronizar':'Todo sincronizado'}</span>
          ${last?`<span style="font-size:11px;color:var(--text3)">Última sync: ${new Date(last).toLocaleString('es-MX')}</span>`:''}
        </div>`
      : `<span style="color:var(--text3)"><i class="ti ti-cloud-off"></i> OneDrive no conectado</span>`;
  }
  const d=loadAparienciaData();
  const fontSize=d.fontSize||14;
  const fontKey=d.fontKey||'ibm';
  const accentHex=d.accentHex||'#3b82f6';
  const currentIcon=d.iconClass||'ti-dna';

  // Font size
  const rangeEl=document.getElementById('font-size-range');
  const sizeLabel=document.getElementById('font-size-label');
  if(rangeEl){rangeEl.value=fontSize;if(sizeLabel)sizeLabel.textContent=fontSize+'px';}

  // Font picker
  const fontGrid=document.getElementById('font-grid');
  if(fontGrid){fontGrid.innerHTML=Object.entries(FONTS).map(([k,f])=>`<div class="font-opt${fontKey===k?' active':''}" data-font="${k}" onclick="selectFont('${k}',this)" style="font-family:${f.varSans}">${f.name}</div>`).join('');}

  // Color picker
  const colorGrid=document.getElementById('color-grid');
  const COLORS=[{hex:'#3b82f6',name:'Azul'},{hex:'#10b981',name:'Verde'},{hex:'#f59e0b',name:'Ámbar'},{hex:'#ef4444',name:'Rojo'},{hex:'#8b5cf6',name:'Púrpura'},{hex:'#06b6d4',name:'Cyan'},{hex:'#ec4899',name:'Rosa'},{hex:'#f97316',name:'Naranja'},{hex:'#64748b',name:'Gris'}];
  if(colorGrid){colorGrid.innerHTML=COLORS.map(c=>`<div class="color-opt${accentHex===c.hex?' active':''}" data-hex="${c.hex}" onclick="selectColor('${c.hex}',this)" style="background:${c.hex}" title="${c.name}"></div>`).join('')+`<input type="color" id="custom-color" value="${accentHex}" oninput="selectColor(this.value)" title="Color personalizado" style="width:36px;height:36px;border:none;border-radius:8px;cursor:pointer;padding:2px;">`;}

  // Nombre y subtítulo
  const nomEl=document.getElementById('app-nombre');const subEl=document.getElementById('app-subtitulo');
  if(nomEl)nomEl.value=d.nombre||'PharmaControl';if(subEl)subEl.value=d.subtitulo||'Activos Industriales';

  // Logo
  const previewImg=document.getElementById('icon-preview-img');
  const previewI=document.getElementById('icon-preview-i');
  const clearRow=document.getElementById('logo-clear-row');
  const namePreview=document.getElementById('icon-name-preview');
  if(d.logoUrl){if(previewImg){previewImg.src=d.logoUrl;previewImg.style.display='block';}if(previewI)previewI.style.display='none';if(clearRow)clearRow.style.display='flex';if(namePreview)namePreview.textContent='Imagen personalizada';}
  else{if(previewImg)previewImg.style.display='none';if(previewI){previewI.style.display='';previewI.className=`ti ${currentIcon}`;}if(clearRow)clearRow.style.display='none';if(namePreview)namePreview.textContent=currentIcon;}

  // Ícono grid
  const iconGrid=document.getElementById('icon-grid');
  if(iconGrid){iconGrid.innerHTML=ICON_LIST.map(ic=>`<div class="icon-opt${currentIcon===ic?' active':''}" data-icon="${ic}" onclick="selectIcon('${ic}',this)" title="${ic}"><i class="ti ${ic}"></i></div>`).join('');}

  // Range listener
  if(rangeEl){rangeEl.oninput=function(){if(sizeLabel)sizeLabel.textContent=this.value+'px';document.documentElement.style.fontSize=this.value+'px';};}

  // Logo upload
  const fileInput=document.getElementById('logo-file-input');
  if(fileInput){fileInput.onchange=function(){if(this.files[0])handleLogoFile(this.files[0]);this.value='';};}
  const zone=document.getElementById('logo-upload-zone');
  if(zone){zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag-over');};zone.ondragleave=()=>zone.classList.remove('drag-over');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag-over');if(e.dataTransfer.files[0])handleLogoFile(e.dataTransfer.files[0]);};}
}

function selectFont(key,btn){document.querySelectorAll('.font-opt').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}
function selectColor(hex,btn){document.querySelectorAll('.color-opt').forEach(x=>x.classList.remove('active'));if(btn)btn.classList.add('active');document.documentElement.style.setProperty('--accent',hex);document.documentElement.style.setProperty('--accent2',hex);}
function selectIcon(ic,btn){document.querySelectorAll('.icon-opt').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const el=document.getElementById('icon-preview-i');if(el)el.className=`ti ${ic}`;const n=document.getElementById('icon-name-preview');if(n)n.textContent=ic;}

function handleLogoFile(file){
  if(!file||!file.type.startsWith('image/')){toast('Solo imágenes PNG, JPG, SVG','error');return;}
  if(file.size>512*1024){toast('La imagen supera 512 KB','error');return;}
  const reader=new FileReader();reader.onload=e=>{const url=e.target.result;const d=loadAparienciaData();d.logoUrl=url;saveAparienciaData(d);applyApariencia(d);const pi=document.getElementById('icon-preview-img');const pI=document.getElementById('icon-preview-i');const cr=document.getElementById('logo-clear-row');const np=document.getElementById('icon-name-preview');if(pi){pi.src=url;pi.style.display='block';}if(pI)pI.style.display='none';if(cr)cr.style.display='flex';if(np)np.textContent='Imagen personalizada';toast('Logo actualizado');};reader.readAsDataURL(file);}

function clearLogoImage(){const d=loadAparienciaData();delete d.logoUrl;saveAparienciaData(d);document.querySelectorAll('.brand-icon').forEach(el=>{const img=el.querySelector('img.brand-logo');if(img)img.style.display='none';const ic=el.querySelector('i');if(ic)ic.style.display='';el.style.background=d.accentHex||'var(--accent)';el.style.padding='';});const pi=document.getElementById('icon-preview-img');const pI=document.getElementById('icon-preview-i');const cr=document.getElementById('logo-clear-row');const np=document.getElementById('icon-name-preview');if(pi)pi.style.display='none';if(pI){pI.style.display='';pI.className=`ti ${d.iconClass||'ti-dna'}`;}if(cr)cr.style.display='none';if(np)np.textContent=d.iconClass||'ti-dna';toast('Imagen eliminada','info');}

$('btn-guardar-apariencia').onclick=()=>{
  // Guardar configuración de sync
  const selDelay = document.getElementById('cfg-sync-delay');
  if(selDelay){
    const newDelay = parseInt(selDelay.value) || 120000;
    localStorage.setItem('pharma_sync_delay', String(newDelay));
    // Aplicar inmediatamente
    if(typeof OD_DEBOUNCE_MS !== 'undefined'){
      window._OD_DEBOUNCE_MS_OVERRIDE = newDelay;
    }
  }
  const iconEl=document.querySelector('.icon-opt.active');
  const colorEl=document.querySelector('.color-opt.active');
  const fontEl=document.querySelector('.font-opt.active');
  const existing=loadAparienciaData();
  const d={iconClass:iconEl?.dataset.icon||'ti-dna',accentHex:colorEl?.dataset.hex||document.getElementById('custom-color')?.value||'#3b82f6',fontKey:fontEl?.dataset.font||'ibm',fontSize:parseInt(document.getElementById('font-size-range')?.value)||14,nombre:document.getElementById('app-nombre')?.value||'PharmaControl',subtitulo:document.getElementById('app-subtitulo')?.value||'Activos Industriales',logoUrl:existing.logoUrl||null};
  saveAparienciaData(d); applyApariencia(d);
  if(typeof allMaquinas!=='undefined'&&allMaquinas.length>0) renderMaquinas();
  toast('Apariencia guardada');
};

// ── INIT ────────────────────────────────────────────────────
odCheckCallback();
applyApariencia(loadAparienciaData());
loadDashboard();
odSidebarUpdateUI();
// Refrescar ícono sidebar cada 10 segundos
setInterval(() => {
  _odPendingSync = localStorage.getItem(OD_LS_PENDING) === '1';
  odSidebarUpdateUI();
}, 10000);
// Verificar pendientes y versión nueva al iniciar
setTimeout(async () => {
  await odCheckPendingOnStart();
  await odCheckNewVersion();
}, 2000);
