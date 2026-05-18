/* ═══════════════════════════════════════════════════════════════
   CLARK — Attachments Utility (V15.90)
   
   Handles file uploads to Firebase Storage for order attachments.
   Keeps Firestore documents tiny (~200 bytes metadata per attachment)
   instead of embedding base64 data (~1MB+ per file).
   
   Storage structure:
     orders/{orderId}/attachments/{timestamp}_{filename}
   
   Firestore record (in order.attachments array):
     {
       id, name, type ("image"|"pdf"|"doc"), size, 
       storagePath, downloadURL, uploadedBy, uploadedAt
     }
   ═══════════════════════════════════════════════════════════════ */

import { storage } from "../firebase.js";
import { 
  ref as storageRef, 
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject 
} from "firebase/storage";
import { gid } from "./format.js";

/* Allowed file types and extensions */
const ALLOWED_TYPES = {
  image: [".jpg",".jpeg",".png",".webp",".gif"],
  pdf: [".pdf"],
  doc: [".doc",".docx",".xls",".xlsx",".txt"]
};

/* Max file size: 10MB per file (hard limit to prevent storage abuse) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/* Get file type category from filename */
export function getFileType(filename){
  if(!filename)return"other";
  const lower=filename.toLowerCase();
  const ext="."+lower.split(".").pop();
  if(ALLOWED_TYPES.image.includes(ext))return"image";
  if(ALLOWED_TYPES.pdf.includes(ext))return"pdf";
  if(ALLOWED_TYPES.doc.includes(ext))return"doc";
  return"other";
}

/* Get icon for file type */
export function getFileIcon(type){
  if(type==="image")return"🖼";
  if(type==="pdf")return"📄";
  if(type==="doc")return"📝";
  return"📎";
}

/* Check if file type is allowed */
export function isAllowedFile(filename){
  return getFileType(filename)!=="other";
}

/* Format file size */
export function formatFileSize(bytes){
  if(!bytes)return"0 B";
  if(bytes<1024)return bytes+" B";
  if(bytes<1024*1024)return Math.round(bytes/1024)+" KB";
  return(bytes/(1024*1024)).toFixed(1)+" MB";
}

/* Compress image before upload if it's large (>500KB)
   Uses canvas to resize/re-encode at JPEG 70% quality */
function compressImage(file){
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith("image/")){resolve(file);return}
    if(file.size<500*1024){resolve(file);return}/* small enough */
    if(file.type==="image/gif"){resolve(file);return}/* preserve animation */
    
    const reader=new FileReader();
    reader.onload=(e)=>{
      const img=new Image();
      img.onload=()=>{
        /* Cap at 1920px on longest side */
        const MAX_DIM=1920;
        let w=img.width,h=img.height;
        if(w>MAX_DIM||h>MAX_DIM){
          if(w>h){h=Math.round(h*MAX_DIM/w);w=MAX_DIM}
          else{w=Math.round(w*MAX_DIM/h);h=MAX_DIM}
        }
        const canvas=document.createElement("canvas");
        canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,w,h);
        canvas.toBlob((blob)=>{
          if(!blob){resolve(file);return}
          /* Create new File with same name but compressed data */
          const compressed=new File([blob],file.name,{type:"image/jpeg",lastModified:Date.now()});
          resolve(compressed);
        },"image/jpeg",0.7);
      };
      img.onerror=()=>resolve(file);
      img.src=e.target.result;
    };
    reader.onerror=()=>resolve(file);
    reader.readAsDataURL(file);
  });
}

/* Upload a single file. Returns attachment metadata object.
   onProgress: (percent 0-100) => void */
export async function uploadAttachment(orderId,file,uploadedBy,onProgress){
  if(!orderId)throw new Error("orderId مطلوب");
  if(!file)throw new Error("الملف مطلوب");
  if(!isAllowedFile(file.name))throw new Error("نوع الملف غير مدعوم: "+file.name);
  if(file.size>MAX_FILE_SIZE)throw new Error("الملف أكبر من "+formatFileSize(MAX_FILE_SIZE));
  
  /* Compress images before upload */
  const finalFile=await compressImage(file);
  const type=getFileType(file.name);
  const id="att_"+gid();
  const ts=Date.now();
  /* Sanitize filename (remove special chars, keep extension) */
  const safeName=file.name.replace(/[^\w\u0600-\u06FF.\- ]+/g,"_").substring(0,80);
  const storagePath="orders/"+orderId+"/attachments/"+ts+"_"+safeName;
  
  /* Upload with progress tracking.
     V21.9.77: removed customMetadata (same root-cause as V21.9.76 templateImages.js
     fix — customMetadata forces multipart upload protocol, which breaks Storage
     rule's `isAllowedMime()` contentType check). orderId is already in the path
     itself, originalName is preserved as the final path segment, uploadedBy was
     only used for forensic logging. */
  const ref=storageRef(storage,storagePath);
  const task=uploadBytesResumable(ref,finalFile,{
    contentType:finalFile.type||"application/octet-stream",
  });
  
  return new Promise((resolve,reject)=>{
    task.on("state_changed",
      (snap)=>{
        if(onProgress){
          const pct=Math.round((snap.bytesTransferred/snap.totalBytes)*100);
          onProgress(pct);
        }
      },
      (err)=>{reject(err)},
      async()=>{
        try{
          const downloadURL=await getDownloadURL(task.snapshot.ref);
          resolve({
            id,
            name:file.name,
            type,
            size:finalFile.size,
            originalSize:file.size,
            storagePath,
            downloadURL,
            uploadedBy:uploadedBy||"",
            uploadedAt:new Date().toISOString()
          });
        }catch(e){reject(e)}
      }
    );
  });
}

/* Delete an attachment from storage. Firestore removal handled by caller via upConfig. */
export async function deleteAttachment(storagePath){
  if(!storagePath)return;
  try{
    const ref=storageRef(storage,storagePath);
    await deleteObject(ref);
  }catch(e){
    /* 404 is OK — file already gone. Log everything else. */
    if(e.code!=="storage/object-not-found"){
      console.error("Failed to delete attachment:",e);
      throw e;
    }
  }
}

/* Upload multiple files in parallel (with progress per file) */
export async function uploadMultiple(orderId,files,uploadedBy,onFileProgress){
  const uploads=Array.from(files).map((file,idx)=>
    uploadAttachment(orderId,file,uploadedBy,(pct)=>{
      if(onFileProgress)onFileProgress(idx,pct);
    }).catch(err=>({error:err.message||String(err),fileName:file.name}))
  );
  return Promise.all(uploads);
}
