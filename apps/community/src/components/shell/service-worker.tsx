import { cspNonce } from '@/server/nonce'

const REGISTER = `(function(){try{
if(!('serviceWorker' in navigator))return;
var go=function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){});};
if(document.readyState==='complete')go();
else window.addEventListener('load',go,{once:true});
}catch(e){}})();`

export async function ServiceWorkerRegistrar() {
  return <script nonce={await cspNonce()} dangerouslySetInnerHTML={{ __html: REGISTER }} />
}
