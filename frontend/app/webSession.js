const KEY="marbo3a_token";

export function sessionMarker(){
  if(typeof window==="undefined")return"";
  const local=localStorage.getItem(KEY)||"",session=sessionStorage.getItem(KEY)||"",value=local||session;
  if(value&&value!=="cookie"){
    try{localStorage.setItem(KEY,"cookie");sessionStorage.removeItem(KEY)}catch{}
    return"cookie";
  }
  return value;
}
export function markCookieSession(){if(typeof window!=="undefined"){localStorage.setItem(KEY,"cookie");sessionStorage.removeItem(KEY)}}
export function clearCookieSession(){if(typeof window!=="undefined"){localStorage.removeItem(KEY);sessionStorage.removeItem(KEY)}}
export function cookieHeaders(headers={}){return{"x-marbo3a-session-mode":"cookie",...headers}}
