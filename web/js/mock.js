/* 預覽模式：不在 pywebview 內（例如直接用瀏覽器開 index.html）時使用的模擬資料 */
function mockApi(){
 const w=ms=>new Promise(r=>setTimeout(r,ms));
 const ok=async d=>(await w(100),{ok:true,data:d});
 let repos=['D:\\code\\my-project','D:\\code\\tools\\bot'];
 let fl=[{path:'src/main.py',code:'M'},{path:'src/ui/index.html',code:'M'},{path:'README.md',code:'M'},{path:'assets/logo.png',code:'?'},{path:'old_notes.txt',code:'D'}];
 let logs=[{hash:'9f3c1a2',subject:'修正下載進度條',author:'子睿',when:'2 小時前'},{hash:'c47be10',subject:'新增設定頁',author:'子睿',when:'昨天'},{hash:'2d90af7',subject:'初始提交',author:'子睿',when:'3 天前'}];
 let ahead=2,branch='main',br=['main','dev'],tok=false;
 return{
  repos:()=>ok({repos:repos.map(p=>({path:p,name:p.split(/[\\/]/).pop(),exists:true})),has_token:tok}),
  pick_folder:()=>ok('D:\\code\\new-folder'),
  open_repo:p=>{if(!repos.includes(p))repos.push(p);return ok({path:p,name:p.split(/[\\/]/).pop(),is_repo:!/new-folder|Desktop/.test(p)})},
  remove_repo:p=>{repos=repos.filter(x=>x!==p);return ok(true)},
  delete_repo:p=>{repos=repos.filter(x=>x!==p);return ok({ended:['powershell.exe']})},
  open_folder:()=>ok(true),
  tree:p=>ok(p.split(/[\\/]/).pop()+'\n├─ assets/\n│  └─ logo.png\n├─ src/\n│  ├─ ui/\n│  │  └─ index.html\n│  └─ main.py\n└─ README.md'),
  init_repo:()=>ok(true),
  status:()=>ok({branch,ahead,behind:0,upstream:true,files:fl}),
  branches:()=>ok(br),
  switch:(p,n,c)=>{if(c)br.push(n);branch=n;return ok(true)},
  commit:(p,f,m)=>{fl=fl.filter(x=>!f.includes(x.path));ahead++;const h=Math.random().toString(16).slice(2,9);logs.unshift({hash:h,subject:String(m).split('\n')[0],author:'子睿',when:'剛剛'});return ok(h)},
  unpushed:()=>ok(logs.slice(0,ahead).map(c=>({hash:c.hash,short:c.hash,subject:c.subject,message:c.subject}))),
  reword:(p,h,m)=>{const c=logs.find(x=>x.hash===h);if(!c)return Promise.resolve({ok:false,error:'這筆提交已推送或不存在，無法修改'});const first=m.split('\n')[0];if(first===c.subject)return ok(false);c.subject=first;return ok(true)},
  push:()=>{ahead=0;return ok('推送完成')},
  force_push:()=>{ahead=0;return ok('強制推送完成')},
  pull:()=>ok('已是最新'),
  log:()=>ok(logs.map(c=>({...c}))),
  term_start:(p)=>{setTimeout(()=>window.term.write('（預覽模式：模擬終端機）\r\nPS '+p+'> '),150);return ok(true)},
  term_input:d=>{window.term.write(d==='\r'?'\r\nPS> ':d);return ok(true)},
  term_resize:()=>ok(true),
  term_stop:()=>ok(true),
  set_token:()=>{tok=true;return ok(true)},
  gh_repos:()=>tok?ok([{name:'you/my-project',private:false,url:'u1',updated:'2026-11-20'},{name:'you/notes',private:true,url:'u2',updated:'2026-11-02'}]):Promise.resolve({ok:false,error:'請先設定 Personal Access Token'}),
  gh_create:()=>ok('https://github.com/you/demo.git'),
  clone:()=>ok('D:\\code\\cloned')
 };
}
