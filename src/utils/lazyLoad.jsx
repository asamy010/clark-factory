/* ═══════════════════════════════════════════════════════════════
   CLARK — Lazy Loading Utility (V16.1)
   
   Helper that makes React.lazy() work with NAMED exports. By default
   React.lazy() only accepts default exports, but all CLARK pages use
   named exports (export function HRPg...). This helper wraps them.
   
   Usage:
     const HRPg = lazyNamed(() => import("./pages/HRPg.jsx"), "HRPg");
   
   Provides automatic retry on network failures (chunk load errors).
   ═══════════════════════════════════════════════════════════════ */

import React, { lazy, Suspense } from "react";
import { Spinner } from "../components/ui.jsx";
import { T } from "../theme.js";
import { FS } from "../constants/index.js";

/* Retry a dynamic import up to N times with exponential backoff.
   Handles common "Loading chunk failed" errors from network hiccups or deploys. */
function retryImport(fn,retries=3,delay=500){
  return new Promise((resolve,reject)=>{
    fn()
      .then(resolve)
      .catch(err=>{
        if(retries===0){reject(err);return}
        setTimeout(()=>{
          retryImport(fn,retries-1,delay*2).then(resolve,reject);
        },delay);
      });
  });
}

/* Wrap a dynamic import for React.lazy with a NAMED export.
   Also retries on transient failures. */
export function lazyNamed(importFn,exportName){
  return lazy(()=>retryImport(importFn).then(module=>({
    default:module[exportName]
  })));
}

/* Page-level loading fallback — shown while a page chunk is loading */
export function PageLoader({label}){
  return<div style={{
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
    minHeight:"60vh",gap:16,padding:20
  }}>
    <Spinner size="large"/>
    <div style={{fontSize:FS,color:T.textSec,fontWeight:600}}>
      {label||"جاري التحميل..."}
    </div>
  </div>;
}

/* Wrap a page in a Suspense boundary for cleaner usage in App.jsx */
export function withSuspense(PageComponent,label){
  return function WrappedPage(props){
    return<Suspense fallback={<PageLoader label={label}/>}>
      <PageComponent {...props}/>
    </Suspense>;
  };
}

/* Error boundary for chunk load errors — lets user retry if load fails after all retries */
export class ChunkErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={hasError:false,error:null}}
  static getDerivedStateFromError(error){return{hasError:true,error}}
  componentDidCatch(error,info){
    console.error("Chunk load error:",error,info);
  }
  render(){
    if(this.state.hasError){
      const isChunkError=this.state.error&&/Loading chunk|Failed to fetch|dynamically imported module/i.test(this.state.error.message||"");
      return<div style={{
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        minHeight:"60vh",gap:14,padding:20,textAlign:"center"
      }}>
        <div style={{fontSize:42}}>{isChunkError?"🔌":"⚠️"}</div>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>
          {isChunkError?"فشل تحميل الصفحة":"حدث خطأ غير متوقع"}
        </div>
        <div style={{fontSize:FS-1,color:T.textSec,maxWidth:400,lineHeight:1.6}}>
          {isChunkError?"غالباً بسبب انقطاع الاتصال أو تحديث جديد. جرب إعادة التحميل.":"حدث خطأ في تحميل هذه الصفحة."}
        </div>
        <button onClick={()=>window.location.reload()} style={{
          padding:"10px 24px",borderRadius:10,background:T.accent,color:"#fff",
          border:"none",fontSize:FS,fontWeight:700,cursor:"pointer"
        }}>🔄 إعادة تحميل الصفحة</button>
        {this.state.error&&<details style={{marginTop:10,fontSize:FS-3,color:T.textMut}}>
          <summary style={{cursor:"pointer"}}>تفاصيل تقنية</summary>
          <pre style={{textAlign:"left",direction:"ltr",padding:10,background:T.bg,borderRadius:6,marginTop:8,maxWidth:500,overflow:"auto"}}>
            {String(this.state.error?.message||this.state.error)}
          </pre>
        </details>}
      </div>;
    }
    return this.props.children;
  }
}
