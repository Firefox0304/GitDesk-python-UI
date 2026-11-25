const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LBL={M:'修改',A:'新增',D:'刪除','?':'未追蹤',R:'更名'};
const EMPTY='<h2>選擇一個資料夾開始</h2>按左側「新增資料夾」，或點選已加入的專案。';
const TABS=['changes','log','term','gh'];
let api=null,R=null,files=[],sel=new Set(),st={},tab='changes',working=0,lastKey='',lastRepos='',lastLog='',menuP=null,knownRepos=null,firstRender=true,shownF=new Set();

function toast(m,err){const t=$('#toast');t.textContent=m;t.className=err?'err show':'show';clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3600)}
async function _call(n,a,q){try{const r=await api[n](...a);if(!r.ok){if(!q)toast(r.error,1);return undefined}return r.data}catch(e){if(!q)toast(String(e),1);return undefined}}
const call=(n,...a)=>_call(n,a,false), quiet=(n,...a)=>_call(n,a,true);
async function busy(btn,fn){working++;btn.disabled=true;btn.classList.add('loading');try{await fn()}finally{working--;btn.disabled=false;btn.classList.remove('loading')}}
function ask(title,{ph='',msg='',input=true}={}){return new Promise(res=>{
 const d=$('#dlg'),i=$('#di');$('#dt').textContent=title;$('#dm').textContent=msg;i.hidden=!input;i.value='';i.placeholder=ph;d.returnValue='';
 $('#dc').onclick=()=>d.close();d.onclose=()=>res(d.returnValue==='ok'?(input?i.value.trim():true):null);d.showModal();if(input)i.focus()})}

/* ---------- 資料夾清單 ---------- */
async function loadRepos(q){
 const d=await (q?quiet:call)('repos');if(d===undefined)return;
 const key=JSON.stringify([d.repos,R&&R.path]);if(key===lastRepos)return;lastRepos=key;
 const old=knownRepos;knownRepos=new Set(d.repos.map(r=>r.path));  // 只有新出現的項目才播進場動畫
 $('#recents').innerHTML=d.repos.map(r=>`<li data-p="${esc(r.path)}" class="${R&&R.path===r.path?'on':''}${r.exists?'':' miss'}${!old||!old.has(r.path)?' new':''}"><div><b>${esc(r.name)}</b>${r.exists?'':'<em>找不到資料夾</em>'}<span class="mono">${esc(r.path)}</span></div><button class="dots" data-m="${esc(r.path)}" aria-label="更多選項">⋯</button></li>`).join('')||'<li class="none">尚無資料夾</li>';
}
function closeRepo(){R=null;$('#work').hidden=true;$('#empty').hidden=false;$('#empty').innerHTML=EMPTY}
async function openRepo(p){
 const d=await call('open_repo',p);if(d===undefined)return;
 R=d;lastKey='';await loadRepos();
 if(!d.is_repo){
  $('#work').hidden=true;$('#empty').hidden=false;
  $('#empty').innerHTML=`<h2>${esc(d.name)} 還不是 Git repo</h2>要把這個資料夾初始化成 Git repo 嗎？<p><button id="initBtn" class="primary">初始化 repo</button></p>`;
  $('#initBtn').onclick=async()=>{if(await call('init_repo',d.path)!==undefined){toast('已初始化');openRepo(d.path)}};
  return;
 }
 $('#empty').hidden=true;$('#work').hidden=false;
 $('#rname').textContent=d.name;$('#rpath').textContent=d.path;
 sel=null;firstRender=true;shownF=new Set();setTab('changes');await refresh();
}
$('#recents').onclick=e=>{
 const b=e.target.closest('.dots');
 if(b){menuP=b.dataset.m;const m=$('#menu'),r=b.getBoundingClientRect();m.hidden=false;m.style.top=r.bottom+4+'px';m.style.left=Math.max(8,Math.min(r.left,innerWidth-m.offsetWidth-8))+'px';return}
 const li=e.target.closest('li[data-p]');if(li)openRepo(li.dataset.p);
};
$('#menu').onclick=async e=>{
 const a=e.target.dataset.a,p=menuP;if(!a)return;const name=p.split(/[\\/]/).pop();
 if(a==='tree'){const t=await call('tree',p);if(t!==undefined){$('#treeTitle').textContent=name;$('#treeTxt').textContent=t;$('#treeDlg').showModal()}}
 else if(a==='open')await call('open_folder',p);
 else if(a==='remove'){if(await call('remove_repo',p)!==undefined){toast('已從清單移除（磁碟上的檔案沒有動）');if(R&&R.path===p)closeRepo();loadRepos()}}
 else if(a==='delete'){
  const ok=await ask('刪除資料夾',{msg:`這會永久刪除磁碟上的整個資料夾與所有檔案，無法復原。\n正在使用此資料夾的程式（例如終端機）會被一併結束。\n請輸入「${name}」確認。`,ph:name});
  if(ok!==name)return;
  const r=await call('delete_repo',p,name);
  if(r!==undefined){toast(r.ended&&r.ended.length?`已刪除，並結束程序：${r.ended.join('、')}`:'已刪除');if(termPath===p)termPath=null;if(R&&R.path===p)closeRepo();loadRepos()}
 }
};
document.addEventListener('click',e=>{
 if(!e.target.closest('.dots'))$('#menu').hidden=true;
 if(!e.target.closest('.split'))$('#pushMenu').hidden=true;
});

/* 新增資料夾（可手動貼路徑、瀏覽、或直接選桌面） */
$('#addBtn').onclick=()=>{const d=$('#addDlg');$('#addPath').value='';d.returnValue='';
 $('#addCancel').onclick=()=>d.close();
 d.onclose=()=>{const v=$('#addPath').value.trim();if(d.returnValue==='ok'&&v)openRepo(v)};
 d.showModal();$('#addPath').focus()};
$('#browse').onclick=async()=>{const p=await call('pick_folder');if(p)$('#addPath').value=p};

/* ---------- 狀態與刷新 ---------- */
async function refresh(q){
 if(!R||!R.is_repo)return;const f=q?quiet:call;
 const [s,b]=await Promise.all([f('status',R.path),f('branches',R.path)]);
 if(s===undefined||b===undefined)return;
 const key=JSON.stringify([s,b]);if(q&&key===lastKey)return;lastKey=key;
 st=s;files=s.files;
 sel=sel===null?new Set(files.map(x=>x.path)):new Set([...sel].filter(p=>files.some(x=>x.path===p)));
 $('#branch').innerHTML=(b.length?b:[s.branch]).map(n=>`<option ${n===s.branch?'selected':''}>${esc(n)}</option>`).join('');
 $('#push').textContent='推送'+(s.ahead?` ↑${s.ahead}`:'');
 $('#pull').textContent='拉取'+(s.behind?` ↓${s.behind}`:'');
 renderFiles();
}
function renderFiles(){
 // 只有「第一次載入之後才出現」的檔案列才播進場動畫，5 秒自動刷新不會整個重播
 const fresh=new Set();if(!firstRender)files.forEach(f=>{if(!shownF.has(f.path))fresh.add(f.path)});
 shownF=new Set(files.map(f=>f.path));firstRender=false;
 $('#flist').innerHTML=files.map(f=>`<label class="row${fresh.has(f.path)?' in':''}"><input type="checkbox" data-p="${esc(f.path)}" ${sel.has(f.path)?'checked':''}><span class="tag ${f.code==='?'?'u':f.code}">${LBL[f.code]||f.code}</span><span class="mono">${esc(f.path)}</span></label>`).join('')||'<div class="none">沒有需要提交的變更。</div>';
 updCount();
}
function updCount(){
 $('#cnt').textContent=files.length?`共 ${files.length} 個變更，已選 ${sel.size} 個`:'';
 upd();
}
function setChecks(v){document.querySelectorAll('#flist input').forEach(i=>i.checked=v);updCount()}  // 直接改勾選狀態，核取方塊動畫才不會被重繪打斷
function upd(){const b=$('#commit');b.disabled=!(sel.size&&$('#msg').value.trim());b.textContent=sel.size?`提交 ${sel.size} 個檔案`:'提交'}
function setTab(t){
 tab=t;document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 TABS.forEach(x=>$('#p-'+x).hidden=x!==t);$('#cbox').hidden=t!=='changes';
 const pp=$('#p-'+t);pp.classList.remove('settle','fade');void pp.offsetWidth;pp.classList.add(t==='term'?'fade':'settle');  // 終端機只淡入，不位移，避免影響 xterm 尺寸
 moveInd();
 if(t==='log')loadLog();if(t==='gh')loadGh();if(t==='term')return showTerm();
}
async function loadLog(q){
 const d=await (q?quiet:call)('log',R.path);if(d===undefined)return;
 const k=JSON.stringify(d);if(q&&k===lastLog)return;lastLog=k;
 $('#p-log').innerHTML=d.map(c=>`<div class="log"><span class="mono h">${esc(c.hash)}</span><span>${esc(c.subject)}</span><small>${esc(c.author)}，${esc(c.when)}</small></div>`).join('')||'<div class="none">還沒有任何提交。</div>';
}
async function loadGh(){
 const d=await call('gh_repos');if(d===undefined)return;
 $('#ghlist').innerHTML=d.map(r=>`<div class="ghr"><span><b>${esc(r.name)}</b><small>${r.private?'私人':'公開'}，更新於 ${esc(r.updated)}</small></span><button data-u="${esc(r.url)}">複製到本機</button></div>`).join('')||'<div class="none">帳號下沒有 repo。</div>';
}
/* 每 5 秒自動刷新（提交／推送進行中、視窗在背景時略過） */
setInterval(()=>{if(!api)return;loadRepos(true);if(!R||!R.is_repo||working||document.hidden)return;refresh(true);if(tab==='log')loadLog(true)},5000);

/* ---------- 事件 ---------- */
document.querySelector('.tabs').onclick=e=>{const b=e.target.closest('button');if(b)setTab(b.dataset.t)};
$('#flist').onchange=e=>{const p=e.target.dataset.p;e.target.checked?sel.add(p):sel.delete(p);updCount()};
$('#all').onclick=()=>{sel=new Set(files.map(f=>f.path));setChecks(true)};
$('#none').onclick=()=>{sel=new Set();setChecks(false)};
$('#msg').oninput=upd;
$('#commit').onclick=e=>busy(e.target,async()=>{
 const h=await call('commit',R.path,[...sel],$('#msg').value);if(h===undefined)return;
 $('#msg').value='';toast('已提交 '+h);await refresh();
});
$('#push').onclick=async e=>{
 if(await runInTerm(pushCmd(false)))return;
 toast('終端機無法使用，改用背景推送');
 await busy(e.target,async()=>{const m=await call('push',R.path);if(m!==undefined){toast(m);await refresh()}});
};
$('#pull').onclick=e=>busy(e.target,async()=>{const m=await call('pull',R.path);if(m!==undefined){toast(m);await refresh()}});
$('#pushMore').onclick=async()=>{
 const m=$('#pushMenu');m.hidden=!m.hidden;if(m.hidden)return;
 const b=$('#reword');b.disabled=true;b.title='檢查中…';  // 只有「已提交但還沒推送」的提交才能改
 const l=await quiet('unpushed',R.path)||[];
 b.disabled=!l.length;b.title=l.length?'':'沒有尚未推送的提交';
};
let rwList=[],rwIdx=0;
function rwPick(i){
 rwIdx=i;const it=rwList[i];
 document.querySelectorAll('#rwList .rwi').forEach((b,j)=>b.classList.toggle('on',j===i));
 $('#rwMsg').value=it.message;
 const n=$('#rwNote');n.hidden=i===0;
 if(i>0)n.textContent=`這筆之後的 ${i} 筆未推送提交會一併重新產生（內容不變，hash 會改變）。`;
}
$('#rwList').onclick=e=>{const b=e.target.closest('.rwi');if(b)rwPick(+b.dataset.i)};
$('#reword').onclick=async()=>{
 $('#pushMenu').hidden=true;
 const l=await call('unpushed',R.path);if(l===undefined)return;
 if(!l.length){toast('沒有尚未推送的提交',1);return}
 rwList=l;const d=$('#rwDlg');d.returnValue='';
 $('#rwList').innerHTML=l.map((c,i)=>`<button type="button" class="rwi" data-i="${i}"><span class="mono h">${esc(c.short)}</span><span>${esc(c.subject)}</span></button>`).join('');
 rwPick(0);
 $('#rwCancel').onclick=()=>d.close();
 $('#rwOk').onclick=()=>{
  const msg=$('#rwMsg').value.trim();
  if(!msg){toast('請輸入 commit 訊息',1);return}
  d.close(msg===rwList[rwIdx].message.trim()?'':'ok');
 };
 d.onclose=async()=>{
  if(d.returnValue!=='ok')return;
  const it=rwList[rwIdx],msg=$('#rwMsg').value.trim();
  working++;
  try{
   const r=await call('reword',R.path,it.hash,msg);
   if(r!==undefined){toast(r?'已修改 commit 訊息':'訊息沒有變更');lastLog='';await refresh();if(tab==='log')await loadLog()}
  }finally{working--}
 };
 d.showModal();$('#rwMsg').focus();
};
$('#force').onclick=async()=>{
 $('#pushMenu').hidden=true;const b=st.branch;
 if(!await ask('強制推送',{input:false,msg:`將執行：git push -f origin ${b}\n遠端的 ${b} 分支會被你的本機紀錄覆蓋，可能遺失他人的提交。`}))return;
 if(await runInTerm(pushCmd(true)))return;
 await busy($('#push'),async()=>{const m=await call('force_push',R.path);if(m!==undefined){toast(m);await refresh()}});
};
$('#branch').onchange=async e=>{if(await call('switch',R.path,e.target.value,false)!==undefined)sel=null;await refresh()};
$('#newBranch').onclick=async()=>{const n=await ask('新分支名稱',{ph:'例如 feature/login'});if(!n)return;if(await call('switch',R.path,n,true)!==undefined){toast('已切換到 '+n);sel=null;await refresh()}};
$('#saveTok').onclick=async()=>{const t=$('#tok').value;if(!t.trim())return;if(await call('set_token',t)!==undefined){$('#tok').value='';toast('Token 已儲存');loadGh()}};
$('#mkRemote').onclick=async()=>{
 const n=await ask('遠端 repo 名稱',{ph:R.name});if(!n)return;
 if(await call('gh_create',R.path,n,true)!==undefined)toast('已建立並設為 origin，接著按「推送」');
};
$('#ghlist').onclick=async e=>{const b=e.target.closest('button[data-u]');if(!b)return;
 const p=await call('clone',b.dataset.u);if(p){toast('已複製完成');openRepo(p)}};

/* ---------- 終端機（前端 xterm.js，後端 pywinpty） ---------- */
const CDN='https://cdn.jsdelivr.net/npm/';
let xt=null,fit=null,xtLoad=null,termPath=null,termDead=false,termBusy=false;
function loadAsset(kind,local,cdn){return new Promise((res,rej)=>{
 const go=(url,next)=>{const el=document.createElement(kind==='js'?'script':'link');
  if(kind==='js')el.src=url;else{el.rel='stylesheet';el.href=url}
  el.onload=()=>res();el.onerror=()=>{el.remove();next?go(next):rej(new Error(url))};document.head.appendChild(el)};
 go(local,cdn)})}
function ensureXterm(){return xtLoad||(xtLoad=Promise.all([
 loadAsset('css','vendor/xterm.css',CDN+'@xterm/xterm@5.5.0/css/xterm.css'),
 loadAsset('js','vendor/xterm.js',CDN+'@xterm/xterm@5.5.0/lib/xterm.js').then(()=>loadAsset('js','vendor/addon-fit.js',CDN+'@xterm/addon-fit@0.10.0/lib/addon-fit.js'))
]).catch(e=>{xtLoad=null;throw e}))}
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function tmsg(t){const m=$('#tmsg');m.textContent=t;m.hidden=!t}
async function startTerm(){
 if(termBusy)return;termBusy=true;
 try{xt.reset();const r=await api.term_start(R.path,xt.cols,xt.rows);
  if(!r.ok){tmsg(r.error);return}
  tmsg('');termPath=R.path;termDead=false}
 finally{termBusy=false}
}
async function showTerm(){
 try{await ensureXterm()}catch(e){tmsg('無法載入 xterm.js。請連網，或把 xterm.js、xterm.css、addon-fit.js 放進 web/vendor/ 資料夾。');return}
 if(!xt){
  xt=new Terminal({fontFamily:'"Cascadia Code",Consolas,monospace',fontSize:13,cursorBlink:true,scrollback:5000,
   theme:{background:cssv('--bg'),foreground:cssv('--tx'),cursor:cssv('--ember'),selectionBackground:'#6aa8ff55'}});
  fit=new FitAddon.FitAddon();xt.loadAddon(fit);xt.open($('#xterm'));
  xt.onData(d=>{if(termDead){startTerm();return}api.term_input(d)});
  xt.onResize(s=>api.term_resize(s.cols,s.rows));
  xt.attachCustomKeyEventHandler(e=>{
   if(e.type!=='keydown'||!e.ctrlKey)return true;
   const k=e.key.toLowerCase();
   if(k==='c'&&xt.hasSelection()){navigator.clipboard.writeText(xt.getSelection());xt.clearSelection();return false}  // 有選取：複製
   if(k==='v')return false;  // 讓瀏覽器原生貼上
   return true});
  new ResizeObserver(()=>{if(!$('#p-term').hidden)fit.fit()}).observe($('#xterm'));
 }
 fit.fit();
 if(termPath!==R.path)await startTerm();
 xt.focus();
}
window.term={
 write:d=>{if(xt)xt.write(d)},
 exited:()=>{termDead=true;if(xt)xt.write('\r\n\x1b[90m[終端機已結束，按任意鍵重新啟動]\x1b[0m')}
};

/* 推送：在終端機裡執行（指令帶 -C 資料夾路徑，避免使用者 cd 到別處後推錯 repo） */
const ps=s=>"'"+String(s).replace(/'/g,"''")+"'";
function pushCmd(force){
 const b=st.branch;if(!b||/^HEAD|\(/.test(b))return null;
 const base=`git -C ${ps(R.path)} push`;
 return force?`${base} -f origin ${ps(b)}`:(st.upstream?base:`${base} -u origin ${ps(b)}`);
}
async function runInTerm(cmd){
 if(!cmd)return false;
 try{await ensureXterm()}catch(e){return false}
 const prev=tab,fresh=termPath!==R.path||termDead;
 await setTab('term');
 if(!xt||termDead||termPath!==R.path){setTab(prev);return false}  // 終端機沒起來（例如沒裝 pywinpty）
 if(fresh)await new Promise(r=>setTimeout(r,700));  // 剛啟動，等 PowerShell 就緒
 api.term_input(cmd+'\r');xt.focus();return true;
}

/* ---------- 動畫輔助 ---------- */
// 分頁底線指示條：滑到目前選中的分頁
let indOn=false;
function moveInd(snap){
 const b=document.querySelector('.tabs button.on'),i=$('#tabInd');
 if(!b||!i||!b.offsetWidth)return;
 const first=snap||!indOn;
 if(first)i.style.transition='none';
 i.style.width=b.offsetWidth+'px';i.style.transform=`translateX(${b.offsetLeft}px)`;
 if(first){void i.offsetWidth;i.style.transition='';indOn=true}
}
{const ro=new ResizeObserver(()=>moveInd(true));ro.observe(document.querySelector('.tabs'));document.querySelectorAll('.tabs button').forEach(b=>ro.observe(b))}

// 彈窗關閉動畫：close() 先播淡出，再真正關閉（Esc、取消、確定都走這裡）
const REDUCED=matchMedia('(prefers-reduced-motion:reduce)');
const _dclose=HTMLDialogElement.prototype.close;
HTMLDialogElement.prototype.close=function(v){
 if(!this.open||this._closing)return;
 if(v!==undefined)this.returnValue=v;
 if(REDUCED.matches)return _dclose.call(this);
 this._closing=true;this.classList.add('closing');
 setTimeout(()=>{this.classList.remove('closing');this._closing=false;_dclose.call(this)},190);
};
document.querySelectorAll('dialog').forEach(d=>{
 d.addEventListener('cancel',e=>{e.preventDefault();d.close()});
 d.querySelector('form').addEventListener('submit',e=>{e.preventDefault();d.returnValue=e.submitter?e.submitter.value:'';d.close()});
});

/* ---------- 啟動 ---------- */
function boot(){
 if(api)return;
 if(window.pywebview&&window.pywebview.api)api=window.pywebview.api;
 else{api=mockApi();$('#mock').hidden=false}
 $('#empty').innerHTML=EMPTY;loadRepos();
}
window.addEventListener('pywebviewready',boot);
setTimeout(boot,700);
