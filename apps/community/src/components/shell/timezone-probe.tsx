import { cspNonce } from '@/server/nonce'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { TIMEZONE_COOKIE } from '@/view/timezone'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function probe(applied: string, automatic: boolean): string {
  const name = JSON.stringify(TIMEZONE_COOKIE)

  return `(function(){try{
var n=${name},a=${JSON.stringify(applied)},auto=${automatic ? 'true' : 'false'};
var zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
if(!zone)return;
var read=function(){
var m=document.cookie.match(new RegExp('(^|; )'+n+'=([^;]*)'));
return m?decodeURIComponent(m[2]):null;
};
if(read()!==zone){
document.cookie=n+'='+encodeURIComponent(zone)+';path=/;max-age=${COOKIE_MAX_AGE};samesite=lax'+(location.protocol==='https:'?';secure':'');
}
if(!auto||a===zone||read()!==zone)return;
var k=n+'.reloaded';
if(sessionStorage.getItem(k)===zone)return;
sessionStorage.setItem(k,zone);
location.reload();
}catch(e){}})();`
}

export async function TimezoneProbe() {
  let preferences: Awaited<ReturnType<typeof getViewerPreferences>>
  try {
    preferences = await getViewerPreferences()
  } catch {
    return null
  }

  return (
    <script
      nonce={await cspNonce()}
      dangerouslySetInnerHTML={{
        __html: probe(preferences.timezone, preferences.timezoneIsAutomatic),
      }}
    />
  )
}
