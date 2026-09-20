(async function responsiveHarnessMain(){
  const fs=(await import("node:fs")).default;
  const os=(await import("node:os")).default;
  const path=(await import("node:path")).default;
  const {spawn,spawnSync}=await import("node:child_process");
  const {pathToFileURL}=await import("node:url");

  const root=process.cwd();
  const appDir=path.join(root,"app");
  const layout=fs.readFileSync(path.join(appDir,"layout.js"),"utf8");
const imports=layout.split("\n").map(line=>line.match(/^import ["\']\.\/(.+\.css)["\'];$/)?.[1]).filter(Boolean);
  const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(bin=>{
    const r=spawnSync("bash",["-lc","command -v "+bin],{encoding:"utf8"});
    return r.status===0&&r.stdout.trim();
  });
  if(!chrome)throw new Error("Chrome/Chromium not found");
  if(typeof WebSocket==="undefined")throw new Error("Node WebSocket API unavailable");

  const matrix=[[320,568],[360,640],[390,844],[412,915],[768,1024],[1024,768],[1366,768],[1920,1080]];
  const themes=["dark","light"];
  const cssLinks=imports.map(name=>'<link rel="stylesheet" href="'+pathToFileURL(path.join(appDir,name)).href+'">').join("\n");
  const fixture=path.join(os.tmpdir(),"marbo3a-responsive-"+process.pid+".html");
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),"marbo3a-chrome-"));
  const port=19000+(process.pid%1000);
  const html='<!doctype html><html lang="ar" dir="rtl" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+cssLinks+'</head><body class="ui-v3">'+
    '<header class="v3-global-header"><a class="v3-brand-lockup" href="#"><span>مربوعة</span></a><div class="v3-audience-stats"><span><b>999</b><small>زائر</small></span><span><b>88</b><small>متصل</small></span></div><nav class="v3-header-actions"><a class="v3-header-icon" href="#">🔔</a><a class="v3-header-icon" href="#">⌕</a></nav></header>'+
    '<main class="social-page"><section class="social-shell"><article class="sf-panel"><h1>اختبار القياسات والاستجابة</h1><p>هذا نص عربي طويل لاختبار التفاف السطور وعدم خروج المحتوى خارج الشاشة في المقاسات الضيقة.</p><p class="sf-muted">username_with_a_very_long_unbroken_identifier_abcdefghijklmnopqrstuvwxyz_0123456789</p><label>حقل اختبار <input id="matrix-input" value="نص عربي طويل للاختبار"></label><button type="button">إجراء أساسي</button></article></section></main>'+
    '<section class="guest-explore-page"><div class="guest-explore-hero"><div><h1>واجهة الزائر</h1><p>محتوى عام طويل لاختبار نفس حدود العرض بدون تسجيل دخول.</p></div></div></section>'+
    '<section class="sf-panel group14-states" aria-label="حالات واجهة الاختبار"><div class="settings-card settings-large" role="dialog" aria-modal="true" aria-label="إعدادات مربوعة"><header><h2>الإعدادات</h2><button type="button" aria-label="إغلاق">×</button></header><div class="settings-tabs"><button type="button">التطبيق</button><button type="button">الأمان</button></div></div><article class="notification-row unread"><button type="button" class="notification-main"><span>تنبيه</span><span>نص تنبيه عربي طويل للاختبار</span></button><div class="notification-actions"><button type="button">قبول</button><button type="button">رفض</button></div></article><section class="room-seat-stage" aria-label="الصوت المباشر"><div class="room-seat-grid"><button type="button" class="room-seat empty" aria-label="كرسي فارغ">1</button><button type="button" class="room-seat occupied" aria-label="كرسي مستخدم">2</button></div><div class="room-seat-controls"><button type="button">دخول كمستمع</button></div></section><div class="call-actions active-call"><button type="button">كتم</button><button type="button">سبيكر</button><button type="button">إنهاء</button></div><div class="live-studio-controls"><button type="button">مايك</button><button type="button">كاميرا</button></div><section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="g14-dialog-title"><h3 id="g14-dialog-title">تأكيد الحذف</h3><p>هذا إجراء حساس ويحتاج تأكيد واضح.</p><footer><button type="button">إلغاء</button><button type="button">حذف</button></footer></section><aside class="social-drawer"><nav><a href="/home">الرئيسية</a><a href="/settings">الإعدادات</a></nav></aside><div class="sf-alert" role="status">تعذر تحميل البيانات — حالة خطأ للاختبار</div><div class="sf-skeleton">جاري التحميل...</div><div class="sf-empty"><h2>ما فيش بيانات توا</h2></div></section>'+
    '<nav class="social-dock"><div class="social-dock-track"><button>المزيد</button><a href="#">الأصحاب</a><a href="#">الرئيسية</a><a href="#">الرسائل</a><a href="#">الغرف</a></div></nav></body></html>';
  fs.writeFileSync(fixture,html);

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function waitTarget(){
    const deadline=Date.now()+12000;
    while(Date.now()<deadline){
      try{
        const r=await fetch("http://127.0.0.1:"+port+"/json/list");
        if(r.ok){
          const list=await r.json();
          const page=list.find(x=>x.type==="page");
          if(page?.webSocketDebuggerUrl)return page;
        }
      }catch{}
      await sleep(100);
    }
    throw new Error("Chrome DevTools target not ready");
  }
  function makeCdp(ws){
    let id=0;
    const pending=new Map();
    ws.addEventListener("message",ev=>{
      const msg=JSON.parse(String(ev.data));
      if(!msg.id)return;
      const p=pending.get(msg.id);
      if(!p)return;
      pending.delete(msg.id);
      if(msg.error)p.reject(new Error(msg.error.message||JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    });
    return (method,params={})=>new Promise((resolve,reject)=>{
      const n=++id;
      pending.set(n,{resolve,reject});
      ws.send(JSON.stringify({id:n,method,params}));
    });
  }
  function browserProbe(expected){
    return new Promise(resolve=>{
      document.documentElement.dataset.theme=expected.theme;
      document.documentElement.style.setProperty("--app-safe-top",expected.safeTop+"px");
      document.documentElement.style.setProperty("--app-safe-bottom",expected.safeBottom+"px");
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const q=s=>document.querySelector(s);
        const rect=s=>q(s)?.getBoundingClientRect()||null;
        const css=s=>q(s)?getComputedStyle(q(s)):null;
        const failures=[];
        const check=(ok,msg)=>{if(!ok)failures.push(msg)};
        const header=rect(".v3-global-header");
        const dock=rect(".social-dock");
        const shell=rect(".social-shell");
        const guest=rect(".guest-explore-page");
        const headerActions=[...document.querySelectorAll(".v3-header-icon")].map(x=>x.getBoundingClientRect());
        const dockActions=[...document.querySelectorAll(".social-dock a,.social-dock button")].map(x=>x.getBoundingClientRect());
        const input=rect("#matrix-input");
        const inputCss=css("#matrix-input");
        const interactive=[...document.querySelectorAll('button,[role="button"]')].filter(x=>x.getClientRects().length).map(x=>x.getBoundingClientRect());
        const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(x=>x.getClientRects().length);
        const pageCss=css(".social-page");
        const viewportW=innerWidth,viewportH=innerHeight;
        check(Math.abs(viewportW-expected.width)<=1,"viewport width "+viewportW+" != "+expected.width);
        check(Math.abs(viewportH-expected.height)<=1,"viewport height "+viewportH+" != "+expected.height);
        check(document.documentElement.scrollWidth<=viewportW+1,"horizontal overflow "+document.documentElement.scrollWidth+" > "+viewportW);
        check(header&&header.height>=58+expected.safeTop-1,"header height "+header?.height);
        check(dock&&dock.height>=62+expected.safeBottom-1,"dock height "+dock?.height);
        check(dock&&Math.abs(dock.bottom-viewportH)<=2,"dock bottom "+dock?.bottom+" vs viewport "+viewportH);
        check(headerActions.length>=2&&headerActions.every(r=>r.width>=44&&r.height>=44),"header hit target below 44px");
        check(dockActions.length>=5&&dockActions.every(r=>r.height>=44),"dock hit target below 44px");
        check(input&&input.height>=44,"input height "+input?.height);
        check(interactive.every(r=>r.width>=44&&r.height>=44),"interactive target below 44x44");
        check(dialogs.every(x=>x.getAttribute("aria-modal")==="true"&&Boolean(x.getAttribute("aria-label")||x.getAttribute("aria-labelledby"))),"dialog semantics incomplete");
        check(document.documentElement.dir==="rtl","document direction is not RTL");
        if(expected.width<=520)check(parseFloat(inputCss?.fontSize||"0")>=16,"mobile input font "+inputCss?.fontSize);
        check(shell&&shell.width<=Math.min(viewportW,600)+1,"shell width "+shell?.width);
        check(shell&&shell.left>=-1&&shell.right<=viewportW+1,"shell escapes viewport "+shell?.left+".."+shell?.right);
        check(guest&&guest.left>=-1&&guest.right<=viewportW+1,"guest shell escapes viewport "+guest?.left+".."+guest?.right);
        const padBottom=parseFloat(pageCss?.paddingBottom||"0");
        check(dock&&padBottom>=dock.height+8,"page bottom reserve "+padBottom+" < dock "+dock.height+"+8");
        const vars=getComputedStyle(document.documentElement);
        resolve({
          failures,
          result:{
            requested:[expected.width,expected.height],actual:[viewportW,viewportH],theme:expected.theme,
            safe:[expected.safeTop,expected.safeBottom],scrollWidth:document.documentElement.scrollWidth,
            headerHeight:header?.height,dockHeight:dock?.height,shellWidth:shell?.width,inputHeight:input?.height,
            inputFont:inputCss?.fontSize,paddingBottom:padBottom,
            vars:{
              header:vars.getPropertyValue("--app-header-h").trim(),
              dock:vars.getPropertyValue("--app-dock-h").trim(),
              pageMax:vars.getPropertyValue("--app-page-max").trim()
            }
          }
        });
      }));
    });
  }

  const chromeProc=spawn(chrome,[
    "--headless=new","--disable-gpu","--no-sandbox","--allow-file-access-from-files",
    "--remote-debugging-port="+port,"--user-data-dir="+profile,"about:blank"
  ],{stdio:["ignore","ignore","pipe"]});
  let failed=false;
  const results=[];
  try{
    const target=await waitTarget();
    const ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{
      ws.addEventListener("open",resolve,{once:true});
      ws.addEventListener("error",reject,{once:true});
    });
    const send=makeCdp(ws);
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate",{url:pathToFileURL(fixture).href});
    for(let i=0;i<100;i++){
      const ready=await send("Runtime.evaluate",{expression:"document.readyState",returnByValue:true});
      if(ready.result?.value==="complete")break;
      await sleep(50);
    }
    for(const [width,height] of matrix){
      for(const theme of themes){
        const phone=width<=520;
        const expected={width,height,theme,safeTop:phone?47:0,safeBottom:phone?34:0};
        await send("Emulation.setDeviceMetricsOverride",{
          width,height,deviceScaleFactor:1,mobile:phone,screenWidth:width,screenHeight:height
        });
        await send("Emulation.setTouchEmulationEnabled",{enabled:phone,maxTouchPoints:5});
        const expression="("+browserProbe.toString()+")("+JSON.stringify(expected)+")";
        const response=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
        if(response.exceptionDetails)throw new Error(response.exceptionDetails.text||"browser probe exception");
        const payload=response.result?.value;
        if(!payload)throw new Error("empty browser probe at "+width+"x"+height+" "+theme);
        results.push(payload.result);
        if(payload.failures.length){
          failed=true;
          console.error("RESPONSIVE_GEOMETRY_FAILED: "+width+"x"+height+" "+theme+": "+payload.failures.join("; "));
        }
      }
    }
    await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
    const motion=await send("Runtime.evaluate",{expression:`(()=>{const e=document.querySelector(".live-badge i"),s=e&&getComputedStyle(e);return {animation:s?.animationDuration||"",transition:s?.transitionDuration||""}})()`,returnByValue:true});
    const mv=motion.result?.value||{};
    const duration=v=>String(v||"").split(",").map(x=>parseFloat(x)||0).reduce((a,b)=>Math.max(a,b),0);
    if(duration(mv.animation)>.01||duration(mv.transition)>.01){
      failed=true;
      console.error("RESPONSIVE_GEOMETRY_FAILED: reduced-motion did not collapse animation/transition duration");
    }
    ws.close();
  }finally{
    chromeProc.kill("SIGKILL");
    try{fs.unlinkSync(fixture)}catch{}
    try{fs.rmSync(profile,{recursive:true,force:true})}catch{}
  }
  if(failed)process.exit(1);
  console.log("Responsive geometry OK · "+results.length+" browser/theme matrix cases · exact CDP viewports "+matrix.map(x=>x.join("x")).join(","));
})().catch(e=>{console.error('RESPONSIVE_GEOMETRY_FAILED: harness '+(e.stack||e.message||e));process.exit(1)});
