import {NextResponse} from "next/server";

const secureHeaders={
  "Strict-Transport-Security":"max-age=31536000; includeSubDomains",
  "Referrer-Policy":"strict-origin-when-cross-origin",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Permissions-Policy":"camera=(self), microphone=(self), geolocation=(self), payment=()",
  "Cross-Origin-Opener-Policy":"same-origin"
};

function contentSecurityPolicy(nonce){
  const devEval=process.env.NODE_ENV==="production"?"":" 'unsafe-eval'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https: wss:",
    "frame-src https://challenges.cloudflare.com",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${devEval}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'"
  ].join("; ");
}

export function proxy(request){
  const nonce=crypto.randomUUID().replaceAll("-","");
  const csp=contentSecurityPolicy(nonce);
  const requestHeaders=new Headers(request.headers);
  requestHeaders.set("x-nonce",nonce);
  requestHeaders.set("Content-Security-Policy",csp);
  const response=NextResponse.next({request:{headers:requestHeaders}});
  response.headers.set("Content-Security-Policy",csp);
  for(const [name,value] of Object.entries(secureHeaders))response.headers.set(name,value);
  return response;
}

export const config={
  matcher:[
    "/((?!api|_next/static|_next/image|favicon.ico|apple-touch-icon.png|manifest.webmanifest|sw.js|pwa-|brand/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)"
  ]
};
