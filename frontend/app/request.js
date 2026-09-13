function reportFailure(input,code){try{if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("marbo3a:request-failure",{detail:{url:String(input||"").slice(0,300),code}}))}catch{}}

export async function fetchWithTimeout(input,options={},timeoutMs=12000){
  const controller=new AbortController();
  const upstream=options.signal;
  let timedOut=false;
  const relay=()=>controller.abort();
  if(upstream){if(upstream.aborted)controller.abort();else upstream.addEventListener("abort",relay,{once:true})}
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},Math.max(1000,Number(timeoutMs)||12000));
  try{return await fetch(input,{...options,signal:controller.signal})}
  catch(error){if(timedOut){reportFailure(input,"REQUEST_TIMEOUT");const e=new Error("REQUEST_TIMEOUT");e.cause=error;throw e}if(!upstream?.aborted)reportFailure(input,"REQUEST_FAILED");throw error}
  finally{clearTimeout(timer);upstream?.removeEventListener?.("abort",relay)}
}

export async function fetchJson(input,options={},timeoutMs=12000){
  let response;
  try{response=await fetchWithTimeout(input,options,timeoutMs)}catch(error){if(error?.message==="REQUEST_TIMEOUT")throw error;const e=new Error("REQUEST_FAILED");e.cause=error;throw e}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(data.error||"REQUEST_FAILED");e.status=response.status;e.data=data;throw e}
  return data;
}
