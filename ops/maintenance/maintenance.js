(()=>{
  const message=document.getElementById("message"),eta=document.getElementById("eta");
  const safeText=value=>typeof value==="string"&&value.trim()?value.trim():null;
  const tick=async()=>{
    try{
      const response=await fetch("/api/system/maintenance",{cache:"no-store",credentials:"include",headers:{Accept:"application/json"}});
      if(response.ok){
        const data=await response.json();
        if(!data.active){location.replace("/");return}
        const custom=safeText(data.message);if(custom)message.textContent=custom;
        const started=data.startedAt?new Date(data.startedAt).getTime():0,minutes=Number(data.etaMinutes)||0;
        if(started&&minutes>0){
          const remain=Math.ceil((started+minutes*60000-Date.now())/60000);
          eta.textContent=remain>1?`الوقت المتوقع تقريبًا ${remain} دقيقة.`:remain===1?"متوقع نرجعوا خلال دقيقة تقريبًا.":"التحديث في مراحله الأخيرة.";
        }
      }
    }catch{}
    setTimeout(tick,5000);
  };
  tick();
})();
