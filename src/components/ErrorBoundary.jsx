/* ═══════════════════════════════════════════════════════════════
   CLARK - Error Boundary (V15.5)
   
   Catches JavaScript errors anywhere in the component tree and
   displays a fallback UI instead of a blank white screen.
   
   Usage: Wrap any risky section in <ErrorBoundary>.
   We wrap the main app content so one page's error doesn't crash all.
   ═══════════════════════════════════════════════════════════════ */

import React from "react";
import { T } from "../theme.js";
import { logClientError } from "../utils/errorLog.js";

export class ErrorBoundary extends React.Component {
  constructor(props){
    super(props);
    this.state={hasError:false,error:null};
  }
  static getDerivedStateFromError(error){
    return{hasError:true,error};
  }
  componentDidCatch(error,errorInfo){
    console.error("ErrorBoundary caught:",error,errorInfo);
    /* V21.27.25: سجّل الخطأ عن بُعد (best-effort) عشان يبقى مرئي للمطوّر
       — مفيش بيئة تجربة، الـ deploy على production مباشرة. */
    try{ logClientError(error,{kind:"boundary",componentStack:errorInfo?.componentStack}); }catch(_){}
  }
  reset=()=>{
    this.setState({hasError:false,error:null});
    /* If provided, call the parent's onReset callback (e.g., go home) */
    if(this.props.onReset)this.props.onReset();
  };
  reload=()=>{
    window.location.reload();
  };
  render(){
    if(this.state.hasError){
      return(
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Cairo',sans-serif",direction:"rtl",background:T.bg||"#F8FAFC"}}>
          <div style={{maxWidth:500,background:T.cardSolid||"#fff",borderRadius:16,padding:"32px 28px",boxShadow:"0 10px 40px rgba(0,0,0,0.08)",textAlign:"center"}}>
            <div style={{fontSize:56,marginBottom:14}}>⚠️</div>
            <h2 style={{fontSize:22,fontWeight:800,color:"#EF4444",margin:"0 0 10px"}}>حصلت مشكلة غير متوقعة</h2>
            <p style={{fontSize:14,color:T.textSec||"#64748B",lineHeight:1.7,margin:"0 0 20px"}}>
              ما تقلقش — بياناتك محفوظة. ممكن ترجع للرئيسية أو تحدّث الصفحة.
            </p>
            {this.state.error&&(
              <details style={{fontSize:11,color:T.textMut||"#94A3B8",textAlign:"left",direction:"ltr",margin:"12px 0 20px",background:"#F8FAFC",padding:10,borderRadius:8,maxHeight:120,overflow:"auto"}}>
                <summary style={{cursor:"pointer",fontWeight:600}}>تفاصيل المشكلة</summary>
                <pre style={{margin:"8px 0 0",fontSize:11,whiteSpace:"pre-wrap"}}>{String(this.state.error?.message||this.state.error)}</pre>
              </details>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={this.reset} style={{padding:"10px 22px",borderRadius:10,border:"1px solid "+(T.brd||"#E2E8F0"),background:T.cardSolid||"#fff",color:T.text||"#1E293B",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🏠 رجوع للرئيسية</button>
              <button onClick={this.reload} style={{padding:"10px 22px",borderRadius:10,border:"none",background:T.accent||"#0EA5E9",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🔄 تحديث الصفحة</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
