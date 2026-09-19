import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";

const root=process.cwd();
const appDir=path.join(root,"app");
const layout=fs.readFileSync(path.join(appDir,"layout.js"),"utf8");
const imports=[...layout.matchAll(/import\\s+["']\\.\\/(.+?\\.css)["'];/g)].map(x=>x[1]);
const chrome=["google-chrome","google-chrome-stable","chromium","chromium-browser"].find(bin=>{
  const r=spawnSync("bash",["-lc",`command -v ${bin}`],{encoding:"utf8"});
  return r.status===0&&r.stdout.trim();
});
if(!chrome){console.error("RESPONSIVE_GEOMETRY_FAILED: Chrome/Chromium not found");process.exit(1)}

const matrix=[[320,568],[360,640],[390,844],[412,915],[768,1024],[1024,768],[1366,768],[1920,1080]];
const themes=["dark","light"];
const cssLinks=imports.map(name=>`<link rel="stylesheet" href="${pathToFileURL(path.join(appDir,name)).href}">`).join("\n");
const htmlPath=path.join(os.tmpdir(),`marbo3a-responsive-${process.pid}.html`);

function browserProbe(expected){
  const q=s=>document.querySelector(s);
  const rect=s=>q(s)?.getBoundingClientRect()||null;
  const css=s=>q(s)?getComputedStyle(q(s)):null;
  const failures=[];
  const check=(ok,msg)=>{if(!ok)failures.push(msg)};
  const header=rect(".v3-global-header"),dock=rect(".social-dock"),shell=rect(".social-shell"),guest=rect(".guest-explore-page");
  const headerActions=[...document.querySelectorAll(".v3-header-icon")].map(x=>x.getBoundingClientRect());
  const dockActions=[...document.querySelectorAll(".social-dock a,.social-dock button")].map(x=>x.getBoundingClientRect());
  const input=rect("#matrix-input"),inputCss=css("#matrix-input");
  const pageCss=css(".social-page");
  const viewportW=window.innerWidth,viewportH=window.innerHeight;
  check(Math.abs(viewportW-expected.width)<=2,`viewport width ${viewportW} != ${expected.width}`);
  check(Math.abs(viewportH-expected.height)<=2,`viewport height ${viewportH} != ${expected.height}`);
  check(document.documentElement.scrollWidth<=viewportW+1,`horizontal overflow ${document.documentElement.scrollWidth} > ${viewportW}`);
  check(header&&header.height>=58+expected.safeTop-1,`header height ${header?.height}`);
  check(dock&&dock.height>=62+expected.safeBottom-1,`dock height ${dock?.height}`);
  check(dock&&Math.abs(dock.bottom-viewportH)<=2,`dock bottom ${dock?.bottom} vs viewport ${viewportH}`);
  check(headerActions.length>=2&&headerActions.every(r=>r.width>=44&&r.height>=44),"header hit target below 44px");
  check(dockActions.length>=5&&dockActions.every(r=>r.height>=44),"dock hit target below 44px");
  check(input&&input.height>=44,`input height ${input?.height}`);
  if(expected.width<=520)check(parseFloat(inputCss?.fontSize||"0")>=16,`mobile input font ${inputCss?.fontSize}`);
  check(shell&&shell.width<=Math.min(viewportW,600)+1,`shell width ${shell?.width}`);
  check(shell&&shell.left>=-1&&shell.right<=viewportW+1,`shell escapes viewport ${shell?.left}..${shell?.right}`);
  check(guest&&guest.left>=-1&&guest.right<=viewportW+1,`guest shell escapes viewport ${guest?.left}..${guest?.right}`);
  const padBottom=parseFloat(pageCss?.paddingBottom||"0");
  check(dock&&padBottom>=dock.height+8,`page bottom reserve ${padBottom} < dock ${dock.height}+8`);
  const vars=getComputedStyle(document.documentElement);
  const result={requested:[expected.width,expected.height],actual:[viewportW,viewportH],theme:expected.theme,safe:[expected.safeTop,expected.safeBottom],scrollWidth:document.documentElement.scrollWidth,headerHeight:header?.height,dockHeight:dock?.height,shellWidth:shell?.width,inputFont:inputCss?.fontSize,paddingBottom:padBottom,vars:{header:vars.getPropertyValue("--app-header-h").trim(),dock:vars.getPropertyValue("--app-dock-h").trim(),pageMax:vars.getPropertyValue("--app-page-max").trim()}};
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify({result,failures}))));
  document.documentElement.setAttribute("data-geometry-result",encoded);
}

let failed=false;
const results=[];
try{
  for(const [width,height] of matrix){
    for(const theme of themes){
      const phone=width<=520,safeTop=phone?47:0,safeBottom=phone?34:0;
      const expected={width,height,theme,safeTop,safeBottom};
      const probe=`<script>(${browserProbe.toString()})(${JSON.stringify(expected)});<\\/script>`;
      const html=`<!doctype html><html lang="ar" dir="rtl" data-theme="${theme}" style="--app-safe-top:${safeTop}px;--app-safe-bottom:${safeBottom}px"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${cssLinks}</head><body class="ui-v3">
<header class="v3-global-header"><a class="v3-brand-lockup" href="#"><span>مربوعة</span></a><div class="v3-audience-stats"><span><b>999</b><small>زائر</small></span><span><b>88</b><small>متصل</small></span></div><nav class="v3-header-actions"><a class="v3-header-icon" href="#">🔔</a><a class="v3-header-icon" href="#">⌕</a></nav></header>
<main class="social-page"><section class="social-shell"><article class="sf-panel"><h1>اختبار القياسات والاستجابة</h1><p>هذا نص عربي طويل لاختبار التفاف السطور وعدم خروج المحتوى خارج الشاشة في المقاسات الضيقة.</p><p class="sf-muted">username_with_a_very_long_unbroken_identifier_abcdefghijklmnopqrstuvwxyz_0123456789</p><label>حقل اختبار <input id="matrix-input" value="نص عربي طويل للاختبار"></label><button type="button">إجراء أساسي</button></article></section></main>
<section class="guest-explore-page"><div class="guest-explore-hero"><div><h1>واجهة الزائر</h1><p>محتوى عام طويل لاختبار نفس حدود العرض بدون تسجيل دخول.</p></div></div></section>
<nav class="social-dock"><div class="social-dock-track"><button>المزيد</button><a href="#">الأصحاب</a><a href="#">الرئيسية</a><a href="#">الرسائل</a><a href="#">الغرف</a></div></nav>
${probe}</body></html>`;
      fs.writeFileSync(htmlPath,html);
      const run=spawnSync(chrome,["--headless=new","--disable-gpu","--no-sandbox","--allow-file-access-from-files","--force-device-scale-factor=1",`--window-size=${width},${height}`,"--dump-dom",pathToFileURL(htmlPath).href],{encoding:"utf8",timeout:20000,maxBuffer:20*1024*1024});
      if(run.status!==0){console.error(`RESPONSIVE_GEOMETRY_FAILED: Chrome exited ${run.status} at ${width}x${height} ${theme}\n${run.stderr}`);failed=true;continue}
      const match=run.stdout.match(/data-geometry-result="([^"]+)"/);
      if(!match){console.error(`RESPONSIVE_GEOMETRY_FAILED: no probe result at ${width}x${height} ${theme}`);failed=true;continue}
      const payload=JSON.parse(decodeURIComponent(escape(Buffer.from(match[1],"base64").toString("binary"))));
      results.push(payload.result);
      if(payload.failures.length){failed=true;console.error(`RESPONSIVE_GEOMETRY_FAILED: ${width}x${height} ${theme}: ${payload.failures.join("; ")}`)}
    }
  }
}finally{try{fs.unlinkSync(htmlPath)}catch{}}
if(failed)process.exit(1);
console.log(`Responsive geometry OK · ${results.length} browser/theme matrix cases · widths ${matrix.map(x=>x[0]).join(",")}`);
