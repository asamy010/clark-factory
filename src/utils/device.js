/* ═══════════════════════════════════════════════════════════════
   CLARK — Device Tracking Utility (V15.92)
   
   Security layer for audit log. Captures:
   - deviceId: persistent random ID (localStorage) — identifies the physical device
   - deviceName: human-readable OS + browser + screen
   - ipInfo: IP address + country/city (fetched once per session, cached)
   
   Usage:
     import { getDeviceInfo, getIpInfo } from "./utils/device.js";
     const dev = getDeviceInfo();        // synchronous, fast
     const ip  = await getIpInfo();      // async but cached in session
   ═══════════════════════════════════════════════════════════════ */

const DEVICE_ID_KEY="clark_device_id_v1";
const DEVICE_NAME_KEY="clark_device_name_v1";
const IP_CACHE_KEY="clark_ip_info_v1";/* session-scoped */

/* Generate a stable device ID for this browser/machine. Persists in localStorage. */
export function getDeviceId(){
  try{
    let id=localStorage.getItem(DEVICE_ID_KEY);
    if(!id){
      id="DEV-"+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
      localStorage.setItem(DEVICE_ID_KEY,id);
    }
    return id;
  }catch(e){
    return"DEV-unknown";
  }
}

/* Optional user-assigned name for the device (e.g. "Ahmed's laptop") */
export function getDeviceNickname(){
  try{return localStorage.getItem(DEVICE_NAME_KEY)||""}catch(e){return""}
}
export function setDeviceNickname(name){
  try{
    if(name)localStorage.setItem(DEVICE_NAME_KEY,String(name).slice(0,60));
    else localStorage.removeItem(DEVICE_NAME_KEY);
  }catch(e){}
}

/* Parse User-Agent into a friendly OS + browser string */
function parseUserAgent(ua){
  const s=(ua||"").toLowerCase();
  let os="Unknown";
  if(s.includes("windows nt 10"))os="Windows 10/11";
  else if(s.includes("windows"))os="Windows";
  else if(s.includes("mac os"))os="macOS";
  else if(s.includes("android"))os="Android";
  else if(s.includes("iphone")||s.includes("ipad"))os="iOS";
  else if(s.includes("linux"))os="Linux";
  let browser="Unknown";
  if(s.includes("edg/"))browser="Edge";
  else if(s.includes("chrome/"))browser="Chrome";
  else if(s.includes("firefox/"))browser="Firefox";
  else if(s.includes("safari/")&&!s.includes("chrome"))browser="Safari";
  else if(s.includes("opera")||s.includes("opr/"))browser="Opera";
  return os+" — "+browser;
}

/* Synchronous device fingerprint */
export function getDeviceInfo(){
  try{
    const ua=navigator.userAgent||"";
    const screenRes=(window.screen?.width||0)+"x"+(window.screen?.height||0);
    let tz="";
    try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch(e){}
    return{
      deviceId:getDeviceId(),
      deviceName:getDeviceNickname(),
      browserInfo:parseUserAgent(ua),
      screenRes,
      timezone:tz,
      platform:navigator.platform||"",
      cores:navigator.hardwareConcurrency||0,
      touch:("ontouchstart"in window)?"touch":"no-touch"
    };
  }catch(e){
    return{deviceId:"DEV-unknown",deviceName:"",browserInfo:"Unknown",screenRes:"",timezone:"",platform:"",cores:0,touch:""};
  }
}

/* Fetch IP info from ipapi.co (1000 req/day free, includes location) */
export async function getIpInfo(){
  /* Return cached value if we already fetched in this session */
  try{
    const cached=sessionStorage.getItem(IP_CACHE_KEY);
    if(cached){return JSON.parse(cached)}
  }catch(e){}
  
  try{
    /* ipapi.co — returns IP + country + city + ISP */
    const res=await fetch("https://ipapi.co/json/",{
      method:"GET",
      headers:{"Accept":"application/json"},
      /* 5s timeout via AbortController */
      signal:AbortSignal.timeout?AbortSignal.timeout(5000):undefined
    });
    if(!res.ok)throw new Error("ipapi status "+res.status);
    const data=await res.json();
    const info={
      ip:data.ip||"",
      country:data.country_name||"",
      countryCode:data.country_code||"",
      city:data.city||"",
      region:data.region||"",
      org:data.org||"",
      fetchedAt:new Date().toISOString()
    };
    try{sessionStorage.setItem(IP_CACHE_KEY,JSON.stringify(info))}catch(e){}
    return info;
  }catch(err){
    /* Fallback: try ipify (IP only, no location) */
    try{
      const res=await fetch("https://api.ipify.org?format=json",{
        signal:AbortSignal.timeout?AbortSignal.timeout(5000):undefined
      });
      if(res.ok){
        const data=await res.json();
        const info={ip:data.ip||"",country:"",city:"",org:"",fetchedAt:new Date().toISOString(),fallback:true};
        try{sessionStorage.setItem(IP_CACHE_KEY,JSON.stringify(info))}catch(e){}
        return info;
      }
    }catch(e){}
    /* All failed */
    return{ip:"",country:"",city:"",org:"",fetchedAt:new Date().toISOString(),error:String(err).slice(0,80)};
  }
}

/* Pre-fetch IP info once on app startup; subsequent addAudit calls can use cache synchronously */
export async function prefetchIpInfo(){
  return getIpInfo();
}

/* Synchronous access to cached IP info (for use in upConfig callbacks which can't be async) */
export function getCachedIpInfo(){
  try{
    const cached=sessionStorage.getItem(IP_CACHE_KEY);
    if(cached)return JSON.parse(cached);
  }catch(e){}
  return null;
}
