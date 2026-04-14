import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { auth, db, getSecondaryAuth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "firebase/auth";
import { doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";

/* Optional libs - loaded dynamically */
let _XLSX=null,_QR=null,_jsQR=null;
const loadXLSX=async()=>{if(!_XLSX)try{_XLSX=await import("xlsx")}catch(e){};return _XLSX};
const loadQR=async()=>{if(!_QR)try{const m=await import("qrcode");_QR=m.default||m}catch(e){};return _QR};
const loadJsQR=()=>new Promise(res=>{if(_jsQR)return res(_jsQR);if(window.jsQR)return res(_jsQR=window.jsQR);const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";s.onload=()=>{_jsQR=window.jsQR;res(_jsQR)};s.onerror=()=>res(null);document.head.appendChild(s)});
const scanQR=async(canvas)=>{const hasBD=typeof BarcodeDetector!=="undefined";if(hasBD){try{const det=new BarcodeDetector({formats:["qr_code"]});const codes=await det.detect(canvas);if(codes.length>0)return codes[0].rawValue}catch(e){}}const jq=_jsQR||await loadJsQR();if(!jq)return null;const ctx=canvas.getContext("2d",{willReadFrequently:true});const img=ctx.getImageData(0,0,canvas.width,canvas.height);const r=jq(img.data,img.width,img.height);return r?r.data:null};

const FKEYS = ["A","B","C","D","E"];
const CLARK_LOGO="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAAAzCAYAAACpKYWIAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGPCCb9cgai/r4leHFXCmpBYnA+kPQKxSBLScgYFRBMgWSYewNUDsJAjbBsQuLykoAbIDQOyikCBnIDsFyNZIR2InIbGTC4pA6nuAbJvcnNJkqL0gF/Ok5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKVRPz6hsXhXAAAf5ElEQVR4nO1deXxU1b3/nnOXuTOTBdxwQwVCQDbZCQKBsBR3qxZ9uNv6LL5qtdpan21t9fn0Y11wbWsVVxBRRIuoiEISEkJYZN93WUTZM/ty7/m9P+6dySQzdzIhk5D08c3nJJM7957zO8vvLL/tMiJCU7F2/Ubasm079uz5HocOH0EoFAIIAJl/jgfECGQ9zbmEYCCI/5jwUxQPK2L17501+3P68cABKLIMsz4EipVt1Y8R4a4770h69iSahjffnkqbt++EpjkBMlqkzFi/EgCHquD88zrilonX/7/sW7kpD8+YOYtWrFyDH344gEgkAmIcjHNwxgEATWlRYgASGNjv8yEYCKa8d/myb7F+0xY4XW6QIOt5BiICi00hRCgpGUVdu3T6t+johYuqaPoHHyPHnQMhBBhjIMYABjAwMOuz2QkMjHMY4TDuuPVG9Op5YdbaYN/3+7F16zY4XS6QENnKNi0oYWQREdau24zSsioaN7YYEydc26i6lVcuoq+/WQCX0wVdAGCszrglAJwBeiSEmyfegIKCLllru03bttM7700HCGDc4hlm9l2MCmb1ISPrmmReF3oY11139fEx8JR3p9KiRdXweAKQHA44VBUOl2I2bNMXdAvWEg6Acw5FVsCtStaH6tDgzMmDU9Pig6iWDLO7OcH2+baIed+U4sDhGnj8YRCZOw6O2OoEAML8wAACgXMOv8+P+fPL0KvnhVmjQ1YUKA4HFNURnzybF3XLYOboR9QQmPHxp9izdy899JtfZ8xkBw4dxao165GT1x7CoFimdctgDNFQAH6bBeR4MfnFV3H46DEosgMkGMCsxSfVzUTgIBAHAj4vbr35RlzUsxdrFAOXLaykD2d+ggOHjsLpciE3Pw9CCBARRBa24nYwB6h9/oIEyDAgDL3efQzm8CUkrMVtHitWraHtO3YhNzcHRHVXvdqxJyU9l9euHVat25BVWogIEASQSNtHzQUCAWSAcYZ27U9B9ZIVeOVvb9A9/3VnRkysyBya2w2nywXoem2+iU8zDplndwG494GHqcbjR26OyUP1Zw1GtVfIWoU5Y/D5anD7LTfi2quvYIA5aWeEv73xFr362pvw+ELIzcsDYwyGYcTPnK0TZs2tU3GTtvStCeXllTCM2Fm/bhJpEmcMXp8PU6d/2Fo77DhgjW4CDN1Afn47lFdUYt43ZZnVUcDcORgGiARELInaRFbKFh585I/046HDcDq1OA8RiTop8YdIgAHw1hzDT6+8PM68QIYM/JfHn6YF8xciJzcPkizDMFpGWJEdmIzLiKFLp/P/LXh41dp10FzORg8qEgSH5sTiJcuyS1AraVUGc6JyON34ZPacjJ+KTfMxsWlzzm6P/OUJ+m7vD3C73DAMPe29MVq4JMHn9eLyS8fjxht+Vqe1G2Tghx75C63fvAV5+fkQhgFqIUljXTQ0Quy/j8txWu0uoXF4670PyB8MQ2K80TUiEBRVxY8HDuPLr+b/ezRIHXAQAYrqwIFDRzBtxswG61h35PCkK9nEE08+Q1u37kCuKxeGbjRQlkm6JEnw1NRgzOiRuP3WiUkPpGXgh//0P7Rzzz7k5OVBNwwry4YraErSeL3EspBsS7SnpeFb2hSWLP8WmuY6boERCQFZVbGwcnFW6OFcAucymCSDc24mSar9zLl1T+3/Eq//fepk3lf3XmY/CGI1hBAGNE1DVfXSRtam+QbJM5NfpVXrNiInr5258rKGymOQuQK/x4vi4UWYdOdtKW+2FWI99dwLtHXHLuTm5UPXow2vgRaTCUGI6jrIsKSgcRz/hM85RygchK4f/zmk4Y5v/fjs86/o4KHDyM3NNwUuNlVilgotFYgImsOJnd/tQvXyFVQ0sH+TGibgD8Dj8cAwohCGkbbsOA0mkcl0o7ZKgiiu0onlxhmDLCtQVc089iYdISwpLhEURcWBg4dRVlFFo0ZcfEI7/+W/vU7Vy75Fbl4edEPPaJqQJBk+Tw0GD+yL+371S9tHUjLw9A8+pmXLVyE/vx2MFMwb/58YwE3GDUdCiIbDcDo1nNIuD7luN2QpJglt2m6NcY5AIIT8vJwm5dPWUVG5GIriSHP2ZSASMAwdsqyglo/qqV4IgAAWllegaGD/JtE0YtgQdOlyAWRZjpdHCXu1uNGFyY8gIFljUWeer1WlUMwSyMrI5/Nh77592LP3BwCAQ3NCCLsjnak3Xb16LUaNuLhJdWwKXn97GpVWViE/Lx+GYWTGvLIEn7cGF13UE7994N60jyQx8Ko16+izL+YiNzfPVljFYuoyLiEcDSESieCC88/FxUWD0KtHDxQWdG77y10rw+LqZfTd3r1wutym2iFFCxMRVEWCy+XG0aNeSHHLtLowyIDD6cS69ZuxbftOKmiCccu4sSUt3tcr1qyjj2Z+jB07dsNpGbIkQQgoigM7du1safLieH/6RzRv3gLkxbbNDYKZZ16PBz27F+KPv3+wwbZNOgO/N20GwKU0501AMAZICvxBLzqc1h533jYRzz75GLv2qivYSeZtHnxTWg4we5EF5xyBYBCDB/bDpP+8A7oeSZMbmbuaSATflFZkn9hmRv8+vdhTj/+ZDex3EcLBIBiXEhSGJgQASZZx5OgxbN66rcUFdtM/mkWfzJkLd24OKCPmBbgkw+/zok/Pbnj8Tw9nxEd1RsQbb71Hu/Z8D1Vzpp7VrGnftOrxomjwAEx+5kl2yU/GtlKmje3pWJs+Ay/7djWt3bAJmtNl0y/mttSpOTCqeDh6du/O+vTuiWAwmGR8EBvoQgg4XW4srl7eAjVoHvzuwV+zDmecimhUT9G/5iQVCkXw/ff7W5SuKe9MpZmz/gVXbsxIw37+iFEtSTJ83mMY0K83/vzIQxkP1njvbt+5ixYuqoY7xw1h6LCTkHBJhs/vxcgRQ/DAvXe3cq6InacSxSNtD/NLywFwW1syzjmCwRD69LoQ3boWMAAYN7oEEhgY1a23ebY0r8mMwR8I4O33prdZlVLRkIEIh4IgzuuZ6pi2dySAo0dqmliKZQyUgaXZu+9/SF98NR95+e3jK29aEyICuKygxleD/n174/cP3teogRpn4HnzSxEIhsDTrFScMwT8XvTp2R33TMrMVO0kmoZNW7bR+g0b4HRqtqsviCAxQsnIEfFLgwb0ZV0LOiEUCoLx1F1lCAHNqaF6adtdhc8773zIkhSXyySCMVMi7/f7s1JWQwN+xkef0GdzvkJubruMjZ24LMHrrUHfXhfikd/9ptE8FWfg5d+ugtNpt3U2oetRtMvPwaP//buTzNtCKC2rQCgcsT0CMMYRDofQtUsnDOp/UZ2bSkaNMNUWtmdngqzIOHzoCP41+8s2uQo7FBWc8ZSrY+ySrmd2Bm0I6Rro40/n0MxPPoM7LxeC9AbuNiFJErxeL3p3L8SjDx8fT3EA+PyLeVRTUwNZTqVVYgC4pYsN4eqrrzqeck4wWrO9dnosX7ESmtNdR3XEEhNj0HUDo0YVJz1bMnI4O+/ccxAJRywmjulkakHCgKo6sLByUXNWo9lw5MhhUz3DEjXGsVoygDFwOdmxo3GIGzWm/PazL76iGTM/gSs31+wnqqUgdV4Al2X4fB706NYFf/nj7497QeQAsGr1WkiSnOTZEgNjDJFwGJ3P74jLx41uk6tvW5RhTZ8xkzwer6ljTbgen44YQyQSxbnnnoUxI4enrOGokcMQiYQtBq47yAFzlVI1DXv27UfZwkVtbpZbu36DNYptSCeYnkbNhLlfL6Bp02fA5XJb+u6GmpBBkmQEvH5069IFjz/6SJNGJgeA3Xv2QVU1W5dAxjii0XCdM9ZJND8WVS+xjBXSTKyRIIqHF9nmceVl49kZp52KaDRqMXH9vDiIGJgko3RhZfaIbwGsWbuRVqxaC80Zc+xIwQsMOKV9+yaXlYrLFpQtorffmw6H5jZFZhkIuSSJw+/3oNMF5+CJx/7Q5GWFV1QuIq/fDy5JNpMYg6FHcEq7dri01aqL0sE8ArQ1KfTnc+fT/gNHoChKvZ1R3IoGuq7j1FPa4Zorr0hbuREXD0EkFADnsbaoBYOpgtI0JzZt3Y6Vq9e2iVV42/ad9M8pb5tRYJA8dIkBggw4VBlnn9khCyXyuIUZACysWkKvv/UuVIcGMGa7ewVqRx6XJPgDAZzf8Vw8/cSfszIg+Y5du2EIw3aLyTlDJBJGQUHnbJR3AsDa5BG4vKICqqra7oo44wiFAigaMqjBvCbecB1rl5djCnOS+tm0q2QMEIaBBWWt37Bjxsef0lPPvoAjHi9kRUm58jEwGLqO9u3z0ePCwqYxCwMMEYVhCcOqliyjf74+BbKigPEMV14uIRj045wzO+CZJx/L2moi7//xoKlmsCWCQQiBwsKu2SqzxZFWptAKsWjxUtq1ew9crtRmghwAGQI5LjfuuDnZxSwVBg8aiHkLyuHOyYWo4xJq9rsQBpxOF1avXY9tO3ZTQefzMsr31b//kzZu3gaHs9Y/2RzQ2WhwMr11rdXFMAwcO1YDfzAAp9Nl7k5sjxcckUgEBV2ys/AQGBYtXYbDnhqaOnUGGDdDPGXiFWYybwBndjgNk//6RFZHonzsWA0kLtkuUEQCkizj3HPPyWa5LQiKBwhrKygtLU+j+jED1AX8fgwbOjjjPEeXFKNicXXChMAAiDpGBkzi8Hn9KC9fiILON2eU75GjNfj+x4NwxWy0s4wEXwYwmIb+OTm5NlEyzDrFZdAMGDK44R1KgzQIAU1zoWrxUiysrIJTc4NL6Q07mOWHwWUJ/lAAp5/WHi8+81TWByIPBoOmHs3mBiEImubAgIt6ty0uiKNtkb1m3SbasGUrtDQ6eUEEWZFQUpKsOrJDl84XsH59eiEY8lvmlcntQkJAczqxdHnmhh2yLENVFCiK3CxJrfeXAWaYG1uKTF/0UCiEgs6dUDSoae6StSCoqga3Kw+MNSxtJgYwiSEYCuKUU/PwyvNPN8tA5HHPFhtLFiKCpqjNUXaLgVLoP1srFlYtQkQ3wGx0jpwzhEIhdOl8Afr06N6oShWPuNhy6bNXuciyikNHPZg956uMpQb143I1Z2qAEgDMlNvoEYz/ydjMGyfDegph2J82E+/lDLrQ0T7fjfsm3Z1VOhJhjhJiNuObQZCArCjNRkBLIH00j9aFVavWQNPcNs7qpjGBEAZGDh/W6LwH9OvLunbuhFAobMUhTuWTKKCqDiyqrj4O6k8EaiWUBAFJVuD1+FA0sB9GDhuS5V4XSFbDpQYHQyQYxsD+/dG9a/ZiSSeXE+tEm1mFWeG+2jJad+TMWsz4aBYdO+qBLEkp2pxZgpkozjn7LIwtKT6uQTFm1CjTWcVmziYh4HCo2PHdblRWL2n9jZagJpQUFT6fF+d1PAsP/Sa9I/xxlcS47c6oPkgQXK4clJZWYM7cec3WjjzuvJCyN8ky1cuOLemJRetfgiurlsDhdNnoFBkYkxGJhDFimL3hRkMYPWo463j2mYiGg2mFexI4StuASgkwd1iSJMNX40XHszvg+af/pxk6myEcjpjheW2cQ+qDiEGSNbw77QPMmfd1szAxVx0OCErt8ESwzlzBUHOUfRIJ+HLeAvrhwEEoqpr6rMcYdD2KU9rn47qr0xtuNIRRxcMRCYVsvZSEJczauGkb1m7YlHbgsXgQuxSB7OLXJXDJui8p4F1jAtalKJ8Buh6Bx3sUQwZe1CzMawrOdBR0uQCqIiEaNcB4ageKWlj6dQ5oTjfefW865s5bkHUmlvPz8rFn334oSL3J5Jwj6A9gcfVSGlo0uPUvY3Zo5ZSXV1RCVlSQMJCqJzgHgn4/xoxsenynq664lM2dN59q/EFzu24zYUR1HaVlC9G7R3fbvIJBP7xeD4Qu6sWnir0PI9bwzLoa+21JTpkAyNoCyxI0TUPM9iATfjYMgfy8HPzi2pswuji1PXhTwRlHOOzHhGuvBucMzzz3MvRIFIqqNKA6MwVvHAyaMxdTpr4PxhiNH5e9MERyh9PbY+36WMSxVPakDIKArdt3YmhR5nrH1obWzL9VS5fTzl27a+NdpYAwBFwuJ+5IERv4eDBs2BB8MvtLKDl5KWN9x1bhlatWp83nsvFjMWjgQEhcir9mx3R+F3HZA4lanWnt9zHJsjnmwuEwtu/chc1btoFJplqqocD1nHMEAn7cduMNzca8gCnjhVXW0MED2YP3/xe9/Oo/EAiFoTocDeq/TW07h1PLwZvvTgUk0PjR2WFi+byO59a+FCsV8ZYUesOmTdko78SAxX+1SiwoW5g2aoPEOfx+P4YWNd0oIYabbpjAFpRWUkSP+QsnjwBJ4vB6/Xh32od0602pX985ZHB2d2XLvl1F77w3HUeO1UBxqA1aOklcwZYtWzFuTOY68cYiLv+3jhwX9e7Jfvfg/fT8S3+Hx+OF5tRg6KkDDcZyINLBmARVc+Gtt6eCM4nGHacgMhG8c6dOcGkOCCN1pHgiAdWh4Lvde7Fy9fo2IJVMAYr/anVYv2ELbdiwOW0wBQGCLMkYMzK7g3TQwP4IBUO2L+0yLZDcWLyk5SJ2DBrQl73ywtMsL8cJPapbYTVS3xvbJVRUVWHF6jXN1sGm7zVHoiNIt65d2GsvP8tOPyUPgYAfkiyh7hhjSTkQCXDGoDhcmPLme/imrLLJNPOuXTuzDh1Oh54yMFiseAadgG8WlDa1vJOohwVlZYjqBhhL7XTOuWlV1L1bAfr0zt57fQFg9KgR0DTFPLum6HsiQJYlHDx0GP/6vGUjdlx//TWIRIKQGG9g7jWD18365LMWoCqZkJcmP8POPvN0+AI+SFIGgQOIwJkE1eHCG2++gwULK5rUrhwAevToBj0Std1KkUFwOd1YvmoVlq9c1TqXsgbQWqNSrly9Ou7PakehEAZGjRqe9bILCzqzi3r3tOJm2azCRFBUDRWVS7JefjqMLi5mfXv3hj8YAEvDGEQCmtONzVt3Yt7Xpc0zNilmqpg6+8l/fYoVdDwHPp83Aya2ttMcUBwaXp/ybpMCKXAAGDywPzSnEhcoJNNPYETgXMG0D2Ydb1knGK2Pgd+d9gF5vH7InIOQbN/LOEc4HEHnjh1RfHFRs1Rg7OgSKNzen5VIQHPI2L1nD8orF7fo5H3Dz66FQ5EhDIF0r/ESQkBxqJj9+RfNR0wDLm1P/e9j7MLCQvi8Hkhcso0gSvW207LDidfefAcVx9m2HAAKCwtY925dEQoGbb1gBAk4VBV7932PyS/9o22twq3UEGvxkmVwaK6UPr9mNzPoegTFxY03m8wUffv0ZIWFBVaAdJtVGOZbOMrKW9awo6DLBWzc6BIEA37bczpg7hJUVcWPBw/jnWkzTlhPP/7ow6x37x7w+mvApIYttogIjHFIioa/vf4WKqoab/kWL2XE8IthNKB7E0LA7c7BoiVL8f6HH7VClmg7mPv1Ajp06CgURUtpHM8AGHoU7dvl4/JLxjXr9mHYsKEQhrC1zDI90lzYtm0HNm3a0qL9futNE9jpp7SzQgLZNwMJAYcrB+UVJzY436MP/5Z1LyyAN6PtNMAMHRLn4IoD/5jyNlat39io9o0zcPGwoax71y4IhWJSSZstgDCQ487Bp7O/xJR33m8DTGwZC7SyHXR5xSLIqmrpYFM0oyQjGAph8KABzU7L2FHF7JyzOyAStQtfS2AMCEV0lFZUNTs99XHVFZchEg4k7BB4QrIoJIIkMXh8Abz62pQTOi6fePQPrG+vHvD4zPdTmbBxHmEMJAzIkvn9iy+9irUbN2dMf511/rqfXgUWV8DbwVTAO915mDvva/z58Sdp05aWf/dM5mh9pFUvW047dn0HVXXYnj0Nw4DLpaGkuGUCCY4cMRyRUNB2lRPCgOZ0Ytm3K1uEnkRcOn4M69G9K4LBQMLiknwuIsOAy+XGosVLsHZ9ehPQ5safHv4tG9K/D2o8NeByzJsvhYA49lcIKJKCSNTACy+8jPUZ7nTqMHC/vr1YycgR8Pk8kCTbVwdbBQK5OfnYvH0n/vfp5/DS31+nNesat/y3JFqTFNqMO2Xv4sg5RyjoR98+vdClU2ahbZqKa666jJ1xansYemwVTi5WkiTUeDx4/8NZLd7P1193DeT4u4dTMzAjBs4AQwAzP5nd0iQm4aEH7mPFQ4fAU1MDSYq1p33TCRJQFBWhiIFnX3wZGzY3zMRJXHrXL25lW7dso70/7IdDc8EQBrglgSMWk6KZhtq6AByaCyQMVCyqRvWSZTj7rLPo/PM74swOHZCXkwPGedzhq3FIGECMIaJHcelPGh+TmgAQYxBG65hbNmzaSus3bILmsH9RGRGgSBJGjxzZorRdXFSE2Z9/CVeeA5Ti1SBEAprmxKLFS3Dj9de2KG09e3RnI4uH01fzy5CbmwvSjXi8wjiYKadxOl1Yv3ELFpRV0OhRI07ozH3/Pb9kmuagrxeUITc33zQrBYEgwK0KJL6+SggBRVURCkXw/Auv4rf330vduxXY1iHlMnv3XT/HE08/g4iuQ5IVwHoxcW1j1f5nmroxuN05ICLs++EAdu3ZZ86UVrR8BoBT49ox0R+Wcw6fzwsSRJddMqZRGRHMN7tHolHcc99DJKkSSFB8RaZEgb9lY09EJhfFv2EJn8ztTnz5pFpKZc7g8/sxbnQJJt5wXUo6S8vLEY7oUFQppa0v5wzBYBA9uhWgb58eLTr4br7perZgYQVF9dRGPUQERVHx44GDmPvVN3TJ+JYNM3zXz29hK1avJq8vAIXLST7T8e2opTH512dfYPSoEx/LfNKdtzPN4aA5X85DTm47QBhx1XKqYDhCCDhUDYFgBM+98Ap+98C9VGgTFCAlA3fucgG7+5d30gsv/QOCSZA4Bxoy2La+VxUFDlVNkmg2Zf3jkulqpqrpt/X2MFvqqNdvhTxLoMZ2a13/el0zucSGj93JOYfP60MwFLal5NuVqy2nhdQ+1gwMMPQTNvAGDeiHBQsXIcedC0OkWoUJiuJAWUUVLhmf3ZA1meCaKy/HG2+9AyWnPcimDYkIikPB3v37Mf3DWTTx+mtP+Pnp9lsmMoem0axPZ8PlzjUt79IEmhBCh6qp8AcjeHbyK3jwgXupW4p3b9vubAcN6MfunvQLGEYIuq6Dm2H4bBXUJhiITLWDIQwIKyV+Pr4kYIiGhGsNQ5EkqLIEVZLjSZE4FIlDTUrM5jOHIjHInEGRWPyzzBlkSYIsK5Bs/GynTv+QPJ6YyV0K3S+TEA6Hcf5552LEsKEnZNCNLimGpqoQNk4Epm28Ezu+243FS5a1+Llk/NgS1uvC7qZAK80Lz4UQcLpz8fX8srT5pV7D6yFLPTFxwjXsxv+YgGDAB3ODGuOmVOUSDMNkYl8whOcmv4yt23cl3Zj2aDp86GB2/z2ToCocgVAQkiyn9ZqpL1zImv0EkfX6yIbKTg9hSdAFalNstyxSJrJS3etEVt0SP8Mc3ALmPalQVb0UmtNl+fwmIxYyZ8SI5jPcaAjduhaYLwcPhRIiT9RtdwYBxk5cxI7rJ1wHRY65v6YGESBzBT5fAC++Ym94RKgNAWvGu0rNTNnCNVdexn5+602IhPwwSJiO3gBipju1MHd5wtChqiq8gTCeff5l7Nj+XR1iGpQtDR7Qn7352svsvHPPhMdTAzCe1irmJFJjzhfz6MDBQ5AV2fZNAno0jDNOPxVXXjb+hG75xpSMBGcEisst6kk/hA6HpmHdps1Yu3Fri6/CF3brysaMHA6/3weJpzaWiEXRcLndqF72LVasXpeSztgcZe4t0zd7tuKLX/KTMWzSL26DHg1DCAOcy0i33JlnYgc8gQCemfxine8y5sS/PvkYu+KScTAiYQQCATDGwCUpQdiRWrTfcqhPR33UVz+kSnbPmPbgxDJ5PnX9Kyqr4HBo8a1T/cRljkgo1CqCJvTv25sVFnZBKByBxOX4i7KZ+QFgZmgcPaqjfOGJWYXvuO1mdsYZpyEajcbD8ST+cJgqpRi9n36a2luJM0vGIskpwgLVDQ+UTVVkycgR7NeT/hNC6IhGDciSnFymlSRuvpTO6XLCEwziV/c9FB9kjVpK77j1RvaHhx9A/749EY0E4fV6ENF1cxsgcTBu6TZt9IjNBo54BzDOrWRGcYzHW8okSbUJiYmz+D3gHJybsYcZZ2BcqpsklhT0rLS8irZs/w6MS4hEIohEo3WTHkUgGILT5cQtE392wgUugLkKRyJBRIwoolG9Hs06IqEIJMWB6qUt5ytcH9dcfRWCAS+iuo5oNIqobiUjiogRRUQ36ZZkGWs3bsTnc79Jml2DkShqPDXweb3wej3wer3wer3wxZPPul5j+idnEUOLBrEH750ESQKO1RyD3+eDz+c1k9cTTzF6PEePIhqOYve+/bj9rntozdp11Gixbo/uhaxH90Ks37SZKquqsX7DZhw6fAy6EYUECZLEwRgl6+iaCCGMJLVBDJFwCOGAF1y4akO3JGisTbCE3wlqqoQszR0joc7kY0a3N/V1iMV4qptLbGvFOUPYF0A0GqlD37q1a3DWWadD0zQIEmY+cTWWqeYKBgIoGtD8ZpOZYuSwIlZRUUHfHzgIVVXq2Gszy0eXSxL8Pi8+nT2HfnpV0wLtHQ/Gloxga9esoq3bd8GhajAgkLjrN3uHgzEgN9eJqsWLcfkldSXnhQWdMeGaq83dUTzmc0w5WztmdD2CoUUDs17H/v36st8/8Ctasmw51MSAhvXUriw+LgmQOMKhCLZt2wHWVMkuACxdvpK27tiBffv249DBIwgGQtApe/bHZmA9P265cQJKUrzIetqMmfTD/h/NIGNE4HHpHotv/8z/YMVDtpqDWawX+95qingg+Nh1azJi1ofYdg2wmJrHGJgjEoqgV48LMTzrQcVP4iSS8X9ot9t0P6r/ywAAAABJRU5ErkJggg==";
const FCOL = ["#0EA5E9","#10B981","#F59E0B","#8B5CF6","#EF4444"];
const WS_TYPES=[
  {key:"خياطة خارجي",icon:"🏭",color:"#8B5CF6",internal:false},
  {key:"خياطة داخلي",icon:"🏠",color:"#0EA5E9",internal:true},
  {key:"تطريز",icon:"🪡",color:"#F59E0B",internal:false},
  {key:"طباعة",icon:"🖨",color:"#EF4444",internal:false},
  {key:"تشطيب وتعبئة خارجي",icon:"👔",color:"#10B981",internal:false},
  {key:"مخصص",icon:"⚙️",color:"#64748B",internal:false},
];
function wsTypeInfo(type){
  /* Migrate old types */
  if(type==="خارجي")type="خياطة خارجي";if(type==="داخلي")type="خياطة داخلي";
  return WS_TYPES.find(t=>t.key===type)||WS_TYPES[0];
}
function wsIsInternal(type){return wsTypeInfo(type).internal}
const COLORS_DB = [
  {n:"ابيض",h:"#FFFFFF"},{n:"اسود",h:"#1a1a1a"},{n:"كحلي",h:"#1B2A4A"},{n:"رمادي",h:"#8B8B8B"},{n:"بيج",h:"#D4C5A9"},{n:"كريمي",h:"#FFF8DC"},
  {n:"احمر",h:"#C62828"},{n:"نبيتي",h:"#6A1B29"},{n:"برتقالي",h:"#E65100"},{n:"اصفر",h:"#F9A825"},{n:"زيتي",h:"#556B2F"},{n:"اخضر",h:"#2E7D32"},
  {n:"لبني",h:"#81D4FA"},{n:"سماوي",h:"#00ACC1"},{n:"ازرق",h:"#1565C0"},{n:"بنفسجي",h:"#6A1B9A"},{n:"موف",h:"#9C27B0"},{n:"روز",h:"#E91E63"},
  {n:"فوشيا",h:"#D81B60"},{n:"بني",h:"#5D4037"},{n:"كاكي",h:"#8D6E63"},{n:"منت",h:"#80CBC4"},{n:"مشمشي",h:"#FFAB91"},{n:"سلمون",h:"#EF9A9A"},
];

/* ── Theme System ── */
const THEMES = {
  light:{name:"فاتح",bg:"#EFF6FF",card:"rgba(255,255,255,0.9)",cardSolid:"#FFF",glass:"rgba(255,255,255,0.6)",brd:"rgba(148,163,184,0.2)",brdStrong:"rgba(148,163,184,0.4)",text:"#1E293B",textSec:"#64748B",textMut:"#94A3B8",accent:"#0EA5E9",accentBg:"#E0F2FE",ok:"#10B981",err:"#EF4444",warn:"#F59E0B",purple:"#8B5CF6",shadow:"0 2px 12px rgba(0,0,0,0.04)",sidebarBg:"#FFF",inputBg:"#FFF",bodyBg:"#EFF6FF"},
  dark:{name:"داكن",bg:"#0C0C0E",card:"rgba(22,22,26,0.95)",cardSolid:"#16161A",glass:"rgba(22,22,26,0.85)",brd:"rgba(255,255,255,0.07)",brdStrong:"rgba(255,255,255,0.12)",text:"#ECECEC",textSec:"#8B8B8B",textMut:"#555555",accent:"#3B82F6",accentBg:"rgba(59,130,246,0.1)",ok:"#10B981",err:"#EF4444",warn:"#F59E0B",purple:"#A78BFA",shadow:"0 2px 16px rgba(0,0,0,0.4)",sidebarBg:"#111113",inputBg:"#1E1E22",bodyBg:"#0C0C0E"},
  pink:{name:"بينك شيك",bg:"#FFF0F5",card:"rgba(255,255,255,0.95)",cardSolid:"#FFF5F8",glass:"rgba(255,240,245,0.7)",brd:"rgba(236,72,153,0.15)",brdStrong:"rgba(236,72,153,0.3)",text:"#4A1942",textSec:"#9D4E8C",textMut:"#C084A8",accent:"#DB2777",accentBg:"#FCE7F3",ok:"#059669",err:"#E11D48",warn:"#D97706",purple:"#A855F7",shadow:"0 2px 12px rgba(236,72,153,0.08)",sidebarBg:"#FFF5F8",inputBg:"#FFF",bodyBg:"#FFF0F5"}
};
let T = THEMES.light;

const DEFAULT_STATUSES = [
  {id:1,name:"تم القص",color:"#0EA5E9"},{id:2,name:"في التشغيل",color:"#F59E0B"},
  {id:3,name:"ملغي",color:"#EF4444"},{id:4,name:"في الغسيل",color:"#EC4899"},
  {id:5,name:"تشطيب وتعبئة",color:"#10B981"},{id:6,name:"تم الشحن",color:"#059669"},
  {id:7,name:"شحن جزئي",color:"#D97706"},{id:8,name:"تشغيل خارجي",color:"#8B5CF6"},
  {id:9,name:"في الطباعة",color:"#EF4444"},{id:10,name:"في التطريز",color:"#F59E0B"},
  {id:11,name:"تشطيب وتعبئة خارجي",color:"#14B8A6"},
];

const INIT_CONFIG = {
  fabrics:[{id:1,name:"قماش شعييرات مازيراتي",unit:"كيلو",price:170},{id:2,name:"قماش درببي مسحب ابيض",unit:"كيلو",price:170},{id:3,name:"قماش بسكوته تيشرت",unit:"كيلو",price:160},{id:4,name:"قماش كارس",unit:"متر",price:0},{id:5,name:"جبردين خفيف",unit:"متر",price:0}],
  accessories:[{id:1,name:"تشغيل من القص للتعبئة",unit:"قطعة",price:100},{id:2,name:"طباعة",unit:"قطعة",price:0},{id:3,name:"تطريز",unit:"قطعة",price:0},{id:4,name:"بادجات",unit:"قطعة",price:5},{id:5,name:"كباسين",unit:"قطعة",price:5},{id:6,name:"أستيك",unit:"قطعة",price:5},{id:7,name:"سوستة",unit:"قطعة",price:0},{id:8,name:"دوبار",unit:"قطعة",price:10},{id:9,name:"شماعة",unit:"قطعة",price:8},{id:10,name:"كفر",unit:"قطعة",price:3},{id:11,name:"كرتونة",unit:"قطعة",price:3},{id:12,name:"تكاليف أخرى",unit:"قطعة",price:10},{id:13,name:"تسويق",unit:"قطعة",price:10}],
  sizeSets:[{id:1,label:"6-9M - 9-12M - 12-18M"},{id:2,label:"2-3-4-5"},{id:3,label:"6-8-10-12"},{id:4,label:"M-L-XL-2XL"},{id:5,label:"L-XL-2XL-3XL"},{id:6,label:"FREE SIZE"},{id:7,label:"4-6-8-10-12"},{id:8,label:"S/L/M/XL"}],
  statusCards: DEFAULT_STATUSES,
  garmentTypes:[{id:1,name:"قميص"},{id:2,name:"شورت"},{id:3,name:"تيشيرت"},{id:4,name:"بنطلون"},{id:5,name:"شنطة"},{id:6,name:"جاكت"}],
  workshops:[{id:1,name:"CLARK",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:8,type:"خياطة داخلي"},{id:2,name:"ورشة محمود",owner:"محمود",phone:"",address:"",idCard:"",ownerPhoto:"",rating:7,type:"خياطة خارجي"},{id:3,name:"المصنع",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:9,type:"خياطة داخلي"}],
  seasons:["WS26"], activeSeason:"WS26", logo:"", users:{}, usersList:[], wsPayments:[], notifications:[],
  permissions:{
    admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit",custDeliver:"edit"},
    manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"edit"},
    sales_accountant:{dashboard:"view",details:"view",external:"hide",stock:"view",reports:"edit",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"edit"},
    purchase_accountant:{dashboard:"view",details:"view",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"hide"},
    viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide"}
  },
};

function gid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
/* Audio feedback for QR scanning */
const _audioCtx={c:null};
function playBeep(type){try{if(!_audioCtx.c)_audioCtx.c=new(window.AudioContext||window.webkitAudioContext)();const c=_audioCtx.c;if(c.state==="suspended")c.resume();const o=c.createOscillator();const g=c.createGain();o.connect(g);g.connect(c.destination);
  if(type==="ok"){o.frequency.value=880;g.gain.value=0.3;o.start();o.stop(c.currentTime+0.12)}
  else if(type==="dup"){o.frequency.value=220;o.type="square";g.gain.value=0.2;o.start();o.stop(c.currentTime+0.3)}
  else if(type==="error"){o.frequency.value=200;o.type="square";g.gain.value=0.4;o.start();o.stop(c.currentTime+0.5)}
  else{o.frequency.value=1200;g.gain.value=0.2;o.start();setTimeout(()=>{const o2=c.createOscillator();const g2=c.createGain();o2.connect(g2);g2.connect(c.destination);o2.frequency.value=1500;g2.gain.value=0.2;o2.start();o2.stop(c.currentTime+0.1)},150);o.stop(c.currentTime+0.1)}
}catch(e){}}
function fmt(n){return Number(n||0).toLocaleString("en-US")}
function r2(n){return Math.round((n||0)*100)/100}
function sqty(a){return(a||[]).reduce((s,c)=>s+(Number(c.qty)||0),0)}
function slay(a){return(a||[]).reduce((s,c)=>s+(Number(c.layers)||0),0)}
function setF(o,k,v){const c=JSON.parse(JSON.stringify(o));c[k]=v;return c}
function gf(o,k,s){return o["fabric"+k+(s||"")]}
const GARMENT_ICONS=["👕","👔","👗","👖","🩳","🧥","👚","🦺","👜","🎒","💼","🧢","🧦","🩲","🩱","👙","🧤","🧣","👘","🥼","🩴","👞","👟","👠","👡","👢","🥾","⛑️"];
function gIcon(name,list){if(list){const g=list.find(x=>x.name===name);if(g&&g.icon)return g.icon}if(!name)return"👕";const n=name.toLowerCase();if(n.includes("قميص")||n.includes("شيرت")||n.includes("بلوز"))return"👔";if(n.includes("تيشيرت")||n.includes("تي شيرت")||n.includes("t-shirt")||n.includes("بولو"))return"👕";if(n.includes("بنطلون")||n.includes("بنط")||n.includes("تراوزر"))return"👖";if(n.includes("شورت"))return"🩳";if(n.includes("جاكيت")||n.includes("جاكت")||n.includes("سويت"))return"🧥";if(n.includes("فستان"))return"👗";if(n.includes("شنطة")||n.includes("حقيبة")||n.includes("شنط"))return"👜";if(n.includes("كاب")||n.includes("طاقية")||n.includes("قبعة"))return"🧢";if(n.includes("جيلي")||n.includes("سديري"))return"🦺";if(n.includes("جوارب")||n.includes("شراب"))return"🧦";if(n.includes("ملابس داخلية")||n.includes("اندر"))return"🩲";return"👕"}
function gc(o,k){return o["colors"+k]||[]}
function gcons(o,k){return parseFloat(o["cons"+k])||0}
function gdate(o,k){return o["cutDate"+k]||""}
function useWin(){const[w,setW]=useState(typeof window!=="undefined"?window.innerWidth:1200);useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h)},[]);return w}
function getStatusColor(name,cards){const c=(cards||DEFAULT_STATUSES).find(s=>s.name===name);return c?c.color:"#94A3B8"}
function sortOrders(orders){return[...orders].filter(o=>o&&o.id).sort((a,b)=>(b.createdAt||b.date||"").localeCompare(a.createdAt||a.date||""))}

/* Smart status recompute based on data state */
function recomputeStatus(o){
  const t=calcOrder(o);const wds=o.workshopDeliveries||[];const dels=o.deliveries||[];
  const stockDel=dels.reduce((s,d)=>s+(Number(d.qty)||0),0);
  if(stockDel>=t.cutQty&&t.cutQty>0)return"تم الشحن";
  if(stockDel>0)return"شحن جزئي";
  const pieces=o.orderPieces||[];
  if(wds.length>0){
    let totalWsDel=0,totalWsRcv=0;
    wds.forEach(wd=>{totalWsDel+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{totalWsRcv+=(Number(r.qty)||0)})});
    /* Check if enough received back for تشطيب */
    let isFinishing=false;
    if(pieces.length>0){
      const allRcvd=pieces.every(p=>{const rcvP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return rcvP>0});
      if(allRcvd&&totalWsDel>0&&totalWsRcv>=totalWsDel*0.3)isFinishing=true
    } else {
      if(totalWsDel>0&&totalWsRcv>=totalWsDel*0.3)isFinishing=true
    }
    if(isFinishing)return"تشطيب وتعبئة";
    /* Determine status from last active (pending) workshop type */
    if(totalWsDel>0){
      const lastActive=wds.filter(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);return rcvd<(Number(wd.qty)||0)}).pop();
      if(lastActive&&lastActive.wsType){
        if(lastActive.wsType.includes("طباعة"))return"في الطباعة";
        if(lastActive.wsType.includes("تطريز"))return"في التطريز";
        if(lastActive.wsType.includes("تشطيب وتعبئة"))return"تشطيب وتعبئة خارجي";
      }
      return"في التشغيل"
    }
  }
  return"تم القص"
}

function compressImage(file,maxW,quality){
  return new Promise((resolve)=>{const reader=new FileReader();reader.onload=(e)=>{const img=new Image();img.onload=()=>{
    const canvas=document.createElement("canvas");let w=img.width,h=img.height;const max=maxW||300;
    if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max}}
    const tr=3/4,cr=w/h;let cw=w,ch=h,sx=0,sy=0;
    if(cr>tr){cw=Math.round(h*tr);sx=Math.round((w-cw)/2)}else{ch=Math.round(w/tr);sy=Math.round((h-ch)/2)}
    canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext("2d");
    const scX=img.width/w,scY=img.height/h;
    ctx.drawImage(img,sx*scX,sy*scY,cw*scX,ch*scY,0,0,cw,ch);
    resolve(canvas.toDataURL("image/jpeg",quality||0.5))};img.src=e.target.result};reader.readAsDataURL(file)})
}

function compressImg43(file,maxW,quality){
  return new Promise((resolve)=>{const reader=new FileReader();reader.onload=(e)=>{const img=new Image();img.onload=()=>{
    const canvas=document.createElement("canvas");let w=img.width,h=img.height;const max=maxW||400;
    if(w>max||h>max){if(w>h){h=Math.round(h*max/w);w=max}else{w=Math.round(w*max/h);h=max}}
    const tr=4/3,cr=w/h;let cw=w,ch=h,sx=0,sy=0;
    if(cr>tr){cw=Math.round(h*tr);sx=Math.round((w-cw)/2)}else{ch=Math.round(w/tr);sy=Math.round((h-ch)/2)}
    canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext("2d");
    const scX=img.width/w,scY=img.height/h;
    ctx.drawImage(img,sx*scX,sy*scY,cw*scX,ch*scY,0,0,cw,ch);
    resolve(canvas.toDataURL("image/jpeg",quality||0.5))};img.src=e.target.result};reader.readAsDataURL(file)})
}

/* Toast notification - no hooks */
function showToast(msg){const el=document.createElement("div");el.textContent=msg;el.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#10B981;color:#fff;padding:10px 28px;border-radius:10px;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.2);direction:rtl;animation:toastIn 0.3s ease";document.body.appendChild(el);const style=document.createElement("style");style.textContent="@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}";document.head.appendChild(style);setTimeout(()=>{el.style.opacity="0";el.style.transition="opacity 0.3s";setTimeout(()=>{el.remove();style.remove()},300)},2000)}

function highlightRow(id){setTimeout(()=>{const el=document.querySelector("[data-oid='"+id+"']");if(!el)return;el.style.transition="background 0.3s";el.style.background="#FEF3C7";setTimeout(()=>{el.style.background="";setTimeout(()=>el.style.transition="",500)},2000)},200)}

const PRINT_CSS="*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',Arial,sans-serif;padding:24px 28px;font-size:12px;direction:rtl;color:#1E293B;line-height:1.5}.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284C7;padding-bottom:12px;margin-bottom:20px}.hdr img{height:26px}.hdr-info{text-align:left;font-size:11px;color:#475569;font-weight:700}h2{font-size:15px;color:#0284C7;margin:14px 0 8px;padding-bottom:4px;border-bottom:2px solid #E2E8F0}h3{font-size:13px;color:#334155;margin:10px 0 6px}table{width:100%;border-collapse:collapse;margin:8px 0 14px;border:1px solid #94A3B8}th{background:linear-gradient(180deg,#E2E8F0,#CBD5E1);font-weight:800;font-size:10px;color:#1E293B;padding:5px 8px;text-align:right;border:1px solid #94A3B8;letter-spacing:0.3px}td{padding:4px 8px;text-align:right;border:1px solid #CBD5E1;font-size:11px}tr:nth-child(even){background:#F8FAFC}tr:hover{background:#EFF6FF}.info{font-weight:700;color:#0284C7}.ok{color:#10B981;font-weight:700}.err{color:#EF4444;font-weight:700}.warn{color:#F59E0B;font-weight:700}.sig{margin-top:40px;display:flex;justify-content:space-around;gap:20px}.sig-box{text-align:center;min-width:150px;border-top:2px solid #1E293B;padding-top:10px;font-weight:700;font-size:12px}.badge{display:inline-block;padding:2px 10px;border-radius:6px;font-size:10px;font-weight:700;margin:2px}.foot{margin-top:30px;padding-top:10px;border-top:1px solid #CBD5E1;text-align:center;font-size:9px;color:#94A3B8;font-weight:600}@media print{body{padding:12px}table{page-break-inside:auto}tr{page-break-inside:avoid}@page{margin:12mm;@bottom-center{content:counter(page)' / 'counter(pages)}}}";
function printPkgLabel(pkgNum,pkgDate,pkgNote,pkgItems,movements,status,createdBy,qrData){
  const pw=window.open("","_blank");if(!pw)return;
  const totalQ=pkgItems.reduce((s,it)=>s+(Number(it.qty)||0),0);
  const totalSeries=pkgItems.reduce((s,it)=>s+(Number(it.count)||0),0);
  const stLabel=status==="مغلقة"?"مغلقة ❌":status==="مباعة"?"مباعة 💰":"مفتوحة ✅";
  const stColor=status==="مغلقة"?"#EF4444":status==="مباعة"?"#8B5CF6":"#10B981";
  let itemRows="";pkgItems.forEach(it=>{itemRows+="<tr><td class='mn'>"+it.modelNo+"</td><td class='ds'>"+(it.desc||"")+"</td><td class='ct'>"+(it.count||"")+"</td><td class='qt'>"+it.qty+"</td></tr>"});
  let movRows="";(movements||[]).forEach(m=>{const icon=m.type==="add"?"📥":m.type==="remove"?"📤":m.type==="sell"?"💰":"📋";const color=m.type==="add"?"#10B981":m.type==="sell"?"#8B5CF6":"#EF4444";
    movRows+="<tr><td class='md'>"+m.date+"</td><td class='md' style='color:"+color+";font-weight:800'>"+icon+"</td><td class='md'>"+(m.modelNo||m.custName||"")+"</td><td class='md' style='font-weight:700'>"+(m.qty||"")+"</td><td class='md' style='color:#888'>"+(m.by||"")+"</td></tr>"});
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&display=swap' rel='stylesheet'/><style>"
  +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;color:#000}"
  +".pg{width:10cm;min-height:15cm;padding:3mm;display:flex;flex-direction:column}"
  +".brand{text-align:center;font-size:11pt;font-weight:900;letter-spacing:3px;padding:1.5mm 0;border-bottom:2px solid #000}"
  +".top{display:flex;align-items:center;gap:3mm;padding:2mm 0;border-bottom:1px solid #999}"
  +".top canvas{flex-shrink:0}.top-info{flex:1;text-align:center}"
  +".pn{font-size:16pt;font-weight:900;color:#0EA5E9}.pd{font-size:8pt;color:#555}.ps{font-size:8pt;font-weight:700;display:inline-block;padding:1px 6px;border-radius:4px}"
  +"table{width:100%;border-collapse:collapse}th{background:#E2E8F0;font-weight:800;font-size:7pt;padding:1.5mm 2mm;border:1px solid #94A3B8;text-align:right}"
  +"td{padding:1.5mm 2mm;border:1px solid #CBD5E1;font-size:8pt}.mn{font-weight:800;font-size:9pt}.ds{font-size:7pt;color:#444}.ct{text-align:center;font-size:8pt}.qt{text-align:center;font-weight:800;font-size:10pt;color:#0EA5E9}"
  +".tot td{background:#EFF6FF;font-weight:800;font-size:9pt}"
  +".sec{font-size:7pt;font-weight:800;color:#475569;margin:2mm 0 1mm;padding-bottom:1mm;border-bottom:1px solid #E2E8F0}"
  +".md{padding:1mm 2mm;font-size:6.5pt;border:1px solid #E2E8F0}"
  +".ft{margin-top:auto;padding-top:1.5mm;border-top:1px solid #000;display:flex;justify-content:space-between;font-size:6pt;color:#888;font-weight:600}"
  +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc}"
  +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
  +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
  +"</style></head><body>"
  +"<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨</button></div>"
  +"<div class='pg'>"
  +"<div class='brand'>CLARK</div>"
  +"<div class='top'><canvas id='qr'></canvas><div class='top-info'><div class='pn'>📦 "+pkgNum+"</div><div class='pd'>"+pkgDate+(pkgNote?" — "+pkgNote:"")+"</div><div class='ps' style='background:"+stColor+"15;color:"+stColor+"'>"+stLabel+"</div></div></div>"
  +"<div class='sec'>محتويات الكرتونة</div>"
  +"<table><thead><tr><th>الموديل</th><th>الوصف</th><th>سيري</th><th>الكمية</th></tr></thead><tbody>"
  +itemRows
  +"<tr class='tot'><td colspan='2'>الاجمالي</td><td class='ct'>"+totalSeries+"</td><td class='qt' style='font-size:11pt'>"+totalQ+"</td></tr></tbody></table>"
  +(movRows?"<div class='sec'>سجل الحركات</div><table><thead><tr><th>التاريخ</th><th>النوع</th><th>التفاصيل</th><th>الكمية</th><th>بواسطة</th></tr></thead><tbody>"+movRows+"</tbody></table>":"")
  +"<div class='ft'><span>"+(createdBy?"التعبئة: "+createdBy:"")+"</span><span>CLARK Factory Management</span></div>"
  +"</div>"
  +"<script>QRCode.toCanvas(document.getElementById('qr'),'"+qrData.replace("'","\\'")+"',{width:120,margin:1},()=>{});setTimeout(()=>window.print(),800)</"+"script></body></html>");
  pw.document.close()}
function printPage(title,bodyHtml){const pw=window.open("","_blank");if(!pw)return;const today=new Date().toLocaleDateString("ar-EG");pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>"+title+"</title><style>"+PRINT_CSS+".pbar{position:sticky;top:0;background:#fff;padding:8px 16px;border-bottom:2px solid #E2E8F0;display:none;justify-content:center;gap:10px;z-index:999}.pbar button{padding:8px 22px;border-radius:8px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700}.pb-back{background:#F1F5F9;color:#475569}.pb-print{background:#0EA5E9;color:#fff}@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}</style></head><body><div class='pbar'><button class='pb-back' onclick='window.close()'>↩ رجوع</button><button class='pb-print' onclick='window.print()'>🖨 طباعة</button></div><div class='hdr'><div><img src='"+CLARK_LOGO+"'/></div><div class='hdr-info'>"+title+"<br/>"+today+"</div></div>"+bodyHtml+"<div class='foot'>CLARK Factory Management — "+today+"</div></body></html>");pw.document.close();if(window.innerWidth>1024)setTimeout(()=>{pw.focus();pw.print()},500)}

async function exportExcel(rows,fileName){const X=await loadXLSX();if(!X){alert("مكتبة Excel غير متوفرة");return}const ws=X.utils.aoa_to_sheet(rows);ws["!cols"]=rows[0].map(()=>({wch:18}));const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,"Sheet1");X.writeFile(wb,fileName+".xlsx")}

function QRImg({text,size}){const[src,setSrc]=useState("");useEffect(()=>{if(!text)return;loadQR().then(QR=>{if(QR)QR.toDataURL(text,{width:size||120,margin:1,errorCorrectionLevel:"L",color:{dark:"#1E293B",light:"#FFFFFF"}}).then(setSrc).catch(()=>{})}).catch(()=>{})},[text,size]);return src?<img src={src} alt="QR" style={{width:size||120,height:size||120,borderRadius:8,border:"1px solid #E2E8F0"}}/>:null}

function QRScanner({onScan,onClose}){
  const videoRef=useRef(null);
  const canvasRef=useRef(null);
  const streamRef=useRef(null);
  const[err,setErr]=useState("");
  const[scanning,setScanning]=useState(true);
  useEffect(()=>{
    let active=true;
    const startCam=async()=>{
      try{
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640},height:{ideal:480}}});
        if(!active){stream.getTracks().forEach(t=>t.stop());return}
        streamRef.current=stream;
        if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play()}
        /* Scan loop */
        loadJsQR();
        const scan=async()=>{
          if(!active||!videoRef.current||!canvasRef.current)return;
          const v=videoRef.current;const c=canvasRef.current;
          if(v.readyState>=2){
            c.width=v.videoWidth;c.height=v.videoHeight;
            c.getContext("2d").drawImage(v,0,0);
            const qrResult=await scanQR(c);if(qrResult&&active){active=false;onScan(qrResult);return}
          }
          if(active)requestAnimationFrame(scan)
        };
        setTimeout(scan,500)
      }catch(e){setErr("لا يمكن فتح الكاميرا — تأكد من السماح بالوصول")}
    };
    startCam();
    return()=>{active=false;if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop())}
  },[]);
  const stop=()=>{if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());onClose()};
  return<div style={{position:"fixed",inset:0,background:"#000",zIndex:99999,display:"flex",flexDirection:"column"}}>
    <div style={{padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(0,0,0,0.8)"}}>
      <span style={{color:"#fff",fontWeight:700,fontSize:16}}>📷 مسح QR Code</span>
      <button onClick={stop} style={{background:"#EF4444",color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✕ اغلاق</button>
    </div>
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
      {err?<div style={{color:"#fff",textAlign:"center",padding:20}}><div style={{fontSize:40,marginBottom:12}}>📷</div><div style={{fontSize:16}}>{err}</div></div>
      :<>
        <video ref={videoRef} playsInline muted style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        <canvas ref={canvasRef} style={{display:"none"}}/>
        <div style={{position:"absolute",top:"20%",left:"50%",transform:"translate(-50%,-50%)",width:220,height:220,border:"3px solid #10B981",borderRadius:16,boxShadow:"0 0 0 9999px rgba(0,0,0,0.4)"}}/>
        <div style={{position:"absolute",top:"38%",left:"50%",transform:"translateX(-50%)",color:"#fff",fontSize:14,fontWeight:600,background:"rgba(0,0,0,0.6)",padding:"8px 20px",borderRadius:10}}>وجّه الكاميرا على كود QR</div>
      </>}
    </div>
  </div>
}

function Timeline({events}){if(!events||events.length===0)return null;return<div style={{overflowX:"auto",padding:"8px 0"}}>
  <div style={{display:"flex",alignItems:"flex-start",minWidth:events.length*130,position:"relative"}}>
    {/* Continuous line */}
    <div style={{position:"absolute",top:28,right:events.length>1?"calc(50% / "+events.length+")":"0",left:events.length>1?"calc(50% / "+events.length+")":"0",height:2,background:T.brd}}/>
    {events.map((e,i)=><div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",position:"relative",minWidth:110}}>
      <div style={{fontSize:FS-2,fontWeight:700,color:e.color||T.accent,textAlign:"center",marginBottom:6,maxWidth:110,lineHeight:1.3}}>{e.title}</div>
      <div style={{width:14,height:14,borderRadius:7,background:e.color||T.accent,border:"3px solid "+T.cardSolid,boxShadow:"0 0 0 2px "+(e.color||T.accent),zIndex:1}}/>
      <div style={{fontSize:FS-3,color:T.textSec,marginTop:6,textAlign:"center"}}>{e.date}</div>
      {e.detail&&<div style={{fontSize:FS-3,color:T.textMut,textAlign:"center",marginTop:1}}>{e.detail}</div>}
    </div>)}
  </div>
</div>}

async function printReceipt(wsName,wsOwner,order,garmentType,qty,date,balance,gtList,_returnHtml){
  if(!order){if(_returnHtml)return"";return;}
  const t=calcOrder(order);
  /* Fallback: find wsName from order's workshopDeliveries if not passed */
  let ws=wsName||"";let wdIdx=0;
  if(order.workshopDeliveries){const idx=order.workshopDeliveries.findIndex(w=>w.wsName===(wsName||ws)&&(!garmentType||w.garmentType===garmentType));if(idx>=0)wdIdx=idx;if(!ws){const wd=order.workshopDeliveries[idx>=0?idx:order.workshopDeliveries.length-1];if(wd)ws=wd.wsName||""}}
  let wsO=wsOwner||"";
  if(!wsO&&order.workshopDeliveries){const wd=order.workshopDeliveries.find(w=>w.wsName===ws);if(wd)wsO=wd.wsOwner||""}
  const gi=n=>gIcon(n,gtList);
  /* Generate receipt */
  const modelNo=order.modelNo||"";const modelDesc=order.modelDesc||"";const sizeLabel=order.sizeLabel||"";const marker=order.marker||"";
  let h="<h2>اذن تسليم ورشة</h2>";
  /* Order info table */
  h+="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  h+="<div style='flex:1'><table>";
  h+="<tr><th>رقم الموديل</th><td><b>"+modelNo+"</b></td><th>الوصف</th><td>"+modelDesc+"</td></tr>";
  h+="<tr><th>المقاسات</th><td>"+sizeLabel+"</td><th>كمية القص</th><td><b>"+t.cutQty+"</b></td></tr>";
  h+="<tr><th>الورشة</th><td><b style='color:#8B5CF6'>"+ws+"</b>"+(wsO?" — "+wsO:"")+"</td><th>التاريخ</th><td>"+(date||"")+"</td></tr>";
  if(garmentType)h+="<tr><th>القطعة المسلمة</th><td><b style='color:#8B5CF6'>"+gi(garmentType)+" "+garmentType+"</b></td><th>الكمية المسلمة</th><td><b style='color:#0284C7;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  else h+="<tr><th>الكمية المسلمة</th><td colspan='3'><b style='color:#0284C7;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  if(marker)h+="<tr><th>ماركر</th><td colspan='3'>"+marker+"</td></tr>";
  h+="</table></div></div>";
  /* Fabric details - only fabrics assigned to this garment piece */
  const activeFabs=FKEYS.filter(k=>gf(order,k));
  const fabsForPiece=activeFabs.filter(k=>{if(!garmentType)return true;const fp=order["fabricPieces"+k]||[];return fp.length===0||fp.includes(garmentType)});
  fabsForPiece.forEach(k=>{const colors=gc(order,k);if(colors.length===0)return;
    const label=gf(order,k,"Label")||("خامة "+k);const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
    h+="<h2 style='font-size:13px;margin:14px 0 4px'>"+(garmentType?""+gi(garmentType)+" "+garmentType+" — "+label:label)+"</h2>";
    h+="<div style='border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:8px'>";
    if(cons)h+="<div style='background:#f1f5f9;padding:5px 12px;font-size:11px;color:#475569'>استهلاك/راق: <b>"+cons+" "+unit+"</b></div>";
    h+="<table style='margin:0'><tr><th>اللون</th><th>الراقات</th><th>قطع/راق</th><th>اجمالي القطع</th></tr>";
    let tL=0,tQ=0;colors.forEach(c=>{const ly=Number(c.layers)||0;const pp=Number(c.pcsPerLayer)||0;const q=ly*pp;tL+=ly;tQ+=q;
      h+="<tr><td>"+(c.color||"-")+"</td><td style='font-weight:700'>"+ly+"</td><td>"+pp+"</td><td style='font-weight:700;color:#0284C7'>"+q+"</td></tr>"});
    h+="<tr style='background:#f8fafc;font-weight:800'><td>الاجمالي</td><td>"+tL+"</td><td></td><td style='color:#0284C7'>"+tQ+"</td></tr>";
    h+="</table></div>"});
  if(balance>0)h+="<p style='margin:12px 0;color:#EF4444;font-weight:700'>الرصيد المتبقي: "+balance+" قطعة</p>";
  /* Receipt statement */
  h+="<div style='margin:20px 0;padding:16px;border:2px solid #CBD5E1;border-radius:10px;background:#F8FAFC;font-size:13px;line-height:2;text-align:center'>";
  h+="اقر أنا الموقع أدناه بأنني استلمت هذه البضاعة المذكورة عاليه وأتعهد بسداد قيمتها وقت طلبها. وأعتبر مسؤلاً مسئولية كاملة في حالة تبديد هذه البضاعة أو تلفها. وهذا اقرار مني بذلك</div>";
  /* Signatures */
  h+="<div class='sig'><div class='sig-box'>توقيع صاحب الورشة<br/><span style='font-size:11px;color:#8B5CF6'>"+ws+"</span></div><div class='sig-box'>مسؤول القص والتسليم</div></div>";
  if(_returnHtml)return h;
  printPage("اذن تسليم ورشة — "+modelNo,h)
}

function getOrderDetails(o,t){
  return["*CLARK — تفاصيل أوردر*","","• رقم الموديل: *"+o.modelNo+"*","• الوصف: "+o.modelDesc,"• المقاسات: "+(o.sizeLabel||"-"),"• كمية القص: *"+(t?.cutQty||0)+"*","• الحالة: "+o.status,"• مخزن جاهز: *"+(o.deliveredQty||0)+"*"].join("\n")
}
function getOrderTimeline(o,t){
  const evs=[];
  if(o.date)evs.push({d:o.date,t:"✂️ تم القص ("+(t?.cutQty||0)+" قطعة)"});
  (o.workshopDeliveries||[]).forEach(wd=>{evs.push({d:wd.date,t:"📦 تسليم "+wd.wsName+" — "+(wd.garmentType||"عام")+" ("+wd.qty+")"});
    (wd.receives||[]).forEach(r=>{if(r.isSettlement)evs.push({d:r.date,t:"⚖️ تسوية "+wd.wsName+" ("+r.qty+")"});
      else evs.push({d:r.date,t:"↙ استلام "+(wd.garmentType||"")+" من "+wd.wsName+" ("+r.qty+")"})})});
  (o.deliveries||[]).forEach(d=>{evs.push({d:d.date,t:"📦 مخزن جاهز ("+d.qty+")"})});
  (o.customerDeliveries||[]).forEach(d=>{evs.push({d:d.date,t:"🚚 تسليم "+(d.custName||"عميل")+" ("+d.qty+")"})});
  if(o.settlement)evs.push({d:o.settlement.date,t:"⚖️ تسوية وغلق ("+o.settlement.qty+" هالك)"});
  evs.sort((a,b)=>(a.d||"").localeCompare(b.d||""));
  if(evs.length===0)return null;
  const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
  const custDel=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
  const remain=stockDel-custDel;
  const lines=["","─────────────────","*📋 تايم لاين:*",...evs.map(e=>e.d+" │ "+e.t),"─────────────────","📦 *رصيد المخزن الجاهز: "+remain+" قطعة*"];
  return lines.join("\n")
}
async function printLabel(wsName,order,garmentType,qty,date,gtList,opts){
  if(!order)return;
  const t=calcOrder(order);
  const type=(opts?.type)||"deliver";const rcvDate=opts?.rcvDate||"";const delDate=opts?.delDate||date||"";const rcvQty=opts?.rcvQty||0;const delQty=opts?.delQty||qty;
  const isRcv=type==="receive";const title=isRcv?"استلام مصنع":"تسليم ورشة";const arrow=isRcv?"↙":"↗";
  const d={title,arrow,qrSrc:"",piece:garmentType||"عام",qty:isRcv?rcvQty:delQty,modelNo:order.modelNo||"",modelDesc:order.modelDesc||"",sizeLabel:order.sizeLabel||"",wsName,cutQty:t.cutQty,delQty,delDate,rcvQty,rcvDate,isRcv};
  /* Store data and trigger popup event */
  window.__labelData=d;window.dispatchEvent(new Event("show-label-popup"))
}
function renderLabelPages(d,n){
  const pw=window.open("","_blank");if(!pw)return;
  pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@600;800&display=swap' rel='stylesheet'/><title>"+d.title+"</title><style>"
  +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;color:#000}"
  +".pg{width:10cm;min-height:15cm;padding:4mm;display:flex;flex-direction:column;page-break-after:always;overflow:hidden}.pg:last-child{page-break-after:auto}"
  +".brand{text-align:center;font-size:10pt;font-weight:800;letter-spacing:2px;color:#555;padding-bottom:1mm;border-bottom:2px solid #000;margin-bottom:2mm}"
  +".tp{text-align:center;font-size:11pt;font-weight:800;border:2.5px solid #000;display:block;width:fit-content;padding:1mm 6mm;border-radius:4px;margin:0 auto 2mm}"
  +".big{text-align:center;padding:2mm;border:2.5px solid #000;border-radius:6px;margin-bottom:2mm}.big .pc{font-size:13pt;font-weight:800}.big .qt{font-size:18pt;font-weight:800}"
  +"table{width:100%;border-collapse:collapse;margin-bottom:2mm}td{padding:1mm 3mm;font-size:9pt;font-weight:700;border:1px solid #000}td.k{font-weight:800;width:35%}"
  +".mv{border:2px solid #000;border-radius:4px;overflow:hidden;margin-bottom:2mm}.mvr{display:flex;justify-content:space-between;padding:1.5mm 3mm;font-size:9pt;font-weight:800;border-bottom:1px solid #000}.mvr:last-child{border-bottom:none}"
  +".bot{display:flex;align-items:center;justify-content:center;gap:5mm;margin-top:auto;padding-top:2mm}.bot img{width:22mm;height:22mm}"
  +".bags{font-size:26pt;font-weight:800;border:3px solid #000;border-radius:8px;padding:1mm 5mm;line-height:1}"
  +".foot{text-align:center;font-size:7pt;color:#555;padding-top:1mm;border-top:1px dashed #000;margin-top:2mm}"
  +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc;z-index:99}"
  +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
  +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
  +"</style></head><body>");
  let h="<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨 "+n+"</button></div>";
  for(let i=1;i<=n;i++){h+="<div class='pg'><div class='brand'>CLARK Factory</div><div class='tp'>"+d.arrow+" "+d.title+"</div>"
    +"<div class='big'><div class='pc'>"+d.piece+"</div><div class='qt'>"+d.qty+" قطعة</div></div>"
    +"<table><tr><td class='k'>الموديل</td><td>"+d.modelNo+"</td></tr><tr><td class='k'>الوصف</td><td>"+d.modelDesc+"</td></tr><tr><td class='k'>المقاسات</td><td>"+d.sizeLabel+"</td></tr><tr><td class='k'>الورشة</td><td>"+d.wsName+"</td></tr><tr><td class='k'>القص</td><td>"+d.cutQty+"</td></tr></table>"
    +"<div class='mv'><div class='mvr'><span>↗ تسليم</span><span>"+d.delQty+"</span><span>"+d.delDate+"</span></div>"
    +(d.isRcv?"<div class='mvr'><span>↙ استلام</span><span>"+d.rcvQty+"</span><span>"+d.rcvDate+"</span></div>":"")+"</div>"
    +"<div class='bot'>"+(n>1?"<div class='bags'>"+i+"/"+n+"</div>":"")+"</div>"
    +"<div class='foot'>"+d.modelNo+" | "+d.piece+" | "+d.wsName+"</div></div>"}
  pw.document.write(h+"</body></html>");pw.document.close();
  if(window.innerWidth>1024)setTimeout(()=>{pw.focus();pw.print()},500)
}

async function printReceiveReceipt(wsName,order,garmentType,qty,date,balance,gtList,_returnHtml){
  if(!order){if(_returnHtml)return"";printPage("اذن استلام مصنع","<p>بيانات غير متوفرة</p>");return}
  const t=calcOrder(order);const gi=n=>gIcon(n,gtList);
  let ws=wsName||"";
  if(!ws&&order.workshopDeliveries){const wd=order.workshopDeliveries.find(w=>w.garmentType===garmentType)||order.workshopDeliveries[order.workshopDeliveries.length-1];if(wd)ws=wd.wsName||""}
  const modelNo=order.modelNo||"";const modelDesc=order.modelDesc||"";const sizeLabel=order.sizeLabel||"";const marker=order.marker||"";
  /* Generate workshop QR */
  let wsQrSrc="";try{const QR=await loadQR();if(QR&&ws)wsQrSrc=await QR.toDataURL(window.location.origin+"?act=wsacc&ws="+encodeURIComponent(ws),{width:130,margin:1,errorCorrectionLevel:"L"})}catch(e){}
  let h="<h2>اذن استلام مصنع</h2>";
  h+="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  h+="<div style='flex:1'><table>";
  h+="<tr><th>رقم الموديل</th><td><b>"+modelNo+"</b></td><th>الوصف</th><td>"+modelDesc+"</td></tr>";
  h+="<tr><th>المقاسات</th><td>"+sizeLabel+"</td><th>كمية القص</th><td><b>"+t.cutQty+"</b></td></tr>";
  h+="<tr><th>الورشة</th><td><b style='color:#8B5CF6'>"+ws+"</b></td><th>التاريخ</th><td>"+(date||"")+"</td></tr>";
  if(garmentType)h+="<tr><th>القطعة</th><td><b style='color:#8B5CF6'>"+gi(garmentType)+" "+garmentType+"</b></td><th>الكمية المستلمة</th><td><b style='color:#10B981;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  else h+="<tr><th>الكمية المستلمة</th><td colspan='3'><b style='color:#10B981;font-size:16px'>"+qty+"</b> قطعة</td></tr>";
  if(marker)h+="<tr><th>ماركر</th><td colspan='3'>"+marker+"</td></tr>";
  h+="</table></div></div>";
  /* Fabric details */
  const activeFabs=FKEYS.filter(k=>gf(order,k));
  const fabsForPiece=activeFabs.filter(k=>{if(!garmentType)return true;const fp=order["fabricPieces"+k]||[];return fp.length===0||fp.includes(garmentType)});
  fabsForPiece.forEach(k=>{const colors=gc(order,k);if(colors.length===0)return;
    const label=gf(order,k,"Label")||("خامة "+k);const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
    h+="<h2 style='font-size:13px;margin:14px 0 4px'>"+(garmentType?""+gi(garmentType)+" "+garmentType+" — "+label:label)+"</h2>";
    h+="<div style='border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:8px'>";
    if(cons)h+="<div style='background:#f1f5f9;padding:5px 12px;font-size:11px;color:#475569'>استهلاك/راق: <b>"+cons+" "+unit+"</b></div>";
    h+="<table style='margin:0'><tr><th>اللون</th><th>الراقات</th><th>قطع/راق</th><th>اجمالي القطع</th></tr>";
    let tL=0,tQ=0;colors.forEach(c=>{const ly=Number(c.layers)||0;const pp=Number(c.pcsPerLayer)||0;const q=ly*pp;tL+=ly;tQ+=q;
      h+="<tr><td>"+(c.color||"-")+"</td><td style='font-weight:700'>"+ly+"</td><td>"+pp+"</td><td style='font-weight:700;color:#0284C7'>"+q+"</td></tr>"});
    h+="<tr style='background:#f8fafc;font-weight:800'><td>الاجمالي</td><td>"+tL+"</td><td></td><td style='color:#0284C7'>"+tQ+"</td></tr>";
    h+="</table></div>"});
  /* Balance - calculate from actual order data */
  let realBal=0;
  if(order.workshopDeliveries){const wds=(order.workshopDeliveries||[]).filter(wd=>wd.wsName===ws&&(!garmentType||wd.garmentType===garmentType||!wd.garmentType));
    wds.forEach(wd=>{const del=Number(wd.qty)||0;const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);realBal+=del-rcvd})}
  if(realBal>0)h+="<div style='margin:16px 0;padding:12px 20px;background:#FEF2F2;border:2px solid #FECACA;border-radius:10px;text-align:center;font-size:16px;font-weight:800;color:#EF4444'>الرصيد الباقي عند الورشة: "+realBal+" قطعة</div>";
  else h+="<div style='margin:16px 0;padding:12px 20px;background:#F0FDF4;border:2px solid #BBF7D0;border-radius:10px;text-align:center;font-size:16px;font-weight:800;color:#10B981'>✓ تم استلام الكمية كاملة</div>";
  /* Workshop QR + Signature */
  if(wsQrSrc)h+="<div style='display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px'><div style='text-align:center;width:200px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px'>توقيع المستلم</div></div><div style='text-align:center'><img src='"+wsQrSrc+"' style='width:94px;height:94px'/><div style='font-size:8px;color:#94A3B8;margin-top:2px'>كشف حساب "+ws+"</div></div></div>";
  else h+="<div style='margin-top:50px;text-align:center;width:200px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:13px'>توقيع المستلم</div></div>";
  if(_returnHtml)return h;
  printPage("اذن استلام مصنع — "+modelNo,h)
}

function compressFile(file){
  return new Promise((resolve)=>{
    if(file.size>1000000){resolve(null);return}
    const reader=new FileReader();reader.onload=(e)=>resolve({name:file.name,type:file.type,data:e.target.result,size:file.size});reader.readAsDataURL(file)
  })
}

function calcOrder(o){
  const mainCut=sqty(gc(o,"A"))||o.cutQty||0;let totalFab=0;const fp=[];
  FKEYS.forEach(k=>{if(!gf(o,k))return;const cost=gcons(o,k)*(gf(o,k,"Price")||0)*slay(gc(o,k));totalFab+=cost;fp.push(mainCut?r2(cost/mainCut):0)});
  const fabPer=fp.reduce((s,v)=>s+v,0);const accPer=(o.accItems||[]).reduce((s,a)=>s+(a.price||0),0);
  return{cutQty:mainCut,totalFab,fabPer:r2(fabPer),accPer,accAll:accPer*mainCut,costPer:r2(fabPer+accPer),costAll:r2(totalFab+accPer*mainCut),balance:mainCut-(o.deliveredQty||0)}
}

const QUALITY_MAP={"ممتاز":10,"جيد جداً":8,"جيد":6,"مقبول":4,"سئ":2};
function calcWsRating(wsName,orders){
  let totalDel=0,totalRcv=0;
  const qScores=[],tScores=[];
  orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{
    const delDate=new Date(wd.date);const qty=Number(wd.qty)||0;
    totalDel+=qty;
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    totalRcv+=rcvd;
    (wd.receives||[]).forEach(r=>{
      /* Quality score */
      qScores.push(QUALITY_MAP[r.quality]||6);
      /* Time score: ideal = qty/500 * 6.5 days */
      const rcvDate=new Date(r.date);
      const days=Math.max(1,Math.floor((rcvDate-delDate)/(1000*60*60*24)));
      const idealDays=Math.max(3,Math.round((qty/500)*6.5));
      if(days<=idealDays)tScores.push(10);
      else if(days<=idealDays*1.3)tScores.push(8);
      else if(days<=idealDays*1.6)tScores.push(6);
      else if(days<=idealDays*2)tScores.push(4);
      else tScores.push(2);
    })})});
  if(qScores.length===0)return null;
  /* 1. Quality avg (40%) */
  const avgQ=qScores.reduce((s,v)=>s+v,0)/qScores.length;
  /* 2. Time avg (25%) */
  const avgT=tScores.length>0?tScores.reduce((s,v)=>s+v,0)/tScores.length:5;
  /* 3. Delivery rate (20%) */
  const delRate=totalDel>0?Math.min(1,totalRcv/totalDel):0;
  const delScore=delRate>=0.95?10:delRate>=0.8?8:delRate>=0.6?6:delRate>=0.4?4:2;
  /* 4. Consistency (15%) - low quality variance = better */
  const qMean=avgQ;const variance=qScores.reduce((s,v)=>s+Math.pow(v-qMean,2),0)/qScores.length;
  const consScore=variance<=1?10:variance<=4?8:variance<=9?6:4;
  /* Combined */
  return r2(avgQ*0.4+avgT*0.25+delScore*0.2+consScore*0.15);
}

function mkOrder(){
  const today=new Date().toISOString().split("T")[0];
  const o={id:gid(),date:today,createdAt:new Date().toISOString(),modelNo:"",modelDesc:"",poNumber:"",sizeSetId:"",sizeLabel:"",status:"تم القص",cutQty:0,deliveredQty:0,accItems:[],deliveries:[],workshopDeliveries:[],orderPieces:[],image:"",instructions:"",attachments:[],marker:""};
  FKEYS.forEach(k=>{o["fabric"+k]="";o["cons"+k]=0;o["cutDate"+k]=today;o["colors"+k]=k==="A"?[{color:"",colorHex:"",layers:0,pcsPerLayer:0,qty:0}]:[];o["fabric"+k+"Label"]="";o["fabric"+k+"Price"]=0;o["fabric"+k+"Unit"]=""});
  return o
}

function validateOrder(form){
  const e=[];
  if(!form.modelNo.trim())e.push("رقم الموديل مطلوب");
  if(!form.modelDesc.trim())e.push("وصف الموديل مطلوب");
  if(!form.sizeSetId)e.push("المقاسات مطلوبة");
  if(!form.date)e.push("التاريخ مطلوب");
  if(!form.fabricA)e.push("خامة A مطلوبة");
  FKEYS.forEach(k=>{
    if(!form["fabric"+k])return;
    const ca=form["colors"+k]||[];
    if(ca.length===0||!ca[0].color)e.push("لون خامة "+k+" مطلوب");
    if(ca.length>0&&(!ca[0].layers||ca[0].layers<=0))e.push("عدد الراقات مطلوب لخامة "+k);
    if(ca.length>0&&(!ca[0].pcsPerLayer||ca[0].pcsPerLayer<=0))e.push("القطع/راق مطلوب لخامة "+k);
    if(!gcons(form,k)||gcons(form,k)<=0)e.push("استهلاك خامة "+k+" مطلوب");
  });
  return e
}


async function printOrderSheet(order,t,activeFabs,statusCards){
  let wsRows="";(order.workshopDeliveries||[]).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);wsRows+="<tr><td>"+wd.wsName+"</td><td>"+(wd.garmentType||"-")+"</td><td>"+wd.qty+"</td><td>"+rcvd+"</td><td>"+(wd.qty-rcvd)+"</td></tr>"});
  const col=getStatusColor(order.status,statusCards);
  const pieces=order.orderPieces||[];
  let h="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:100px;height:133px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
    h+="<div style='flex:1'><table><tr><th>رقم الموديل</th><td><b style='font-size:16px;color:#0284C7'>"+order.modelNo+"</b></td><th>الوصف</th><td>"+order.modelDesc+"</td></tr><tr><th>المقاسات</th><td>"+order.sizeLabel+"</td><th>التاريخ</th><td>"+order.date+"</td></tr><tr><th>كمية القص</th><td><b style='font-size:15px;color:#0284C7'>"+t.cutQty+"</b></td><th>الحالة</th><td><span class='badge' style='background:"+col+"20;color:"+col+"'>"+order.status+"</span></td></tr>"+(order.marker?"<tr><th>ماركر</th><td colspan='3'>"+order.marker+"</td></tr>":"")+"</table></div></div>";
  /* Order pieces */
  if(pieces.length>0){h+="<div style='margin-bottom:12px;padding:8px 14px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0'><span style='font-weight:700;font-size:12px;color:#475569'>قطع الموديل: </span>";pieces.forEach(p=>{h+="<span style='display:inline-block;padding:3px 10px;margin:2px 3px;border-radius:6px;font-size:11px;font-weight:600;background:#8B5CF615;color:#8B5CF6;border:1px solid #8B5CF630'>"+p+"</span>"});h+="</div>"}
  /* Fabric tables */
  if(activeFabs.length>0){h+="<h2 style='font-size:14px;margin:12px 0 6px'>الخامات</h2>";
    activeFabs.forEach(k=>{const colors=gc(order,k);const fp=order["fabricPieces"+k]||[];const cons=gcons(order,k);const unit=gf(order,k,"Unit")||"";
      h+="<div style='margin-bottom:10px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden'>";
      h+="<div style='background:#f1f5f9;padding:6px 12px;font-weight:700;font-size:12px;display:flex;justify-content:space-between'><span>"+gf(order,k,"Label")+"</span><span>استهلاك/راق: "+cons+(unit?" "+unit:"")+(fp.length>0?" | القطع: "+fp.join("، "):"")+"</span></div>";
      h+="<table style='margin:0'><tr><th>اللون</th><th>الراقات</th><th>قطع/راق</th><th>اجمالي القطع</th></tr>";
      let totalLayers=0,totalQty=0;colors.forEach(c=>{const q=(Number(c.layers)||0)*(Number(c.pcsPerLayer)||0);totalLayers+=(Number(c.layers)||0);totalQty+=q;
        h+="<tr><td>"+(c.color||"-")+"</td><td style='font-weight:700'>"+(c.layers||0)+"</td><td>"+(c.pcsPerLayer||0)+"</td><td style='font-weight:700;color:#0284C7'>"+q+"</td></tr>"});
      h+="<tr style='background:#f8fafc;font-weight:800'><td>الاجمالي</td><td>"+totalLayers+"</td><td></td><td style='color:#0284C7'>"+totalQty+"</td></tr>";
      h+="</table></div>"})};
  if(wsRows)h+="<h2 style='font-size:14px;margin:12px 0 6px'>الورش</h2><table><tr><th>الورشة</th><th>القطعة</th><th>الكمية</th><th>استلام مصنع</th><th>رصيد حالي</th></tr>"+wsRows+"</table>";
  if(order.instructions)h+="<h2 style='font-size:14px;margin:12px 0 6px'>تعليمات التشغيل</h2><div style='background:#f8fafc;padding:10px;border-radius:6px;white-space:pre-wrap;font-size:12px'>"+order.instructions+"</div>";
  h+="<div class='sig'><div class='sig-box'>توقيع مسؤول القص</div><div class='sig-box'>مسؤول التشغيل</div><div class='sig-box'>مدير الانتاج</div></div>";
  printPage("أمر قص — "+order.modelNo,h)
}

async function printStockDelivery(order,qty,date,note,totalDelivered,totalCut){
  if(!order)return;
  let h="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
    h+="<div style='flex:1'><table>";
  h+="<tr><th>رقم الموديل</th><td><b style='font-size:16px;color:#059669'>"+order.modelNo+"</b></td><th>الوصف</th><td>"+order.modelDesc+"</td></tr>";
  h+="<tr><th>المقاسات</th><td>"+order.sizeLabel+"</td><th>التاريخ</th><td><b>"+date+"</b></td></tr>";
  h+="<tr><th>الكمية المسلمة</th><td><b style='font-size:18px;color:#059669'>"+qty+"</b> قطعة</td><th>اجمالي القص</th><td>"+totalCut+"</td></tr>";
  h+="<tr><th>اجمالي المسلم للمخزن</th><td><b>"+totalDelivered+"</b></td><th>المتبقي</th><td><b style='color:"+(totalCut-totalDelivered>0?"#EF4444":"#10B981")+"'>"+(totalCut-totalDelivered)+"</b></td></tr>";
  if(note)h+="<tr><th>ملاحظات</th><td colspan='3'>"+note+"</td></tr>";
  h+="</table></div></div>";
  /* Statement */
  h+="<div style='margin:20px 0;padding:14px;border:2px solid #CBD5E1;border-radius:10px;background:#F0FDF4;font-size:12px;line-height:2;text-align:center'>";
  h+="أقر بأنني استلمت الكمية المذكورة أعلاه وتم ادخالها للمخزن بعد الفحص والمراجعة</div>";
  h+="<div class='sig'><div class='sig-box'>أمين المخزن</div><div class='sig-box'>مسؤول التشطيب</div><div class='sig-box'>مدير الانتاج</div></div>";
  h+="<div style='margin-top:16px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management — "+new Date().toLocaleDateString("ar-EG")+"</div>";
  printPage("اذن تسليم مخزن — "+order.modelNo,h)
}

/* ── UI Components (Light Glassmorphism) ── */
const FS=13;
const TH={textAlign:"right",padding:"6px 10px",fontSize:FS-2,fontWeight:600,color:T.textSec,whiteSpace:"nowrap",borderBottom:"2px solid "+T.brd,background:T.inputBg||T.cardSolid,letterSpacing:"0.03em"};
const TD={padding:"6px 10px",fontSize:FS,color:T.text,borderBottom:"1px solid "+T.brd,verticalAlign:"middle"};
const TDB={...TD,fontWeight:600};
const TDL={...TD,color:T.textSec,width:80,whiteSpace:"nowrap"};

function Badge({t,cards}){const col=getStatusColor(t,cards);return<span style={{padding:"5px 14px",borderRadius:20,fontSize:FS-2,fontWeight:600,background:col+"18",color:col,border:"1px solid "+col+"30"}}>{t}</span>}

function Btn({children,on,primary,danger,ghost,onClick,small,disabled,style:sx,title}){
  let bg=T.cardSolid,fg=T.text,bd="1px solid "+T.brd;
  if(on||primary){bg="linear-gradient(135deg,"+T.accent+","+T.accent+"CC)";fg="#fff";bd="none"}
  if(danger){bg=T.err+"12";fg=T.err;bd="1px solid "+T.err+"30"}
  if(ghost){bg="transparent";bd="none";fg=T.textSec}
  const mob=typeof window!=="undefined"&&window.innerWidth<768;
  return<button onClick={onClick} disabled={disabled} title={title} style={{padding:small?(mob?"6px 12px":"4px 10px"):(mob?"9px 18px":"7px 16px"),borderRadius:8,fontSize:small?FS-2:FS,fontWeight:600,background:bg,color:fg,border:bd,cursor:disabled?"default":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,boxShadow:primary?"0 2px 8px "+T.accent+"33":"none",minHeight:mob?36:undefined,...(sx||{})}}>{children}</button>
}

function safeCalc(expr){try{const clean=expr.replace(/[^0-9+\-*/.() ]/g,"");if(!clean)return null;return new Function("return "+clean)()}catch(e){return null}}

function Inp({value,onChange,placeholder,type,step,style:sx,readOnly}){
  const isNum=type==="number";
  const handleKey=(e)=>{if(e.key==="Enter"&&isNum){const v=String(e.target.value);if(v.startsWith("=")){const r=safeCalc(v.slice(1));if(r!==null&&onChange)onChange(r)}}};
  return<input type={isNum?"text":type||"text"} inputMode={isNum?"decimal":undefined} step={step||"any"} value={value==null?"":value} readOnly={readOnly} onChange={e=>{const v=e.target.value;if(isNum&&!v.startsWith("=")){let cleaned=v.replace(/[^0-9.\-]/g,"");const parts=cleaned.split(".");if(parts.length>2)cleaned=parts[0]+"."+parts.slice(1).join("");onChange&&onChange(cleaned)}else{onChange&&onChange(v)}}} onKeyDown={handleKey} onFocus={e=>e.target.select()} placeholder={placeholder||(isNum?"0":"")} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:readOnly?T.bg:T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",...(sx||{})}}/>
}

function Sel({value,onChange,children}){
  return<select value={value==null?"":value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box"}}>{children}</select>
}

function SearchSel({value,onChange,options,placeholder}){
  const[q,setQ]=useState("");const[focused,setFocused]=useState(false);const ref=useRef(null);
  const selected=options.find(o=>o.value===value);
  const showResults=focused&&q.length>0;
  const filtered=q?options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())).slice(0,5):[];
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setFocused(false)};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[]);
  return<div ref={ref} style={{position:"relative",zIndex:focused?999:1}}>
    <input value={focused?q:(selected?selected.label:"")}
      onChange={e=>{setQ(e.target.value);if(!focused)setFocused(true)}}
      onFocus={()=>{setFocused(true);setQ("")}}
      onKeyDown={e=>{if(e.key==="Escape"){setFocused(false)}}}
      placeholder={placeholder||"اكتب للبحث..."}
      style={{width:"100%",padding:"6px 10px",border:"2px solid "+(focused?T.accent:T.brd),borderRadius:8,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none",transition:"border 0.15s"}}/>
    {selected&&!focused&&<div style={{fontSize:FS-3,color:T.ok,marginTop:2}}>{"✓ "+selected.label}</div>}
    {showResults&&<div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:1,zIndex:9999,borderRadius:8,border:"1px solid "+T.brd,overflow:"hidden",background:T.cardSolid,boxShadow:"0 8px 24px rgba(0,0,0,0.2)"}}>
      {filtered.length>0?filtered.map(o=><div key={o.value} onMouseDown={e=>{e.preventDefault();onChange(o.value);setQ("");setFocused(false)}}
        style={{padding:"8px 12px",cursor:"pointer",fontSize:FS,color:o.value===value?T.accent:T.text,fontWeight:o.value===value?700:400,background:o.value===value?T.accent+"08":T.cardSolid,borderBottom:"1px solid "+T.brd+"30"}}
        onMouseEnter={e=>e.currentTarget.style.background=T.accent+"12"} onMouseLeave={e=>e.currentTarget.style.background=o.value===value?T.accent+"08":T.cardSolid}>{o.label}</div>)
      :<div style={{padding:"8px 12px",textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>}
    </div>}
  </div>
}

function Card({children,title,extra,accent,style:sx}){
  return<div style={{background:T.cardSolid,borderRadius:12,border:"1px solid "+T.brd,boxShadow:T.shadow,overflow:"visible",...(sx||{})}}>
    {(title||extra)&&<div style={{padding:"10px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:accent||T.bg,borderRadius:"12px 12px 0 0"}}><span style={{fontSize:FS+1,fontWeight:700,color:accent?"#fff":T.text}}>{title}</span>{extra}</div>}
    <div style={{padding:14}}>{children}</div>
  </div>
}

function MetricCard({label,value,color,icon,sub}){
  return<div style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:12,padding:"14px 16px",border:"1px solid "+T.brd,boxShadow:T.shadow,display:"flex",alignItems:"center",gap:12}}>
    <div style={{width:40,height:40,borderRadius:10,background:(color||T.accent)+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{icon}</div>
    <div style={{flex:1}}>
      <div style={{fontSize:FS-2,color:T.textSec,marginBottom:2,fontWeight:500}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:color||T.text}}>{value}</div>
      {sub&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:1}}>{sub}</div>}
    </div>
  </div>
}

function PBar({value,color}){return<div style={{height:6,borderRadius:3,background:"#E2E8F0",overflow:"hidden",marginTop:4}}><div style={{height:"100%",width:Math.min(value,100)+"%",borderRadius:3,background:color||"linear-gradient(90deg,#0EA5E9,#06B6D4)",transition:"width 0.6s"}}/></div>}

function DelBtn({onConfirm,label,blocked}){
  const[confirm,setConfirm]=useState(false);const[showBlock,setShowBlock]=useState(false);
  if(showBlock)return<div style={{display:"inline-flex",gap:4,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:FS-3,color:T.err,fontWeight:600,maxWidth:200}}>{"⚠️ "+blocked}</span><Btn ghost small onClick={()=>setShowBlock(false)}>✓</Btn></div>;
  if(confirm)return<div style={{display:"inline-flex",gap:4,alignItems:"center"}}><Btn danger small onClick={()=>{onConfirm();setConfirm(false)}}>✓ تأكيد</Btn><Btn ghost small onClick={()=>setConfirm(false)} title="إغلاق">✕</Btn></div>;
  return<Btn danger small onClick={()=>blocked?setShowBlock(true):setConfirm(true)}>{label||"🗑️"}</Btn>
}

function ColorPicker({value,colorHex,onSelect}){
  const[open,setOpen]=useState(false);const[txt,setTxt]=useState(value||"");
  useEffect(()=>{setTxt(value||"")},[value]);
  return<div style={{position:"relative",display:"flex",alignItems:"center",gap:8}}>
    <div onClick={()=>setOpen(!open)} style={{width:30,height:30,borderRadius:8,border:"2px solid "+T.brd,background:colorHex||"#F1F5F9",cursor:"pointer",flexShrink:0}}/>
    <input value={txt} onChange={e=>{setTxt(e.target.value);const f=COLORS_DB.find(c=>c.n===e.target.value);onSelect(e.target.value,f?f.h:colorHex||"#ccc")}} placeholder="اكتب اللون" style={{width:100,padding:"6px 10px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text}}/>
    {open&&<div style={{position:"fixed",zIndex:9999,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:16,padding:14,boxShadow:T.shadowLg,width:280}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>{COLORS_DB.map(c=><div key={c.h} onClick={()=>{onSelect(c.n,c.h);setTxt(c.n);setOpen(false)}} title={c.n} style={{width:38,height:38,borderRadius:8,background:c.h,cursor:"pointer",border:colorHex===c.h?"3px solid "+T.accent:"2px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:c.h==="#FFFFFF"?"#999":"#fff",fontWeight:600}}>{c.n}</div>)}</div>
      <div onClick={()=>setOpen(false)} style={{marginTop:10,textAlign:"center",fontSize:FS,color:T.accent,cursor:"pointer",fontWeight:700}}>اغلاق</div>
    </div>}
  </div>
}

function FCTable({label,fabName,colors,setColors,accent,readOnly,pcsPerSeries}){
  const tQ=sqty(colors),tL=slay(colors);
  const pps=pcsPerSeries||0;
  const addC=()=>setColors([...colors,{color:"",colorHex:"",layers:0,pcsPerLayer:pps||0,qty:0}]);
  const upC=(i,fld,val)=>{const nc=colors.map((c,j)=>{if(j!==i)return c;const u={...c};u[fld]=(fld==="color"||fld==="colorHex")?val:(Number(val)||0);if(fld==="layers"||fld==="pcsPerLayer")u.qty=(Number(u.layers)||0)*(Number(u.pcsPerLayer)||0);return u});setColors(nc)};
  return<div style={{border:"1px solid "+T.brd,borderRadius:14,overflow:"visible",marginBottom:12,boxShadow:"0 2px 8px rgba(0,0,0,0.04)"}}>
    <div style={{padding:"10px 16px",background:accent,display:"flex",justifyContent:"space-between",alignItems:"center",borderRadius:"14px 14px 0 0",flexWrap:"wrap",gap:8}}>
      <span style={{fontSize:FS,fontWeight:700,color:"#fff"}}>{label+": "+(fabName||"")}</span>
      <div style={{display:"flex",gap:8}}>{pps>0&&<span style={{fontSize:FS-2,color:"#fff",background:"rgba(255,255,255,0.25)",padding:"4px 14px",borderRadius:20,fontWeight:600}}>{"سيري: "+pps}</span>}<span style={{fontSize:FS-2,color:"#fff",background:"rgba(255,255,255,0.25)",padding:"4px 14px",borderRadius:20,fontWeight:600}}>{"راقات: "+tL}</span><span style={{fontSize:FS-2,color:"#fff",background:"rgba(255,255,255,0.25)",padding:"4px 14px",borderRadius:20,fontWeight:600}}>{"قطع: "+tQ}</span></div>
    </div>
    <div style={{padding:12,overflowX:"auto"}}>
      <table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}>
        <thead><tr><th style={{...TH,background:"transparent"}}>اللون</th><th style={{...TH,background:"transparent"}}>الراقات</th><th style={{...TH,background:"transparent"}}>القطع/راق</th><th style={{...TH,background:"transparent"}}>الكمية</th>{!readOnly&&<th style={{...TH,background:"transparent"}}> </th>}</tr></thead>
        <tbody>{colors.map((c,i)=>{const isFree=c._free;const ppsValid=pps>0&&!isFree;return<tr key={i}>
          <td style={{...TD,minWidth:160,overflow:"visible"}}>{readOnly?<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:22,height:22,borderRadius:6,background:c.colorHex||"#E2E8F0",border:"1px solid #E2E8F0",flexShrink:0}}/><span style={{fontWeight:500}}>{c.color||"-"}</span></div>:<ColorPicker value={c.color} colorHex={c.colorHex} onSelect={(nm,hx)=>{const nc=colors.map((cc,jj)=>jj===i?{...cc,color:nm,colorHex:hx}:cc);setColors(nc)}}/>}</td>
          <td style={{...TD,width:100}}>{readOnly?c.layers:<Inp type="number" value={c.layers} onChange={v=>{upC(i,"layers",v);if(ppsValid&&(!c.pcsPerLayer||c.pcsPerLayer===0)){upC(i,"pcsPerLayer",pps)}}}/>}</td>
          <td style={{...TD,width:120}}>{readOnly?(c.pcsPerLayer||"-"):<div style={{display:"flex",gap:3,alignItems:"center"}}>{ppsValid?<Sel value={c.pcsPerLayer||""} onChange={v=>upC(i,"pcsPerLayer",v)}><option value="">--</option>{Array.from({length:5},(_,n)=>(n+1)*pps).map(v=><option key={v} value={v}>{v}</option>)}</Sel>:<Inp type="number" value={c.pcsPerLayer} onChange={v=>upC(i,"pcsPerLayer",v)}/>}{!readOnly&&pps>0&&<Btn small onClick={()=>{const nc=colors.map((cc,jj)=>jj===i?{...cc,_free:!cc._free}:cc);setColors(nc)}} style={{padding:"2px 6px",fontSize:FS-3,background:isFree?T.warn+"15":"transparent",color:isFree?T.warn:T.textMut,border:"1px solid "+(isFree?T.warn+"40":T.brd),whiteSpace:"nowrap",flexShrink:0}}>{isFree?"🔓":"🔒"}</Btn>}</div>}</td>
          <td style={{...TDB,width:80,background:T.accentBg,textAlign:"center",borderRadius:6,color:T.accent}}>{c.qty}</td>
          {!readOnly&&<td style={{...TD,width:40}}><Btn danger small onClick={()=>setColors(colors.filter((_,j)=>j!==i))}>x</Btn></td>}
        </tr>})}</tbody>
      </table>
      {!readOnly&&<Btn ghost small onClick={addC} style={{marginTop:6,color:accent}}>+ لون جديد</Btn>}
    </div>
  </div>
}

function AccPicker({accItems,dbAcc,onChange}){
  const[showPick,setShowPick]=useState(false);
  const[picked,setPicked]=useState({});
  const available=dbAcc.filter(a=>!accItems.find(x=>x.accId===a.id));
  const openPicker=()=>{setPicked({});setShowPick(true)};
  const togglePick=(id)=>setPicked(p=>({...p,[id]:!p[id]}));
  const addSelected=()=>{const ids=Object.keys(picked).filter(k=>picked[k]);const newItems=ids.map(id=>{const acc=dbAcc.find(a=>a.id===Number(id));return acc?{accId:acc.id,name:acc.name,unit:acc.unit,price:acc.price}:null}).filter(Boolean);if(newItems.length>0)onChange([...accItems,...newItems]);setShowPick(false)};
  const selCount=Object.values(picked).filter(Boolean).length;
  return<div>
    <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
      <Btn primary onClick={openPicker} disabled={available.length===0}>{"+ اختيار اكسسوارات ("+(available.length)+" متاح)"}</Btn>
    </div>
    {showPick&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowPick(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:450,maxHeight:"70vh",overflow:"auto",border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>اختر بنود الاكسسوار</div>
          <Btn ghost small onClick={()=>setShowPick(false)} title="إغلاق">✕</Btn>
        </div>
        {available.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>
          {available.map(a=><div key={a.id} onClick={()=>togglePick(a.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,cursor:"pointer",background:picked[a.id]?T.accent+"12":T.bg,border:"1.5px solid "+(picked[a.id]?T.accent:T.brd),transition:"all 0.15s"}}>
            <div style={{width:22,height:22,borderRadius:6,border:"2px solid "+(picked[a.id]?T.accent:T.brd),background:picked[a.id]?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800,flexShrink:0}}>{picked[a.id]?"✓":""}</div>
            <div style={{flex:1}}><div style={{fontWeight:600}}>{a.name}</div><div style={{fontSize:FS-2,color:T.textSec}}>{a.unit+" — "+a.price+" ج.م"}</div></div>
          </div>)}
        </div>:<div style={{textAlign:"center",padding:20,color:T.textSec}}>تم اضافة جميع الاكسسوارات</div>}
        {selCount>0&&<div style={{marginTop:14,display:"flex",justifyContent:"center"}}><Btn primary onClick={addSelected}>{"اضافة "+selCount+" بند"}</Btn></div>}
      </div>
    </div>}
    {accItems.length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["الوصف","الوحدة","السعر",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {accItems.map((a,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.unit}</td><td style={TD}><Inp type="number" value={a.price} onChange={v=>{const n=[...accItems];n[i]={...n[i],price:Number(v)||0};onChange(n)}} style={{width:90}}/></td><td style={TD}><Btn danger small onClick={()=>onChange(accItems.filter((_,j)=>j!==i))}>x</Btn></td></tr>)}
    </tbody></table></div>}
  </div>
}

/* ══ LOGIN ══ */
function LoginScreen(){
  const[email,setEmail]=useState("");const[pass,setPass]=useState("");
  const[err,setErr]=useState("");const[loading,setLoading]=useState(false);
  const handleLogin=async()=>{if(!email||!pass){setErr("ادخل الايميل وكلمة المرور");return}setLoading(true);setErr("");try{await signInWithEmailAndPassword(auth,email,pass)}catch(e){setErr(e.code==="auth/invalid-credential"?"بيانات الدخول غلط":"خطأ: "+e.message)}setLoading(false)};
  const iS={width:"100%",padding:"14px 16px",borderRadius:14,border:"2px solid "+T.brd,fontSize:FS+1,fontFamily:"inherit",boxSizing:"border-box",background:T.cardSolid,color:T.text,outline:"none"};
  return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#EFF6FF,#DBEAFE,#E0F2FE)",direction:"rtl",fontFamily:"'Cairo',sans-serif",padding:20}}>
    <div style={{width:"100%",maxWidth:420,background:T.card,backdropFilter:"blur(20px)",borderRadius:28,padding:44,border:"1px solid "+T.brd,boxShadow:T.shadow}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <img src={CLARK_LOGO} alt="CLARK" style={{width:200,marginBottom:12}}/>
        <div style={{fontSize:FS,color:T.textSec}}>نظام ادارة القص والتشغيل</div>
      </div>
      <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>البريد الالكتروني</label><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="example@email.com" type="email" onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={iS}/></div>
      <div style={{marginBottom:20}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>كلمة المرور</label><input type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} style={iS}/></div>
      {err&&<div style={{color:T.err,fontSize:FS,marginBottom:12,textAlign:"center",fontWeight:600}}>{err}</div>}
      <button onClick={handleLogin} disabled={loading} style={{width:"100%",padding:16,borderRadius:14,background:"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)",color:"#fff",fontSize:FS+2,fontWeight:800,border:"none",cursor:"pointer",boxShadow:"0 4px 16px "+T.accent+"33",fontFamily:"inherit"}}>{loading?"جاري الدخول...":"تسجيل الدخول"}</button>
      <div style={{textAlign:"center",marginTop:14,fontSize:FS-1,color:T.textMut}}>تواصل مع المدير للحصول على حساب</div>
    </div>
  </div>
}

const TABS=[
  {key:"dashboard",label:"لوحة التحكم",icon:"📊",color:"#0EA5E9",bg:"#E0F2FE"},
  {key:"details",label:"أوامر القص",icon:"✂️",color:"#8B5CF6",bg:"#EDE9FE"},
  {key:"external",label:"تشغيل خارجي",icon:"🏭",color:"#10B981",bg:"#D1FAE5"},
  {key:"stock",label:"تسليم مخزن جاهز",icon:"📦",color:"#059669",bg:"#ECFDF5"},
  {key:"reports",label:"التقارير",icon:"📈",color:"#06B6D4",bg:"#CFFAFE"},
  {key:"calc",label:"حاسبة التكاليف",icon:"🧮",color:"#EC4899",bg:"#FCE7F3"},
  {key:"tasks",label:"المهام",icon:"📌",color:"#F59E0B",bg:"#FEF3C7"},
  {key:"db",label:"قاعدة البيانات",icon:"🗄️",color:"#EF4444",bg:"#FEE2E2"},
  {key:"custDeliver",label:"مبيعات",icon:"💰",color:"#059669",bg:"#ECFDF5"},
  {key:"settings",label:"الاعدادات",icon:"⚙️",color:"#64748B",bg:"#F1F5F9"}
];

/* ══ MAIN APP ══ */
export default function App(){
  /* QR scan: ?o=modelNo → order details, ?act=rcv&oid=ID&wdi=IDX → receive mode */
  const qrParams=new URLSearchParams(window.location.search);
  const qrModelNo=qrParams.get("o");
  const qrAction=qrParams.get("act");
  const qrOid=qrParams.get("oid");
  const qrWdi=qrParams.get("wdi");
  const qrWs=qrParams.get("ws");

  const[user,setUser]=useState(null);const[authLoading,setAuthLoading]=useState(true);
  const[configDoc,setConfigDoc]=useState(INIT_CONFIG);const[salesDoc,setSalesDoc]=useState({});const[tasksDoc,setTasksDoc]=useState({});const[orders,setOrders]=useState([]);const[dataLoading,setDataLoading]=useState(true);
  const config=useMemo(()=>{const merged={...configDoc,...salesDoc,...tasksDoc};
    /* Safety: if salesDoc has sessions, ALWAYS prefer it over configDoc */
    if(salesDoc.custDeliverySessions)merged.custDeliverySessions=salesDoc.custDeliverySessions;
    if(salesDoc.packages)merged.packages=salesDoc.packages;
    if(tasksDoc.tasks)merged.tasks=tasksDoc.tasks;
    if(tasksDoc.stickyNotes)merged.stickyNotes=tasksDoc.stickyNotes;
    if(tasksDoc.inventoryAudits)merged.inventoryAudits=tasksDoc.inventoryAudits;
    return merged},[configDoc,salesDoc,tasksDoc]);
  const[tab,setTab_]=useState(()=>sessionStorage.getItem("clark_tab")||"home");const[sel,setSel_]=useState(()=>sessionStorage.getItem("clark_sel")||null);
  const setTab=v=>{setTab_(v);sessionStorage.setItem("clark_tab",v)};
  const setSel=v=>{setSel_(v);if(v)sessionStorage.setItem("clark_sel",v);else sessionStorage.removeItem("clark_sel")};
  const[gSearch,setGSearch]=useState("");const[showAlerts,setShowAlerts]=useState(false);const[showLogout,setShowLogout]=useState(false);const[showScanner,setShowScanner]=useState(false);const[dbSub,setDbSub]=useState(null);const[showTheme,setShowTheme]=useState(false);const[cardPopup,setCardPopup]=useState(null);const[labelPopup,setLabelPopup]=useState(null);const[labelBags,setLabelBags]=useState(1);const[wsAccPopup,setWsAccPopup]=useState(null);const[barcodePopup,setBarcodePopup]=useState(null);
  const[stickyForm,setStickyForm]=useState(null);
  const[quickPopup,setQuickPopup]=useState(null);/* "task"|"notif"|null */
  const[qpTo,setQpTo]=useState("");const[qpText,setQpText]=useState("");const[qpType,setQpType]=useState("تذكير");
  const[aiMsgs,setAiMsgs]=useState([]);const[aiInput,setAiInput]=useState("");const[aiLoading,setAiLoading]=useState(false);const[aiOpen,setAiOpen]=useState(false);
  const[dismissedAlerts,setDismissedAlerts]=useState(()=>{try{const raw=localStorage.getItem("clark_dismissed_alerts");if(!raw)return[];const arr=JSON.parse(raw);const now=Date.now();return arr.filter(d=>now-d.at<864000000)}catch(e){return[]}});
  const dismissAlert=(text)=>{setDismissedAlerts(p=>{const n=[...p,{text,at:Date.now()}];try{localStorage.setItem("clark_dismissed_alerts",JSON.stringify(n))}catch(e){}return n})};
  const isDismissed=(text)=>dismissedAlerts.some(d=>d.text===text);
  const aiAlerts=useMemo(()=>{const a=[];const now=Date.now();const workshops=config.workshops||[];const wsPayments=config.wsPayments||[];
    /* 1. أوردرات متأخرة */
    orders.forEach(o=>{if(o.closed||o.status==="تم التسليم"||o.status==="تم الشحن")return;const wds=o.workshopDeliveries||[];let lastDate=o.date;wds.forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});const days=Math.floor((now-new Date(lastDate))/(86400000));
      if(days>7)a.push({icon:"🔴",text:"موديل "+o.modelNo+" واقف من "+days+" يوم",type:"late",orderId:o.id})});
    /* 2. أوردرات جاهزة للغلق */
    orders.forEach(o=>{if(o.closed)return;const t=calcOrder(o);const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);if(t.cutQty>0&&stockDel>=t.cutQty)a.push({icon:"✅",text:"موديل "+o.modelNo+" كامل — جاهز للغلق",type:"ready",orderId:o.id})});
    /* 3. هالك كبير (>5%) */
    orders.forEach(o=>{if(o.closed||!o.settlement)return;const t=calcOrder(o);if(t.cutQty>0){const pct=Math.round((o.settlement.qty/t.cutQty)*100);if(pct>5)a.push({icon:"⚠️",text:"موديل "+o.modelNo+" فيه "+pct+"% هالك ("+o.settlement.qty+" قطعة)",type:"waste"})}});
    /* 4. ورش — أرصدة مالية */
    workshops.forEach(w=>{const isInt=w.type==="داخلي"||w.type==="internal";if(isInt)return;
      let due=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
      const payments=wsPayments.filter(p=>p.wsName===w.name);const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const purchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
      const owed=due+purchase-paid;
      if(owed<-500)a.push({icon:"💸",text:""+w.name+" عليها "+fmt(r2(Math.abs(owed)))+" ج.م (دفعنالها زيادة)",type:"overpaid"});
      if(owed>5000)a.push({icon:"💰",text:""+w.name+" ليها "+fmt(r2(owed))+" ج.م مدفعناش",type:"unpaid"})});
    /* 5. ورش بطيئة + قرب الموعد */
    workshops.forEach(w=>{const wPhone=w.phone||"";let details=[];orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const wBal=(Number(wd.qty)||0)-rcvd;if(wBal>0){const daysSince=Math.floor((now-new Date(wd.date))/(86400000));const agreed=Number(wd.agreedDays)||0;details.push({modelNo:o.modelNo,qty:wBal,days:daysSince,agreed,garment:wd.garmentType||"",delDate:wd.date})}})});
      if(details.length>0){const totalBal=details.reduce((s,d)=>s+d.qty,0);const maxDays=Math.max(...details.map(d=>d.days));
        if(maxDays>14)a.push({icon:"🐢",text:w.name+" عندها "+totalBal+" قطعة من "+maxDays+" يوم",type:"slow",wsName:w.name,wsPhone:wPhone,details});
        details.forEach(d=>{if(d.agreed>0){const remaining=d.agreed-d.days;if(remaining<=2&&remaining>=0)a.push({icon:"⏰",text:w.name+" باقي "+(remaining||"آخر")+" يوم على موعد تسليم موديل "+d.modelNo+" ("+d.agreed+" يوم متفق)",type:"deadline",wsName:w.name,wsPhone:wPhone,details:[d]});
          else if(remaining<0)a.push({icon:"🔴",text:w.name+" متأخرة "+Math.abs(remaining)+" يوم عن الموعد — موديل "+d.modelNo+" (متفق "+d.agreed+" يوم)",type:"overdue",wsName:w.name,wsPhone:wPhone,details:[d]})}})}});
    return a},[orders,config.workshops,config.wsPayments]);
  const visibleAlerts=aiAlerts.filter(a=>!isDismissed(a.text));
  const askAI=async()=>{if(!aiInput.trim()||aiLoading)return;const q=aiInput.trim();setAiInput("");setAiMsgs(p=>[...p,{role:"user",text:q}]);setAiLoading(true);
    try{
      const ws=(config.workshops||[]).map(w=>{let del=0,rcv=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});
        const payments=(config.wsPayments||[]).filter(p=>p.wsName===w.name);const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
        let due=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
        return{name:w.name,type:w.type,delivered:del,received:rcv,balance:del-rcv,dueMoney:r2(due),paid:r2(paid),owedMoney:r2(due-paid)}});
      const ords=orders.map(o=>{const t=calcOrder(o);const wds=o.workshopDeliveries||[];const totalDel=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
        const lastMove=wds.reduce((d,wd)=>{let ld=wd.date||"";(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date});return ld>d?ld:d},"");
        const days=lastMove?Math.floor((Date.now()-new Date(lastMove))/(86400000)):null;
        return{modelNo:o.modelNo,desc:o.modelDesc,status:o.status,cutQty:t.cutQty,deliveredToWs:totalDel,receivedFromWs:totalRcv,wsBalance:totalDel-totalRcv,stockDelivered:stockDel,completeSet:stockDel,daysSinceLastMove:days,pieces:o.orderPieces||[],
          wsDetails:wds.map(wd=>{const rcvd=(wd.receives||[]).filter(r=>!r.isSettlement).reduce((s,r)=>s+(Number(r.qty)||0),0);return{ws:wd.wsName,piece:wd.garmentType||"عام",delivered:Number(wd.qty)||0,received:rcvd,balance:(Number(wd.qty)||0)-rcvd,agreed:Number(wd.agreedDays)||0,date:wd.date}}).filter(w=>w.balance>0||w.received>0)}});
      const ctx="أنت مساعد ذكي لنظام CLARK لإدارة مصانع الملابس.\n\nقواعد الرد:\n- رد بالمصري العامي (يعني، كده، خلاص، أهو)\n- اختصر اختصار غير مخل — بلاش كلام كتير\n- افصل بين كل أوردر أو معلومة بخط فاصل ─────\n- في الأرصدة المالية للورش: لو owedMoney سالب يبقى الورشة عليها فلوس (دفعنالها أكتر من المستحق)، لو موجب يبقى ليها فلوس عندنا\n- مصطلحات الورش مهمة جداً: workshopDeliveries.qty = الورشة استلمت منّنا (استلم)، workshopDeliveries.receives[].qty = الورشة سلّمت لنا (سلّم). يعني لما تكتب عن ورشة اكتب: استلم 508، سلّم 495، باقي 13. مش العكس!\n- في الآخر خالص حط سطر ─────── وبعده 💡 ملاحظتك أو نصيحتك من عندك كمدير انتاج خبرة\n\nبيانات الموسم "+season+":\n\nالأوردرات ("+ords.length+"):\n"+JSON.stringify(ords,null,0)+"\n\nالورش ("+ws.length+"):\n"+JSON.stringify(ws,null,0)+"\n\nالتاريخ: "+new Date().toISOString().split("T")[0];
      const msgs=[...aiMsgs.map(m=>({role:m.role==="user"?"user":"assistant",content:m.text})),{role:"user",content:q}];
      let data2;let retries=0;
      while(retries<2){
        const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:ctx,messages:msgs})});
        data2=await res.json();
        if(data2.error&&(data2.error.message||"").toLowerCase().includes("overloaded")&&retries<1){retries++;setAiMsgs(p=>[...p,{role:"ai",text:"⏳ السيرفر مشغول... بعيد المحاولة"}]);await new Promise(r=>setTimeout(r,3000));setAiMsgs(p=>p.filter(m=>m.text!=="⏳ السيرفر مشغول... بعيد المحاولة"));continue}
        break}
      if(data2.error){setAiMsgs(p=>[...p,{role:"ai",text:"⚠️ "+(data2.error.message||data2.error||"خطأ غير معروف")}]);setAiLoading(false);return}
      const reply=data2.content?.map(c=>c.text||"").join("\n")||"عذراً، لم أتمكن من الرد";
      setAiMsgs(p=>[...p,{role:"ai",text:reply}])
    }catch(e){console.error("AI error:",e);setAiMsgs(p=>[...p,{role:"ai",text:"⚠️ خطأ في الاتصال بالمساعد الذكي"}])}
    setAiLoading(false)};
  useEffect(()=>{const h=e=>{if(e.key==="Escape"){setQuickPopup(null);setShowAlerts(false);setShowScanner(false);setStickyForm(null);setShowTheme(false);setAiOpen(false)}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)},[]);
  const[statusNotif,setStatusNotif]=useState(null);const prevStatuses=useRef({});
  /* Online/Offline status */
  const[isOnline,setIsOnline]=useState(navigator.onLine);const[justReconnected,setJustReconnected]=useState(false);
  useEffect(()=>{
    const checkReal=async()=>{try{const r=await fetch("https://firestore.googleapis.com",{method:"HEAD",mode:"no-cors",cache:"no-store"});setIsOnline(p=>{if(!p)setJustReconnected(true);return true})}catch(e){setIsOnline(false);setJustReconnected(false)}};
    const on=()=>checkReal();const off=()=>{setIsOnline(false);setJustReconnected(false)};
    window.addEventListener("online",on);window.addEventListener("offline",off);
    const interval=setInterval(checkReal,15000);checkReal();
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);clearInterval(interval)}
  },[]);
  useEffect(()=>{if(justReconnected){const t=setTimeout(()=>setJustReconnected(false),4000);return()=>clearTimeout(t)}},[justReconnected]);
  /* ── Auto Bot Tasks (multi-user) ── */
  const botTasksRef=useRef(false);
  useEffect(()=>{
    if(!user||orders.length===0||botTasksRef.current)return;
    const at=config.autoTasks;if(!at?.enabled)return;
    const atUsers=at.users||[];if(atUsers.length===0)return;
    const tasks=Array.isArray(config.tasks)?config.tasks:[];const now=Date.now();
    const newTasks=[];
    const addBotTask=(key,text,toEmail,toName)=>{if(tasks.some(t=>t.botKey===key&&!t.done))return;if(newTasks.some(t=>t.botKey===key))return;
      newTasks.push({id:Date.now()+Math.random(),text,done:false,date:new Date().toISOString().split("T")[0],fromUid:"bot",fromEmail:"bot@clark",fromName:"🤖 CLARK Bot",toEmail,toName:toName||toEmail.split("@")[0],botKey:key})};
    atUsers.forEach(au=>{if(!au.email)return;const rules=au.rules||{};
      orders.forEach(o=>{
        if(o.closed||o.status==="تم التسليم"||o.status==="تم الشحن")return;
        const t=calcOrder(o);const wds=o.workshopDeliveries||[];const hasFab=FKEYS.some(k=>o["fabric"+k]);
        if(!hasFab||t.cutQty===0)return;
        const daysSinceCut=Math.floor((now-new Date(o.date))/(86400000));
        if(rules.noDeliver?.enabled&&wds.length===0&&daysSinceCut>=(rules.noDeliver.days||5)){
          addBotTask("nodeliver_"+o.id+"_"+au.email,"موديل "+o.modelNo+" مقصوص من "+daysSinceCut+" يوم ولم يتم تسليمه لأي ورشة",au.email,au.name)}
        if(rules.availPiece?.enabled){const linkedPieces=new Set();FKEYS.forEach(k=>{if(o["fabric"+k])(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
          (o.orderPieces||[]).forEach(p=>{const delForP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
          const isCut=hasFab&&(linkedPieces.size===0||linkedPieces.has(p));
          if(!isCut)return;/* قطعة لم تُقص بعد — لا تنبيه */
          if(delForP===0&&daysSinceCut>=(rules.availPiece.days||5)){addBotTask("availpiece_"+o.id+"_"+p+"_"+au.email,"تم قص "+p+" موديل "+o.modelNo+" ولم يتم تسليمه للتشغيل من "+daysSinceCut+" يوم",au.email,au.name)}})}
        if(rules.slowWorkshop?.enabled){wds.forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
          if(bal>0){const daysSinceDel=Math.floor((now-new Date(wd.date))/(86400000));
            if(daysSinceDel>=(rules.slowWorkshop.days||14)){addBotTask("slowws_"+o.id+"_"+wd.wsName+"_"+(wd.garmentType||"")+"_"+au.email,
              wd.wsName+" عندها "+bal+" "+(wd.garmentType||"قطعة")+" موديل "+o.modelNo+" من "+daysSinceDel+" يوم",au.email,au.name)}}})}
        if(rules.stockNoSale?.enabled){const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const custDel=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
          if(stockDel>0&&custDel===0){const lastStock=o.deliveries.reduce((d,x)=>x.date>d?x.date:d,"");const daysSinceStock=lastStock?Math.floor((now-new Date(lastStock))/(86400000)):0;
            if(daysSinceStock>=(rules.stockNoSale.days||7)){addBotTask("nosale_"+o.id+"_"+au.email,"موديل "+o.modelNo+" في المخزن "+stockDel+" قطعة من "+daysSinceStock+" يوم بدون تسليم عملاء",au.email,au.name)}}}
      })});
    if(newTasks.length>0){botTasksRef.current=true;upTasks(d=>{if(!Array.isArray(d.tasks))d.tasks=[];newTasks.forEach(t=>d.tasks.unshift(t))});
      setTimeout(()=>{botTasksRef.current=false},60000)}
  },[orders,config.autoTasks,config.tasks,user]);
  const themeKey="clark-theme-"+(user?.uid||"default");
  const[theme,setTheme_]=useState(()=>localStorage.getItem("clark-theme-default")||"light");
  const setTheme=v=>{setTheme_(v);localStorage.setItem(themeKey,v)};
  useEffect(()=>{const saved=localStorage.getItem(themeKey);if(saved&&saved!==theme)setTheme_(saved)},[themeKey]);
  T=THEMES[theme]||THEMES.light;
  useEffect(()=>{localStorage.setItem(themeKey,theme);document.body.style.background=T.bodyBg||T.bg},[theme,themeKey]);
  const w=useWin();const isMob=w<768;const isTab=w>=768&&w<1100;const season=config.activeSeason||"WS26";

  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false)});return unsub},[]);
  useEffect(()=>{if(!user)return;
    let salesReady=false;let tasksReady=false;
    /* Main config */
    const u1=onSnapshot(doc(db,"factory","config"),snap=>{if(snap.exists()){const d=snap.data();
      /* Phase 1: Copy data to separate docs (first time only) */
      if(!d._splitDone&&(d.custDeliverySessions||d.packages||d.tasks||d.stickyNotes||d.inventoryAudits)){
        const salesData={custDeliverySessions:d.custDeliverySessions||[],packages:d.packages||[]};
        const tasksData={tasks:d.tasks||[],stickyNotes:d.stickyNotes||[],inventoryAudits:d.inventoryAudits||[]};
        Promise.all([setDoc(doc(db,"factory","sales"),salesData),setDoc(doc(db,"factory","tasks"),tasksData)]).then(()=>{
          /* Mark as split but KEEP data until phase 2 */
          setDoc(doc(db,"factory","config"),{...d,_splitDone:true});console.log("✅ Phase 1: data copied to sales+tasks")}).catch(e=>console.error("Split error:",e))}
      /* Phase 2: Clean config ONLY if sales+tasks docs already loaded */
      if(d._splitDone&&d.custDeliverySessions&&salesReady&&tasksReady){
        const clean={...d};delete clean.custDeliverySessions;delete clean.packages;delete clean.tasks;delete clean.stickyNotes;delete clean.inventoryAudits;
        setDoc(doc(db,"factory","config"),clean);console.log("✅ Phase 2: config cleaned")}
      setConfigDoc(d)}else setDoc(doc(db,"factory","config"),INIT_CONFIG)});
    /* Sales doc */
    const u2=onSnapshot(doc(db,"factory","sales"),snap=>{if(snap.exists()){salesReady=true;setSalesDoc(snap.data())}});
    /* Tasks doc */
    const u3=onSnapshot(doc(db,"factory","tasks"),snap=>{if(snap.exists()){tasksReady=true;setTasksDoc(snap.data())}});
    return()=>{u1();u2();u3()}},[user]);
  useEffect(()=>{if(!user||!season)return;setDataLoading(true);const unsub=onSnapshot(collection(db,"seasons",season,"orders"),snap=>{setOrders(snap.docs.map(d=>({_docId:d.id,...d.data()})).filter(o=>o.id&&o.modelNo));setDataLoading(false)});return()=>unsub()},[user,season]);

  const upConfig=useCallback(fn=>{setConfigDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);setDoc(doc(db,"factory","config"),next).catch(e=>console.error("upConfig error:",e));return next}catch(e){console.error("upConfig error:",e);showToast("⚠️ خطأ في الحفظ");return prev}})},[]);
  const upSales=useCallback(fn=>{setSalesDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);setDoc(doc(db,"factory","sales"),next).catch(e=>console.error("upSales error:",e));return next}catch(e){console.error("upSales error:",e);showToast("⚠️ خطأ في الحفظ");return prev}})},[]);
  const upTasks=useCallback(fn=>{setTasksDoc(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);setDoc(doc(db,"factory","tasks"),next).catch(e=>console.error("upTasks error:",e));return next}catch(e){console.error("upTasks error:",e);showToast("⚠️ خطأ في الحفظ");return prev}})},[]);
  const addOrder=async o=>{o.createdBy=userName;await addDoc(collection(db,"seasons",season,"orders"),o)};
  const updOrder=async(orderId,fn)=>{try{const ord=orders.find(o=>o.id===orderId);if(!ord)return;const updated=JSON.parse(JSON.stringify(ord));fn(updated);const clean={...updated};delete clean._docId;await updateDoc(doc(db,"seasons",season,"orders",ord._docId),clean)}catch(e){console.error("updOrder error:",e);showToast("⚠️ خطأ في حفظ الأوردر")}};
  const delOrder=async orderId=>{const ord=orders.find(o=>o.id===orderId);if(ord)await deleteDoc(doc(db,"seasons",season,"orders",ord._docId))};
  const replaceOrder=async(orderId,newData)=>{
    const ord=orders.find(o=>o.id===orderId);if(!ord||!ord._docId)return;
    /* Safety: verify data is a valid order object */
    if(!newData||typeof newData!=="object"||!newData.id||!newData.modelNo){console.error("replaceOrder: invalid data",newData);showToast("⚠️ خطأ — البيانات غير صالحة");return}
    const clean={...newData};delete clean._docId;
    try{await setDoc(doc(db,"seasons",season,"orders",ord._docId),clean)}
    catch(e){console.error("replaceOrder error:",e);showToast("⚠️ خطأ في الحفظ")}
  };
  /* Cascade rename in all orders - matches by ID (new data) or name (old data) */
  const renameInOrders=async(type,oldName,newName,entityId)=>{if(oldName===newName||!oldName||!newName)return;
    for(const o of orders){let changed=false;const upd=JSON.parse(JSON.stringify(o));
      if(type==="ws"){(upd.workshopDeliveries||[]).forEach(wd=>{if((entityId&&wd.wsId===entityId)||wd.wsName===oldName){wd.wsName=newName;if(entityId)wd.wsId=entityId;changed=true}})}
      if(type==="garment"){(upd.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType===oldName){wd.garmentType=newName;changed=true};(wd.receives||[]).forEach(r=>{if(r.garmentType===oldName){r.garmentType=newName;changed=true}})});if(upd.orderPieces){upd.orderPieces=upd.orderPieces.map(p=>p===oldName?(changed=true,newName):p)};FKEYS.forEach(k=>{if(upd["fabricPieces"+k]){upd["fabricPieces"+k]=upd["fabricPieces"+k].map(p=>p===oldName?(changed=true,newName):p)}})}
      if(type==="status"&&upd.status===oldName){upd.status=newName;changed=true}
      if(changed)await replaceOrder(o.id,upd);
    }
    if(type==="ws")showToast("✓ تم تحديث "+orders.filter(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===oldName||(entityId&&wd.wsId===entityId))).length+" أوردر");
  };
  /* Sync all existing data with workshop IDs. nameMap: {oldName: wsId} for orphan linking */
  const syncWsIds=async(nameMap)=>{
    const wsList=config.workshops||[];
    const nm=nameMap||{};
    let ordCount=0;
    for(const o of orders){let changed=false;const upd=JSON.parse(JSON.stringify(o));
      (upd.workshopDeliveries||[]).forEach(wd=>{
        /* Match by: wsId → name → nameMap (orphan) */
        let ws=null;
        if(wd.wsId)ws=wsList.find(w=>w.id===wd.wsId);
        if(!ws)ws=wsList.find(w=>w.name===wd.wsName);
        if(!ws&&nm[wd.wsName])ws=wsList.find(w=>w.id===Number(nm[wd.wsName]));
        if(ws){if(wd.wsId!==ws.id){wd.wsId=ws.id;changed=true}if(wd.wsName!==ws.name){wd.wsName=ws.name;changed=true}}
      });
      if(changed){await replaceOrder(o.id,upd);ordCount++}
    }
    let payChanged=false;
    upConfig(d=>{
      (d.wsPayments||[]).forEach(p=>{
        let ws=null;
        if(p.wsId)ws=wsList.find(w=>w.id===p.wsId);
        if(!ws)ws=wsList.find(w=>w.name===p.wsName);
        if(!ws&&nm[p.wsName])ws=wsList.find(w=>w.id===Number(nm[p.wsName]));
        if(ws){if(p.wsId!==ws.id){p.wsId=ws.id;payChanged=true}if(p.wsName!==ws.name){p.wsName=ws.name;payChanged=true}}
      });
    });
    showToast("✓ تم مزامنة "+ordCount+" أوردر"+(payChanged?" + المدفوعات":""));
  };
  const goD=id=>{setSel(id);setTab("details")};
  useEffect(()=>{const h=()=>{const d=window.__labelData;if(d){setLabelPopup(d);setLabelBags(1);delete window.__labelData}};window.addEventListener("show-label-popup",h);return()=>window.removeEventListener("show-label-popup",h)},[]);
  /* QR scan auto-navigate */
  const qrDone=useRef(false);
  useEffect(()=>{if(qrDone.current||orders.length===0)return;
    if(qrModelNo){const o=orders.find(x=>x.modelNo===qrModelNo);if(o){qrDone.current=true;goD(o.id);window.history.replaceState({},"",window.location.pathname)}}
    if(qrAction==="rcv"&&qrOid){const o=orders.find(x=>x.id===qrOid);if(o){qrDone.current=true;setTab("external");window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrReceive={oid:qrOid,wdi:Number(qrWdi)||0};window.dispatchEvent(new Event("qr-receive"))},600)}}
    if(qrAction==="wsacc"&&qrWs){qrDone.current=true;setTab("external");window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrWsAcc={ws:decodeURIComponent(qrWs)};window.dispatchEvent(new Event("qr-wsacc"))},600)}
    if(qrAction==="stock"&&qrOid){const o=orders.find(x=>x.id===qrOid);if(o){qrDone.current=true;goD(o.id);window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrStock=true;window.dispatchEvent(new Event("qr-stock"))},800)}}
  },[orders,qrModelNo,qrAction]);

  /* Auto-resolve wsName from wsId */
  const resolvedOrders=useMemo(()=>{
    try{
      const wsList=config.workshops||[];
      return orders.map(o=>{
        let changed=false;
        const wds=(o.workshopDeliveries||[]).map(wd=>{
          if(wd.wsId){const ws=wsList.find(w=>w.id===wd.wsId);if(ws&&ws.name!==wd.wsName){changed=true;return{...wd,wsName:ws.name}}}
          return wd;
        });
        return changed?{...o,workshopDeliveries:wds}:o;
      });
    }catch(e){console.error("resolvedOrders error:",e);return orders}
  },[orders,config.workshops]);
  const data={...config,orders:resolvedOrders||orders};
  const getUserRole=()=>{if(config.users&&config.users[user?.uid]){const r=config.users[user.uid];return typeof r==="string"?r:r?.role||"admin"}const byEmail=(config.usersList||[]).find(u=>u.email===user?.email);if(byEmail)return byEmail.role;return"admin"};
  const userRole=getUserRole();const canEdit=userRole==="admin"||userRole==="manager";
  const DEFAULT_PERMS={admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit",custDeliver:"edit"},manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"edit"},sales_accountant:{dashboard:"view",details:"view",external:"hide",stock:"view",reports:"edit",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"edit"},purchase_accountant:{dashboard:"view",details:"view",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"hide"},viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide"}};
  const getTabPerm=(tabKey)=>{const perms=config.permissions||{};const defaults=DEFAULT_PERMS[userRole]||DEFAULT_PERMS.viewer;const rolePerm=perms[userRole]||{};return rolePerm[tabKey]||defaults[tabKey]||"view"};
  const canEditTab=(tabKey)=>getTabPerm(tabKey)==="edit";
  const canViewTab=(tabKey)=>getTabPerm(tabKey)!=="hide";
  const statusCards=config.statusCards||DEFAULT_STATUSES;

  /* Status change notification */
  useEffect(()=>{if(orders.length===0)return;const prev=prevStatuses.current;let changed=null;
    orders.forEach(o=>{if(prev[o.id]&&prev[o.id]!==o.status)changed={modelNo:o.modelNo,from:prev[o.id],to:o.status};prev[o.id]=o.status});
    if(changed){setStatusNotif(changed);setTimeout(()=>setStatusNotif(null),60000)}
  },[orders]);

  if(authLoading)return null;
  if(!user)return<LoginScreen/>;
  if(dataLoading)return<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#EFF6FF",direction:"rtl",fontFamily:"'Cairo',sans-serif"}}>
    <div style={{width:140,textAlign:"center"}}>
      <div style={{fontSize:12,fontWeight:700,color:T.accent,marginBottom:8}}>جاري تحميل البيانات</div>
      <div style={{height:6,borderRadius:4,background:"#E2E8F0",overflow:"hidden"}}>
        <div style={{width:"100%",height:"100%",borderRadius:4,background:"linear-gradient(90deg,"+T.accent+","+T.accent+"CC)",transformOrigin:"right",animation:"fillOnce 2s ease-out 1 forwards",transform:"scaleX(0)"}}/>
      </div>
      <style>{`@keyframes fillOnce{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
    </div>
  </div>;
  const userName=user.displayName||user.email.split("@")[0];
  /* Compute alerts */
  const appAlerts=(()=>{try{const a=[];
    data.orders.forEach(o=>{const wds=o.workshopDeliveries||[];const pieces=o.orderPieces||[];
      if(pieces.length===0&&wds.length===0&&o.status==="تم القص"){a.push({msg:o.modelNo+" — "+o.modelDesc+" لم يُسلَّم لأي ورشة",color:T.warn,icon:"⏳",orderId:o.id})}
      /* Pieces not linked to fabric */
      const linkedPieces=new Set();if(pieces.length>0){FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});const unlinked=pieces.filter(p=>!linkedPieces.has(p));unlinked.forEach(p=>a.push({msg:o.modelNo+" — متبقي "+p+" «لم يتم القص»",color:T.purple,icon:"🧵",orderId:o.id}))}
      /* Pieces linked (cut) but not delivered to any workshop */
      if(pieces.length>0){const t=calcOrder(o);pieces.forEach(p=>{if(!linkedPieces.has(p))return;const delivered=wds.some(wd=>wd.garmentType===p);if(!delivered)a.push({msg:o.modelNo+" — "+p+" ("+t.cutQty+" قطعة) متاح للتسليم والتشغيل",color:T.warn,icon:"🏭",orderId:o.id})})}
    });
    /* Delay alerts */
    const now=new Date();data.orders.filter(o=>o.status!=="تم الشحن").forEach(o=>{let lastDate=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});const diff=Math.floor((now-new Date(lastDate))/(1000*60*60*24));if(diff>7&&!a.find(x=>x.orderId===o.id))a.push({msg:o.modelNo+" بدون حركة منذ "+diff+" يوم",color:T.err,icon:"🔴",orderId:o.id})});
    /* Completion */
    const _cutQ=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const _delQ=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);if(_cutQ&&Math.round(_delQ/_cutQ*100)>=100)a.push({msg:"تم الانتهاء من جميع الأوردرات!",color:T.ok,icon:"🎉"});
    /* Workshop limit */
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});const purch=(data.wsPayments||[]).filter(p=>p.wsName===w.name&&p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);const paid=(data.wsPayments||[]).filter(p=>p.wsName===w.name&&p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const pct=w.payPercent||60;const limit=r2((due+purch)*(pct/100));if(paid>limit&&due>0)a.push({msg:w.name+" تجاوز حد "+pct+"%",color:T.err,icon:"⚠️"})});
    /* Smart: Workshop quality alerts */
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{const r=calcWsRating(w.name,data.orders);if(r!==null&&r<5)a.push({msg:w.name+" تقييم منخفض ("+r+"/10) — مراجعة الجودة",color:T.err,icon:"📉"})});
    /* Smart: Workshop delay alerts */
    const _now=new Date();
    /* Approaching deadline alerts */
    data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);if(rcvd>=(Number(wd.qty)||0))return;const days=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const ideal=Math.max(5,Math.round(((Number(wd.qty)||0)/500)*6.5));const remaining=ideal-days;if(remaining>0&&remaining<=2&&days>0)a.push({msg:o.modelNo+" — "+wd.wsName+" باقي "+remaining+" يوم على الموعد",color:"#F59E0B",icon:"⏰",orderId:o.id})})});
    (data.workshops||[]).filter(w=>!wsIsInternal(w.type)).forEach(w=>{let maxDelay=0,delayOrder="";data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);if(rcvd<(Number(wd.qty)||0)){const days=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const ideal=Math.max(5,Math.round(((Number(wd.qty)||0)/500)*6.5));if(days>ideal*1.5&&days>maxDelay){maxDelay=days;delayOrder=o.modelNo}}})});if(maxDelay>0)a.push({msg:w.name+" متأخرة "+maxDelay+" يوم (موديل "+delayOrder+")",color:T.warn,icon:"🕐"})});
    /* Workshop alerts with WhatsApp */
    const _workshops=data.workshops||[];
    _workshops.filter(w=>!wsIsInternal(w.type)).forEach(w=>{const wPhone=w.phone||"";const wsDetails=[];
      data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const wBal=(Number(wd.qty)||0)-rcvd;
        if(wBal>0){const daysSince=Math.floor((_now-new Date(wd.date))/(1000*60*60*24));const agreed=Number(wd.agreedDays)||0;wsDetails.push({modelNo:o.modelNo,qty:wBal,days:daysSince,agreed,garment:wd.garmentType||"",delDate:wd.date,orderId:o.id})}})});
      wsDetails.forEach(d=>{if(d.agreed>0){const remaining=d.agreed-d.days;
        if(remaining<=2&&remaining>=0)a.push({msg:w.name+" باقي "+(remaining||"آخر")+" يوم على تسليم موديل "+d.modelNo+" ("+d.agreed+" يوم متفق)",color:"#F59E0B",icon:"⏰",orderId:d.orderId,wsName:w.name,wsPhone:wPhone,wsDetails:[d]});
        else if(remaining<0)a.push({msg:w.name+" متأخرة "+Math.abs(remaining)+" يوم — موديل "+d.modelNo+" (متفق "+d.agreed+" يوم)",color:T.err,icon:"🔴",orderId:d.orderId,wsName:w.name,wsPhone:wPhone,wsDetails:[d]})}})});
    /* 6. Bottleneck — طقم واقف بسبب قطعة */
    data.orders.forEach(o=>{if(o.closed)return;const pieces=o.orderPieces||[];if(pieces.length<2)return;
      const wds=o.workshopDeliveries||[];const pBal={};
      pieces.forEach(p=>{const del=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const rcv=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).filter(r=>!r.isSettlement).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);pBal[p]={del,rcv,bal:del-rcv}});
      const doneP=pieces.filter(p=>pBal[p].bal===0&&pBal[p].rcv>0);const stuckP=pieces.filter(p=>pBal[p].bal>0);
      if(doneP.length>0&&stuckP.length>0&&stuckP.length<=doneP.length){
        const minDone=Math.min(...doneP.map(p=>pBal[p].rcv));
        stuckP.forEach(p=>{const ws=wds.filter(wd=>wd.garmentType===p&&(Number(wd.qty)||0)-(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0)>0);
          const wsName=ws[0]?.wsName||"";const wsObj=_workshops.find(w=>w.name===wsName);const wPhone=wsObj?.phone||"";
          const stuckQty=pBal[p].bal;const waitingSets=Math.min(stuckQty,minDone>0?stuckQty:0);
          a.push({msg:"🚨 موديل "+o.modelNo+" — طقم واقف! "+p+" ("+stuckQty+" قطعة) عند "+(wsName||"ورشة")+" — باقي القطع جاهزة",
            color:"#DC2626",icon:"🚨",orderId:o.id,wsName,wsPhone:wPhone,wsDetails:[{modelNo:o.modelNo,qty:stuckQty,days:0,agreed:0,garment:p}]})})}});
    return a}catch(e){console.error("Alert error:",e);return[]}})();

  /* User notifications */
  const userEmail=user?.email||"";
  const userNotifs=(config.notifications||[]).filter(n=>n.toEmail===userEmail||n.toEmail==="all").filter(n=>!(n.readBy||[]).includes(userEmail));
  const markRead=(nid)=>upConfig(d=>{const n=(d.notifications||[]).find(x=>x.id===nid);if(n){if(!n.readBy)n.readBy=[];if(!n.readBy.includes(userEmail))n.readBy.push(userEmail)}});
  const allAlerts=[...userNotifs.map(n=>({msg:n.msg,color:n.type==="طلب"?"#8B5CF6":n.type==="مهمة"?T.accent:T.warn,icon:n.type==="طلب"?"📩":n.type==="مهمة"?"📌":"💬",orderId:n.orderId||null,isNotif:true,notifId:n.id,from:n.fromName,date:n.createdAt})),...appAlerts];
  const alertCount=allAlerts.length;
  /* Urgent tasks - separate from bell */
  const urgentTasks=(config.notifications||[]).filter(n=>n.type==="مهمة عاجلة"&&(n.toEmail===userEmail||n.toEmail==="all")&&!(n.doneBy||[]).includes(userEmail));
  const markTaskDone=(nid)=>upConfig(d=>{const n=(d.notifications||[]).find(x=>x.id===nid);if(n){if(!n.doneBy)n.doneBy=[];if(!n.doneBy.includes(userEmail))n.doneBy.push(userEmail)}});

  const goHome=()=>{if(window.__formDirty){if(!confirm("هل تريد الخروج بدون حفظ البيانات المدخلة؟"))return;window.__formDirty=false}setTab("home");setSel(null)};
  const goTo=(key)=>{if(window.__formDirty){if(!confirm("هل تريد الخروج بدون حفظ البيانات المدخلة؟"))return;window.__formDirty=false}setTab(key);if(key!=="details")setSel(null)};

  return<div onClick={()=>{if(showAlerts)setShowAlerts(false);if(gSearch)setGSearch("");if(showLogout)setShowLogout(false)}} style={{minHeight:"100vh",direction:"rtl",fontFamily:"'Cairo',sans-serif",background:T.bg,color:T.text,fontSize:FS,display:"flex",flexDirection:"column"}}>
    {/* Top Bar */}
    <div style={{padding:isMob?"8px 10px":"12px 28px",background:T.cardSolid,borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:isMob?6:10}}>
        {tab!=="home"&&<div onClick={goHome} title="الصفحة الرئيسية" style={{cursor:"pointer",fontSize:isMob?22:28,color:T.accent,padding:isMob?"4px 8px":"6px 12px",borderRadius:10,background:T.accentBg,lineHeight:1}}>{"⌂"}</div>}
        <img src={config.logo||CLARK_LOGO} alt="CLARK" style={{height:isMob?22:28,objectFit:"contain"}}/>
        <span style={{fontSize:isMob?10:FS-1,color:T.textSec,padding:"2px 8px",background:T.accentBg,borderRadius:6}}>{season}</span>
        <span style={{fontSize:isMob?9:FS-2,padding:"2px 8px",borderRadius:6,fontWeight:700,background:justReconnected?"#10B98118":isOnline?"#10B98108":"#EF444418",color:justReconnected?"#10B981":isOnline?"#10B981":"#EF4444",transition:"all 0.5s"}}>{justReconnected?"✓ تم المزامنة":isOnline?"● متصل":"○ غير متصل"}</span>
      </div>
      {!isMob&&<div onClick={e=>e.stopPropagation()} style={{flex:1,display:"flex",justifyContent:"center",position:"relative"}}>
        <div style={{position:"relative",width:280}}>
          <input value={gSearch} onChange={e=>setGSearch(e.target.value)} placeholder="🔍 بحث سريع..." style={{width:"100%",padding:"5px 12px",borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.inputBg||T.cardSolid,color:T.text,boxSizing:"border-box",outline:"none"}}/>
          {gSearch.trim()&&(()=>{const q=gSearch.trim().toLowerCase();const res=[];
            data.orders.forEach(o=>{if([o.modelNo,o.modelDesc].join(" ").toLowerCase().includes(q))res.push({type:"أوردر",label:o.modelNo+" — "+o.modelDesc,action:()=>{goD(o.id);setGSearch("")}})});
            (data.workshops||[]).forEach(w=>{if(w.name.toLowerCase().includes(q))res.push({type:"ورشة",label:w.name+(w.owner?" — "+w.owner:""),action:()=>{setDbSub("ws");setTab("db");setGSearch("")}})});
            (data.fabrics||[]).forEach(f=>{if(f.name.toLowerCase().includes(q))res.push({type:"خامة",label:f.name,action:()=>{setDbSub("fab");setTab("db");setGSearch("")}})});
            (data.accessories||[]).forEach(a=>{if(a.name.toLowerCase().includes(q))res.push({type:"اكسسوار",label:a.name,action:()=>{setDbSub("acc");setTab("db");setGSearch("")}})});
            return<div style={{position:"absolute",top:"100%",right:0,left:0,marginTop:4,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:10,boxShadow:"0 8px 30px rgba(0,0,0,0.15)",zIndex:999,maxHeight:300,overflow:"auto"}}>
              {res.slice(0,8).map((r,i)=><div key={i} onClick={r.action} style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:FS-1}} onMouseEnter={e=>e.currentTarget.style.background=T.accentBg} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span>{r.label}</span><span style={{fontSize:FS-3,color:T.textMut,background:T.bg,padding:"1px 6px",borderRadius:4}}>{r.type}</span>
              </div>)}
              {res.length===0&&<div style={{padding:12,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>}
            </div>})()}
        </div>
      </div>}
      <div style={{display:"flex",alignItems:"center",gap:isMob?6:10}}>
        {/* Urgent Tasks - desktop only */}
        {!isMob&&urgentTasks.length>0&&<div style={{display:"flex",gap:6,alignItems:"center",maxWidth:400,overflow:"auto"}}>
          {urgentTasks.map(t=><div key={t.id} onClick={()=>{markTaskDone(t.id);showToast("✓ تم تنفيذ المهمة")}} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:8,background:"#EF444418",border:"1px solid #EF444440",cursor:"pointer",animation:"pulse 2s infinite",whiteSpace:"nowrap",transition:"all 0.2s"}} onMouseEnter={e=>e.currentTarget.style.background="#EF444430"} onMouseLeave={e=>e.currentTarget.style.background="#EF444418"}>
            <span style={{fontSize:12}}>🔴</span>
            <span style={{fontSize:FS-2,fontWeight:700,color:"#EF4444"}}>{t.msg}</span>
            <span style={{fontSize:10,color:"#EF444480"}}>✓</span>
          </div>)}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}`}</style>
        </div>}
        {/* Status change notification */}
        {statusNotif&&<div onClick={()=>setStatusNotif(null)} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:8,background:"#8B5CF612",border:"1px solid #8B5CF630",cursor:"pointer",animation:"pulse 2s infinite",fontSize:isMob?10:FS-1,maxWidth:isMob?120:280,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
          <span style={{fontSize:isMob?10:14}}>🔄</span><span style={{fontWeight:700,color:"#8B5CF6"}}>{statusNotif.modelNo}</span>{!isMob&&<span style={{color:T.textSec}}>{statusNotif.from+" ← "+statusNotif.to}</span>}
        </div>}
        {/* Alerts Bell */}
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <div onClick={()=>setShowAlerts(!showAlerts)} title="التنبيهات والإشعارات" style={{cursor:"pointer",fontSize:isMob?18:22,padding:"2px 6px",borderRadius:8,background:alertCount>0?T.warn+"12":"transparent",position:"relative"}}>🔔
            {alertCount>0&&<span style={{position:"absolute",top:-2,left:-2,width:16,height:16,borderRadius:8,background:T.err,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{alertCount}</span>}
          </div>
          {showAlerts&&<><div onClick={()=>setShowAlerts(false)} style={{position:"fixed",inset:0,zIndex:998}}/><div style={{position:"absolute",top:"100%",left:0,marginTop:6,width:isMob?280:340,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:12,boxShadow:"0 8px 30px rgba(0,0,0,0.15)",zIndex:999,maxHeight:400,overflow:"auto"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,fontWeight:700,fontSize:FS,color:T.text}}>{"الاشعارات ("+alertCount+")"}</div>
            {alertCount>0?allAlerts.map((a,i)=><div key={i} onClick={()=>{if(a.isNotif)markRead(a.notifId);if(a.orderId){goD(a.orderId);setShowAlerts(false)}else if(a.isNotif)setShowAlerts(false)}} style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,display:"flex",gap:8,alignItems:"flex-start",cursor:a.orderId||a.isNotif?"pointer":"default",background:a.isNotif?a.color+"06":"transparent",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=a.color+"12"} onMouseLeave={e=>e.currentTarget.style.background=a.isNotif?a.color+"06":"transparent"}>
              <span style={{fontSize:16,flexShrink:0}}>{a.icon}</span>
              <div style={{flex:1}}><span style={{fontSize:FS-1,color:a.color,fontWeight:600,lineHeight:1.5}}>{a.msg}</span>{a.from&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{"من: "+a.from+(a.date?" — "+a.date:"")}</div>}{a.orderId&&!a.isNotif&&!a.wsPhone&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>اضغط لفتح الأوردر</div>}</div>
              {a.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(a.wsDetails||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+a.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";window.open("https://wa.me/"+(a.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank")}} style={{cursor:"pointer",fontSize:14,color:"#25D366",flexShrink:0,padding:"2px 4px"}}>📱</span>}
            </div>):<div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد اشعارات</div>}
          </div></>}
        </div>
        <span style={{color:T.textMut,fontSize:12,userSelect:"none"}}>-</span>
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <div onClick={()=>setAiOpen(!aiOpen)} style={{cursor:"pointer",fontSize:isMob?16:18,padding:"3px 8px",borderRadius:8,background:aiOpen?"linear-gradient(135deg,#0EA5E920,#8B5CF620)":visibleAlerts.length>0?"#EF444410":"transparent",transition:"all 0.2s",display:"flex",alignItems:"center",gap:isMob?0:4,position:"relative"}}><span>🤖</span>{!isMob&&<span style={{fontSize:FS-2,fontWeight:600,color:aiOpen?"#8B5CF6":T.textSec}}>AI</span>}
            {visibleAlerts.length>0&&<span style={{position:"absolute",top:-2,right:isMob?-2:-4,width:16,height:16,borderRadius:8,background:"#EF4444",color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{visibleAlerts.length}</span>}
          </div>
          {!isMob&&aiOpen&&<><div onClick={()=>setAiOpen(false)} style={{position:"fixed",inset:0,zIndex:9998}}/><div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",marginTop:8,zIndex:9999}}>
            <div style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:"0 8px 40px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",height:460,width:380}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0EA5E910,#8B5CF610)",borderRadius:"16px 16px 0 0"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🤖</span><span style={{fontWeight:800,fontSize:FS+1,color:T.text}}>مساعد CLARK</span></div>
                <div style={{display:"flex",gap:4}}>
                  {aiMsgs.length>0&&<span onClick={()=>setAiMsgs([])} style={{cursor:"pointer",fontSize:11,padding:"2px 8px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:600}}>مسح</span>}
                  <span onClick={()=>setAiOpen(false)} style={{cursor:"pointer",fontSize:16,color:T.textMut}}>✕</span>
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
                {aiMsgs.length===0&&<div>
                  {visibleAlerts.length>0&&<div style={{marginBottom:12}}>
                    <div style={{fontSize:FS-1,fontWeight:800,color:T.text,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"⚡ "+visibleAlerts.length+" تنبيه"}</div>
                    {visibleAlerts.map((al,i)=><div key={i} onClick={()=>{setAiInput(al.text);}} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",marginBottom:4,borderRadius:10,background:al.type==="late"?"#FEF2F2":al.type==="ready"?"#F0FDF4":al.type==="overpaid"?"#FFF7ED":al.type==="slow"?"#FFFBEB":"#F8FAFC",border:"1px solid "+(al.type==="late"?"#FECACA":al.type==="ready"?"#BBF7D0":al.type==="overpaid"?"#FED7AA":al.type==="slow"?"#FDE68A":"#E2E8F0"),cursor:"pointer",transition:"all 0.15s"}}>
                      <span style={{fontSize:16,flexShrink:0}}>{al.icon}</span>
                      <span style={{fontSize:FS-2,color:"#1E293B",fontWeight:600,lineHeight:1.5,flex:1}}>{al.text}</span>{al.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(al.details||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+al.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";window.open("https://wa.me/"+(al.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank");dismissAlert(al.text)}} style={{cursor:"pointer",fontSize:10,color:"#25D366",flexShrink:0,padding:"0 4px",fontWeight:700}}>📱</span>}<span onClick={e=>{e.stopPropagation();dismissAlert(al.text)}} style={{cursor:"pointer",fontSize:10,color:"#94A3B8",flexShrink:0,padding:"0 2px"}}>✕</span>
                    </div>)}
                    <div style={{textAlign:"center",margin:"10px 0",fontSize:FS-2,color:T.textMut,letterSpacing:4}}>— — —</div>
                  </div>}
                  <div style={{textAlign:"center",padding:visibleAlerts.length>0?8:20,color:T.textMut}}>
                    {visibleAlerts.length===0&&<div style={{fontSize:32,marginBottom:8}}>🤖</div>}
                    <div style={{fontSize:FS-1,fontWeight:600,marginBottom:4}}>اسألني عن أي حاجة</div>
                    <div style={{fontSize:FS-2,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{"• موديل 3262 فين؟\n• ملخص الورش\n• كام أوردر متأخر؟"}</div>
                  </div>
                </div>}
                {aiMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-start":"flex-end"}}>
                  <div style={{maxWidth:"85%",padding:"8px 12px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",background:m.role==="user"?T.accent:T.bg,color:m.role==="user"?"#fff":T.text,fontSize:FS-1,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
                </div>)}
                {aiLoading&&<div style={{display:"flex",justifyContent:"flex-end"}}><div style={{padding:"8px 16px",borderRadius:12,background:T.bg,fontSize:FS-1,color:T.textMut}}>⏳ جاري التحليل...</div></div>}
              </div>
              <div style={{padding:"8px 12px",borderTop:"1px solid "+T.brd,display:"flex",gap:6}}>
                <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")askAI()}} placeholder="اسأل عن أي حاجة..." style={{flex:1,padding:"8px 12px",borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.bg,color:T.text,outline:"none",boxSizing:"border-box"}}/>
                <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} style={{padding:"8px 14px",borderRadius:10,border:"none",background:aiInput.trim()?"linear-gradient(135deg,#0EA5E9,#8B5CF6)":"#E2E8F0",color:aiInput.trim()?"#fff":"#94A3B8",cursor:aiInput.trim()?"pointer":"default",fontSize:14,fontWeight:700}}>📩</button>
              </div>
            </div>
          </div></>}
        </div>
        {!isMob&&<span style={{fontSize:FS,color:T.textSec}}>{userName}</span>}
        {/* Theme picker - desktop only */}
        {!isMob&&<div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <div onClick={()=>setShowTheme(!showTheme)} style={{cursor:"pointer",width:22,height:22,borderRadius:6,background:T.accent,border:"2px solid "+T.brd,transition:"transform 0.2s"}} title="تغيير المظهر"/>
          {showTheme&&<div style={{position:"absolute",top:"100%",left:0,marginTop:6,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:10,boxShadow:"0 8px 30px rgba(0,0,0,0.15)",zIndex:999,padding:8,display:"flex",gap:6}}>
            {Object.entries(THEMES).map(([key,th])=><div key={key} onClick={()=>{setTheme(key);setShowTheme(false)}} style={{cursor:"pointer",padding:"8px 14px",borderRadius:8,background:th.bg,border:theme===key?"2px solid "+th.accent:"1px solid "+th.brd,textAlign:"center",transition:"all 0.15s",minWidth:60}}>
              <div style={{width:18,height:18,borderRadius:5,background:th.accent,margin:"0 auto 4px"}}/>
              <div style={{fontSize:FS-2,fontWeight:700,color:th.text,whiteSpace:"nowrap"}}>{th.name}{theme===key?" ✓":""}</div>
            </div>)}
          </div>}
        </div>}
        {!isMob&&(()=>{const td=new Date().toISOString().split("T")[0];let ops=0;data.orders.forEach(o=>{if(o.date===td)ops++;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date===td)ops++;(wd.receives||[]).forEach(r=>{if(r.date===td)ops++})});(o.deliveries||[]).forEach(d=>{if(d.date===td)ops++})});return ops>0?<span style={{fontSize:FS-2,padding:"2px 6px",borderRadius:6,background:T.ok+"12",color:T.ok,fontWeight:700}}>{ops+" عملية"}</span>:null})()}
        {!showLogout?<button onClick={e=>{e.stopPropagation();setShowLogout(true)}} style={{padding:isMob?"4px 10px":"6px 14px",borderRadius:8,background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",cursor:"pointer",fontSize:isMob?11:FS-1,fontWeight:600,fontFamily:"inherit"}}>خروج</button>
        :<div onClick={e=>e.stopPropagation()} style={{display:"flex",gap:4,alignItems:"center"}}><button onClick={()=>signOut(auth)} style={{padding:isMob?"4px 8px":"5px 12px",borderRadius:6,background:T.err,color:"#fff",border:"none",cursor:"pointer",fontSize:isMob?10:FS-1,fontWeight:700,fontFamily:"inherit"}}>تأكيد</button><button onClick={()=>setShowLogout(false)} style={{padding:isMob?"4px 8px":"5px 12px",borderRadius:6,background:T.cardSolid,color:T.textSec,border:"1px solid "+T.brd,cursor:"pointer",fontSize:isMob?10:FS-1,fontWeight:600,fontFamily:"inherit"}}>الغاء</button></div>}
      </div>
    </div>
    <div style={{flex:1,overflow:"auto",padding:isMob?"8px 10px":"12px 24px"}}>
      {/* HOME SCREEN */}
      {tab==="home"&&<div>
          <div style={{textAlign:"center",marginBottom:isMob?14:20}}><h1 style={{fontSize:isMob?22:32,fontWeight:800,color:T.text,margin:0}}>{"مرحباً، "+userName}</h1></div>
          {/* ══ Desktop: 3-column layout ══ */}
          {!isMob?<div style={{display:"flex",gap:16,maxWidth:1200,margin:"0 auto",alignItems:"flex-start"}}>
            {/* ── Left 25%: Sticky Notes ── */}
            <div style={{flex:"0 0 24%",minWidth:0}}>
              {(()=>{const uemail=user?.email||"";const COLORS=[{key:"#FEF9C3",border:"#EAB308",name:"أصفر"},{key:"#DBEAFE",border:"#3B82F6",name:"أزرق"},{key:"#DCFCE7",border:"#22C55E",name:"أخضر"},{key:"#FCE7F3",border:"#EC4899",name:"وردي"},{key:"#EDE9FE",border:"#8B5CF6",name:"بنفسجي"},{key:"#FFEDD5",border:"#F97316",name:"برتقالي"}];
                const allNotes=(config.stickyNotes||[]);const myNotes=allNotes.filter(n=>n.email===uemail);
                const saveNote=(note)=>{upTasks(d=>{if(!d.stickyNotes)d.stickyNotes=[];const idx=d.stickyNotes.findIndex(n=>n.id===note.id);if(idx>=0)d.stickyNotes[idx]=note;else{if(d.stickyNotes.filter(n=>n.email===uemail).length>=20){showToast("⚠️ الحد الاقصى 20 ملاحظة");return}d.stickyNotes.push(note)}});setStickyForm(null);showToast("✓ تم الحفظ")};
                const delNote=(id)=>{upTasks(d=>{d.stickyNotes=(d.stickyNotes||[]).filter(n=>n.id!==id)})};
                return<div style={{width:"100%",maxWidth:220,margin:"0 auto"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                    <span style={{fontSize:FS,fontWeight:700,color:T.textSec}}>{"📝 ملاحظاتي"+(myNotes.length>0?" ("+myNotes.length+"/20)":"")}</span>
                    <span onClick={()=>setStickyForm({id:gid(),email:uemail,title:"",text:"",color:"#FEF9C3",date:new Date().toISOString().split("T")[0]})} style={{cursor:"pointer",fontSize:FS-2,padding:"3px 10px",borderRadius:6,background:T.accent+"12",color:T.accent,fontWeight:700}}>+</span>
                  </div>
                  {stickyForm&&<div style={{background:stickyForm.color,borderRadius:10,padding:10,border:"2px solid "+(COLORS.find(c=>c.key===stickyForm.color)?.border||"#EAB308")+"40",marginBottom:10,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
                    <div style={{display:"flex",gap:3,marginBottom:6}}>{COLORS.map(c=><div key={c.key} onClick={()=>setStickyForm(p=>({...p,color:c.key}))} style={{width:16,height:16,borderRadius:4,background:c.key,border:stickyForm.color===c.key?"2px solid "+c.border:"1px solid #ccc",cursor:"pointer"}}/>)}</div>
                    <input value={stickyForm.title} onChange={e=>setStickyForm(p=>({...p,title:e.target.value}))} placeholder="العنوان..." style={{width:"100%",padding:"4px 8px",borderRadius:6,border:"1px solid #ddd",fontSize:FS-1,fontFamily:"inherit",fontWeight:700,background:"rgba(255,255,255,0.6)",marginBottom:4,boxSizing:"border-box"}}/>
                    <textarea value={stickyForm.text} onChange={e=>setStickyForm(p=>({...p,text:e.target.value}))} placeholder="ملاحظة..." rows={2} style={{width:"100%",padding:"4px 8px",borderRadius:6,border:"1px solid #ddd",fontSize:FS-2,fontFamily:"inherit",background:"rgba(255,255,255,0.6)",resize:"none",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:4,marginTop:6}}><Btn primary small onClick={()=>{if(!stickyForm.title?.trim()&&!stickyForm.text?.trim())return;saveNote(stickyForm)}} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setStickyForm(null)} title="إغلاق">✕</Btn></div>
                  </div>}
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {myNotes.map(n=>{const bc=COLORS.find(c=>c.key===n.color);return<div key={n.id} style={{background:n.color||"#FEF9C3",borderRadius:10,padding:"8px 10px",border:"1px solid "+(bc?.border||"#EAB308")+"30",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                        {n.title&&<div style={{fontWeight:700,fontSize:FS-1,color:"#1E293B",marginBottom:2,flex:1,lineHeight:1.3}}>{n.title}</div>}
                        <div style={{display:"flex",gap:2,flexShrink:0}}>
                          <span onClick={()=>setStickyForm({...n})} style={{cursor:"pointer",fontSize:10,opacity:0.4}}>✏️</span>
                          <span onClick={()=>delNote(n.id)} style={{cursor:"pointer",fontSize:10,opacity:0.4}}>✕</span>
                        </div>
                      </div>
                      {n.text&&<div style={{fontSize:FS-2,color:"#334155",lineHeight:1.4,whiteSpace:"pre-wrap"}}>{n.text}</div>}
                      <div style={{fontSize:FS-3,color:"#94A3B8",marginTop:4}}>{n.date}</div>
                    </div>})}
                  </div>
                </div>})()}
            </div>
            {/* ── Center 50%: App Grid + Actions ── */}
            <div style={{flex:"0 0 50%",minWidth:0}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
                {[...TABS.filter(t=>canViewTab(t.key))].sort((a,b)=>a.key==="settings"?1:b.key==="settings"?-1:0).map(t=>{const perm=getTabPerm(t.key);return<div key={t.key} onClick={()=>goTo(t.key)} style={{background:T.cardSolid,borderRadius:16,padding:"16px 8px",border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"transform 0.15s,box-shadow 0.15s",opacity:perm==="view"?0.75:1,position:"relative",aspectRatio:"1"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 30px rgba(0,0,0,0.12)"}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=T.shadow}}>
                  <div style={{width:48,height:48,borderRadius:14,background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px",fontSize:24}}>{t.icon}</div>
                  <div style={{fontSize:FS-1,fontWeight:700,color:T.text}}>{t.label}</div>
                  {perm==="view"&&<div style={{position:"absolute",top:4,left:4,fontSize:8,padding:"1px 4px",borderRadius:3,background:T.warn+"18",color:T.warn,fontWeight:700}}>👁</div>}
                </div>})}
              </div>
              <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}>
                <div onClick={()=>setQuickPopup("task")} style={{cursor:"pointer",padding:"10px 20px",borderRadius:12,background:T.accent+"10",border:"1px solid "+T.accent+"25",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"20"} onMouseLeave={e=>e.currentTarget.style.background=T.accent+"10"}>
                  <span style={{fontSize:18}}>📌</span><span style={{fontSize:FS,fontWeight:700,color:T.accent}}>مهمة</span>
                </div>
                <div onClick={()=>setQuickPopup("notif")} style={{cursor:"pointer",padding:"10px 20px",borderRadius:12,background:"#8B5CF610",border:"1px solid #8B5CF625",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#8B5CF620"} onMouseLeave={e=>e.currentTarget.style.background="#8B5CF610"}>
                  <span style={{fontSize:18}}>📩</span><span style={{fontSize:FS,fontWeight:700,color:"#8B5CF6"}}>اشعار</span>
                </div>
                <div onClick={()=>setBarcodePopup({mode:"manual",modelId:"",size:"",qty:1,serial:1})} style={{cursor:"pointer",padding:"10px 20px",borderRadius:12,background:"#F59E0B10",border:"1px solid #F59E0B25",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#F59E0B20"} onMouseLeave={e=>e.currentTarget.style.background="#F59E0B10"}>
                  <span style={{fontSize:18}}>🏷️</span><span style={{fontSize:FS,fontWeight:700,color:"#F59E0B"}}>طباعة QR</span>
                </div>
              </div>
            </div>
            {/* ── Right 25%: Tasks ── */}
            <div style={{flex:"0 0 24%",minWidth:0}}>
              {(()=>{const uid=user?.uid||"";const uemail=user?.email||"";const rawTasks=(config||{}).tasks;const tasksList=Array.isArray(rawTasks)?rawTasks:[];const myTasks=tasksList.filter(t=>(t.toEmail===uemail||t.toUid===uid)&&!t.done);
                return<div style={{width:"100%",maxWidth:240,margin:"0 auto"}}>{myTasks.length>0?<div style={{background:"#FEF9C3",borderRadius:16,border:"1px solid #EAB30830",padding:14,boxShadow:"0 2px 8px rgba(234,179,8,0.08)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontSize:18}}>📌</span><span style={{fontSize:FS,fontWeight:800,color:"#92400E"}}>{"مهامي ("+myTasks.length+")"}</span></div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>{myTasks.slice(0,8).map(t=><div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,0.7)",border:"1px solid #EAB30820"}}>
                    <span onClick={()=>upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const tk=arr.find(x=>x.id===t.id);if(tk){tk.done=true;tk.doneAt=new Date().toISOString()}})} style={{cursor:"pointer",fontSize:16,flexShrink:0,marginTop:1}}>⬜</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:FS-1,fontWeight:600,color:"#1C1917",lineHeight:1.4}}>{t.text}</div>
                      <div style={{fontSize:FS-3,color:"#78716C",marginTop:1}}>{"من: "+(t.fromName||"—")}</div>
                    </div>
                  </div>)}</div>
                  {myTasks.length>8&&<div style={{textAlign:"center",marginTop:6}}><span onClick={()=>goTo("tasks")} style={{cursor:"pointer",fontSize:FS-2,color:"#92400E",fontWeight:700}}>{"عرض الكل ("+myTasks.length+")"}</span></div>}
                </div>:<div style={{textAlign:"center",padding:20,color:T.textMut,fontSize:FS-1}}>{"📌 لا توجد مهام"}</div>}</div>})()}
            </div>
          </div>
          :<div>{/* ══ Mobile ══ */}
            <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:10}}>
              {[...TABS.filter(t=>canViewTab(t.key))].sort((a,b)=>a.key==="settings"?1:b.key==="settings"?-1:0).map(t=>{const perm=getTabPerm(t.key);return<div key={t.key} onClick={()=>goTo(t.key)} style={{background:T.cardSolid,borderRadius:16,padding:"16px 8px",border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"transform 0.15s",opacity:perm==="view"?0.75:1,position:"relative",width:"calc(33.33% - 8px)",boxSizing:"border-box"}}>
                <div style={{width:44,height:44,borderRadius:14,background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:22}}>{t.icon}</div>
                <div style={{fontSize:FS-3,fontWeight:700,color:T.text}}>{t.label}</div>
                {perm==="view"&&<div style={{position:"absolute",top:6,left:6,fontSize:9,padding:"1px 6px",borderRadius:4,background:T.warn+"18",color:T.warn,fontWeight:700}}>👁</div>}
              </div>})}
            </div>
            <div onClick={()=>setShowScanner("menu")} style={{margin:"16px auto 0",display:"flex",justifyContent:"center"}}><div style={{background:"linear-gradient(135deg,#0EA5E9,#8B5CF6)",borderRadius:14,padding:"14px 30px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 20px rgba(14,165,233,0.3)"}}><span style={{fontSize:24}} title="فتح كاميرا QR">📷</span><span style={{fontSize:FS+1,fontWeight:700,color:"#fff"}}>مسح QR</span></div></div>
            {(()=>{const uid=user?.uid||"";const uemail=user?.email||"";const rawTasks=(config||{}).tasks;const tasksList=Array.isArray(rawTasks)?rawTasks:[];const myTasks=tasksList.filter(t=>(t.toEmail===uemail||t.toUid===uid)&&!t.done);
              return myTasks.length>0&&<div style={{marginTop:16}}>
                <div style={{background:"#FEF9C3",borderRadius:16,border:"1px solid #EAB30830",padding:14,boxShadow:"0 2px 8px rgba(234,179,8,0.08)"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontSize:18}}>📌</span><span style={{fontSize:FS,fontWeight:800,color:"#92400E"}}>{"مهامي ("+myTasks.length+")"}</span></div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>{myTasks.slice(0,5).map(t=><div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,0.7)",border:"1px solid #EAB30820"}}>
                  <span onClick={()=>upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const tk=arr.find(x=>x.id===t.id);if(tk){tk.done=true;tk.doneAt=new Date().toISOString()}})} style={{cursor:"pointer",fontSize:16}}>⬜</span>
                  <div style={{flex:1}}><div style={{fontSize:FS-1,fontWeight:600,color:"#1C1917"}}>{t.text}</div><div style={{fontSize:FS-3,color:"#78716C"}}>{"من: "+(t.fromName||"—")}</div></div>
                </div>)}</div>
              </div></div>})()}
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"center",flexWrap:"wrap"}}>
              <div onClick={()=>setQuickPopup("task")} style={{cursor:"pointer",padding:"10px 16px",borderRadius:12,background:T.accent+"10",border:"1px solid "+T.accent+"25",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:16}}>📌</span><span style={{fontSize:FS-1,fontWeight:700,color:T.accent}}>مهمة</span>
              </div>
              <div onClick={()=>setQuickPopup("notif")} style={{cursor:"pointer",padding:"10px 16px",borderRadius:12,background:"#8B5CF610",border:"1px solid #8B5CF625",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:16}}>📩</span><span style={{fontSize:FS-1,fontWeight:700,color:"#8B5CF6"}}>اشعار</span>
              </div>
              <div onClick={()=>setBarcodePopup({mode:"manual",modelId:"",size:"",qty:1,serial:1})} style={{cursor:"pointer",padding:"10px 16px",borderRadius:12,background:"#F59E0B10",border:"1px solid #F59E0B25",display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:16}}>🏷️</span><span style={{fontSize:FS-1,fontWeight:700,color:"#F59E0B"}}>طباعة QR</span>
              </div>
            </div>
          </div>}
      </div>}
      {/* PAGES with back button */}
      {tab!=="home"&&canViewTab(tab)&&<div>
        {tab==="dashboard"&&<DashPg data={data} goD={goD} isMob={isMob} isTab={isTab} season={season} statusCards={statusCards} upConfig={upConfig} user={user} setCardPopup={setCardPopup} setWsAccPopup={setWsAccPopup}/>}
        {tab==="db"&&<DBPg data={data} upConfig={upConfig} isMob={isMob} isTab={isTab} canEdit={canEditTab("db")} statusCards={statusCards} initialSub={dbSub} onSubUsed={()=>setDbSub(null)} renameInOrders={renameInOrders}/>}
        {tab==="details"&&<DetPg data={data} updOrder={updOrder} replaceOrder={replaceOrder} addOrder={addOrder} delOrder={delOrder} sel={sel} setSel={setSel} isMob={isMob} isTab={isTab} canEdit={canEditTab("details")} statusCards={statusCards} goHome={goHome} upConfig={upConfig} user={user}/>}
        {tab==="external"&&<ExtProdPg data={data} updOrder={updOrder} upConfig={upConfig} isMob={isMob} isTab={isTab} canEdit={canEditTab("external")} statusCards={statusCards} season={season} user={user}/>}
        {tab==="stock"&&<StockPg data={data} updOrder={updOrder} isMob={isMob} canEdit={canEditTab("stock")} statusCards={statusCards} user={user}/>}
        {tab==="tasks"&&<TasksPg data={data} upConfig={upConfig} upTasks={upTasks} isMob={isMob} user={user} userRole={userRole}/>}
        {tab==="calc"&&<CalcPg data={data} isMob={isMob}/>}
        {tab==="reports"&&<ReportsHub data={data} isMob={isMob} season={season} statusCards={statusCards}/>}
        {tab==="settings"&&canEditTab("settings")&&<SettingsPg config={config} upConfig={upConfig} upSales={upSales} upTasks={upTasks} isMob={isMob} user={user} theme={theme} setTheme={setTheme} season={season} orders={orders} syncWsIds={syncWsIds} replaceOrder={replaceOrder} updOrder={updOrder} configDoc={configDoc} salesDoc={salesDoc} tasksDoc={tasksDoc}/>}
        {tab==="custDeliver"&&<CustDeliverPg data={data} upConfig={upConfig} upSales={upSales} upTasks={upTasks} updOrder={updOrder} isMob={isMob} isTab={isTab} canEdit={canEditTab("custDeliver")} user={user} season={season}/>}
      </div>}
    </div>
    {/* Quick Task/Notification Popup */}
    {quickPopup&&(()=>{const allUsers=(config.usersList||[]);const me={email:user?.email||"",name:user?.displayName||(user?.email||"").split("@")[0],role:userRole};
      const targets=allUsers.find(u=>u.email===me.email)?allUsers:[me,...allUsers];
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير")}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}><Btn ghost small onClick={()=>{setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير")}}>✕</Btn></div>
        <div style={{display:"flex",gap:0,marginBottom:14,borderRadius:10,overflow:"hidden",border:"1px solid "+T.brd}}>
          <div onClick={()=>{setQuickPopup("task");setQpTo("");setQpText("")}} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:quickPopup==="task"?T.accent:T.bg,color:quickPopup==="task"?"#fff":T.text}}>📌 مهمة</div>
          <div onClick={()=>{setQuickPopup("notif");setQpTo("all");setQpText("")}} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:quickPopup==="notif"?"#8B5CF6":T.bg,color:quickPopup==="notif"?"#fff":T.text}}>📩 اشعار</div>
        </div>
        {quickPopup==="task"?<div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ارسال الى</label><Sel value={qpTo} onChange={setQpTo}><option value="">-- اختر --</option>{targets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===me.email?" (أنا)":"")+" — "+(u.role==="admin"?"مدير النظام":u.role==="manager"?"مدير انتاج":u.role==="sales_accountant"?"محاسب مبيعات":u.role==="purchase_accountant"?"محاسب مشتريات":"مشاهد")}</option>)}</Sel></div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المهمة</label><Inp value={qpText} onChange={setQpText} placeholder="اكتب المهمة..."/></div>
          <Btn primary onClick={()=>{if(!qpTo||!qpText.trim())return;const target=targets.find(u=>u.email===qpTo);
            upTasks(d=>{if(!Array.isArray(d.tasks))d.tasks=[];d.tasks.unshift({id:Date.now(),text:qpText.trim(),done:false,date:new Date().toISOString().split("T")[0],fromUid:user?.uid||"",fromEmail:user?.email||"",fromName:me.name,toEmail:qpTo,toName:target?.name||qpTo.split("@")[0]})});
            setQuickPopup(null);setQpTo("");setQpText("");showToast("✓ تم ارسال المهمة")}} style={{width:"100%"}}>📌 ارسال المهمة</Btn>
        </div>:<div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الى</label><Sel value={qpTo} onChange={setQpTo}><option value="all">الكل</option>{targets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===me.email?" (أنا)":"")}</option>)}</Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النوع</label><Sel value={qpType} onChange={setQpType}><option value="تذكير">💬 تذكير</option><option value="طلب">📩 طلب</option><option value="مهمة">📌 مهمة</option><option value="مهمة عاجلة">🔴 عاجل</option></Sel></div>
          </div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الرسالة</label><Inp value={qpText} onChange={setQpText} placeholder="اكتب الاشعار..."/></div>
          <Btn primary onClick={()=>{if(!qpText.trim())return;const to=qpTo||"all";const targetUser=targets.find(u=>u.email===to);
            upConfig(d=>{if(!d.notifications)d.notifications=[];d.notifications.push({id:Date.now(),toEmail:to,toName:to==="all"?"الكل":targetUser?.name||to.split("@")[0],msg:qpText.trim(),type:qpType,fromName:me.name,createdAt:new Date().toISOString().split("T")[0],readBy:[]})});
            setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير");showToast("✓ تم ارسال الاشعار")}} style={{width:"100%",background:"#8B5CF6"}}>📩 ارسال الاشعار</Btn>
        </div>}
      </div>
    </div>})()}
    {/* Mobile AI Chat Popup */}
    {isMob&&aiOpen&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:99997,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:10}} onClick={()=>setAiOpen(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:"0 8px 40px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",height:"85vh",width:"100%",maxWidth:420}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0EA5E910,#8B5CF610)",borderRadius:"16px 16px 0 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🤖</span><span style={{fontWeight:800,fontSize:FS+1,color:T.text}}>مساعد CLARK</span></div>
          <div style={{display:"flex",gap:4}}>
            {aiMsgs.length>0&&<span onClick={()=>setAiMsgs([])} style={{cursor:"pointer",fontSize:11,padding:"2px 8px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:600}}>مسح</span>}
            <span onClick={()=>setAiOpen(false)} style={{cursor:"pointer",fontSize:16,color:T.textMut}}>✕</span>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
          {aiMsgs.length===0&&<div>
            {visibleAlerts.length>0&&<div style={{marginBottom:12}}>
              <div style={{fontSize:FS-1,fontWeight:800,color:T.text,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{"⚡ "+visibleAlerts.length+" تنبيه"}</div>
              {visibleAlerts.map((al,i)=><div key={i} onClick={()=>{setAiInput(al.text);}} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 10px",marginBottom:4,borderRadius:10,background:al.type==="late"?"#FEF2F2":al.type==="ready"?"#F0FDF4":al.type==="overpaid"?"#FFF7ED":al.type==="slow"?"#FFFBEB":"#F8FAFC",border:"1px solid "+(al.type==="late"?"#FECACA":al.type==="ready"?"#BBF7D0":al.type==="overpaid"?"#FED7AA":al.type==="slow"?"#FDE68A":"#E2E8F0"),cursor:"pointer",transition:"all 0.15s"}}>
                <span style={{fontSize:16,flexShrink:0}}>{al.icon}</span>
                <span style={{fontSize:FS-2,color:"#1E293B",fontWeight:600,lineHeight:1.5,flex:1}}>{al.text}</span>{al.wsPhone&&<span onClick={e=>{e.stopPropagation();const lines=(al.details||[]).map(d=>"• موديل *"+d.modelNo+"*: *"+d.qty+"* قطعة — "+d.days+" يوم"+(d.agreed?" (متفق "+d.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+al.wsName+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";window.open("https://wa.me/"+(al.wsPhone.replace(/[^0-9]/g,""))+"?text="+msg,"_blank");dismissAlert(al.text)}} style={{cursor:"pointer",fontSize:10,color:"#25D366",flexShrink:0,padding:"0 4px",fontWeight:700}}>📱</span>}<span onClick={e=>{e.stopPropagation();dismissAlert(al.text)}} style={{cursor:"pointer",fontSize:10,color:"#94A3B8",flexShrink:0,padding:"0 2px"}}>✕</span>
              </div>)}
              <div style={{textAlign:"center",margin:"10px 0",fontSize:FS-2,color:T.textMut,letterSpacing:4}}>— — —</div>
            </div>}
            <div style={{textAlign:"center",padding:visibleAlerts.length>0?8:20,color:T.textMut}}>
              {visibleAlerts.length===0&&<div style={{fontSize:32,marginBottom:8}}>🤖</div>}
              <div style={{fontSize:FS-1,fontWeight:600,marginBottom:4}}>اسألني عن أي حاجة</div>
              <div style={{fontSize:FS-2,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{"• موديل 3262 فين؟\n• ملخص الورش\n• كام أوردر متأخر؟"}</div>
            </div>
          </div>}
          {aiMsgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-start":"flex-end"}}>
            <div style={{maxWidth:"85%",padding:"8px 12px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",background:m.role==="user"?T.accent:T.bg,color:m.role==="user"?"#fff":T.text,fontSize:FS-1,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
          </div>)}
          {aiLoading&&<div style={{display:"flex",justifyContent:"flex-end"}}><div style={{padding:"8px 16px",borderRadius:12,background:T.bg,fontSize:FS-1,color:T.textMut}}>⏳ جاري التحليل...</div></div>}
        </div>
        <div style={{padding:"8px 12px",borderTop:"1px solid "+T.brd,display:"flex",gap:6}}>
          <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")askAI()}} placeholder="اسأل عن أي حاجة..." style={{flex:1,padding:"8px 12px",borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.bg,color:T.text,outline:"none",boxSizing:"border-box"}}/>
          <button onClick={askAI} disabled={aiLoading||!aiInput.trim()} style={{padding:"8px 14px",borderRadius:10,border:"none",background:aiInput.trim()?"linear-gradient(135deg,#0EA5E9,#8B5CF6)":"#E2E8F0",color:aiInput.trim()?"#fff":"#94A3B8",cursor:aiInput.trim()?"pointer":"default",fontSize:14,fontWeight:700}}>📩</button>
        </div>
      </div>
    </div>}
    {showScanner==="menu"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowScanner(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>📷 مسح QR — اختر العملية</div>
          <Btn ghost small onClick={()=>setShowScanner(false)}>✕</Btn>
        </div>
        {[
          {icon:"📷",label:"مسح ذكي (تلقائي)",desc:"التطبيق يتعرف على النوع تلقائياً",color:T.accent,action:()=>setShowScanner(true)},
          {icon:"📋",label:"فتح أوردر",desc:"اسكان QR → تفاصيل الأوردر",color:T.accent,action:()=>setShowScanner(true)},
          {icon:"↙",label:"استلام من ورشة",desc:"اسكان QR ليبل → شاشة الاستلام",color:"#8B5CF6",action:()=>setShowScanner(true)},
          {icon:"🔍",label:"استعلام موديل",desc:"اسكان أي QR → بيانات الموديل",color:"#F59E0B",action:()=>setShowScanner(true)},
          {icon:"🏭",label:"حساب ورشة",desc:"اسكان QR الورشة → الحساب",color:"#0EA5E9",action:()=>setShowScanner(true)},
        ].map(op=><div key={op.label} onClick={op.action} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:12,cursor:"pointer",border:"1px solid "+op.color+"20",marginBottom:6,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=op.color+"08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{width:40,height:40,borderRadius:10,background:op.color+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{op.icon}</div>
          <div><div style={{fontWeight:700,fontSize:FS,color:op.color}}>{op.label}</div><div style={{fontSize:FS-2,color:T.textMut}}>{op.desc}</div></div>
        </div>)}
      </div>
    </div>}
    {showScanner===true&&<QRScanner onClose={()=>setShowScanner(false)} onScan={url=>{setShowScanner(false);try{/* Smart scan — detect type */
      if(url.startsWith("CLARK:")){const parts=url.split(":");const orderId=parts[1];const o=orders.find(x=>x.id===orderId);if(o){goD(o.id);showToast("📋 "+o.modelNo);return}}
      try{const j=JSON.parse(url);if(j.app==="clark"&&j.type==="pkg"){const pkg=(config.packages||[]).find(p=>p.id===j.id);if(pkg){setTab("custDeliver");setTimeout(()=>{window.__openPkg=j.id;window.dispatchEvent(new Event("open-pkg"))},500);showToast("📦 "+j.num);return}}}catch(e2){}
      const u=new URL(url);const p=new URLSearchParams(u.search);if(p.get("o")){const o=orders.find(x=>x.modelNo===p.get("o"));if(o)goD(o.id)}else if(p.get("act")==="rcv"&&p.get("oid")){setTab("external");setTimeout(()=>{window.__qrReceive={oid:p.get("oid"),wdi:Number(p.get("wdi"))||0};window.dispatchEvent(new Event("qr-receive"))},600)}else if(p.get("act")==="stock"&&p.get("oid")){const o=orders.find(x=>x.id===p.get("oid"));if(o){goD(o.id);setTimeout(()=>{window.__qrStock=true;window.dispatchEvent(new Event("qr-stock"))},800)}}else if(p.get("act")==="wsacc"&&p.get("ws")){setTab("external");setTimeout(()=>{window.__qrWsAcc={ws:decodeURIComponent(p.get("ws"))};window.dispatchEvent(new Event("qr-wsacc"))},600)}else{showToast("QR غير معروف")}}catch(e){if(url.startsWith("CLARK:")){const parts=url.split(":");const orderId=parts[1];const o=orders.find(x=>x.id===orderId);if(o){goD(o.id);return}}showToast("QR غير صالح")}}}/>}
    {cardPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCardPopup(null)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?500:650,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontSize:FS+2,fontWeight:800,color:cardPopup.color}}>{cardPopup.title}</div><Btn ghost small onClick={()=>setCardPopup(null)} title="إغلاق">✕</Btn></div><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>البيان</th>{cardPopup.details?.[0]?.desc!==undefined&&<th style={TH}>الوصف</th>}<th style={TH}>الكمية</th></tr></thead><tbody>{(cardPopup.details||[]).map((d,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:cardPopup.color}}>{d.model}</td>{d.desc!==undefined&&<td style={TD}>{d.desc}</td>}<td style={{...TD,textAlign:"center",fontWeight:800}}>{fmt(d.qty)}</td></tr>)}<tr style={{background:cardPopup.color+"10"}}><td style={{...TD,fontWeight:800}} colSpan={cardPopup.details?.[0]?.desc!==undefined?2:1}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:cardPopup.color}}>{fmt((cardPopup.details||[]).reduce((s,d)=>s+(Number(d.qty)||0),0))}</td></tr></tbody></table></div></div>}
    {labelPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setLabelPopup(null);setLabelBags(1)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:320,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:800,color:T.text,marginBottom:4}}>{"🏷️ "+labelPopup.arrow+" "+labelPopup.title}</div>
        <div style={{fontSize:FS,color:T.textSec,marginBottom:16}}>{labelPopup.modelNo+" — "+labelPopup.piece+" — "+labelPopup.qty+" قطعة"}</div>
        <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد الأكياس</label><input type="number" value={labelBags} onChange={e=>setLabelBags(Math.max(1,Number(e.target.value)||1))} min="1" style={{display:"block",margin:"8px auto",width:100,textAlign:"center",fontSize:22,fontWeight:800,border:"3px solid "+T.accent,borderRadius:10,padding:"6px",fontFamily:"Cairo",background:T.bg,color:T.text}}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          <Btn ghost onClick={()=>{setLabelPopup(null);setLabelBags(1)}}>✕ إغلاق</Btn>
          <Btn onClick={()=>{renderLabelPages(labelPopup,labelBags)}} style={{background:T.accent,color:"#fff",border:"none",fontWeight:700}}>{"🖨 طباعة "+labelBags}</Btn>
        </div>
      </div>
    </div>}
    {wsAccPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setWsAccPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?420:550,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:wsAccPopup.color}}>{wsAccPopup.title}</div>
          <div style={{display:"flex",gap:4}}>
            <Btn small onClick={()=>{const el=document.getElementById("ws-acc-popup-tbl");if(el)printPage(wsAccPopup.title,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
            <Btn ghost small onClick={()=>setWsAccPopup(null)} title="إغلاق">✕</Btn>
          </div>
        </div>
        <div id="ws-acc-popup-tbl"><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>#</th><th style={TH}>الورشة</th><th style={TH}>المبلغ</th></tr></thead><tbody>
          {(wsAccPopup.items||[]).map((d,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}>{d.name}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:d.qty>=0?wsAccPopup.color:T.ok}}>{fmt(d.qty)+" ج.م"}</td></tr>)}
          <tr style={{background:wsAccPopup.color+"10"}}><td style={TD}></td><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:wsAccPopup.color}}>{fmt(wsAccPopup.total)+" ج.م"}</td></tr>
        </tbody></table></div>
      </div>
    </div>}
    {/* Barcode Print Popup */}
    {barcodePopup&&(()=>{const allOrders=data.orders||[];const ps=data.printSettings||{};const lw=ps.labelWidth||50;const lh=ps.labelHeight||40;const mg=ps.margins||2;const fl=ps.fields||{};
      const selOrder=allOrders.find(o=>o.id===barcodePopup.modelId);const rs=selOrder?Number(selOrder.rackSize)||1:1;
      const sizes=selOrder?.sizeLabel?selOrder.sizeLabel.split(/[-/,]/).map(s=>s.trim()).filter(Boolean):[];
      const qtyPerSize=sizes.length>0?Math.floor((selOrder?.cutQty||0)/sizes.length):(selOrder?.cutQty||0);
      const labelsPerSize=rs>0?Math.floor(qtyPerSize/rs):qtyPerSize;
      const totalLabels=sizes.length>0?labelsPerSize*sizes.length:(rs>0?Math.floor((selOrder?.cutQty||0)/rs):(selOrder?.cutQty||0));
      const mode=barcodePopup._mode||"manual";
      const qrMM=Math.min(lw-mg*2,lh-mg*2)-8;
      const buildLabel=(qrText,modelNo,desc,sizeStr,seriesStr)=>{let h="<div class='lbl'>";
        if(fl.brand?.show)h+="<div style='font-weight:900;font-size:"+((fl.brand?.size||14)/2.5)+"mm;letter-spacing:2px;line-height:1'>CLARK</div>";
        if(fl.modelNo?.show!==false)h+="<div style='font-weight:800;font-size:"+((fl.modelNo?.size||16)/2.5)+"mm;line-height:1.1'>"+modelNo+"</div>";
        if(fl.desc?.show)h+="<div style='font-size:"+((fl.desc?.size||10)/2.5)+"mm;color:#444;line-height:1'>"+desc+"</div>";
        if(fl.sizeLabel?.show!==false&&sizeStr)h+="<div style='font-weight:700;font-size:"+((fl.sizeLabel?.size||12)/2.5)+"mm;line-height:1'>"+sizeStr+"</div>";
        if(fl.qr?.show!==false)h+="<div style='flex:1;display:flex;align-items:center;justify-content:center'><img class='qr-img' data-text='"+qrText+"' style='width:"+qrMM+"mm;height:"+qrMM+"mm'/></div>";
        if(fl.series?.show!==false&&seriesStr)h+="<div style='font-weight:700;font-size:"+((fl.series?.size||12)/2.5)+"mm;line-height:1'>"+seriesStr+"</div>";
        if(fl.price?.show&&selOrder?.sellPrice)h+="<div style='font-size:"+((fl.price?.size||10)/2.5)+"mm;line-height:1'>"+selOrder.sellPrice+" ج.م</div>";
        return h+"</div>"};
      const doPrint=(labels)=>{if(labels.length===0)return;
        const qrOpts=JSON.stringify({width:400,margin:ps.qrMargin??1,errorCorrectionLevel:ps.qrLevel||"M",color:{dark:ps.qrColor||"#000000",light:"#ffffff"}});
        const w=window.open("","_blank");if(!w)return;w.document.write("<html dir='rtl'><head><title>QR</title><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><style>@page{size:"+lw+"mm "+lh+"mm;margin:"+mg+"mm}*{margin:0;padding:0}body{margin:0;padding:0;font-family:'Cairo',Arial,sans-serif}.lbl{width:"+(lw-mg*2)+"mm;height:"+(lh-mg*2)+"mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden"+(ps.showBorder?";border:1px dashed #999":"")+"}</style></head><body>"+labels.join("")+"<script>var qrOpts="+qrOpts+";document.querySelectorAll('.qr-img').forEach(function(img){QRCode.toDataURL(img.dataset.text,qrOpts).then(function(url){img.src=url}).catch(function(){})});setTimeout(function(){window.print()},800)</"+"script></body></html>");w.document.close();
        showToast("✓ تم تجهيز "+labels.length+" ليبل")};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setBarcodePopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,minHeight:"60vh",maxHeight:"95vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>🏷️ طباعة QR</div>
            <Btn ghost small onClick={()=>setBarcodePopup(null)}>✕</Btn>
          </div>
          <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>اختر الموديل</label><SearchSel value={barcodePopup.modelId||""} onChange={v=>setBarcodePopup(p=>({...p,modelId:v,_size:"",_qty:1}))} options={allOrders.map(o=>({value:o.id,label:o.modelNo+" — "+(o.modelDesc||"")}))} placeholder="اختر الموديل..."/></div>
          {selOrder&&<div style={{textAlign:"center",padding:8,background:T.bg+"60",borderRadius:10,marginBottom:10}}>
            <div style={{fontWeight:800,fontSize:FS+1,color:T.accent}}>{selOrder.modelNo}</div>
            <div style={{fontSize:FS-1,color:T.textMut}}>{selOrder.modelDesc}</div>
            <div style={{fontSize:FS-2,color:T.textSec,marginTop:2}}>{"القص: "+(selOrder.cutQty||0)+" | المقاسات: "+(sizes.join("-")||"—")+" | سيري: "+rs}</div>
          </div>}
          <div style={{display:"flex",gap:4,marginBottom:12,borderRadius:10,border:"1px solid "+T.brd,overflow:"hidden"}}>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"manual"}))} style={{flex:1,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="manual"?"#F59E0B":"transparent",color:mode==="manual"?"#fff":T.textSec}}>يدوية</div>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"series"}))} style={{flex:1,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="series"?"#F59E0B":"transparent",color:mode==="series"?"#fff":T.textSec}}>سيري</div>
            <div onClick={()=>setBarcodePopup(p=>({...p,_mode:"auto"}))} style={{flex:1,textAlign:"center",padding:"8px 0",fontWeight:700,fontSize:FS-1,cursor:"pointer",background:mode==="auto"?"#F59E0B":"transparent",color:mode==="auto"?"#fff":T.textSec}}>تلقائية</div>
          </div>
          {mode==="manual"&&<div>
            {selOrder?<div>
              {sizes.length>0?<div>
                <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:8}}>ادخل عدد الليبلات لكل مقاس</div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:10}}><thead><tr><th style={{...TH,fontSize:FS-2}}>المقاس</th><th style={{...TH,fontSize:FS-2}}>عدد الليبلات</th></tr></thead><tbody>
                  {sizes.map(sz=>{const val=(barcodePopup._manualSizes||{})[sz]||0;return<tr key={sz}><td style={{...TD,fontWeight:700,textAlign:"center",fontSize:FS+1}}>{sz}</td>
                    <td style={{...TD,textAlign:"center",padding:2}}><input type="number" value={val||""} onChange={e=>{const v=Math.max(0,Number(e.target.value)||0);setBarcodePopup(p=>({...p,_manualSizes:{...(p._manualSizes||{}),[sz]:v}}))}} style={{width:70,textAlign:"center",border:"2px solid "+T.accent,borderRadius:6,padding:"4px",fontSize:FS+1,fontWeight:700,fontFamily:"inherit",background:T.bg,color:T.text}} placeholder="0"/></td></tr>})}
                  <tr style={{background:"#F59E0B10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B"}}>{sizes.reduce((s,sz)=>s+((barcodePopup._manualSizes||{})[sz]||0),0)+" ليبل"}</td></tr>
                </tbody></table>
                <Btn onClick={()=>{const ms=barcodePopup._manualSizes||{};const labels=[];
                  sizes.forEach(sz=>{const count=ms[sz]||0;for(let i=0;i<count;i++){const qrText="CLARK:"+selOrder.id+":"+rs;labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"","مقاس: "+sz,"سيري: "+rs))}});
                  if(labels.length===0){showToast("⚠️ ادخل كمية واحدة على الأقل");return}doPrint(labels)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+sizes.reduce((s,sz)=>s+((barcodePopup._manualSizes||{})[sz]||0),0)+" ليبل"}</Btn>
              </div>
              :<div>
                <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>{"عدد الليبلات (كل ليبل = "+rs+" قطع)"}</label><Inp type="number" value={barcodePopup._qty||1} onChange={v=>setBarcodePopup(p=>({...p,_qty:Math.max(1,Number(v)||1)}))}/></div>
                <Btn onClick={()=>{if(!selOrder){showToast("⚠️ اختر موديل");return}const qty=barcodePopup._qty||1;const qrText="CLARK:"+selOrder.id+":"+rs;const labels=[];
                  for(let i=0;i<qty;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"","","سيري: "+rs));
                  doPrint(labels)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+(barcodePopup._qty||1)+" ليبل"}</Btn>
              </div>}
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {mode==="series"&&<div>
            {selOrder?<div style={{textAlign:"center"}}>
              <div style={{padding:12,background:T.bg+"60",borderRadius:10,marginBottom:12}}>
                <div style={{fontSize:FS,fontWeight:700,color:T.textSec,marginBottom:4}}>كل ليبل = سيري كامل</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>{sizes.length>0?"مقاسات: "+sizes.join(" - "):"سيري: "+rs}</div>
                <div style={{fontSize:FS-1,color:T.textMut,marginTop:4}}>{"كل ليبل = "+(sizes.length>0?sizes.length*rs:rs)+" قطعة"}</div>
              </div>
              <div style={{marginBottom:12}}><label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد السيريهات</label><input type="number" value={barcodePopup._seriesQty!=null?barcodePopup._seriesQty:totalLabels||1} onChange={e=>setBarcodePopup(p=>({...p,_seriesQty:Math.max(1,Number(e.target.value)||1)}))} style={{display:"block",margin:"8px auto",width:120,textAlign:"center",fontSize:24,fontWeight:800,border:"3px solid #F59E0B",borderRadius:10,padding:"8px",fontFamily:"Cairo",background:T.bg,color:T.text}}/></div>
              <Btn onClick={()=>{const qty=barcodePopup._seriesQty!=null?barcodePopup._seriesQty:totalLabels||1;const fullQty=sizes.length>0?sizes.length*rs:rs;const qrText="CLARK:"+selOrder.id+":"+fullQty;const labels=[];
                const sizeText=sizes.length>0?"مقاسات: "+sizes.join("-"):"";
                for(let i=0;i<qty;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"",sizeText,"سيري: "+fullQty));
                doPrint(labels)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+(barcodePopup._seriesQty!=null?barcodePopup._seriesQty:totalLabels||1)+" ليبل سيري"}</Btn>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
          {mode==="auto"&&<div>
            {selOrder?<div>
              <div style={{padding:10,background:T.bg+"60",borderRadius:10,marginBottom:10}}>
                {sizes.length>0?<table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>المقاس</th><th style={{...TH,fontSize:FS-2}}>الكمية</th><th style={{...TH,fontSize:FS-2}}>سيريهات</th><th style={{...TH,fontSize:FS-2}}>ليبلات</th></tr></thead><tbody>
                  {sizes.map(sz=><tr key={sz}><td style={{...TD,fontWeight:700,textAlign:"center"}}>{sz}</td><td style={{...TD,textAlign:"center"}}>{qtyPerSize}</td><td style={{...TD,textAlign:"center"}}>{labelsPerSize}</td><td style={{...TD,textAlign:"center",fontWeight:700,color:"#F59E0B"}}>{labelsPerSize}</td></tr>)}
                  <tr style={{background:"#F59E0B10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{qtyPerSize*sizes.length}</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{totalLabels}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B"}}>{totalLabels}</td></tr>
                </tbody></table>
                :<div style={{textAlign:"center",color:T.textMut,padding:10}}>{"سيتم طباعة "+totalLabels+" ليبل (كل ليبل = سيري "+rs+" قطع)"}</div>}
                <div style={{textAlign:"center",fontSize:FS-2,color:T.textMut,marginTop:6}}>{"كل ليبل = سيري واحد ("+rs+" قطع) — المقاس للفرز فقط"}</div>
              </div>
              <Btn onClick={()=>{const labels=[];const qrText="CLARK:"+selOrder.id+":"+rs;
                if(sizes.length>0){sizes.forEach(sz=>{for(let i=0;i<labelsPerSize;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"","مقاس: "+sz,"سيري: "+rs))})}
                else{for(let i=0;i<totalLabels;i++)labels.push(buildLabel(qrText,selOrder.modelNo,selOrder.modelDesc||"","","سيري: "+rs))}
                doPrint(labels)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+totalLabels+" ليبل ("+totalLabels*rs+" قطعة)"}</Btn>
            </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>اختر موديل أولاً</div>}
          </div>}
        </div>
      </div>})()}
  </div>
}
function DashPg({data,goD,isMob,isTab,season,statusCards,upConfig,user,setCardPopup,setWsAccPopup}){
  const orders=data.orders;

  /* ═══ MEMOIZED COMPUTATIONS ═══ */
  const stats=useMemo(()=>{
    const cutQ=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);
    const delQ=orders.reduce((s,o)=>s+(o.deliveredQty||0),0);
    const comp=cutQ?Math.round((delQ/cutQ)*100):0;
    let totalDeliveredToWs=0,totalReceivedFromWs=0;
    orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{totalDeliveredToWs+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{totalReceivedFromWs+=(Number(r.qty)||0)})})});
    const inProdQty=totalDeliveredToWs-totalReceivedFromWs;
    /* Per-piece breakdown at workshops */
    const wsPieces={};let totalCompleteSets=0;
    orders.forEach(o=>{const pieces=o.orderPieces||[];const pieceBalances={};
      (o.workshopDeliveries||[]).forEach(wd=>{const g=wd.garmentType||"عام";if(!pieceBalances[g])pieceBalances[g]=0;pieceBalances[g]+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{pieceBalances[g]-=(Number(r.qty)||0)})});
      Object.entries(pieceBalances).forEach(([g,bal])=>{if(bal>0){if(!wsPieces[g])wsPieces[g]=0;wsPieces[g]+=bal}});
      if(pieces.length>1){const pBals=pieces.map(p=>pieceBalances[p]||0);const minBal=Math.min(...pBals);if(minBal>0)totalCompleteSets+=minBal}
      else if(pieces.length===1){const bal=pieceBalances[pieces[0]]||0;if(bal>0)totalCompleteSets+=bal}
      else{const bal=pieceBalances["عام"]||0;if(bal>0)totalCompleteSets+=bal}
    });
    const sc={};orders.forEach(o=>{sc[o.status]=(sc[o.status]||0)+1});
    const pieData=Object.entries(sc).map(([name,value])=>({name,value,fill:getStatusColor(name,statusCards)}));
    const wsMap={};
    orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
      if(!wsMap[wd.wsName])wsMap[wd.wsName]={name:wd.wsName,delivered:0,received:0};
      wsMap[wd.wsName].delivered+=(Number(wd.qty)||0);
      (wd.receives||[]).forEach(r=>{wsMap[wd.wsName].received+=(Number(r.qty)||0)})
    })});
    const wsChartData=Object.values(wsMap).sort((a,b)=>b.received-a.received);
    const _isInt=(n)=>{const w=(data.workshops||[]).find(x=>x.name===n);return w?wsIsInternal(w.type):false};
    let wsDue=0,wsPaid=0,wsPurchase=0;
    orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(_isInt(wd.wsName))return;(wd.receives||[]).forEach(r=>{wsDue+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
    (data.wsPayments||[]).forEach(p=>{if(p.type==="payment")wsPaid+=(Number(p.amount)||0);else wsPurchase+=(Number(p.amount)||0)});
    const wsBalance=wsDue+wsPurchase-wsPaid;
    const finishingQty=orders.filter(o=>o.status==="تشطيب وتعبئة").reduce((s,o)=>s+calcOrder(o).cutQty,0);
    return{cutQ,delQ,comp,totalDeliveredToWs,totalReceivedFromWs,inProdQty,wsPieces,totalCompleteSets,pieData,wsMap,wsChartData,wsDue,wsPaid,wsPurchase,wsBalance,finishingQty,_isInt}
  },[orders,statusCards,data.wsPayments,data.workshops]);

  const{cutQ,delQ,comp,totalDeliveredToWs,totalReceivedFromWs,inProdQty,wsPieces,totalCompleteSets,pieData,wsMap,wsChartData,wsDue,wsPaid,wsPurchase,wsBalance,finishingQty,_isInt}=stats;
  const wsAccounts=(wsName)=>{if(_isInt(wsName))return{due:0,totalPaid:0,totalPurchase:0,balance:0};let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});const payments=(data.wsPayments||[]).filter(p=>p.wsName===wsName);const totalPaid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);const totalPurchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);return{due,totalPaid,totalPurchase,balance:due+totalPurchase-totalPaid}};

  return<div>
    {/* Today's Summary */}
    {(()=>{const today=new Date().toISOString().split("T")[0];
      let todayCut=0,todayWsDel=0,todayWsRcv=0,todayStock=0;const todayOrders=[];const todayWsNames=new Set();
      orders.forEach(o=>{
        if(o.date===today){todayCut+=calcOrder(o).cutQty;todayOrders.push(o.modelNo)}
        (o.workshopDeliveries||[]).forEach(wd=>{
          if(wd.date===today){todayWsDel+=Number(wd.qty)||0;todayWsNames.add(wd.wsName)}
          (wd.receives||[]).forEach(r=>{if(r.date===today)todayWsRcv+=Number(r.qty)||0})
        });
        (o.deliveries||[]).forEach(d=>{if(d.date===today)todayStock+=Number(d.qty)||0})
      });
      const hasActivity=todayCut||todayWsDel||todayWsRcv||todayStock;
      return<Card title={"📊 ملخص اليوم — "+today} style={{marginBottom:12}}>
        {hasActivity?<div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":isTab?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:12}}>
            <div style={{padding:12,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>✂️</div><div style={{fontSize:FS+4,fontWeight:800,color:T.accent}}>{todayCut}</div><div style={{fontSize:FS-2,color:T.textSec}}>تم قصها</div></div>
            <div style={{padding:12,borderRadius:10,background:"#8B5CF608",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>📤</div><div style={{fontSize:FS+4,fontWeight:800,color:"#8B5CF6"}}>{todayWsDel}</div><div style={{fontSize:FS-2,color:T.textSec}}>تسليم ورشة</div></div>
            <div style={{padding:12,borderRadius:10,background:T.ok+"08",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>📥</div><div style={{fontSize:FS+4,fontWeight:800,color:T.ok}}>{todayWsRcv}</div><div style={{fontSize:FS-2,color:T.textSec}}>استلام مصنع</div></div>
            <div style={{padding:12,borderRadius:10,background:"#05966908",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>📦</div><div style={{fontSize:FS+4,fontWeight:800,color:"#059669"}}>{todayStock}</div><div style={{fontSize:FS-2,color:T.textSec}}>استلام مخزن جاهز</div></div>
          </div>
          {todayOrders.length>0&&<div style={{fontSize:FS-1,color:T.textSec}}>{"أوامر قص: "+todayOrders.join("، ")}</div>}
          {todayWsNames.size>0&&<div style={{fontSize:FS-1,color:T.textSec}}>{"ورش: "+[...todayWsNames].join("، ")}</div>}
        </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>
          <div style={{fontSize:28,marginBottom:6}}>☀️</div>
          <div style={{fontSize:FS,fontWeight:600}}>لا توجد حركات اليوم بعد</div>
        </div>}
      </Card>})()}
    <Card title={"الانتاج - الموسم "+season+" ("+orders.length+" موديل)"} style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":isTab?"repeat(3,1fr)":"repeat(6,1fr)",gap:10}}>
        <div onClick={()=>{const details=[];orders.forEach(o=>{const t=calcOrder(o);if(t.cutQty>0)details.push({model:o.modelNo,desc:o.modelDesc,qty:t.cutQty})});setCardPopup({title:"كمية القص",color:T.accent,details})}} style={{padding:10,borderRadius:8,background:T.accent+"06",border:"1px solid "+T.accent+"12",textAlign:"center",cursor:"pointer",transition:"all 0.15s"}}><div style={{fontSize:FS-2,color:T.textSec}}>كمية القص</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.accent}}>{fmt(cutQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:T.ok+"06",border:"1px solid "+T.ok+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>استلام مخزن جاهز</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.ok}}>{fmt(delQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:T.warn+"06",border:"1px solid "+T.warn+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>رصيد المصنع</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.warn}}>{fmt(cutQ-delQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div onClick={()=>{const details=[];Object.entries(wsPieces).sort((a,b)=>b[1]-a[1]).forEach(([piece,qty])=>{details.push({model:piece,qty})});details.push({model:"✅ طقم كامل",qty:totalCompleteSets});details.push({model:"↗ تسليم ورشة",qty:totalDeliveredToWs});details.push({model:"↙ استلام مصنع",qty:totalReceivedFromWs});setCardPopup({title:"عند الورش",color:"#8B5CF6",details})}} style={{padding:10,borderRadius:8,background:"#8B5CF606",border:"1px solid #8B5CF612",textAlign:"center",cursor:"pointer",transition:"all 0.15s"}}><div style={{fontSize:FS-2,color:T.textSec}}>عند الورش</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:"#8B5CF6"}}>{fmt(Math.max(0,inProdQty))+" قطعة"}</div></div>
        <div style={{padding:10,borderRadius:8,background:"#F59E0B06",border:"1px solid #F59E0B12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>تشطيب وتعبئة</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:"#F59E0B"}}>{fmt(finishingQty)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:(comp>=80?T.ok:comp>=50?T.warn:T.err)+"06",border:"1px solid "+(comp>=80?T.ok:comp>=50?T.warn:T.err)+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>الانجاز</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:comp>=80?T.ok:comp>=50?T.warn:T.err}}>{comp+"%"}</div><PBar value={comp}/></div>
      </div>
    </Card>
    {/* Workshop Accounts Summary */}
    <Card title="حسابات الورش" style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        <div onClick={()=>{const ws=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));const items=ws.map(w=>{const a=wsAccounts(w.name);return{name:w.name,qty:r2(a.due+a.totalPurchase)}}).filter(x=>x.qty!==0).sort((a,b)=>b.qty-a.qty);setWsAccPopup({title:"💰 مستحق للورش",color:T.accent,items,total:r2(wsDue+wsPurchase)})}} style={{padding:12,borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center",cursor:"pointer",transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>مستحق للورش</div>
          <div style={{fontSize:20,fontWeight:800,color:T.accent}}>{fmt(r2(wsDue+wsPurchase))+" ج.م"}</div>
        </div>
        <div onClick={()=>{const ws=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));const items=ws.map(w=>{const a=wsAccounts(w.name);return{name:w.name,qty:r2(a.totalPaid)}}).filter(x=>x.qty>0).sort((a,b)=>b.qty-a.qty);setWsAccPopup({title:"💳 اجمالي المدفوع",color:T.warn,items,total:r2(wsPaid)})}} style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"15",textAlign:"center",cursor:"pointer",transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>اجمالي المدفوع</div>
          <div style={{fontSize:20,fontWeight:800,color:T.warn}}>{fmt(r2(wsPaid))+" ج.م"}</div>
        </div>
        <div onClick={()=>{const ws=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));const items=ws.map(w=>{const a=wsAccounts(w.name);const bal=a.due+a.totalPurchase-a.totalPaid;return{name:w.name,qty:r2(bal)}}).filter(x=>x.qty!==0).sort((a,b)=>b.qty-a.qty);setWsAccPopup({title:"📊 رصيد الورش",color:wsBalance>0?T.err:T.ok,items,total:r2(wsBalance)})}} style={{padding:12,borderRadius:10,background:(wsBalance>0?T.err:T.ok)+"08",border:"1px solid "+(wsBalance>0?T.err:T.ok)+"15",textAlign:"center",cursor:"pointer",transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>رصيد الورش</div>
          <div style={{fontSize:20,fontWeight:800,color:wsBalance>0?T.err:T.ok}}>{fmt(r2(wsBalance))+" ج.م"}</div>
        </div>
      </div>
    </Card>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16,marginBottom:24}}>
      <Card title="توزيع الحالات">{pieData.length>0?<div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <ResponsiveContainer width={isMob?"100%":160} height={160}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={3} dataKey="value" stroke="none">{pieData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
        <div style={{flex:1,minWidth:120}}>{pieData.map((d,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",fontSize:FS}}><span style={{width:12,height:12,borderRadius:4,background:d.fill,flexShrink:0}}/><span style={{color:T.textSec,flex:1}}>{d.name}</span><span style={{fontWeight:700}}>{d.value}</span></div>)}</div>
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد بيانات</p>}</Card>
      {/* Workshop Comparison Chart */}
      <Card title="أداء الورش - تسليم ورشة vs استلام مصنع">{wsChartData.length>0?<div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={wsChartData} margin={{top:10,right:10,bottom:5}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false}/>
            <XAxis dataKey="name" tick={{fontSize:11,fill:T.text}} interval={0} angle={isMob?-45:0} textAnchor={isMob?"end":"middle"} height={isMob?60:30}/>
            <YAxis tick={{fontSize:11,fill:T.textSec}}/>
            <Tooltip contentStyle={{borderRadius:8,border:"1px solid #E2E8F0",fontSize:12}}/>
            <Legend wrapperStyle={{fontSize:11}}/>
            <Bar dataKey="delivered" name="تسليم ورشة" fill="#8B5CF6" barSize={isMob?16:24} radius={[4,4,0,0]}/>
            <Bar dataKey="received" name="استلام مصنع" fill="#10B981" barSize={isMob?16:24} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
        {wsChartData.length>0&&<div style={{marginTop:8,padding:8,background:"#F0FDF4",borderRadius:8,border:"1px solid "+T.ok+"30",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>🏆</span>
          <span style={{fontSize:FS,fontWeight:700,color:T.ok}}>{"أعلى ورشة: "+wsChartData[0].name+" ("+wsChartData[0].received+" قطعة)"}</span>
        </div>}
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:20}}>لا توجد بيانات ورش</p>}</Card>
    </div>

    {/* ═══ HEATMAP: 7 days ═══ */}
    <Card title="📅 خريطة اسبوعية للانتاج" style={{marginTop:16}}>
      {(()=>{const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.toISOString().split("T")[0])}
        const dayData=days.map(d=>{let ops=0;orders.forEach(o=>{if(o.date===d)ops+=calcOrder(o).cutQty;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date===d)ops+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{if(r.date===d)ops+=Number(r.qty)||0})});(o.deliveries||[]).forEach(dl=>{if(dl.date===d)ops+=Number(dl.qty)||0})});return{date:d,ops}});
        const maxOps=Math.max(1,...dayData.map(x=>x.ops));
        const dayNames=["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
        return<div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>{dayData.map(d=>{const pct=d.ops/maxOps;const bg=d.ops===0?"#F1F5F9":pct>0.7?"#059669":pct>0.3?"#F59E0B":"#FCA5A5";
          return<div key={d.date} style={{textAlign:"center",padding:10,borderRadius:10,background:bg+"18",border:"1px solid "+bg+"30"}}>
            <div style={{fontSize:FS-2,color:T.textSec}}>{dayNames[new Date(d.date).getDay()]}</div>
            <div style={{fontSize:FS+2,fontWeight:800,color:bg==="F1F5F9"?T.textMut:bg}}>{d.ops}</div>
            <div style={{fontSize:FS-3,color:T.textMut}}>{d.date.slice(5)}</div>
          </div>})}</div>})()}
    </Card>

    {/* ═══ SPEEDOMETER ═══ */}
    <Card title="🏎 مؤشر سرعة الموسم" style={{marginTop:16}}>
      {(()=>{const pct=comp;const angle=-90+pct*1.8;const color=pct>=80?"#10B981":pct>=50?"#F59E0B":"#EF4444";
        return<div style={{textAlign:"center"}}>
          <svg width={isMob?200:260} height={isMob?120:150} viewBox="0 0 260 150">
            <path d="M30 140 A100 100 0 0 1 230 140" fill="none" stroke="#E2E8F0" strokeWidth="18" strokeLinecap="round"/>
            <path d="M30 140 A100 100 0 0 1 230 140" fill="none" stroke={color} strokeWidth="18" strokeLinecap="round" strokeDasharray={`${pct*3.14} 314`}/>
            <text x="130" y="110" textAnchor="middle" fill={color} fontSize="36" fontWeight="800" fontFamily="Cairo">{pct+"%"}</text>
            <text x="130" y="135" textAnchor="middle" fill="#94A3B8" fontSize="12" fontFamily="Cairo">{pct>=80?"ممتاز 🔥":pct>=50?"جيد ⚡":"بطيء 🐢"}</text>
          </svg>
          <div style={{fontSize:FS-1,color:T.textSec,marginTop:4}}>{"قص: "+fmt(cutQ)+" | جاهز: "+fmt(delQ)+" | متبقي: "+fmt(cutQ-delQ)}</div>
        </div>})()}
    </Card>

    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16,marginTop:16}}>
    {/* ═══ WORKSHOP PRESSURE ═══ */}
    <Card title="📊 مقياس الضغط على الورش">
      {(()=>{const wsList=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));
        const wsLoad=wsList.map(w=>{let del=0,rcv=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});const pending=del-rcv;const pct=del?Math.round((pending/del)*100):0;return{name:w.name,del,rcv,pending,pct}}).filter(w=>w.del>0).sort((a,b)=>b.pct-a.pct);
        return wsLoad.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>{wsLoad.map(w=><div key={w.name}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1,marginBottom:2}}><span style={{fontWeight:700}}>{w.name}</span><span style={{color:w.pct>60?T.err:w.pct>30?T.warn:T.ok,fontWeight:700}}>{w.pending+" متبقي ("+w.pct+"%)"}{w.pct>60?" ⚠️":""}</span></div>
          <div style={{height:8,borderRadius:4,background:T.bg}}><div style={{height:"100%",borderRadius:4,background:w.pct>60?T.err:w.pct>30?T.warn:T.ok,width:w.pct+"%",transition:"width 0.5s"}}/></div>
        </div>)}</div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد بيانات</div>})()}
    </Card>

    {/* ═══ WORKSHOP TIMER ═══ */}
    <Card title="⏱ مؤقت الورش — أيام بدون حركة">
      {(()=>{const now=new Date();const wsList=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));
        const wsTimers=wsList.map(w=>{let lastAct=null;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{if(!lastAct||wd.date>lastAct)lastAct=wd.date;(wd.receives||[]).forEach(r=>{if(!lastAct||r.date>lastAct)lastAct=r.date})})});const days=lastAct?Math.floor((now-new Date(lastAct))/(1000*60*60*24)):null;return{name:w.name,days,lastAct}}).filter(w=>w.lastAct).sort((a,b)=>b.days-a.days);
        return wsTimers.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>{wsTimers.map(w=><div key={w.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:w.days>7?T.err+"08":w.days>3?T.warn+"08":T.ok+"08"}}>
          <span style={{fontWeight:700,fontSize:FS}}>{w.name}</span>
          <span style={{fontWeight:800,fontSize:FS,color:w.days>7?T.err:w.days>3?T.warn:T.ok}}>{w.days===0?"اليوم ✓":w.days+" يوم"}{w.days>7?" 🔴":""}</span>
        </div>)}</div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد بيانات</div>})()}
    </Card>
    </div>

    {/* ═══ WORKSHOP RACE ═══ */}
    <Card title="🏁 معدل انجاز الورش" style={{marginTop:16}}>
      {(()=>{const wsRace=Object.values(wsMap).map(w=>({...w,pct:w.delivered?Math.round((w.received/w.delivered)*100):0})).sort((a,b)=>b.pct-a.pct);
        return wsRace.length>0?<div style={{display:"flex",flexDirection:"column",gap:10}}>{wsRace.map((w,i)=><div key={w.name}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:FS,marginBottom:3}}>
            <span style={{fontWeight:700}}>{(i===0?"🥇 ":i===1?"🥈 ":i===2?"🥉 ":(i+1)+". ")+w.name}</span>
            <span style={{fontWeight:800,color:w.pct>=80?T.ok:w.pct>=50?T.warn:T.err}}>{w.pct+"%"}</span>
          </div>
          <div style={{height:14,borderRadius:7,background:T.bg,overflow:"hidden",position:"relative"}}>
            <div style={{height:"100%",borderRadius:7,background:w.pct>=80?"linear-gradient(90deg,#10B981,#059669)":w.pct>=50?"linear-gradient(90deg,#F59E0B,#D97706)":"linear-gradient(90deg,#EF4444,#DC2626)",width:w.pct+"%",transition:"width 1s ease",position:"relative"}}>
              <span style={{position:"absolute",left:6,top:0,fontSize:9,lineHeight:"14px",color:"#fff",fontWeight:700}}>{w.received+"/"+w.delivered}</span>
            </div>
          </div>
        </div>)}</div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد بيانات</div>})()}
    </Card>

    {/* ═══ DELAYS BOARD ═══ */}
    {(()=>{const now=new Date();const delayed=orders.filter(o=>{if(o.status==="تم التسليم"||o.status==="تم الشحن")return false;let ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>ld)ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>ld)ld=d.date});return Math.floor((now-new Date(ld))/(1000*60*60*24))>7}).map(o=>{let ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>ld)ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>ld)ld=d.date});return{...o,ageDays:Math.floor((now-new Date(ld))/(1000*60*60*24))}}).sort((a,b)=>b.ageDays-a.ageDays);
      return delayed.length>0&&<Card title={"🚨 لوحة المتأخرات ("+delayed.length+")"} style={{marginTop:16}}>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","الحالة","آخر حركة","أيام التأخر"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{delayed.map(o=><tr key={o.id} style={{cursor:"pointer",background:o.ageDays>14?T.err+"06":""}} onClick={()=>goD(o.id)}>
          <td style={TDB}>{o.modelNo}</td><td style={TD}>{o.modelDesc}</td><td style={TD}><Badge t={o.status} cards={statusCards}/></td>
          <td style={TD}>{(()=>{let ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>ld)ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>ld)ld=d.date});return ld})()}</td>
          <td style={{...TDB,color:T.err,fontSize:FS+1}}>{o.ageDays+" يوم 🔴"}</td>
        </tr>)}</tbody></table></div>
      </Card>})()}

    {/* ═══ WASTE REPORT ═══ */}
    {(()=>{const wasteRows=[];orders.forEach(o=>{const t=calcOrder(o);const wds=o.workshopDeliveries||[];
      const pieces=o.orderPieces||[];
      if(pieces.length>0){pieces.forEach(p=>{const rcv=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);if(rcv>0&&rcv<t.cutQty)wasteRows.push({modelNo:o.modelNo,piece:p,cut:t.cutQty,rcv,waste:t.cutQty-rcv,pct:Math.round(((t.cutQty-rcv)/t.cutQty)*100)})})}
      else{const rcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);if(rcv>0&&rcv<t.cutQty)wasteRows.push({modelNo:o.modelNo,piece:"عام",cut:t.cutQty,rcv,waste:t.cutQty-rcv,pct:Math.round(((t.cutQty-rcv)/t.cutQty)*100)})}
    });wasteRows.sort((a,b)=>b.waste-a.waste);
      const totalWaste=wasteRows.reduce((s,w)=>s+w.waste,0);const totalCut=wasteRows.reduce((s,w)=>s+w.cut,0);const totalRcv=wasteRows.reduce((s,w)=>s+w.rcv,0);const avgPct=totalCut?Math.round(((totalCut-totalRcv)/totalCut)*100):0;
      const printWaste=()=>{let h="<h2 style='text-align:center'>📉 تقرير الفاقد</h2><table><thead><tr><th>الموديل</th><th>القطعة</th><th>القص</th><th>المستلم</th><th>الفاقد</th><th>النسبة</th></tr></thead><tbody>";wasteRows.forEach(w=>{h+="<tr><td style='font-weight:700'>"+w.modelNo+"</td><td>"+w.piece+"</td><td>"+w.cut+"</td><td style='color:#10B981'>"+w.rcv+"</td><td style='color:#EF4444;font-weight:700'>"+w.waste+"</td><td>"+ w.pct+"%</td></tr>"});h+="<tr style='background:#FEF2F2;font-weight:800'><td colspan='2'>الاجمالي</td><td>"+fmt(totalCut)+"</td><td style='color:#10B981'>"+fmt(totalRcv)+"</td><td style='color:#EF4444'>"+fmt(totalWaste)+"</td><td>"+avgPct+"%</td></tr></tbody></table><div style='margin-top:12px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management</div>";printPage("تقرير الفاقد",h)};
      return wasteRows.length>0&&<Card title={"📉 تقرير الفاقد ("+wasteRows.length+")"} style={{marginTop:16}} extra={<Btn small onClick={printWaste} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","القطعة","القص","المستلم","الفاقد","النسبة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wasteRows.map((w,i)=><tr key={i}><td style={TDB}>{w.modelNo}</td><td style={{...TD,color:"#8B5CF6",fontWeight:600}}>{w.piece}</td><td style={TDB}>{w.cut}</td><td style={{...TDB,color:T.ok}}>{w.rcv}</td><td style={{...TDB,color:T.err}}>{w.waste}</td><td style={{...TDB,color:w.pct>5?T.err:T.warn}}>{w.pct+"%"}</td></tr>)}
        <tr style={{background:T.err+"06"}}><td colSpan={2} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TDB}>{fmt(totalCut)}</td><td style={{...TDB,color:T.ok}}>{fmt(totalRcv)}</td><td style={{...TDB,color:T.err,fontSize:FS+1}}>{fmt(totalWaste)}</td><td style={{...TDB,color:T.err}}>{avgPct+"%"}</td></tr>
        </tbody></table></div>
      </Card>})()}

    {/* ═══ WORKSHOP COMPARISON ═══ */}
    <Card title="📊 تقرير مقارنة الورش الخارجية" style={{marginTop:16}}>
      {(()=>{const wsList=(data.workshops||[]).filter(w=>!wsIsInternal(w.type));
        const wsComp=wsList.map(w=>{let del=0,rcv=0,waste=0,totalAmt=0;
          orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0;totalAmt+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
          waste=del-rcv;const wastePct=del?Math.round((waste/del)*100):0;
          const acc=wsAccounts(w.name);
          return{name:w.name,type:w.type,del,rcv,waste,wastePct,totalAmt,balance:acc.balance}
        }).sort((a,b)=>b.rcv-a.rcv);
        const tDel=wsComp.reduce((s,w)=>s+w.del,0);const tRcv=wsComp.reduce((s,w)=>s+w.rcv,0);const tWaste=wsComp.reduce((s,w)=>s+w.waste,0);const tAmt=wsComp.reduce((s,w)=>s+w.totalAmt,0);const tBal=wsComp.reduce((s,w)=>s+w.balance,0);
        const printComp=()=>{let h="<h2 style='text-align:center'>📊 تقرير مقارنة الورش</h2><table><thead><tr><th>الورشة</th><th>النوع</th><th>تسليم</th><th>استلام</th><th>فاقد</th><th>نسبة</th><th>المستحق</th><th>رصيد حالي</th></tr></thead><tbody>";wsComp.forEach(w=>{h+="<tr><td style='font-weight:700'>"+w.name+"</td><td>"+wsTypeInfo(w.type).key+"</td><td>"+w.del+"</td><td style='color:#10B981'>"+w.rcv+"</td><td style='color:#EF4444'>"+w.waste+"</td><td>"+w.wastePct+"%</td><td>"+fmt(r2(w.totalAmt))+"</td><td style='color:"+(w.balance>0?"#EF4444":"#10B981")+"'>"+fmt(r2(w.balance))+"</td></tr>"});h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='2'>الاجمالي</td><td>"+fmt(tDel)+"</td><td style='color:#10B981'>"+fmt(tRcv)+"</td><td style='color:#EF4444'>"+fmt(tWaste)+"</td><td>"+(tDel?Math.round((tWaste/tDel)*100):0)+"%</td><td>"+fmt(r2(tAmt))+"</td><td style='color:"+(tBal>0?"#EF4444":"#10B981")+"'>"+fmt(r2(tBal))+"</td></tr></tbody></table><div style='margin-top:12px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management</div>";printPage("تقرير مقارنة الورش",h)};
        return wsComp.length>0?<div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><Btn small onClick={printComp} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨 طباعة</Btn></div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الورشة","النوع","تسليم","استلام","فاقد","نسبة","المستحق","الرصيد"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsComp.map(w=><tr key={w.name}><td style={{...TD,fontWeight:700}}>{w.name}</td><td style={{...TD,fontSize:FS-2}}>{wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key}</td><td style={TDB}>{w.del}</td><td style={{...TDB,color:T.ok}}>{w.rcv}</td><td style={{...TDB,color:w.waste>0?T.err:T.ok}}>{w.waste}</td><td style={{...TDB,color:w.wastePct>5?T.err:T.warn}}>{w.wastePct+"%"}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(w.totalAmt))}</td><td style={{...TDB,color:w.balance>0?T.err:T.ok}}>{fmt(r2(w.balance))}</td></tr>)}
        <tr style={{background:T.accent+"06"}}><td colSpan={2} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TDB}>{fmt(tDel)}</td><td style={{...TDB,color:T.ok}}>{fmt(tRcv)}</td><td style={{...TDB,color:T.err}}>{fmt(tWaste)}</td><td style={{...TDB,color:T.err}}>{(tDel?Math.round((tWaste/tDel)*100):0)+"%"}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(tAmt))}</td><td style={{...TDB,color:tBal>0?T.err:T.ok}}>{fmt(r2(tBal))}</td></tr>
        </tbody></table></div></div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد ورش</div>})()}
    </Card>
    <Card title="🗄️ معلومات قاعدة البيانات" style={{marginTop:12}}>
      {(()=>{
        const _cfg={...data};delete _cfg.custDeliverySessions;delete _cfg.packages;delete _cfg.tasks;delete _cfg.stickyNotes;delete _cfg.inventoryAudits;delete _cfg.orders;
        const _sal={custDeliverySessions:data.custDeliverySessions||[],packages:data.packages||[]};
        const _tsk={tasks:data.tasks||[],stickyNotes:data.stickyNotes||[],inventoryAudits:data.inventoryAudits||[]};
        const cSize=new Blob([JSON.stringify(_cfg)]).size;
        const sSize=new Blob([JSON.stringify(_sal)]).size;
        const tSize=new Blob([JSON.stringify(_tsk)]).size;
        const oSize=new Blob([JSON.stringify(orders)]).size;
        const totalSize=cSize+sSize+tSize+oSize;
        const imgCount=orders.filter(o=>o.image).length;
        const bar=(val,max,color)=><div style={{width:"100%",height:8,background:T.brd,borderRadius:4,overflow:"hidden"}}><div style={{width:Math.min(100,Math.round(val/max*100))+"%",height:"100%",background:color,borderRadius:4}}/></div>;
        const docs=[
          {name:"⚙️ Config",size:cSize,items:[(data.customers||[]).length+" عميل",(data.workshops||[]).length+" ورشة",(data.users||[]).length+" مستخدم"],color:"#0EA5E9"},
          {name:"💰 Sales",size:sSize,items:[(data.custDeliverySessions||[]).length+" توزيعة",(data.packages||[]).length+" كرتونة"],color:"#10B981"},
          {name:"📌 Tasks",size:tSize,items:[(data.tasks||[]).length+" مهمة",(data.stickyNotes||[]).length+" ملاحظة"],color:"#F59E0B"},
          {name:"📋 Orders",size:oSize,items:[orders.length+" أوردر",imgCount+" صورة"],color:"#8B5CF6"},
        ];
        return<div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}}>
            {docs.map(d=>{const pct=Math.round(d.size/1048576*100);const dColor=pct>80?"#EF4444":pct>50?"#F59E0B":d.color;
              return<div key={d.name} style={{padding:10,borderRadius:10,background:dColor+"06",border:"1px solid "+dColor+"15"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:FS-1,fontWeight:800,color:dColor}}>{d.name}</span>
                  <span style={{fontSize:FS-2,fontWeight:700,color:dColor}}>{(d.size/1024).toFixed(0)+" KB"}</span>
                </div>
                {bar(d.size,1048576,dColor)}
                <div style={{fontSize:FS-3,color:T.textMut,marginTop:3}}>{d.items.join(" | ")}</div>
                <div style={{fontSize:FS-3,color:dColor}}>{pct+"% من 1MB"}</div>
              </div>})}
          </div>
          <div style={{padding:10,borderRadius:10,background:T.bg,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:FS-1,fontWeight:700}}>الاجمالي</span>
              <span style={{fontSize:FS,fontWeight:800,color:T.accent}}>{(totalSize/1024).toFixed(0)+" KB"}</span>
            </div>
            {bar(totalSize,1073741824,"#0EA5E9")}
            <div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{Math.round(totalSize/1073741824*10000)/100+"% من 1GB (الحد المجاني)"}</div>
          </div>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.text,marginBottom:6}}>حدود Firestore</div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {[{l:"حجم المستند",v:"1 MB لكل مستند"},{l:"حجم القاعدة",v:"1 GB (مجاني)"},{l:"قراءات يومية",v:"50,000"},{l:"كتابات يومية",v:"20,000"},{l:"عدد المستندات",v:"4 مستندات + أوردرات"}].map(r=><div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"4px 10px",borderRadius:6,background:T.bg}}>
              <span style={{fontSize:FS-2,color:T.textSec}}>{r.l}</span>
              <span style={{fontSize:FS-2,fontWeight:600,color:T.text}}>{r.v}</span>
            </div>)}
          </div>
        </div>})()}
    </Card>
  </div>
}

/* ══ DB ══ */
function DBPg({data,upConfig,isMob,isTab,canEdit,statusCards,initialSub,onSubUsed,renameInOrders}){
  const[sub,setSub]=useState(initialSub||"fab");
  useEffect(()=>{if(initialSub){setSub(initialSub);if(onSubUsed)onSubUsed()}},[initialSub]);
  const[ff,setFf]=useState({name:"",unit:"كيلو",price:"",_eid:null});
  const[af,setAf]=useState({name:"",unit:"قطعة",price:"",_eid:null});
  const[sfld,setSfld]=useState({label:"",pcs:0,_eid:null});
  const[wf,setWf]=useState("");
  const[stName,setStName]=useState("");const[stColor,setStColor]=useState("#0EA5E9");const[stEid,setStEid]=useState(null);const[stShow,setStShow]=useState(false);
  const[gName,setGName]=useState("");const[gEid,setGEid]=useState(null);const[gIconSel,setGIconSel]=useState("👕");const[gShow,setGShow]=useState(false);const[gPrice,setGPrice]=useState("");

  const saveFab=()=>{if(!ff.name)return;upConfig(d=>{if(ff._eid){const idx=d.fabrics.findIndex(x=>x.id===ff._eid);if(idx>=0)d.fabrics[idx]={...d.fabrics[idx],name:ff.name,unit:ff.unit,price:Number(ff.price)||0}}else{d.fabrics.push({id:Date.now(),name:ff.name,unit:ff.unit,price:Number(ff.price)||0})}});setFf({name:"",unit:"كيلو",price:"",_eid:null})};
  const saveAcc=()=>{if(!af.name)return;upConfig(d=>{if(af._eid){const idx=d.accessories.findIndex(x=>x.id===af._eid);if(idx>=0)d.accessories[idx]={...d.accessories[idx],name:af.name,unit:af.unit,price:Number(af.price)||0}}else{d.accessories.push({id:Date.now(),name:af.name,unit:af.unit,price:Number(af.price)||0})}});setAf({name:"",unit:"قطعة",price:"",_eid:null})};
  const saveSize=()=>{if(!sfld.label)return;upConfig(d=>{if(sfld._eid){const idx=d.sizeSets.findIndex(x=>x.id===sfld._eid);if(idx>=0)d.sizeSets[idx]={...d.sizeSets[idx],label:sfld.label,pcsPerSeries:Number(sfld.pcs)||0}}else{d.sizeSets.push({id:Date.now(),label:sfld.label,pcsPerSeries:Number(sfld.pcs)||0})}});setSfld({label:"",pcs:0,_eid:null})};
  const saveGarment=()=>{if(!gName.trim())return;const oldName=gEid?(data.garmentTypes||[]).find(x=>x.id===gEid)?.name:null;upConfig(d=>{if(!d.garmentTypes)d.garmentTypes=[];if(gEid){const idx=d.garmentTypes.findIndex(x=>x.id===gEid);if(idx>=0){d.garmentTypes[idx].name=gName.trim();d.garmentTypes[idx].icon=gIconSel;d.garmentTypes[idx].defaultPrice=Number(gPrice)||0}}else{d.garmentTypes.push({id:Date.now(),name:gName.trim(),icon:gIconSel,defaultPrice:Number(gPrice)||0})}});if(oldName&&oldName!==gName.trim())renameInOrders("garment",oldName,gName.trim());setGName("");setGEid(null);setGIconSel("👕");setGPrice("")};
  const saveStatus=()=>{if(!stName.trim())return;const oldName=stEid?(statusCards||[]).find(x=>x.id===stEid)?.name:null;upConfig(d=>{if(!d.statusCards)d.statusCards=[...DEFAULT_STATUSES];if(stEid){const idx=d.statusCards.findIndex(x=>x.id===stEid);if(idx>=0){d.statusCards[idx].name=stName.trim();d.statusCards[idx].color=stColor}}else{d.statusCards.push({id:Date.now(),name:stName.trim(),color:stColor})}});if(oldName&&oldName!==stName.trim())renameInOrders("status",oldName,stName.trim());setStName("");setStColor("#0EA5E9");setStEid(null)};

  const eBtn=(onClick)=><Btn small onClick={onClick} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>;
  const ords=data.orders||[];
  const fabBlock=(f)=>ords.some(o=>FKEYS.some(k=>Number(o["fabric"+k])===f.id))?"مستخدم في أوردرات":null;
  const accBlock=(a)=>ords.some(o=>(o.accItems||[]).some(x=>x.name===a.name))?"مستخدم في أوردرات":null;
  const sizeBlock=(s)=>ords.some(o=>Number(o.sizeSetId)===s.id)?"مستخدم في أوردرات":null;
  const garmentBlock=(g)=>ords.some(o=>(o.orderPieces||[]).includes(g.name))?"مستخدم في أوردرات":null;
  return<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>{[["fab","الأقمشة"],["acc","تشغيل + اكسسوار"],["size","المقاسات"],["garment","قطع الموديل"],["ws","الورش"],["status","حالات الأوردر"]].map(([k,l])=><Btn key={k} on={sub===k} onClick={()=>setSub(k)}>{l}</Btn>)}</div>
    {sub==="fab"&&<><Card title="جدول الأقمشة" extra={canEdit&&<Btn primary small onClick={()=>setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:true})}>+ اضافة</Btn>}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}><thead><tr>{["#","القماش","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.fabrics.map((f,i)=><tr key={f.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{f.name}</td><td style={TD}>{f.unit}</td><td style={{...TDB,color:T.accent}}>{f.price+" ج.م"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setFf({name:f.name,unit:f.unit,price:f.price,_eid:f.id,_show:true}))}<DelBtn onConfirm={()=>upConfig(d=>{d.fabrics=d.fabrics.filter(x=>x.id!==f.id)})} blocked={fabBlock(f)}/></div></td>}</tr>)}</tbody></table></div></Card>
    {ff._show&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFf({...ff,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{ff._eid?"✏️ تعديل القماش":"+ قماش جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم القماش</label><Inp value={ff.name} onChange={v=>setFf({...ff,name:v})}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الوحدة</label><Sel value={ff.unit} onChange={v=>setFf({...ff,unit:v})}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>السعر</label><Inp value={ff.price} onChange={v=>setFf({...ff,price:v})} type="number"/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveFab();setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:false})}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="acc"&&<><Card title="تشغيل + اكسسوار" extra={canEdit&&<Btn primary small onClick={()=>setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:true})}>+ اضافة</Btn>}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["#","الوصف","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.accessories.map((a,i)=><tr key={a.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.unit}</td><td style={{...TDB,color:T.accent}}>{a.price+" ج.م"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setAf({name:a.name,unit:a.unit,price:a.price,_eid:a.id,_show:true}))}<DelBtn onConfirm={()=>upConfig(d=>{d.accessories=d.accessories.filter(x=>x.id!==a.id)})} blocked={accBlock(a)}/></div></td>}</tr>)}</tbody></table></div></Card>
    {af._show&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAf({...af,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{af._eid?"✏️ تعديل البند":"+ بند جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الوصف</label><Inp value={af.name} onChange={v=>setAf({...af,name:v})}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الوحدة</label><Sel value={af.unit} onChange={v=>setAf({...af,unit:v})}><option value="قطعة">قطعة</option><option value="متر">متر</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>السعر</label><Inp value={af.price} onChange={v=>setAf({...af,price:v})} type="number"/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveAcc();setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:false})}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="size"&&<><Card title="المقاسات" extra={canEdit&&<Btn primary small onClick={()=>setSfld({label:"",pcs:0,_eid:null,_show:true})}>+ اضافة</Btn>}>
      <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","المقاسات","قطع/سيري",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.sizeSets.map((s,i)=><tr key={s.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{s.label}</td><td style={{...TDB,color:T.accent}}>{s.pcsPerSeries||"-"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setSfld({label:s.label,pcs:s.pcsPerSeries||0,_eid:s.id,_show:true}))}<DelBtn onConfirm={()=>upConfig(d=>{d.sizeSets=d.sizeSets.filter(x=>x.id!==s.id)})} blocked={sizeBlock(s)}/></div></td>}</tr>)}</tbody></table></Card>
    {sfld._show&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSfld({...sfld,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:400,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{sfld._eid?"✏️ تعديل المقاس":"+ مقاس جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>المقاسات</label><Inp value={sfld.label} onChange={v=>setSfld({...sfld,label:v})} placeholder="S-M-L-XL"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>قطع/سيري</label><Inp type="number" value={sfld.pcs||""} onChange={v=>setSfld({...sfld,pcs:Number(v)||0})}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setSfld({label:"",pcs:0,_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveSize();setSfld({label:"",pcs:0,_eid:null,_show:false})}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="garment"&&<><Card title="قطع الموديل" extra={canEdit&&<Btn primary small onClick={()=>{setGName("");setGEid(null);setGIconSel("👕");setGShow(true)}}>+ اضافة</Btn>}>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>{(data.garmentTypes||[]).map(g=><span key={g.id} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:12,border:"1px solid "+T.brd,fontSize:FS,fontWeight:600,background:T.cardSolid}}>{(g.icon||gIcon(g.name,data.garmentTypes))+" "+g.name}{g.defaultPrice?<span style={{fontSize:FS-2,color:"#8B5CF6",fontWeight:700}}>{g.defaultPrice+" ج.م"}</span>:""}{canEdit&&<>{" "}{eBtn(()=>{setGName(g.name);setGEid(g.id);setGIconSel(g.icon||gIcon(g.name,data.garmentTypes));setGPrice(g.defaultPrice||"");setGShow(true)})}<DelBtn onConfirm={()=>upConfig(d=>{d.garmentTypes=(d.garmentTypes||[]).filter(x=>x.id!==g.id)})} blocked={garmentBlock(g)}/></>}</span>)}</div>
      {(!data.garmentTypes||data.garmentTypes.length===0)&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة قطع بعد</div>}
    </Card>
    {gShow&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setGShow(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{gEid?"✏️ تعديل القطعة":"+ قطعة جديدة"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الأيقونة</label><Sel value={gIconSel} onChange={setGIconSel}>{GARMENT_ICONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم القطعة</label><Inp value={gName} onChange={setGName} placeholder="قميص، شورت..."/></div>
        </div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>سعر التشغيل الافتراضي (ج.م/قطعة)</label><Inp type="number" value={gPrice} onChange={setGPrice} placeholder="0"/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setGShow(false)}>الغاء</Btn><Btn primary onClick={()=>{saveGarment();setGShow(false)}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="ws"&&<WsManager workshops={data.workshops||[]} upConfig={upConfig} canEdit={canEdit} isMob={isMob} orders={data.orders} renameInOrders={renameInOrders} wsPayments={data.wsPayments||[]}/>}
    {sub==="status"&&<><Card title="حالات الأوردر" extra={canEdit&&<Btn primary small onClick={()=>{setStName("");setStColor("#0EA5E9");setStEid(null);setStShow(true)}}>+ اضافة</Btn>}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":isTab?"repeat(2,1fr)":"repeat(4,1fr)",gap:12}}>
        {statusCards.map(s=><div key={s.id} style={{padding:16,borderRadius:14,border:"2px solid "+s.color+"40",background:s.color+"08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:20,height:20,borderRadius:6,background:s.color}}/><span style={{fontWeight:700,fontSize:FS,color:T.text}}>{s.name}</span></div>
          {canEdit&&<div style={{display:"flex",gap:4}}>{eBtn(()=>{setStName(s.name);setStColor(s.color);setStEid(s.id);setStShow(true)})}<DelBtn onConfirm={()=>upConfig(d=>{d.statusCards=(d.statusCards||[]).filter(x=>x.id!==s.id)})} blocked={ords.some(o=>o.status===s.name)?"يوجد أوردرات بهذه الحالة":null}/></div>}
        </div>)}
      </div>
    </Card>
    {stShow&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setStShow(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{stEid?"✏️ تعديل الحالة":"+ حالة جديدة"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم الحالة</label><Inp value={stName} onChange={setStName}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اللون</label><input type="color" value={stColor} onChange={e=>setStColor(e.target.value)} style={{width:"100%",height:40,borderRadius:8,border:"1px solid "+T.brd,cursor:"pointer"}}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setStShow(false)}>الغاء</Btn><Btn primary onClick={()=>{saveStatus();setStShow(false)}} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
  </div>
}

/* ══ WORKSHOP MANAGER ══ */
function WsManager({workshops,upConfig,canEdit,isMob,orders,renameInOrders,wsPayments}){
  const[showForm,setShowForm]=useState(false);const[editId,setEditId]=useState(null);
  const[f,setF]=useState({name:"",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:0,type:"خياطة خارجي",payPercent:60});
  const startEdit=(ws)=>{setF({...ws,type:ws.type==="خارجي"?"خياطة خارجي":ws.type==="داخلي"?"خياطة داخلي":ws.type||"خياطة خارجي",payPercent:ws.payPercent||60});setEditId(ws.id);setShowForm(true)};
  const startNew=()=>{setF({name:"",owner:"",phone:"",address:"",idCard:"",ownerPhoto:"",rating:0,type:"خياطة خارجي",payPercent:60});setEditId(null);setShowForm(true)};
  const handleIdCard=async e=>{const file=e.target.files[0];if(!file)return;const compressed=await compressImg43(file,300,0.5);setF(p=>({...p,idCard:compressed}))};
  const handleOwnerPhoto=async e=>{const file=e.target.files[0];if(!file)return;const compressed=await compressImage(file,200,0.5);setF(p=>({...p,ownerPhoto:compressed}))};
  const save=()=>{if(!f.name.trim())return;
    let oldName=null;
    if(editId){const old=workshops.find(w=>w.id===editId);if(old&&old.name!==f.name.trim())oldName=old.name}
    upConfig(d=>{if(!Array.isArray(d.workshops))d.workshops=[];if(editId){const idx=d.workshops.findIndex(w=>w.id===editId);if(idx>=0)d.workshops[idx]={...f,id:editId}}else{d.workshops.push({...f,id:Date.now()})}
      if(oldName){(d.wsPayments||[]).forEach(p=>{if(p.wsId===editId||p.wsName===oldName){p.wsName=f.name.trim();p.wsId=editId}});(d.notifications||[]).forEach(n=>{if(n.msg&&n.msg.includes(oldName))n.msg=n.msg.replace(new RegExp(oldName,"g"),f.name.trim())})}
    });
    if(oldName)renameInOrders("ws",oldName,f.name.trim(),editId);
    setShowForm(false);setEditId(null)};
  const del=(id)=>upConfig(d=>{d.workshops=(d.workshops||[]).filter(w=>w.id!==id)});
  const wsBlock=(ws)=>{const hasOrders=(orders||[]).some(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===ws.name));if(hasOrders)return"يوجد تسليمات مرتبطة بهذه الورشة";const hasPay=(wsPayments||[]).some(p=>p.wsName===ws.name);if(hasPay)return"يوجد دفعات مرتبطة بهذه الورشة";return null};
  const[wsSearch,setWsSearch]=useState("");
  const filteredWs=wsSearch.trim()?(workshops||[]).filter(ws=>(ws.name||"").includes(wsSearch)||(ws.address||"").includes(wsSearch)||(ws.phone||"").includes(wsSearch)||(ws.owner||"").includes(wsSearch)):(workshops||[]);

  return<div>
    <Card title="ادارة الورش" extra={canEdit&&<Btn primary small onClick={startNew}>+ ورشة جديدة</Btn>}>
      <div style={{marginBottom:12}}><Inp value={wsSearch} onChange={setWsSearch} placeholder="بحث باسم الورشة أو العنوان أو التليفون..."/></div>
      {/* Workshop Cards */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14}}>
        {filteredWs.map(ws=>{
          /* Compute workshop stats */
          let totalDel=0,totalRcv=0,orderCount=0;
          orders.forEach(o=>{let hasWs=false;(o.workshopDeliveries||[]).filter(wd=>wd.wsName===ws.name).forEach(wd=>{hasWs=true;totalDel+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{totalRcv+=Number(r.qty)||0})});if(hasWs)orderCount++});
          const pct=totalDel>0?Math.round(totalRcv/totalDel*100):0;
          const bal=totalDel-totalRcv;
          return<div key={ws.id} onClick={()=>{if(canEdit)startEdit(ws)}} style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.06)",cursor:canEdit?"pointer":"default",transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
          {/* Header */}
          {(()=>{const wt=wsTypeInfo(ws.type);return<div style={{padding:"14px 16px",background:wt.color+"08",borderBottom:"1px solid "+T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                {ws.ownerPhoto&&<img src={ws.ownerPhoto} alt="" style={{width:44,height:58,borderRadius:8,objectFit:"cover",flexShrink:0}}/>}
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontSize:FS+2,fontWeight:800}}>{ws.name}</span><span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,fontWeight:600,background:wt.color+"15",color:wt.color}}>{wt.icon+" "+wt.key}</span>{!wt.internal&&<span style={{fontSize:FS-3,padding:"2px 8px",borderRadius:6,fontWeight:600,background:T.purple+"12",color:T.purple}}>{(ws.payPercent||60)+"%"}</span>}</div>
                  {ws.owner&&<div style={{fontSize:FS-1,color:T.textSec}}>{"👤 "+ws.owner}</div>}
                </div>
              </div>
              {!wt.internal&&<QRImg text={window.location.origin+"?act=wsacc&ws="+encodeURIComponent(ws.name)} size={94}/>}
            </div>
          </div>})()}
          {/* Stats Grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:1,background:T.brd}}>
            {[{label:"أوردرات",value:orderCount,color:T.accent},{label:"تسليم ورشة",value:totalDel,color:T.purple},{label:"استلام مصنع",value:totalRcv,color:T.ok},{label:"الرصيد",value:bal,color:bal>0?T.err:T.ok}].map(s=><div key={s.label} style={{background:T.cardSolid,padding:"8px 6px",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>{s.label}</div><div style={{fontSize:FS+2,fontWeight:800,color:s.color}}>{s.value}</div></div>)}
          </div>
          {/* Progress bar */}
          <div style={{padding:"8px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,color:T.textSec,marginBottom:3}}><span>نسبة الاستلام</span><span style={{fontWeight:700,color:pct>=80?T.ok:pct>=50?T.warn:T.err}}>{pct+"%"}</span></div>
            <div style={{height:6,borderRadius:3,background:"#E2E8F0",overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",borderRadius:3,background:pct>=80?T.ok:pct>=50?T.warn:T.err,transition:"width 0.5s"}}/></div>
          </div>
          {/* Info + Rating */}
          {(()=>{const autoR=calcWsRating(ws.name,orders);const rating=ws.ratingManual?(ws.rating||0):autoR!==null?autoR:0;const label=ws.ratingManual?"يدوي":autoR!==null?"تلقائي":"بدون بيانات";return<div style={{padding:"4px 16px 10px",display:"flex",gap:10,flexWrap:"wrap",fontSize:FS-2,color:T.textSec,alignItems:"center"}}>
            {ws.phone&&<span>{"📱 "+ws.phone}</span>}
            {ws.address&&<span style={{maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{"📍 "+ws.address}</span>}
            <span style={{fontWeight:700,color:rating>=7?T.ok:rating>=4?T.warn:rating>0?T.err:T.textMut}}>{"⭐ "+rating+"/10 ("+label+")"}</span>
            {canEdit&&<span onClick={e=>{e.stopPropagation();const v=prompt("تعديل التقييم يدوي (من 10):",rating);if(v!==null){const n=Math.min(10,Math.max(0,Number(v)||0));upConfig(d=>{const idx=d.workshops.findIndex(x=>x.id===ws.id);if(idx>=0){d.workshops[idx].rating=n;d.workshops[idx].ratingManual=true}})}}} style={{cursor:"pointer",fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</span>}
            {canEdit&&ws.ratingManual&&<span onClick={e=>{e.stopPropagation();upConfig(d=>{const idx=d.workshops.findIndex(x=>x.id===ws.id);if(idx>=0){d.workshops[idx].ratingManual=false}})}} style={{cursor:"pointer",fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>↩ تلقائي</span>}
          </div>})()}
          {/* Delete only */}
          <div style={{padding:"0 16px 10px",display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>
            {canEdit&&<DelBtn onConfirm={()=>del(ws.id)} blocked={wsBlock(ws)}/>}
          </div>
        </div>})}
      </div>
      {(!workshops||workshops.length===0)&&<div style={{textAlign:"center",padding:30,color:T.textSec}}>لا توجد ورش مسجلة</div>}
    </Card>
    {/* Workshop Edit Popup */}
    {showForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setShowForm(false);setEditId(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:600,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{editId?"✏️ تعديل الورشة":"+ ورشة جديدة"}</div>
          <Btn ghost onClick={()=>{setShowForm(false);setEditId(null)}} title="إغلاق">✕</Btn>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم الورشة *</label><Inp value={f.name} onChange={v=>setF({...f,name:v})}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم صاحب الورشة</label><Inp value={f.owner} onChange={v=>setF({...f,owner:v})}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:12}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع الورشة *</label><Sel value={f.type||"خياطة خارجي"} onChange={v=>setF({...f,type:v})}>{WS_TYPES.map(t=><option key={t.key} value={t.key}>{t.icon+" "+t.key}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>النسبة من الدفعات</label><Sel value={f.payPercent||60} onChange={v=>setF({...f,payPercent:Number(v)})}>{[30,40,50,60,70,80,90,100].map(p=><option key={p} value={p}>{p+"%"}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>رقم التليفون</label><Inp value={f.phone} onChange={v=>setF({...f,phone:v})} type="tel"/></div>
        </div>
        <div style={{marginBottom:12}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>العنوان</label><textarea value={f.address||""} onChange={e=>setF({...f,address:e.target.value})} style={{width:"100%",height:60,padding:10,borderRadius:10,border:"1px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical"}}/></div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>صورة صاحب الورشة</label>
          <div style={{width:80,height:107,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.bg,cursor:"pointer",position:"relative"}}>
            {f.ownerPhoto?<img src={f.ownerPhoto} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-2,color:T.textMut}}>صورة</span>}
            <input type="file" accept="image/*" onChange={handleOwnerPhoto} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn ghost onClick={()=>{setShowForm(false);setEditId(null)}}>الغاء</Btn><Btn primary onClick={save} title="حفظ التعديلات">💾 حفظ</Btn></div>
      </div>
    </div>}
  </div>
}

/* ══ ORDER FORM ══ */
function OrdForm({data,initial,onSave,onCancel,isMob,statusCards,upConfig}){
  const[form,setForm]=useState(initial);const[errs,setErrs]=useState([]);
  const[editStatusForm,setEditStatusForm]=useState(false);
  const[copyMode,setCopyMode]=useState(false);const[copyFrom,setCopyFrom]=useState("");
  const[copyFields,setCopyFields]=useState({fabrics:true,pieces:true,sizes:true,acc:true,instructions:true});
  const[qfab,setQfab]=useState(null);/* quick add fabric popup */
  const fabObj=id=>data.fabrics.find(x=>x.id===Number(id));
  const handleImg=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,250,0.4);setForm(p=>({...p,image:compressed}))};
  const handleFile=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>1000000){alert("حجم الملف أكبر من 1MB");return}const result=await compressFile(f);if(result)setForm(p=>({...p,attachments:[...(p.attachments||[]),result]}))};
  const mainQty=sqty(form.colorsA);const updF=(key,val)=>setForm(p=>setF(p,key,val));
  const isDirty=form.modelNo||form.modelDesc||form.fabricA||(form.colorsA||[]).some(c=>c.color||c.layers>0);
  useEffect(()=>{window.__formDirty=!!isDirty;return()=>{window.__formDirty=false}},[isDirty]);
  const[dupPopup,setDupPopup]=useState(false);const[dupModelNo,setDupModelNo]=useState("");
  const[cancelPopup,setCancelPopup]=useState(false);
  const handleCancel=()=>{if(isDirty){setCancelPopup(true)}else{onCancel()}};
  const[dupPoPopup,setDupPoPopup]=useState(false);
  /* Auto-generate PO number */
  const genPO=(modelNo)=>{if(!modelNo)return"";const existing=data.orders.filter(o=>o.poNumber&&o.poNumber.startsWith("PO-"+modelNo+"-"));const nums=existing.map(o=>{const p=o.poNumber.split("-");return Number(p[p.length-1])||0});const next=nums.length>0?Math.max(...nums)+1:1;return"PO-"+modelNo+"-"+String(next).padStart(3,"0")};
  const save=()=>{const v=validateOrder(form);if(v.length>0){setErrs(v);return}setErrs([]);
    /* Auto-generate PO if empty */
    let finalForm={...form};
    if(!finalForm.poNumber)finalForm.poNumber=genPO(finalForm.modelNo);
    /* Check uniqueness */
    const dupPo=data.orders.find(o=>o.poNumber===finalForm.poNumber&&o.id!==finalForm.id);
    if(dupPo){setDupPoPopup(true);return}
    const ss=data.sizeSets.find(s=>s.id===Number(finalForm.sizeSetId));const o={...finalForm,cutQty:mainQty,sizeLabel:ss?ss.label:""};FKEYS.forEach(k=>{const fb=fabObj(o["fabric"+k]);o["fabric"+k+"Label"]=fb?(fb.name+" - "+fb.unit):"";o["fabric"+k+"Price"]=fb?fb.price:0;o["fabric"+k+"Unit"]=fb?fb.unit:""});delete o._docId;onSave(o)};
  const doCopy=()=>{const src=data.orders.find(o=>o.id===copyFrom);if(!src)return;setForm(p=>{const n={...p};
    if(copyFields.sizes){n.sizeSetId=src.sizeSetId;n.sizeLabel=src.sizeLabel}
    if(copyFields.fabrics)FKEYS.forEach(k=>{n["fabric"+k]=src["fabric"+k]||"";n["cons"+k]=src["cons"+k]||"";n["colors"+k]=JSON.parse(JSON.stringify(src["colors"+k]||[]));n["cutDate"+k]=src["cutDate"+k]||"";n["fabricPieces"+k]=src["fabricPieces"+k]||[]});
    if(copyFields.pieces)n.orderPieces=[...(src.orderPieces||[])];
    if(copyFields.acc)n.accItems=JSON.parse(JSON.stringify(src.accItems||[]));
    if(copyFields.instructions)n.instructions=src.instructions||"";
    return n});setCopyMode(false);setCopyFrom("")};
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const toggleCF=k=>setCopyFields(p=>({...p,[k]:!p[k]}));
  const[tplMode,setTplMode]=useState(false);
  const templates=data.orderTemplates||[];
  const saveTpl=()=>{const name=prompt("اسم القالب:");if(!name)return;const tpl={name,sizeSetId:form.sizeSetId,orderPieces:[...(form.orderPieces||[])],accItems:JSON.parse(JSON.stringify(form.accItems||[])),instructions:form.instructions||""};FKEYS.forEach(k=>{tpl["fabric"+k]=form["fabric"+k]||"";tpl["cons"+k]=form["cons"+k]||"";tpl["fabricPieces"+k]=form["fabricPieces"+k]||[]});upConfig(d=>{if(!d.orderTemplates)d.orderTemplates=[];d.orderTemplates.push({id:Date.now(),...tpl})});showToast("✓ تم حفظ القالب")};
  const loadTpl=(tpl)=>{setForm(p=>{const n={...p};n.sizeSetId=tpl.sizeSetId||"";n.orderPieces=[...(tpl.orderPieces||[])];n.accItems=JSON.parse(JSON.stringify(tpl.accItems||[]));n.instructions=tpl.instructions||"";FKEYS.forEach(k=>{n["fabric"+k]=tpl["fabric"+k]||"";n["cons"+k]=tpl["cons"+k]||"";n["fabricPieces"+k]=tpl["fabricPieces"+k]||[];n["colors"+k]=k==="A"?[{color:"",colorHex:"",layers:0,pcsPerLayer:0,qty:0}]:[];n["cutDate"+k]=new Date().toISOString().split("T")[0]});return n});setTplMode(false);showToast("✓ تم تحميل القالب")};

  if(copyMode)return<Card title="نسخ بيانات من أوردر" accent={"linear-gradient(135deg,"+T.purple+","+T.purple+"CC)"} style={{marginBottom:20}}>
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontSize:FS,fontWeight:600,color:T.textSec,marginBottom:6}}>اختر الأوردر المصدر</label>
      <Sel value={copyFrom} onChange={setCopyFrom}><option value="">-- اختر أوردر --</option>{sortOrders(data.orders).map(o=><option key={o.id} value={o.id}>{o.modelNo+" - "+o.modelDesc}</option>)}</Sel>
    </div>
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontSize:FS,fontWeight:600,color:T.textSec,marginBottom:8}}>البيانات المراد نسخها</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
        {[["fabrics","الخامات والألوان"],["pieces","قطع الموديل"],["sizes","المقاسات"],["acc","الاكسسوار"],["instructions","تعليمات التشغيل"]].map(([k,l])=><span key={k} onClick={()=>toggleCF(k)} style={{padding:"10px 18px",borderRadius:12,fontSize:FS,fontWeight:600,cursor:"pointer",background:copyFields[k]?T.accent+"15":T.bg,color:copyFields[k]?T.accent:T.textMut,border:"1.5px solid "+(copyFields[k]?T.accent+"50":T.brd)}}>{(copyFields[k]?"✓ ":"")+ l}</span>)}
      </div>
    </div>
    <div style={{display:"flex",gap:8}}><Btn primary onClick={doCopy} disabled={!copyFrom}>نسخ البيانات</Btn><Btn ghost onClick={()=>setCopyMode(false)}>الغاء</Btn></div>
  </Card>;

  if(tplMode)return<Card title="📂 قوالب الأوردرات" accent={"linear-gradient(135deg,#F59E0B,#F59E0BCC)"} style={{marginBottom:20}}>
    {templates.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>{templates.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:T.bg,borderRadius:10,border:"1px solid "+T.brd}}>
      <div><span style={{fontWeight:700,fontSize:FS}}>{t.name}</span><span style={{fontSize:FS-2,color:T.textSec,marginRight:8}}>{" — "+(t.orderPieces||[]).length+" قطعة"}</span></div>
      <div style={{display:"flex",gap:6}}><Btn small primary onClick={()=>loadTpl(t)}>تحميل</Btn><Btn danger small onClick={()=>upConfig(d=>{d.orderTemplates=(d.orderTemplates||[]).filter(x=>x.id!==t.id)})}>🗑️</Btn></div>
    </div>)}</div>:<div style={{textAlign:"center",padding:20,color:T.textSec}}>لا توجد قوالب محفوظة</div>}
    <div style={{marginTop:12}}><Btn ghost onClick={()=>setTplMode(false)}>↩ رجوع</Btn></div>
  </Card>;

  const _isDup=initial._isDup;
  return<><Card title={initial.modelNo?"تعديل الأوردر":_isDup?"تكرار أوردر":"أمر قص جديد"} accent={"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)"} extra={<div style={{display:"flex",gap:8}}>{!initial.modelNo&&!isMob&&!_isDup&&<Btn small onClick={()=>setTplMode(true)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}}>📂 قوالب</Btn>}{!initial.modelNo&&!isMob&&!_isDup&&<Btn small onClick={()=>setCopyMode(true)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}}>نسخ من أوردر</Btn>}{!initial.modelNo&&!isMob&&!_isDup&&data.orders.length>0&&<Btn small onClick={()=>{setDupPopup(true);setDupModelNo("")}} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}} title="تكرار الأوردر">📋 تكرار</Btn>}<Btn small onClick={save} style={{background:"#fff",color:T.accent,border:"none",fontWeight:700}}>حفظ</Btn>{form.fabricA&&!_isDup&&<Btn small onClick={saveTpl} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none"}}>💾 حفظ كقالب</Btn>}<Btn small onClick={handleCancel} style={{background:"rgba(255,255,255,0.3)",color:"#fff",border:"none"}}>الغاء</Btn></div>} style={{marginBottom:20}}>
    {errs.length>0&&<div style={{background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:12,padding:14,marginBottom:16}}>{errs.map((e,i)=><div key={i} style={{color:T.err,fontSize:FS,fontWeight:600,padding:"2px 0"}}>{"* "+e}</div>)}</div>}
    {dupPoPopup&&<div style={{background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:12,padding:14,marginBottom:16}}>
      <div style={{fontSize:FS+1,fontWeight:800,color:T.err,marginBottom:6}}>⚠️ رقم أمر التشغيل متكرر</div>
      <div style={{fontSize:FS,color:T.text,marginBottom:8}}>{"الرقم "+form.poNumber+" مستخدم بالفعل في أوردر آخر. كل أمر تشغيل لازم يكون فريد."}</div>
      <div style={{display:"flex",gap:8}}><Btn small onClick={()=>{updF("poNumber",genPO(form.modelNo));setDupPoPopup(false)}} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🔄 توليد رقم جديد</Btn><Btn ghost small onClick={()=>setDupPoPopup(false)}>تعديل يدوي</Btn></div>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"auto 1fr",gap:10,marginBottom:10}}>
      <div><div style={{width:isMob?"100%":100,height:isMob?120:160,borderRadius:10,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative"}}>{form.image?<img src={form.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-1,color:T.textMut}}>صورة</span>}<input type="file" accept="image/*" onChange={handleImg} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div></div>
      <div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"1fr 1fr 2fr 1fr 1fr 1fr",gap:6,marginBottom:6}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>رقم أمر التشغيل</label><Inp value={form.poNumber||""} onChange={v=>{if(initial.modelNo)updF("poNumber",v)}} readOnly={!initial.modelNo} placeholder={form.modelNo?"PO-"+form.modelNo+"-001":"PO-XXXX-001"} sx={{fontFamily:"monospace",letterSpacing:1,fontWeight:700,color:T.accent,opacity:initial.modelNo?1:0.7}}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>رقم الموديل *</label><Inp value={form.modelNo} onChange={v=>{updF("modelNo",v);if(!form.poNumber||form.poNumber.startsWith("PO-"))updF("poNumber",genPO(v))}}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الوصف *</label><Inp value={form.modelDesc} onChange={v=>updF("modelDesc",v)}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>المقاسات *</label><Sel value={form.sizeSetId} onChange={v=>{updF("sizeSetId",v);const ss=data.sizeSets.find(s=>s.id===Number(v));if(ss&&ss.pcsPerSeries){FKEYS.forEach(k=>{const cols=form["colors"+k]||[];if(cols.length>0){const nc=cols.map(c=>(!c.pcsPerLayer||c.pcsPerLayer===0)?{...c,pcsPerLayer:ss.pcsPerSeries,qty:(Number(c.layers)||0)*ss.pcsPerSeries}:c);updF("colors"+k,nc)}})}}}><option value="">-- اختر --</option>{data.sizeSets.map(s=><option key={s.id} value={s.id}>{s.label+(s.pcsPerSeries?" ("+s.pcsPerSeries+" قطعة/سيري)":"")}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>التاريخ *</label><Inp type="date" value={form.date} onChange={v=>updF("date",v)}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الحالة</label><div style={{display:"flex",alignItems:"center",gap:6}}>{editStatusForm?<><Sel value={form.status} onChange={v=>{updF("status",v);setEditStatusForm(false)}}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel><Btn ghost small onClick={()=>setEditStatusForm(false)} title="إغلاق">✕</Btn></>:<><Badge t={form.status} cards={statusCards}/><Btn ghost small onClick={()=>setEditStatusForm(true)} style={{fontSize:FS-3,padding:"2px 8px"}} title="تعديل">✏️</Btn></>}</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 2fr 2fr",gap:6}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>قطع الموديل</label><Sel value="" onChange={v=>{if(!v||(form.orderPieces||[]).length>=5)return;updF("orderPieces",[...(form.orderPieces||[]),v])}}>
            <option value="">{"-- اضف ("+(form.orderPieces||[]).length+"/5) --"}</option>
            {(data.garmentTypes||[]).filter(g=>!(form.orderPieces||[]).includes(g.name)).map(g=><option key={g.id} value={g.name}>{(g.icon||gIcon(g.name))+" "+g.name}</option>)}
          </Sel></div>
          <div style={{display:"flex",gap:4,alignItems:"end",flexWrap:"wrap"}}>
            {(form.orderPieces||[]).map((p,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:8,background:T.accentBg,border:"1px solid "+T.accent+"30",fontSize:FS-2,fontWeight:600,color:T.accent}}>{gIcon(p,data.garmentTypes)+" "+p}<span onClick={()=>updF("orderPieces",(form.orderPieces||[]).filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800,fontSize:FS-1}}>×</span></span>)}
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>ماركر (جربر)</label><Inp value={form.marker||""} onChange={v=>updF("marker",v)} placeholder="بيانات الماركر..."/></div>
        </div>
      </div>
    </div>
    {FKEYS.map((k,idx)=>{const fid=form["fabric"+k];const fb=fabObj(fid);const fabPieces=form["fabricPieces"+k]||[];return<div key={k}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",marginBottom:4,minWidth:500}}><tbody><tr>
        <td style={{...TDL,fontWeight:700,whiteSpace:"nowrap"}}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:FCOL[idx],marginLeft:4}}/>{"خامة "+k+(k==="A"?" *":"")}</td>
        <td style={TD}><div style={{display:"flex",gap:4,alignItems:"center"}}><div style={{flex:1}}><Sel value={fid} onChange={v=>updF("fabric"+k,v)}><option value="">{k==="A"?"-- اختر --":"-- اختياري --"}</option>{data.fabrics.map(f=><option key={f.id} value={f.id}>{f.name+" - "+f.price+" ج.م/"+f.unit}</option>)}</Sel></div>{upConfig&&<Btn small onClick={()=>setQfab({name:"",unit:"كيلو",price:"",forKey:k})} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30",whiteSpace:"nowrap",flexShrink:0}}>+</Btn>}</div></td>
        <td style={{...TDL,whiteSpace:"nowrap"}}>استهلاك/راق</td><td style={{...TD,width:90}}><Inp type="number" step="any" value={form["cons"+k]} onChange={v=>updF("cons"+k,v)}/></td>
        <td style={{...TDL,whiteSpace:"nowrap"}}>تاريخ القص</td><td style={{...TD,width:130}}><Inp type="date" value={form["cutDate"+k]||""} onChange={v=>updF("cutDate"+k,v)}/></td>
      </tr></tbody></table></div>
      {fid&&<FCTable label={"خامة "+k} fabName={fb?fb.name:""} accent={FCOL[idx]} colors={form["colors"+k]||[]} setColors={c=>updF("colors"+k,c)} pcsPerSeries={(()=>{const ss=data.sizeSets.find(s=>s.id===Number(form.sizeSetId));return ss?ss.pcsPerSeries:0})()}/>}
      {fid&&(form.orderPieces||[]).length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"center"}}>
        <span style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{"قطع خامة "+k+":"}</span>
        {(()=>{const takenByOther=new Set();FKEYS.filter(fk=>fk!==k).forEach(fk=>{(form["fabricPieces"+fk]||[]).forEach(p=>takenByOther.add(p))});
        return(form.orderPieces||[]).map(p=>{const sel=fabPieces.includes(p);const taken=takenByOther.has(p);if(taken&&!sel)return<span key={p} style={{padding:"5px 12px",borderRadius:10,fontSize:FS-2,fontWeight:600,background:"#F1F5F9",color:T.textMut+"80",border:"1px dashed "+T.brd,textDecoration:"line-through",cursor:"default"}}>{p}</span>;return<span key={p} onClick={()=>{const np=sel?fabPieces.filter(x=>x!==p):[...fabPieces,p];updF("fabricPieces"+k,np)}} style={{padding:"5px 12px",borderRadius:10,fontSize:FS-2,fontWeight:600,cursor:"pointer",background:sel?FCOL[idx]+"20":"#F1F5F9",color:sel?FCOL[idx]:T.textMut,border:"1px solid "+(sel?FCOL[idx]+"50":T.brd)}}>{p}</span>})})()}
      </div>}
    </div>})}
    <div style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:FS,fontWeight:700,color:T.accent}}>بنود التشغيل والاكسسوار</div><Btn ghost small onClick={()=>{const all=(data.accessories||[]).map(a=>({accId:a.id,name:a.name,price:a.price}));updF("accItems",all)}} style={{color:T.ok,fontSize:FS-2}}>+ اضافة الكل</Btn></div><AccPicker accItems={form.accItems||[]} dbAcc={data.accessories} onChange={items=>updF("accItems",items)}/></div>
    <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>ملفات مرفقة (حد أقصى 500KB/ملف)</label>
      <input type="file" onChange={handleFile} style={{marginBottom:8,fontSize:FS}}/>
      {(form.attachments||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:8}}>{form.attachments.map((a,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:T.accentBg,border:"1px solid "+T.brd,fontSize:FS-2}}>{"📎 "+a.name}<span onClick={()=>updF("attachments",form.attachments.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>x</span></span>)}</div>}
    </div>
    <div style={{marginBottom:16}}><label style={{display:"block",fontSize:FS,color:T.textSec,marginBottom:6,fontWeight:600}}>تعليمات التشغيل</label><textarea value={form.instructions||""} onChange={e=>updF("instructions",e.target.value)} placeholder="تعليمات التشغيل..." style={{width:"100%",height:100,padding:14,borderRadius:14,border:"1.5px solid "+T.brd,fontSize:FS,fontFamily:"inherit",background:T.cardSolid,color:T.text,boxSizing:"border-box",resize:"vertical"}}/></div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:16,borderTop:"1px solid "+T.brd,flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:20,fontWeight:800}}>{"كمية القص (A): "}<span style={{color:T.accent}}>{mainQty}</span></div>
      <div style={{display:"flex",gap:10}}><Btn ghost onClick={handleCancel}>الغاء</Btn><Btn primary onClick={save}>حفظ</Btn></div>
    </div>
    {qfab&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setQfab(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>{"اضافة خامة سريعة ("+qfab.forKey+")"}</div>
          <Btn ghost small onClick={()=>setQfab(null)} title="إغلاق">✕</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم الخامة</label><Inp value={qfab.name} onChange={v=>setQfab({...qfab,name:v})} placeholder="مثال: شعييرات مازيراتي"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>الوحدة</label><Sel value={qfab.unit} onChange={v=>setQfab({...qfab,unit:v})}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>السعر</label><Inp type="number" value={qfab.price} onChange={v=>setQfab({...qfab,price:v})} placeholder="0"/></div>
          </div>
          <Btn primary onClick={()=>{if(!qfab.name.trim()||!qfab.price)return;const newId=Date.now();upConfig(d=>{if(!d.fabrics)d.fabrics=[];d.fabrics.push({id:newId,name:qfab.name.trim(),unit:qfab.unit,price:Number(qfab.price)||0})});updF("fabric"+qfab.forKey,String(newId));setQfab(null);showToast("✓ تم اضافة الخامة")}}>حفظ واختيار</Btn>
        </div>
      </div>
    </div>}
  </Card>
  {dupPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setDupPopup(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
    <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",marginBottom:14}}>📋 تكرار من أوردر</div>
    <div style={{marginBottom:12}}><label style={{fontSize:FS-2,color:T.textSec}}>اختر الأوردر</label><Sel value={dupModelNo} onChange={setDupModelNo}><option value="">-- اختر --</option>{data.orders.map(o=><option key={o.id} value={o.modelNo}>{o.modelNo+" — "+o.modelDesc}</option>)}</Sel></div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setDupPopup(false)}>الغاء</Btn><Btn primary disabled={!dupModelNo} onClick={()=>{const src=data.orders.find(o=>o.modelNo===dupModelNo);if(!src)return;setForm(p=>{const n={...p};n.sizeSetId=src.sizeSetId;n.sizeLabel=src.sizeLabel;n.orderPieces=[...(src.orderPieces||[])];n.accItems=JSON.parse(JSON.stringify(src.accItems||[]));n.instructions=src.instructions||"";FKEYS.forEach(k=>{n["fabric"+k]=src["fabric"+k]||"";n["cons"+k]=src["cons"+k]||"";n["colors"+k]=JSON.parse(JSON.stringify(src["colors"+k]||[]));n["cutDate"+k]=new Date().toISOString().split("T")[0];n["fabricPieces"+k]=src["fabricPieces"+k]||[]});return n});setDupPopup(false);showToast("✓ تم نسخ بيانات "+dupModelNo)}}>تكرار</Btn></div>
  </div></div>}
  {cancelPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"30vh",padding:"30vh 16px 16px"}} onClick={()=>setCancelPopup(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:360,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)",textAlign:"center"}}>
    <div style={{fontSize:40,marginBottom:10}}>⚠️</div>
    <div style={{fontSize:FS+2,fontWeight:800,color:T.warn,marginBottom:8}}>هل تريد الخروج؟</div>
    <div style={{fontSize:FS,color:T.textSec,marginBottom:16}}>يوجد بيانات مدخلة لم يتم حفظها</div>
    <div style={{display:"flex",gap:10,justifyContent:"center"}}><Btn ghost onClick={()=>setCancelPopup(false)}>متابعة التسجيل</Btn><Btn danger onClick={()=>{setCancelPopup(false);window.__formDirty=false;onCancel()}}>خروج بدون حفظ</Btn></div>
  </div></div>}
</>}

/* ══ DETAILS ══ */
function DetPg({data,updOrder,replaceOrder,addOrder,delOrder,sel,setSel,isMob,isTab,canEdit,statusCards,goHome,upConfig,user}){
  const order=data.orders.find(o=>o.id===sel);const[editing,setEditing]=useState(false);
  const userName=user?.displayName||user?.email?.split("@")[0]||"";
  const[detQ,setDetQ]=useState("");const[detSt,setDetSt]=useState("الكل");const[waSent,setWaSent]=useState({});const[waPopup,setWaPopup]=useState(null);
  const[editStockIdx,setEditStockIdx]=useState(null);
  const[settReason,setSettReason]=useState("");const[settNotes,setSettNotes]=useState("");
  const[showNew,setShowNew]=useState(false);
  const[dupInit,setDupInit]=useState(null);
  const[showDeliver,setShowDeliver]=useState(false);
  const[editStatusMode,setEditStatusMode]=useState(false);
  const[editRcv,setEditRcv]=useState(null);const[edRcvQty,setEdRcvQty]=useState(0);const[edRcvDate,setEdRcvDate]=useState("");const[edRcvNote,setEdRcvNote]=useState("");
  const[dWs,setDWs]=useState("");const[dType,setDType]=useState("");const[dQty,setDQty]=useState(0);const[dPrice,setDPrice]=useState("");const[dNote,setDNote]=useState("");const[dDate,setDDate]=useState(new Date().toISOString().split("T")[0]);const[dAgreed,setDAgreed]=useState("");
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const workshops=data.workshops||[];
  const isInternal=(name)=>{const w=workshops.find(x=>x.name===name);return w?wsIsInternal(w.type):false};
  useEffect(()=>{const h=()=>{if(!window.__qrStock||!order)return;delete window.__qrStock;updOrder(sel,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:0,notes:"",createdBy:userName||""})});setTimeout(()=>{setEditStockIdx((order.deliveries||[]).length);setTimeout(()=>{const inp=document.querySelector("#stock-qty-input-wrap input");if(inp)inp.focus()},300)},200)};window.addEventListener("qr-stock",h);return()=>window.removeEventListener("qr-stock",h)},[order,sel]);

  if(dupInit)return<OrdForm data={data} initial={dupInit} onSave={o=>{addOrder(o);setDupInit(null);showToast("✓ تم تكرار الأوردر")}} onCancel={()=>setDupInit(null)} isMob={isMob} statusCards={statusCards} upConfig={upConfig}/>;
  if(showNew)return<OrdForm data={data} initial={mkOrder()} onSave={o=>{addOrder(o);setShowNew(false);showToast("✓ تم اضافة أمر القص")}} onCancel={()=>setShowNew(false)} isMob={isMob} statusCards={statusCards} upConfig={upConfig}/>;

  if(!order){
    const filtered=data.orders.filter(o=>{
      if(detSt==="⚠️"){const _now=new Date();let _ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>_ld)_ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>_ld)_ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>_ld)_ld=d.date});if(Math.floor((_now-new Date(_ld))/(1000*60*60*24))<=7||o.status==="تم التسليم"||o.status==="تم الشحن")return false}
      if(detSt!=="الكل"&&detSt!=="⚠️"&&o.status!==detSt)return false;
      if(detQ.trim()){const s=detQ.trim().toLowerCase();const h=[o.modelNo,o.modelDesc,o.sizeLabel,o.status].filter(Boolean).join(" ").toLowerCase();if(!h.includes(s))return false}
      return true
    });
    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
        <h2 style={{fontSize:FS+1,fontWeight:700,margin:0,color:T.textSec}}>{"اختر أوردر ("+filtered.length+")"}</h2>
        {canEdit&&<Btn primary onClick={()=>setShowNew(true)}>+ أمر قص جديد</Btn>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob||isTab?"1fr":"2fr 1fr",gap:8,marginBottom:10}}>
        <Inp value={detQ} onChange={setDetQ} placeholder="بحث بالرقم أو الوصف أو المقاسات..."/>
        <Sel value={detSt} onChange={setDetSt}><option value="الكل">كل الحالات</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
        <span onClick={()=>setDetSt(detSt==="⚠️"?"الكل":"⚠️")} style={{padding:"4px 10px",borderRadius:6,background:detSt==="⚠️"?T.err+"20":T.bg,border:"1px solid "+(detSt==="⚠️"?T.err:T.brd),cursor:"pointer",fontSize:FS-1,fontWeight:600,color:detSt==="⚠️"?T.err:T.textSec}}>⚠️ متأخرة</span>
      </div>
      {filtered.length===0&&<Card><p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد نتائج</p></Card>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(4,1fr)",gap:12}}>
        {sortOrders(filtered).map(o=>{const t=calcOrder(o);
          const wds=o.workshopDeliveries||[];const hasData=wds.length>0||(o.deliveries||[]).length>0;
          /* Age coloring */
          const now=new Date();let lastDate=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>lastDate)lastDate=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>lastDate)lastDate=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>lastDate)lastDate=d.date});
          const ageDays=Math.floor((now-new Date(lastDate))/(1000*60*60*24));
          const isStale=ageDays>7&&o.status!=="تم التسليم"&&o.status!=="تم الشحن";
          const isSent=waSent[o.id]&&(Date.now()-waSent[o.id]<60000);
          return<div key={o.id} data-oid={o.id} style={{display:"flex",gap:16,padding:16,background:isSent?T.ok+"08":T.cardSolid,borderRadius:16,border:isSent?"2px solid "+T.ok+"40":isStale?"2px solid "+T.err+"60":"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",alignItems:"flex-start",position:"relative",transition:"all 0.3s"}} onClick={()=>setSel(o.id)}>
          {canEdit&&!hasData&&<div onClick={e=>{e.stopPropagation()}} style={{position:"absolute",top:8,left:8}}><DelBtn onConfirm={()=>delOrder(o.id)}/></div>}
          {isSent&&<div style={{position:"absolute",bottom:8,left:8,fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.ok+"15",color:T.ok,fontWeight:700}}>✅ تم الارسال</div>}
          {/* Priority removed */}
          {isStale&&!isSent&&<div style={{position:"absolute",bottom:8,left:8,fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.err+"15",color:T.err,fontWeight:700}}>{ageDays+" يوم"}</div>}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}>
            {o.image?<img src={o.image} alt="" style={{width:80,height:107,borderRadius:10,objectFit:"cover",border:"1px solid "+T.brd}}/>:<div style={{width:80,height:107,borderRadius:10,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,color:T.textMut}}>📷</div>}
            <div onClick={e=>{e.stopPropagation();setWaPopup({order:o,t:calcOrder(o),fromCard:true})}} title="ارسال واتساب" style={{width:80,height:28,borderRadius:6,background:"#25D36612",color:"#25D366",border:"1px solid #25D36630",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:12,fontWeight:700,gap:4}}>📱</div>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,gap:8}}>
              <div style={{flex:1,minWidth:0}}>
                {o.poNumber&&<div style={{fontSize:FS,fontWeight:800,color:T.accent,fontFamily:"monospace",letterSpacing:0.5,marginBottom:1}}>{"📋 "+o.poNumber}</div>}
                <div style={{fontSize:o.poNumber?FS-1:FS+1,fontWeight:700,color:o.poNumber?T.textSec:T.accent,marginBottom:2}}>{"🏷 "+o.modelNo}</div>
                <div style={{fontSize:FS+2,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis"}}>{o.modelDesc}</div>
                <div style={{fontSize:FS-1,color:T.textSec}}>{"مقاس "+o.sizeLabel}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:wds.length>0?8:0}}>
              <Badge t={o.status} cards={statusCards}/>
              <span style={{fontSize:FS,color:T.textSec}}>{"الكمية: "}<b style={{color:T.accent}}>{t.cutQty}</b></span>
              <span style={{fontSize:FS,color:T.textSec}}>{"تسليم: "}<b style={{color:T.ok}}>{o.deliveredQty||0}</b></span>
              <span style={{fontSize:FS,color:T.textSec}}>{"رصيد: "}<b style={{color:t.balance>0?T.err:T.ok}}>{t.balance}</b></span>
              <span style={{fontSize:FS,color:T.textSec}}>{"تكلفة: "}<b style={{color:"#8B5CF6"}}>{Math.ceil(t.costPer)+" ج.م"}</b></span>
              {(()=>{const pieces=o.orderPieces||[];if(pieces.length<=1)return null;const linked=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linked.add(p))});const missing=pieces.filter(p=>!linked.has(p));if(missing.length===0)return null;return<span style={{fontSize:FS-2,padding:"2px 8px",borderRadius:6,background:"#F59E0B12",color:"#F59E0B",fontWeight:700,border:"1px solid #F59E0B30"}}>{"⚠️ تكلفة غير مكتملة ("+missing.join("، ")+")"}</span>})()}
              {o.settlement&&<span style={{fontSize:FS-1,color:T.err,fontWeight:700}}>{"الفعلية: "+Math.ceil(o.deliveredQty>0?(t.costAll+o.settlement.cost)/o.deliveredQty:t.costPer)+" ج.م"}</span>}
              {o.closed&&<span style={{fontSize:FS-1,padding:"2px 8px",borderRadius:6,background:"#64748B15",color:"#64748B",fontWeight:700}}>🔒 مغلق</span>}
            </div>
            {wds.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>
              {(()=>{const wsGroup={};wds.forEach(wd=>{if(!wsGroup[wd.wsName])wsGroup[wd.wsName]=[];wsGroup[wd.wsName].push(wd)});
                return Object.entries(wsGroup).map(([name,items])=><div key={name} style={{display:"flex",flexDirection:"column",gap:2}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:FS-2,padding:"2px 8px",borderRadius:6,background:T.purple+"12",color:T.purple,fontWeight:700}}>{"🏭 "+name}</span>
                  </div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",paddingRight:20}}>
                    {items.map((wd,wi)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=wd.qty-rcvd;
                      return<span key={wi} style={{fontSize:FS-3,padding:"3px 8px",borderRadius:6,background:bal>0?T.warn+"10":T.ok+"10",border:"1px solid "+(bal>0?T.warn:T.ok)+"25"}}>
                        {wd.garmentType?<b style={{color:T.purple}}>{wd.garmentType+": "}</b>:""}<span style={{color:T.accent}}>{"تسليم ورشة "+wd.qty}</span>{" | "}<span style={{color:T.ok}}>{"استلام مصنع "+rcvd}</span>{bal>0&&<span style={{color:T.err}}>{" | رصيد "+bal}</span>}{bal===0&&<span style={{color:T.ok}}>{" ✓"}</span>}
                      </span>})}
                  </div>
                </div>)})()}
            </div>}
          </div>
        </div>})}
      </div>
    {waPopup&&(()=>{const wo=waPopup.order;const wt=waPopup.t||calcOrder(wo);const timeline=getOrderTimeline(wo,wt);const hasTimeline=!!timeline;
      const sendWa=async(withTimeline)=>{let text=getOrderDetails(wo,wt);if(withTimeline&&timeline)text+=timeline;
        if(wo.image&&navigator.canShare){try{const res=await fetch(wo.image);const blob=await res.blob();const file=new File([blob],wo.modelNo+".jpg",{type:blob.type||"image/jpeg"});if(navigator.canShare({files:[file]})){await navigator.share({title:"CLARK — "+wo.modelNo,text,files:[file]});setWaSent(p=>({...p,[wo.id]:Date.now()}));setTimeout(()=>setWaSent(p=>{const n={...p};delete n[wo.id];return n}),60000);setWaPopup(null);return}}catch(e){}}
        window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank");setWaSent(p=>({...p,[wo.id]:Date.now()}));setTimeout(()=>setWaSent(p=>{const n={...p};delete n[wo.id];return n}),60000);setWaPopup(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setWaPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{textAlign:"center",marginBottom:16}}><div style={{fontSize:20,marginBottom:4}}>📱</div><div style={{fontSize:FS+1,fontWeight:800,color:"#25D366"}}>ارسال واتساب</div><div style={{fontSize:FS-1,color:T.textSec}}>{wo.modelNo+" — "+wo.modelDesc}</div></div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div onClick={()=>sendWa(false)} style={{padding:14,borderRadius:12,border:"1px solid #25D36630",background:"#25D36606",cursor:"pointer",textAlign:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#25D36612"} onMouseLeave={e=>e.currentTarget.style.background="#25D36606"}><div style={{fontSize:FS,fontWeight:700,color:"#25D366"}}>📋 تفاصيل الأوردر فقط</div><div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>رقم الموديل والوصف والكمية والحالة</div></div>
            {hasTimeline&&<div onClick={()=>sendWa(true)} style={{padding:14,borderRadius:12,border:"1px solid #25D36630",background:"#25D36606",cursor:"pointer",textAlign:"center"}} onMouseEnter={e=>e.currentTarget.style.background="#25D36612"} onMouseLeave={e=>e.currentTarget.style.background="#25D36606"}><div style={{fontSize:FS,fontWeight:700,color:"#25D366"}}>📋 تفاصيل + تايم لاين</div><div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>كل الحركات + رصيد المخزن</div></div>}
          </div>
          <div style={{textAlign:"center",marginTop:12}}><Btn ghost small onClick={()=>setWaPopup(null)}>الغاء</Btn></div>
        </div>
      </div>})()}
    </div>
  }
  if(editing)return<OrdForm data={data} initial={order} onSave={o=>{replaceOrder(sel,o);setEditing(false);showToast("✓ تم حفظ التعديلات");highlightRow(sel)}} onCancel={()=>setEditing(false)} isMob={isMob} statusCards={statusCards} upConfig={upConfig}/>;

  const t=calcOrder(order);const accItems=order.accItems||[];const accAll=t.accPer*t.cutQty;
  const activeFabs=FKEYS.filter(k=>order["fabric"+k]);

  /* Prev/Next navigation */
  const sortedIds=sortOrders(data.orders).map(o=>o.id);const curIdx=sortedIds.indexOf(sel);
  const prevId=curIdx>0?sortedIds[curIdx-1]:null;const nextId=curIdx<sortedIds.length-1?sortedIds[curIdx+1]:null;

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <Btn ghost onClick={()=>setSel(null)} style={{fontSize:isMob?16:20}} title="إغلاق">✕</Btn>
        <div>
          <h1 style={{fontSize:isMob?16:20,fontWeight:800,margin:0}}>{order.poNumber?<>{"أمر تشغيل: "}<span style={{color:T.accent,fontFamily:"monospace"}}>{order.poNumber}</span></>:<>{"أمر تشغيل: "}<span style={{color:T.accent}}>{order.modelNo}</span></>}</h1>
          {order.poNumber&&<div style={{fontSize:FS-1,color:T.textSec,marginTop:2}}>{"موديل: "+order.modelNo+" — "+order.modelDesc}</div>}
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
        </div>
      </div>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        <Btn small onClick={()=>prevId&&setSel(prevId)} disabled={!prevId} style={{fontSize:18,padding:"2px 8px",opacity:prevId?1:0.3}}>→</Btn>
        <span style={{fontSize:FS-2,color:T.textSec}}>{(curIdx+1)+"/"+sortedIds.length}</span>
        <Btn small onClick={()=>nextId&&setSel(nextId)} disabled={!nextId} style={{fontSize:18,padding:"2px 8px",opacity:nextId?1:0.3}}>←</Btn>
        <div style={{width:1,height:20,background:T.brd,margin:"0 4px"}}/>
        <Btn small onClick={()=>printOrderSheet(order,t,activeFabs,statusCards)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
        {canEdit&&!order.closed&&<Btn small primary onClick={()=>setEditing(true)} title="تعديل">✏️</Btn>}
        <Btn small onClick={()=>setWaPopup({order,t,fromCard:false})} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn>
        {canEdit&&!order.closed&&<Btn small onClick={()=>{const dup=JSON.parse(JSON.stringify(order));dup.id=gid();dup.date=new Date().toISOString().split("T")[0];dup.createdAt=new Date().toISOString();dup.modelNo="";dup.status="تم القص";dup.deliveredQty=0;dup.deliveries=[];dup.workshopDeliveries=[];dup._isDup=true;delete dup._docId;setDupInit(dup)}} style={{background:"#8B5CF6"+"12",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="تكرار الأوردر">📋 تكرار</Btn>}
        {canEdit&&!order.closed&&t.cutQty>0&&activeFabs.length>0&&<Btn small onClick={()=>{setShowDeliver(true);setDWs("");setDType("");setDQty(0);setDPrice("");setDNote("")}} style={{background:"#8B5CF6"+"12",color:"#8B5CF6",border:"1px solid #8B5CF630"}}>📤 تسليم ورشة</Btn>}
        {canEdit&&!order.closed&&<Btn small onClick={()=>setShowNew(true)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>+ جديد</Btn>}
        {order.closed&&<span style={{padding:"4px 12px",borderRadius:8,background:"#64748B12",color:"#64748B",fontWeight:700,fontSize:FS-1}}>🔒 مغلق</span>}
      </div>
    </div>
    <div id="parea">
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        {isMob&&order.image&&<div style={{flexShrink:0,position:"relative"}}><img src={order.image} alt="" style={{width:70,height:93,objectFit:"cover",borderRadius:10,border:"1px solid "+T.brd}}/>
          {canEdit&&<div onClick={()=>{if(confirm("حذف صورة الأوردر؟"))updOrder(sel,o=>{o.image=""})}} style={{position:"absolute",top:2,right:2,width:18,height:18,borderRadius:9,background:"rgba(0,0,0,0.6)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:9}}>✕</div>}
        </div>}
        <div style={{flex:1,display:"grid",gridTemplateColumns:isMob?"1fr 1fr":isTab?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMob?6:12}}>
          <MetricCard label="كمية القص" value={t.cutQty} icon="✂️" color={T.accent}/><MetricCard label="تم التسليم" value={order.deliveredQty||0} icon="📦" color={T.ok}/><MetricCard label="الرصيد" value={t.balance} icon="📊" color={t.balance>0?T.warn:T.ok}/><MetricCard label="تكلفة القطعة" value={t.costPer+" ج.م"} icon="💰" color={T.accent}/>
        </div>
        {/* Cost warning */}
        {(()=>{const pieces=order.orderPieces||[];if(pieces.length<=1)return null;const linked=new Set();FKEYS.forEach(k=>{if(gf(order,k))(order["fabricPieces"+k]||[]).forEach(p=>linked.add(p))});const missing=pieces.filter(p=>!linked.has(p));if(missing.length===0)return null;
          return<div style={{marginBottom:14,padding:"10px 14px",borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B30",display:"flex",gap:10,alignItems:"flex-start"}}>
            <span style={{fontSize:20,flexShrink:0}}>⚠️</span>
            <div>
              <div style={{fontWeight:800,color:"#F59E0B",fontSize:FS}}>تكلفة غير مكتملة</div>
              <div style={{fontSize:FS-1,color:T.textSec,marginTop:2}}>{"القطع التالية لم يتم قصها بعد (بدون خامات):"}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                {missing.map(p=><span key={p} style={{padding:"2px 10px",borderRadius:6,background:"#EF444412",color:"#EF4444",fontWeight:700,fontSize:FS-1,border:"1px solid #EF444425"}}>{"❌ "+p}</span>)}
              </div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:4}}>
                {pieces.filter(p=>linked.has(p)).map(p=><span key={p} style={{padding:"2px 10px",borderRadius:6,background:"#10B98112",color:"#10B981",fontWeight:700,fontSize:FS-1,border:"1px solid #10B98125"}}>{"✅ "+p}</span>)}
              </div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>💡 أضف خامات القطع الناقصة لحساب التكلفة الكاملة</div>
            </div>
          </div>})()}
      </div>
      {/* Timeline - horizontal after cards */}
      {(()=>{const ev=[];ev.push({title:"تم القص",date:order.date,color:T.accent,detail:"كمية: "+t.cutQty});
        (order.workshopDeliveries||[]).forEach(wd=>{ev.push({title:"تسليم ورشة — "+wd.wsName,date:wd.date,color:"#8B5CF6",detail:(wd.garmentType||"")+" | "+wd.qty+" قطعة"});(wd.receives||[]).forEach(r=>{ev.push({title:(r.isSettlement?"⚖️ تسوية":"استلام مصنع")+" — "+wd.wsName,date:r.date,color:r.isSettlement?"#EF4444":T.ok,detail:r.qty+" قطعة"})})});
        (order.deliveries||[]).forEach(d=>{ev.push({title:"مخزن جاهز",date:d.date,color:"#059669",detail:d.qty+" قطعة"})});
        ev.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
        return ev.length>1&&<div style={{marginBottom:14,background:T.cardSolid,borderRadius:10,padding:"10px 14px",border:"1px solid "+T.brd}}><Timeline events={ev}/></div>})()}
      <div style={{display:"grid",gridTemplateColumns:order.image&&!isMob?"auto 1fr":"1fr",gap:16,marginBottom:16}}>
        {!isMob&&order.image&&<div style={{position:"relative"}}><img src={order.image} alt="" style={{width:135,height:180,aspectRatio:"3/4",objectFit:"cover",borderRadius:16,border:"1px solid "+T.brd,boxShadow:T.shadow}}/>
          {canEdit&&<div onClick={()=>{if(confirm("حذف صورة الأوردر؟"))updOrder(sel,o=>{o.image=""})}} style={{position:"absolute",top:4,right:4,width:22,height:22,borderRadius:11,background:"rgba(0,0,0,0.6)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11}}>✕</div>}
        </div>}
        <Card title="بيانات الموديل">
          <div style={{marginBottom:8}}>
            {order.poNumber&&<div style={{fontSize:FS+4,fontWeight:800,color:T.accent,fontFamily:"monospace",letterSpacing:1}}>{"📋 "+order.poNumber}</div>}
            <div style={{fontSize:order.poNumber?FS+1:FS+4,fontWeight:700,color:order.poNumber?T.textSec:T.accent}}>{(order.poNumber?"🏷 ":"🏷 ")+order.modelNo}<span style={{fontSize:FS,fontWeight:600,color:T.textSec,marginRight:10}}>{" — "+order.modelDesc}</span></div>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><tbody>
          <tr><td style={TDL}>المقاسات</td><td style={TDB}>{order.sizeLabel}</td><td style={TDL}>الحالة</td><td style={TD}><div style={{display:"flex",alignItems:"center",gap:6}}>{canEdit&&editStatusMode?<><Sel value={order.status} onChange={v=>{updOrder(sel,o=>{o.status=v});setEditStatusMode(false)}}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel><Btn ghost small onClick={()=>setEditStatusMode(false)} title="إغلاق">✕</Btn></>:<><Badge t={order.status} cards={statusCards}/>{canEdit&&<Btn ghost small onClick={()=>setEditStatusMode(true)} style={{fontSize:FS-3,padding:"2px 8px"}} title="تعديل">✏️</Btn>}</>}</div></td></tr>
          <tr><td style={TDL}>التاريخ</td><td style={TD}>{order.date}</td>{order.marker?<><td style={TDL}>ماركر</td><td style={TD}>{order.marker}</td></>:<><td></td><td></td></>}</tr>
        </tbody></table></div></Card>
      </div>
      {/* Order Pieces */}
      {(order.orderPieces||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:16}}>
        <span style={{fontSize:FS,fontWeight:700,color:T.text}}>{"قطع الموديل ("+order.orderPieces.length+"):"}</span>
        {order.orderPieces.map((p,i)=>{
          const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
          const avail=t.cutQty-delForP;
          return<span key={i} style={{padding:"8px 16px",borderRadius:12,background:avail>0?"#FEF3C7":"#D1FAE5",border:"1px solid "+(avail>0?T.warn:T.ok)+"40",fontSize:FS,fontWeight:600}}>{gIcon(p,data.garmentTypes)+" "+p}<span style={{fontSize:FS-2,color:T.textSec,marginRight:6}}>{" (تشغيل: "+delForP+" / متاح: "+avail+")"}</span></span>
        })}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":activeFabs.length>=3?"1fr 1fr 1fr":activeFabs.length===2?"1fr 1fr":"1fr",gap:14,marginBottom:16}}>
        {activeFabs.map(k=>{const colors=gc(order,k);if(colors.length===0)return null;const dt=gdate(order,k);const fp=order["fabricPieces"+k]||[];return<div key={k}><FCTable label={"خامة "+k} fabName={gf(order,k,"Label")} accent={FCOL[FKEYS.indexOf(k)]} colors={colors} setColors={()=>{}} readOnly/>
          {fp.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:-8,marginBottom:8}}>{fp.map(p=><span key={p} style={{padding:"3px 10px",borderRadius:8,fontSize:FS-3,fontWeight:600,background:FCOL[FKEYS.indexOf(k)]+"15",color:FCOL[FKEYS.indexOf(k)],border:"1px solid "+FCOL[FKEYS.indexOf(k)]+"30"}}>{gIcon(p,data.garmentTypes)+" "+p}</span>)}</div>}
          {dt&&<div style={{fontSize:FS-2,color:T.textSec,marginTop:-4,marginBottom:10}}>{"تاريخ القص: "+dt}</div>}
        </div>})}
      </div>
      <Card title={"تكلفة الخامات (كمية A = "+t.cutQty+")"} style={{marginBottom:16}}>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
          <thead><tr>{["الخامة","السعر","استهلاك/راق","استهلاك/قطعة","الراقات","القطع","التكلفة","تكلفة/قطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {activeFabs.map(k=>{const cons=gcons(order,k),price=gf(order,k,"Price")||0,layers=slay(gc(order,k)),qty=sqty(gc(order,k)),cost=cons*price*layers,perPc=t.cutQty?r2(cost/t.cutQty):0,unit=gf(order,k,"Unit")||"",ppl=(gc(order,k)[0]||{}).pcsPerLayer||1,consPc=r2(cons/ppl);return<tr key={k}><td style={TD}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:FCOL[FKEYS.indexOf(k)],marginLeft:8}}/>{gf(order,k,"Label")}</td><td style={TD}>{price+" ج.م"}</td><td style={TD}>{cons+(unit?" "+unit:"")}</td><td style={{...TDB,color:T.purple}}>{consPc+(unit?" "+unit:"")}</td><td style={TDB}>{layers}</td><td style={TDB}>{qty}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(cost))+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{perPc+" ج.م"}</td></tr>})}
            <tr style={{background:T.inputBg||T.cardSolid}}><td colSpan={6} style={{...TD,fontWeight:700}}>اجمالي تكلفة الخامات</td><td style={{...TD,fontWeight:700,color:T.accent}}>{fmt(r2(t.totalFab))+" ج.م"}</td><td style={{...TD,fontWeight:800,color:T.accent,fontSize:FS+2}}>{t.fabPer+" ج.م"}</td></tr>
          </tbody>
        </table></div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:isMob||isTab?"1fr":"1.5fr 1fr",gap:16,marginBottom:16}}>
        <Card title="تكاليف الاكسسوار">{accItems.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["الوصف","السعر","اجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          {accItems.map((a,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.price+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{fmt(a.price*t.cutQty)+" ج.م"}</td></tr>)}
          <tr style={{background:T.inputBg||T.cardSolid}}><td style={{...TD,fontWeight:700}}>اجمالي</td><td style={{...TD,fontWeight:700}}>{t.accPer+" ج.م/قطعة"}</td><td style={{...TD,fontWeight:700,color:T.accent}}>{fmt(accAll)+" ج.م"}</td></tr>
        </tbody></table></div>:<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة بنود</div>}</Card>
        {(()=>{
          const wds=order.workshopDeliveries||[];
          const pieces=order.orderPieces||[];
          let canStock=false;let blockMsg="";
          if(wds.length===0){blockMsg="⚠️ لا يمكن تسليم مخزن الجاهز - لم يتم تسليم طقم كامل للمصنع حتى الان"}
          else if(pieces.length>0){
            const missing=pieces.filter(p=>{
              const rcvdForP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
              return rcvdForP===0
            });
            if(missing.length>0){blockMsg="⚠️ لا يمكن تسليم مخزن جاهز - لم يتم استلام: "+missing.join("، ")+" من الورش بعد"}
            else{canStock=true}
          } else {
            const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
            if(totalRcv===0){blockMsg="⚠️ لا يمكن تسليم مخزن جاهز - لم يتم استلام أي كمية من الورش بعد"}
            else{canStock=true}
          }
          const stockDel=(order.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const stockRemain=t.cutQty-stockDel;
          return<Card title="تسليم مخزن جاهز" extra={canEdit&&canStock&&<Btn primary small onClick={()=>updOrder(sel,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:0,notes:"",createdBy:userName||""});setTimeout(()=>setEditStockIdx(o.deliveries.length-1),100)})}>+ تسليم</Btn>}>
            {!canStock&&<div style={{padding:10,background:T.err+"10",border:"1px solid "+T.err+"30",borderRadius:8,marginBottom:10,fontSize:FS,color:T.err,fontWeight:600}}>{blockMsg}</div>}
            <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{padding:"6px 12px",borderRadius:8,background:T.err+"12",color:T.err,fontWeight:700,fontSize:FS}}>{"كمية القص: "+t.cutQty}</span>
              <span style={{padding:"6px 12px",borderRadius:8,background:T.ok+"12",color:T.ok,fontWeight:700,fontSize:FS}}>{"تم تسليمه: "+stockDel}</span>
              <span style={{padding:"6px 12px",borderRadius:8,background:stockRemain>0?T.warn+"12":T.ok+"12",color:stockRemain>0?T.warn:T.ok,fontWeight:700,fontSize:FS}}>{"المتبقي: "+stockRemain}</span>
            </div>
            <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}><thead><tr>{["#","التاريخ","الكمية","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
            {(order.deliveries||[]).map((d,i)=>{const isEd=editStockIdx===i&&canEdit;
              return<tr key={i} style={{background:isEd?T.warn+"06":"transparent"}}>
              <td style={TD}>{i+1}</td>
              <td style={{...TD,minWidth:130}}>{isEd?<Inp type="date" value={d.date} onChange={v=>updOrder(sel,o=>{o.deliveries[i].date=v})}/>:d.date}</td>
              <td style={{...TD,minWidth:100}}>{isEd?<div id="stock-qty-input-wrap"><Inp type="number" value={d.qty} onChange={v=>updOrder(sel,o=>{const totalRcvd=(o.workshopDeliveries||[]).reduce((s,wd)=>(wd.receives||[]).filter(r=>!r.isSettlement).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);const otherDels=o.deliveries.filter((_,j)=>j!==i).reduce((s,x)=>s+(Number(x.qty)||0),0);const maxQ=Math.min(t.cutQty-otherDels,totalRcvd-otherDels);o.deliveries[i].qty=Math.min(Math.max(0,Number(v)||0),Math.max(0,maxQ));o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)})}/></div>:<span style={{fontWeight:700,color:T.accent}}>{d.qty}</span>}</td>
              <td style={{...TD,minWidth:120}}>{isEd?<Inp value={d.notes} onChange={v=>updOrder(sel,o=>{o.deliveries[i].notes=v})} placeholder="ملاحظات"/>:(d.notes||"-")}</td>
              {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
                {isEd?<><Btn small primary onClick={()=>setEditStockIdx(null)} title="حفظ">💾</Btn><Btn small onClick={()=>{setEditStockIdx(null);printLabel("مخزن جاهز",order,"مخزن جاهز",d.qty,d.date,data.garmentTypes,{type:"deliver",delDate:d.date,delQty:d.qty})}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn><Btn danger small onClick={()=>{updOrder(sel,o=>{o.deliveries.splice(i,1);o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)});setEditStockIdx(null)}}>🗑️</Btn></>
                :<Btn small onClick={()=>setEditStockIdx(i)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>}
              </div></td>}
            </tr>})}
            {(!order.deliveries||order.deliveries.length===0)&&<tr><td colSpan={canEdit?5:4} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد تسليمات</td></tr>}
          </tbody></table></div>
          </Card>})()}
          {/* ── Settlement & Close ── */}
      </div>
      {/* Attachments */}
      {(order.attachments||[]).length>0&&<Card title="ملفات مرفقة" style={{marginBottom:16}}><div style={{display:"flex",flexWrap:"wrap",gap:10}}>{order.attachments.map((a,i)=><a key={i} href={a.data} download={a.name} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:10,background:T.accentBg,border:"1px solid "+T.brd,fontSize:FS,color:T.accent,fontWeight:600,textDecoration:"none"}}>{"📎 "+a.name}</a>)}</div></Card>}
      <Card title="ملخص تكلفة الموديل" accent={"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)"}>
        {(()=>{const pieces=order.orderPieces||[];const linked=new Set();FKEYS.forEach(k=>{if(gf(order,k))(order["fabricPieces"+k]||[]).forEach(p=>linked.add(p))});const missing=pieces.filter(p=>!linked.has(p));
          return missing.length>0&&pieces.length>1?<div style={{padding:"8px 12px",borderRadius:8,background:"#F59E0B10",border:"1px solid #F59E0B30",marginBottom:10,fontSize:FS-1,fontWeight:700,color:"#F59E0B"}}>{"⚠️ تكلفة غير مكتملة — ناقص: "+missing.join("، ")}</div>:null})()}
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS+1}}><thead><tr>{["البند","التكلفة الكلية","تكلفة القطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          <tr><td style={TD}>تكلفة الخامات</td><td style={TDB}>{fmt(r2(t.totalFab))+" ج.م"}</td><td style={TDB}>{t.fabPer+" ج.م"}</td></tr>
          <tr><td style={TD}>تكاليف الاكسسوار</td><td style={TDB}>{fmt(accAll)+" ج.م"}</td><td style={TDB}>{t.accPer+" ج.م"}</td></tr>
          <tr style={{background:T.accentBg}}><td style={{...TD,fontWeight:800,fontSize:FS+4,color:T.accent}}>الاجمالي</td><td style={{...TD,fontWeight:800,fontSize:FS+4,color:T.accent}}>{fmt(Math.ceil(t.costAll))+" ج.م"}</td><td style={{...TD,fontWeight:800,fontSize:FS+6,color:T.accent}}>{Math.ceil(t.costPer)+" ج.م"}</td></tr>
          {order.settlement&&<><tr style={{background:T.err+"08"}}><td style={{...TD,fontWeight:800,color:T.err}}>{"🔴 هالك ("+order.settlement.qty+" قطعة)"}</td><td style={{...TD,fontWeight:800,color:T.err}}>{fmt(r2(order.settlement.cost))+" ج.م"}</td><td style={{...TD,fontWeight:700,color:T.err}}>{order.settlement.reason}</td></tr>
          <tr style={{background:"#1E293B08"}}><td style={{...TD,fontWeight:800,fontSize:FS+2}}>التكلفة الفعلية</td><td style={{...TD,fontWeight:800,fontSize:FS+2,color:T.err}}>{fmt(Math.ceil(t.costAll+order.settlement.cost))+" ج.م"}</td><td style={{...TD,fontWeight:800,fontSize:FS+2,color:T.err}}>{(order.deliveredQty>0?Math.ceil((t.costAll+order.settlement.cost)/order.deliveredQty):0)+" ج.م/قطعة"}</td></tr></>}
        </tbody></table>
      </Card>
          {(()=>{
            const stockDel=(order.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
            const remain=t.cutQty-stockDel;
            const hasSett=!!order.settlement;const isClosed=!!order.closed;
            /* Workshop balances for this order */
            const wsBals=[];(order.workshopDeliveries||[]).forEach((wd,idx)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;if(bal>0)wsBals.push({wsName:wd.wsName,garment:wd.garmentType||"عام",qty:bal,wdIdx:idx,price:Number(wd.price)||0})});
            const wsBalTotal=wsBals.reduce((s,w)=>s+w.qty,0);
            if(isClosed)return<Card style={{marginBottom:16,background:"#64748B08",border:"1px solid #64748B20"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:20}}>🔒</span><span style={{fontSize:FS+2,fontWeight:800,color:"#64748B"}}>أوردر مغلق</span>
              </div>
              {hasSett&&<div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"20",marginBottom:8}}>
                <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:6}}>{"⚖️ تسوية: "+order.settlement.qty+" قطعة"}</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:FS-1}}>
                  <span>{"السبب: "+order.settlement.reason}</span>
                  <span style={{fontWeight:700,color:T.err}}>{"تكلفة الهالك: "+fmt(r2(order.settlement.cost))+" ج.م"}</span>
                  <span style={{color:T.textMut}}>{order.settlement.date}</span>
                </div>
                {order.settlement.notes&&<div style={{fontSize:FS-2,color:T.textSec,marginTop:4}}>{order.settlement.notes}</div>}
                {order.settlement.wsSettled&&<div style={{fontSize:FS-2,color:T.err,marginTop:4}}>{"✓ تم تصفير رصيد "+order.settlement.wsSettled.length+" ورشة"}</div>}
              </div>}
              <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:FS}}>
                <span>{"تسليم مخزن: "+stockDel+" قطعة"}</span>
                <span style={{fontWeight:700,color:T.ok}}>{"تكلفة الانتاج: "+fmt(r2(t.costAll))+" ج.م"}</span>
                {hasSett&&<span style={{fontWeight:700,color:T.err}}>{"+ هالك: "+fmt(r2(order.settlement.cost))+" ج.م"}</span>}
                <span style={{fontWeight:800,color:T.accent}}>{"= الاجمالي: "+fmt(r2(t.costAll+(hasSett?order.settlement.cost:0)))+" ج.م"}</span>
                {stockDel>0&&<span style={{fontWeight:700,color:"#8B5CF6"}}>{"تكلفة القطعة الفعلية: "+r2((t.costAll+(hasSett?order.settlement.cost:0))/stockDel)+" ج.م"}</span>}
              </div>
              {canEdit&&<Btn small onClick={()=>updOrder(sel,o=>{o.closed=false;o.settlement=null;o.status=recomputeStatus(o)})} style={{marginTop:10,background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>↩ اعادة فتح الأوردر</Btn>}
            </Card>;
            if(stockDel===0||isClosed)return null;
            return<Card title="⚖️ تسوية وغلق الأوردر" style={{marginBottom:16}}>
              <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
                <span style={{padding:"6px 12px",borderRadius:8,background:T.accent+"12",color:T.accent,fontWeight:700}}>{"كمية القص: "+t.cutQty}</span>
                <span style={{padding:"6px 12px",borderRadius:8,background:T.ok+"12",color:T.ok,fontWeight:700}}>{"مخزن جاهز: "+stockDel}</span>
                {remain>0&&<span style={{padding:"6px 12px",borderRadius:8,background:T.err+"12",color:T.err,fontWeight:700}}>{"متبقي: "+remain+" قطعة"}</span>}
              </div>
              {remain===0?<div>
                <div style={{padding:12,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"20",marginBottom:10,textAlign:"center"}}>
                  <span style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>✅ تم تسليم كامل الكمية للمخزن</span>
                </div>
                {canEdit&&<Btn primary onClick={()=>updOrder(sel,o=>{o.closed=true;o.status="تم التسليم"})}>🔒 غلق الأوردر</Btn>}
              </div>
              :<div>
                <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12,marginBottom:12}}>
                  <div style={{padding:10,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"20"}}>
                    <div style={{fontSize:FS,fontWeight:700,color:T.warn,marginBottom:4}}>{"⚠️ يوجد "+remain+" قطعة لم تسلّم للمخزن"}</div>
                    {wsBalTotal>0&&<div style={{fontSize:FS-2,color:T.textSec}}>{"منها "+wsBalTotal+" قطعة عند الورش"}</div>}
                  </div>
                  {wsBals.length>0&&<div style={{padding:10,borderRadius:10,background:"#8B5CF606",border:"1px solid #8B5CF615"}}>
                    <div style={{fontSize:FS-2,fontWeight:700,color:"#8B5CF6",marginBottom:4}}>رصيد الورش:</div>
                    {wsBals.map((w,i)=><div key={i} style={{display:"flex",gap:6,fontSize:FS-2,padding:"2px 0"}}>
                      <span style={{fontWeight:700,color:"#8B5CF6",flex:1}}>{w.wsName}</span>
                      <span style={{color:T.textSec}}>{w.garment}</span>
                      <span style={{fontWeight:800,color:T.err}}>{w.qty}</span>
                    </div>)}
                  </div>}
                </div>
                {/* Compact workshop movements */}
                {(()=>{const wdList=(order.workshopDeliveries||[]).filter(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);return(Number(wd.qty)||0)-rcvd!==0||rcvd>0});
                  return wdList.length>0&&<div style={{marginBottom:12,borderRadius:10,border:"1px solid "+T.brd,overflow:"hidden"}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS-2}}>
                      <thead><tr style={{background:T.bg}}><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>الورشة</th><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>القطعة</th><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>تسليم</th><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>استلام</th><th style={{...TH,padding:"4px 8px",fontSize:FS-2}}>الرصيد</th></tr></thead>
                      <tbody>{wdList.map((wd,i)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
                        return<tr key={i} style={{background:bal>0?T.err+"04":"transparent"}}><td style={{...TD,padding:"3px 6px",fontWeight:700}}>{wd.wsName}</td><td style={{...TD,padding:"3px 6px"}}>{wd.garmentType||"عام"}</td><td style={{...TD,padding:"3px 6px",color:T.ok,fontWeight:700}}>{wd.qty}</td><td style={{...TD,padding:"3px 6px",color:T.accent,fontWeight:700}}>{rcvd}</td><td style={{...TD,padding:"3px 6px",fontWeight:800,color:bal>0?T.err:T.ok}}>{bal}</td></tr>})}</tbody>
                    </table>
                  </div>})()}
                {canEdit&&(()=>{
                  const settCost=r2(remain*t.costPer);
                  const REASONS=["عيوب تصنيع","تالف خامة","فاقد ورشة","خطأ قص","أخرى"];
                  return<div style={{padding:14,borderRadius:10,background:T.err+"04",border:"1px solid "+T.err+"15"}}>
                    <div style={{fontSize:FS+1,fontWeight:800,color:T.err,marginBottom:10}}>{"🔴 تكلفة الهالك: "+fmt(settCost)+" ج.م"}</div>
                    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:8,marginBottom:10}}>
                      <div><label style={{fontSize:FS-2,color:T.textSec}}>سبب التسوية</label><Sel value={settReason} onChange={setSettReason}><option value="">-- اختر --</option>{REASONS.map(r=><option key={r} value={r}>{r}</option>)}</Sel></div>
                      <div><label style={{fontSize:FS-2,color:T.textSec}}>ملاحظات</label><Inp value={settNotes} onChange={setSettNotes} placeholder="ملاحظات اضافية..."/></div>
                    </div>
                    {wsBals.length>0&&<div style={{padding:8,borderRadius:8,background:T.warn+"08",border:"1px solid "+T.warn+"15",marginBottom:10,fontSize:FS-2,color:T.warn,fontWeight:600}}>
                      {"⚡ سيتم تصفير رصيد "+wsBals.length+" ورشة وتسجيل استلام تسوية تلقائي"}
                    </div>}
                    <div style={{display:"flex",gap:8}}>
                      <Btn onClick={()=>{if(!settReason){showToast("⚠️ اختر سبب التسوية");return}
                        updOrder(sel,o=>{
                          /* Zero workshop balances */
                          const wsSettled=[];
                          (o.workshopDeliveries||[]).forEach((wd,idx)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
                            if(bal>0){if(!wd.receives)wd.receives=[];wd.receives.push({date:new Date().toISOString().split("T")[0],qty:bal,notes:"⚖️ تسوية — "+settReason,price:Number(wd.price)||0,amount:r2(bal*(Number(wd.price)||0)),quality:"تسوية",createdBy:userName||"",isSettlement:true});
                              wsSettled.push({wsName:wd.wsName,garment:wd.garmentType||"",qty:bal})}});
                          o.settlement={qty:remain,reason:settReason,notes:settNotes,cost:settCost,date:new Date().toISOString().split("T")[0],createdBy:userName||"",wsSettled};
                          o.closed=true;o.status="تم التسليم"});setSettReason("");setSettNotes("")}} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>⚖️ تسوية + غلق</Btn>
                      <Btn onClick={()=>{if(!settReason){showToast("⚠️ اختر سبب التسوية");return}
                        updOrder(sel,o=>{
                          const wsSettled=[];
                          (o.workshopDeliveries||[]).forEach((wd,idx)=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
                            if(bal>0){if(!wd.receives)wd.receives=[];wd.receives.push({date:new Date().toISOString().split("T")[0],qty:bal,notes:"⚖️ تسوية — "+settReason,price:Number(wd.price)||0,amount:r2(bal*(Number(wd.price)||0)),quality:"تسوية",createdBy:userName||"",isSettlement:true});
                              wsSettled.push({wsName:wd.wsName,garment:wd.garmentType||"",qty:bal})}});
                          o.settlement={qty:remain,reason:settReason,notes:settNotes,cost:settCost,date:new Date().toISOString().split("T")[0],createdBy:userName||"",wsSettled};
                          o.status=recomputeStatus(o)});setSettReason("");setSettNotes("")}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>⚖️ تسوية فقط</Btn>
                    </div>
                  </div>})()}
              </div>}
            </Card>
          })()}
      {order.instructions&&<Card title="تعليمات التشغيل" style={{marginTop:16}}><div style={{whiteSpace:"pre-wrap",fontSize:FS+1,lineHeight:2}}>{order.instructions}</div></Card>}
    </div>
    {/* WhatsApp Choice Popup */}
    {waPopup&&(()=>{const wo=waPopup.order;const wt=waPopup.t||calcOrder(wo);const timeline=getOrderTimeline(wo,wt);const hasTimeline=!!timeline;
      const sendWa=async(withTimeline)=>{let text=getOrderDetails(wo,wt);if(withTimeline&&timeline)text+=timeline;
        if(wo.image&&navigator.canShare){try{const res=await fetch(wo.image);const blob=await res.blob();const file=new File([blob],wo.modelNo+".jpg",{type:blob.type||"image/jpeg"});if(navigator.canShare({files:[file]})){await navigator.share({title:"CLARK — "+wo.modelNo,text,files:[file]});setWaSent(p=>({...p,[wo.id]:Date.now()}));setTimeout(()=>setWaSent(p=>{const n={...p};delete n[wo.id];return n}),60000);setWaPopup(null);return}}catch(e){}}
        window.open("https://wa.me/?text="+encodeURIComponent(text),"_blank");setWaSent(p=>({...p,[wo.id]:Date.now()}));setTimeout(()=>setWaSent(p=>{const n={...p};delete n[wo.id];return n}),60000);setWaPopup(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setWaPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:20,marginBottom:4}}>📱</div>
            <div style={{fontSize:FS+1,fontWeight:800,color:"#25D366"}}>ارسال واتساب</div>
            <div style={{fontSize:FS-1,color:T.textSec}}>{wo.modelNo+" — "+wo.modelDesc}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div onClick={()=>sendWa(false)} style={{padding:14,borderRadius:12,border:"1px solid #25D36630",background:"#25D36606",cursor:"pointer",textAlign:"center",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#25D36612"} onMouseLeave={e=>e.currentTarget.style.background="#25D36606"}>
              <div style={{fontSize:FS,fontWeight:700,color:"#25D366"}}>📋 تفاصيل الأوردر فقط</div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>رقم الموديل والوصف والكمية والحالة</div>
            </div>
            {hasTimeline&&<div onClick={()=>sendWa(true)} style={{padding:14,borderRadius:12,border:"1px solid #25D36630",background:"#25D36606",cursor:"pointer",textAlign:"center",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#25D36612"} onMouseLeave={e=>e.currentTarget.style.background="#25D36606"}>
              <div style={{fontSize:FS,fontWeight:700,color:"#25D366"}}>📋 تفاصيل + تايم لاين</div>
              <div style={{fontSize:FS-2,color:T.textMut,marginTop:2}}>كل الحركات من القص للتسليم + رصيد المخزن</div>
            </div>}
          </div>
          <div style={{textAlign:"center",marginTop:12}}><Btn ghost small onClick={()=>setWaPopup(null)}>الغاء</Btn></div>
        </div>
      </div>})()}
    {/* Deliver to Workshop Popup */}
    {showDeliver&&(()=>{
      const pieces=order.orderPieces||[];
      const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(order,k))(order["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
      const hasFabric=FKEYS.some(k=>gf(order,k));
      const isLinked=p=>hasFabric&&(linkedPieces.size===0||linkedPieces.has(p));
      const availPieces=pieces.filter(p=>{if(!isLinked(p))return false;const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return delForP<t.cutQty});
      const totalDelForType=dType?(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===dType).reduce((s,wd)=>s+(Number(wd.qty)||0),0):0;
      const maxQty=dType?Math.max(0,t.cutQty-totalDelForType):t.cutQty;
      const doDeliver=async(print,wa,label)=>{
        if(!dWs||!dType||!dQty)return;
        const wsObj=workshops.find(w=>w.name===dWs);
        const saveQty=Number(dQty);const saveType=dType;const saveDate=dDate||new Date().toISOString().split("T")[0];const savePrice=Number(dPrice)||0;const saveNote=dNote;
        try{
          await updOrder(sel,o=>{
            if(!o.workshopDeliveries)o.workshopDeliveries=[];
            o.workshopDeliveries.push({id:gid(),wsName:dWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",wsOwner:wsObj?wsObj.owner:"",qty:saveQty,garmentType:saveType,price:savePrice,notes:saveNote,date:saveDate,receives:[],createdBy:userName||"",agreedDays:Number(dAgreed)||0});
            o.status=recomputeStatus(o);
          });
          showToast("✓ تم التسليم — "+dWs);setShowDeliver(false);
          if(print){setTimeout(()=>{const pOrd=data.orders.find(o=>o.id===sel)||order;printReceipt(dWs,wsObj?wsObj.owner:"",pOrd,saveType,saveQty,saveDate,maxQty-saveQty,data.garmentTypes)},400)}
          if(label){setTimeout(()=>{const pOrd=data.orders.find(o=>o.id===sel)||order;printLabel(dWs,pOrd,saveType,saveQty,saveDate,data.garmentTypes,{type:"deliver",delDate:saveDate,delQty:saveQty})},400)}
          if(wa){const phone=wsObj?.phone||"";const msg="*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+dWs+"*%0A• رقم الموديل: *"+order.modelNo+"*%0A• الوصف: "+order.modelDesc+"%0A• نوع القطعة: *"+saveType+"*%0A• الكمية المستلمة: *"+saveQty+"* قطعة%0A• السعر: *"+(savePrice||0)+"* ج.م/قطعة%0A• التاريخ: *"+saveDate+"*"+(Number(dAgreed)>0?"%0A• مدة التسليم المتفق عليها: *"+dAgreed+"* يوم%0A• موعد التسليم المتوقع: *"+new Date(new Date(saveDate).getTime()+Number(dAgreed)*86400000).toISOString().split("T")[0]+"*":"")+"%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
        }catch(e){console.error("doDeliver error:",e);showToast("⚠️ خطأ في حفظ التسليم")}
      };
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowDeliver(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{"📤 تسليم "+order.modelNo+" لورشة"}</div>
            <Btn ghost onClick={()=>setShowDeliver(false)} title="إغلاق">✕</Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الورشة *</label><SearchSel value={dWs} onChange={v=>{setDWs(v);setDPrice("")}} options={workshops.map(w=>({value:w.name,label:wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — "+w.name+(w.owner?" - "+w.owner:"")}))} placeholder="ابحث عن ورشة..."/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع القطعة *</label><Sel value={dType} onChange={v=>{setDType(v);const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===v).reduce((s,wd)=>s+(Number(wd.qty)||0),0);setDQty(Math.max(0,t.cutQty-delForP));const gt=(data.garmentTypes||[]).find(g=>g.name===v);if(gt?.defaultPrice&&!dPrice)setDPrice(gt.defaultPrice)}}><option value="">-- اختر --</option>{(availPieces.length>0?availPieces:pieces.length>0?pieces:["عام"]).map(p=><option key={p} value={p}>{(gIcon(p,data.garmentTypes))+" "+p}</option>)}</Sel></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الكمية *</label><Inp type="number" value={dQty} onChange={v=>setDQty(Math.min(Number(v)||0,maxQty))}/></div>
            {dWs&&!isInternal(dWs)&&<div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>سعر القطعة</label><Inp type="number" value={dPrice} onChange={setDPrice}/></div>}
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={dNote} onChange={setDNote}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>مدة التسليم المتفق عليها (أيام)</label><Inp type="number" value={dAgreed} onChange={setDAgreed} placeholder="اختياري"/>{dAgreed&&Number(dAgreed)>0&&<div style={{fontSize:FS-3,color:T.ok,marginTop:2}}>{"📅 موعد التسليم المتوقع: "+new Date(new Date(dDate||Date.now()).getTime()+Number(dAgreed)*86400000).toISOString().split("T")[0]}</div>}</div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>التاريخ</label><Inp type="date" value={dDate} onChange={setDDate}/></div>
          </div>
          {dWs&&dType&&<div style={{padding:10,borderRadius:8,background:T.accentBg,marginBottom:12,fontSize:FS-1,color:T.textSec}}>
            {"كمية القص: "+t.cutQty+" | تم تسليمه: "+totalDelForType+" | متاح: "+maxQty}
          </div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>setShowDeliver(false)}>الغاء</Btn>
            <Btn primary onClick={()=>doDeliver(false)} disabled={!dWs||!dType||!dQty}>تسليم وحفظ</Btn>
            <Btn onClick={()=>doDeliver(true)} disabled={!dWs||!dType||!dQty} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تسليم + طباعة</Btn>
            <Btn onClick={()=>doDeliver(false,false,true)} disabled={!dWs||!dType||!dQty} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️ ليبل</Btn>
            <Btn onClick={()=>doDeliver(false,true)} disabled={!dWs||!dType||!dQty} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn>
          </div>
        </div>
      </div>})()}
  </div>
}

/* ══ EXTERNAL PRODUCTION ══ */
function ExtProdPg({data,updOrder,upConfig,isMob,isTab,canEdit,statusCards,season,user}){
  const userName=user?.displayName||user?.email?.split("@")[0]||"";
  const[mode,setMode]=useState(null);
  const[selWs,setSelWs]=useState("");
  const[selOrder,setSelOrder]=useState("");
  const[ordSearch,setOrdSearch]=useState("");
  const[delQty,setDelQty]=useState(0);
  const[delType,setDelType]=useState("");
  const[delNote,setDelNote]=useState("");const[delAgreed,setDelAgreed]=useState("");
  const[delPrice,setDelPrice]=useState("");
  const[delDate,setDelDate]=useState(new Date().toISOString().split("T")[0]);
  const[rcvInputs,setRcvInputs]=useState({});
  const getRcv=(key)=>rcvInputs[key]||{qty:0,note:"",price:0,quality:"جيد جداً",date:new Date().toISOString().split("T")[0]};
  const setRcv=(key,field,val)=>setRcvInputs(p=>({...p,[key]:{...getRcv(key),[field]:val}}));
  const clearRcv=(key)=>setRcvInputs(p=>{const n={...p};delete n[key];return n});
  /* Payment states */
  const[payWs,setPayWs]=useState("");const[payAmt,setPayAmt]=useState("");const[payNote,setPayNote]=useState("");const[payType,setPayType]=useState("payment");const[payDate,setPayDate]=useState(new Date().toISOString().split("T")[0]);
  const[editPayId,setEditPayId]=useState(null);const[edPayDate,setEdPayDate]=useState("");const[edPayAmt,setEdPayAmt]=useState("");const[edPayNote,setEdPayNote]=useState("");const[edPayType,setEdPayType]=useState("payment");
  const[accWsF,setAccWsF]=useState("الكل");
  const[movQ,setMovQ]=useState("");
  const[selMoves,setSelMoves]=useState(new Set());
  const[movWsF,setMovWsF]=useState("الكل");
  const[movTypeF,setMovTypeF]=useState("الكل");const[lateChecked,setLateChecked]=useState({});const[lateSent,setLateSent]=useState({});
  const[movLimit,setMovLimit]=useState(50);
  const[wsMovLimit,setWsMovLimit]=useState(10);
  const[rcvSearch,setRcvSearch]=useState("");
  const[batchItems,setBatchItems]=useState([]);const[batchDate,setBatchDate]=useState(new Date().toISOString().split("T")[0]);const[batchQ,setBatchQ]=useState("");
  const[editMov,setEditMov]=useState(null);
  const[editQty,setEditQty]=useState(0);
  const[editNote,setEditNote]=useState("");
  const[editPrice,setEditPrice]=useState(0);
  const[editDate,setEditDate]=useState("");
  const[editQuality,setEditQuality]=useState("");
  const workshops=data.workshops||[];
  const isInternal=(name)=>{const w=workshops.find(x=>x.name===name);return w?wsIsInternal(w.type):false};
  const extWorkshops=workshops.filter(w=>!wsIsInternal(w.type));

  /* QR scan receive handler */
  useEffect(()=>{const h=()=>{const qr=window.__qrReceive;if(!qr)return;const ord=data.orders.find(o=>o.id===qr.oid);if(!ord)return;const wd=(ord.workshopDeliveries||[])[qr.wdi];if(!wd)return;setMode("receive");setSelWs(wd.wsName);setRcvSearch(ord.modelNo);delete window.__qrReceive};window.addEventListener("qr-receive",h);return()=>window.removeEventListener("qr-receive",h)},[data.orders]);
  useEffect(()=>{const h=()=>{const qr=window.__qrWsAcc;if(!qr)return;setMode("accounts");setAccWsF(qr.ws);delete window.__qrWsAcc};window.addEventListener("qr-wsacc",h);return()=>window.removeEventListener("qr-wsacc",h)},[]);

  const startEditMov=(m)=>{setEditMov(m);setEditQty(m.qty);setEditNote(m.notes||"");setEditPrice(m.price||0);setEditDate(m.date||"");
    if(m.type==="receive"){const ord=data.orders.find(o=>o.id===m.orderId);const r=ord?.workshopDeliveries?.[m.wdIdx]?.receives?.[m.rIdx];setEditQuality(r?.quality||"جيد جداً")}else{setEditQuality("")}};
  const saveEditMov=()=>{if(!editMov)return;
    if(editMov.type==="deliver"){updOrder(editMov.orderId,o=>{const wd=o.workshopDeliveries[editMov.wdIdx];if(wd){const newPrice=Number(editPrice)||0;const oldPrice=Number(wd.price)||0;
      wd.qty=Number(editQty)||0;wd.notes=editNote;wd.price=newPrice;if(editDate)wd.date=editDate;
      /* Cascade price change to all receives */
      if(newPrice!==oldPrice&&wd.receives){wd.receives.forEach(r=>{r.price=newPrice;r.amount=r2((Number(r.qty)||0)*newPrice)})}};o.status=recomputeStatus(o)})}
    else{updOrder(editMov.orderId,o=>{const wd=o.workshopDeliveries[editMov.wdIdx];const r=wd?.receives?.[editMov.rIdx];if(r){r.qty=Number(editQty)||0;r.notes=editNote;if(editDate)r.date=editDate;if(editQuality)r.quality=editQuality;
      /* Update receive price from delivery price */
      r.price=Number(wd.price)||0;r.amount=r2((Number(r.qty)||0)*r.price)};o.status=recomputeStatus(o)})}
    setEditMov(null);showToast("✓ تم التعديل — الحسابات محدّثة")};
  const printMov=(m)=>{
    const ord=data.orders.find(o=>o.id===m.orderId);
    const ws=(data.workshops||[]).find(w=>w.name===m.wsName);
    if(m.type==="deliver")printReceipt(m.wsName||"",ws?ws.owner:"",ord||{modelNo:m.orderNo||"",modelDesc:m.orderDesc||""},m.garmentType||"",m.qty,m.date,0,data.garmentTypes);
    else printReceiveReceipt(m.wsName||"",ord||{modelNo:m.orderNo||"",modelDesc:m.orderDesc||""},m.garmentType||"",m.qty,m.date,0,data.garmentTypes)
  };

  const wsObj=workshops.find(w=>(w.name||w)===(selWs));
  const prodOrders=useMemo(()=>data.orders.filter(o=>o.status==="تم القص"||o.status==="في التشغيل"),[data.orders]);
  const wsOrders=selWs?data.orders.filter(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===selWs)):[];

  const deliverToWs=(andPrint,andWa,andLabel)=>{
    if(!selWs||!selOrder||!delQty||!delType)return;
    if(!isInternal(selWs)&&!Number(delPrice)){alert("سعر التشغيل مطلوب");return}
    const ord=data.orders.find(o=>o.id===selOrder);if(!ord)return;
    const t=calcOrder(ord);
    const pieces=ord.orderPieces||[];
    let maxAllowed=t.cutQty;
    if(pieces.length>0&&delType){const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===delType).reduce((s,wd)=>s+(Number(wd.qty)||0),0);maxAllowed=t.cutQty-delForP}
    else if(pieces.length===0){const totalDel=(ord.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);maxAllowed=t.cutQty-totalDel}
    const saveQty=Math.min(Number(delQty),maxAllowed);if(saveQty<=0){alert("لا توجد كمية متاحة للتسليم");return}
    const saveType=delType;const saveNote=delNote;const savePrice=Number(delPrice)||0;
    const saveModelNo=ord.modelNo;const saveDate=delDate||new Date().toISOString().split("T")[0];
    const availAfter=maxAllowed-saveQty;
    updOrder(selOrder,o=>{
      if(!o.workshopDeliveries)o.workshopDeliveries=[];
      o.workshopDeliveries.push({id:gid(),wsName:selWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",wsOwner:wsObj?wsObj.owner:"",qty:saveQty,garmentType:saveType,notes:saveNote,price:savePrice,date:saveDate,receives:[],createdBy:userName||"",agreedDays:Number(delAgreed)||0});
      o.status=recomputeStatus(o);
    });
    setSelOrder("");setDelQty(0);setDelType("");setDelNote("");setDelPrice("");setDelDate(new Date().toISOString().split("T")[0]);showToast("✓ تم تسليم "+saveQty+" قطعة لـ "+selWs);
    if(andPrint){const printOrd=JSON.parse(JSON.stringify(ord));const pWs=selWs;const pWsOwner=wsObj?wsObj.owner:"";const pGt=data.garmentTypes;setTimeout(()=>printReceipt(pWs,pWsOwner,printOrd,saveType,saveQty,saveDate,Math.max(0,availAfter),pGt),400)}
    if(andLabel){const printOrd=JSON.parse(JSON.stringify(ord));const pWs=selWs;const pGt=data.garmentTypes;setTimeout(()=>printLabel(pWs,printOrd,saveType,saveQty,saveDate,pGt,{type:"deliver",delDate:saveDate,delQty:saveQty}),400)}
    if(andWa){const phone=wsObj?.phone||"";const msg="*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+selWs+"*%0A• رقم الموديل: *"+ord.modelNo+"*%0A• الوصف: "+ord.modelDesc+"%0A• نوع القطعة: *"+saveType+"*%0A• الكمية: *"+saveQty+"* قطعة%0A• السعر: *"+savePrice+"* ج.م/قطعة%0A• التاريخ: *"+saveDate+"*"+(Number(delAgreed)>0?"%0A• مدة التسليم: *"+delAgreed+"* يوم%0A• موعد التسليم: *"+new Date(new Date(saveDate).getTime()+Number(delAgreed)*86400000).toISOString().split("T")[0]+"*":"")+"%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
  };

  const receiveFromWs=(orderId,wdIdx,andPrint,printData,cardKey,andWa,andLabel)=>{
    const rv=getRcv(cardKey);
    if(!rv.qty)return;
    const ord=data.orders.find(o=>o.id===orderId);if(!ord)return;
    const wd=(ord.workshopDeliveries||[])[wdIdx];if(!wd)return;
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    const maxRcv=(Number(wd.qty)||0)-rcvd;
    if(Number(rv.qty)>maxRcv){showToast("⚠️ الكمية "+rv.qty+" أكبر من المتبقي "+maxRcv+" — الحد الأقصى: ما تم تسليمه للورشة");return}
    const saveQty=Math.min(Number(rv.qty),maxRcv);if(saveQty<=0){showToast("⚠️ لا يوجد رصيد متبقي للاستلام");return}
    const saveNote=rv.note;const wdPrice=Number(wd.price)||0;const saveDate=rv.date||new Date().toISOString().split("T")[0];const saveQuality=rv.quality||"جيد جداً";
    updOrder(orderId,o=>{
      if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];
      o.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty,notes:saveNote,price:wdPrice,amount:r2(saveQty*wdPrice),quality:saveQuality,createdBy:userName||""});
      o.status=recomputeStatus(o)
    });
    clearRcv(cardKey);showToast("✓ تم استلام "+saveQty+" قطعة");
    if(andPrint&&printData){const pOrd=JSON.parse(JSON.stringify(ord));if(pOrd.workshopDeliveries&&pOrd.workshopDeliveries[wdIdx]){if(!pOrd.workshopDeliveries[wdIdx].receives)pOrd.workshopDeliveries[wdIdx].receives=[];pOrd.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty})}const pWs=selWs;const pType=wd.garmentType||"";const pGt=data.garmentTypes;setTimeout(()=>printReceiveReceipt(pWs,pOrd,pType,saveQty,saveDate,0,pGt),400)}
    if(andLabel){const pOrd=JSON.parse(JSON.stringify(ord));const pGt=data.garmentTypes;setTimeout(()=>printLabel(wd.wsName,pOrd,wd.garmentType||"عام",saveQty,saveDate,pGt,{type:"receive",delDate:wd.date,delQty:wd.qty,rcvDate:saveDate,rcvQty:saveQty}),400)}
    if(andWa){const wsObj=workshops.find(w=>w.name===wd.wsName);const phone=wsObj?.phone||"";const totalDelivered=Number(wd.qty)||0;const allRcvs=(wd.receives||[]);const totalRcvBefore=allRcvs.reduce((s,r)=>s+(Number(r.qty)||0),0);const remaining=totalDelivered-(totalRcvBefore+saveQty);const rcvHistory=allRcvs.length>0?allRcvs.map(r=>"  ↩ "+r.date+": *"+r.qty+"* قطعة").join("%0A")+"%0A":"";const msg="*CLARK — اذن استلام من ورشة*%0A%0A• الورشة: *"+wd.wsName+"*%0A• رقم الموديل: *"+ord.modelNo+"*%0A• الوصف: "+ord.modelDesc+"%0A• نوع القطعة: *"+(wd.garmentType||"عام")+"*%0A%0A━━━━━━━━━━━━━━%0A📤 مسلّم للورشة: *"+totalDelivered+"* قطعة%0A"+(rcvHistory?"📥 سجل الاستلام:%0A"+rcvHistory:"")+"📥 استلام اليوم: *"+saveQty+"* قطعة%0A📊 الرصيد عند الورشة: *"+Math.max(0,remaining)+"* قطعة%0A━━━━━━━━━━━━━━%0A%0A• التاريخ: *"+saveDate+"*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
  };

  /* Collect all movements for the log — memoized */
  const movements=useMemo(()=>{const mvs=[];let _mi=0;
  data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{
    mvs.push({type:"deliver",date:wd.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx,_i:_mi++,createdBy:wd.createdBy||""});
    (wd.receives||[]).forEach((r,rIdx)=>{mvs.push({type:r.isSettlement?"settlement":"receive",date:r.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",notes:r.notes||"",orderId:ord.id,wdIdx,rIdx,_i:_mi++,createdBy:r.createdBy||"",isSettlement:!!r.isSettlement})})
  })});
  mvs.sort((a,b)=>(b.date||"").localeCompare(a.date||"")||b._i-a._i);return mvs},[data.orders]);

  const getMovBlock=(m)=>{
    const ord=data.orders.find(o=>o.id===m.orderId);if(!ord)return null;
    if(m.type==="deliver"){
      const wd=(ord.workshopDeliveries||[])[m.wdIdx];
      if(wd&&(wd.receives||[]).length>0)return"يوجد استلامات مرتبطة بهذا التسليم";
      if((ord.deliveries||[]).length>0)return"يوجد تسليمات مخزن مرتبطة بالأوردر";
      return null
    } else {
      if((ord.deliveries||[]).length>0)return"يوجد تسليمات مخزن - لا يمكن حذف الاستلام";
      return null
    }
  };
  const delMovement=(m)=>{
    if(m.type==="deliver"){updOrder(m.orderId,o=>{o.workshopDeliveries.splice(m.wdIdx,1);o.status=recomputeStatus(o)})}
    else{updOrder(m.orderId,o=>{o.workshopDeliveries[m.wdIdx].receives.splice(m.rIdx,1);o.status=recomputeStatus(o)})}
  };

  /* Workshop accounts calculation */
  const wsAccounts=(wsName)=>{if(isInternal(wsName))return{due:0,totalPaid:0,totalPurchase:0,balance:0};let due=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===wsName).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
    const payments=(data.wsPayments||[]).filter(p=>p.wsName===wsName);
    const totalPaid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
    const totalPurchase=payments.filter(p=>p.type==="purchase").reduce((s,p)=>s+(Number(p.amount)||0),0);
    return{due,totalPaid,totalPurchase,balance:due+totalPurchase-totalPaid}
  };
  const addPayment=(wa)=>{if(!payWs||!payAmt)return;const wsObj=workshops.find(w=>w.name===payWs);upConfig(d=>{if(!d.wsPayments)d.wsPayments=[];d.wsPayments.push({id:gid(),wsName:payWs,wsId:wsObj?wsObj.id:null,amount:Number(payAmt),type:payType,notes:payNote,date:payDate,createdBy:userName||""})});
    if(wa){const acc=wsAccounts(payWs);let del=0,rcv=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===payWs).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});
      const allPay=(data.wsPayments||[]).filter(p=>p.wsName===payWs&&p.type==="payment");const totalPaid=allPay.reduce((s,p)=>s+(Number(p.amount)||0),0)+Number(payAmt);
      const phone=wsObj?.phone||"";
      const msg="*CLARK — اشعار دفعة*%0A%0A• الورشة: *"+payWs+"*%0A• نوع العملية: *"+(payType==="payment"?"دفعة":"مشتريات")+"*%0A• المبلغ: *"+fmt(Number(payAmt))+"* ج.م%0A• التاريخ: *"+payDate+"*%0A"+(payNote?"• ملاحظات: "+payNote+"%0A":"")+"%0A─────────────────%0A*ملخص الحساب*%0A• تم تسليمه للورشة: "+fmt(del)+" قطعة%0A• تم استلامه للمصنع: "+fmt(rcv)+" قطعة%0A• اجمالي المستحق: "+fmt(r2(acc.due))+" ج.م%0A• اجمالي المشتريات: "+fmt(r2(acc.totalPurchase))+" ج.م%0A• اجمالي المدفوع: "+fmt(r2(totalPaid))+" ج.م%0A• الرصيد المتبقي: *"+fmt(r2(acc.due+acc.totalPurchase-totalPaid))+"* ج.م";
      window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
    setPayAmt("");setPayNote("");setPayDate(new Date().toISOString().split("T")[0])};

  if(!mode)return<div>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":isTab?"repeat(3,1fr)":"repeat(6,1fr)",gap:12,marginBottom:20}}>
      <div onClick={()=>setMode("deliver")} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📤</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.accent}}>تسليم ورشة</div>
      </div>
      <div onClick={()=>setMode("receive")} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📥</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>استلام من ورشة</div>
      </div>
      <div onClick={()=>setMode("payment")} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>💳</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.purple}}>اضافة دفعة</div>
      </div>
      <div onClick={()=>setMode("accounts")} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📊</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.warn}}>حسابات الورش</div>
      </div>
      <div onClick={()=>{setMode("batch");setSelWs("");setBatchItems([]);setBatchDate(new Date().toISOString().split("T")[0])}} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📦</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>تسليم مُجمع</div>
      </div>
      <div onClick={()=>{setMode("batchRcv");setSelWs("");setBatchItems([]);setBatchDate(new Date().toISOString().split("T")[0])}} style={{background:T.card,borderRadius:14,padding:isMob?16:24,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:8}}>📥</div>
        <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>استلام مُجمع</div>
      </div>
    </div>
    {/* Movement Log with search/filter */}
    <Card title={"سجل الحركات ("+movements.length+")"}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":isTab?"1fr 1fr":"2fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <Inp value={movQ} onChange={setMovQ} placeholder="بحث بالموديل أو الورشة..."/>
        <Sel value={movWsF} onChange={setMovWsF}><option value="الكل">كل الورش</option>{workshops.map(w=><option key={w.id||w} value={w.name||w}>{(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)}</option>)}</Sel>
        <Sel value={movTypeF} onChange={v=>{setMovTypeF(v);setLateChecked({})}}><option value="الكل">كل الحركات</option><option value="deliver">تسليم ورشة</option><option value="receive">استلام مصنع</option><option value="late">⏰ متأخرات</option></Sel>
        <div style={{display:"flex",gap:4}}>
          <Btn onClick={()=>{const el=document.getElementById("mov-log");if(!el)return;printPage("سجل حركات التشغيل الخارجي",el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd,flex:1}} title="طباعة الحركات المعروضة">🖨 المعروض</Btn>
          <Btn onClick={()=>{const allH="<table><thead><tr>"+["نوع","التاريخ","الورشة","موديل","الوصف","القطعة","الكمية","السعر","ملاحظات"].map(h=>"<th>"+h+"</th>").join("")+"</tr></thead><tbody>"+movements.map(m=>"<tr style='background:"+(m.type==="deliver"?"#F0FDF4":m.type==="settlement"?"#FEF2F2":"#EFF6FF")+"'><td style='color:"+(m.type==="deliver"?"#10B981":m.type==="settlement"?"#EF4444":"#0EA5E9")+";font-weight:700'>"+(m.type==="deliver"?"تسليم ورشة":m.type==="settlement"?"⚖️ تسوية":"استلام مصنع")+"</td><td>"+m.date+"</td><td>"+m.wsName+"</td><td><b>"+m.orderNo+"</b></td><td>"+(m.orderDesc||"")+"</td><td>"+(m.garmentType||"-")+"</td><td><b>"+m.qty+"</b></td><td>"+(m.price?m.price+" ج.م":"-")+"</td><td>"+(m.notes||"-")+"</td></tr>").join("")+"</tbody></table>";printPage("سجل حركات التشغيل الخارجي (كامل - "+movements.length+" حركة)",allH)}} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",flex:1}} title="طباعة كل الحركات">🖨 الكل</Btn>
        </div>
      </div>
      {(()=>{
      /* Compute late deliveries */
      const _now=new Date();const lateItems=[];
      if(movTypeF==="late"){data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{const rcvd=(wd.receives||[]).filter(r=>!r.isSettlement).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;if(bal<=0)return;const days=Math.floor((_now-new Date(wd.date))/(86400000));const agreed=Number(wd.agreedDays)||0;const isLate=agreed>0?days>agreed:days>14;if(isLate)lateItems.push({wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,garment:wd.garmentType||"عام",qty:bal,days,agreed,orderId:ord.id,wdIdx,delDate:wd.date,key:ord.id+"_"+wdIdx})})})}
      const fMov=movTypeF==="late"?[]:movements.filter(m=>{if(movWsF!=="الكل"&&m.wsName!==movWsF)return false;if(movTypeF!=="الكل"&&m.type!==movTypeF)return false;if(movQ.trim()){const s=movQ.trim().toLowerCase();if(!((m.orderNo||"").toLowerCase().includes(s)||(m.wsName||"").toLowerCase().includes(s)||(m.orderDesc||"").toLowerCase().includes(s)))return false}return true});const shown=movTypeF==="late"?[]:fMov.slice(0,movLimit);
      const toggleSel=(idx)=>setSelMoves(p=>{const n=new Set(p);n.has(idx)?n.delete(idx):n.add(idx);return n});
      const selArr=[...selMoves].map(i=>shown[i]).filter(Boolean);
      const printBatch=()=>{if(selArr.length===0)return;selArr.forEach((m,i)=>{setTimeout(()=>printMov(m),i*500)})};
      const printBatchCombined=async()=>{if(selArr.length===0)return;let pages=[];
        for(const m of selArr){const ord=data.orders.find(o=>o.id===m.orderId);const ws=(data.workshops||[]).find(w=>w.name===m.wsName);
          let html="";if(m.type==="deliver")html=await printReceipt(m.wsName,ws?.owner||"",ord||{modelNo:m.orderNo,modelDesc:m.orderDesc},m.garmentType||"",m.qty,m.date,0,data.garmentTypes,true);
          else html=await printReceiveReceipt(m.wsName,ord||{modelNo:m.orderNo,modelDesc:m.orderDesc},m.garmentType||"",m.qty,m.date,0,data.garmentTypes,true);
          if(html)pages.push(html)}
        if(pages.length===0)return;
        const combined=pages.map((p,i)=>"<div"+(i>0?" style='page-break-before:always'":"")+">"+p+"</div>").join("");
        printPage("اذونات مجمعة ("+pages.length+")",combined)};
      const waBatch=()=>{if(selArr.length===0)return;const byWs={};selArr.forEach(m=>{if(!byWs[m.wsName])byWs[m.wsName]=[];byWs[m.wsName].push(m)});Object.entries(byWs).forEach(([ws,items])=>{const wsObj=workshops.find(w=>w.name===ws);const phone=wsObj?.phone||"";const lines=items.map(m=>{const _o=data.orders.find(o=>o.id===m.orderId);const _w=_o?((_o.workshopDeliveries||[])[m.wdIdx]):null;const _dq=_w?Number(_w.qty)||0:0;const _tr=_w?(_w.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0):0;const _bal=_dq-_tr;return m.type==="deliver"?"📤 تسليم — موديل *"+m.orderNo+"*%0A  "+(m.orderDesc||"-")+" — "+(m.garmentType||"عام")+" — *"+m.qty+"* قطعة":"📥 استلام — موديل *"+m.orderNo+"*%0A  "+(m.orderDesc||"-")+" — "+(m.garmentType||"عام")+"%0A  مسلّم للورشة: *"+_dq+"* | مستلم: *"+_tr+"* | رصيد: *"+Math.max(0,_bal)+"*"}).join("%0A%0A───────────%0A");const tQty=items.reduce((s,m)=>s+(Number(m.qty)||0),0);const msg="*CLARK — ملخص حركات*%0A%0A• الورشة: *"+ws+"*%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+tQty+"* قطعة%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")})};
      return<div id="mov-log">
      {/* Late deliveries view */}
      {movTypeF==="late"&&<div>
        {lateItems.length>0?<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <span style={{fontWeight:700,color:T.err,fontSize:FS}}>{"⏰ "+lateItems.length+" تسليم متأخر"}</span>
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={()=>{const all={};lateItems.forEach(l=>{all[l.key]=!Object.keys(lateChecked).length||!lateChecked[l.key]});setLateChecked(all)}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>{Object.values(lateChecked).filter(Boolean).length===lateItems.length?"☑ الغاء الكل":"☐ اختار الكل"}</Btn>
              {Object.values(lateChecked).filter(Boolean).length>0&&<Btn small onClick={()=>{const byWs={};lateItems.filter(l=>lateChecked[l.key]).forEach(l=>{if(!byWs[l.wsName])byWs[l.wsName]=[];byWs[l.wsName].push(l)});Object.entries(byWs).forEach(([ws,items])=>{const wsObj=workshops.find(w=>w.name===ws);const phone=wsObj?.phone||"";const lines=items.map(l=>"• موديل *"+l.orderNo+"* "+l.garment+" — *"+l.qty+"* قطعة — متأخر *"+l.days+"* يوم"+(l.agreed?" (متفق "+l.agreed+" يوم)":"")).join("%0A");const msg="*CLARK — تنبيه تأخير*%0A%0A• الورشة: *"+ws+"*%0A%0A"+lines+"%0A%0A⚠️ *برجاء الاهتمام بالتسليم في أقرب وقت*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")});const sent={};lateItems.filter(l=>lateChecked[l.key]).forEach(l=>{sent[l.key]=Date.now()});setLateSent(p=>({...p,...sent}));setLateChecked({})}} style={{background:"#25D366",color:"#fff",border:"none",fontWeight:700}}>{"📱 ارسال تحذير ("+Object.values(lateChecked).filter(Boolean).length+")"}</Btn>}
            </div>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["☐","الورشة","موديل","القطعة","الرصيد","الأيام","المتفق",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
            <tbody>{lateItems.map((l,i)=>{const isSent=lateSent[l.key]&&(Date.now()-lateSent[l.key]<60000);return<tr key={l.key} style={{background:isSent?T.ok+"12":i%2===0?"transparent":T.bg+"80"}}>
              <td style={{...TD,textAlign:"center"}}><span onClick={()=>setLateChecked(p=>({...p,[l.key]:!p[l.key]}))} style={{cursor:"pointer",fontSize:16}}>{lateChecked[l.key]?"☑":"☐"}</span></td>
              <td style={{...TD,fontWeight:700}}>{l.wsName}</td><td style={TDB}>{l.orderNo}</td><td style={TD}>{l.garment}</td>
              <td style={{...TDB,color:T.err}}>{l.qty}</td><td style={{...TD,fontWeight:700,color:T.err}}>{l.days+" يوم"}</td>
              <td style={TD}>{l.agreed?l.agreed+" يوم":"—"}</td>
              <td style={TD}>{isSent?<span style={{color:T.ok,fontWeight:700}}>{"✅ تم"}</span>:""}</td>
            </tr>})}</tbody>
          </table></div>
        </div>:<div style={{textAlign:"center",padding:30,color:T.ok,fontWeight:700}}>✅ لا توجد تسليمات متأخرة</div>}
      </div>}
      {selArr.length>0&&<div style={{padding:"10px 14px",borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF625",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <span style={{fontWeight:700,color:"#8B5CF6",fontSize:FS}}>{"☑ "+selArr.length+" حركة محددة ("+selArr.reduce((s,m)=>s+(Number(m.qty)||0),0)+" قطعة)"}</span>
        <div style={{display:"flex",gap:6}}><Btn small onClick={printBatchCombined} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة كل الحركات المحددة">🖨 طباعة مجمعة</Btn><Btn small onClick={waBatch} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب للحركات المحددة">📱 واتساب مجمع</Btn><Btn ghost small onClick={()=>setSelMoves(new Set())} title="إلغاء التحديد">✕ الغاء</Btn></div>
      </div>}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
        <thead><tr>{["☐","نوع الحركة","التاريخ","الورشة","موديل","الوصف","نوع القطعة","الكمية","سعر التشغيل","ملاحظات",""].map(h=><th key={h} style={{...TH,width:h==="☐"?30:"auto"}}>{h==="☐"?<span onClick={()=>{if(selMoves.size===shown.length)setSelMoves(new Set());else setSelMoves(new Set(shown.map((_,i)=>i)))}} style={{cursor:"pointer",fontSize:16}}>{selMoves.size===shown.length&&shown.length>0?"☑":"☐"}</span>:h}</th>)}</tr></thead>
        <tbody>{shown.length>0?shown.map((m,i)=>{
          const isEditing=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          const isSel=selMoves.has(i);
          return<tr key={i} style={{background:isSel?"#8B5CF610":m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,textAlign:"center"}}><span onClick={()=>toggleSel(i)} style={{cursor:"pointer",fontSize:16}}>{isSel?"☑":"☐"}</span></td>
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":m.type==="settlement"?"⚖️ تسوية":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEditing?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:130}}/>:m.date}</td><td style={{...TD,fontWeight:600}}>{m.wsName}</td><td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td>
          <td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{isEditing?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:70}}/>:m.qty}</td>
          <td style={TD}>{isEditing&&m.type==="deliver"?<Inp type="number" value={editPrice} onChange={v=>setEditPrice(Number(v)||0)} style={{width:70}}/>:(m.price?m.price+" ج.م":"-")}</td>
          <td style={TD}>{isEditing?<div style={{display:"flex",flexDirection:"column",gap:4}}>{m.type==="receive"&&<Sel value={editQuality} onChange={setEditQuality}>{["ممتاز","جيد جداً","جيد","مقبول","سئ"].map(q=><option key={q} value={q}>{q}</option>)}</Sel>}<Inp value={editNote} onChange={setEditNote} placeholder="ملاحظات" style={{width:100}}/></div>:<>{m.notes||"-"}{m.createdBy&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{"👤 "+m.createdBy}</div>}</>}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {isEditing?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)}>الغاء</Btn></>:<>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
            <Btn small onClick={()=>{const ord=data.orders.find(o=>o.id===m.orderId);if(!ord)return;const wd=(ord.workshopDeliveries||[])[m.wdIdx];if(!wd)return;if(m.type==="deliver")printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"deliver",delDate:m.date,delQty:m.qty});else{printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"receive",delDate:wd.date,delQty:wd.qty,rcvDate:m.date,rcvQty:m.qty})}}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn>
            <Btn small onClick={()=>{const wsObj=workshops.find(w=>w.name===m.wsName);const phone=wsObj?.phone||"";const _ord=data.orders.find(o=>o.id===m.orderId);const _wd=_ord?((_ord.workshopDeliveries||[])[m.wdIdx]):null;const _delQty=_wd?Number(_wd.qty)||0:0;const _allRcv=_wd?(_wd.receives||[]):[];const _totalRcv=_allRcv.reduce((s,r)=>s+(Number(r.qty)||0),0);const _wsBal=_delQty-_totalRcv;const msg=m.type==="deliver"?"*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+m.wsName+"*%0A• رقم الموديل: *"+m.orderNo+"*%0A• الوصف: "+m.orderDesc+"%0A• نوع القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"* قطعة%0A• السعر: *"+(m.price||0)+"* ج.م/قطعة%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — اذن استلام من ورشة*%0A%0A• الورشة: *"+m.wsName+"*%0A• رقم الموديل: *"+m.orderNo+"*%0A• الوصف: "+m.orderDesc+"%0A• نوع القطعة: *"+(m.garmentType||"عام")+"*%0A%0A━━━━━━━━━━━━━━%0A📤 مسلّم للورشة: *"+_delQty+"* قطعة%0A📥 مستلم: *"+_totalRcv+"* قطعة%0A📥 استلام اليوم: *"+m.qty+"* قطعة%0A📊 الرصيد عند الورشة: *"+Math.max(0,_wsBal)+"* قطعة%0A━━━━━━━━━━━━━━%0A%0A• التاريخ: *"+m.date+"*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/></>}
          </div>}</td>
        </tr>}):<tr><td colSpan={10} style={{...TD,textAlign:"center",color:T.textSec,padding:30}}>لا توجد حركات</td></tr>}</tbody>
      </table></div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
        <span style={{fontSize:FS-2,color:T.textMut}}>{"عرض "+Math.min(movLimit,fMov.length)+" من "+fMov.length+" حركة"}</span>
        {fMov.length>movLimit&&<Btn small onClick={()=>setMovLimit(p=>p+25)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>{"عرض المزيد (+25)"}</Btn>}
      </div></div>})()}
    </Card>
  </div>;

  /* ── DELIVER MODE ── */
  const getAvailQty=(ord)=>{
    const t=calcOrder(ord);
    const pieces=ord.orderPieces||[];
    if(pieces.length>0){
      /* At least one piece must have available qty */
      let anyAvail=false;
      pieces.forEach(p=>{const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);if(delForP<t.cutQty)anyAvail=true});
      return anyAvail?t.cutQty:0
    }
    const delivered=(ord.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
    return Math.max(0,t.cutQty-delivered)
  };
  const availOrders=prodOrders.filter(o=>getAvailQty(o)>0&&FKEYS.some(k=>gf(o,k)));
  /* Workshop-specific movements */
  const wsMoves=[];
  if(selWs)data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName===selWs){wsMoves.push({type:"deliver",date:wd.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx,_ts:new Date(wd.date).getTime()+wdIdx,createdBy:wd.createdBy||""});(wd.receives||[]).forEach((r,rIdx)=>{wsMoves.push({type:r.isSettlement?"settlement":"receive",date:r.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",price:r.price||0,notes:r.notes||"",orderId:ord.id,wdIdx,rIdx,_ts:new Date(r.date).getTime()+wdIdx*100+rIdx,createdBy:r.createdBy||"",isSettlement:!!r.isSettlement})})}})});
  wsMoves.sort((a,b)=>(b.date||"").localeCompare(a.date||"")||b._ts-a._ts);

  if(mode==="deliver")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0}}>{"📤 تسليم ورشة"}</h1>
      <Btn ghost onClick={()=>{setMode(null);setSelWs("");setSelOrder("")}}>↩</Btn>
    </div>
    <Card title="اختر الورشة" style={{marginBottom:16,position:"relative",zIndex:100}}>
      <SearchSel value={selWs} onChange={v=>{setSelWs(v);setSelOrder("")}} options={workshops.map(w=>({value:w.name||w,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)+(w.owner?" - "+w.owner:"")}))} placeholder="ابحث عن ورشة..."/>
      {wsObj&&(()=>{let wsTotalDel=0,wsTotalRcv=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===selWs).forEach(wd=>{wsTotalDel+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{wsTotalRcv+=Number(r.qty)||0})})});const wsBal=wsTotalDel-wsTotalRcv;
        return<div style={{marginTop:12,padding:12,background:T.accentBg,borderRadius:10}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            {wsObj.ownerPhoto&&<img src={wsObj.ownerPhoto} alt="" style={{width:40,height:53,borderRadius:8,objectFit:"cover"}}/>}
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:FS}}>{wsObj.name}</div>{wsObj.phone&&<div style={{fontSize:FS-2,color:T.textSec}}>{"📱 "+wsObj.phone}</div>}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            <div style={{padding:"6px 8px",borderRadius:8,background:T.purple+"10",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>تسليم ورشة</div><div style={{fontWeight:800,color:T.purple}}>{wsTotalDel}</div></div>
            <div style={{padding:"6px 8px",borderRadius:8,background:T.ok+"10",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>استلام مصنع</div><div style={{fontWeight:800,color:T.ok}}>{wsTotalRcv}</div></div>
            <div style={{padding:"6px 8px",borderRadius:8,background:(wsBal>0?T.err:T.ok)+"10",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>رصيد حالي</div><div style={{fontWeight:800,color:wsBal>0?T.err:T.ok}}>{wsBal}</div></div>
          </div>
        </div>})()}
    </Card>
    {selWs&&<Card title={"أوردرات متاحة للتسليم ("+availOrders.length+")"} style={{marginBottom:16}}>
      {availOrders.length>0?<div>
        {(()=>{const fOrds=availOrders;return<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{"اختر الأوردر ("+fOrds.length+")"}</label>
            <SearchSel value={selOrder} onChange={v=>{setSelOrder(v);setDelType("");const o=data.orders.find(x=>x.id===v);if(o){const pieces=o.orderPieces||[];if(pieces.length===0)setDelQty(getAvailQty(o))}}} options={fOrds.map(o=>{const t=calcOrder(o);const pieces=o.orderPieces||[];const pInfo=pieces.length>0?pieces.map(p=>{const d=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const a=t.cutQty-d;return a>0?p+":"+a:null}).filter(Boolean).join(" | "):"متاح: "+getAvailQty(o);return{value:o.id,label:o.modelNo+" - "+o.modelDesc+" ["+pInfo+"]"}})} placeholder="ابحث بالموديل..."/>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الكمية</label><Inp type="number" value={delQty} onChange={v=>{const ord=data.orders.find(x=>x.id===selOrder);const max=ord?getAvailQty(ord):99999;setDelQty(Math.min(Number(v)||0,max))}}/></div>
        </div>})()}
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>نوع القطعة</label>{(()=>{
            const ord=data.orders.find(x=>x.id===selOrder);
            const pieces=ord?(ord.orderPieces||[]):[];
            const t=ord?calcOrder(ord):{cutQty:0};
            /* Check which pieces are linked to fabrics */
            const linkedPieces=new Set();if(ord)FKEYS.forEach(k=>{if(gf(ord,k))(ord["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
            const hasFabric=ord?FKEYS.some(k=>gf(ord,k)):false;
            const isLinked=p=>hasFabric&&(linkedPieces.size===0||linkedPieces.has(p));
            /* Compute available pieces */
            const availPieces=pieces.filter(p=>{if(!isLinked(p))return false;const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return delForP<t.cutQty});
            const unlinkedPieces=pieces.filter(p=>!isLinked(p));
            return pieces.length>0?<><Sel value={delType} onChange={v=>{setDelType(v);if(v&&ord){const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===v).reduce((s,wd)=>s+(Number(wd.qty)||0),0);setDelQty(t.cutQty-delForP);const gt=(data.garmentTypes||[]).find(g=>g.name===v);if(gt?.defaultPrice&&!delPrice)setDelPrice(gt.defaultPrice)}}}>
              <option value="">-- اختر القطعة --</option>
              {availPieces.map(p=>{const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return<option key={p} value={p}>{gIcon(p,data.garmentTypes)+" "+p+" (متاح: "+(t.cutQty-delForP)+")"}</option>})}
            </Sel>{unlinkedPieces.length>0&&<div style={{marginTop:4}}>{unlinkedPieces.map(p=><span key={p} style={{display:"inline-block",padding:"3px 10px",borderRadius:6,fontSize:FS-2,fontWeight:600,color:T.err,background:T.err+"10",border:"1px solid "+T.err+"20",marginLeft:4}}>{gIcon(p,data.garmentTypes)+" "+p+" — لم يتم القص"}</span>)}</div>}</>:<Inp value={delType} onChange={setDelType} placeholder="نوع القطعة..."/>
          })()}</div>
          {!isInternal(selWs)&&<div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>سعر التشغيل</label><Inp type="number" step="0.01" value={delPrice} onChange={v=>setDelPrice(v)} placeholder="سعر القطعة"/></div>}
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>ملاحظات</label><Inp value={delNote} onChange={setDelNote} placeholder="ملاحظات..."/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>مدة التسليم (أيام)</label><Inp type="number" value={delAgreed} onChange={setDelAgreed} placeholder="اختياري"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>التاريخ</label><Inp type="date" value={delDate} onChange={setDelDate}/></div>
        </div>
        <div style={{display:"flex",gap:8}}><Btn primary onClick={()=>deliverToWs(false)} disabled={!selOrder||!delQty||!delType}>تسليم وحفظ</Btn><Btn onClick={()=>deliverToWs(true)} disabled={!selOrder||!delQty||!delType} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تسليم + طباعة</Btn><Btn onClick={()=>deliverToWs(false,false,true)} disabled={!selOrder||!delQty||!delType} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️ ليبل</Btn><Btn onClick={()=>deliverToWs(false,true)} disabled={!selOrder||!delQty||!delType} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn><Btn ghost onClick={()=>{setSelOrder("");setDelQty(0);setDelType("");setDelNote("");setDelPrice("")}}>الغاء</Btn></div>
        {selOrder&&(()=>{const ord=data.orders.find(o=>o.id===selOrder);if(!ord)return null;const t=calcOrder(ord);const avail=getAvailQty(ord);const totalDel=(ord.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return<div style={{padding:14,background:T.inputBg||T.cardSolid,borderRadius:10,border:"1px solid "+T.brd,marginTop:12}}>
          <div style={{fontSize:FS,fontWeight:700,marginBottom:6}}>{"تفاصيل الأوردر: "+ord.modelNo}</div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",fontSize:FS-1}}>
            <span>{"الوصف: "+ord.modelDesc}</span><span>{"المقاسات: "+ord.sizeLabel}</span>
            <span style={{fontWeight:700,color:T.accent}}>{"كمية القص: "+t.cutQty}</span>
            <span style={{fontWeight:700,color:T.warn}}>{"تم تسليمه: "+totalDel}</span>
            <span style={{fontWeight:700,color:T.ok}}>{"متاح: "+avail}</span>
          </div>
          {(ord.workshopDeliveries||[]).length>0&&<div style={{marginTop:10}}><div style={{fontSize:FS-2,color:T.textSec,marginBottom:4}}>تم تسليمه سابقاً:</div>{(ord.workshopDeliveries||[]).map((wd,i)=><div key={i} style={{fontSize:FS-2,color:T.purple,padding:"2px 0"}}>{"• "+wd.wsName+" - "+wd.qty+" قطعة"+(wd.garmentType?" ("+wd.garmentType+")":"")+" - "+wd.date}</div>)}</div>}
        </div>})()}
      </div>:<p style={{color:T.textSec,textAlign:"center",padding:30}}>لا توجد أوردرات متاحة للتسليم</p>}
    </Card>}
    {/* Workshop-specific movements */}
    {selWs&&wsMoves.length>0&&<Card title={"حركات ورشة "+selWs+" (آخر "+Math.min(10,wsMoves.length)+" من "+wsMoves.length+")"}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
        <thead><tr>{["نوع الحركة","التاريخ","موديل","الوصف","نوع القطعة","الكمية",...(isInternal(selWs)?[]:["سعر"]),"ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsMoves.slice(0,10).map((m,i)=>{const isEd=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          return<tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":m.type==="settlement"?"⚖️ تسوية":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEd?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:120}}/>:m.date}</td>
          <td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td><td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{isEd?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:60}}/>:m.qty}</td>
          {!isInternal(selWs)&&<td style={TD}>{isEd&&m.type==="deliver"?<Inp type="number" step="0.01" value={editPrice} onChange={v=>setEditPrice(v)} style={{width:60}}/>:(m.price?m.price+" ج.م":"-")}</td>}
          <td style={TD}>{isEd?<Inp value={editNote} onChange={setEditNote} style={{width:80}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)} title="إغلاق">✕</Btn></>:<>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
            <Btn small onClick={()=>{const ord=data.orders.find(o=>o.id===m.orderId);if(!ord)return;const wd=(ord.workshopDeliveries||[])[m.wdIdx];if(!wd)return;if(m.type==="deliver")printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"deliver",delDate:m.date,delQty:m.qty});else{printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"receive",delDate:wd.date,delQty:wd.qty,rcvDate:m.date,rcvQty:m.qty})}}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn>
            <Btn small onClick={()=>{const phone=wsObj?.phone||"";const msg=m.type==="deliver"?"*CLARK — تسليم*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — استلام*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn></>}
          </div>}</td></tr>})}</tbody>
      </table></div>
    </Card>}
  </div>;

  /* ── BATCH DELIVER MODE ── */
  if(mode==="batch"){
    /* Build available items when workshop selected */
    const buildBatchItems=()=>{if(!selWs)return[];const items=[];
      data.orders.forEach(o=>{const t=calcOrder(o);if(!FKEYS.some(k=>gf(o,k)))return;const pieces=o.orderPieces||[];const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
        if(pieces.length>0){pieces.forEach(p=>{if(linkedPieces.size>0&&!linkedPieces.has(p))return;const delForP=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const avail=t.cutQty-delForP;if(avail>0)items.push({orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:p,qty:avail,maxQty:avail,price:0,checked:false})})}
        else{const totalDel=(o.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const avail=t.cutQty-totalDel;if(avail>0)items.push({orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:"عام",qty:avail,maxQty:avail,price:0,checked:false})}
      });return items};
    const toggleItem=(idx)=>setBatchItems(p=>p.map((x,i)=>i===idx?{...x,checked:!x.checked}:x));
    const updateItem=(idx,field,val)=>setBatchItems(p=>p.map((x,i)=>i===idx?{...x,[field]:field==="qty"?Math.min(Number(val)||0,x.maxQty):field==="price"?Number(val)||0:val}:x));
    const selectAll=()=>setBatchItems(p=>p.map(x=>({...x,checked:true})));
    const deselectAll=()=>setBatchItems(p=>p.map(x=>({...x,checked:false})));
    const checked=batchItems.filter(x=>x.checked&&x.qty>0);
    const totalQty=checked.reduce((s,x)=>s+x.qty,0);

    const doBatchDeliver=async(andPrint,andWa)=>{if(checked.length===0)return;
      /* Group items by orderId */
      const byOrder={};checked.forEach(item=>{if(!byOrder[item.orderId])byOrder[item.orderId]=[];byOrder[item.orderId].push(item)});
      /* Direct Firestore writes - bypass updOrder to avoid stale state */
      for(const[orderId,items] of Object.entries(byOrder)){
        const ord=data.orders.find(o=>o.id===orderId);if(!ord||!ord._docId)continue;
        const updated=JSON.parse(JSON.stringify(ord));
        if(!updated.workshopDeliveries)updated.workshopDeliveries=[];
        items.forEach(item=>{updated.workshopDeliveries.push({id:gid(),wsName:selWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",wsOwner:wsObj?wsObj.owner:"",qty:item.qty,garmentType:item.garmentType,notes:"تسليم مُجمع",price:item.price,date:batchDate,receives:[],createdBy:userName||""})});
        updated.status=recomputeStatus(updated);
        const clean={...updated};delete clean._docId;
        try{await setDoc(doc(db,"seasons",season,"orders",ord._docId),clean)}catch(e){console.error("batch write error:",e)}
      }
      showToast("✓ تم تسليم "+checked.length+" بند ("+totalQty+" قطعة) لـ "+selWs);
      if(andPrint){let pages=[];for(const item of checked){const ord=data.orders.find(o=>o.id===item.orderId);
          const html=await printReceipt(selWs,wsObj?.owner||"",ord||{modelNo:item.modelNo,modelDesc:item.modelDesc},item.garmentType,item.qty,batchDate,0,data.garmentTypes,true);
          if(html)pages.push(html)}
        if(pages.length>0)printPage("اذن تسليم مُجمع — "+selWs,pages.map((p,i)=>"<div"+(i>0?" style='page-break-before:always'":"")+">"+p+"</div>").join(""))}
      if(andWa){const phone=wsObj?.phone||"";let lines=checked.map(item=>"• موديل *"+item.modelNo+"* — "+item.modelDesc+"%0A  "+item.garmentType+" — *"+item.qty+"* قطعة"+(item.price?" — "+item.price+" ج.م":"")).join("%0A");
        const msg="*CLARK — اذن تسليم مُجمع*%0A%0A• الورشة: *"+selWs+"*%0A• التاريخ: *"+batchDate+"*%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+totalQty+"* قطعة%0A%0A*برجاء التأكيد*";
        window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
      setBatchItems([]);setSelWs("");setMode(null)};

    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0,color:"#8B5CF6"}}>{"📦 تسليم مُجمع"}</h1>
        <Btn ghost onClick={()=>{setMode(null);setSelWs("");setBatchItems([])}}>↩</Btn>
      </div>
      <Card title="اختر الورشة" style={{marginBottom:16,position:"relative",zIndex:100}}>
        <SearchSel value={selWs} onChange={v=>{setSelWs(v);
          /* Build items using same logic as regular deliver */
          const items=[];
          const eligible=data.orders.filter(o=>{const s=o.status;return s==="تم القص"||s==="في التشغيل"||s==="في الطباعة"||s==="في التطريز"});
          eligible.forEach(o=>{const t=calcOrder(o);if(t.cutQty<=0)return;
            const pieces=o.orderPieces||[];
            if(pieces.length>0){
              pieces.forEach(p=>{
                const delForP=(o.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
                const avail=t.cutQty-delForP;
                if(avail>0)items.push({orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:p,qty:avail,maxQty:avail,price:0,checked:false})
              })
            }else{
              const totalDel=(o.workshopDeliveries||[]).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
              const avail=t.cutQty-totalDel;
              if(avail>0)items.push({orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:"عام",qty:avail,maxQty:avail,price:0,checked:false})
            }
          });
          setBatchItems(items)
        }} options={workshops.map(w=>({value:w.name||w,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)}))} placeholder="ابحث عن ورشة..."/>
      </Card>
      {selWs&&batchItems.length>0&&(()=>{const bq=batchQ.trim().toLowerCase();const filteredIdx=batchItems.map((item,i)=>({item,i})).filter(({item})=>!bq||(item.modelNo||"").toLowerCase().includes(bq)||(item.modelDesc||"").toLowerCase().includes(bq));
        return<Card title={"الاوردرات المتاحة للتسليم ("+batchItems.length+")"} style={{marginBottom:16}}>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          <Btn small onClick={selectAll} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>تحديد الكل</Btn>
          <Btn small onClick={deselectAll} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>الغاء الكل</Btn>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>التاريخ </label><input type="date" value={batchDate} onChange={e=>setBatchDate(e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text}}/></div>
          {checked.length>0&&<><Btn small primary onClick={()=>doBatchDeliver(false)}>📦 تسليم ({checked.length})</Btn><Btn small onClick={()=>doBatchDeliver(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn><Btn small onClick={()=>doBatchDeliver(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn></>}
        </div>
        <Inp value={batchQ} onChange={setBatchQ} placeholder="فلتر برقم الموديل أو الوصف..." style={{marginBottom:8}}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["✓","الموديل","الوصف","القطعة","الكمية","السعر"].map(h=><th key={h} style={{...TH,fontSize:FS-1}}>{h}</th>)}</tr></thead>
        <tbody>{filteredIdx.map(({item,i})=><tr key={i} style={{background:item.checked?T.ok+"04":"",opacity:item.checked?1:0.5}}>
          <td style={{...TD,textAlign:"center"}}><span onClick={()=>toggleItem(i)} style={{cursor:"pointer",fontSize:18}}>{item.checked?"☑":"☐"}</span></td>
          <td style={{...TDB,fontSize:FS}}>{item.modelNo}</td>
          <td style={{...TD,fontSize:FS-1}}>{item.modelDesc}</td>
          <td style={{...TD,fontWeight:700,color:"#8B5CF6",fontSize:FS}}>{item.garmentType}</td>
          <td style={{...TD,minWidth:70}}><Inp type="number" value={item.qty} onChange={v=>updateItem(i,"qty",v)} sx={{padding:"3px 6px",fontSize:FS-1,textAlign:"center"}}/></td>
          <td style={{...TD,minWidth:70}}>{!isInternal(selWs)&&<Inp type="number" value={item.price||""} onChange={v=>updateItem(i,"price",v)} sx={{padding:"3px 6px",fontSize:FS-1}} placeholder="السعر"/>}</td>
        </tr>)}</tbody></table></div>
        {checked.length>0&&<div style={{marginTop:12,padding:12,borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF620"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{"اجمالي: "+checked.length+" بند — "+totalQty+" قطعة"}</div>
            <div style={{display:"flex",gap:6}}>
              <Btn primary onClick={()=>doBatchDeliver(false)}>📦 تسليم الكل</Btn>
              <Btn onClick={()=>doBatchDeliver(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>📦 تسليم + طباعة</Btn>
              <Btn onClick={()=>doBatchDeliver(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn>
            </div>
          </div>
        </div>}
      </Card>})()}
      {selWs&&batchItems.length===0&&<Card><div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد قطع متاحة للتسليم لهذه الورشة</div></Card>}
    </div>
  }

  /* ── BATCH RECEIVE MODE ── */
  if(mode==="batchRcv"){
    const buildRcvItems=()=>{if(!selWs)return[];const items=[];
      data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName!==selWs)return;
        const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
        if(bal>0)items.push({orderId:o.id,docId:o._docId,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:wd.garmentType||"عام",wdIdx,delivered:wd.qty,received:rcvd,balance:bal,qty:bal,price:Number(wd.price)||0,checked:false})
      })});return items};
    const toggleRcv=(idx)=>setBatchItems(p=>p.map((x,i)=>i===idx?{...x,checked:!x.checked}:x));
    const updateRcv=(idx,val)=>setBatchItems(p=>p.map((x,i)=>i===idx?{...x,qty:Math.min(Number(val)||0,x.balance)}:x));
    const checkedRcv=batchItems.filter(x=>x.checked&&x.qty>0);
    const totalRcvQty=checkedRcv.reduce((s,x)=>s+x.qty,0);

    const doBatchReceive=async(andPrint,andWa)=>{if(checkedRcv.length===0)return;
      const byOrder={};checkedRcv.forEach(item=>{if(!byOrder[item.orderId])byOrder[item.orderId]=[];byOrder[item.orderId].push(item)});
      for(const[orderId,items] of Object.entries(byOrder)){
        const ord=data.orders.find(o=>o.id===orderId);if(!ord||!ord._docId)continue;
        const updated=JSON.parse(JSON.stringify(ord));
        items.forEach(item=>{if(!updated.workshopDeliveries[item.wdIdx].receives)updated.workshopDeliveries[item.wdIdx].receives=[];
          updated.workshopDeliveries[item.wdIdx].receives.push({date:batchDate,qty:item.qty,notes:"استلام مُجمع",price:item.price,amount:r2(item.qty*item.price),quality:"جيد جداً",createdBy:userName||""})});
        updated.status=recomputeStatus(updated);
        const clean={...updated};delete clean._docId;
        try{await setDoc(doc(db,"seasons",season,"orders",ord._docId),clean)}catch(e){console.error("batch rcv error:",e)}
      }
      showToast("✓ تم استلام "+checkedRcv.length+" بند ("+totalRcvQty+" قطعة) من "+selWs);
      if(andPrint){let pages=[];for(const item of checkedRcv){const ord=data.orders.find(o=>o.id===item.orderId);
          const html=await printReceiveReceipt(selWs,ord||{modelNo:item.modelNo,modelDesc:item.modelDesc},item.garmentType,item.qty,batchDate,0,data.garmentTypes,true);
          if(html)pages.push(html)}
        if(pages.length>0)printPage("اذونات استلام مجمعة — "+selWs,pages.map((p,i)=>"<div"+(i>0?" style='page-break-before:always'":"")+">"+p+"</div>").join(""))}
      if(andWa){const phone=wsObj?.phone||"";const lines=checkedRcv.map(item=>"• موديل *"+item.modelNo+"* — "+item.modelDesc+"%0A  "+item.garmentType+" — *"+item.qty+"* قطعة").join("%0A");
        const msg="*CLARK — استلام مُجمع من ورشة*%0A%0A• الورشة: *"+selWs+"*%0A• التاريخ: *"+batchDate+"*%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+totalRcvQty+"* قطعة%0A%0A*برجاء التأكيد*";
        window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
      setBatchItems([]);setSelWs("");setMode(null)};

    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0,color:T.ok}}>{"📥 استلام مُجمع"}</h1>
        <Btn ghost onClick={()=>{setMode(null);setSelWs("");setBatchItems([])}}>↩</Btn>
      </div>
      <Card title="اختر الورشة" style={{marginBottom:16,position:"relative",zIndex:100}}>
        <SearchSel value={selWs} onChange={v=>{setSelWs(v);
          const items=[];data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName!==v)return;
            const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;
            if(bal>0)items.push({orderId:o.id,docId:o._docId,modelNo:o.modelNo,modelDesc:o.modelDesc,garmentType:wd.garmentType||"عام",wdIdx,delivered:wd.qty,received:rcvd,balance:bal,qty:bal,price:Number(wd.price)||0,checked:false})
          })});setBatchItems(items);setBatchQ("")
        }} options={workshops.map(w=>({value:w.name||w,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)}))} placeholder="ابحث عن ورشة..."/>
      </Card>
      {selWs&&batchItems.length>0&&(()=>{const bq=batchQ.trim().toLowerCase();const filteredIdx=batchItems.map((item,i)=>({item,i})).filter(({item})=>!bq||(item.modelNo||"").toLowerCase().includes(bq)||(item.modelDesc||"").toLowerCase().includes(bq));
        return<Card title={"الاوردرات المتاحة للاستلام ("+batchItems.length+")"} style={{marginBottom:16}}>
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          <Btn small onClick={()=>setBatchItems(p=>p.map(x=>({...x,checked:true})))} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>تحديد الكل</Btn>
          <Btn small onClick={()=>setBatchItems(p=>p.map(x=>({...x,checked:false})))} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>الغاء الكل</Btn>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>التاريخ </label><input type="date" value={batchDate} onChange={e=>setBatchDate(e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-1,fontFamily:"inherit",background:T.cardSolid,color:T.text}}/></div>
          {checkedRcv.length>0&&<><Btn small onClick={()=>doBatchReceive(false)} style={{background:T.ok,color:"#fff",border:"none"}}>📥 استلام ({checkedRcv.length})</Btn><Btn small onClick={()=>doBatchReceive(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn><Btn small onClick={()=>doBatchReceive(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn></>}
        </div>
        <Inp value={batchQ} onChange={setBatchQ} placeholder="فلتر برقم الموديل أو الوصف..." style={{marginBottom:8}}/>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["✓","الموديل","الوصف","القطعة","تسليم","مستلم","رصيد","استلام الآن"].map(h=><th key={h} style={{...TH,fontSize:FS-1}}>{h}</th>)}</tr></thead>
        <tbody>{filteredIdx.map(({item,i})=><tr key={i} style={{background:item.checked?T.ok+"04":"",opacity:item.checked?1:0.5}}>
          <td style={{...TD,textAlign:"center"}}><span onClick={()=>toggleRcv(i)} style={{cursor:"pointer",fontSize:18}}>{item.checked?"☑":"☐"}</span></td>
          <td style={{...TDB,fontSize:FS}}>{item.modelNo}</td>
          <td style={{...TD,fontSize:FS-1}}>{item.modelDesc}</td>
          <td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>{item.garmentType}</td>
          <td style={TDB}>{item.delivered}</td>
          <td style={{...TDB,color:T.ok}}>{item.received}</td>
          <td style={{...TDB,color:T.err}}>{item.balance}</td>
          <td style={{...TD,minWidth:70}}><Inp type="number" value={item.qty} onChange={v=>updateRcv(i,v)} sx={{padding:"3px 6px",fontSize:FS-1,textAlign:"center"}}/></td>
        </tr>)}</tbody></table></div>
        {checkedRcv.length>0&&<div style={{marginTop:12,padding:12,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"20"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>{"اجمالي: "+checkedRcv.length+" بند — "+totalRcvQty+" قطعة"}</div>
            <div style={{display:"flex",gap:6}}>
              <Btn primary onClick={()=>doBatchReceive(false)} style={{background:T.ok,border:"none"}}>📥 استلام الكل</Btn>
              <Btn onClick={()=>doBatchReceive(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>📥 استلام + طباعة</Btn>
              <Btn onClick={()=>doBatchReceive(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn>
            </div>
          </div>
        </div>}
      </Card>})()}
      {selWs&&batchItems.length===0&&<Card><div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد قطع في انتظار الاستلام من هذه الورشة</div></Card>}
    </div>
  }

  /* ── RECEIVE MODE ── */
  if(mode==="receive")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
      <h1 style={{fontSize:isMob?22:28,fontWeight:800,margin:0}}>{"📥 استلام من ورشة"}</h1>
      <Btn ghost onClick={()=>{setMode(null);setSelWs("")}}>↩</Btn>
    </div>
    <Card title="اختر الورشة" style={{marginBottom:16,position:"relative",zIndex:100}}>
      <SearchSel value={selWs} onChange={v=>{setSelWs(v);setRcvSearch("")}} options={workshops.map(w=>({value:w.name||w,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)+(w.owner?" - "+w.owner:"")}))} placeholder="ابحث عن ورشة..."/>
      {selWs&&<div style={{marginTop:8}}><Inp value={rcvSearch} onChange={setRcvSearch} placeholder="بحث برقم الموديل..."/></div>}
    </Card>
    {selWs&&<Card title={"أوردرات تم تسليمها لـ "+selWs} style={{marginBottom:16}}>
      {(()=>{
        const cards=[];wsOrders.forEach(ord=>{(ord.workshopDeliveries||[]).filter(wd=>wd.wsName===selWs).forEach((wd,wdIdx)=>{const actualIdx=(ord.workshopDeliveries||[]).indexOf(wd);const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const bal=(Number(wd.qty)||0)-rcvd;if(bal>0)cards.push({ord,wd,wdIdx,actualIdx,rcvd,bal})})});
        const filtered=rcvSearch.trim()?cards.filter(c=>c.ord.modelNo.toLowerCase().includes(rcvSearch.trim().toLowerCase())):cards;
        if(filtered.length===0){const hasAny=wsOrders.some(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===selWs));return<p style={{color:hasAny?T.ok:T.textSec,textAlign:"center",padding:30,fontWeight:hasAny?700:400}}>{rcvSearch.trim()?"لا توجد نتائج لـ \""+rcvSearch+"\"":hasAny?"✓ تم استلام جميع الكميات من الورشة":"لا توجد أوردرات تم تسليمها لهذه الورشة"}</p>}
        return<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {filtered.map(({ord,wd,wdIdx,actualIdx,rcvd,bal})=>{
            return<div key={ord.id+"-"+wdIdx} style={{background:T.cardSolid,borderRadius:14,border:"1px solid "+T.err+"40",overflow:"hidden"}}>
              <div style={{padding:"14px 18px",background:T.err+"08",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div><span style={{fontWeight:700,fontSize:FS+1}}>{ord.modelNo}</span><span style={{fontSize:FS-1,color:T.textSec,marginRight:10}}>{" - "+ord.modelDesc}</span>{wd.garmentType&&<span style={{fontSize:FS,fontWeight:700,color:T.purple,background:T.purple+"15",padding:"4px 14px",borderRadius:10,marginRight:6}}>{gIcon(wd.garmentType,data.garmentTypes)+" "+wd.garmentType}</span>}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <span style={{padding:"4px 12px",borderRadius:8,background:T.accent+"15",fontSize:FS-1,fontWeight:600}}>{"تسليم ورشة: "+wd.qty}</span>
                  <span style={{padding:"4px 12px",borderRadius:8,background:T.ok+"15",fontSize:FS-1,fontWeight:600,color:T.ok}}>{"استلام مصنع: "+rcvd}</span>
                  <span style={{padding:"4px 12px",borderRadius:8,background:T.err+"15",fontSize:FS-1,fontWeight:700,color:T.err}}>{"رصيد: "+bal}</span>
                  {!isInternal(selWs)&&wd.price>0&&<span style={{padding:"4px 12px",borderRadius:8,background:T.purple+"15",fontSize:FS-1,fontWeight:600,color:T.purple}}>{"تشغيل: "+wd.price+" ج.م"}</span>}
                </div>
              </div>
              <div style={{padding:16}}>
                <div style={{fontSize:FS-2,color:T.textSec,marginBottom:8}}>{"تاريخ التسليم: "+wd.date}</div>
                {(wd.receives||[]).length>0&&<div style={{marginBottom:12}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:350}}><thead><tr>{["#","التاريخ","الكمية","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
                  {wd.receives.map((r,ri)=>{const rBal=bal+Number(r.qty);return<tr key={ri}><td style={TD}>{ri+1}</td><td style={TD}>{r.date}</td><td style={TDB}>{r.qty}</td><td style={TD}>{r.notes||"-"}</td><td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}><Btn small onClick={()=>printReceiveReceipt(selWs,ord,wd.garmentType||"",r.qty,r.date,rBal,data.garmentTypes)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}} title="طباعة">🖨</Btn></div></td></tr>})}
                </tbody></table></div></div>}
                {canEdit&&(()=>{const ck=ord.id+"-"+actualIdx;const rv=getRcv(ck);const wdP=Number(wd.price)||0;return<div style={{display:"flex",gap:6,flexWrap:"wrap",padding:8,background:T.inputBg||T.cardSolid,borderRadius:8,alignItems:"end"}}>
                  <div style={{minWidth:70}}><label style={{fontSize:FS-3,color:T.textSec}}>الكمية</label><Inp type="number" value={rv.qty} onChange={v=>setRcv(ck,"qty",Math.min(Number(v)||0,bal))}/></div>
                  {!isInternal(selWs)&&wdP>0&&<div><label style={{fontSize:FS-3,color:T.purple}}>سعر التشغيل</label><div style={{padding:"6px 10px",borderRadius:8,background:T.purple+"10",fontWeight:700,color:T.purple,fontSize:FS}}>{wdP+" ج.م"}</div></div>}
                  {!isInternal(selWs)&&wdP>0&&(rv.qty||0)>0&&<div><label style={{fontSize:FS-3,color:T.accent}}>المبلغ</label><div style={{padding:"6px 10px",borderRadius:8,background:T.accent+"10",fontWeight:700,color:T.accent,fontSize:FS}}>{fmt(r2((rv.qty||0)*wdP))+" ج.م"}</div></div>}
                  <div style={{flex:1,minWidth:80}}><label style={{fontSize:FS-3,color:T.textSec}}>ملاحظات</label><Inp value={rv.note} onChange={v=>setRcv(ck,"note",v)}/></div>
                  <div style={{minWidth:90}}><label style={{fontSize:FS-3,color:T.warn}}>تقييم الجودة</label><Sel value={rv.quality||"جيد جداً"} onChange={v=>setRcv(ck,"quality",v)}><option value="ممتاز">⭐ ممتاز</option><option value="جيد جداً">⭐ جيد جداً</option><option value="جيد">⭐ جيد</option><option value="مقبول">⭐ مقبول</option><option value="سئ">⭐ سئ</option></Sel></div>
                  <div style={{minWidth:110}}><label style={{fontSize:FS-3,color:T.textSec}}>التاريخ</label><Inp type="date" value={rv.date||new Date().toISOString().split("T")[0]} onChange={v=>setRcv(ck,"date",v)}/></div>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>حفظ</Btn>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,true,{modelNo:ord.modelNo,bal},ck)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>حفظ+طباعة</Btn>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck,false,true)} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn>
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn>
                </div>})()}
              </div>
            </div>
          })}
        </div>})()}
    </Card>}
    {/* Workshop-specific movements */}
    {selWs&&wsMoves.length>0&&<Card title={"حركات ورشة "+selWs+" (آخر "+Math.min(10,wsMoves.length)+" من "+wsMoves.length+")"}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:550}}>
        <thead><tr>{["نوع الحركة","التاريخ","موديل","الوصف","نوع القطعة","الكمية",...(isInternal(selWs)?[]:["سعر"]),"ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsMoves.slice(0,10).map((m,i)=>{const isEd=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          return<tr key={i} style={{background:m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":m.type==="settlement"?"⚖️ تسوية":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEd?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:120}}/>:m.date}</td>
          <td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td><td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:m.type==="settlement"?T.err:T.accent}}>{isEd?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:60}}/>:m.qty}</td>
          {!isInternal(selWs)&&<td style={TD}>{isEd&&m.type==="deliver"?<Inp type="number" step="0.01" value={editPrice} onChange={v=>setEditPrice(v)} style={{width:60}}/>:(m.price?m.price+" ج.م":"-")}</td>}
          <td style={TD}>{isEd?<Inp value={editNote} onChange={setEditNote} style={{width:80}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)} title="إغلاق">✕</Btn></>:<>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
            <Btn small onClick={()=>{const ord=data.orders.find(o=>o.id===m.orderId);if(!ord)return;const wd=(ord.workshopDeliveries||[])[m.wdIdx];if(!wd)return;if(m.type==="deliver")printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"deliver",delDate:m.date,delQty:m.qty});else{printLabel(m.wsName,ord,m.garmentType,m.qty,m.date,data.garmentTypes,{type:"receive",delDate:wd.date,delQty:wd.qty,rcvDate:m.date,rcvQty:m.qty})}}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30"}} title="طباعة ليبل حراري">🏷️</Btn>
            <Btn small onClick={()=>{const phone=wsObj?.phone||"";const msg=m.type==="deliver"?"*CLARK — تسليم*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — استلام*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn></>}
          </div>}</td></tr>})}</tbody>
      </table></div>
    </Card>}
  </div>;

  /* ── PAYMENT MODE ── */
  if(mode==="payment")return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h2 style={{fontSize:isMob?18:22,fontWeight:800,margin:0}}>{"💳 اضافة دفعة"}</h2><Btn ghost onClick={()=>setMode(null)}>↩</Btn></div>
    <Card title="تسجيل دفعة" style={{marginBottom:14}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:8,marginBottom:8}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الورشة *</label><SearchSel value={payWs} onChange={setPayWs} options={extWorkshops.map(w=>({value:w.name,label:wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — "+w.name}))} placeholder="ابحث عن ورشة..."/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>نوع الحركة</label><Sel value={payType} onChange={setPayType}><option value="payment">دفعة للورشة (↗ تقليل)</option><option value="purchase">مشتريات الورشة (↙ اضافة)</option></Sel></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 2fr",gap:8,marginBottom:8}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>المبلغ *</label><Inp type="number" step="0.01" value={payAmt} onChange={setPayAmt}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>التاريخ</label><Inp type="date" value={payDate} onChange={setPayDate}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>ملاحظات</label><Inp value={payNote} onChange={setPayNote}/></div>
      </div>
      {payWs&&(()=>{const a=wsAccounts(payWs);const wsObj=workshops.find(x=>x.name===payWs);const pct=wsObj?.payPercent||60;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
        return<div style={{marginBottom:8}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:a.balance>0?T.err+"10":T.ok+"10",color:a.balance>0?T.err:T.ok}}>{"الرصيد: "+fmt(r2(a.balance))+" ج.م"}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:600,background:T.purple+"10",color:T.purple}}>{"حد "+pct+"%: "+fmt(limit)}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:600,background:T.warn+"10"}}>{"مدفوع: "+fmt(r2(a.totalPaid))}</span>
            <span style={{padding:"4px 10px",borderRadius:6,fontSize:FS-1,fontWeight:700,background:remaining>0?T.ok+"10":T.err+"10",color:remaining>0?T.ok:T.err}}>{"متاح للدفع: "+(remaining>0?fmt(remaining)+" ج.م":"0")}</span>
          </div>
          {exceeded&&<div style={{padding:6,borderRadius:6,background:T.err+"10",fontSize:FS-1,fontWeight:700,color:T.err}}>{"⚠️ تجاوز حد "+pct+"% بمبلغ "+fmt(Math.abs(remaining))+" ج.م"}</div>}
        </div>})()}
      <Btn primary onClick={()=>addPayment(false)} disabled={!payWs||!payAmt}>تسجيل</Btn>
      <Btn onClick={()=>addPayment(true)} disabled={!payWs||!payAmt} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال عبر واتساب">📱 واتساب</Btn>
    </Card>
    {payWs&&<Card title={"دفعات "+payWs}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["التاريخ","النوع","المبلغ","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {(data.wsPayments||[]).filter(p=>p.wsName===payWs).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map((p,i)=>{const isEd=editPayId===p.id;
        return<tr key={i} style={{background:isEd?T.warn+"08":p.type==="payment"?"#FEF2F2":"#F0FDF4"}}>
        <td style={{...TD,minWidth:110}}>{isEd?<Inp type="date" value={edPayDate} onChange={setEdPayDate}/>:p.date}</td>
        <td style={{...TD,fontWeight:700,color:p.type==="payment"?T.err:T.ok}}>{isEd?<Sel value={edPayType} onChange={setEdPayType}><option value="payment">دفعة</option><option value="purchase">مشتريات</option></Sel>:(p.type==="payment"?"دفعة ↗":"مشتريات ↙")}</td>
        <td style={{...TDB,color:p.type==="payment"?T.err:T.ok,minWidth:90}}>{isEd?<Inp type="number" value={edPayAmt} onChange={setEdPayAmt}/>:fmt(p.amount)+" ج.م"}</td>
        <td style={{...TD,minWidth:80}}>{isEd?<Inp value={edPayNote} onChange={setEdPayNote}/>:(p.notes||"-")}</td>
        <td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
          {isEd?<><Btn small primary onClick={()=>{upConfig(d=>{const t=(d.wsPayments||[]).find(x=>x.id===p.id);if(t){t.date=edPayDate;t.amount=Number(edPayAmt)||0;t.notes=edPayNote;t.type=edPayType}});setEditPayId(null);showToast("✓ تم التعديل")}} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setEditPayId(null)} title="إغلاق">✕</Btn></>
          :<><Btn small onClick={()=>{setEditPayId(p.id);setEdPayDate(p.date);setEdPayAmt(p.amount);setEdPayNote(p.notes||"");setEdPayType(p.type)}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
          <Btn small onClick={()=>{const wsO=workshops.find(w=>w.name===payWs);const ph=wsO?.phone||"";const ac=wsAccounts(payWs);const mg="*CLARK — "+(p.type==="payment"?"اشعار دفعة":"اشعار مشتريات")+"*%0A%0A• الورشة: *"+payWs+"*%0A• المبلغ: *"+fmt(p.amount)+"* ج.م%0A• التاريخ: *"+p.date+"*%0A"+(p.notes?"• ملاحظات: "+p.notes+"%0A":"")+"%0A─────────────────%0A*الرصيد الحالي: "+fmt(r2(ac.balance))+" ج.م*";window.open("https://wa.me/"+(ph?ph.replace(/[^0-9]/g,""):"")+"?text="+mg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}} title="ارسال واتساب">📱</Btn>
          <DelBtn onConfirm={()=>upConfig(d=>{d.wsPayments=(d.wsPayments||[]).filter(x=>x.id!==p.id)})}/></>}
        </div></td>
      </tr>})}{(data.wsPayments||[]).filter(p=>p.wsName===payWs).length===0&&<tr><td colSpan={5} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد دفعات</td></tr>}
    </tbody></table></div></Card>}
  </div>;

  /* ── ACCOUNTS MODE ── */
  if(mode==="accounts"){
    const activeWs=extWorkshops.filter(w=>{const a=wsAccounts(w.name);return a.due>0||a.totalPaid>0||a.totalPurchase>0});
    const totals=activeWs.reduce((s,w)=>{const a=wsAccounts(w.name);return{due:s.due+a.due,purchase:s.purchase+a.totalPurchase,paid:s.paid+a.totalPaid,balance:s.balance+a.balance}},{due:0,purchase:0,paid:0,balance:0});
    const filteredWs=accWsF==="الكل"?activeWs:activeWs.filter(w=>w.name===accWsF);
    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div><h2 style={{fontSize:isMob?18:22,fontWeight:800,margin:0}}>{"📊 حسابات الورش"}</h2><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season}</div></div>
        <div style={{display:"flex",gap:6}}>
          <Btn onClick={()=>{const rows=[["الورشة","النسبة","مستحق","مدفوع","حد النسبة","متاح للدفع","الرصيد"]];activeWs.forEach(w=>{const a=wsAccounts(w.name);const pct=w.payPercent||60;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);rows.push([w.name,pct+"%",r2(totalDue),r2(a.totalPaid),limit,remaining>0?remaining:0,r2(a.balance)])});rows.push([]);rows.push(["اجمالي","",r2(totals.due+totals.purchase),r2(totals.paid),"","",r2(totals.balance)]);exportExcel(rows,"حسابات_الورش_"+season)}} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
          <Btn onClick={()=>{const el=document.getElementById("ws-acc-area");if(!el)return;printPage("حسابات الورش — "+season,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
          <Btn ghost onClick={()=>setMode(null)}>↩</Btn>
        </div>
      </div>
      <div id="ws-acc-area">
      <Card title="ملخص الحسابات" style={{marginBottom:14}}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["الورشة","النسبة","مستحق","مدفوع","حد النسبة","متاح للدفع","الرصيد",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{activeWs.map(w=>{const a=wsAccounts(w.name);const pct=w.payPercent||60;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
          return<tr key={w.id}>
          <td style={{...TD,fontWeight:700}}>{w.name}</td>
          <td style={{...TDB,color:T.purple}}>{pct+"%"}</td>
          <td style={{...TDB,color:T.accent}}>{fmt(r2(totalDue))}</td>
          <td style={{...TDB,color:T.warn}}>{fmt(r2(a.totalPaid))}</td>
          <td style={TDB}>{fmt(limit)}</td>
          <td style={{...TDB,fontWeight:700,color:remaining>0?T.ok:remaining<0?T.err:T.textMut}}>{remaining>0?fmt(remaining):remaining<0?"تجاوز "+fmt(Math.abs(remaining)):"0"}</td>
          <td style={{...TDB,fontSize:FS+1,color:a.balance>0?T.err:T.ok}}>{fmt(r2(a.balance))}</td>
          <td style={TD}>{exceeded&&<span style={{fontSize:FS-2,padding:"2px 6px",borderRadius:6,background:T.err+"12",color:T.err,fontWeight:700}}>⚠</span>}</td>
        </tr>})}
          {(()=>{const tLimit=activeWs.reduce((s,w)=>{const a=wsAccounts(w.name);const pct=w.payPercent||60;return s+r2((a.due+a.totalPurchase)*(pct/100))},0);const tRemaining=r2(tLimit-totals.paid);
          return<tr style={{background:T.accent+"08"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TD}></td>
          <td style={{...TDB,color:T.accent,fontWeight:800}}>{fmt(r2(totals.due+totals.purchase))}</td>
          <td style={{...TDB,color:T.warn,fontWeight:800}}>{fmt(r2(totals.paid))}</td>
          <td style={{...TDB,fontWeight:800}}>{fmt(r2(tLimit))}</td>
          <td style={{...TDB,fontWeight:800,color:tRemaining>0?T.ok:T.err}}>{tRemaining>0?fmt(tRemaining):tRemaining<0?"تجاوز "+fmt(Math.abs(tRemaining)):"0"}</td>
          <td style={{...TDB,fontSize:FS+2,fontWeight:800,color:totals.balance>0?T.err:T.ok}}>{fmt(r2(totals.balance))+" ج.م"}</td><td style={TD}></td></tr>})()}
        </tbody>
      </table></div></Card>
      {/* Workshop filter */}
      <div style={{marginBottom:14}}><SearchSel value={accWsF} onChange={setAccWsF} options={[{value:"الكل",label:"كل الورش"},...activeWs.map(w=>({value:w.name,label:(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+w.name}))]} placeholder="ابحث عن ورشة..."/></div>
      {/* Per-workshop statement */}
      {filteredWs.map(w=>{const a=wsAccounts(w.name);
        const entries=[];
        data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{entries.push({date:r.date,desc:o.modelNo+(wd.garmentType?" - "+wd.garmentType:""),qty:r.qty,price:r.price||0,amount:r2((r.qty||0)*(r.price||0)),type:"due"})})})});
        (data.wsPayments||[]).filter(p=>p.wsName===w.name).forEach(p=>{entries.push({date:p.date,desc:p.type==="payment"?"دفعة"+(p.notes?" - "+p.notes:""):"مشتريات"+(p.notes?" - "+p.notes:""),amount:p.amount,type:p.type})});
        entries.sort((a,b)=>(a.date||"").localeCompare(b.date||""));let running=0;
        const printStmt=async()=>{
          let qrSrc="";try{const QR=await loadQR();if(QR)qrSrc=await QR.toDataURL(window.location.origin+"?act=wsacc&ws="+encodeURIComponent(w.name),{width:120,margin:1})}catch(e){}
          const totalDue=a.due+a.totalPurchase;const pct=w.payPercent||60;
          let del=0,rcv=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});
          let h="<div style='text-align:center;margin-bottom:20px'><img src='"+CLARK_LOGO+"' style='width:160px;margin-bottom:8px'/><h1 style='font-size:22px;margin:0;color:#0F172A'>كشف حساب ورشة</h1><h2 style='font-size:26px;margin:4px 0;color:#0284C7'>"+w.name+"</h2><div style='font-size:12px;color:#64748B'>الموسم: "+season+" | تاريخ الطباعة: "+new Date().toLocaleDateString("ar-EG")+"</div></div>";
          h+="<div style='display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-bottom:16px'>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:#EFF6FF;text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>تسليم للورشة</div><div style='font-size:18px;font-weight:800;color:#0284C7'>"+fmt(del)+"</div></div>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:#F0FDF4;text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>استلام مصنع</div><div style='font-size:18px;font-weight:800;color:#10B981'>"+fmt(rcv)+"</div></div>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:#FEF3C7;text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>المستحق</div><div style='font-size:18px;font-weight:800;color:#F59E0B'>"+fmt(r2(totalDue))+"</div></div>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:#FEE2E2;text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>المدفوع</div><div style='font-size:18px;font-weight:800;color:#EF4444'>"+fmt(r2(a.totalPaid))+"</div></div>";
          h+="<div style='padding:10px 16px;border-radius:8px;background:"+(a.balance>0?"#FEE2E2":"#F0FDF4")+";text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>رصيد حالي</div><div style='font-size:18px;font-weight:800;color:"+(a.balance>0?"#EF4444":"#10B981")+"'>"+fmt(r2(a.balance))+"</div></div></div>";
          h+="<table><thead><tr><th>التاريخ</th><th>البيان</th><th>كمية</th><th>سعر</th><th>مستحق</th><th>مدفوع</th><th>رصيد حالي</th></tr></thead><tbody>";
          let pRun=0;entries.forEach(e=>{if(e.type==="due"||e.type==="purchase")pRun+=e.amount;else pRun-=e.amount;
            h+="<tr style='background:"+(e.type==="payment"?"#FEF2F2":e.type==="purchase"?"#F0FDF4":"")+"'><td>"+e.date+"</td><td>"+e.desc+"</td><td style='font-weight:700'>"+(e.qty||"-")+"</td><td>"+(e.price||"-")+"</td><td style='color:#0284C7;font-weight:700'>"+(e.type==="due"?fmt(e.amount):e.type==="purchase"?fmt(e.amount):"-")+"</td><td style='color:#EF4444;font-weight:700'>"+(e.type==="payment"?fmt(e.amount):"-")+"</td><td style='font-weight:700;color:"+(pRun>0?"#EF4444":"#10B981")+"'>"+fmt(r2(pRun))+"</td></tr>"});
          h+="</tbody></table>";
          h+="<div style='display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px'><div style='text-align:center;width:180px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px'>توقيع المسؤول</div></div><div style='text-align:center;width:180px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px'>توقيع الورشة</div></div>"+(qrSrc?"<div style='text-align:center'><img src='"+qrSrc+"' style='width:80px;height:80px'/><div style='font-size:8px;color:#94A3B8'>"+w.name+"</div></div>":"")+"</div>";
          h+="<div style='margin-top:16px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management — "+new Date().toLocaleDateString("ar-EG")+"</div>";
          printPage("كشف حساب — "+w.name,h)
        };
        return<Card key={w.id} title={"كشف حساب: "+w.name} style={{marginTop:12}} extra={<Btn small onClick={printStmt} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨 طباعة</Btn>}>
          <div id={"ws-stmt-"+w.id}>
          <h2>{"كشف حساب: "+w.name}</h2>
          <div className="sub">{"الموسم: "+season+" | التاريخ: "+new Date().toLocaleDateString("ar-EG")}</div>
          {(()=>{const pct=w.payPercent||60;const totalDue=a.due+a.totalPurchase;const limit=r2(totalDue*(pct/100));const remaining=r2(limit-a.totalPaid);const exceeded=remaining<0;
          return<><div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:T.accent+"10",fontSize:FS-1,fontWeight:600}}>{"مستحق: "+fmt(r2(totalDue))}</span>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:T.warn+"10",fontSize:FS-1,fontWeight:600}}>{"مدفوع: "+fmt(r2(a.totalPaid))}</span>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:T.purple+"10",fontSize:FS-1,fontWeight:600,color:T.purple}}>{"حد "+pct+"%: "+fmt(limit)}</span>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:remaining>0?T.ok+"10":T.err+"10",fontSize:FS-1,fontWeight:700,color:remaining>0?T.ok:T.err}}>{"متاح للدفع: "+(remaining>0?fmt(remaining):"0")}</span>
            <span className="badge" style={{padding:"4px 10px",borderRadius:6,background:a.balance>0?T.err+"10":T.ok+"10",fontSize:FS-1,fontWeight:700,color:a.balance>0?T.err:T.ok}}>{"الرصيد النهائي: "+fmt(r2(a.balance))+" ج.م"}</span>
          </div>
          {exceeded&&<div style={{padding:8,borderRadius:8,background:T.err+"10",border:"1px solid "+T.err+"25",marginBottom:8,fontSize:FS,fontWeight:700,color:T.err}}>{"⚠️ تجاوز حد النسبة "+pct+"% بمبلغ "+fmt(Math.abs(remaining))+" ج.م"}</div>}</>})()}
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["التاريخ","البيان","كمية","سعر","مستحق","مدفوع","الرصيد"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>{entries.map((e,i)=>{if(e.type==="due"||e.type==="purchase")running+=e.amount;else running-=e.amount;
              return<tr key={i} style={{background:e.type==="payment"?"#FEF2F2":e.type==="purchase"?"#F0FDF4":""}}>
                <td style={TD}>{e.date}</td><td style={TD}>{e.desc}</td><td style={TDB}>{e.qty||"-"}</td><td style={TD}>{e.price?e.price:"-"}</td>
                <td style={{...TDB,color:T.accent}}>{e.type==="due"?fmt(e.amount):e.type==="purchase"?fmt(e.amount):"-"}</td>
                <td style={{...TDB,color:T.err}}>{e.type==="payment"?fmt(e.amount):"-"}</td>
                <td style={{...TDB,color:running>0?T.err:T.ok}}>{fmt(r2(running))}</td></tr>})}</tbody>
          </table></div>
          </div>
        </Card>})}
      </div>
    </div>
  }
  return null
}

/* ══ COST CALCULATOR ══ */
function CalcPg({data,isMob}){
  const[cFabs,setCFabs]=useState([{fabId:"",cons:0,layers:0,pcsPerLayer:0}]);
  const[cAccs,setCAccs]=useState([]);
  const addFab=()=>setCFabs(p=>[...p,{fabId:"",cons:0,layers:0,pcsPerLayer:0}]);
  const upFab=(i,f,v)=>setCFabs(p=>p.map((x,j)=>j===i?{...x,[f]:f==="fabId"?v:(Number(v)||0)}:x));
  const mainQty=cFabs[0]?(cFabs[0].layers*cFabs[0].pcsPerLayer):0;
  const fabCosts=cFabs.map(f=>{const fb=data.fabrics.find(x=>x.id===Number(f.fabId));const price=fb?fb.price:0;return{name:fb?fb.name:"",cost:r2(f.cons*price*f.layers),perPc:mainQty?r2(f.cons*price*f.layers/mainQty):0}});
  const totalFab=fabCosts.reduce((s,f)=>s+f.cost,0);const fabPerPc=mainQty?r2(totalFab/mainQty):0;
  const accPerPc=cAccs.reduce((s,a)=>s+(Number(a.price)||0),0);const totalAcc=accPerPc*mainQty;
  const totalCost=totalFab+totalAcc;const costPerPc=r2(fabPerPc+accPerPc);
  const reset=()=>{setCFabs([{fabId:"",cons:0,layers:0,pcsPerLayer:0}]);setCAccs([])};
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h1 style={{fontSize:isMob?20:26,fontWeight:800,color:"#EC4899",margin:0}}>🧮 حاسبة التكاليف</h1>
      <Btn ghost onClick={reset}>🔄 مسح</Btn>
    </div>
    <Card title="الخامات" style={{marginBottom:14}}>
      {cFabs.map((f,i)=>{const fb=data.fabrics.find(x=>x.id===Number(f.fabId));return<div key={i} style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"2fr 1fr 1fr 1fr auto",gap:8,marginBottom:8,padding:10,background:T.bg,borderRadius:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الخامة{i===0?" (رئيسية) *":""}</label><Sel value={f.fabId} onChange={v=>upFab(i,"fabId",v)}><option value="">-- اختر --</option>{data.fabrics.map(x=><option key={x.id} value={x.id}>{x.name+" - "+x.price+" ج.م/"+x.unit}</option>)}</Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>استهلاك/راق</label><Inp type="number" value={f.cons} onChange={v=>upFab(i,"cons",v)}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الراقات</label><Inp type="number" value={f.layers} onChange={v=>upFab(i,"layers",v)}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>قطع/راق</label><Inp type="number" value={f.pcsPerLayer} onChange={v=>upFab(i,"pcsPerLayer",v)}/></div>
        {i>0&&<Btn danger small onClick={()=>setCFabs(p=>p.filter((_,j)=>j!==i))} style={{alignSelf:"end"}} title="إغلاق">✕</Btn>}
      </div>})}
      <Btn ghost small onClick={addFab} style={{color:"#EC4899"}}>+ خامة اضافية</Btn>
    </Card>
    <Card title="الاكسسوار" style={{marginBottom:14}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{(data.accessories||[]).filter(a=>!cAccs.find(x=>x.accId===a.id)).map(a=><span key={a.id} onClick={()=>setCAccs(p=>[...p,{accId:a.id,name:a.name,price:a.price}])} style={{padding:"6px 12px",borderRadius:8,background:T.bg,border:"1px solid "+T.brd,cursor:"pointer",fontSize:FS-1}}>{"+ "+a.name+" ("+a.price+" ج.م)"}</span>)}</div>
      {cAccs.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>{cAccs.map((a,i)=><span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:"#EC4899"+"12",border:"1px solid #EC4899"+"30",fontSize:FS-1,fontWeight:600}}>{a.name+" — "+a.price+" ج.م"}<span onClick={()=>setCAccs(p=>p.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err,fontWeight:800}}>✕</span></span>)}</div>}
    </Card>
    {mainQty>0&&<Card title="النتيجة" accent={"linear-gradient(135deg,#EC4899,#8B5CF6)"}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:12,marginBottom:14}}>
        <div style={{padding:14,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>كمية القطع</div><div style={{fontSize:24,fontWeight:800,color:T.accent}}>{mainQty}</div></div>
        <div style={{padding:14,borderRadius:10,background:"#EC4899"+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>تكلفة الخامات</div><div style={{fontSize:20,fontWeight:800,color:"#EC4899"}}>{fmt(r2(totalFab))+" ج.م"}</div></div>
        <div style={{padding:14,borderRadius:10,background:"#8B5CF6"+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>تكلفة الاكسسوار</div><div style={{fontSize:20,fontWeight:800,color:"#8B5CF6"}}>{fmt(r2(totalAcc))+" ج.م"}</div></div>
        <div style={{padding:14,borderRadius:10,background:T.ok+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>التكلفة الاجمالية</div><div style={{fontSize:24,fontWeight:800,color:T.ok}}>{fmt(r2(totalCost))+" ج.م"}</div></div>
      </div>
      <div style={{textAlign:"center",padding:14,background:T.cardSolid,borderRadius:12,border:"2px solid "+T.accent}}>
        <div style={{fontSize:FS,color:T.textSec}}>تكلفة القطعة الواحدة</div>
        <div style={{fontSize:32,fontWeight:800,color:T.accent}}>{costPerPc+" ج.م"}</div>
        <div style={{fontSize:FS-2,color:T.textMut}}>{"(خامات: "+fabPerPc+" + اكسسوار: "+accPerPc+")"}</div>
      </div>
      {fabCosts.filter(f=>f.name).length>0&&<div style={{marginTop:12,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الخامة","التكلفة","تكلفة/قطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {fabCosts.filter(f=>f.name).map((f,i)=><tr key={i}><td style={TD}>{f.name}</td><td style={{...TDB,color:"#EC4899"}}>{fmt(f.cost)+" ج.م"}</td><td style={{...TDB,color:T.accent}}>{f.perPc+" ج.م"}</td></tr>)}
      </tbody></table></div>}
    </Card>}
  </div>
}

/* ══ SEARCH ══ */
function StockPg({data,updOrder,isMob,canEdit,statusCards,user}){
  const userName=user?.displayName||user?.email?.split("@")[0]||"";
  const[selOrder,setSelOrder]=useState("");
  const[stQty,setStQty]=useState(0);const[stNote,setStNote]=useState("");const[stDate,setStDate]=useState(new Date().toISOString().split("T")[0]);
  const[editSt,setEditSt]=useState(null);const[edStDate,setEdStDate]=useState("");const[edStQty,setEdStQty]=useState(0);const[edStNote,setEdStNote]=useState("");
  const[showLimitPopup,setShowLimitPopup]=useState(null);
  const[stLogQ,setStLogQ]=useState("");
  const[qRcvPiece,setQRcvPiece]=useState(null);const[qRcvQty,setQRcvQty]=useState(0);const[qRcvDate,setQRcvDate]=useState(new Date().toISOString().split("T")[0]);
  const[qEditPiece,setQEditPiece]=useState(null);const[qEditQty,setQEditQty]=useState(0);

  const eligible=useMemo(()=>data.orders.filter(o=>{
    const wds=o.workshopDeliveries||[];if(wds.length===0)return false;
    const t=calcOrder(o);const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
    if(stockDel>=t.cutQty)return false;
    const pieces=o.orderPieces||[];
    if(pieces.length>0){
      return!pieces.some(p=>{const rcvdForP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return rcvdForP===0})
    }else{
      const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);return totalRcv>0
    }
  }),[data.orders]);

  const ord=eligible.find(o=>o.id===selOrder);
  const t=ord?calcOrder(ord):{cutQty:0};
  const stockDel=ord?(ord.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0):0;

  /* Per-piece breakdown & max complete set */
  const pieces=ord?(ord.orderPieces||[]):[];
  const wds=ord?(ord.workshopDeliveries||[]):[];
  const pieceBreakdown=pieces.map(p=>{
    const delToWs=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
    const rcvFromWs=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
    return{piece:p,cutQty:t.cutQty,delToWs,rcvFromWs,balance:delToWs-rcvFromWs}
  });
  const maxCompleteSet=pieces.length>0?Math.min(...pieceBreakdown.map(p=>p.rcvFromWs)):wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
  const stockRemain=Math.max(0,Math.min(t.cutQty-stockDel,maxCompleteSet-stockDel));
  const shortPieces=pieceBreakdown.filter(p=>p.rcvFromWs<maxCompleteSet||(pieces.length>0&&p.rcvFromWs===Math.min(...pieceBreakdown.map(x=>x.rcvFromWs))&&pieceBreakdown.some(x=>x.rcvFromWs>p.rcvFromWs)));

  const saveStock=(andPrint)=>{
    if(!selOrder||!stQty||stQty<=0)return;
    const qty=Number(stQty);
    if(qty>stockRemain){
      const details=pieceBreakdown.map(p=>"• "+p.piece+": استلم المصنع "+p.rcvFromWs+" من "+p.cutQty).join("\n");
      setShowLimitPopup({max:stockRemain,requested:qty,details:pieceBreakdown});return
    }
    const saveOrd=JSON.parse(JSON.stringify(ord));
    updOrder(selOrder,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:stDate,qty,notes:stNote,createdBy:userName||""});o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)});
    const newTotalDel=stockDel+qty;
    if(andPrint)setTimeout(()=>printStockDelivery(saveOrd,qty,stDate,stNote,newTotalDel,t.cutQty),400);
    setStQty(0);setStNote("");setStDate(new Date().toISOString().split("T")[0]);showToast("✓ تم تسليم المخزن")
  };

  const printLog=()=>{
    const allStock=[];data.orders.forEach(o=>{(o.deliveries||[]).forEach(d=>{allStock.push({...d,modelNo:o.modelNo,modelDesc:o.modelDesc})})});
    allStock.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    let h="<h2 style='text-align:center;margin-bottom:12px'>📦 سجل تسليمات المخزن</h2>";
    h+="<table><thead><tr><th>#</th><th>التاريخ</th><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody>";
    allStock.forEach((s,i)=>{h+="<tr><td>"+(i+1)+"</td><td>"+s.date+"</td><td style='font-weight:700'>"+s.modelNo+"</td><td>"+s.modelDesc+"</td><td style='font-weight:700;color:#059669'>"+s.qty+"</td><td>"+(s.notes||"-")+"</td></tr>"});
    const totalQty=allStock.reduce((s,x)=>s+(Number(x.qty)||0),0);
    h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='4'>الاجمالي</td><td style='color:#059669'>"+fmt(totalQty)+"</td><td></td></tr>";
    h+="</tbody></table>";
    h+="<div style='margin-top:16px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management — "+new Date().toLocaleDateString("ar-EG")+"</div>";
    printPage("سجل تسليمات المخزن",h)
  };

  return<div>
    <Card style={{marginBottom:12,overflow:"visible",position:"relative",zIndex:100}}>
      <div style={{marginBottom:12,position:"relative",zIndex:100}}>
        <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600,marginBottom:4,display:"block"}}>{"اختر الأوردر ("+eligible.length+")"}</label>
        <SearchSel value={selOrder} onChange={v=>{setSelOrder(v);setStQty(0)}} options={eligible.map(o=>{const tc=calcOrder(o);const sd=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return{value:o.id,label:o.modelNo+" — "+o.modelDesc+" (متبقي: "+(tc.cutQty-sd)+")"}})} placeholder="ابحث بالموديل أو الوصف..."/>
      </div>
      {selOrder&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>{"الكمية (متاح: "+stockRemain+")"}</label><Inp type="number" value={stQty} onChange={v=>setStQty(Number(v)||0)}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>التاريخ</label><Inp type="date" value={stDate} onChange={setStDate}/></div>
        <div style={{display:"flex",gap:6,alignItems:"end"}}><Btn primary onClick={()=>saveStock(false)} disabled={!stQty||stQty<=0}>📦 تسليم</Btn><Btn onClick={()=>saveStock(true)} disabled={!stQty||stQty<=0} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>📦+🖨</Btn></div>
      </div>}
      {/* Per-piece breakdown */}
      {selOrder&&ord&&pieces.length>0&&<div style={{marginTop:10,padding:10,borderRadius:10,background:T.bg,border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS-1,fontWeight:700,color:T.textSec,marginBottom:6}}>تفاصيل القطع والطقم الكامل</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["القطعة","كمية القص","تسليم ورشة","استلام مصنع","متبقي عند الورش",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
        <tbody>{pieceBreakdown.map(p=>{const isAdding=qRcvPiece===p.piece;const isEditing=qEditPiece===p.piece;
          /* Find wd with balance for adding */
          const wdForP=wds.filter(wd=>wd.garmentType===p.piece).find(wd=>{const rc=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);return rc<(Number(wd.qty)||0)});
          const wdIdx=wdForP?wds.indexOf(wdForP):-1;
          const maxAdd=wdForP?((Number(wdForP.qty)||0)-(wdForP.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0)):0;
          /* Find last receive for editing */
          let lastRcvWdIdx=-1,lastRcvRIdx=-1;
          wds.forEach((wd,wi)=>{if(wd.garmentType===p.piece)(wd.receives||[]).forEach((r,ri)=>{lastRcvWdIdx=wi;lastRcvRIdx=ri})});
          const hasRcv=lastRcvWdIdx>=0;
          return<tr key={p.piece} style={{background:(isAdding||isEditing)?T.accent+"06":""}}>
          <td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>{p.piece}</td>
          <td style={TDB}>{p.cutQty}</td>
          <td style={{...TDB,color:T.purple}}>{p.delToWs}</td>
          <td style={{...TDB,color:T.ok}}>{isEditing?<Inp type="number" value={qEditQty} onChange={v=>setQEditQty(Number(v)||0)} sx={{width:70,padding:"2px 4px",fontSize:FS}}/>:isAdding?<div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontWeight:700}}>{p.rcvFromWs}</span><span style={{color:T.textMut}}>+</span><Inp type="number" value={qRcvQty} onChange={v=>setQRcvQty(Math.min(Number(v)||0,maxAdd))} sx={{width:60,padding:"2px 4px",fontSize:FS-1}}/><Inp type="date" value={qRcvDate} onChange={setQRcvDate} sx={{padding:"2px 4px",fontSize:FS-2}}/></div>:p.rcvFromWs}</td>
          <td style={{...TDB,color:p.balance>0?T.err:T.ok}}>{p.balance>0?p.balance:"✓"}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEditing?<><Btn small primary onClick={()=>{updOrder(selOrder,o=>{const r=o.workshopDeliveries[lastRcvWdIdx].receives[lastRcvRIdx];if(r)r.qty=qEditQty;o.status=recomputeStatus(o)});setQEditPiece(null);showToast("✓ تم تعديل الاستلام")}} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setQEditPiece(null)} title="إغلاق">✕</Btn></>
            :isAdding?<><Btn small primary onClick={()=>{if(!qRcvQty||qRcvQty<=0)return;updOrder(selOrder,o=>{if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];o.workshopDeliveries[wdIdx].receives.push({date:qRcvDate,qty:qRcvQty,notes:"استلام سريع",price:Number(wdForP.price)||0,amount:r2(qRcvQty*(Number(wdForP.price)||0)),createdBy:userName||""});o.status=recomputeStatus(o)});setQRcvPiece(null);setQRcvQty(0);showToast("✓ تم استلام "+qRcvQty+" "+p.piece)}} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setQRcvPiece(null)} title="إغلاق">✕</Btn></>
            :<>{hasRcv&&<Btn ghost small onClick={()=>{const lastR=wds[lastRcvWdIdx].receives[lastRcvRIdx];setQEditPiece(p.piece);setQEditQty(lastR.qty);setQRcvPiece(null)}} style={{fontSize:FS-3,padding:"2px 6px"}} title="تعديل">✏️</Btn>}{p.balance>0&&wdIdx>=0&&<Btn ghost small onClick={()=>{setQRcvPiece(p.piece);setQRcvQty(0);setQRcvDate(new Date().toISOString().split("T")[0]);setQEditPiece(null)}} style={{fontSize:FS-3,padding:"2px 8px",color:T.accent}}>📥</Btn>}</>}
          </div>}</td>
        </tr>})}</tbody></table></div>
        <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{padding:"6px 14px",borderRadius:8,background:T.ok+"12",color:T.ok,fontWeight:800,fontSize:FS}}>{"🧩 الطقم الكامل المتاح: "+stockRemain}</span>
          <span style={{padding:"4px 10px",borderRadius:6,background:T.accent+"10",color:T.accent,fontWeight:600,fontSize:FS-2}}>{"= أقل قطعة مستلمة ("+maxCompleteSet+") - تم تسليمه للمخزن ("+stockDel+")"}</span>
        </div>
      </div>}
      {/* Simple summary for orders without pieces */}
      {selOrder&&ord&&pieces.length===0&&<div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
        <span style={{padding:"4px 10px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:700,fontSize:FS-1}}>{"القص: "+t.cutQty}</span>
        <span style={{padding:"4px 10px",borderRadius:6,background:T.ok+"10",color:T.ok,fontWeight:700,fontSize:FS-1}}>{"تم تسليمه: "+stockDel}</span>
        <span style={{padding:"4px 10px",borderRadius:6,background:stockRemain>0?T.warn+"10":T.ok+"10",color:stockRemain>0?T.warn:T.ok,fontWeight:700,fontSize:FS-1}}>{"المتبقي: "+stockRemain}</span>
      </div>}
      {selOrder&&<div style={{marginTop:8}}><Inp value={stNote} onChange={setStNote} placeholder="ملاحظات (اختياري)"/></div>}
    </Card>

    {/* Limit exceeded popup */}
    {showLimitPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowLimitPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:480,border:"1px solid "+T.err+"40",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>⚠️ لا يمكن تسليم {showLimitPopup.requested} طقم</div><Btn ghost small onClick={()=>setShowLimitPopup(null)}>✕</Btn></div>
        <div style={{fontSize:FS,color:T.text,marginBottom:12}}>{"الحد الأقصى للطقم الكامل: "+showLimitPopup.max+" طقم فقط"}</div>
        <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>السبب: عدد القطع المستلمة من الورش غير متساوي. الطقم الكامل = أقل قطعة مستلمة.</div>
        <div style={{overflowX:"auto",marginBottom:12}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["القطعة","مستلم من الورش","الحالة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead>
        <tbody>{showLimitPopup.details.map(p=>{const isMin=p.rcvFromWs===Math.min(...showLimitPopup.details.map(x=>x.rcvFromWs));
          return<tr key={p.piece}><td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>{p.piece}</td><td style={{...TDB,color:isMin?T.err:T.ok}}>{p.rcvFromWs}</td><td style={{...TD,fontSize:FS-2}}>{isMin&&showLimitPopup.details.some(x=>x.rcvFromWs>p.rcvFromWs)?<span style={{color:T.err,fontWeight:700}}>{"⚠️ ناقص "+(Math.max(...showLimitPopup.details.map(x=>x.rcvFromWs))-p.rcvFromWs)+" قطعة"}</span>:<span style={{color:T.ok}}>✓</span>}</td></tr>})}</tbody>
        </table></div>
        <Btn primary onClick={()=>setShowLimitPopup(null)} style={{width:"100%"}}>فهمت</Btn>
      </div>
    </div>}

    {/* Stock delivery log */}
    {(()=>{const allStock=[];data.orders.forEach(o=>{(o.deliveries||[]).forEach((d,i)=>{allStock.push({...d,modelNo:o.modelNo,modelDesc:o.modelDesc,orderId:o.id,idx:i})})});allStock.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      const startEdit=(s)=>{setEditSt({orderId:s.orderId,idx:s.idx});setEdStDate(s.date);setEdStQty(s.qty);setEdStNote(s.notes||"")};
      const saveEdit=()=>{if(!editSt)return;updOrder(editSt.orderId,o=>{const d=o.deliveries[editSt.idx];if(d){d.date=edStDate;d.qty=Number(edStQty)||0;d.notes=edStNote;o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)}});setEditSt(null)};
      const delStock=(s)=>{updOrder(s.orderId,o=>{o.deliveries.splice(s.idx,1);o.deliveredQty=o.deliveries.reduce((ss,x)=>ss+(Number(x.qty)||0),0);o.status=recomputeStatus(o)})};
      return allStock.length>0&&<Card title={"سجل تسليمات المخزن ("+allStock.length+")"} extra={<Btn small onClick={printLog} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
        <div style={{marginBottom:8}}><Inp value={stLogQ} onChange={setStLogQ} placeholder="🔍 بحث برقم الموديل..."/></div>
        {(()=>{const filtered=stLogQ.trim()?allStock.filter(s=>s.modelNo.includes(stLogQ.trim())):allStock;return<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","التاريخ","الموديل","الوصف","الكمية","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{filtered.map((s,i)=>{const isEd=editSt&&editSt.orderId===s.orderId&&editSt.idx===s.idx;
          return<tr key={i} style={{background:isEd?T.warn+"06":""}}>
          <td style={TD}>{i+1}</td>
          <td style={{...TD,minWidth:120}}>{isEd?<Inp type="date" value={edStDate} onChange={setEdStDate}/>:s.date}</td>
          <td style={TDB}>{s.modelNo}</td><td style={TD}>{s.modelDesc}</td>
          <td style={{...TDB,color:T.ok,minWidth:80}}>{isEd?<Inp type="number" value={edStQty} onChange={v=>setEdStQty(Number(v)||0)}/>:s.qty}</td>
          <td style={{...TD,minWidth:100}}>{isEd?<Inp value={edStNote} onChange={setEdStNote}/>:(s.notes||"-")}</td>
          {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEdit} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setEditSt(null)} title="إغلاق">✕</Btn></>
            :<><Btn small onClick={()=>startEdit(s)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn><DelBtn onConfirm={()=>delStock(s)}/></>}
          </div></td>}
        </tr>})}{filtered.length===0&&<tr><td colSpan={canEdit?7:6} style={{...TD,textAlign:"center",color:T.textMut,padding:20}}>لا توجد نتائج</td></tr>}</tbody>
      </table></div>})()}</Card>})()}
  </div>
}

/* ══ UNCUT PIECES REPORT ══ */
function UncutReport({data,isMob,season}){
  const ALL_COLS=[{key:"modelNo",label:"رقم الموديل",req:true},{key:"modelDesc",label:"الوصف"},{key:"sizeLabel",label:"المقاسات"},{key:"cutQty",label:"كمية القص"},{key:"rackCount",label:"عدد راقات"},{key:"linked",label:"تم قصها ✓"},{key:"piece",label:"لم يتم قصها ✕",req:true}];
  const[showColPk,setShowColPk]=useState(false);
  const[visCols,setVisCols]=useState(()=>{try{const s=localStorage.getItem("clark_uncut_cols");return s?JSON.parse(s):ALL_COLS.map(c=>c.key)}catch(e){return ALL_COLS.map(c=>c.key)}});
  const togCol=(key)=>{const c=ALL_COLS.find(x=>x.key===key);if(c?.req)return;setVisCols(p=>{const n=p.includes(key)?p.filter(k=>k!==key):[...p,key];try{localStorage.setItem("clark_uncut_cols",JSON.stringify(n))}catch(e){}return n})};
  const rows=[];
  data.orders.forEach(o=>{const pieces=o.orderPieces||[];if(pieces.length===0)return;
    const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
    const linked=pieces.filter(p=>linkedPieces.has(p));const unlinked=pieces.filter(p=>!linkedPieces.has(p));const t=calcOrder(o);
    const sizeCount=(o.sizeLabel||"").split(/[-\/]/).map(s=>s.trim()).filter(Boolean).length||1;
    const rackCount=sizeCount>0?Math.ceil(t.cutQty/sizeCount):t.cutQty;
    unlinked.forEach(p=>rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,sizeLabel:o.sizeLabel||"—",cutQty:t.cutQty,rackCount,piece:p,linked,id:o.id}))});
  const totalCutQty=rows.reduce((s,r)=>s+r.cutQty,0);
  const cols=ALL_COLS.filter(c=>visCols.includes(c.key));
  const printRep=()=>{const el=document.getElementById("uncut-rep");if(el)printPage("تقرير القطع غير المقصوصة — "+season,el.innerHTML)};
  const exportXls=()=>{const xRows=[cols.map(c=>c.label)];rows.forEach(r=>xRows.push(cols.map(c=>c.key==="linked"?r.linked.join("، "):c.key==="piece"?r.piece:r[c.key])));xRows.push([]);xRows.push(["الاجمالي",rows.length+" قطعة","","اجمالي القص: "+fmt(totalCutQty)]);exportExcel(xRows,"قطع_غير_مقصوصة_"+season)};
  const renderCell=(r,c)=>{if(c.key==="modelNo")return<td key={c.key} style={TDB}>{r.modelNo}</td>;if(c.key==="modelDesc")return<td key={c.key} style={TD}>{r.modelDesc}</td>;if(c.key==="sizeLabel")return<td key={c.key} style={TD}>{r.sizeLabel}</td>;if(c.key==="cutQty")return<td key={c.key} style={{...TDB,color:T.accent}}>{r.cutQty}</td>;if(c.key==="rackCount")return<td key={c.key} style={{...TDB,color:"#8B5CF6"}}>{r.rackCount}</td>;if(c.key==="linked")return<td key={c.key} style={{...TD,color:T.ok}}>{r.linked.map(p=>gIcon(p,data.garmentTypes)+" "+p).join("، ")||"—"}</td>;if(c.key==="piece")return<td key={c.key} style={{...TDB,color:T.err}}>{gIcon(r.piece,data.garmentTypes)+" "+r.piece}</td>;return<td key={c.key} style={TD}>{r[c.key]}</td>};
  return<div id="uncut-rep">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.err}}>✂️ قطع لم يتم قصها</h1><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season+" — "+rows.length+" قطعة — اجمالي القص: "+fmt(totalCutQty)}</div></div>
      <div style={{display:"flex",gap:6,alignItems:"center",position:"relative"}}>
        <div><Btn onClick={()=>setShowColPk(!showColPk)} style={{background:showColPk?T.accent+"15":T.bg,color:showColPk?T.accent:T.textSec,border:"1px solid "+(showColPk?T.accent+"30":T.brd),fontSize:FS-2}}>{"⚙️ الأعمدة ("+cols.length+")"}</Btn>
          {showColPk&&<div style={{position:"absolute",top:"100%",right:0,marginTop:4,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",zIndex:99,padding:8,minWidth:170}}>
            {ALL_COLS.map(c=><label key={c.key} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",cursor:c.req?"default":"pointer",borderRadius:6,background:visCols.includes(c.key)?T.ok+"06":"transparent"}}>
              <input type="checkbox" checked={visCols.includes(c.key)} onChange={()=>togCol(c.key)} disabled={c.req} style={{width:14,height:14}}/>
              <span style={{fontSize:FS-2,color:c.req?T.textMut:T.text,fontWeight:600}}>{c.label}{c.req?" ●":""}</span>
            </label>)}
          </div>}
        </div>
        <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
        <Btn onClick={exportXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}} title="تحليل المبيعات" title="تصدير اكسل">📊</Btn>
      </div>
    </div>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
      <thead><tr><th style={TH}>#</th>{cols.map(c=><th key={c.key} style={TH}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td>{cols.map(c=>renderCell(r,c))}</tr>)}
        <tr style={{background:T.accent+"10"}}><td style={{...TD,fontWeight:800}} colSpan={2}>الاجمالي</td>
          {cols.slice(1).map(c=><td key={c.key} style={{...TD,fontWeight:800,color:T.accent,textAlign:"center"}}>{c.key==="cutQty"?fmt(totalCutQty):c.key==="rackCount"?fmt(rows.reduce((s,r)=>s+r.rackCount,0)):""}</td>)}
        </tr>
      </tbody>
    </table></div>:<div style={{textAlign:"center",padding:40,color:T.ok,fontWeight:700,fontSize:FS+2}}>✓ جميع القطع تم قصها</div>}
  </div>
}

/* ══ REPORTS HUB ══ */
/* ══ EXPECTED DELIVERY DATES ══ */
function ExpectedDeliveries({data,isMob,season}){
  const workshops=data.workshops||[];
  /* Calculate avg days per workshop from historical data */
  const wsAvgDays={};
  data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
    const delDate=new Date(wd.date);
    (wd.receives||[]).forEach(r=>{
      const rcvDate=new Date(r.date);const days=Math.max(1,Math.floor((rcvDate-delDate)/(1000*60*60*24)));
      if(!wsAvgDays[wd.wsName])wsAvgDays[wd.wsName]={total:0,count:0};
      wsAvgDays[wd.wsName].total+=days;wsAvgDays[wd.wsName].count++
    })})});
  /* Pending deliveries */
  const pending=[];
  const today=new Date();
  data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach((wd,i)=>{
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    const bal=(Number(wd.qty)||0)-rcvd;
    if(bal<=0)return;
    const delDate=new Date(wd.date);
    const daysElapsed=Math.max(0,Math.floor((today-delDate)/(1000*60*60*24)));
    /* Expected days: use avg or default formula */
    const avg=wsAvgDays[wd.wsName];
    const expectedDays=avg&&avg.count>=2?Math.round(avg.total/avg.count):Math.max(5,Math.round(((Number(wd.qty)||0)/500)*6.5));
    const expectedDate=new Date(delDate);expectedDate.setDate(expectedDate.getDate()+expectedDays);
    const remaining=Math.max(0,Math.floor((expectedDate-today)/(1000*60*60*24)));
    const isLate=daysElapsed>expectedDays;
    pending.push({modelNo:o.modelNo,modelDesc:o.modelDesc,wsName:wd.wsName,garmentType:wd.garmentType||"",qty:wd.qty,bal,delDate:wd.date,daysElapsed,expectedDays,expectedDate:expectedDate.toISOString().split("T")[0],remaining,isLate})
  })});
  pending.sort((a,b)=>a.remaining-b.remaining);
  const printRep=()=>{const el=document.getElementById("exp-del");if(el)printPage("جدول التسليم المتوقع — "+season,el.innerHTML)};
  return<div id="exp-del">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>📅 مواعيد التسليم المتوقعة</h1><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season+" — "+pending.length+" تسليمة معلقة"}</div></div>
      <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    {/* Workshop avg days summary */}
    {Object.keys(wsAvgDays).length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
      {Object.entries(wsAvgDays).map(([name,v])=><div key={name} style={{padding:"8px 14px",borderRadius:8,background:T.cardSolid,border:"1px solid "+T.brd,textAlign:"center"}}>
        <div style={{fontSize:FS-2,color:T.textSec}}>{name}</div>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{Math.round(v.total/v.count)+" يوم"}</div>
        <div style={{fontSize:FS-3,color:T.textMut}}>{"("+v.count+" تسليمة)"}</div>
      </div>)}
    </div>}
    {pending.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
      <thead><tr>{["الموديل","الورشة","القطعة","الكمية","الرصيد","تاريخ التسليم","أيام مضت","المتوقع","المتبقي","الحالة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{pending.map((p,i)=><tr key={i} style={{background:p.isLate?T.err+"06":""}}>
        <td style={TDB}>{p.modelNo}</td>
        <td style={{...TD,color:"#8B5CF6",fontWeight:600}}>{p.wsName}</td>
        <td style={TD}>{p.garmentType||"—"}</td>
        <td style={TDB}>{p.qty}</td>
        <td style={{...TDB,color:T.err}}>{p.bal}</td>
        <td style={TD}>{p.delDate}</td>
        <td style={{...TDB,color:p.isLate?T.err:T.text}}>{p.daysElapsed}</td>
        <td style={TDB}>{p.expectedDays+" يوم"}</td>
        <td style={{...TDB,color:p.isLate?T.err:T.ok}}>{p.isLate?"متأخر "+(p.daysElapsed-p.expectedDays)+" يوم":p.remaining+" يوم"}</td>
        <td style={TD}>{p.isLate?<span style={{padding:"2px 8px",borderRadius:6,background:T.err+"12",color:T.err,fontWeight:700,fontSize:FS-2}}>متأخر</span>:<span style={{padding:"2px 8px",borderRadius:6,background:T.ok+"12",color:T.ok,fontWeight:700,fontSize:FS-2}}>في الموعد</span>}</td>
      </tr>)}</tbody>
    </table></div>:<div style={{textAlign:"center",padding:40,color:T.ok,fontWeight:700,fontSize:FS+2}}>✓ لا توجد تسليمات معلقة</div>}
  </div>
}

/* ══ AVAILABLE FOR DELIVERY REPORT ══ */
function AvailableReport({data,isMob,season}){
  const rows=[];
  data.orders.forEach(o=>{
    const t=calcOrder(o);const pieces=o.orderPieces||[];const wds=o.workshopDeliveries||[];
    /* Find linked pieces */
    const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
    if(pieces.length>0){
      pieces.forEach(p=>{
        if(!linkedPieces.has(p))return;/* not cut yet */
        const delForP=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);
        const avail=t.cutQty-delForP;
        if(avail>0)rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,piece:p,cutQty:t.cutQty,delivered:delForP,available:avail,status:o.status,orderId:o.id})
      })
    }else{
      const totalDel=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);
      const avail=t.cutQty-totalDel;
      if(avail>0&&t.cutQty>0)rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,piece:"—",cutQty:t.cutQty,delivered:totalDel,available:avail,status:o.status,orderId:o.id})
    }
  });
  rows.sort((a,b)=>b.available-a.available);
  const totalAvail=rows.reduce((s,r)=>s+r.available,0);
  const printRep=()=>{
    let h="<div style='margin-bottom:16px;text-align:center'><h2 style='margin:0;font-size:18px;color:#0284C7'>📤 تقرير القطع المتاحة للتسليم</h2><p style='margin:4px 0;font-size:13px;color:#64748B'>"+rows.length+" بند — "+fmt(totalAvail)+" قطعة متاحة</p></div>";
    h+="<table><thead><tr><th>#</th><th>رقم الموديل</th><th>الوصف</th><th>القطعة</th><th>كمية القص</th><th>تسليم عملاء</th><th>متاح للتسليم</th></tr></thead><tbody>";
    rows.forEach((r,i)=>{h+="<tr><td>"+(i+1)+"</td><td style='font-weight:700'>"+r.modelNo+"</td><td>"+r.modelDesc+"</td><td style='color:#8B5CF6;font-weight:700'>"+r.piece+"</td><td style='font-weight:700'>"+r.cutQty+"</td><td style='color:#F59E0B;font-weight:700'>"+r.delivered+"</td><td style='color:#10B981;font-weight:800;font-size:14px'>"+r.available+"</td></tr>"});
    h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='4'>الاجمالي</td><td>"+fmt(rows.reduce((s,r)=>s+r.cutQty,0))+"</td><td>"+fmt(rows.reduce((s,r)=>s+r.delivered,0))+"</td><td style='color:#10B981;font-size:16px'>"+fmt(totalAvail)+"</td></tr>";
    h+="</tbody></table>";
    h+="<div style='margin-top:20px;padding:12px;border:2px solid #E2E8F0;border-radius:8px;text-align:center;font-size:11px;color:#94A3B8'>تم الطباعة في "+new Date().toLocaleDateString("ar-EG")+" — CLARK Factory Management</div>";
    printPage("القطع المتاحة للتسليم — "+season,h)
  };
  return<div id="avail-rep">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>📤 القطع المتاحة للتسليم</h1><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season+" — "+rows.length+" بند — "+fmt(totalAvail)+" قطعة متاحة"}</div></div>
      <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
      <thead><tr>{["#","الموديل","الوصف","القطعة","كمية القص","تم تسليمه","متاح للتسليم"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i}>
        <td style={TD}>{i+1}</td>
        <td style={TDB}>{r.modelNo}</td>
        <td style={TD}>{r.modelDesc}</td>
        <td style={{...TD,color:"#8B5CF6",fontWeight:600}}>{r.piece}</td>
        <td style={TDB}>{r.cutQty}</td>
        <td style={{...TDB,color:T.warn}}>{r.delivered}</td>
        <td style={{...TDB,color:T.ok,fontSize:FS+1}}>{r.available}</td>
      </tr>)}
      <tr style={{background:T.accent+"08",fontWeight:800}}><td colSpan={4} style={TD}>الاجمالي</td><td style={TDB}>{fmt(rows.reduce((s,r)=>s+r.cutQty,0))}</td><td style={TDB}>{fmt(rows.reduce((s,r)=>s+r.delivered,0))}</td><td style={{...TDB,color:T.ok,fontSize:FS+2}}>{fmt(totalAvail)}</td></tr>
      </tbody>
    </table></div>:<div style={{textAlign:"center",padding:40,color:T.ok,fontWeight:700,fontSize:FS+2}}>✓ لا توجد قطع متاحة — تم تسليم كل شيء</div>}
  </div>
}

function FloorStockReport({data,isMob,season}){
  const orders=data.orders||[];const[filter,setFilter]=useState("");const[pieceFilter,setPieceFilter]=useState("");
  const rows=[];const allPieces=new Set();
  orders.forEach(o=>{const t=calcOrder(o);if(t.cutQty===0)return;const pieces=o.orderPieces||[];const wds=o.workshopDeliveries||[];
    if(pieces.length>0){const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
      pieces.forEach(p=>{allPieces.add(p);const isCut=linkedPieces.has(p);if(!isCut)return;const del=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const floor=t.cutQty-del;
        if(floor>0){const days=Math.floor((Date.now()-new Date(o.date))/(86400000));rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:p,cut:t.cutQty,del,floor,days})}})}
    else{allPieces.add("عام");const del=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const floor=t.cutQty-del;
      if(floor>0){const days=Math.floor((Date.now()-new Date(o.date))/(86400000));rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:"عام",cut:t.cutQty,del,floor,days})}}});
  rows.sort((a,b)=>b.floor-a.floor);
  const filtered=rows.filter(r=>{if(filter&&!r.modelNo.includes(filter)&&!(r.desc||"").toLowerCase().includes(filter.toLowerCase()))return false;if(pieceFilter&&r.piece!==pieceFilter)return false;return true});
  const totalFloor=filtered.reduce((s,r)=>s+r.floor,0);
  const printFloor=()=>{let h="<h2 style='text-align:center'>\u{1F3ED} \u0642\u0637\u0639 \u0639\u0644\u0649 \u0627\u0644\u0623\u0631\u0636 \u2014 "+season+"</h2>";
    h+="<table><thead><tr><th>\u0627\u0644\u0645\u0648\u062f\u064a\u0644</th><th>\u0627\u0644\u0648\u0635\u0641</th><th>\u0627\u0644\u0642\u0637\u0639\u0629</th><th>\u0627\u0644\u0642\u0635</th><th>\u0645\u0633\u0644\u0651\u0645</th><th>\u0627\u0644\u0623\u0631\u0636</th><th>\u0627\u0644\u0623\u064a\u0627\u0645</th></tr></thead><tbody>";
    filtered.forEach(r=>{h+="<tr><td style='font-weight:800'>"+r.modelNo+"</td><td>"+r.desc+"</td><td>"+r.piece+"</td><td style='text-align:center'>"+r.cut+"</td><td style='text-align:center'>"+r.del+"</td><td style='text-align:center;font-weight:800;color:#F59E0B'>"+r.floor+"</td><td style='text-align:center'>"+r.days+"</td></tr>"});
    h+="</tbody></table>";printPage("\u0642\u0637\u0639 \u0639\u0644\u0649 \u0627\u0644\u0623\u0631\u0636",h)};
  return<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      <div style={{flex:1,minWidth:150}}><Inp value={filter} onChange={setFilter} placeholder="\u0628\u062d\u062b \u0628\u0627\u0644\u0645\u0648\u062f\u064a\u0644..."/></div>
      <Sel value={pieceFilter} onChange={setPieceFilter}><option value="">\u0643\u0644 \u0627\u0644\u0642\u0637\u0639</option>{[...allPieces].sort().map(p=><option key={p} value={p}>{p}</option>)}</Sel>
      <Btn onClick={printFloor} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>\ud83d\udda8</Btn>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
      <div style={{padding:10,borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>\u0639\u0644\u0649 \u0627\u0644\u0623\u0631\u0636</div><div style={{fontSize:18,fontWeight:800,color:"#F59E0B"}}>{totalFloor}</div></div>
      <div style={{padding:10,borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>\u0645\u0648\u062f\u064a\u0644\u0627\u062a</div><div style={{fontSize:18,fontWeight:800,color:T.accent}}>{[...new Set(filtered.map(r=>r.modelNo))].length}</div></div>
      <div style={{padding:10,borderRadius:10,background:"#EF444408",border:"1px solid #EF444415",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{"> 7 \u0623\u064a\u0627\u0645"}</div><div style={{fontSize:18,fontWeight:800,color:"#EF4444"}}>{filtered.filter(r=>r.days>7).length}</div></div>
    </div>
    {filtered.length===0?<div style={{textAlign:"center",padding:30,color:T.textMut}}>\u2705 \u0644\u0627 \u062a\u0648\u062c\u062f \u0642\u0637\u0639</div>:
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["\u0627\u0644\u0645\u0648\u062f\u064a\u0644","\u0627\u0644\u0648\u0635\u0641","\u0627\u0644\u0642\u0637\u0639\u0629","\u0627\u0644\u0642\u0635","\u0645\u0633\u0644\u0651\u0645","\u0627\u0644\u0623\u0631\u0636","\u0623\u064a\u0627\u0645"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{filtered.map((r,i)=><tr key={i} style={{background:r.days>7?"#FEF2F2":"transparent"}}><td style={{...TD,fontWeight:800,color:T.accent}}>{r.modelNo}</td><td style={TD}>{r.desc}</td><td style={{...TD,color:"#8B5CF6"}}>{r.piece}</td><td style={TDB}>{r.cut}</td><td style={{...TDB,color:T.ok}}>{r.del}</td><td style={{...TDB,fontWeight:800,color:"#F59E0B"}}>{r.floor}</td><td style={{...TDB,color:r.days>7?"#EF4444":T.textMut}}>{r.days}</td></tr>)}
      </tbody></table></div>}
  </div>
}
function ReportsHub({data,isMob,season,statusCards}){
  const[sub,setSub]=useState(null);
  const reports=[
    {key:"production",label:"تقرير الانتاج",icon:"📈",color:"#06B6D4"},
    {key:"cost",label:"التكاليف",icon:"💰",color:"#EC4899"},
    {key:"fabrics",label:"الخامات المستهلكة",icon:"🧵",color:"#8B5CF6"},
    {key:"wsPerf",label:"انتاجية الورش",icon:"⚡",color:"#F59E0B"},
    {key:"delivery",label:"معدل التسليم",icon:"📦",color:"#10B981"},
    {key:"summary",label:"ملخص الموسم",icon:"📋",color:"#0EA5E9"},
    {key:"uncut",label:"قطع لم يتم قصها",icon:"✂️",color:"#EF4444"},
    {key:"expected",label:"مواعيد التسليم المتوقعة",icon:"📅",color:"#F97316"},
    {key:"available",label:"القطع المتاحة للتسليم",icon:"📤",color:"#059669"},
    {key:"floor",label:"قطع على الأرض",icon:"🏭",color:"#F59E0B"},
  ];
  if(sub==="floor")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><FloorStockReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="available")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><AvailableReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="expected")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><ExpectedDeliveries data={data} isMob={isMob} season={season}/></div>;
  if(sub==="uncut")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><UncutReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="production")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><RepPg data={data} isMob={isMob} season={season} statusCards={statusCards}/></div>;
  if(sub==="cost")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><CostPg data={data} isMob={isMob} statusCards={statusCards}/></div>;
  if(sub==="fabrics")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><FabricReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="wsPerf")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><WsPerfReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="delivery")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><DeliveryReport data={data} isMob={isMob} season={season}/></div>;
  if(sub==="summary")return<div><Btn ghost onClick={()=>setSub(null)} style={{marginBottom:10}}>↩ التقارير</Btn><SeasonSummary data={data} isMob={isMob} season={season} statusCards={statusCards}/></div>;
  return<div>
    <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(3,1fr)",gap:12}}>
      {reports.map(r=><div key={r.key} onClick={()=>setSub(r.key)} style={{background:T.cardSolid,borderRadius:14,padding:isMob?16:20,border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"transform 0.15s"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}>
        <div style={{width:44,height:44,borderRadius:12,background:r.color+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{r.icon}</div>
        <div style={{fontSize:FS,fontWeight:700,color:T.text}}>{r.label}</div>
      </div>)}
    </div>
  </div>
}

/* ══ FABRIC CONSUMPTION REPORT ══ */
function FabricReport({data,isMob,season}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const fabMap={};
  data.orders.forEach(o=>{FKEYS.forEach(k=>{if(!gf(o,k))return;const name=gf(o,k,"Label")?.split(" - ")[0]||"";const unit=gf(o,k,"Unit")||"";const cons=gcons(o,k);const layers=slay(gc(o,k));const totalCons=r2(cons*layers);const price=gf(o,k,"Price")||0;const cost=r2(totalCons*price);
    const key=name+"|"+unit;if(!fabMap[key])fabMap[key]={name,unit,totalCons:0,totalCost:0,orders:0,price};fabMap[key].totalCons+=totalCons;fabMap[key].totalCost+=cost;fabMap[key].orders++})});
  const fabList=Object.values(fabMap).sort((a,b)=>b.totalCost-a.totalCost);
  const totalFabCost=fabList.reduce((s,f)=>s+f.totalCost,0);
  const printFab=()=>{const el=document.getElementById("fab-rep");if(!el)return;printPage("تقرير الخامات المستهلكة — "+season,el.innerHTML)};
  const exportFabXls=()=>{const rows=[["الخامة","الوحدة","اجمالي الاستهلاك","السعر","اجمالي التكلفة","عدد الموديلات"]];fabList.forEach(f=>{rows.push([f.name,f.unit,f.totalCons,f.price,r2(f.totalCost),f.orders])});rows.push([]);rows.push(["اجمالي","","","",r2(totalFabCost),""]);exportExcel(rows,"تقرير_الخامات_"+season)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={exportFabXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
      <Btn onClick={printFab} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    <div id="fab-rep">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير الخامات المستهلكة</h1>
      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{fabList.length+" خامة | الموسم "+season+" | "+today}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>عدد الخامات</div><b style={{fontSize:18,fontWeight:800,color:T.accent}}>{fabList.length}</b></div>
        <div style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>اجمالي التكلفة</div><b style={{fontSize:18,fontWeight:800,color:T.err}}>{fmt(r2(totalFabCost))+" ج.م"}</b></div>
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["#","الخامة","الوحدة","اجمالي الاستهلاك","سعر الوحدة","اجمالي التكلفة","عدد الموديلات","% من الاجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{fabList.map((f,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={{...TDB,color:T.accent}}>{f.name}</td><td style={TD}>{f.unit}</td><td style={TDB}>{f.totalCons}</td><td style={TD}>{f.price+" ج.م"}</td><td style={{...TDB,color:T.err}}>{fmt(r2(f.totalCost))+" ج.م"}</td><td style={TDB}>{f.orders}</td><td style={TDB}>{totalFabCost?Math.round(f.totalCost/totalFabCost*100)+"%":"0%"}</td></tr>)}
          {fabList.length>0&&<tr style={{background:T.accent+"08"}}><td colSpan={5} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TDB,fontWeight:800,color:T.err}}>{fmt(r2(totalFabCost))+" ج.م"}</td><td colSpan={2} style={TD}></td></tr>}
        </tbody>
      </table></div>
    </div>
  </div>
}

/* ══ WORKSHOP PRODUCTIVITY REPORT ══ */
function WsPerfReport({data,isMob,season}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const wsMap={};
  data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{
    if(!wsMap[wd.wsName])wsMap[wd.wsName]={name:wd.wsName,totalDel:0,totalRcv:0,orders:new Set(),avgDays:[],pieces:{}};
    wsMap[wd.wsName].totalDel+=(Number(wd.qty)||0);wsMap[wd.wsName].orders.add(o.modelNo);
    if(wd.garmentType){if(!wsMap[wd.wsName].pieces[wd.garmentType])wsMap[wd.wsName].pieces[wd.garmentType]=0;wsMap[wd.wsName].pieces[wd.garmentType]+=(Number(wd.qty)||0)}
    (wd.receives||[]).forEach(r=>{wsMap[wd.wsName].totalRcv+=(Number(r.qty)||0);
      const d1=new Date(wd.date),d2=new Date(r.date);const diff=Math.max(0,Math.floor((d2-d1)/(1000*60*60*24)));wsMap[wd.wsName].avgDays.push(diff)})
  })});
  const wsList=Object.values(wsMap).map(w=>({...w,orders:w.orders.size,avg:w.avgDays.length?Math.round(w.avgDays.reduce((a,b)=>a+b,0)/w.avgDays.length):0,completion:w.totalDel?Math.round(w.totalRcv/w.totalDel*100):0})).sort((a,b)=>b.totalRcv-a.totalRcv);
  const printWsPerf=()=>{const el=document.getElementById("ws-perf");if(!el)return;printPage("تقرير انتاجية الورش — "+season,el.innerHTML)};
  const exportWsPerfXls=()=>{const rows=[["الورشة","عدد الموديلات","تسليم ورشة","استلام مصنع","نسبة الانجاز","متوسط أيام التسليم"]];wsList.forEach(w=>{rows.push([w.name,w.orders,w.totalDel,w.totalRcv,w.completion+"%",w.avg+" يوم"])});exportExcel(rows,"انتاجية_الورش_"+season)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={exportWsPerfXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
      <Btn onClick={printWsPerf} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    <div id="ws-perf">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير انتاجية الورش</h1>
      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{wsList.length+" ورشة | الموسم "+season+" | "+today}</div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["#","الورشة","الموديلات","تسليم ورشة","استلام مصنع","الانجاز","متوسط الأيام","القطع"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsList.map((w,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={{...TDB,color:T.accent}}>{w.name}</td><td style={TDB}>{w.orders}</td><td style={{...TDB,color:"#8B5CF6"}}>{w.totalDel}</td><td style={{...TDB,color:T.ok}}>{w.totalRcv}</td>
          <td style={TDB}><span style={{padding:"2px 8px",borderRadius:6,background:w.completion>=80?T.ok+"12":w.completion>=50?T.warn+"12":T.err+"12",color:w.completion>=80?T.ok:w.completion>=50?T.warn:T.err,fontWeight:700}}>{w.completion+"%"}</span></td>
          <td style={TDB}><span style={{padding:"2px 8px",borderRadius:6,background:w.avg<=7?T.ok+"12":w.avg<=14?T.warn+"12":T.err+"12",color:w.avg<=7?T.ok:w.avg<=14?T.warn:T.err,fontWeight:700}}>{w.avg+" يوم"}</span></td>
          <td style={TD}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{Object.entries(w.pieces).map(([p,q])=><span key={p} style={{fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:T.purple+"10",color:T.purple,fontWeight:600}}>{p+": "+q}</span>)}</div></td>
        </tr>)}
        </tbody>
      </table></div>
      {wsList.length>0&&<div style={{marginTop:14}}><ResponsiveContainer width="100%" height={220}>
        <BarChart data={wsList} margin={{top:10,right:10,bottom:5}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false}/><XAxis dataKey="name" tick={{fontSize:11}} interval={0}/><YAxis tick={{fontSize:11}}/><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
          <Bar dataKey="totalDel" name="تسليم ورشة" fill="#8B5CF6" barSize={isMob?14:20} radius={[4,4,0,0]}/>
          <Bar dataKey="totalRcv" name="استلام مصنع" fill="#10B981" barSize={isMob?14:20} radius={[4,4,0,0]}/>
          <Legend wrapperStyle={{fontSize:11}}/>
        </BarChart>
      </ResponsiveContainer></div>}
    </div>
  </div>
}

/* ══ DELIVERY RATE REPORT ══ */
function DeliveryReport({data,isMob,season}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const dayMap={};
  data.orders.forEach(o=>{(o.deliveries||[]).forEach(d=>{if(!dayMap[d.date])dayMap[d.date]={date:d.date,qty:0,orders:0};dayMap[d.date].qty+=(Number(d.qty)||0);dayMap[d.date].orders++});
    (o.workshopDeliveries||[]).forEach(wd=>{(wd.receives||[]).forEach(r=>{const k=r.date;if(!dayMap[k])dayMap[k]={date:k,qty:0,orders:0}})})});
  /* Workshop deliveries per day */
  const wsDay={};data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wsDay[wd.date])wsDay[wd.date]={date:wd.date,qty:0};wsDay[wd.date].qty+=(Number(wd.qty)||0)})});
  /* Cumulative stock delivery */
  const stockDays=Object.values(dayMap).filter(d=>d.qty>0).sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  let cum=0;const cumData=stockDays.map(d=>{cum+=d.qty;return{date:d.date,qty:d.qty,cumulative:cum}});
  const totalCut=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalDel=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);
  const printDel=()=>{const el=document.getElementById("del-rep");if(!el)return;printPage("تقرير معدل التسليم — "+season,el.innerHTML)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={printDel} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    <div id="del-rep">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير معدل التسليم</h1>
      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{"الموسم "+season+" | "+today}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[["كمية القص",fmt(totalCut),T.accent],["تسليم مخزن",fmt(totalDel),T.ok],["الرصيد",fmt(totalCut-totalDel),T.warn],["نسبة التسليم",(totalCut?Math.round(totalDel/totalCut*100):0)+"%",totalDel>=totalCut?T.ok:T.err]].map(([l,v,c],i)=>
          <div key={i} style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div><b style={{fontSize:18,fontWeight:800,color:c}}>{v}</b></div>)}
      </div>
      {cumData.length>0&&<Card title="التسليم التراكمي" style={{marginBottom:14}}><ResponsiveContainer width="100%" height={220}>
        <BarChart data={cumData} margin={{top:10,right:10,bottom:5}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false}/><XAxis dataKey="date" tick={{fontSize:10}} interval={0} angle={isMob?-45:0} textAnchor={isMob?"end":"middle"} height={isMob?50:30}/><YAxis tick={{fontSize:11}}/>
          <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
          <Bar dataKey="qty" name="تسليم يومي" fill="#10B981" barSize={isMob?14:24} radius={[4,4,0,0]}/>
        </BarChart>
      </ResponsiveContainer></Card>}
      {stockDays.length>0&&<Card title="سجل التسليمات"><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["#","التاريخ","الكمية","تراكمي","النسبة من القص"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{cumData.map((d,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={TD}>{d.date}</td><td style={{...TDB,color:T.ok}}>{d.qty}</td><td style={TDB}>{d.cumulative}</td><td style={TDB}>{totalCut?Math.round(d.cumulative/totalCut*100)+"%":"0%"}</td></tr>)}</tbody>
      </table></div></Card>}
    </div>
  </div>
}

/* ══ SEASON SUMMARY ══ */
function SeasonSummary({data,isMob,season,statusCards}){
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const totalCut=data.orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalDel=data.orders.reduce((s,o)=>s+(o.deliveredQty||0),0);const totalCost=data.orders.reduce((s,o)=>s+calcOrder(o).costAll,0);
  const sc={};data.orders.forEach(o=>{sc[o.status]=(sc[o.status]||0)+1});
  const wsMap={};data.orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wsMap[wd.wsName])wsMap[wd.wsName]={del:0,rcv:0};wsMap[wd.wsName].del+=(Number(wd.qty)||0);(wd.receives||[]).forEach(r=>{wsMap[wd.wsName].rcv+=(Number(r.qty)||0)})})});
  const printSum=()=>{const el=document.getElementById("sum-rep");if(!el)return;printPage("ملخص الموسم — "+season,el.innerHTML)};
  const exportSumXls=()=>{const rows=[["ملخص الموسم - "+season,""],["",""],["البيان","القيمة"],["عدد الموديلات",data.orders.length],["اجمالي القص",totalCut],["تسليم مخزن جاهز",totalDel],["الرصيد",totalCut-totalDel],["نسبة الانجاز",(totalCut?Math.round(totalDel/totalCut*100):0)+"%"],["اجمالي التكاليف",r2(totalCost)],["متوسط تكلفة القطعة",totalCut?r2(totalCost/totalCut):0],["",""],["حالات الأوردرات",""]];Object.entries(sc).forEach(([k,v])=>{rows.push([k,v])});rows.push(["",""],["أداء الورش",""],["الورشة","تسليم","استلام"]);Object.entries(wsMap).forEach(([n,v])=>{rows.push([n,v.del,v.rcv])});exportExcel(rows,"ملخص_الموسم_"+season)};
  return<div>
    <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginBottom:10}}>
      <Btn onClick={exportSumXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
      <Btn onClick={printSum} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
    </div>
    <div id="sum-rep">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>ملخص الموسم</h1>
      <div style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{season+" | "+data.orders.length+" موديل | "+today}</div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:14}}>
        {[[data.orders.length,"الموديلات",T.accent],[fmt(totalCut),"كمية القص","#8B5CF6"],[fmt(totalDel),"مخزن جاهز",T.ok],[fmt(totalCut-totalDel),"الرصيد",T.warn],[(totalCut?Math.round(totalDel/totalCut*100):0)+"%","الانجاز",T.ok],[fmt(r2(totalCost))+" ج","اجمالي التكاليف",T.err],[totalCut?r2(totalCost/totalCut)+" ج":"0","متوسط/قطعة","#8B5CF6"],[Object.keys(wsMap).length,"الورش الفعالة",T.purple]].map(([v,l,c],i)=>
          <div key={i} style={{padding:"10px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div><b style={{fontSize:18,fontWeight:800,color:c}}>{v}</b></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14}}>
        <Card title="توزيع الحالات">
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.entries(sc).map(([k,v])=>{const col=getStatusColor(k,statusCards);return<span key={k} style={{padding:"4px 12px",borderRadius:8,background:col+"12",color:col,fontWeight:700,fontSize:FS}}>{k+": "+v}</span>})}</div>
        </Card>
        <Card title="أداء الورش">
          <div style={{display:"flex",flexDirection:"column",gap:6}}>{Object.entries(wsMap).sort((a,b)=>b[1].rcv-a[1].rcv).map(([n,v])=>{const pct=v.del?Math.round(v.rcv/v.del*100):0;return<div key={n} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:T.bg}}>
            <span style={{fontWeight:700,fontSize:FS}}>{n}</span>
            <div style={{display:"flex",gap:6,fontSize:FS-2}}><span style={{color:"#8B5CF6"}}>{"↗"+v.del}</span><span style={{color:T.ok}}>{"↙"+v.rcv}</span><span style={{padding:"1px 6px",borderRadius:4,background:pct>=80?T.ok+"12":T.warn+"12",color:pct>=80?T.ok:T.warn,fontWeight:700}}>{pct+"%"}</span></div>
          </div>})}</div>
        </Card>
      </div>
    </div>
  </div>
}

function RepPg({data,isMob,season,statusCards}){
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const list=sortOrders(data.orders);
  const cutQ=list.reduce((s,o)=>s+calcOrder(o).cutQty,0);
  const delQ=list.reduce((s,o)=>s+(o.deliveredQty||0),0);
  const comp=cutQ?Math.round((delQ/cutQ)*100):0;
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const fabName=(o,k)=>{const l=gf(o,k,"Label");return l?l.split(" - ")[0]:null};
  const activeFabs=(o)=>FKEYS.filter(k=>gf(o,k)&&gc(o,k).length>0);
  const printRep=()=>{const el=document.getElementById("rep-area");if(!el)return;printPage("تقرير الانتاج — "+season,el.innerHTML)};
  const exportRepXls=()=>{const rows=[["#","الموديل","الوصف","الخامات","القطع","كمية القص","مخزن جاهز","الرصيد","الحالة"]];
    list.forEach((o,i)=>{const c=calcOrder(o);const aF=activeFabs(o).map(k=>fabName(o,k)).filter(Boolean).join("، ");const pcs=(o.orderPieces||[]).join("، ");rows.push([i+1,o.modelNo,o.modelDesc,aF,pcs,c.cutQty,o.deliveredQty||0,c.balance,o.status])});
    rows.push([]);rows.push(["","","","","اجمالي",cutQ,delQ,cutQ-delQ,comp+"%"]);exportExcel(rows,"تقرير_الانتاج_"+season)};

  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
      <div><div style={{fontSize:FS,color:T.textSec}}>{today}</div></div>
      <div style={{display:"flex",gap:6}}>
        <Btn onClick={exportRepXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
        <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
      </div>
    </div>
    <div id="rep-area">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير قص وانتاج المصنع</h1>
      <div className="sub" style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{"الموسم: "+season+" | "+list.length+" موديل | "+today}</div>
      {(()=>{const inProd=list.filter(o=>o.status==="في التشغيل").length;const finishing=list.filter(o=>o.status==="تشطيب وتعبئة").length;const shipped=list.filter(o=>o.status==="تم الشحن").length;const balance=cutQ-delQ;
        return<div style={{display:"grid",gridTemplateColumns:isMob?"repeat(3,1fr)":"repeat(5,1fr)",gap:8,marginBottom:14}}>
          {[["عدد الموديلات",list.length,"📋",T.accent],["تسليم مخزن",fmt(delQ),"📦",T.ok],["تشطيب وتعبئة",finishing,"🏭","#8B5CF6"],["في التشغيل",inProd,"⚡","#F59E0B"],["رصيد المصنع",fmt(balance),"📊",balance>0?T.err:T.ok]].map(([l,v,ic,c],i)=>
            <div key={i} style={{padding:"10px 8px",borderRadius:10,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:16,marginBottom:2}}>{ic}</div><div style={{fontSize:FS+4,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div></div>)}
        </div>})()}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
        <thead><tr>{["#","الموديل","الوصف","الخامات","القطع","كمية القص","مخزن","رصيد","الورش","الحالة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{list.map((o,i)=>{const c=calcOrder(o);const aFabs=activeFabs(o);const wds=o.workshopDeliveries||[];const pieces=o.orderPieces||[];
          return<tr key={o.id}>
          <td style={TD}>{i+1}</td><td style={TDB}>{o.modelNo}</td><td style={{...TD,maxWidth:120}}>{o.modelDesc}</td>
          <td style={TD}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{aFabs.map(k=><span key={k} className="fab" style={{display:"inline-block",padding:"1px 6px",borderRadius:4,fontSize:FS-3,fontWeight:600,background:FCOL[FKEYS.indexOf(k)]+"18",color:FCOL[FKEYS.indexOf(k)]}}>{fabName(o,k)}</span>)}</div></td>
          <td style={TD}>{pieces.length>0?<div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{pieces.map(p=><span key={p} style={{fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:T.purple+"10",color:T.purple,fontWeight:600}}>{p}</span>)}</div>:"-"}</td>
          <td style={{...TDB,color:T.accent}}>{c.cutQty}</td><td style={TDB}>{o.deliveredQty||0}</td>
          <td style={{...TDB,color:c.balance>0?T.warn:T.ok}}>{c.balance}</td>
          <td style={TD}>{wds.length>0?<div style={{display:"flex",gap:2,flexWrap:"wrap"}}>{[...new Set(wds.map(wd=>wd.wsName))].map(n=><span key={n} className="ws" style={{fontSize:FS-3,padding:"1px 5px",borderRadius:4,background:T.ok+"10",color:T.ok,fontWeight:600}}>{n}</span>)}</div>:"-"}</td>
          <td style={TD}><Badge t={o.status} cards={statusCards}/></td></tr>})}
          {list.length===0&&<tr><td colSpan={10} style={{...TD,textAlign:"center",color:T.textSec,padding:30}}>لا توجد بيانات</td></tr>}
        </tbody>
      </table></div>
    </div>
  </div>
}

/* ══ COST ══ */
function CostPg({data,isMob,statusCards}){
  const[cDateFrom,setCDateFrom]=useState("");const[cDateTo,setCDateTo]=useState("");
  const orders=sortOrders(data.orders.filter(o=>{if(cDateFrom&&o.date<cDateFrom)return false;if(cDateTo&&o.date>cDateTo)return false;return true}));const totalCut=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);const totalCost=orders.reduce((s,o)=>s+calcOrder(o).costAll,0);const totalFab=orders.reduce((s,o)=>s+calcOrder(o).totalFab,0);const totalAcc=orders.reduce((s,o)=>s+calcOrder(o).accAll,0);
  const fabName=(o,k)=>{const l=gf(o,k,"Label");return l?l.split(" - ")[0]:null};
  const today=new Date().toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const printCost=()=>{const el=document.getElementById("cost-area");if(!el)return;printPage("تقرير التكاليف",el.innerHTML)};
  const exportCostXls=()=>{const rows=[["#","الموديل","الوصف","الخامات","الكمية","خامات/قطعة","اكسسوار/قطعة","تكلفة القطعة","اجمالي"]];
    orders.forEach((o,i)=>{const c=calcOrder(o);const aFabs=FKEYS.filter(k=>gf(o,k)&&gc(o,k).length>0).map(k=>fabName(o,k)).filter(Boolean).join("، ");rows.push([i+1,o.modelNo,o.modelDesc,aFabs,c.cutQty,c.fabPer,c.accPer,c.costPer,c.costAll])});
    rows.push([]);rows.push(["","","","اجمالي",totalCut,r2(totalFab),r2(totalAcc),"",r2(totalCost)]);exportExcel(rows,"تقرير_التكاليف")};
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:6,alignItems:"center"}}>
      <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:FS-2,color:T.textSec}}>فترة:</span>
        <Inp type="date" value={cDateFrom} onChange={setCDateFrom} style={{width:120,fontSize:FS-2}}/>
        <Inp type="date" value={cDateTo} onChange={setCDateTo} style={{width:120,fontSize:FS-2}}/>
        {(cDateFrom||cDateTo)&&<Btn ghost small onClick={()=>{setCDateFrom("");setCDateTo("")}} title="إغلاق">✕</Btn>}
      </div>
      <div style={{display:"flex",gap:6}}>
        <Btn onClick={exportCostXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
        <Btn onClick={printCost} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>
      </div>
    </div>
    <div id="cost-area">
      <h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>تقرير التكاليف</h1>
      <div className="sub" style={{fontSize:FS-1,color:T.textSec,marginBottom:12}}>{orders.length+" موديل | "+today}</div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {[[orders.length,"الموديلات",T.accent],[fmt(totalCut),"اجمالي القص",T.ok],[fmt(r2(totalFab))+" ج","تكلفة الخامات",T.warn],[fmt(r2(totalAcc))+" ج","تكلفة الاكسسوار",T.purple],[fmt(r2(totalCost))+" ج","اجمالي التكاليف",T.err],[totalCut?(r2(totalCost/totalCut))+" ج":"0","متوسط/قطعة","#8B5CF6"]].map(([v,l,c],i)=>
          <div key={i} className="mc" style={{padding:"8px 14px",borderRadius:8,border:"1px solid "+T.brd,background:T.cardSolid,textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{l}</div><b style={{fontSize:16,fontWeight:800,color:c}}>{v}</b></div>)}
      </div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:650}}>
        <thead><tr>{["#","الموديل","الوصف","الخامات","كمية","خامات/قطعة","اكسسوار/قطعة","تكلفة القطعة","اجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{orders.map((o,i)=>{const c=calcOrder(o);const aFabs=FKEYS.filter(k=>gf(o,k)&&gc(o,k).length>0);
          return<tr key={o.id}>
          <td style={TD}>{i+1}</td><td style={TDB}>{o.modelNo}</td><td style={{...TD,maxWidth:100}}>{o.modelDesc}</td>
          <td style={TD}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{aFabs.map(k=>{const cost=gcons(o,k)*(gf(o,k,"Price")||0)*slay(gc(o,k));const perPc=c.cutQty?r2(cost/c.cutQty):0;
            return<span key={k} className="fab" style={{display:"inline-block",padding:"2px 6px",borderRadius:4,fontSize:FS-3,fontWeight:600,background:FCOL[FKEYS.indexOf(k)]+"15",color:FCOL[FKEYS.indexOf(k)]}}>{fabName(o,k)+" "+perPc+"ج"}</span>})}{aFabs.length===0&&"-"}</div></td>
          <td style={{...TDB,color:T.accent}}>{c.cutQty}</td>
          <td style={TDB}>{c.fabPer+" ج.م"}</td>
          <td style={TDB}>{c.accPer+" ج.م"}</td>
          <td style={{...TDB,color:T.accent,fontSize:FS+1}}>{c.costPer+" ج.م"}</td>
          <td style={{...TDB,color:T.err}}>{fmt(c.costAll)+" ج.م"}</td></tr>})}
          {orders.length>0&&<tr className="tot" style={{background:T.accent+"08"}}><td colSpan={4} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TDB,fontWeight:800}}>{fmt(totalCut)}</td><td style={{...TDB,fontWeight:800}}>{fmt(r2(totalFab))}</td><td style={{...TDB,fontWeight:800}}>{fmt(r2(totalAcc))}</td><td style={TDB}></td><td style={{...TDB,fontWeight:800,color:T.err,fontSize:FS+1}}>{fmt(r2(totalCost))+" ج.م"}</td></tr>}
          {orders.length===0&&<tr><td colSpan={9} style={{...TD,textAlign:"center",color:T.textSec,padding:30}}>لا توجد بيانات</td></tr>}
        </tbody>
      </table></div>
    </div>
  </div>
}

/* ══ SETTINGS ══ */
/* ══ TASKS ══ */
function TasksPg({data,upConfig,upTasks,isMob,user,userRole}){
  const[taskText,setTaskText]=useState("");const[taskTo,setTaskTo]=useState("");
  const uid=user?.uid||"default";const userEmail=user?.email||"";
  const allTasks=Array.isArray(data.tasks)?data.tasks:[];
  const myTasks=allTasks.filter(t=>t.toEmail===userEmail||t.toUid===uid);
  const sentTasks=allTasks.filter(t=>t.fromEmail===userEmail||t.fromUid===uid);
  const users=(data.usersList||[]);
  /* Ensure current user always in list */
  const allowedTargets=users.find(u=>u.email===userEmail)?users:[{email:userEmail,name:user?.displayName||userEmail.split("@")[0],role:userRole},...users];
  const addTask=()=>{if(!taskText.trim()||!taskTo)return;const target=allowedTargets.find(u=>u.email===taskTo);
    upTasks(d=>{if(!Array.isArray(d.tasks))d.tasks=[];d.tasks.unshift({id:Date.now(),text:taskText.trim(),done:false,date:new Date().toISOString().split("T")[0],fromUid:uid,fromEmail:userEmail,fromName:user?.displayName||userEmail.split("@")[0],toEmail:taskTo,toName:target?.name||taskTo.split("@")[0]})});
    setTaskText("");showToast("✓ تم ارسال المهمة")};
  const toggleTask=(tid)=>{upTasks(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const t=arr.find(x=>x.id===tid);if(t){t.done=!t.done;t.doneAt=t.done?new Date().toISOString():null}})};
  const delTask=(tid)=>{upTasks(d=>{d.tasks=Array.isArray(d.tasks)?d.tasks.filter(x=>x.id!==tid):[]})};
  return<div>
    <Card title="📌 ارسال مهمة جديدة" style={{marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 2fr auto",gap:8,alignItems:"end"}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ارسال الى</label><Sel value={taskTo} onChange={setTaskTo}><option value="">-- اختر مستخدم --</option>{allowedTargets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===userEmail?" (أنا)":"")+" — "+(u.role==="admin"?"مدير النظام":u.role==="manager"?"مدير انتاج":u.role==="sales_accountant"?"محاسب مبيعات":u.role==="purchase_accountant"?"محاسب مشتريات":"مشاهد")}</option>)}</Sel></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المهمة</label><Inp value={taskText} onChange={setTaskText} placeholder="اكتب المهمة..." onKeyDown={e=>{if(e.key==="Enter")addTask()}}/></div>
        <Btn primary onClick={addTask} disabled={!taskText.trim()||!taskTo}>📤 ارسال</Btn>
      </div>
    </Card>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:16}}>
      <Card title={"📥 مهامي ("+myTasks.filter(t=>!t.done).length+")"}>
        {myTasks.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>{myTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:10,background:t.done?T.ok+"06":T.bg,border:"1px solid "+(t.done?T.ok+"20":T.brd)}}>
          <span onClick={()=>toggleTask(t.id)} style={{cursor:"pointer",fontSize:20}}>{t.done?"✅":"⬜"}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:FS,fontWeight:600,textDecoration:t.done?"line-through":"none",color:t.done?T.textMut:T.text}}>{t.text}</div>
            <div style={{fontSize:FS-2,color:T.textSec}}>{"من: "+(t.fromName||"—")+" | "+t.date}</div>
          </div>
          {t.done&&<span style={{fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.ok+"12",color:T.ok,fontWeight:600}}>تم ✓</span>}
        </div>)}</div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد مهام</div>}
      </Card>
      <Card title={"📤 المهام المرسلة ("+sentTasks.length+")"}>
        {sentTasks.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>{sentTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",borderRadius:10,background:t.done?T.ok+"06":T.warn+"04",border:"1px solid "+(t.done?T.ok+"20":T.warn+"20")}}>
          <span style={{fontSize:20}}>{t.done?"✅":"⏳"}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:FS,fontWeight:600,color:T.text}}>{t.text}</div>
            <div style={{fontSize:FS-2,color:T.textSec}}>{"الى: "+(t.toName||"—")+" | "+t.date}</div>
          </div>
          {t.done&&<span style={{fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.ok+"12",color:T.ok,fontWeight:600}}>{"تم ✓ "+((t.doneAt||"").split("T")[0]||"")}</span>}
          <span onClick={()=>delTask(t.id)} style={{cursor:"pointer",fontSize:14,color:T.err}}>✕</span>
        </div>)}</div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لم ترسل مهام</div>}
      </Card>
    </div>
  </div>
}


function CustDeliverPg({data,upConfig,upSales,upTasks,updOrder,isMob,isTab,canEdit,user,season}){
  const config=data;const orders=data.orders||[];const customers=config.customers||[];const sessions=config.custDeliverySessions||[];
  const[showCustForm,setShowCustForm]=useState(false);const[showCustList,setShowCustList]=useState(false);const[custSalesLog,setCustSalesLog]=useState(null);const[editSaleIdx,setEditSaleIdx]=useState(null);const[editSaleQty,setEditSaleQty]=useState(0);const[logFilter,setLogFilter]=useState("");const[logTypeFilter,setLogTypeFilter]=useState("");const[logLimit,setLogLimit]=useState(50);const[quoteCust,setQuoteCust]=useState(null);
  const[cName,setCName]=useState("");const[cPhone,setCPhone]=useState("");const[cAddr,setCAddr]=useState("");const[cEditId,setCEditId]=useState(null);const[cType,setCType]=useState("مكتب");const[custFilter,setCustFilter]=useState("");
  const[showNewSession,setShowNewSession]=useState(false);
  const[selModels,setSelModels]=useState({});const[selCusts,setSelCusts]=useState({});
  const[activeSession,setActiveSession]=useState(null);
  const[editCell,setEditCell]=useState(null);const[editVal,setEditVal]=useState(0);const[cellError,setCellError]=useState("");
  const[shipPopup,setShipPopup]=useState(null);const[shipCount,setShipCount]=useState(1);
  const[sessFilterQ,setSessFilterQ]=useState("");
  const[reportRange,setReportRange]=useState({from:"",to:""});const[showReport,setShowReport]=useState(false);const[rptType,setRptType]=useState("all");const[rptCust,setRptCust]=useState("");const[rptModel,setRptModel]=useState("");
  const[invAudit,setInvAudit]=useState(null);/* {items:{orderId:{counted:n}},scanning:false} */
  const[groupPrint,setGroupPrint]=useState(null);const[addCustPick,setAddCustPick]=useState(null);const[stockRcv,setStockRcv]=useState(null);/* {items:{},scanning:false} */
  const[showNewAudit,setShowNewAudit]=useState(false);const[auditDate,setAuditDate]=useState(new Date().toISOString().split("T")[0]);const[auditFrom,setAuditFrom]=useState("");const[auditTo,setAuditTo]=useState("");const[auditNote,setAuditNote]=useState("");const[auditSelCusts,setAuditSelCusts]=useState({});
  const[activeAudit,setActiveAudit]=useState(null);const[auditCell,setAuditCell]=useState(null);const[auditVal,setAuditVal]=useState(0);const[showAuditAnalysis,setShowAuditAnalysis]=useState(null);
  const[ocrCust,setOcrCust]=useState(null);const[ocrLoading,setOcrLoading]=useState(false);const[ocrResult,setOcrResult]=useState(null);const ocrRef=useRef(null);const[auditInclude,setAuditInclude]=useState(null);
  const[returnPopup,setReturnPopup]=useState(null);const[retQty,setRetQty]=useState(0);const[retNote,setRetNote]=useState("");
  const[freeReturn,setFreeReturn]=useState(null);const[freeRetItems,setFreeRetItems]=useState({});const[freeRetNote,setFreeRetNote]=useState("");
  const[custQR,setCustQR]=useState(null);const[salesDetail,setSalesDetail]=useState(null);const[custStatement,setCustStatement]=useState(null);const[salesAnalysis,setSalesAnalysis]=useState(false);const[seasonReport,setSeasonReport]=useState(false);const[editRetIdx,setEditRetIdx]=useState(null);const[editRetQty,setEditRetQty]=useState(0);const[editRetNote,setEditRetNote]=useState("");
  const[qrSale,setQrSale]=useState(null);/* {mode:"sale"|"return",custId,items:[{orderId,modelNo,modelDesc,rackSize,qty}],note,linkedSession} */
  const[qrScanActive,setQrScanActive]=useState(false);const[customLabel,setCustomLabel]=useState(null);
  const[pkgPopup,setPkgPopup]=useState(null);const[pkgItems,setPkgItems]=useState([]);const[pkgNote,setPkgNote]=useState("");const[pkgSearch,setPkgSearch]=useState("");const[pkgScan,setPkgScan]=useState(false);const[pkgAction,setPkgAction]=useState(null);/* {id,mode:"menu"|"add"|"remove"} */
  useEffect(()=>{const h=()=>{const mode=window.__qrSaleMode;if(mode){delete window.__qrSaleMode;setQrSale({mode,custId:null,items:[],note:"",linkedSession:mode==="return"?"free":undefined})}};const h2=()=>{const pkgId=window.__openPkg;if(pkgId){delete window.__openPkg;setPkgAction({id:pkgId,mode:"menu"})}};window.addEventListener("qr-sale-trigger",h);window.addEventListener("open-pkg",h2);return()=>{window.removeEventListener("qr-sale-trigger",h);window.removeEventListener("open-pkg",h2)}},[]);
  const userName=user?.displayName||user?.email?.split("@")[0]||"";

  const getRackSize=(orderId)=>{const o=orders.find(x=>x.id===orderId);if(!o||!o.sizeLabel)return 1;const parts=o.sizeLabel.split(/[-\/]/).map(s=>s.trim()).filter(Boolean);return parts.length||1};

  const orderCalcs=useMemo(()=>{const m=new Map();orders.forEach(o=>m.set(o.id,calcOrder(o)));return m},[orders]);
  const getCalc=(oid)=>orderCalcs.get(oid)||calcOrder({});
  const stockModels=useMemo(()=>orders.filter(o=>{const sd=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return sd>0}).map(o=>{const sd=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const cd=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);return{id:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,stockQty:sd,custDel:cd-ret,avail:sd-(cd-ret),rackSize:getRackSize(o.id),sellPrice:Number(o.sellPrice)||0,returns:ret}}),[orders]);

  const saveCust=()=>{if(!cName.trim()||!cPhone.trim()){showToast("⚠️ الاسم والتليفون مطلوبين");return}
    upConfig(d=>{if(!d.customers)d.customers=[];if(cEditId){const idx=d.customers.findIndex(c=>c.id===cEditId);if(idx>=0){d.customers[idx].name=cName.trim();d.customers[idx].phone=cPhone.trim();d.customers[idx].address=cAddr.trim();d.customers[idx].type=cType}}else{d.customers.push({id:gid(),name:cName.trim(),phone:cPhone.trim(),address:cAddr.trim(),type:cType})}});
    setCName("");setCPhone("");setCAddr("");setCType("مكتب");setCEditId(null);setShowCustForm(false);showToast("✓ تم الحفظ")};

  const createSession=()=>{const mIds=Object.keys(selModels).filter(k=>selModels[k]);const cIds=Object.keys(selCusts).filter(k=>selCusts[k]);
    if(mIds.length===0||cIds.length===0){showToast("⚠️ اختر موديل وعميل على الأقل");return}
    const sess={id:gid(),date:new Date().toISOString().split("T")[0],createdAt:new Date().toISOString(),modelIds:mIds,custIds:cIds,grid:{}};
    upSales(d=>{if(!d.custDeliverySessions)d.custDeliverySessions=[];d.custDeliverySessions.unshift(sess)});
    setActiveSession(sess.id);setShowNewSession(false);setSelModels({});setSelCusts({});showToast("✓ تم انشاء التسليم")};

  const saveCell=(sessId,orderId,custId,newQty)=>{if(isSessClosed){showToast("⛔ التوزيعة مغلقة");setEditCell(null);return}
    const rackSize=getRackSize(orderId);
    if(newQty>0&&newQty%rackSize!==0){setCellError("الكمية "+newQty+" مش من مضاعفات السيري ("+rackSize+") — جرب "+Math.round(newQty/rackSize)*rackSize);return}
    setCellError("");
    const o=orders.find(x=>x.id===orderId);if(!o)return;
    const sm=stockModels.find(m=>m.id===orderId);if(!sm)return;
    const sess=sessions.find(s=>s.id===sessId);if(!sess)return;
    const otherCustQty=Object.entries(sess.grid||{}).filter(([k])=>{const[oid]=k.split("_");return oid===orderId&&k!==orderId+"_"+custId}).reduce((s,[_,v])=>s+(Number(v)||0),0);
    const availStock=sm.avail||0;const maxQ=availStock-otherCustQty;
    if(newQty>maxQ&&newQty>0){playBeep("error");showToast("⚠️ "+o.modelNo+": المتاح = "+availStock+" — الحد = "+Math.max(0,maxQ));setCellError("الحد "+Math.max(0,maxQ));return}
    const qty=Math.min(Math.max(0,newQty),Math.max(0,maxQ));
    /* Plan only — update grid, NO customerDeliveries */
    upSales(d=>{const si=d.custDeliverySessions.findIndex(s=>s.id===sessId);if(si<0)return;if(!d.custDeliverySessions[si].grid)d.custDeliverySessions[si].grid={};
      if(qty>0)d.custDeliverySessions[si].grid[orderId+"_"+custId]=qty;
      else delete d.custDeliverySessions[si].grid[orderId+"_"+custId]});
    setEditCell(null)};

  const delSession=(sessId)=>{const sess=sessions.find(s=>s.id===sessId);if(!sess)return;
    if(sess.saleConfirmed){playBeep("error");showToast("⛔ لا يمكن حذف توزيعة مرتبطة بعملية بيع فعلي");return}
    if(sess.status==="تم التسليم"){playBeep("error");showToast("⛔ لا يمكن حذف توزيعة مغلقة");return}
    const hasSales=orders.some(o=>(o.customerDeliveries||[]).some(d=>d.sessionId===sessId));
    if(hasSales){playBeep("error");showToast("⛔ لا يمكن حذف توزيعة بها حركات بيع فعلية");return}
    const affectedOrders=new Set();
    Object.entries(sess.grid||{}).forEach(([k])=>{const[orderId]=k.split("_");affectedOrders.add(orderId)});
    sess.modelIds.forEach(id=>affectedOrders.add(id));
    affectedOrders.forEach(orderId=>{updOrder(orderId,o=>{
      o.customerDeliveries=(o.customerDeliveries||[]).filter(d=>d.sessionId!==sessId)})});
    upSales(d=>{d.custDeliverySessions=(d.custDeliverySessions||[]).filter(s=>s.id!==sessId)});
    if(activeSession===sessId)setActiveSession(null);showToast("✓ تم الحذف")};

  const printSession=(sessId)=>{const sess=sessions.find(s=>s.id===sessId);if(!sess)return;
    const mods=sess.modelIds.map(id=>{const sm=stockModels.find(m=>m.id===id);const o=orders.find(x=>x.id===id);return sm||{id,modelNo:o?.modelNo||"",stockQty:0}}).filter(Boolean);
    const custs=sess.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean);
    const g=sess.grid||{};
    let h="<h2>🚚 تسليم عملاء — "+sess.date+"</h2><table><thead><tr><th>المكتب / العميل</th>";
    mods.forEach(m=>{h+="<th style='text-align:center'>"+m.modelNo+"</th>"});
    h+="<th style='background:#0284C7;color:#fff;text-align:center'>اجمالي</th></tr></thead><tbody>";
    custs.forEach(c=>{let total=0;h+="<tr><td><b>"+c.name+"</b></td>";
      mods.forEach(m=>{const q=Number(g[m.id+"_"+c.id])||0;total+=q;h+="<td style='text-align:center;"+(q>0?"font-weight:800;color:#0284C7":"color:#ccc")+"'>"+(q||"—")+"</td>"});
      h+="<td style='text-align:center;font-weight:800;background:#F0F9FF;color:#0284C7'>"+total+"</td></tr>"});
    let gt=0;h+="<tr style='background:#F1F5F9;font-weight:800'><td>الاجمالي</td>";
    mods.forEach(m=>{const mt=custs.reduce((s,c)=>s+(Number(g[m.id+"_"+c.id])||0),0);gt+=mt;h+="<td style='text-align:center;color:#059669'>"+mt+"</td>"});
    h+="<td style='text-align:center;background:#059669;color:#fff;font-size:14px'>"+gt+"</td></tr></tbody></table>";
    h+="<div class='sig'><div class='sig-box'>مسؤول التسليم</div><div class='sig-box'>المستلم</div></div>";
    printPage("تسليم عملاء — "+sess.date,h)};

  const custTotalsMap=useMemo(()=>{const m=new Map();(config.customers||[]).forEach(c=>{let t=0;orders.forEach(o=>{const d=(o.customerDeliveries||[]).filter(x=>x.custId===c.id).reduce((s,x)=>s+(Number(x.qty)||0),0);const r=(o.customerReturns||[]).filter(x=>x.custId===c.id).reduce((s,x)=>s+(Number(x.qty)||0),0);t+=d-r});m.set(c.id,t)});return m},[orders,config.customers]);
  const getDeliveredForSess=(custId,sessId,orderId)=>{const o=orders.find(x=>x.id===orderId);if(!o)return 0;return(o.customerDeliveries||[]).filter(d=>d.custId===custId&&d.sessionId===sessId).reduce((s,d)=>s+(Number(d.qty)||0),0)};
  const getRemainingForSess=(custId,sessId,orderId,grid)=>{const planned=Number(grid[orderId+"_"+custId])||0;const delivered=getDeliveredForSess(custId,sessId,orderId);return Math.max(0,planned-delivered)};
  const getCustTotal=(custId)=>custTotalsMap.get(custId)||orders.reduce((s,o)=>{const del=(o.customerDeliveries||[]).filter(d=>d.custId===custId).reduce((ss,d)=>ss+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).filter(r=>r.custId===custId).reduce((ss,r)=>ss+(Number(r.qty)||0),0);return s+del-ret},0);
  const sortedSessions=useMemo(()=>[...sessions].sort((a,b)=>(b.createdAt||b.date||"").localeCompare(a.createdAt||a.date||"")),[sessions]);
  const activeSess=sessions.find(s=>s.id===activeSession);
  const aMods=activeSess?activeSess.modelIds.map(id=>{const sm=stockModels.find(m=>m.id===id);const o=orders.find(x=>x.id===id);if(!o)return null;const sd=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return sm||{id,modelNo:o.modelNo,modelDesc:o.modelDesc,stockQty:sd,rackSize:getRackSize(id)}}).filter(Boolean):[];
  const aCusts=activeSess?activeSess.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean):[];
  const aGrid=activeSess?.grid||{};
  const isSessClosed=activeSess?.status==="تم التسليم";
  const sessCanEdit=canEdit&&!isSessClosed;
  const closeMatrix=(forceKeep)=>{if(!activeSess){setActiveSession(null);return}
    if(!forceKeep&&!activeSess.saleConfirmed&&activeSess.status!=="تم التسليم"){const hasData=Object.values(activeSess.grid||{}).some(v=>Number(v)>0);if(!hasData){delSession(activeSess.id);setCellError("");return}}
    setActiveSession(null);setCellError("")};

  /* Session status */
  const SESS_STATUSES=["جاري التجهيز","تم الشحن","تم التسليم"];
  const updateSessStatus=(sessId,status)=>{upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===sessId);if(si>=0)d.custDeliverySessions[si].status=status})};

  /* Returns */
  const doReturn=()=>{if(!returnPopup||retQty<=0)return;const{orderId,custId,custName,sessId}=returnPopup;
    updOrder(orderId,o=>{if(!o.customerReturns)o.customerReturns=[];o.customerReturns.push({custId,custName,qty:retQty,note:retNote,date:new Date().toISOString().split("T")[0],sessId,createdBy:userName||""})});
    setReturnPopup(null);setRetQty(0);setRetNote("");showToast("✓ تم تسجيل مرتجع "+retQty+" قطعة")};

  /* Sell price */
  const setSellPrice=(orderId,price)=>{updOrder(orderId,o=>{o.sellPrice=Number(price)||0})};

  /* Period report */
  /* Floor stock report - قطع على الأرض */
  const printFloorStock=()=>{const rows=[];
    orders.forEach(o=>{const t=calcOrder(o);if(t.cutQty===0)return;const pieces=o.orderPieces||[];const wds=o.workshopDeliveries||[];
      if(pieces.length>0){const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
        pieces.forEach(p=>{const isCut=linkedPieces.has(p);if(!isCut)return;const del=wds.filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);const floor=t.cutQty-del;
          if(floor>0){const days=Math.floor((Date.now()-new Date(o.date))/(86400000));rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:p,cut:t.cutQty,del,floor,days})}})}
      else{const del=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const floor=t.cutQty-del;
        if(floor>0){const days=Math.floor((Date.now()-new Date(o.date))/(86400000));rows.push({modelNo:o.modelNo,desc:o.modelDesc,piece:"عام",cut:t.cutQty,del,floor,days})}}});
    if(rows.length===0){showToast("✅ لا توجد قطع على الأرض");return}
    rows.sort((a,b)=>b.floor-a.floor);const totalFloor=rows.reduce((s,r)=>s+r.floor,0);
    let h="<h2 style='text-align:center'>📋 قطع على الأرض — جاهزة للتسليم</h2><div style='text-align:center;margin-bottom:12px;font-size:16px;font-weight:800;color:#F59E0B'>"+totalFloor+" قطعة على الأرض</div>";
    h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>القطعة</th><th>القص</th><th>مسلّم</th><th>على الأرض</th><th>الأيام</th></tr></thead><tbody>";
    rows.forEach(r=>{const warn=r.days>7;h+="<tr style='background:"+(warn?"#FEF2F2":"transparent")+"'><td style='font-weight:800'>"+r.modelNo+"</td><td>"+r.desc+"</td><td>"+r.piece+"</td><td style='text-align:center'>"+r.cut+"</td><td style='text-align:center'>"+r.del+"</td><td style='text-align:center;font-weight:800;color:#F59E0B'>"+r.floor+(warn?" ⚠️":"")+"</td><td style='text-align:center;color:"+(warn?"#EF4444":"#666")+"'>"+r.days+"</td></tr>"});
    h+="<tr style='background:#F59E0B10;font-weight:800'><td colspan='5'>الاجمالي</td><td style='text-align:center;color:#F59E0B;font-size:16px'>"+totalFloor+"</td><td></td></tr></tbody></table>";
    h+="<div class='sig'><div class='sig-box'>مسؤول التشغيل</div><div class='sig-box'>المدير</div></div>";printPage("قطع على الأرض",h)};

  /* Production line report - خط الانتاج */
  const printProductionLine=()=>{const rows=[];
    orders.forEach(o=>{const t=calcOrder(o);if(t.cutQty===0)return;const wds=o.workshopDeliveries||[];
      const delToWs=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const rcvFromWs=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);
      const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const finishing=rcvFromWs-stockDel;const wsBalance=delToWs-rcvFromWs;
      rows.push({modelNo:o.modelNo,desc:o.modelDesc,cut:t.cutQty,delWs:delToWs,rcvWs:rcvFromWs,finishing:Math.max(0,finishing),stock:stockDel,wsBalance:Math.max(0,wsBalance)})});
    if(rows.length===0){showToast("⚠️ لا توجد بيانات");return}
    const totals=rows.reduce((s,r)=>({cut:s.cut+r.cut,delWs:s.delWs+r.delWs,rcvWs:s.rcvWs+r.rcvWs,finishing:s.finishing+r.finishing,stock:s.stock+r.stock,wsBalance:s.wsBalance+r.wsBalance}),{cut:0,delWs:0,rcvWs:0,finishing:0,stock:0,wsBalance:0});
    let h="<h2 style='text-align:center'>📊 تقرير خط الانتاج</h2>";
    h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>القص</th><th>تسليم ورش</th><th>استلام ورش</th><th>رصيد ورش</th><th>عند التشطيب</th><th>مخزن جاهز</th></tr></thead><tbody>";
    rows.forEach(r=>{h+="<tr><td style='font-weight:800'>"+r.modelNo+"</td><td>"+r.desc+"</td><td style='text-align:center'>"+r.cut+"</td><td style='text-align:center'>"+r.delWs+"</td><td style='text-align:center'>"+r.rcvWs+"</td><td style='text-align:center;color:"+(r.wsBalance>0?"#EF4444":"#10B981")+";font-weight:700'>"+(r.wsBalance||"✅")+"</td><td style='text-align:center;color:"+(r.finishing>0?"#F59E0B":"#666")+";font-weight:700'>"+(r.finishing||"—")+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+r.stock+"</td></tr>"});
    h+="<tr style='background:#F1F5F9;font-weight:800'><td colspan='2'>الاجمالي</td><td style='text-align:center'>"+totals.cut+"</td><td style='text-align:center'>"+totals.delWs+"</td><td style='text-align:center'>"+totals.rcvWs+"</td><td style='text-align:center;color:#EF4444'>"+totals.wsBalance+"</td><td style='text-align:center;color:#F59E0B'>"+totals.finishing+"</td><td style='text-align:center;color:#0EA5E9;font-size:14px'>"+totals.stock+"</td></tr></tbody></table>";
    h+="<div class='sig'><div class='sig-box'>مسؤول الانتاج</div><div class='sig-box'>المدير</div></div>";printPage("خط الانتاج",h)};

  const printSalesReport=()=>{const{from,to}=reportRange;const type=rptType;
    let totalDel=0,totalRet=0,totalVal=0;const custMap={};const modelMap={};
    orders.forEach(o=>{const sp=Number(o.sellPrice)||0;const mn=o.modelNo||"—";
      (o.customerDeliveries||[]).forEach(d=>{if(from&&d.date<from)return;if(to&&d.date>to)return;
        if(type==="customer"&&rptCust&&d.custId!==rptCust)return;if(type==="model"&&rptModel&&o.id!==rptModel)return;
        const q=Number(d.qty)||0;totalDel+=q;const cn=d.custName||"—";
        if(!custMap[cn])custMap[cn]={del:0,ret:0,val:0,models:{}};custMap[cn].del+=q;custMap[cn].val+=q*sp;if(!custMap[cn].models[mn])custMap[cn].models[mn]={del:0,ret:0,price:sp};custMap[cn].models[mn].del+=q;
        if(!modelMap[mn])modelMap[mn]={del:0,ret:0,price:sp};modelMap[mn].del+=q});
      (o.customerReturns||[]).forEach(r=>{if(from&&r.date<from)return;if(to&&r.date>to)return;
        if(type==="customer"&&rptCust&&r.custId!==rptCust)return;if(type==="model"&&rptModel&&o.id!==rptModel)return;
        const q=Number(r.qty)||0;totalRet+=q;const cn=r.custName||"—";
        if(!custMap[cn])custMap[cn]={del:0,ret:0,val:0,models:{}};custMap[cn].ret+=q;custMap[cn].val-=q*sp;if(!custMap[cn].models[mn])custMap[cn].models[mn]={del:0,ret:0,price:sp};custMap[cn].models[mn].ret+=q;
        if(!modelMap[mn])modelMap[mn]={del:0,ret:0,price:sp};modelMap[mn].ret+=q})});
    const totalNet=totalDel-totalRet;Object.values(modelMap).forEach(m=>{const net=m.del-m.ret;totalVal+=net*m.price});
    if(totalDel===0&&totalRet===0){showToast("⚠️ لا توجد بيانات");return}
    const titleParts=["📊 تقرير المبيعات"];
    if(type==="customer"&&rptCust){const c=customers.find(x=>x.id===rptCust);if(c)titleParts.push("عميل: "+c.name)}
    if(type==="model"&&rptModel){const m=stockModels.find(x=>x.id===rptModel);if(m)titleParts.push("موديل: "+m.modelNo)}
    if(from||to)titleParts.push((from||"...")+" → "+(to||"..."));
    let h="<h2 style='text-align:center'>"+titleParts.join(" — ")+"</h2>";
    h+="<table style='margin:0 auto 16px'><tr><th>اجمالي التسليم</th><td><b style='color:#0EA5E9'>"+fmt(totalDel)+"</b></td><th>المرتجع</th><td><b style='color:#EF4444'>"+fmt(totalRet)+"</b></td></tr>";
    h+="<tr><th>الصافي</th><td><b style='color:#10B981;font-size:14px'>"+fmt(totalNet)+"</b></td><th>القيمة الصافية</th><td><b style='color:#8B5CF6;font-size:14px'>"+fmt(r2(totalVal))+" ج.م</b></td></tr></table>";
    h+="<h3>حسب الموديل</h3><table><thead><tr><th>الموديل</th><th>سعر</th><th>تسليم</th><th>مرتجع</th><th>صافي</th><th>القيمة</th></tr></thead><tbody>";
    Object.entries(modelMap).sort((a,b)=>(b[1].del-b[1].ret)-(a[1].del-a[1].ret)).forEach(([n,d])=>{const net=d.del-d.ret;h+="<tr><td style='font-weight:800'>"+n+"</td><td>"+d.price+"</td><td style='text-align:center'>"+fmt(d.del)+"</td><td style='text-align:center;color:#EF4444'>"+(d.ret||"—")+"</td><td style='text-align:center;font-weight:800'>"+fmt(net)+"</td><td style='text-align:center;font-weight:800;color:#0284C7'>"+fmt(r2(net*d.price))+"</td></tr>"});
    h+="<tr style='background:#F1F5F9;font-weight:800'><td colspan='2'>الاجمالي</td><td style='text-align:center'>"+fmt(totalDel)+"</td><td style='text-align:center;color:#EF4444'>"+fmt(totalRet)+"</td><td style='text-align:center;font-size:14px'>"+fmt(totalNet)+"</td><td style='text-align:center;color:#8B5CF6;font-size:14px'>"+fmt(r2(totalVal))+" ج.م</td></tr></tbody></table>";
    h+="<h3>حسب العميل</h3><table><thead><tr><th>العميل</th><th>تسليم</th><th>مرتجع</th><th>صافي</th><th>القيمة</th></tr></thead><tbody>";
    Object.entries(custMap).sort((a,b)=>(b[1].del-b[1].ret)-(a[1].del-a[1].ret)).forEach(([n,d])=>{const net=d.del-d.ret;h+="<tr><td style='font-weight:700'>"+n+"</td><td style='text-align:center'>"+fmt(d.del)+"</td><td style='text-align:center;color:#EF4444'>"+(d.ret||"—")+"</td><td style='text-align:center;font-weight:800'>"+fmt(net)+"</td><td style='text-align:center;font-weight:700;color:#8B5CF6'>"+fmt(r2(d.val))+" ج.م</td></tr>"});
    h+="</tbody></table>";
    if(type==="customer"&&rptCust){const cn=Object.keys(custMap)[0];const cd=custMap[cn];if(cd){h+="<h3>تفصيل — "+cn+"</h3><table><thead><tr><th>الموديل</th><th>سعر</th><th>تسليم</th><th>مرتجع</th><th>صافي</th><th>القيمة</th></tr></thead><tbody>";
      Object.entries(cd.models).sort((a,b)=>(b[1].del-b[1].ret)-(a[1].del-a[1].ret)).forEach(([mn,d])=>{const net=d.del-d.ret;h+="<tr><td style='font-weight:800'>"+mn+"</td><td>"+d.price+"</td><td style='text-align:center'>"+d.del+"</td><td style='text-align:center;color:#EF4444'>"+(d.ret||"—")+"</td><td style='text-align:center;font-weight:800'>"+net+"</td><td style='text-align:center;font-weight:700;color:#8B5CF6'>"+fmt(r2(net*d.price))+"</td></tr>"});
      h+="</tbody></table>"}}
    h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>المدير</div></div>";
    printPage(titleParts.join(" — "),h);setShowReport(false)};

  /* Shipping label */
  const printShippingLabel=async(cust,sessDate,items,total,shipN)=>{
    const pw=window.open("","_blank");if(!pw)return;
    let pages="";for(let i=1;i<=shipN;i++){
      pages+="<div class='pg'><div class='from'><b>CLARK</b></div><div class='to'><div class='tn'>"+cust.name+"</div><div class='tp'>"+(cust.phone||"")+"</div>"+(cust.address?"<div class='ta'>"+cust.address+"</div>":"")+"</div>"
      +"<div class='dd'>"+sessDate+"</div>"
      +"<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th></tr></thead><tbody>";
      items.forEach(it=>{if(it.qty>0)pages+="<tr><td class='mn'>"+it.no+"</td><td class='ds'>"+(it.desc||"")+"</td><td class='qt'>"+it.qty+"</td></tr>"});
      pages+="<tr class='tt'><td colspan='2'>الاجمالي</td><td class='qt'>"+total+"</td></tr></tbody></table>"
      +"<div class='bb'><div class='sl'>عدد الشحنات</div><div class='sn'>"+i+"/"+shipN+"</div></div>"
      +"</div>"+(i<shipN?"<div style='page-break-after:always'></div>":"")
    }
    pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@600;800&display=swap' rel='stylesheet'/><style>"
    +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;color:#000}"
    +".pg{width:10cm;height:15cm;padding:4mm;display:flex;flex-direction:column;border:1px dashed #ccc}"
    +".from{text-align:center;font-size:14pt;font-weight:900;padding:2mm;border-bottom:2px solid #000;margin-bottom:2mm;letter-spacing:3px}"
    +".to{text-align:center;padding:3mm;border:3px solid #000;border-radius:8px;margin-bottom:2mm}"
    +".tn{font-size:16pt;font-weight:800}.tp{font-size:10pt}.ta{font-size:8pt;color:#444}"
    +".dd{text-align:center;font-size:9pt;color:#555;margin-bottom:2mm}"
    +"table{width:100%;border-collapse:collapse;margin:2mm 0}th{padding:1.5mm 2mm;border:1px solid #000;font-weight:800;font-size:9pt;background:#f0f0f0}td{padding:1.5mm 2mm;border:1px solid #000;font-size:9pt}"
    +".mn{font-weight:800;font-size:10pt}.ds{font-size:8pt;color:#333}.qt{text-align:center;font-weight:800;font-size:11pt}"
    +".tt td{background:#eee;font-weight:800;font-size:11pt}"
    +".bb{margin:auto 0;padding:3mm 0;text-align:center}"
    +".sl{font-size:9pt;font-weight:700;color:#555;margin-bottom:1mm}"
    +".sn{font-size:28pt;font-weight:800;border:3px solid #000;border-radius:8px;padding:2mm 8mm;display:inline-block}"
    +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc}"
    +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}.pbar .pr{background:#000;color:#fff}"
    +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
    +"</style></head><body><div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨</button></div>"+pages+"</body></html>");
    pw.document.close();if(window.innerWidth>1024)setTimeout(()=>{pw.focus();pw.print()},500)};

  /* Customer QR */
  const showCustQR=async(c)=>{try{const QR=await loadQR();if(QR){const src=await QR.toDataURL(window.location.origin+"?cust="+encodeURIComponent(c.name),{width:300,margin:2});setCustQR({name:c.name,phone:c.phone,src})}}catch(e){}};

  /* ── Sales Audit (جرد المبيعات) ── */
  const audits=config.salesAudits||[];
  const sortedAudits=[...audits].sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  /* Models that have been delivered to customers */
  const auditModels=stockModels.filter(m=>m.custDel>0);
  /* Customers that received deliveries */
  const auditCusts=customers.filter(c=>getCustTotal(c.id)>0);
  const activeAud=audits.find(a=>a.id===activeAudit);
  const aAudGrid=activeAud?.grid||{};

  const createAudit=()=>{if(!auditDate){showToast("⚠️ اختر تاريخ الجرد");return}
    const selIds=Object.entries(auditSelCusts).filter(([,v])=>v).map(([k])=>k);if(selIds.length===0){showToast("⚠️ اختر عميل واحد على الأقل");return}
    const aud={id:gid(),date:auditDate,fromDate:auditFrom,toDate:auditTo||auditDate,notes:auditNote,createdBy:userName||"",createdAt:new Date().toISOString(),grid:{}};
    upConfig(d=>{if(!d.salesAudits)d.salesAudits=[];d.salesAudits.unshift(aud)});
    setAuditInclude(selIds);setActiveAudit(aud.id);setShowNewAudit(false);setAuditNote("");setAuditSelCusts({});showToast("✓ تم إنشاء الجرد")};

  const saveAuditCell=(audId,orderId,custId,val)=>{const q=Math.max(0,Number(val)||0);
    upConfig(d=>{const ai=(d.salesAudits||[]).findIndex(a=>a.id===audId);if(ai>=0){if(!d.salesAudits[ai].grid)d.salesAudits[ai].grid={};d.salesAudits[ai].grid[orderId+"_"+custId]=q}})};

  const delAudit=(audId)=>{upConfig(d=>{d.salesAudits=(d.salesAudits||[]).filter(a=>a.id!==audId)});if(activeAudit===audId)setActiveAudit(null);showToast("✓ تم الحذف")};

  const scanAuditImage=async(file,custId)=>{if(!file||!activeAudit)return;setOcrLoading(true);setOcrResult(null);
    try{const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej();r.readAsDataURL(file)});
      const modelList=auditModels.map(m=>m.modelNo).join(", ");
      const prompt="You are reading a sales inventory report image. Extract ONLY the model/product numbers and their SALES quantities.\n\nIMPORTANT RULES:\n1. Look for columns labeled: مبيعات, منصرف, مباع, sold, sales, or similar\n2. Do NOT use the 'quantity' or 'balance/رصيد' column — only the SALES column\n3. If there is no explicit sales column, calculate: sales = initial_quantity - remaining_balance\n4. Read each number VERY carefully — double check every digit\n5. The model numbers in our system are: "+modelList+"\n6. Match each model number from the image to the closest one in our system\n\nReturn ONLY valid JSON array, no markdown, no explanation:\n[{\"model\":\"3262101\",\"qty\":28},{\"model\":\"3261115\",\"qty\":14}]";
      const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:"You are a precise OCR tool for reading sales inventory tables from images. Return ONLY JSON. Read numbers very carefully — accuracy is critical.",messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:b64}},{type:"text",text:prompt}]}]})});
      const data2=await res.json();if(data2.error){showToast("⚠️ خطأ: "+(data2.error.message||""));setOcrLoading(false);return}
      const txt=(data2.content||[]).map(c=>c.text||"").join("").trim();
      const clean=txt.replace(/```json|```/g,"").trim();
      const items=JSON.parse(clean);
      const matched=items.map(it=>{const m=auditModels.find(x=>x.modelNo===it.model)||auditModels.find(x=>x.modelNo.includes(it.model)||it.model.includes(x.modelNo));return{input:it.model,qty:Number(it.qty)||0,matched:m?m.modelNo:null,matchedId:m?m.id:null}});
      setOcrResult({custId,items:matched})
    }catch(e){showToast("⚠️ فشل قراءة الصورة: "+e.message)}
    setOcrLoading(false)};

  const applyOcr=()=>{if(!ocrResult||!activeAudit)return;const{custId,items}=ocrResult;
    upConfig(d=>{const ai=(d.salesAudits||[]).findIndex(a=>a.id===activeAudit);if(ai>=0){if(!d.salesAudits[ai].grid)d.salesAudits[ai].grid={};items.filter(it=>it.matchedId).forEach(it=>{d.salesAudits[ai].grid[it.matchedId+"_"+custId]=it.qty})}});
    const count=items.filter(it=>it.matchedId).length;showToast("✓ تم تسجيل "+count+" موديل");setOcrResult(null);setOcrCust(null)};

  const printCustLabels=async(cust,models,grid,sessDate,total,count)=>{
    const pw=window.open("","_blank");if(!pw)return;
    let pages="";const items=models.map(m=>({no:m.modelNo,desc:orders.find(o=>o.id===m.id)?.modelDesc||"",qty:Number(grid[m.id+"_"+cust.id])||0})).filter(x=>x.qty>0);
    for(let i=1;i<=count;i++){
      pages+="<div class='page'>"
      +"<div class='brand'>CLARK</div>"
      +"<div class='cust'>"+cust.name+"</div>"
      +"<div class='dd'>"+(cust.phone||"")+" | "+sessDate+"</div>"
      +"<table><thead><tr><th class='mn'>الموديل</th><th class='ds'>الوصف</th><th class='mq'>الكمية</th></tr></thead><tbody>";
      items.forEach(it=>{pages+="<tr><td class='mn'>"+it.no+"</td><td class='ds'>"+it.desc+"</td><td class='mq'>"+it.qty+"</td></tr>"});
      pages+="<tr class='tot'><td class='mn' colspan='2'>الاجمالي</td><td class='mq'>"+total+"</td></tr></tbody></table>"
      +"<div class='mid'><div class='sl'>عدد الشحنات</div><div class='ship'>"+i+"/"+count+"</div></div>"
      +"</div>"+(i<count?"<div style='page-break-after:always'></div>":"")
    }
    pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@600;800&display=swap' rel='stylesheet'/><title>ليبل</title><style>"
    +"@page{size:10cm 15cm;margin:0}*{margin:0;padding:0;box-sizing:border-box}"
    +"body{font-family:'Cairo',sans-serif;color:#000}"
    +".page{width:10cm;height:15cm;padding:4mm;display:flex;flex-direction:column;align-items:center;overflow:hidden}"
    +".brand{font-size:12pt;font-weight:900;letter-spacing:3px;margin-bottom:1mm}"
    +".cust{font-size:16pt;font-weight:800;text-align:center;border:2.5px solid #000;border-radius:6px;padding:2mm 4mm;width:100%;margin-bottom:1mm}"
    +".dd{font-size:9pt;text-align:center;color:#555;margin-bottom:2mm}"
    +"table{width:100%;border-collapse:collapse}"
    +"th{padding:1.5mm 2mm;border:1px solid #000;font-size:8pt;font-weight:800;background:#f0f0f0}"
    +"td{padding:1.5mm 2mm;border:1px solid #000;font-size:10pt;font-weight:700}"
    +".mn{text-align:right}.ds{font-size:8pt;color:#333}.mq{text-align:center;font-weight:800;font-size:11pt}"
    +".tot td{background:#eee;font-size:12pt;font-weight:800}"
    +".mid{text-align:center;margin:auto 0;padding:3mm 0}"
    +".sl{font-size:9pt;font-weight:700;color:#555;margin-bottom:1mm}"
    +".ship{font-size:28pt;font-weight:800;border:3px solid #000;border-radius:8px;padding:2mm 8mm;display:inline-block;line-height:1}"
    +".pbar{position:sticky;top:0;background:#fff;padding:4px;display:none;justify-content:center;gap:6px;border-bottom:2px solid #ccc;z-index:99}"
    +".pbar button{padding:5px 14px;border-radius:6px;border:1px solid #000;cursor:pointer;font-family:'Cairo';font-size:11px;font-weight:700;background:#fff}"
    +".pbar .pr{background:#000;color:#fff}"
    +"@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}"
    +"</style></head><body>"
    +"<div class='pbar'><button onclick='window.close()'>↩</button><button class='pr' onclick='window.print()'>🖨 طباعة "+count+"</button></div>"
    +pages+"</body></html>");
    pw.document.close();if(window.innerWidth>1024)setTimeout(()=>{pw.focus();pw.print()},500)
  };

  return<div>
    {(()=>{const crd=(icon,label,color,onClick,sub)=><div onClick={onClick} style={{background:T.cardSolid,borderRadius:14,padding:"8px 4px",border:"1px solid "+color+"20",boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"transform 0.15s",flex:isMob?undefined:"1 1 0",minWidth:isMob?undefined:0,height:isMob?80:90,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform=""}><div style={{fontSize:isMob?20:24,marginBottom:2}}>{icon}</div><div style={{fontSize:isMob?FS-3:FS-2,fontWeight:700,color,whiteSpace:"nowrap"}}>{label}</div>{sub&&<div style={{fontSize:FS-3,color:T.textMut}}>{sub}</div>}</div>;
      return<div style={isMob?{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}:{display:"flex",gap:8,marginBottom:16}}>
        {canEdit&&crd("👥","العملاء",T.text,()=>setShowCustList(true),customers.length+"")}
        {canEdit&&crd("🚚","تسليم جديد",T.ok,()=>{setSelModels({});setSelCusts({});setShowNewSession(true)})}
        {canEdit&&crd("📦","بيع سريع","#10B981",()=>setQrSale({mode:"sale",custId:null,items:[],note:""}))}
        {crd("📊","تقرير مبيعات","#8B5CF6",()=>{setRptType("all");setRptCust("");setRptModel("");setReportRange({from:"",to:""});setShowReport(true)})}
        {canEdit&&crd("📋","جرد مبيعات","#F59E0B",()=>{setAuditDate(new Date().toISOString().split("T")[0]);setAuditFrom("");setAuditTo("");setAuditNote("");setShowNewAudit(true)})}
        {canEdit&&crd("↩️","مرتجع حر",T.err,()=>{setFreeReturn("pick");setFreeRetItems({});setFreeRetNote("")})}
        {canEdit&&crd("📷","مرتجع سريع","#8B5CF6",()=>setQrSale({mode:"return",custId:null,items:[],note:"",linkedSession:"free"}))}
        {stockModels.length>0&&crd("🏷️","ليبلات QR","#F59E0B",()=>setCustomLabel("pick"))}
        {crd("📄","كشف حساب",T.accent,()=>{setCustStatement("pick");setCustFilter("")})}
        {stockModels.length>0&&crd("🏆","تحليل مبيعات","#8B5CF6",()=>setSalesAnalysis(true))}
        {crd("🧾","بيان سعر","#8B5CF6",()=>setQuoteCust("pick"))}
        {crd("📋","سجل حركات البيع","#059669",()=>{setCustSalesLog("all");setLogFilter("");setLogTypeFilter("");setLogLimit(50)})}
        {crd("📦","كراتين","#0EA5E9",()=>setPkgPopup("list"))}
        {crd("📊","خط الانتاج","#059669",printProductionLine)}
        {crd("📋","تقرير الموسم","#EF4444",()=>setSeasonReport(true))}
        {crd("🏪","جرد المخزن","#8B5CF6",()=>setInvAudit({items:{},scanning:false}))}
        {canEdit&&crd("📥","استلام جاهز","#0EA5E9",()=>setStockRcv({items:{},scanning:false}))}
      </div>})()}
    {/* Active Session Matrix - Popup */}
    {activeSess&&aMods.length===0&&aCusts.length===0&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setActiveSession(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,textAlign:"center",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:40,marginBottom:8}}>📭</div>
        <div style={{fontSize:FS+1,fontWeight:700,color:T.textSec,marginBottom:12}}>جاري تحميل البيانات...</div>
        <Btn ghost onClick={()=>setActiveSession(null)}>✕ إغلاق</Btn>
      </div>
    </div>}
    {activeSess&&(aMods.length>0||aCusts.length>0)&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:24}} onClick={()=>closeMatrix()}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:"100%",maxWidth:isMob?"100%":window.innerWidth-48,maxHeight:"92vh",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:isMob?"12px 16px":"16px 24px",borderBottom:"1px solid "+T.brd,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{"📊 "+activeSess.date+" — جدول التوزيع"+(isSessClosed?" 🔒":"")}</div>
            <div style={{display:"flex",gap:4}}>
              {sessCanEdit&&<Btn small onClick={()=>setAddCustPick({sessId:activeSess.id,sel:{},filter:""})} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}} title="اضافة عميل">+ عميل</Btn>}
              {sessCanEdit&&<Btn small onClick={()=>{const existing=new Set(activeSess.modelIds);const avail=stockModels.filter(m=>m.stockQty>0&&!existing.has(m.id));if(avail.length===0){showToast("⚠️ لا توجد موديلات متاحة");return}setAddCustPick({sessId:activeSess.id,sel:{},filter:"",_type:"model",_avail:avail})}} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="اضافة موديل">+ موديل</Btn>}
              <Btn small onClick={()=>printSession(activeSess.id)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
              <Btn ghost small onClick={()=>closeMatrix()} title="إغلاق">✕</Btn>
            </div>
          </div>
          {cellError&&<div style={{padding:"6px 10px",borderRadius:8,background:T.err+"10",border:"1px solid "+T.err+"30",marginTop:8,fontSize:FS-1,fontWeight:700,color:T.err}}>{cellError}</div>}
        </div>
        <div style={{flex:1,overflowY:"auto",overflowX:"auto",padding:isMob?"8px 16px 16px":"8px 24px 24px"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:aMods.length*90+180}}>
          <thead style={{position:"sticky",top:0,zIndex:10,background:T.cardSolid}}><tr>
            <th style={{...TH,minWidth:130}}>العميل</th>
            {aMods.map(m=><th key={m.id} style={{...TH,textAlign:"center",minWidth:60,fontSize:FS-2,padding:"4px 6px"}}><div style={{fontWeight:800,color:T.accent,whiteSpace:"nowrap"}}>{m.modelNo}</div><div style={{fontSize:FS-3,color:T.textMut,whiteSpace:"nowrap"}}>{(m.rackSize||getRackSize(m.id))+"س"}</div></th>)}
            <th style={{...TH,textAlign:"center",background:"#0284C715",color:T.accent,fontWeight:800}}>اجمالي</th>
            <th style={{...TH,width:70}}></th>
          </tr></thead>
          <tbody>
            {aCusts.map((c,ci)=>{const rowTotal=aMods.reduce((s,m)=>s+(Number(aGrid[m.id+"_"+c.id])||0),0);
              return<tr key={c.id} style={{background:ci%2===0?"transparent":T.bg+"80"}}>
                <td style={{...TD,fontWeight:700}}>{c.name}<div style={{fontSize:FS-3,color:T.textMut}}>{c.phone}</div></td>
                {aMods.map((m,mi)=>{const k=m.id+"_"+c.id;const q=Number(aGrid[k])||0;const isEd=editCell===k;
                  return<td key={m.id} style={{...TD,textAlign:"center",padding:2,cursor:canEdit?"pointer":"default",background:isEd?T.warn+"10":q>0?T.ok+"04":"transparent"}}
                    onClick={()=>{if(!sessCanEdit||isEd)return;setEditCell(k);setEditVal(q);setCellError("")}}>
                    {isEd?<div style={{display:"flex",alignItems:"center",gap:1}}><input type="number" autoFocus value={editVal}
                      onFocus={e=>e.target.select()}
                      onChange={e=>{setEditVal(Number(e.target.value)||0);setCellError("")}}
                      onBlur={()=>{setTimeout(()=>{if(editCell===k)saveCell(activeSess.id,m.id,c.id,editVal)},150)}}
                      onKeyDown={e=>{if(e.key==="Enter"){saveCell(activeSess.id,m.id,c.id,editVal)}
                        if(e.key==="Tab"){e.preventDefault();saveCell(activeSess.id,m.id,c.id,editVal);const nextMi=mi+1;if(nextMi<aMods.length){const nk=aMods[nextMi].id+"_"+c.id;setTimeout(()=>{setEditCell(nk);setEditVal(Number(aGrid[nk])||0)},50)}}
                        if(e.key==="Escape"){setEditCell(null);setCellError("")}}}
                      style={{width:"100%",textAlign:"center",border:"2px solid "+T.accent,borderRadius:6,padding:"4px 2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",outline:"none",background:T.bg,color:T.text,boxSizing:"border-box"}}/>
                      <span onMouseDown={e=>{e.preventDefault();setEditCell(null);setCellError("")}} style={{cursor:"pointer",fontSize:10,color:T.err,flexShrink:0,padding:"0 2px"}}>✕</span></div>
                    :<div><span style={{fontWeight:q>0?800:400,color:q>0?T.accent:T.textMut+"50",fontSize:q>0?FS:FS-2}}>{q||"—"}</span>
                    {(()=>{const delivered=getDeliveredForSess(c.id,activeSess.id,m.id);if(delivered>0){const rem=q-delivered;return<div style={{fontSize:FS-3,lineHeight:1}}><span style={{color:"#10B981"}}>{"✓"+delivered}</span>{rem>0&&<span style={{color:"#F59E0B"}}>{" ⏳"+rem}</span>}</div>}return null})()}</div>}
                  </td>})}
                <td style={{...TD,textAlign:"center",fontWeight:800,color:T.accent,background:"#0284C706",fontSize:FS+1}}>{rowTotal||"—"}</td>
                <td style={{...TD,whiteSpace:"nowrap",padding:"2px 4px"}}>{rowTotal>0&&<div style={{display:"flex",gap:2}}>
                  <Btn small onClick={()=>{let h="<h2>🚚 اذن تسليم عميل</h2><table><tr><th>العميل</th><td><b>"+c.name+"</b></td><th>التليفون</th><td>"+c.phone+"</td></tr><tr><th>التاريخ</th><td>"+activeSess.date+"</td><th>العنوان</th><td>"+(c.address||"—")+"</td></tr></table><h2>تفاصيل الاستلام</h2><table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th></tr></thead><tbody>";
                    aMods.forEach(m=>{const q=Number(aGrid[m.id+"_"+c.id])||0;if(q>0)h+="<tr><td><b>"+m.modelNo+"</b></td><td>"+(m.modelDesc||"")+"</td><td style='font-weight:800;color:#0284C7'>"+q+"</td></tr>"});
                    h+="<tr style='background:#F1F5F9'><td colspan='2' style='font-weight:800'>الاجمالي</td><td style='font-weight:800;color:#0284C7;font-size:14px'>"+rowTotal+" قطعة</td></tr></tbody></table>";
                    h+="<div class='sig'><div class='sig-box'>مسؤول التسليم</div><div class='sig-box'>توقيع العميل<br/>"+c.name+"</div></div>";
                    printPage("اذن تسليم — "+c.name,h)}} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30",fontSize:9,padding:"2px 5px"}} title="طباعة">🖨</Btn>
                  <Btn small onClick={()=>{const lines=aMods.map(m=>{const q=Number(aGrid[m.id+"_"+c.id])||0;return q>0?"• موديل *"+m.modelNo+"*: *"+q+"* قطعة":null}).filter(Boolean).join("%0A");
                    const msg="*CLARK — اذن تسليم عميل*%0A%0A• العميل: *"+c.name+"*%0A• التاريخ: *"+activeSess.date+"*%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+rowTotal+"* قطعة%0A%0A*برجاء التأكيد*";
                    window.open("https://wa.me/"+(c.phone?c.phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630",fontSize:9,padding:"2px 5px"}} title="ارسال واتساب">📱</Btn>
                  <Btn small onClick={()=>{const items=aMods.map(m=>({no:m.modelNo,desc:orders.find(o=>o.id===m.id)?.modelDesc||"",qty:Number(aGrid[m.id+"_"+c.id])||0})).filter(x=>x.qty>0);printShippingLabel(c,activeSess.date,items,rowTotal,1)}} style={{background:"#6366F112",color:"#6366F1",border:"1px solid #6366F130",fontSize:9,padding:"2px 5px"}}>📮</Btn>
                  {sessCanEdit&&aMods.filter(m=>Number(aGrid[m.id+"_"+c.id])>0).length>0&&<Btn small onClick={()=>{const first=aMods.find(m=>Number(aGrid[m.id+"_"+c.id])>0);if(first)setReturnPopup({orderId:first.id,modelNo:first.modelNo,custId:c.id,custName:c.name,sessId:activeSess.id,models:aMods.filter(m=>Number(aGrid[m.id+"_"+c.id])>0)})}} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontSize:9,padding:"2px 5px"}}>↩️</Btn>}
                  {sessCanEdit&&<Btn small onClick={()=>{if(!confirm("حذف "+c.name+" من التوزيعة؟"))return;upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===activeSess.id);if(si>=0){d.custDeliverySessions[si].custIds=d.custDeliverySessions[si].custIds.filter(id=>id!==c.id);const g=d.custDeliverySessions[si].grid||{};Object.keys(g).forEach(k=>{if(k.endsWith("_"+c.id))delete g[k]})}});showToast("✓ تم حذف "+c.name)}} style={{background:"#EF444412",color:"#EF4444",border:"1px solid #EF444430",fontSize:9,padding:"2px 5px"}} title="حذف العميل">🗑</Btn>}
                </div>}</td>
              </tr>})}
            <tr style={{background:T.ok+"08"}}><td style={{...TD,fontWeight:800,color:T.ok}}>اجمالي تسليم</td>
              {aMods.map(m=>{const mt=aCusts.reduce((s,c)=>s+(Number(aGrid[m.id+"_"+c.id])||0),0);return<td key={m.id} style={{...TD,textAlign:"center",fontWeight:800,color:T.ok}}>{mt||"—"}</td>})}
              <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:"#fff",background:T.ok}}>{aCusts.reduce((s,c)=>s+aMods.reduce((ss,m)=>ss+(Number(aGrid[m.id+"_"+c.id])||0),0),0)}</td><td style={TD}></td></tr>
            <tr><td style={{...TD,fontWeight:700,color:T.textSec}}>استلام مخزن جاهز</td>
              {aMods.map(m=><td key={m.id} style={{...TD,textAlign:"center",fontWeight:700}}>{m.stockQty}</td>)}
              <td style={TD}></td><td style={TD}></td></tr>
            <tr><td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>مباع فعلي</td>
              {aMods.map(m=>{const o=orders.find(x=>x.id===m.id);const cd=(o?.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o?.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const net=cd-ret;return<td key={m.id} style={{...TD,textAlign:"center",fontWeight:700,color:net>0?"#8B5CF6":T.textMut}}>{net||"—"}{ret>0&&<span style={{fontSize:FS-3,color:T.ok}}>{" +"+ret+" مرتجع"}</span>}</td>})}
              <td style={TD}></td><td style={TD}></td></tr>
            <tr style={{background:"#F59E0B06"}}><td style={{...TD,fontWeight:800,color:T.warn}}>رصيد متاح</td>
              {aMods.map(m=>{const o=orders.find(x=>x.id===m.id);const cd=(o?.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o?.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);const avail=m.stockQty-(cd-ret);return<td key={m.id} style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+1,color:avail>0?"#F59E0B":"#EF4444"}}>{avail}</td>})}
              <td style={{...TD,textAlign:"center",fontWeight:800,color:T.warn}}>{aMods.reduce((s,m)=>{const o=orders.find(x=>x.id===m.id);const cd=(o?.customerDeliveries||[]).reduce((ss,d)=>ss+(Number(d.qty)||0),0);const ret=(o?.customerReturns||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0);return s+(m.stockQty-(cd-ret))},0)}</td><td style={TD}></td></tr>
            {sessCanEdit&&<tr><td style={{...TD,fontWeight:700,color:"#8B5CF6"}}>💰 سعر البيع</td>
              {aMods.map(m=><td key={m.id} style={{...TD,textAlign:"center",padding:2}}>
                <input type="number" value={m.sellPrice||""} onChange={e=>setSellPrice(m.id,e.target.value)} placeholder="0"
                  style={{width:"100%",textAlign:"center",border:"1px solid "+T.brd,borderRadius:4,padding:"2px",fontSize:FS-2,fontWeight:700,fontFamily:"inherit",background:T.bg,color:"#8B5CF6"}}/>
              </td>)}
              <td style={{...TD,textAlign:"center",fontWeight:800,color:"#8B5CF6"}}>{fmt(aCusts.reduce((s,c)=>s+aMods.reduce((ss,m)=>ss+(Number(aGrid[m.id+"_"+c.id])||0)*(m.sellPrice||0),0),0))+" ج"}</td><td style={TD}></td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"center",padding:"12px 24px",borderTop:"1px solid "+T.brd,flexShrink:0,flexWrap:"wrap"}}>
        <Btn onClick={()=>printSession(activeSess.id)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30",padding:"8px 20px"}} title="طباعة جدول التوزيع">🖨 طباعة الجدول</Btn>
        <Btn onClick={()=>{const sel={};aCusts.forEach(c=>{sel[c.id]=true});setGroupPrint({sessId:activeSess.id,selCusts:sel,receiver:""})}} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",padding:"8px 20px"}}>🖨 طباعة مجمعة</Btn>
        <Btn ghost onClick={()=>closeMatrix()} style={{padding:"8px 20px"}}>✕ الغاء</Btn>
        <Btn onClick={()=>closeMatrix(true)} style={{background:T.ok,color:"#fff",border:"none",fontWeight:700,padding:"8px 24px"}}>✓ تأكيد وإغلاق</Btn>
      </div>
    </div></div>}
    {/* Grouped Print Popup */}
    {groupPrint&&(()=>{const sess=sessions.find(s=>s.id===groupPrint.sessId);if(!sess)return null;
      const gCusts=sess.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean);const gMods=sess.modelIds.map(id=>{const o=orders.find(x=>x.id===id);return o?{id:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc||""}:null}).filter(Boolean);
      const g=sess.grid||{};const selCount=Object.values(groupPrint.selCusts).filter(Boolean).length;
      const selTotal=gCusts.filter(c=>groupPrint.selCusts[c.id]).reduce((s,c)=>gMods.reduce((ss,m)=>ss+(Number(g[m.id+"_"+c.id])||0),0)+s,0);
      const doPrintGroup=()=>{const selC=gCusts.filter(c=>groupPrint.selCusts[c.id]);if(selC.length===0){showToast("⚠️ اختار عميل واحد على الأقل");return}
        let h="<h2 style='text-align:center'>CLARK — إذن تسليم مجمع</h2>";
        h+="<table style='margin:0 auto 16px;font-size:12px'><tr><td style='padding:4px 12px;font-weight:700'>التاريخ</td><td style='padding:4px 12px'>"+sess.date+"</td>"+(groupPrint.receiver?"<td style='padding:4px 12px;font-weight:700'>المستلم</td><td style='padding:4px 12px;font-weight:800;font-size:14px'>"+groupPrint.receiver+"</td>":"")+"</tr></table>";
        let grandTotal=0;selC.forEach(c=>{let custTotal=0;
          h+="<h3 style='margin-top:14px;padding:4px 8px;background:#EFF6FF;border-right:4px solid #0EA5E9'>"+c.name+"</h3>";
          h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th></tr></thead><tbody>";
          gMods.forEach(m=>{const q=Number(g[m.id+"_"+c.id])||0;if(q>0){custTotal+=q;h+="<tr><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+q+"</td></tr>"}});
          h+="<tr style='background:#F0F9FF;font-weight:800'><td colspan='2'>اجمالي "+c.name+"</td><td style='text-align:center;color:#0EA5E9'>"+custTotal+"</td></tr></tbody></table>";grandTotal+=custTotal});
        h+="<div style='margin-top:16px;padding:10px;background:#F1F5F9;border-radius:8px;text-align:center;font-weight:800;font-size:16px'>الاجمالي الكلي: "+selCount+" عملاء | "+grandTotal+" قطعة</div>";
        h+="<div class='sig'><div class='sig-box'>مسؤول التسليم</div><div class='sig-box'>المستلم"+(groupPrint.receiver?"<br><b>"+groupPrint.receiver+"</b>":"")+"</div><div class='sig-box'>المراجع</div></div>";
        printPage("تسليم مجمع — "+sess.date,h);setGroupPrint(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setGroupPrint(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🖨 طباعة مجمعة</div>
            <Btn ghost small onClick={()=>setGroupPrint(null)}>✕</Btn>
          </div>
          <div style={{fontSize:FS-1,fontWeight:700,color:T.text,marginBottom:8}}>اختار العملاء:</div>
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            <Btn small onClick={()=>setGroupPrint(p=>{const sel={};gCusts.forEach(c=>{sel[c.id]=true});return{...p,selCusts:sel}})} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",fontSize:FS-2}}>اختار الكل</Btn>
            <Btn small onClick={()=>setGroupPrint(p=>({...p,selCusts:{}}))} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>إلغاء الكل</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
            {gCusts.map(c=>{const t=gMods.reduce((s,m)=>s+(Number(g[m.id+"_"+c.id])||0),0);if(t<=0)return null;
              return<div key={c.id} onClick={()=>setGroupPrint(p=>({...p,selCusts:{...p.selCusts,[c.id]:!p.selCusts[c.id]}}))} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderRadius:10,cursor:"pointer",border:"1px solid "+(groupPrint.selCusts[c.id]?"#8B5CF640":T.brd),background:groupPrint.selCusts[c.id]?"#8B5CF608":"transparent"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>{groupPrint.selCusts[c.id]?"☑":"☐"}</span>
                  <span style={{fontWeight:700,color:groupPrint.selCusts[c.id]?"#8B5CF6":T.text}}>{c.name}</span>
                </div>
                <span style={{fontWeight:700,color:T.accent}}>{t+" قطعة"}</span>
              </div>})}
          </div>
          <div style={{marginBottom:12}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم المستلم</label><Inp value={groupPrint.receiver} onChange={v=>setGroupPrint(p=>({...p,receiver:v}))} placeholder="اسم المندوب / المستلم..."/></div>
          <div style={{padding:10,borderRadius:10,background:T.bg,textAlign:"center",marginBottom:12}}>
            <span style={{fontWeight:800,color:"#8B5CF6"}}>{selCount+" عملاء"}</span><span style={{color:T.textMut}}>{" | "}</span><span style={{fontWeight:800,color:T.accent}}>{selTotal+" قطعة"}</span>
          </div>
          <Btn onClick={doPrintGroup} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>🖨 طباعة</Btn>
        </div>
      </div>})()}
    {/* Add Customer to Session Popup */}
    {addCustPick&&(()=>{const sess=sessions.find(s=>s.id===addCustPick.sessId);if(!sess)return null;
      const isModel=addCustPick._type==="model";
      const selCount=Object.values(addCustPick.sel).filter(Boolean).length;
      if(isModel){
        const mAvail=addCustPick._avail||[];const filtered=mAvail.filter(m=>{if(!addCustPick.filter?.trim())return true;const q=addCustPick.filter.trim().toLowerCase();return(m.modelNo||"").includes(q)||(m.modelDesc||"").toLowerCase().includes(q)});
        const doAddModels=()=>{const ids=Object.entries(addCustPick.sel).filter(([,v])=>v).map(([k])=>k);if(ids.length===0){showToast("⚠️ اختار موديل واحد على الأقل");return}
          upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===addCustPick.sessId);if(si>=0){ids.forEach(id=>{if(!d.custDeliverySessions[si].modelIds.includes(id))d.custDeliverySessions[si].modelIds.push(id)})}});
          showToast("✅ تم اضافة "+ids.length+" موديل");setAddCustPick(null)};
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAddCustPick(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>+ اضافة موديلات للتوزيعة</div>
              <Btn ghost small onClick={()=>setAddCustPick(null)}>✕</Btn>
            </div>
            <div style={{marginBottom:10}}><Inp value={addCustPick.filter||""} onChange={v=>setAddCustPick(p=>({...p,filter:v}))} placeholder="بحث برقم الموديل أو الوصف..."/></div>
            {mAvail.length===0?<div style={{textAlign:"center",padding:20,color:T.textMut}}>كل الموديلات المتاحة مضافة</div>:
            <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
              {filtered.map(m=><div key={m.id} onClick={()=>setAddCustPick(p=>({...p,sel:{...p.sel,[m.id]:!p.sel[m.id]}}))} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:10,cursor:"pointer",border:"1px solid "+(addCustPick.sel[m.id]?"#8B5CF640":T.brd),background:addCustPick.sel[m.id]?"#8B5CF608":"transparent"}}>
                <span style={{fontSize:16}}>{addCustPick.sel[m.id]?"☑":"☐"}</span>
                <div style={{flex:1}}><div style={{fontWeight:700,color:addCustPick.sel[m.id]?"#8B5CF6":T.accent}}>{m.modelNo}</div><div style={{fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</div></div>
                <span style={{fontWeight:700,color:T.ok,fontSize:FS-1}}>{m.avail+" قطعة"}</span>
              </div>)}
            </div>}
            {selCount>0&&<Btn onClick={doAddModels} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"✅ اضافة "+selCount+" موديل"}</Btn>}
          </div>
        </div>
      }
      const existing=new Set(sess.custIds);const avail=customers.filter(c=>!existing.has(c.id));
      const filtered=avail.filter(c=>{if(!addCustPick.filter?.trim())return true;const q=addCustPick.filter.trim().toLowerCase();return(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q)});
      const doAdd=()=>{const ids=Object.entries(addCustPick.sel).filter(([,v])=>v).map(([k])=>k);if(ids.length===0){showToast("⚠️ اختار عميل واحد على الأقل");return}
        upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===addCustPick.sessId);if(si>=0){ids.forEach(id=>{if(!d.custDeliverySessions[si].custIds.includes(id))d.custDeliverySessions[si].custIds.push(id)})}});
        showToast("✅ تم اضافة "+ids.length+" عميل");setAddCustPick(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAddCustPick(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>+ اضافة عملاء للتوزيعة</div>
            <Btn ghost small onClick={()=>setAddCustPick(null)}>✕</Btn>
          </div>
          <div style={{marginBottom:10}}><Inp value={addCustPick.filter||""} onChange={v=>setAddCustPick(p=>({...p,filter:v}))} placeholder="بحث بالاسم أو التليفون..."/></div>
          {avail.length===0?<div style={{textAlign:"center",padding:20,color:T.textMut}}>كل العملاء مضافين للتوزيعة</div>:
          <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
            {filtered.map(c=><div key={c.id} onClick={()=>setAddCustPick(p=>({...p,sel:{...p.sel,[c.id]:!p.sel[c.id]}}))} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:10,cursor:"pointer",border:"1px solid "+(addCustPick.sel[c.id]?T.ok+"40":T.brd),background:addCustPick.sel[c.id]?T.ok+"08":"transparent"}}>
              <span style={{fontSize:16}}>{addCustPick.sel[c.id]?"☑":"☐"}</span>
              <div style={{flex:1}}><div style={{fontWeight:700,color:addCustPick.sel[c.id]?T.ok:T.text}}>{c.name}</div><div style={{fontSize:FS-3,color:T.textMut}}>{c.phone||""}{c.type?" | "+c.type:""}</div></div>
            </div>)}
          </div>}
          {selCount>0&&<Btn onClick={doAdd} style={{background:T.ok,color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"✅ اضافة "+selCount+" عميل"}</Btn>}
        </div>
      </div>})()}
    {/* ══ Sales Dashboard + Stale Alerts ══ */}
    {(()=>{const totalStock=stockModels.reduce((s,m)=>s+m.stockQty,0);const totalSold=stockModels.reduce((s,m)=>s+m.custDel,0);const totalRemain=stockModels.reduce((s,m)=>s+m.avail,0);const pct=totalStock?Math.round(totalSold/totalStock*100):0;
      const totalRevenue=stockModels.reduce((s,m)=>s+m.custDel*(Number(orders.find(o=>o.id===m.id)?.sellPrice)||0),0);
      const totalCost=orders.reduce((s,o)=>{const t=calcOrder(o);return s+(t.totalCost||0)},0);
      /* Today/Week/Month sales */
      const now=new Date();const todayStr=now.toISOString().split("T")[0];
      const weekAgo=new Date(now-7*86400000).toISOString().split("T")[0];
      const monthAgo=new Date(now-30*86400000).toISOString().split("T")[0];
      let salesToday=0,salesWeek=0,salesMonth=0,revToday=0,revWeek=0,revMonth=0;
      orders.forEach(o=>{const price=Number(o.sellPrice)||0;(o.customerDeliveries||[]).forEach(d=>{const q=Number(d.qty)||0;if(d.date===todayStr){salesToday+=q;revToday+=q*price}if(d.date>=weekAgo){salesWeek+=q;revWeek+=q*price}if(d.date>=monthAgo){salesMonth+=q;revMonth+=q*price}})});
      /* Stale models: in stock > 14 days with no sales */
      const staleModels=stockModels.filter(m=>{if(m.avail<=0)return false;const o=orders.find(x=>x.id===m.id);if(!o)return false;
        const lastSaleDate=(o.customerDeliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const lastStockDate=(o.deliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const refDate=lastSaleDate||lastStockDate||o.date;const days=Math.floor((now-new Date(refDate))/86400000);return days>=14}).map(m=>{
        const o=orders.find(x=>x.id===m.id);const lastSaleDate=(o?.customerDeliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const lastStockDate=(o?.deliveries||[]).reduce((latest,d)=>d.date>latest?d.date:latest,"");
        const refDate=lastSaleDate||lastStockDate||o?.date||"";const days=Math.floor((now-new Date(refDate))/86400000);
        return{...m,days,lastDate:refDate}}).sort((a,b)=>b.days-a.days);
      return<div style={{marginBottom:16}}>
        <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMob?8:12,marginBottom:14}}>
          <div style={{padding:12,borderRadius:12,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>تسليم مخزن جاهز</div><div style={{fontSize:isMob?18:24,fontWeight:800,color:T.accent}}>{fmt(totalStock)}</div></div>
          <div style={{padding:12,borderRadius:12,background:T.ok+"08",border:"1px solid "+T.ok+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>المبيعات</div><div style={{fontSize:isMob?18:24,fontWeight:800,color:T.ok}}>{fmt(totalSold)}</div><div style={{fontSize:FS-3,color:T.ok}}>{pct+"%"}</div></div>
          <div style={{padding:12,borderRadius:12,background:T.warn+"08",border:"1px solid "+T.warn+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>رصيد متاح</div><div style={{fontSize:isMob?18:24,fontWeight:800,color:T.warn}}>{fmt(totalRemain)}</div></div>
          <div style={{padding:12,borderRadius:12,background:"#8B5CF608",border:"1px solid #8B5CF615",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>الإيرادات</div><div style={{fontSize:isMob?18:24,fontWeight:800,color:"#8B5CF6"}}>{fmt(totalRevenue)}</div><div style={{fontSize:FS-3,color:T.textMut}}>ج.م</div></div>
        </div>
        {/* Live sales ticker */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
          <div style={{padding:10,borderRadius:10,background:"linear-gradient(135deg,#059669,#10B981)",textAlign:"center",color:"#fff"}}><div style={{fontSize:FS-3,opacity:0.8}}>اليوم</div><div style={{fontSize:FS+2,fontWeight:800}}>{salesToday+" ق"}</div><div style={{fontSize:FS-3,opacity:0.7}}>{fmt(revToday)+" ج"}</div></div>
          <div style={{padding:10,borderRadius:10,background:"linear-gradient(135deg,#0EA5E9,#38BDF8)",textAlign:"center",color:"#fff"}}><div style={{fontSize:FS-3,opacity:0.8}}>الأسبوع</div><div style={{fontSize:FS+2,fontWeight:800}}>{salesWeek+" ق"}</div><div style={{fontSize:FS-3,opacity:0.7}}>{fmt(revWeek)+" ج"}</div></div>
          <div style={{padding:10,borderRadius:10,background:"linear-gradient(135deg,#8B5CF6,#A78BFA)",textAlign:"center",color:"#fff"}}><div style={{fontSize:FS-3,opacity:0.8}}>الشهر</div><div style={{fontSize:FS+2,fontWeight:800}}>{salesMonth+" ق"}</div><div style={{fontSize:FS-3,opacity:0.7}}>{fmt(revMonth)+" ج"}</div></div>
        </div>
        {/* Stale models alert */}
        {staleModels.length>0&&<div style={{padding:12,borderRadius:12,background:"#FEF2F2",border:"1px solid #EF444420",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontWeight:800,color:"#EF4444",fontSize:FS}}>{"⚠️ موديلات راكدة ("+staleModels.length+")"}</div>
            <Btn small onClick={()=>{let h="<h2>⚠️ تقرير الموديلات الراكدة</h2><p style='margin-bottom:12px'>موديلات في المخزن بدون حركة بيع لأكثر من 14 يوم</p>";
              h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الرصيد</th><th>آخر حركة</th><th>الأيام</th><th>الحالة</th></tr></thead><tbody>";
              staleModels.forEach(m=>{h+="<tr style='background:"+(m.days>=30?"#FEF2F2":"transparent")+"'><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center;font-weight:700;color:#F59E0B'>"+m.avail+"</td><td style='text-align:center'>"+m.lastDate+"</td><td style='text-align:center;font-weight:800;color:"+(m.days>=30?"#EF4444":"#F59E0B")+"'>"+m.days+"</td><td style='text-align:center'>"+(m.days>=30?"🔴 حرج":"🟡 تحذير")+"</td></tr>"});
              h+="</tbody></table>";printPage("تقرير الموديلات الراكدة",h)}} style={{background:"#EF444412",color:"#EF4444",border:"1px solid #EF444430"}}>🖨</Btn>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {staleModels.slice(0,5).map(m=><div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderRadius:8,background:"#fff",border:"1px solid #EF444410"}}>
              <div><span style={{fontWeight:700,color:T.accent}}>{m.modelNo}</span><span style={{fontSize:FS-3,color:T.textMut,marginRight:6}}>{" "+m.modelDesc}</span></div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{fontSize:FS-2,color:"#F59E0B",fontWeight:700}}>{m.avail+" قطعة"}</span><span style={{fontSize:FS-2,fontWeight:800,color:m.days>=30?"#EF4444":"#F59E0B"}}>{m.days+" يوم"}</span></div>
            </div>)}
            {staleModels.length>5&&<div style={{textAlign:"center",fontSize:FS-2,color:"#EF4444",fontWeight:600}}>{"و "+( staleModels.length-5)+" موديل آخر..."}</div>}
          </div>
        </div>}
      </div>})()}
    {/* Season Report Popup */}
    {seasonReport&&(()=>{
      const totalCut=orders.reduce((s,o)=>s+calcOrder(o).cutQty,0);
      const totalWsDel=orders.reduce((s,o)=>s+(o.workshopDeliveries||[]).reduce((ss,wd)=>ss+(Number(wd.qty)||0),0),0);
      const totalWsRcv=orders.reduce((s,o)=>s+(o.workshopDeliveries||[]).reduce((ss,wd)=>(wd.receives||[]).reduce((sss,r)=>sss+(Number(r.qty)||0),0)+ss,0),0);
      const totalStockDel=orders.reduce((s,o)=>s+(o.deliveries||[]).reduce((ss,d)=>ss+(Number(d.qty)||0),0),0);
      const totalCustDel=orders.reduce((s,o)=>s+(o.customerDeliveries||[]).reduce((ss,d)=>ss+(Number(d.qty)||0),0),0);
      const totalCustRet=orders.reduce((s,o)=>s+(o.customerReturns||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0),0);
      const netSold=totalCustDel-totalCustRet;const staleCount=stockModels.filter(m=>m.avail>0).length;
      const totalRevenue=orders.reduce((s,o)=>{const price=Number(o.sellPrice)||0;const net=(o.customerDeliveries||[]).reduce((ss,d)=>ss+(Number(d.qty)||0),0)-(o.customerReturns||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0);return s+net*price},0);
      const totalCost=orders.reduce((s,o)=>s+(calcOrder(o).totalCost||0),0);
      const profit=totalRevenue-totalCost;const profitPct=totalRevenue?Math.round(profit/totalRevenue*100):0;
      const topModels=[...orders].map(o=>{const del=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return{modelNo:o.modelNo,desc:o.modelDesc,sold:del,price:Number(o.sellPrice)||0,revenue:del*(Number(o.sellPrice)||0)}}).filter(m=>m.sold>0).sort((a,b)=>b.sold-a.sold).slice(0,5);
      const topCusts=[...customers].map(c=>({name:c.name,total:getCustTotal(c.id)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total).slice(0,5);
      const worstModels=[...stockModels].filter(m=>m.avail>0).sort((a,b)=>b.avail-a.avail).slice(0,5);
      const printSeason=()=>{let h="<h2 style='text-align:center'>📋 تقرير نهاية الموسم — "+season+"</h2>";
        h+="<h3>ملخص الانتاج</h3><table><tbody>";
        h+="<tr><td style='font-weight:700'>عدد الموديلات</td><td style='font-weight:800'>"+orders.length+"</td><td style='font-weight:700'>اجمالي القص</td><td style='font-weight:800'>"+fmt(totalCut)+"</td></tr>";
        h+="<tr><td style='font-weight:700'>تسليم ورش</td><td>"+fmt(totalWsDel)+"</td><td style='font-weight:700'>استلام ورش</td><td>"+fmt(totalWsRcv)+"</td></tr>";
        h+="<tr><td style='font-weight:700'>مخزن جاهز</td><td>"+fmt(totalStockDel)+"</td><td style='font-weight:700'>نسبة الانجاز</td><td style='font-weight:800;color:#0EA5E9'>"+(totalCut?Math.round(totalStockDel/totalCut*100):0)+"%</td></tr>";
        h+="</tbody></table>";
        h+="<h3>ملخص المبيعات</h3><table><tbody>";
        h+="<tr><td style='font-weight:700'>اجمالي المبيعات</td><td style='font-weight:800;color:#10B981'>"+fmt(netSold)+" قطعة</td><td style='font-weight:700'>المرتجعات</td><td style='color:#EF4444'>"+fmt(totalCustRet)+" ("+(totalCustDel?Math.round(totalCustRet/totalCustDel*100):0)+"%)</td></tr>";
        h+="<tr><td style='font-weight:700'>الرصيد المتبقي</td><td style='color:#F59E0B;font-weight:700'>"+fmt(totalStockDel-netSold)+" قطعة</td><td style='font-weight:700'>نسبة البيع</td><td style='font-weight:800;color:#8B5CF6'>"+(totalStockDel?Math.round(netSold/totalStockDel*100):0)+"%</td></tr>";
        h+="</tbody></table>";
        h+="<h3>الأداء المالي</h3><table><tbody>";
        h+="<tr><td style='font-weight:700'>اجمالي الإيرادات</td><td style='font-weight:800;color:#0EA5E9'>"+fmt(totalRevenue)+" ج.م</td></tr>";
        h+="<tr><td style='font-weight:700'>اجمالي التكاليف</td><td>"+fmt(r2(totalCost))+" ج.م</td></tr>";
        h+="<tr><td style='font-weight:700'>صافي الربح</td><td style='font-weight:800;color:"+(profit>=0?"#10B981":"#EF4444")+"'>"+fmt(r2(profit))+" ج.م ("+profitPct+"%)</td></tr>";
        h+="</tbody></table>";
        h+="<h3>أفضل 5 موديلات مبيعاً</h3><table><thead><tr><th>#</th><th>الموديل</th><th>الوصف</th><th>المبيعات</th><th>الإيراد</th></tr></thead><tbody>";
        topModels.forEach((m,i)=>{h+="<tr><td>"+(i+1)+"</td><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.desc+"</td><td style='text-align:center;font-weight:700'>"+m.sold+"</td><td style='text-align:center'>"+fmt(m.revenue)+"</td></tr>"});
        h+="</tbody></table>";
        h+="<h3>أفضل 5 عملاء</h3><table><thead><tr><th>#</th><th>العميل</th><th>اجمالي القطع</th></tr></thead><tbody>";
        topCusts.forEach((c,i)=>{h+="<tr><td>"+(i+1)+"</td><td style='font-weight:700'>"+c.name+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+c.total+"</td></tr>"});
        h+="</tbody></table>";
        if(worstModels.length>0){h+="<h3>موديلات راكدة (أعلى رصيد)</h3><table><thead><tr><th>#</th><th>الموديل</th><th>الوصف</th><th>الرصيد</th></tr></thead><tbody>";
          worstModels.forEach((m,i)=>{h+="<tr style='background:#FEF2F2'><td>"+(i+1)+"</td><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center;font-weight:800;color:#EF4444'>"+m.avail+"</td></tr>"});
          h+="</tbody></table>"}
        printPage("تقرير الموسم — "+season,h)};
      const mc=(label,val,color,sub)=><div style={{padding:12,borderRadius:12,background:color+"08",border:"1px solid "+color+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>{label}</div><div style={{fontSize:isMob?16:22,fontWeight:800,color}}>{val}</div>{sub&&<div style={{fontSize:FS-3,color:T.textMut}}>{sub}</div>}</div>;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setSeasonReport(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":800,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+4,fontWeight:900,color:"#EF4444"}}>{"📋 تقرير الموسم — "+season}</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printSeason} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>setSeasonReport(false)}>✕</Btn></div>
          </div>
          <div style={{fontSize:FS,fontWeight:700,color:T.textSec,marginBottom:8}}>ملخص الانتاج</div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"repeat(2,1fr)":"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {mc("الموديلات",orders.length,"#0EA5E9")}
            {mc("القص",fmt(totalCut),T.accent)}
            {mc("ورش تسليم",fmt(totalWsDel),"#F59E0B")}
            {mc("ورش استلام",fmt(totalWsRcv),"#10B981")}
            {mc("مخزن جاهز",fmt(totalStockDel),"#059669")}
            {mc("المبيعات",fmt(netSold),"#10B981",(totalStockDel?Math.round(netSold/totalStockDel*100):0)+"%")}
            {mc("المرتجعات",fmt(totalCustRet),"#EF4444",(totalCustDel?Math.round(totalCustRet/totalCustDel*100):0)+"%")}
            {mc("الراكد",fmt(totalStockDel-netSold),"#F59E0B",staleCount+" موديل")}
          </div>
          <div style={{fontSize:FS,fontWeight:700,color:T.textSec,marginBottom:8}}>الأداء المالي</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
            {mc("الإيرادات",fmt(totalRevenue)+" ج","#0EA5E9")}
            {mc("التكاليف",fmt(r2(totalCost))+" ج","#F59E0B")}
            <div style={{padding:12,borderRadius:12,background:profit>=0?"#10B98108":"#EF444408",border:"1px solid "+(profit>=0?"#10B98115":"#EF444415"),textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>صافي الربح</div><div style={{fontSize:isMob?16:22,fontWeight:800,color:profit>=0?"#10B981":"#EF4444"}}>{fmt(r2(profit))+" ج"}</div><div style={{fontSize:FS-3,color:T.textMut}}>{profitPct+"%"}</div></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12}}>
            <div><div style={{fontSize:FS,fontWeight:700,color:"#10B981",marginBottom:6}}>🏆 أفضل 5 موديلات</div>
              {topModels.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:i%2===0?T.bg+"80":"transparent"}}><span style={{fontWeight:700,color:T.accent}}>{(i+1)+". "+m.modelNo}</span><span style={{fontWeight:700,color:"#10B981"}}>{m.sold+" ق"}</span></div>)}
            </div>
            <div><div style={{fontSize:FS,fontWeight:700,color:"#0EA5E9",marginBottom:6}}>👥 أفضل 5 عملاء</div>
              {topCusts.map((c,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:i%2===0?T.bg+"80":"transparent"}}><span style={{fontWeight:700}}>{(i+1)+". "+c.name}</span><span style={{fontWeight:700,color:"#0EA5E9"}}>{c.total+" ق"}</span></div>)}
            </div>
          </div>
          {worstModels.length>0&&<div style={{marginTop:12}}><div style={{fontSize:FS,fontWeight:700,color:"#EF4444",marginBottom:6}}>⚠️ أعلى رصيد راكد</div>
            {worstModels.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,background:"#FEF2F2"}}><span style={{fontWeight:700,color:T.accent}}>{m.modelNo+" — "+m.modelDesc}</span><span style={{fontWeight:800,color:"#EF4444"}}>{m.avail+" قطعة"}</span></div>)}
          </div>}
        </div>
      </div>})()}
    {/* Customer Statement Popup */}
    {custStatement==="pick"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCustStatement(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:500,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>📄 كشف حساب — اختر العميل</div>
          <Btn ghost small onClick={()=>setCustStatement(null)} title="إغلاق">✕</Btn>
        </div>
        <div style={{marginBottom:10}}><Inp value={custFilter} onChange={setCustFilter} placeholder="بحث بالاسم أو التليفون..."/></div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {customers.filter(c=>{if(!custFilter.trim())return true;const q=custFilter.trim().toLowerCase();return(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q)}).map(c=><div key={c.id} onClick={()=>{setCustStatement(c.id);setCustFilter("")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+T.brd}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div><span style={{fontWeight:700}}>{c.name}</span>{c.type&&<span style={{fontSize:FS-3,color:T.textMut,marginRight:6}}>{" ("+c.type+")"}</span>}</div>
            <span style={{fontSize:FS-1,color:T.accent,fontWeight:600}}>{"صافي: "+getCustTotal(c.id)}</span>
          </div>)}
        </div>
      </div>
    </div>}
    {custStatement&&custStatement!=="pick"&&(()=>{const cust=customers.find(c=>c.id===custStatement);if(!cust)return null;
      const rows=[];let totalDel=0,totalRet=0;
      orders.forEach(o=>{const del=(o.customerDeliveries||[]).filter(d=>d.custId===custStatement).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).filter(r=>r.custId===custStatement).reduce((s,r)=>s+(Number(r.qty)||0),0);
        if(del>0||ret>0){totalDel+=del;totalRet+=ret;rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,delivered:del,returned:ret,net:del-ret,sellPrice:Number(o.sellPrice)||0})}});
      const totalNet=totalDel-totalRet;const totalVal=rows.reduce((s,r)=>s+r.net*r.sellPrice,0);
      const printStatement=()=>{let h="<h2 style='text-align:center'>📄 كشف حساب عميل</h2><table style='margin:0 auto 16px'><tr><th style='text-align:right;padding:4px 12px'>العميل</th><td style='padding:4px 12px;font-weight:800'>"+cust.name+"</td><th style='text-align:right;padding:4px 12px'>النوع</th><td style='padding:4px 12px'>"+(cust.type||"—")+"</td></tr><tr><th style='text-align:right;padding:4px 12px'>التليفون</th><td style='padding:4px 12px'>"+cust.phone+"</td><th style='text-align:right;padding:4px 12px'>العنوان</th><td style='padding:4px 12px'>"+(cust.address||"—")+"</td></tr></table>";
        h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>تسليم</th><th>مرتجع</th><th>صافي</th><th>سعر</th><th>القيمة</th></tr></thead><tbody>";
        rows.forEach((r,i)=>{h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'><td style='font-weight:800;color:#0EA5E9'>"+r.modelNo+"</td><td>"+r.modelDesc+"</td><td style='text-align:center'>"+r.delivered+"</td><td style='text-align:center;color:#EF4444'>"+(r.returned||"—")+"</td><td style='text-align:center;font-weight:800'>"+r.net+"</td><td style='text-align:center'>"+(r.sellPrice||"—")+"</td><td style='text-align:center;font-weight:700'>"+fmt(r.net*r.sellPrice)+"</td></tr>"});
        h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='2'>الاجمالي</td><td style='text-align:center;color:#0EA5E9'>"+totalDel+"</td><td style='text-align:center;color:#EF4444'>"+totalRet+"</td><td style='text-align:center;font-size:14px'>"+totalNet+"</td><td></td><td style='text-align:center;color:#0EA5E9;font-size:14px'>"+fmt(totalVal)+" ج.م</td></tr></tbody></table>";
        h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل: "+cust.name+"</div></div>";
        printPage("كشف حساب — "+cust.name,h)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setCustStatement(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":700,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{"📄 كشف حساب — "+cust.name}</div><div style={{fontSize:FS-2,color:T.textMut}}>{(cust.type||"")+" | "+cust.phone}</div></div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printStatement} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn><Btn ghost small onClick={()=>setCustStatement("pick")}>← رجوع</Btn><Btn ghost small onClick={()=>setCustStatement(null)} title="إغلاق">✕</Btn></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,margin:"12px 0"}}>
            <div style={{padding:10,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>اجمالي التسليم</div><div style={{fontSize:18,fontWeight:800,color:T.accent}}>{fmt(totalDel)}</div></div>
            <div style={{padding:10,borderRadius:10,background:T.err+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>اجمالي المرتجع</div><div style={{fontSize:18,fontWeight:800,color:T.err}}>{fmt(totalRet)}</div></div>
            <div style={{padding:10,borderRadius:10,background:T.ok+"08",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>الصافي</div><div style={{fontSize:18,fontWeight:800,color:T.ok}}>{fmt(totalNet)}</div></div>
            <div style={{padding:10,borderRadius:10,background:"#8B5CF608",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>نسبة المبيعات</div><div style={{fontSize:18,fontWeight:800,color:"#8B5CF6"}}>{(()=>{const totalAllSold=stockModels.reduce((s,m)=>s+m.custDel,0);return totalAllSold>0?Math.round(totalNet/totalAllSold*100)+"%":"0%"})()}</div></div>
          </div>
          {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","تسليم","مرتجع","صافي","سعر","القيمة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
            {rows.map((r,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:T.accent}}>{r.modelNo}</td><td style={TD}>{r.modelDesc}</td><td style={{...TD,textAlign:"center"}}>{r.delivered}</td><td style={{...TD,textAlign:"center",color:r.returned?T.err:T.textMut}}>{r.returned||"—"}</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{r.net}</td><td style={{...TD,textAlign:"center"}}>{r.sellPrice||"—"}</td><td style={{...TD,textAlign:"center",fontWeight:700}}>{fmt(r.net*r.sellPrice)}</td></tr>)}
            <tr style={{background:T.accent+"08"}}><td colSpan={2} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,color:T.accent}}>{totalDel}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:T.err}}>{totalRet}</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2}}>{totalNet}</td><td style={TD}></td><td style={{...TD,textAlign:"center",fontWeight:800,color:T.accent}}>{fmt(totalVal)+" ج.م"}</td></tr>
          </tbody></table></div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد حركات لهذا العميل</div>}
        </div>
      </div>})()}
    {/* Sales Analysis Popup */}
    {salesAnalysis&&(()=>{const topCusts=[...customers].map(c=>({...c,total:getCustTotal(c.id)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);const totalStockAll=stockModels.reduce((s,m)=>s+m.stockQty,0);
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setSalesAnalysis(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":window.innerWidth-48,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🏆 تحليل مبيعات العملاء</div>
            <Btn ghost small onClick={()=>setSalesAnalysis(false)} title="إغلاق">✕</Btn>
          </div>
          {topCusts.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","العميل","النوع","تسليم","مرتجع","صافي","% من المخزن"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              {topCusts.map((c,i)=>{const ret=orders.reduce((s,o)=>(o.customerReturns||[]).filter(r=>r.custId===c.id).reduce((ss,r)=>ss+(Number(r.qty)||0),s),0);return<tr key={c.id} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}>{c.name}</td><td style={{...TD,fontSize:FS-2,color:T.textMut}}>{c.type||"—"}</td><td style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{fmt(c.total+ret)}</td><td style={{...TD,textAlign:"center",color:ret?T.err:T.textMut}}>{ret||"—"}</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{fmt(c.total)}</td><td style={{...TD,textAlign:"center",fontWeight:700,color:"#8B5CF6"}}>{(totalStockAll?Math.round(c.total/totalStockAll*100):0)+"%"}</td></tr>})}
            </tbody></table></div>:<div style={{textAlign:"center",padding:30,color:T.textMut}}>لا توجد مبيعات</div>}
        </div>
      </div>})()}
    {/* Customer List - toggled */}
    {showCustList&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:24}} onClick={()=>setShowCustList(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?700:900,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{"👥 العملاء ("+customers.length+")"}</div>
          <div style={{display:"flex",gap:4}}>
            {canEdit&&<Btn small primary onClick={()=>{setCName("");setCPhone("");setCAddr("");setCType("مكتب");setCEditId(null);setShowCustForm(true)}}>+ عميل جديد</Btn>}
            <Btn ghost small onClick={()=>setShowCustList(false)} title="إغلاق">✕</Btn>
          </div>
        </div>
        <div style={{marginBottom:10}}><Inp value={custFilter} onChange={setCustFilter} placeholder="بحث بالاسم أو رقم التليفون..."/></div>
        {(()=>{const fc=customers.filter(c=>{if(!custFilter.trim())return true;const q=custFilter.trim().toLowerCase();return(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q)||(c.type||"").includes(q)});
          return fc.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",whiteSpace:"nowrap"}}><thead><tr>{["#","الاسم","النوع","التليفون","العنوان","اجمالي",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          {fc.map((c,i)=>{const total=getCustTotal(c.id);return<tr key={c.id} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}>{c.name}</td><td style={{...TD,fontSize:FS-2,color:T.textSec}}>{c.type==="محل"?"🏪 محل":c.type==="أونلاين"?"🌐 أونلاين":c.type==="أخرى"?"📦 أخرى":"🏢 مكتب"}</td><td style={TD}>{c.phone}</td><td style={TD}>{c.address||"—"}</td><td style={{...TD,fontWeight:700,color:T.accent}}>{total||"—"}</td>
            {canEdit&&<td style={TD}><div style={{display:"flex",gap:3}}>
              <Btn small onClick={()=>setCustSalesLog(c.id)} style={{background:"#059669"+"12",color:"#059669",border:"1px solid #05966930"}} title="سجل مبيعات">📋</Btn>
              <Btn small onClick={()=>{setCName(c.name);setCPhone(c.phone);setCAddr(c.address||"");setCType(c.type||"مكتب");setCEditId(c.id);setShowCustForm(true)}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
              <Btn small onClick={()=>showCustQR(c)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="عرض كود QR">QR</Btn>
              <DelBtn onConfirm={()=>upConfig(d=>{d.customers=(d.customers||[]).filter(x=>x.id!==c.id)})} blocked={total>0?"لديه تسليمات":null}/>
            </div></td>}</tr>})}
        </tbody></table></div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{custFilter?"لا توجد نتائج":"سجّل عملاء أولاً"}</div>})()}
      </div>
    </div>}
    {/* Sessions Log */}
    <Card title={"📦 سجل التسليمات ("+sessions.length+")"}>
      <div style={{marginBottom:10}}><Inp value={sessFilterQ} onChange={setSessFilterQ} placeholder="فلتر بالتاريخ أو اسم العميل أو رقم الموديل..."/></div>
      {(()=>{const fSess=sortedSessions.filter(s=>{if(!sessFilterQ.trim())return true;const q=sessFilterQ.trim().toLowerCase();const mNos=s.modelIds.map(id=>{const o=orders.find(x=>x.id===id);return o?.modelNo||""}).join(" ").toLowerCase();const cNames=s.custIds.map(id=>{const c=customers.find(x=>x.id===id);return c?.name||""}).join(" ").toLowerCase();return(s.date||"").includes(q)||mNos.includes(q)||cNames.includes(q)});
        return fSess.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {fSess.map(s=>{const totalQty=Object.values(s.grid||{}).reduce((sum,v)=>sum+(Number(v)||0),0);const isActive=activeSession===s.id;const st=s.status||"جاري التجهيز";const stColor=st==="تم التسليم"?"#EF4444":st==="تم الشحن"?"#0EA5E9":"#F59E0B";
          const confirmed=s.saleConfirmed;const isFree=s.freeSale;const isClosed=st==="تم التسليم";
          return<div key={s.id} style={{padding:"12px 16px",borderRadius:12,background:isClosed?"#FEF2F2":isActive?T.accent+"08":T.cardSolid,border:isActive?"2px solid "+T.accent:isClosed?"1px solid #EF444430":confirmed?"1px solid #10B98130":"1px solid "+T.brd,cursor:"pointer",transition:"all 0.15s",opacity:isClosed?0.7:1}} onClick={()=>setActiveSession(isActive?null:s.id)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:18}}>{isClosed?"🔒":isFree?"🔓":"📦"}</span>
                <div><div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:FS,color:isClosed?"#EF4444":T.text,textDecoration:isClosed?"line-through":"none"}}>{(isFree?"بيع حر":"سجل توزيع")+" — "+s.date}</span><span style={{fontSize:FS-3,fontWeight:700,color:stColor,background:stColor+"15",padding:"1px 8px",borderRadius:6,border:"1px solid "+stColor+"30"}}>{st}</span>
                    {confirmed&&<span style={{fontSize:FS-3,fontWeight:700,color:"#10B981",background:"#10B98110",padding:"1px 8px",borderRadius:6}}>✅ بيع فعلي</span>}
                    {!confirmed&&!isFree&&<span style={{fontSize:FS-3,fontWeight:700,color:"#F59E0B",background:"#F59E0B10",padding:"1px 8px",borderRadius:6}}>⏳ خطة</span>}
                  </div>
                  <div style={{fontSize:FS-2,color:T.textMut}}>{(s.modelIds?.length||0)+" موديل × "+(s.custIds?.length||0)+" عميل | "+totalQty+" قطعة"+(s.actualSaleBy?" | بواسطة: "+s.actualSaleBy:"")}</div></div>
              </div>
              <div style={{display:"flex",gap:4,alignItems:"center"}} onClick={e=>e.stopPropagation()}>
                <select value={st} onChange={e=>updateSessStatus(s.id,e.target.value)} style={{padding:"3px 6px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",fontWeight:700,background:T.bg,color:stColor,cursor:"pointer"}}>{SESS_STATUSES.map(ss=><option key={ss} value={ss}>{ss}</option>)}</select>
                <Btn small onClick={()=>printSession(s.id)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة">🖨</Btn>
                {canEdit&&<DelBtn onConfirm={()=>delSession(s.id)} blocked={confirmed?"بيع فعلي":isClosed?"مغلقة":null}/>}
              </div>
            </div>
          </div>})}
      </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد تسليمات — اضغط "🚚 تسليم جديد"</div>})()}
    </Card>
    {/* ── Returns Log ── */}
    {(()=>{const allReturns=[];orders.forEach(o=>{(o.customerReturns||[]).forEach(r=>{allReturns.push({...r,orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc})})});
      allReturns.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      if(allReturns.length===0)return null;
      const filteredRet=allReturns.filter(r=>{if(!sessFilterQ.trim())return true;const q=sessFilterQ.trim().toLowerCase();return(r.modelNo||"").toLowerCase().includes(q)||(r.custName||"").toLowerCase().includes(q)||(r.date||"").includes(q)||(r.note||"").toLowerCase().includes(q)});
      const totalRetQty=filteredRet.reduce((s,r)=>s+(Number(r.qty)||0),0);
      const printReturns=()=>{const byCustomer={};filteredRet.forEach(r=>{const k=r.custName||"—";if(!byCustomer[k])byCustomer[k]=[];byCustomer[k].push(r)});
        let h="<h2 style='text-align:center;margin-bottom:4px'>↩️ سجل المرتجعات</h2><div style='text-align:center;color:#666;margin-bottom:16px'>اجمالي: "+totalRetQty+" قطعة | "+filteredRet.length+" عملية مرتجع</div>";
        h+="<table><thead><tr><th>#</th><th>التاريخ</th><th>العميل</th><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>ملاحظات</th><th>بواسطة</th></tr></thead><tbody>";
        filteredRet.forEach((r,i)=>{h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'><td>"+(i+1)+"</td><td>"+r.date+"</td><td><b>"+(r.custName||"—")+"</b></td><td style='font-weight:800;color:#0EA5E9'>"+r.modelNo+"</td><td>"+(r.modelDesc||"")+"</td><td style='font-weight:800;color:#EF4444;text-align:center'>"+r.qty+"</td><td>"+(r.note||"—")+"</td><td style='color:#888'>"+(r.createdBy||"—")+"</td></tr>"});
        h+="<tr style='background:#FEF2F2;font-weight:800'><td colspan='5'>الاجمالي</td><td style='color:#EF4444;font-size:16px;text-align:center'>"+totalRetQty+"</td><td colspan='2'></td></tr></tbody></table>";
        h+="<h3 style='margin-top:20px'>ملخص المرتجعات حسب العميل</h3><table><thead><tr><th>العميل</th><th>عدد العمليات</th><th>اجمالي الكمية</th></tr></thead><tbody>";
        Object.entries(byCustomer).sort((a,b)=>b[1].reduce((s,r)=>s+r.qty,0)-a[1].reduce((s,r)=>s+r.qty,0)).forEach(([name,rets],i)=>{const tq=rets.reduce((s,r)=>s+(Number(r.qty)||0),0);h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'><td style='font-weight:700'>"+name+"</td><td style='text-align:center'>"+rets.length+"</td><td style='text-align:center;font-weight:800;color:#EF4444'>"+tq+"</td></tr>"});
        h+="</tbody></table><div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>المراجع</div></div>";
        printPage("سجل المرتجعات",h)};
      return<Card title={"↩️ سجل المرتجعات ("+allReturns.length+")"} extra={<Btn small onClick={printReturns} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn>}>
        {filteredRet.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","التاريخ","العميل","الموديل","الكمية","ملاحظات","بواسطة",...(canEdit?[""]:[])] .map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
          {filteredRet.slice(0,20).map((r,i)=>{const isEd=editRetIdx===i;
            return<tr key={i} style={{background:isEd?T.warn+"08":i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={TD}>{r.date}</td><td style={{...TD,fontWeight:700}}>{r.custName||"—"}</td>
              <td style={{...TD,fontWeight:700,color:T.accent}}>{r.modelNo}</td>
              <td style={{...TD,fontWeight:800,color:T.err,textAlign:"center"}}>{isEd?<input type="number" value={editRetQty} onChange={e=>setEditRetQty(Number(e.target.value)||0)} style={{width:60,textAlign:"center",border:"2px solid "+T.warn,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit"}}/>:r.qty}</td>
              <td style={{...TD,fontSize:FS-2}}>{isEd?<input value={editRetNote} onChange={e=>setEditRetNote(e.target.value)} placeholder="ملاحظات" style={{width:"100%",border:"1px solid "+T.brd,borderRadius:4,padding:"2px 4px",fontSize:FS-2,fontFamily:"inherit"}}/>:(r.note||"—")}</td>
              <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{r.createdBy||"—"}</td>
            {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
              {isEd?<><Btn small primary onClick={()=>{if(editRetQty<=0){showToast("⚠️ كمية غير صالحة");return}updOrder(r.orderId,o=>{const ret=(o.customerReturns||[]).find(x=>x.custId===r.custId&&x.date===r.date&&(x.note||"")===(r.note||""));if(ret){ret.qty=editRetQty;ret.note=editRetNote}});setEditRetIdx(null);showToast("✓ تم التعديل")}} title="حفظ">💾</Btn><Btn ghost small onClick={()=>setEditRetIdx(null)} title="إلغاء">✕</Btn></>
              :<><Btn small onClick={()=>{const h="<h2 style='text-align:center'>↩️ إذن مرتجع</h2><table style='margin:0 auto 16px'><tr><th style='text-align:right;padding:4px 12px'>العميل</th><td style='padding:4px 12px;font-weight:800'>"+(r.custName||"—")+"</td><th style='text-align:right;padding:4px 12px'>التاريخ</th><td style='padding:4px 12px'>"+r.date+"</td></tr></table><table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody><tr><td style='font-weight:800;color:#0EA5E9'>"+r.modelNo+"</td><td>"+(r.modelDesc||"")+"</td><td style='font-weight:800;color:#EF4444;text-align:center;font-size:16px'>"+r.qty+"</td><td>"+(r.note||"—")+"</td></tr></tbody></table><div style='margin-top:8px;font-size:11px;color:#888'>بواسطة: "+(r.createdBy||"—")+"</div><div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل</div></div>";printPage("إذن مرتجع — "+(r.custName||""),h)}} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}} title="طباعة إذن مرتجع">🖨</Btn>
              <Btn small onClick={()=>{setEditRetIdx(i);setEditRetQty(r.qty);setEditRetNote(r.note||"")}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}} title="تعديل">✏️</Btn>
              <DelBtn onConfirm={()=>{updOrder(r.orderId,o=>{o.customerReturns=(o.customerReturns||[]).filter(x=>!(x.custId===r.custId&&x.date===r.date&&(x.note||"")===(r.note||"")))});showToast("✓ تم حذف المرتجع")}}/></>}
            </div></td>}</tr>})}
          {filteredRet.length>20&&<tr><td colSpan={7} style={{...TD,textAlign:"center",color:T.textMut}}>{"... و "+(filteredRet.length-20)+" مرتجع آخر"}</td></tr>}
          <tr style={{background:T.err+"08"}}><td colSpan={4} style={{...TD,fontWeight:800}}>اجمالي المرتجعات</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:T.err}}>{totalRetQty}</td><td colSpan={2} style={TD}></td></tr>
        </tbody></table></div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد مرتجعات بهذا الفلتر</div>}
      </Card>})()}
    {/* ── Sales Audits Section ── */}
    <Card title={"📋 جرد المبيعات ("+audits.length+")"} style={{marginBottom:16}}>
      {sortedAudits.length>0?<div style={{display:"flex",flexDirection:"column",gap:8}}>
        {sortedAudits.map(a=>{const totalQ=Object.values(a.grid||{}).reduce((s,v)=>s+(Number(v)||0),0);const isActive=activeAudit===a.id;
          return<div key={a.id} style={{padding:"10px 14px",borderRadius:10,background:isActive?T.accent+"08":T.cardSolid,border:isActive?"2px solid "+T.accent:"1px solid "+T.brd,cursor:"pointer"}} onClick={()=>{if(isActive){setActiveAudit(null);setAuditInclude(null)}else{setActiveAudit(a.id);const g=a.grid||{};const custIds=[...new Set(Object.keys(g).map(k=>k.split("_")[1]))].filter(id=>auditCusts.some(c=>c.id===id));setAuditInclude(custIds.length>0?custIds:null)}}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>📋</span>
                <div><div style={{fontWeight:700,fontSize:FS}}>{"جرد "+a.date+(a.notes?" — "+a.notes:"")}</div>
                  <div style={{fontSize:FS-2,color:T.textMut}}>{(a.fromDate||"")+(a.fromDate?" → "+(a.toDate||""):"")+" | "+totalQ+" قطعة مباعة"}</div></div>
              </div>
              <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                <Btn small onClick={()=>setShowAuditAnalysis(a.id)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="تحليل المبيعات" title="تصدير اكسل">📊</Btn>
                {canEdit&&<DelBtn onConfirm={()=>delAudit(a.id)}/>}
              </div>
            </div>
          </div>})}
      </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا يوجد جرد — اضغط "📋 جرد مبيعات"</div>}
    </Card>
    {/* Audit Matrix Popup */}
    {activeAud&&!auditInclude&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setActiveAudit(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B",marginBottom:4}}>📋 اختر عملاء الجرد</div>
        <div style={{fontSize:FS-2,color:T.textMut,marginBottom:12}}>اختر العملاء اللي بعتوا جرد المبيعات</div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <Btn small onClick={()=>{const all={};auditCusts.forEach(c=>{all[c.id]=true});setAuditSelCusts(all)}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>☑ اختار الكل</Btn>
          <Btn small onClick={()=>setAuditSelCusts({})} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>☐ الغاء الكل</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
          {auditCusts.map(c=><div key={c.id} onClick={()=>setAuditSelCusts(p=>({...p,[c.id]:!p[c.id]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,cursor:"pointer",background:auditSelCusts[c.id]?"#F59E0B08":"transparent",border:"1px solid "+(auditSelCusts[c.id]?"#F59E0B30":T.brd)}}>
            <span style={{fontSize:16}}>{auditSelCusts[c.id]?"☑":"☐"}</span>
            <span style={{fontWeight:600,fontSize:FS}}>{c.name}</span>
            <span style={{fontSize:FS-2,color:T.textMut,marginRight:"auto"}}>{"(استلم: "+getCustTotal(c.id)+")"}</span>
          </div>)}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setActiveAudit(null)}>الغاء</Btn>
          <Btn onClick={()=>{const ids=Object.entries(auditSelCusts).filter(([,v])=>v).map(([k])=>k);if(ids.length===0){showToast("⚠️ اختر عميل واحد على الأقل");return}setAuditInclude(ids)}} disabled={Object.values(auditSelCusts).filter(Boolean).length===0} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>{"📋 فتح الجرد ("+Object.values(auditSelCusts).filter(Boolean).length+" عميل)"}</Btn>
        </div>
      </div>
    </div>}
    {activeAud&&auditInclude&&(()=>{const visCusts=auditCusts.filter(c=>auditInclude.includes(c.id));return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:24}} onClick={()=>{setActiveAudit(null);setAuditInclude(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:"100%",maxWidth:isMob?"100%":window.innerWidth-48,maxHeight:"92vh",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:isMob?"12px 16px":"16px 24px",borderBottom:"1px solid "+T.brd,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>{"📋 جرد "+activeAud.date+(activeAud.notes?" — "+activeAud.notes:"")}</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={()=>setShowAuditAnalysis(activeAud.id)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="تحليل المبيعات">📊 تحليل</Btn><Btn ghost small onClick={()=>setActiveAudit(null)} title="إغلاق">✕</Btn></div>
          </div>
        </div>
        <div id="audit-matrix-table" style={{flex:1,overflowY:"auto",overflowX:"auto",padding:isMob?"8px 16px 16px":"8px 24px 24px"}}>
          <table style={{width:"100%",borderCollapse:"collapse",whiteSpace:"nowrap"}}>
            <thead style={{position:"sticky",top:0,zIndex:10,background:T.cardSolid}}><tr>
              <th style={{...TH,minWidth:120}}>الموديل</th>
              {visCusts.map(c=><th key={c.id} style={{...TH,textAlign:"center",minWidth:80,fontSize:FS-2}}>
                <div style={{fontWeight:700}}>{c.name}</div>
                {canEdit&&<div style={{marginTop:2}}><span onClick={e=>{e.stopPropagation();setOcrCust(c.id);setOcrResult(null)}} style={{cursor:"pointer",fontSize:10,padding:"1px 4px",borderRadius:4,background:"#8B5CF610",color:"#8B5CF6"}} title="تصوير جرد بالذكاء الاصطناعي">📸</span></div>}
              </th>)}
              <th style={{...TH,textAlign:"center",background:"#F59E0B15",color:"#F59E0B",fontWeight:800}}>اجمالي</th>
              <th style={{...TH,textAlign:"center",fontSize:FS-2}}>تم تسليمه</th>
              <th style={{...TH,textAlign:"center",fontSize:FS-2}}>% البيع</th>
            </tr></thead>
            <tbody>
              {auditModels.map((m,mi)=>{const rowTotal=visCusts.reduce((s,c)=>s+(Number(aAudGrid[m.id+"_"+c.id])||0),0);const pct=m.custDel>0?Math.round(rowTotal/m.custDel*100):0;
                return<tr key={m.id} style={{background:mi%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,fontWeight:700}}><div style={{fontWeight:800,color:T.accent}}>{m.modelNo}</div><div style={{fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</div></td>
                  {visCusts.map(c=>{const k=m.id+"_"+c.id;const q=Number(aAudGrid[k])||0;const isEd=auditCell===k;
                    return<td key={c.id} style={{...TD,textAlign:"center",padding:2,cursor:canEdit?"pointer":"default",background:isEd?"#F59E0B10":q>0?"#F59E0B04":"transparent"}}
                      onClick={()=>{if(!canEdit||isEd)return;setAuditCell(k);setAuditVal(q)}}>
                      {isEd?<input type="number" autoFocus value={auditVal} onFocus={e=>e.target.select()}
                        onChange={e=>setAuditVal(Number(e.target.value)||0)}
                        onBlur={()=>{saveAuditCell(activeAud.id,m.id,c.id,auditVal);setAuditCell(null)}}
                        onKeyDown={e=>{if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();saveAuditCell(activeAud.id,m.id,c.id,auditVal);const ci=visCusts.indexOf(c);const mi=auditModels.indexOf(m);let ni=e.shiftKey?ci-1:ci+1;let nm=mi;if(ni>=visCusts.length){ni=0;nm=mi+1}if(ni<0){ni=visCusts.length-1;nm=mi-1}if(nm>=0&&nm<auditModels.length){const nk=auditModels[nm].id+"_"+visCusts[ni].id;setAuditCell(nk);setAuditVal(Number(aAudGrid[nk])||0)}else{setAuditCell(null)}}if(e.key==="Escape")setAuditCell(null)}}
                        style={{width:"100%",textAlign:"center",border:"2px solid #F59E0B",borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:"#FFF",outline:"none"}}/>
                      :<span style={{fontWeight:q>0?700:400,color:q>0?"#F59E0B":T.textMut}}>{q||"—"}</span>}
                    </td>})}
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B",background:"#F59E0B08"}}>{rowTotal||"—"}</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2,color:T.textSec}}>{m.custDel}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:pct>=50?T.ok:pct>=20?T.warn:T.err}}>{pct+"%"}</td>
                </tr>})}
              <tr style={{background:"#F59E0B10"}}><td style={{...TD,fontWeight:800,color:"#F59E0B"}}>اجمالي المبيعات</td>
                {visCusts.map(c=>{const ct=auditModels.reduce((s,m)=>s+(Number(aAudGrid[m.id+"_"+c.id])||0),0);return<td key={c.id} style={{...TD,textAlign:"center",fontWeight:800,color:"#F59E0B"}}>{ct||"—"}</td>})}
                <td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:"#fff",background:"#F59E0B"}}>{auditModels.reduce((s,m)=>s+visCusts.reduce((ss,c)=>ss+(Number(aAudGrid[m.id+"_"+c.id])||0),0),0)}</td>
                <td style={TD}></td><td style={TD}></td>
              </tr>
              <tr style={{background:T.accent+"06"}}><td style={{...TD,fontWeight:700,color:T.accent,fontSize:FS-1}}>اجمالي الاستلام</td>
                {visCusts.map(c=>{const del=getCustTotal(c.id);return<td key={c.id} style={{...TD,textAlign:"center",fontWeight:700,color:T.accent}}>{del||"—"}</td>})}
                <td style={{...TD,textAlign:"center",fontWeight:800,color:T.accent}}>{visCusts.reduce((s,c)=>s+getCustTotal(c.id),0)}</td>
                <td style={TD}></td><td style={TD}></td>
              </tr>
              <tr style={{background:T.warn+"06"}}><td style={{...TD,fontWeight:700,color:T.warn,fontSize:FS-1}}>رصيد العميل</td>
                {visCusts.map(c=>{const del=getCustTotal(c.id);const sold=auditModels.reduce((s,m)=>s+(Number(aAudGrid[m.id+"_"+c.id])||0),0);const bal=del-sold;return<td key={c.id} style={{...TD,textAlign:"center",fontWeight:700,color:bal>0?T.warn:T.ok}}>{bal}</td>})}
                <td style={TD}></td><td style={TD}></td><td style={TD}></td>
              </tr>
              <tr style={{background:"#8B5CF608"}}><td style={{...TD,fontWeight:700,color:"#8B5CF6",fontSize:FS-2}}>% مبيعات</td>
                {visCusts.map(c=>{const ct=auditModels.reduce((s,m)=>s+(Number(aAudGrid[m.id+"_"+c.id])||0),0);const delivered=getCustTotal(c.id);const pct=delivered>0?Math.round(ct/delivered*100):0;return<td key={c.id} style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS-1,color:pct>=50?T.ok:pct>=20?"#F59E0B":T.err}}>{pct+"%"}</td>})}
                <td style={TD}></td><td style={TD}></td><td style={TD}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center",alignItems:"center",padding:"12px 24px",borderTop:"1px solid "+T.brd,flexShrink:0,flexWrap:"wrap"}}>
          <Btn onClick={()=>{const sel={};(auditInclude||[]).forEach(id=>{sel[id]=true});setAuditSelCusts(sel);setAuditInclude(null)}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd}}>👥 تغيير العملاء</Btn>
          <Btn onClick={()=>setShowAuditAnalysis(activeAud.id)} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}} title="تحليل المبيعات">📊 تحليل</Btn>
          <Btn onClick={()=>{setActiveAudit(null);setAuditInclude(null)}} style={{background:T.ok,color:"#fff",border:"none",fontWeight:700}}>✓ حفظ وإغلاق</Btn>
        </div>
      </div>
    </div>})()}
    {/* Audit Analysis Popup */}
    {showAuditAnalysis&&(()=>{const aud=audits.find(a=>a.id===showAuditAnalysis);if(!aud)return null;const g=aud.grid||{};
      const modelSales={};const custSales={};let total=0;
      auditModels.forEach(m=>{let mTotal=0;auditCusts.forEach(c=>{const q=Number(g[m.id+"_"+c.id])||0;mTotal+=q;if(!custSales[c.name])custSales[c.name]=0;custSales[c.name]+=q});if(mTotal>0)modelSales[m.modelNo]={qty:mTotal,delivered:m.custDel,pct:m.custDel>0?Math.round(mTotal/m.custDel*100):0};total+=mTotal});
      const topModels=Object.entries(modelSales).sort((a,b)=>b[1].qty-a[1].qty);
      const topCusts=Object.entries(custSales).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
      const maxModelQty=topModels[0]?.[1]?.qty||1;const maxCustQty=topCusts[0]?.[1]||1;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowAuditAnalysis(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?500:700,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{"📊 تحليل جرد — "+aud.date}</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={()=>{const el=document.getElementById("audit-analysis-content");if(el)printPage("📊 تحليل جرد مبيعات — "+aud.date,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة">🖨</Btn><Btn ghost small onClick={()=>setShowAuditAnalysis(null)} title="إغلاق">✕</Btn></div>
          </div>
          <div id="audit-analysis-content">
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
            <div style={{padding:10,borderRadius:10,background:"#F59E0B08",border:"1px solid #F59E0B15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>اجمالي المبيعات</div><div style={{fontSize:20,fontWeight:800,color:"#F59E0B"}}>{fmt(total)}</div></div>
            <div style={{padding:10,borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>عدد الموديلات</div><div style={{fontSize:20,fontWeight:800,color:T.accent}}>{topModels.length}</div></div>
            <div style={{padding:10,borderRadius:10,background:T.ok+"08",border:"1px solid "+T.ok+"15",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>عدد العملاء</div><div style={{fontSize:20,fontWeight:800,color:T.ok}}>{topCusts.length}</div></div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>🏆 أعلى موديلات مبيعاً</div>
            {topModels.slice(0,5).map(([name,d],i)=><div key={name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontWeight:800,color:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#CD7F32":T.textSec,fontSize:FS}}>{i<3?["🥇","🥈","🥉"][i]:(i+1)+"."}</span>
              <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1}}><span style={{fontWeight:700}}>{name}</span><span style={{fontWeight:800,color:"#F59E0B"}}>{d.qty+" قطعة ("+d.pct+"%)"}</span></div>
                <div style={{height:6,borderRadius:3,background:T.brd,marginTop:3}}><div style={{height:6,borderRadius:3,background:"linear-gradient(90deg,#F59E0B,#F97316)",width:Math.round(d.qty/maxModelQty*100)+"%"}}/></div></div>
            </div>)}
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>👥 أعلى عملاء مبيعاً</div>
            {topCusts.slice(0,5).map(([name,qty],i)=><div key={name} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontWeight:800,color:i===0?"#F59E0B":i===1?"#94A3B8":i===2?"#CD7F32":T.textSec,fontSize:FS}}>{i<3?["🥇","🥈","🥉"][i]:(i+1)+"."}</span>
              <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",fontSize:FS-1}}><span style={{fontWeight:700}}>{name}</span><span style={{fontWeight:800,color:T.ok}}>{qty+" قطعة ("+(total?Math.round(qty/total*100):0)+"%)"}</span></div>
                <div style={{height:6,borderRadius:3,background:T.brd,marginTop:3}}><div style={{height:6,borderRadius:3,background:"linear-gradient(90deg,#10B981,#059669)",width:Math.round(qty/maxCustQty*100)+"%"}}/></div></div>
            </div>)}
          </div>
          {topModels.filter(([,d])=>d.pct<20).length>0&&<div style={{padding:10,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"15"}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.warn,marginBottom:4}}>⚠️ موديلات بطيئة البيع (أقل من 20%)</div>
            {topModels.filter(([,d])=>d.pct<20).map(([name,d])=><div key={name} style={{fontSize:FS-2,color:T.textSec}}>{"• "+name+" — تسليم "+d.delivered+" → مبيعات "+d.qty+" ("+d.pct+"%)"}</div>)}
          </div>}
          </div>
        </div>
      </div>})()}
    {/* OCR Audit Popup */}
    {ocrCust&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setOcrCust(null);setOcrResult(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{"📸 قراءة جرد — "+(auditCusts.find(c=>c.id===ocrCust)?.name||"")}</div>
          <Btn ghost small onClick={()=>{setOcrCust(null);setOcrResult(null)}} title="إغلاق">✕</Btn>
        </div>
        {!ocrResult&&!ocrLoading&&<div>
          <div style={{border:"2px dashed "+T.brd,borderRadius:12,padding:30,textAlign:"center",cursor:"pointer",background:T.bg}} onClick={()=>ocrRef.current?.click()}>
            <div style={{fontSize:32,marginBottom:8}}>📸</div>
            <div style={{fontSize:FS,fontWeight:700,color:T.text}}>صوّر جرد العميل أو اختار صورة</div>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>البرنامج هيقرأ عمود المبيعات تلقائياً</div>
          </div>
          <input ref={ocrRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)scanAuditImage(f,ocrCust);e.target.value=""}}/>
        </div>}
        {ocrLoading&&<div style={{textAlign:"center",padding:30}}>
          <div style={{fontSize:28,marginBottom:8}}>🔍</div>
          <div style={{fontSize:FS,fontWeight:700,color:T.accent}}>جاري قراءة الجرد بالذكاء الاصطناعي...</div>
          <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>قد يستغرق بضع ثواني</div>
        </div>}
        {ocrResult&&<div>
          <div style={{fontSize:FS,fontWeight:700,color:T.ok,marginBottom:4}}>{"✅ تم القراءة — "+ocrResult.items.length+" موديل"}</div>
          <div style={{fontSize:FS-2,color:T.warn,marginBottom:10,fontWeight:600}}>⚠️ راجع الأرقام وعدّل لو فيه خطأ قبل التسجيل</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:12}}><thead><tr><th style={TH}>الموديل (من الصورة)</th><th style={TH}>المطابقة</th><th style={TH}>المبيعات</th></tr></thead><tbody>
            {ocrResult.items.map((it,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}>
              <td style={{...TD,fontWeight:600}}>{it.input}</td>
              <td style={TD}>{it.matched?<span style={{color:T.ok,fontWeight:700}}>{"✅ "+it.matched}</span>:<span style={{color:T.err,fontWeight:700}}>⚠️ غير موجود</span>}</td>
              <td style={{...TD,textAlign:"center"}}><input type="number" value={it.qty} onChange={e=>{const v=Number(e.target.value)||0;setOcrResult(p=>{const n={...p,items:[...p.items]};n.items[i]={...n.items[i],qty:v};return n})}} style={{width:70,textAlign:"center",border:"2px solid "+(it.matched?"#F59E0B":T.brd),borderRadius:6,padding:"4px",fontSize:FS,fontWeight:800,fontFamily:"inherit",background:it.matched?"#FFF":T.bg,color:it.matched?"#F59E0B":T.textMut}}/></td>
            </tr>)}
          </tbody></table>
          <div style={{display:"flex",gap:8,justifyContent:"center"}}>
            <Btn ghost onClick={()=>{setOcrResult(null)}}>📸 صورة أخرى</Btn>
            <Btn onClick={applyOcr} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>{"✓ تسجيل "+ocrResult.items.filter(it=>it.matchedId).length+" موديل"}</Btn>
          </div>
        </div>}
      </div>
    </div>}
    {/* Sales Detail Popup */}
    {salesDetail&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSalesDetail(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?400:550,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+1,fontWeight:800,color:salesDetail.color}}>{salesDetail.title}</div>
          <Btn ghost small onClick={()=>setSalesDetail(null)} title="إغلاق">✕</Btn>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={TH}>#</th><th style={TH}>البيان</th><th style={TH}>الكمية</th></tr></thead><tbody>
          {(salesDetail.items||[]).map((d,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:700}}>{d.name}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:salesDetail.color}}>{fmt(d.qty)}</td></tr>)}
          <tr style={{background:salesDetail.color+"10"}}><td style={TD}></td><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:salesDetail.color}}>{fmt(salesDetail.total)}</td></tr>
        </tbody></table>
      </div>
    </div>}
    {/* New Audit Popup */}
    {showNewAudit&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowNewAudit(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B",marginBottom:16}}>📋 جرد مبيعات جديد</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>تاريخ الجرد *</label><Inp type="date" value={auditDate} onChange={setAuditDate}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>من تاريخ</label><Inp type="date" value={auditFrom} onChange={setAuditFrom}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إلى تاريخ</label><Inp type="date" value={auditTo} onChange={setAuditTo}/></div>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={auditNote} onChange={setAuditNote} placeholder="مثال: جرد أسبوع 2"/></div>
        </div>
        <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>👥 اختر العملاء:</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <Btn small onClick={()=>{const all={};auditCusts.forEach(c=>{all[c.id]=true});setAuditSelCusts(all)}} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>☑ الكل</Btn>
          <Btn small onClick={()=>setAuditSelCusts({})} style={{background:T.bg,color:T.textSec,border:"1px solid "+T.brd,fontSize:FS-2}}>☐ لا شيء</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:14,maxHeight:200,overflowY:"auto"}}>
          {auditCusts.map(c=><div key={c.id} onClick={()=>setAuditSelCusts(p=>({...p,[c.id]:!p[c.id]}))} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,cursor:"pointer",background:auditSelCusts[c.id]?"#F59E0B08":"transparent",border:"1px solid "+(auditSelCusts[c.id]?"#F59E0B30":T.brd+"60")}}>
            <span style={{fontSize:14}}>{auditSelCusts[c.id]?"☑":"☐"}</span>
            <span style={{fontWeight:600,fontSize:FS-1,flex:1}}>{c.name}</span>
            <span style={{fontSize:FS-2,color:T.textMut}}>{"استلم: "+getCustTotal(c.id)}</span>
          </div>)}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setShowNewAudit(false)}>الغاء</Btn><Btn onClick={createAudit} disabled={Object.values(auditSelCusts).filter(Boolean).length===0} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>{"📋 إنشاء ("+Object.values(auditSelCusts).filter(Boolean).length+" عميل)"}</Btn></div>
      </div>
    </div>}
    {/* Free Return Popup */}
    {freeReturn==="pick"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFreeReturn(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.err,marginBottom:12}}>↩️ مرتجع مبيعات — اختر العميل</div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {customers.filter(c=>getCustTotal(c.id)>0).map(c=><div key={c.id} onClick={()=>{setFreeReturn(c.id);setFreeRetItems({});setFreeRetNote("")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+T.brd,background:T.cardSolid}} onMouseEnter={e=>e.currentTarget.style.background=T.err+"06"} onMouseLeave={e=>e.currentTarget.style.background=T.cardSolid}>
            <span style={{fontWeight:700,fontSize:FS}}>{c.name}</span>
            <span style={{fontSize:FS-1,color:T.accent,fontWeight:600}}>{"استلم: "+getCustTotal(c.id)}</span>
          </div>)}
        </div>
      </div>
    </div>}
    {freeReturn&&freeReturn!=="pick"&&(()=>{const cust=customers.find(c=>c.id===freeReturn);if(!cust)return null;
      const custModels=[];orders.forEach(o=>{const del=(o.customerDeliveries||[]).filter(d=>d.custId===freeReturn).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).filter(r=>r.custId===freeReturn).reduce((s,r)=>s+(Number(r.qty)||0),0);const net=del-ret;if(net>0)custModels.push({id:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,delivered:del,returned:ret,net})});
      const totalRet=Object.values(freeRetItems).reduce((s,v)=>s+(Number(v)||0),0);
      const saveFreeReturn=()=>{if(totalRet<=0){showToast("⚠️ ادخل كمية المرتجع");return}
        Object.entries(freeRetItems).forEach(([orderId,qty])=>{const q=Number(qty)||0;if(q<=0)return;
          updOrder(orderId,o=>{if(!o.customerReturns)o.customerReturns=[];o.customerReturns.push({custId:freeReturn,custName:cust.name,qty:q,note:freeRetNote||"مرتجع حر",date:new Date().toISOString().split("T")[0],createdBy:userName||""})})});
        showToast("✓ تم تسجيل مرتجع "+totalRet+" قطعة من "+cust.name);setFreeReturn(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFreeReturn(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?420:550,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>{"↩️ مرتجع — "+cust.name}</div>
            <Btn ghost small onClick={()=>setFreeReturn(null)} title="إغلاق">✕</Btn>
          </div>
          <div style={{fontSize:FS-2,color:T.textMut,marginBottom:12}}>{"استلم "+getCustTotal(freeReturn)+" قطعة خلال الموسم"}</div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:12}}><thead><tr>{["الموديل","تسليم","مرتجع سابق","صافي","كمية المرتجع"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
            {custModels.map((m,i)=>{const retQ=Number(freeRetItems[m.id])||0;return<tr key={m.id} style={{background:i%2===0?"transparent":T.bg+"80"}}>
              <td style={{...TD,fontWeight:700}}><div style={{color:T.accent}}>{m.modelNo}</div><div style={{fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</div></td>
              <td style={{...TD,textAlign:"center"}}>{m.delivered}</td>
              <td style={{...TD,textAlign:"center",color:m.returned>0?T.err:T.textMut}}>{m.returned||"—"}</td>
              <td style={{...TD,textAlign:"center",fontWeight:700}}>{m.net}</td>
              <td style={{...TD,textAlign:"center",width:90}}><input type="number" value={retQ||""} onChange={e=>{const v=Math.min(Math.max(0,Number(e.target.value)||0),m.net);setFreeRetItems(p=>({...p,[m.id]:v}))}} placeholder="0" style={{width:70,textAlign:"center",border:"2px solid "+(retQ>0?T.err:T.brd),borderRadius:6,padding:"4px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:retQ>0?T.err+"06":"transparent",color:retQ>0?T.err:T.text}}/></td>
            </tr>})}
          </tbody></table>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={freeRetNote} onChange={setFreeRetNote} placeholder="سبب المرتجع..."/></div>
          {totalRet>0&&<div style={{padding:10,borderRadius:8,background:T.err+"08",border:"1px solid "+T.err+"20",marginTop:10,textAlign:"center"}}>
            <span style={{fontWeight:800,color:T.err,fontSize:FS+1}}>{"اجمالي المرتجع: "+totalRet+" قطعة"}</span>
          </div>}
          <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12}}>
            <Btn ghost onClick={()=>setFreeReturn("pick")}>← تغيير العميل</Btn>
            <Btn onClick={saveFreeReturn} disabled={totalRet<=0} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>{"↩️ تسجيل مرتجع ("+totalRet+")"}</Btn>
          </div>
        </div>
      </div>})()}
    {/* QR Quick Sale/Return Popup */}
    {qrSale&&(()=>{const isSale=qrSale.mode==="sale";const title=isSale?"📦 بيع سريع":"↩️ مرتجع سريع";const color=isSale?"#10B981":"#8B5CF6";
      const getCustDelivered=(orderId)=>{const o=orders.find(x=>x.id===orderId);return(o?.customerDeliveries||[]).filter(d=>d.custId===qrSale.custId).reduce((s,d)=>s+(Number(d.qty)||0),0)};
      const getCustReturned=(orderId)=>{const o=orders.find(x=>x.id===orderId);return(o?.customerReturns||[]).filter(r=>r.custId===qrSale.custId).reduce((s,r)=>s+(Number(r.qty)||0),0)};
      const getAvailStock=(orderId)=>{const sm=stockModels.find(m=>m.id===orderId);if(!sm)return 0;return sm.avail};
      const handleScan=(text)=>{try{
        /* Check for package QR */
        try{const j=JSON.parse(text);if(j.app==="clark"&&j.type==="pkg"){const pkg=(config.packages||[]).find(p=>p.id===j.id);
          if(!pkg||pkg.status==="مغلقة"){playBeep("error");showToast("⛔ كرتونة غير متاحة");return}
          if(isSale){const newItems=[];let blocked=false;const currentActual={};qrSale.items.forEach(it=>{currentActual[it.orderId]=(currentActual[it.orderId]||0)+(Number(it.qty)||0)});
            pkg.items.forEach(it=>{const o=orders.find(x=>x.id===it.orderId);if(!o)return;
            const avail=getAvailStock(it.orderId);const alreadyInCart=(currentActual[it.orderId]||0);
            if(alreadyInCart+it.qty>avail){showToast("⚠️ "+it.modelNo+": المتاح ("+avail+") أقل من المطلوب ("+(alreadyInCart+it.qty)+")");blocked=true;return}
            for(let s=0;s<it.count;s++){newItems.push({orderId:it.orderId,modelNo:it.modelNo,modelDesc:o.modelDesc||"",rackSize:it.rackSize,qty:it.rackSize})}});
            if(blocked)return;if(newItems.length===0){playBeep("error");showToast("⛔ الكرتونة فارغة");return}
            playBeep("done");showToast("✅ تم اضافة كرتونة "+j.num+" ("+pkg.items.reduce((s,it)=>s+it.qty,0)+" قطعة)");
            setQrSale(p=>({...p,items:[...p.items,...newItems],_pkgId:pkg.id,_pkgNum:j.num}))}
          else{playBeep("error");showToast("⛔ لا يمكن مرتجع كرتونة كاملة")}return}}catch(e2){}
        /* Regular model QR */
        const parts=text.split(":");if(parts[0]!=="CLARK"||parts.length<3)return;const orderId=parts[1];const qrRs=Number(parts[2])||1;
        const o=orders.find(x=>x.id===orderId);if(!o){playBeep("error");showToast("⛔ موديل غير موجود");return}
        /* Always scan as full series: max(QR value, number of sizes) */
        const sizes=o.sizeLabel?o.sizeLabel.split(/[-/,]/).map(s=>s.trim()).filter(Boolean):[];
        const rs=sizes.length>1?Math.max(qrRs,sizes.length):qrRs;
        if(isSale){/* Check stock + planned limit */
          const currentActual={};qrSale.items.forEach(it=>{currentActual[it.orderId]=(currentActual[it.orderId]||0)+(Number(it.qty)||0)});
          const alreadyInCart=(currentActual[orderId]||0);const avail=getAvailStock(orderId);
          if(avail<=0){playBeep("error");showToast("⛔ موديل "+o.modelNo+" غير متاح — الرصيد = 0");return}
          if(alreadyInCart+rs>avail){playBeep("error");showToast("⚠️ "+o.modelNo+": المطلوب ("+(alreadyInCart+rs)+") أكبر من المتاح ("+avail+")");return}
          /* Check planned limit for linked session */
          const _ls=qrSale.linkedSession&&qrSale.linkedSession!=="free"?sessions.find(s=>s.id===qrSale.linkedSession):null;
          if(_ls){const _rem=getRemainingForSess(qrSale.custId,_ls.id,orderId,_ls.grid||{});
            if(_rem<=0){playBeep("error");showToast("⛔ "+o.modelNo+": تم تسليم كامل الخطة لهذا العميل");return}
            if(alreadyInCart+rs>_rem){playBeep("error");showToast("⚠️ "+o.modelNo+": المتبقي في الخطة = "+_rem+" (المطلوب "+(alreadyInCart+rs)+")");return}}
        }else{/* Check customer received this model - use latest items */
          const currentActual={};qrSale.items.forEach(it=>{currentActual[it.orderId]=(currentActual[it.orderId]||0)+(Number(it.qty)||0)});
          const delivered=getCustDelivered(orderId);const returned=getCustReturned(orderId);const net=delivered-returned;
          const alreadyInCart=(currentActual[orderId]||0);
          if(delivered<=0){playBeep("error");showToast("⛔ العميل لم يستلم موديل "+o.modelNo);return}
          if(alreadyInCart+rs>net){playBeep("error");showToast("⚠️ "+o.modelNo+": المتاح للمرتجع = "+net+" (مسلّم "+delivered+" - مرتجع "+returned+")");return}
        }
        playBeep("ok");setQrSale(p=>({...p,items:[...p.items,{orderId,modelNo:o.modelNo,modelDesc:o.modelDesc,rackSize:rs,qty:rs}]}))}catch(e){}};
      const total=qrSale.items.reduce((s,it)=>s+(Number(it.qty)||0),0);
      const updateQty=(idx,v)=>setQrSale(p=>{const items=[...p.items];items[idx]={...items[idx],qty:Math.max(0,Number(v)||0)};return{...p,items}});
      const removeItem=(idx)=>setQrSale(p=>({...p,items:p.items.filter((_,i)=>i!==idx)}));
      const closeQrSale=()=>{try{const v=document.getElementById("qr-sale-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setQrScanActive(false);setQrSale(null)};
      const linkedSess=isSale&&qrSale.linkedSession&&qrSale.linkedSession!=="free"?sessions.find(s=>s.id===qrSale.linkedSession):null;
      const plannedByModel={};if(linkedSess){Object.entries(linkedSess.grid||{}).forEach(([k,v])=>{const[oid,cid]=k.split("_");if(cid===qrSale.custId){plannedByModel[oid]=(plannedByModel[oid]||0)+(Number(v)||0)}})}
      const actualByModel={};qrSale.items.forEach(it=>{actualByModel[it.orderId]=(actualByModel[it.orderId]||0)+(Number(it.qty)||0)});
      const confirmSale=()=>{if(!qrSale.custId||total<=0)return;const cust=customers.find(c=>c.id===qrSale.custId);if(!cust)return;
        const byOrder={};qrSale.items.forEach(it=>{if(!byOrder[it.orderId])byOrder[it.orderId]=0;byOrder[it.orderId]+=(Number(it.qty)||0)});
        /* Final validation */
        if(isSale){for(const[oid,qty] of Object.entries(byOrder)){const avail=getAvailStock(oid);const o=orders.find(x=>x.id===oid);
          if(qty>avail){showToast("⛔ "+o?.modelNo+": الكمية ("+qty+") أكبر من المتاح ("+avail+")");return}}}
        else{for(const[oid,qty] of Object.entries(byOrder)){const delivered=getCustDelivered(oid);const returned=getCustReturned(oid);const net=delivered-returned;const o=orders.find(x=>x.id===oid);
          if(delivered<=0){showToast("⛔ العميل لم يستلم "+o?.modelNo);return}
          if(qty>net){showToast("⚠️ "+o?.modelNo+": المرتجع ("+qty+") أكبر من الصافي ("+net+")");return}}}
        if(isSale){
          const sessId=linkedSess?linkedSess.id:gid();const modelIds=[...new Set(qrSale.items.map(it=>it.orderId))];
          if(!linkedSess){const grid={};Object.entries(byOrder).forEach(([oid,qty])=>{grid[oid+"_"+qrSale.custId]=qty});
            upSales(d=>{if(!d.custDeliverySessions)d.custDeliverySessions=[];d.custDeliverySessions.push({id:sessId,date:new Date().toISOString().split("T")[0],modelIds,custIds:[qrSale.custId],grid,createdBy:userName,createdAt:new Date().toISOString(),status:"تم التسليم",freeSale:true,saleConfirmed:true})})}
          else{upSales(d=>{const si=(d.custDeliverySessions||[]).findIndex(s=>s.id===sessId);if(si>=0){d.custDeliverySessions[si].actualSales=byOrder;d.custDeliverySessions[si].actualSaleDate=new Date().toISOString().split("T")[0];d.custDeliverySessions[si].actualSaleBy=userName;d.custDeliverySessions[si].saleConfirmed=true}})}
          Object.entries(byOrder).forEach(([oid,qty])=>{updOrder(oid,o=>{if(!o.customerDeliveries)o.customerDeliveries=[];o.customerDeliveries.push({custId:qrSale.custId,custName:cust.name,qty,date:new Date().toISOString().split("T")[0],sessionId:sessId,createdBy:userName})})});
          playBeep("done");showToast("✓ تم تسجيل بيع "+total+" قطعة لـ "+cust.name);
          /* Archive package if sale was from package */
          if(qrSale._pkgId){upSales(d=>{const pi=(d.packages||[]).findIndex(p=>p.id===qrSale._pkgId);if(pi>=0){d.packages[pi].status="مباعة";d.packages[pi].closedAt=new Date().toISOString();if(!d.packages[pi].movements)d.packages[pi].movements=[];d.packages[pi].movements.push({date:new Date().toISOString().split("T")[0],type:"sell",custName:cust.name,totalQty:total,by:userName||""})}})}
        }else{
          Object.entries(byOrder).forEach(([oid,qty])=>{updOrder(oid,o=>{if(!o.customerReturns)o.customerReturns=[];o.customerReturns.push({custId:qrSale.custId,custName:cust.name,qty,note:qrSale.note||"مرتجع سريع",date:new Date().toISOString().split("T")[0],createdBy:userName})})});
          playBeep("done");showToast("✓ تم تسجيل مرتجع "+total+" قطعة من "+cust.name)
        }closeQrSale()};
      /* Step 1: Pick session first (sale only) */
      if(isSale&&qrSale.linkedSession===undefined){const openSessions=sessions.filter(s=>s.status!=="تم التسليم"&&Object.keys(s.grid||{}).some(k=>Number(s.grid[k])>0));
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={closeQrSale}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:500,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:FS+2,fontWeight:800,color}}>📦 اختر سجل التوزيع</div>
              <Btn ghost small onClick={closeQrSale}>✕</Btn>
            </div>
            {openSessions.length>0&&<div style={{marginBottom:12}}>
              <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:6}}>📋 سجلات التوزيع المفتوحة:</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {openSessions.map(s=>{const totalQ=Object.values(s.grid||{}).reduce((sum,v)=>sum+(Number(v)||0),0);const custCount=s.custIds?.length||0;
                  return<div key={s.id} onClick={()=>setQrSale(p=>({...p,linkedSession:s.id}))} style={{padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+T.accent+"30",background:T.accent+"04"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"10"} onMouseLeave={e=>e.currentTarget.style.background=T.accent+"04"}>
                    <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700}}>{"📦 "+s.date}</span><span style={{fontWeight:800,color:T.accent}}>{totalQ+" قطعة"}</span></div>
                    <div style={{fontSize:FS-2,color:T.textMut}}>{(s.modelIds?.length||0)+" موديل × "+custCount+" عميل"}</div>
                  </div>})}
              </div>
            </div>}
            <div onClick={()=>setQrSale(p=>({...p,linkedSession:"free"}))} style={{padding:14,borderRadius:12,border:"1px solid "+color+"30",background:color+"06",cursor:"pointer",textAlign:"center",marginTop:8}} onMouseEnter={e=>e.currentTarget.style.background=color+"12"} onMouseLeave={e=>e.currentTarget.style.background=color+"06"}>
              <div style={{fontSize:FS,fontWeight:700,color}}>🔓 بيع حر (بدون ربط)</div>
              <div style={{fontSize:FS-2,color:T.textMut}}>بيع مباشر بدون مقارنة بسجل</div>
            </div>
          </div>
        </div>}
      /* Step 2: Pick customer (filtered to session if linked) */
      if(!qrSale.custId){const sessForCust=qrSale.linkedSession&&qrSale.linkedSession!=="free"?sessions.find(s=>s.id===qrSale.linkedSession):null;
        const custList=sessForCust?sessForCust.custIds.map(id=>customers.find(c=>c.id===id)).filter(Boolean):customers;
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={closeQrSale}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color}}>{title+" — اختر العميل"}</div>{sessForCust&&<div style={{fontSize:FS-2,color:T.textMut}}>{"سجل "+sessForCust.date+" — "+custList.length+" عميل"}</div>}</div>
            <div style={{display:"flex",gap:4}}>{isSale&&<Btn ghost small onClick={()=>setQrSale(p=>({...p,linkedSession:undefined}))}>← سجل</Btn>}<Btn ghost small onClick={closeQrSale}>✕</Btn></div>
          </div>
          <div style={{marginBottom:10}}><Inp value={custFilter} onChange={setCustFilter} placeholder="بحث بالاسم أو التليفون..."/></div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {custList.filter(c=>{if(!custFilter.trim())return true;const q=custFilter.trim().toLowerCase();return(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q)}).map(c=>{
              const sessGrid=sessForCust?.grid||{};const custPlanned=sessForCust?sessForCust.modelIds.reduce((s,mid)=>s+(Number(sessGrid[mid+"_"+c.id])||0),0):0;
              const custDelivered=sessForCust?sessForCust.modelIds.reduce((s,mid)=>s+getDeliveredForSess(c.id,sessForCust.id,mid),0):0;
              const custRemaining=custPlanned-custDelivered;
              return<div key={c.id} onClick={()=>{setQrSale(p=>({...p,custId:c.id}));setCustFilter("")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+(custRemaining<=0&&sessForCust?"#10B98130":T.brd),background:custRemaining<=0&&sessForCust?"#10B98108":"transparent",opacity:custRemaining<=0&&sessForCust?0.5:1}} onMouseEnter={e=>{if(custRemaining>0||!sessForCust)e.currentTarget.style.background=color+"08"}} onMouseLeave={e=>e.currentTarget.style.background=custRemaining<=0&&sessForCust?"#10B98108":"transparent"}>
                <div><span style={{fontWeight:700}}>{c.name}</span>{sessForCust&&<div style={{fontSize:FS-3,color:custRemaining>0?"#F59E0B":"#10B981"}}>{custRemaining>0?"⏳ باقي "+custRemaining+" قطعة":"✅ تم التسليم بالكامل"}</div>}</div>
                <span style={{fontSize:FS-1,color:sessForCust?(custRemaining>0?T.accent:"#10B981"):T.accent}}>{sessForCust?(custDelivered>0?custDelivered+"/"+custPlanned:custPlanned+" قطعة"):"صافي: "+getCustTotal(c.id)}</span>
              </div>})}
          </div>
        </div>
      </div>}
      const custName=customers.find(c=>c.id===qrSale.custId)?.name||"";
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={closeQrSale}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?420:600,minHeight:isMob?"75vh":"60vh",maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color}}>{title}</div><div style={{fontSize:FS-1,color:T.textMut}}>{custName+(linkedSess?" — مربوط بسجل "+linkedSess.date:isSale?" — بيع حر":"")}</div></div>
            <div style={{display:"flex",gap:4}}><Btn ghost small onClick={()=>setQrSale(p=>({...p,linkedSession:undefined,custId:null,items:[]}))}>{isSale?"← سجل":"← عميل"}</Btn><Btn ghost small onClick={closeQrSale}>✕</Btn></div>
          </div>
          {linkedSess&&(()=>{const allModels=linkedSess.modelIds.filter(mid=>(Number((linkedSess.grid||{})[mid+"_"+qrSale.custId])||0)>0);if(allModels.length===0)return null;
            return<div style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden",marginBottom:10}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>الموديل</th><th style={{...TH,fontSize:FS-2}}>الخطة</th><th style={{...TH,fontSize:FS-2}}>مسلّم</th><th style={{...TH,fontSize:FS-2}}>الحالي</th><th style={{...TH,fontSize:FS-2}}>الباقي</th></tr></thead><tbody>
                {allModels.map(oid=>{const o=orders.find(x=>x.id===oid);const planned=plannedByModel[oid]||0;const prevDel=getDeliveredForSess(qrSale.custId,linkedSess.id,oid);const cartQty=actualByModel[oid]||0;const totalDel=prevDel+cartQty;const remaining=planned-totalDel;
                  return<tr key={oid} style={{background:remaining<=0?"#10B98108":remaining<planned?"#0EA5E908":"transparent"}}><td style={{...TD,fontWeight:700,color:T.accent}}>{o?.modelNo||"?"}</td><td style={{...TD,textAlign:"center"}}>{planned}</td><td style={{...TD,textAlign:"center"}}>{prevDel>0?<span style={{color:"#10B981"}}>{prevDel}</span>:"—"}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{cartQty||"—"}</td>
                    <td style={{...TD,textAlign:"center",fontWeight:700,color:remaining<=0?"#10B981":remaining<planned?"#F59E0B":"#EF4444"}}>{remaining<=0?"✅":"⏳ "+remaining}</td></tr>})}
              </tbody></table>
            </div>})()}
          {qrScanActive?<div style={{marginBottom:12}}>
            <div style={{position:"relative",width:"100%",maxWidth:300,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
              <video id="qr-sale-video" playsInline muted autoPlay style={{width:"100%",display:"block"}}/>
              <canvas id="qr-sale-canvas" style={{display:"none"}}/>
              <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:160,height:160,border:"2px solid "+color,borderRadius:12,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
            </div>
            <div style={{textAlign:"center",marginTop:8}}><Btn small onClick={()=>{setQrScanActive(false);try{const v=document.getElementById("qr-sale-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}}} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>⏹ Stop</Btn></div></div>
          :<div style={{textAlign:"center",marginBottom:12}}><Btn onClick={()=>{setQrScanActive(true);setTimeout(()=>{const startCam=async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});
            const v=document.getElementById("qr-sale-video");if(!v){stream.getTracks().forEach(t=>t.stop());return}v.srcObject=stream;
            loadJsQR();let lastScan="";let lastTime=0;
            const scan=async()=>{if(!v.srcObject)return;const c=document.getElementById("qr-sale-canvas");if(!c||v.readyState<2){requestAnimationFrame(scan);return}
              c.width=v.videoWidth;c.height=v.videoHeight;c.getContext("2d").drawImage(v,0,0);
              {const _qr=await scanQR(c);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;handleScan(_qr)}}}
              if(v.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا")}};startCam()},300)}} style={{background:color+"12",color,border:"1px solid "+color+"30",padding:"12px 24px",fontSize:FS+1}}>📷 فتح الماسح</Btn>
            <div style={{fontSize:FS-2,color:T.textMut,marginTop:6}}>أو أضف يدوياً</div></div>}
          <div style={{marginBottom:12,display:"flex",gap:6,alignItems:"end"}}>
            <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(!v)return;const rs=getRackSize(v);handleScan("CLARK:"+v+":"+rs)}} options={(linkedSess?stockModels.filter(m=>m.avail>0&&linkedSess.modelIds.includes(m.id)):stockModels.filter(m=>m.avail>0)).map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc+" ("+m.avail+")"}))} placeholder={linkedSess?"موديلات التوزيعة...":"اختر موديل..."}/></div>
            <Btn small onClick={()=>{const v=prompt("بيع كسر — ادخل رقم الموديل:");if(!v)return;const o=orders.find(x=>x.modelNo===v||x.id===v);if(!o){showToast("⛔ موديل غير موجود");return}const q=Number(prompt("الكمية:",1))||0;if(q<=0)return;
              setQrSale(p=>({...p,items:[...p.items,{orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc||"",rackSize:q,qty:q,isBroken:true}]}));playBeep("ok");showToast("✅ كسر "+o.modelNo+" × "+q)}} style={{background:"#F59E0B12",color:"#F59E0B",border:"1px solid #F59E0B30",whiteSpace:"nowrap",fontSize:FS-2}}>🧩 كسر</Btn>
          </div>
          {qrSale.items.length>0&&<div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden",marginBottom:10}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>الموديل</th><th style={{...TH,fontSize:FS-2}}>السيري</th><th style={{...TH,fontSize:FS-2}}>الكمية</th><th style={{...TH,width:30}}></th></tr></thead><tbody>
              {qrSale.items.map((it,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:T.accent}}>{it.modelNo}</td><td style={{...TD,textAlign:"center"}}>{it.rackSize}</td>
                <td style={{...TD,textAlign:"center"}}><input type="number" value={it.qty} onChange={e=>updateQty(i,e.target.value)} style={{width:60,textAlign:"center",border:"1px solid "+T.brd,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:T.cardSolid,color:T.text}}/></td>
                <td style={{...TD,textAlign:"center"}}><span onClick={()=>removeItem(i)} style={{cursor:"pointer",color:T.err,fontSize:14}}>🗑️</span></td></tr>)}
              <tr style={{background:color+"10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TD}></td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color}}>{total}</td><td style={TD}></td></tr>
            </tbody></table>
          </div>}
          {!isSale&&<div style={{marginBottom:10}}><Inp value={qrSale.note||""} onChange={v=>setQrSale(p=>({...p,note:v}))} placeholder="سبب المرتجع..."/></div>}
          {qrSale.items.length>0&&(()=>{const grouped={};qrSale.items.forEach(it=>{if(!grouped[it.modelNo])grouped[it.modelNo]={modelNo:it.modelNo,scans:0,totalQty:0};grouped[it.modelNo].scans++;grouped[it.modelNo].totalQty+=(Number(it.qty)||0)});const gArr=Object.values(grouped);
            return<div style={{padding:10,borderRadius:10,background:color+"06",border:"1px solid "+color+"20",marginBottom:10}}>
              <div style={{fontSize:FS-1,fontWeight:700,color,marginBottom:6}}>📊 ملخص:</div>
              {gArr.map(g=><div key={g.modelNo} style={{display:"flex",justifyContent:"space-between",padding:"3px 8px",fontSize:FS-1}}>
                <span style={{fontWeight:700,color:T.accent}}>{g.modelNo}</span><span style={{color:T.textSec}}>{g.scans+" سيري"}</span><span style={{fontWeight:800,color}}>{g.totalQty+" ق"}</span></div>)}
              <div style={{borderTop:"1px solid "+color+"20",marginTop:4,paddingTop:4,display:"flex",justifyContent:"space-between",fontSize:FS,fontWeight:800}}>
                <span>{gArr.reduce((s,g)=>s+g.scans,0)+" سيري"}</span><span style={{color}}>{total+" قطعة"}</span></div>
            </div>})()}
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
            <Btn ghost onClick={closeQrSale}>الغاء</Btn>
            {isSale&&total>0&&<Btn onClick={()=>{const cust=customers.find(c=>c.id===qrSale.custId);if(!cust)return;
              const byOid={};qrSale.items.forEach(it=>{byOid[it.orderId]=(byOid[it.orderId]||0)+(Number(it.qty)||0)});
              const rows=[];let grandTotal=0;let missingPrice=false;
              Object.entries(byOid).forEach(([oid,qty])=>{const o=orders.find(x=>x.id===oid);const price=Number(o?.sellPrice)||0;
                if(!price){showToast("\u26a0\ufe0f \u0627\u062f\u062e\u0644 \u0633\u0639\u0631 \u0627\u0644\u0628\u064a\u0639 \u0644\u0645\u0648\u062f\u064a\u0644 "+(o?.modelNo||""));missingPrice=true;return}
                const lineTotal=qty*price;grandTotal+=lineTotal;rows.push({no:o?.modelNo,desc:o?.modelDesc||"",qty,price,total:lineTotal})});
              if(missingPrice)return;
              const disc=Math.round(grandTotal*0.1);const net=grandTotal-disc;
              let h="<h2 style='text-align:center'>CLARK \u2014 \u0639\u0631\u0636 \u0633\u0639\u0631</h2>";
              h+="<table style='margin:0 auto 12px'><tr><td style='padding:4px 12px;font-weight:700'>\u0627\u0644\u0639\u0645\u064a\u0644</td><td style='padding:4px 12px;font-weight:800'>"+cust.name+"</td><td style='padding:4px 12px;font-weight:700'>\u0627\u0644\u062a\u0627\u0631\u064a\u062e</td><td style='padding:4px 12px'>"+new Date().toISOString().split("T")[0]+"</td></tr></table>";
              h+="<table><thead><tr><th>\u0627\u0644\u0645\u0648\u062f\u064a\u0644</th><th>\u0627\u0644\u0648\u0635\u0641</th><th>\u0627\u0644\u0643\u0645\u064a\u0629</th><th>\u0633\u0639\u0631 \u0627\u0644\u0642\u0637\u0639\u0629</th><th>\u0627\u0644\u0627\u062c\u0645\u0627\u0644\u064a</th></tr></thead><tbody>";
              rows.forEach(r=>{h+="<tr><td style='font-weight:800'>"+r.no+"</td><td>"+r.desc+"</td><td style='text-align:center;font-weight:700'>"+r.qty+"</td><td style='text-align:center'>"+fmt(r.price)+"</td><td style='text-align:center;font-weight:800'>"+fmt(r.total)+"</td></tr>"});
              h+="</tbody></table>";
              h+="<div style='margin-top:16px;padding:12px;border:2px solid #000;border-radius:8px'>";
              h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px'><span style='font-weight:700'>\u0627\u0644\u0627\u062c\u0645\u0627\u0644\u064a \u0642\u0628\u0644 \u0627\u0644\u062e\u0635\u0645</span><span style='font-weight:800;font-size:14px'>"+fmt(grandTotal)+" \u062c.\u0645</span></div>";
              h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px;color:#EF4444'><span style='font-weight:700'>\u062e\u0635\u0645 10%</span><span style='font-weight:800'>- "+fmt(disc)+" \u062c.\u0645</span></div>";
              h+="<div style='display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #000'><span style='font-weight:800;font-size:16px'>\u0627\u0644\u0645\u0633\u062a\u062d\u0642</span><span style='font-weight:900;font-size:18px;color:#059669'>"+fmt(net)+" \u062c.\u0645</span></div>";
              h+="</div>";
              h+="<div class='sig'><div class='sig-box'>\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a</div><div class='sig-box'>\u0627\u0644\u0639\u0645\u064a\u0644: "+cust.name+"</div></div>";
              printPage("\u0639\u0631\u0636 \u0633\u0639\u0631 \u2014 "+cust.name,h)}} style={{background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630"}}>{"\ud83e\uddfe \u0639\u0631\u0636 \u0633\u0639\u0631"}</Btn>}
            <Btn onClick={confirmSale} disabled={total<=0} style={{background:color,color:"#fff",border:"none",fontWeight:700}}>{(isSale?"📦 تأكيد البيع":"↩️ تأكيد المرتجع")+" ("+total+")"}</Btn>
          </div>
        </div>
      </div>})()}
    {/* Package System */}
    {pkgPopup==="list"&&(()=>{const packages=config.packages||[];const filtered=packages.filter(p=>{if(!pkgSearch.trim())return true;const q=pkgSearch.trim().toLowerCase();return(p.number||"").toLowerCase().includes(q)||(p.note||"").toLowerCase().includes(q)||p.items?.some(it=>(it.modelNo||"").includes(q))});
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setPkgPopup(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":700,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>{"📦 الكراتين ("+packages.length+")"}</div>
            <div style={{display:"flex",gap:4}}>
              {packages.length>0&&<Btn small onClick={()=>{let h="<h2 style='text-align:center'>📦 تقرير سجل الكراتين</h2><div style='text-align:center;color:#666;margin-bottom:16px'>"+packages.length+" كرتونة | "+packages.reduce((s,p)=>s+(p.items||[]).reduce((ss,it)=>ss+(Number(it.qty)||0),0),0)+" قطعة اجمالي</div>";
                packages.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).forEach((p,pi)=>{const tq=(p.items||[]).reduce((s,it)=>s+(Number(it.qty)||0),0);
                  h+="<h3 style='margin-top:16px;color:#0EA5E9'>📦 "+p.number+" — "+p.date+"</h3>";
                  if(p.note)h+="<div style='color:#666;margin-bottom:6px'>"+p.note+"</div>";
                  h+="<table><thead><tr><th>الموديل</th><th>السيري</th><th>سيريهات</th><th>الكمية</th></tr></thead><tbody>";
                  (p.items||[]).forEach((it,i)=>{h+="<tr style='background:"+(i%2===0?"transparent":"#f8f8f8")+"'><td style='font-weight:700'>"+it.modelNo+"</td><td style='text-align:center'>"+it.rackSize+"</td><td style='text-align:center'>"+it.count+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+it.qty+"</td></tr>"});
                  h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='2'>اجمالي</td><td style='text-align:center'>"+(p.items||[]).reduce((s,it)=>s+(it.count||0),0)+"</td><td style='text-align:center;color:#0EA5E9'>"+tq+"</td></tr></tbody></table>"});
                printPage("سجل الكراتين",h)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}} title="طباعة التقرير">🖨</Btn>}
              {canEdit&&<Btn small primary onClick={()=>{setPkgPopup("create");setPkgItems([]);setPkgNote("")}}>+ كرتونة</Btn>}<Btn ghost small onClick={()=>setPkgPopup(null)}>✕</Btn></div>
          </div>
          <div style={{marginBottom:10}}><Inp value={pkgSearch} onChange={setPkgSearch} placeholder="بحث برقم الكرتونة أو الموديل..."/></div>
          {filtered.length>0?<div style={{display:"flex",flexDirection:"column",gap:6}}>
            {filtered.sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(p=>{const totalQ=p.items?.reduce((s,it)=>s+(Number(it.qty)||0),0)||0;const isClosed=p.status==="مغلقة"||p.status==="مباعة";const isSold=p.status==="مباعة";
              return<div key={p.id} onClick={()=>setPkgPopup("view_"+p.id)} style={{padding:"12px 16px",borderRadius:12,border:"1px solid "+(isClosed?(isSold?"#8B5CF630":"#EF444430"):T.brd),cursor:"pointer",transition:"background 0.15s",background:isClosed?(isSold?"#8B5CF606":"#EF444406"):"transparent",opacity:isClosed?0.7:1}} onMouseEnter={e=>e.currentTarget.style.background=isClosed?(isSold?"#8B5CF610":"#EF444410"):T.accent+"06"} onMouseLeave={e=>e.currentTarget.style.background=isClosed?(isSold?"#8B5CF606":"#EF444406"):"transparent"}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div><span style={{fontWeight:800,color:isSold?"#8B5CF6":isClosed?"#EF4444":"#0EA5E9",textDecoration:isClosed?"line-through":"none"}}>{"📦 "+p.number}</span><span style={{fontSize:FS-2,color:T.textMut,marginRight:8}}>{" — "+p.date}</span>{isSold&&<span style={{fontSize:FS-3,color:"#8B5CF6",fontWeight:700}}>💰 مباعة</span>}{isClosed&&!isSold&&<span style={{fontSize:FS-3,color:"#EF4444",fontWeight:700}}>🔒 مغلقة</span>}</div>
                  <span style={{fontWeight:700,color:isClosed?(isSold?"#8B5CF6":"#EF4444"):T.accent}}>{totalQ+" قطعة"}</span>
                </div>
                <div style={{fontSize:FS-2,color:T.textMut}}>{p.items?.map(it=>it.modelNo+"("+it.qty+")").join(" | ")||"فارغة"}</div>
              </div>})}
          </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{pkgSearch?"لا توجد نتائج":"لا توجد كراتين — أنشئ كرتونة جديدة"}</div>}
        </div>
      </div>})()}
    {pkgPopup==="create"&&(()=>{const existingNums=(config.packages||[]).map(p=>{const m=p.number?.match(/\d+/);return m?Number(m[0]):0});const nextNum=Math.max(0,...existingNums)+1;const pkgNum="CTN-"+String(nextNum).padStart(3,"0");
      const totalQ=pkgItems.reduce((s,it)=>s+(Number(it.qty)||0),0);
      const addModel=(orderId)=>{const o=orders.find(x=>x.id===orderId);if(!o)return;const rs=getRackSize(orderId);
        setPkgItems(p=>{const existing=p.findIndex(it=>it.orderId===orderId);if(existing>=0){const items=[...p];items[existing]={...items[existing],count:items[existing].count+1,qty:(items[existing].count+1)*items[existing].rackSize};return items}return[...p,{orderId,modelNo:o.modelNo,modelDesc:o.modelDesc,rackSize:rs,count:1,qty:rs}]})};
      const updateItem=(idx,f,v)=>setPkgItems(p=>{const items=[...p];items[idx]={...items[idx],[f]:Number(v)||0};if(f==="count")items[idx].qty=items[idx].count*items[idx].rackSize;return items});
      const stopPkgCam=()=>{setPkgScan(false);try{const v=document.getElementById("pkg-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}};
      const closePkgCreate=()=>{stopPkgCam();setPkgPopup("list")};
      const savePkg=()=>{if(pkgItems.length===0){showToast("⚠️ أضف موديل واحد على الأقل");return}
        const pkg={id:gid(),number:pkgNum,date:new Date().toISOString().split("T")[0],note:pkgNote,items:pkgItems.map(it=>({orderId:it.orderId,modelNo:it.modelNo,rackSize:it.rackSize,count:it.count,qty:it.qty})),createdBy:userName,status:"مخزن"};
        upSales(d=>{if(!d.packages)d.packages=[];d.packages.push(pkg)});
        /* Print QR */
        const qrData=JSON.stringify({app:"clark",type:"pkg",id:pkg.id,num:pkgNum});
        printPkgLabel(pkgNum,pkg.date,pkgNote,pkgItems.map(it=>({...it,desc:orders.find(o=>o.id===it.orderId)?.modelDesc||""})),[],pkg.status,userName,qrData);
        playBeep("done");showToast("✓ تم حفظ كرتونة "+pkgNum);closePkgCreate()};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setPkgPopup("list")}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?420:550,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>📦 كرتونة جديدة</div><div style={{fontSize:FS-1,color:T.textMut}}>{"رقم: "+pkgNum}</div></div>
            <Btn ghost small onClick={closePkgCreate}>← رجوع</Btn>
          </div>
          <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>ملاحظات</label><Inp value={pkgNote} onChange={setPkgNote} placeholder="مثال: كرتونة سيلا — شحنة 1"/></div>
          <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec}}>اضف موديل</label>
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(v)addModel(v)}} options={stockModels.filter(m=>m.avail>0).map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc+" ("+m.avail+")"}))} placeholder="اختر موديل..."/></div>
              <Btn small onClick={()=>{if(pkgScan){try{const v=document.getElementById("pkg-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}}setPkgScan(!pkgScan)}} style={{background:pkgScan?"#EF444412":"#0EA5E912",color:pkgScan?"#EF4444":"#0EA5E9",border:"1px solid "+(pkgScan?"#EF444430":"#0EA5E930"),whiteSpace:"nowrap"}}>{pkgScan?"⏹":"📷"}</Btn>
            </div>
            {pkgScan&&<div style={{marginBottom:8}}>
              <div style={{position:"relative",width:"100%",maxWidth:260,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
                <video id="pkg-scan-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                  const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                  const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                    {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;try{const parts=_qr.split(":");if(parts[0]==="CLARK"&&parts[1]){addModel(parts[1]);playBeep("ok")}}catch(e){}}}}
                    if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");setPkgScan(false)}})()}}/>
                <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:120,height:120,border:"2px solid #0EA5E9",borderRadius:10,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
              </div>

            </div>}
          </div>
          {pkgItems.length>0&&<div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden",marginBottom:12}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","السيري","عدد سيريهات","الكمية",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {pkgItems.map((it,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:T.accent}}>{it.modelNo}</td><td style={{...TD,textAlign:"center"}}>{it.rackSize}</td>
                <td style={{...TD,textAlign:"center"}}><input type="number" min="1" value={it.count} onChange={e=>updateItem(i,"count",e.target.value)} style={{width:50,textAlign:"center",border:"1px solid "+T.brd,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit"}}/></td>
                <td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{it.qty}</td>
                <td style={{...TD,textAlign:"center"}}><span onClick={()=>setPkgItems(p=>p.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.err}}>🗑️</span></td></tr>)}
              <tr style={{background:"#0EA5E908"}}><td colSpan={3} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:"#0EA5E9"}}>{totalQ}</td><td style={TD}></td></tr>
            </tbody></table>
          </div>}
          <div style={{display:"flex",gap:8,justifyContent:"center"}}><Btn ghost onClick={closePkgCreate}>الغاء</Btn><Btn onClick={savePkg} disabled={pkgItems.length===0} style={{background:"#0EA5E9",color:"#fff",border:"none",fontWeight:700}}>{"📦 حفظ + طباعة QR ("+totalQ+" قطعة)"}</Btn></div>
        </div>
      </div>})()}
    {pkgPopup&&pkgPopup.startsWith("view_")&&(()=>{const pkgId=pkgPopup.replace("view_","");const pkg=(config.packages||[]).find(p=>p.id===pkgId);if(!pkg)return null;
      const totalQ=pkg.items?.reduce((s,it)=>s+(Number(it.qty)||0),0)||0;const totalSeries=pkg.items?.reduce((s,it)=>s+(Number(it.count)||0),0)||0;
      const addToPkg=(orderId)=>{const o=orders.find(x=>x.id===orderId);if(!o)return;const rs=getRackSize(orderId);
        upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgId);if(pi<0)return;
          const existing=d.packages[pi].items.findIndex(it=>it.orderId===orderId);
          if(existing>=0){d.packages[pi].items[existing].count++;d.packages[pi].items[existing].qty=d.packages[pi].items[existing].count*d.packages[pi].items[existing].rackSize}
          else{d.packages[pi].items.push({orderId,modelNo:o.modelNo,rackSize:rs,count:1,qty:rs})}
          if(!d.packages[pi].movements)d.packages[pi].movements=[];
          d.packages[pi].movements.push({date:new Date().toISOString().split("T")[0],type:"add",modelNo:o.modelNo,count:1,qty:rs,by:userName||""});
          d.packages[pi].status="مخزن"});playBeep("ok")};
      const updatePkgItem=(idx,newCount)=>{upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgId);if(pi<0)return;const it=d.packages[pi].items[idx];if(!it)return;
        const oldCount=it.count;const diff=newCount-oldCount;it.count=Math.max(0,newCount);it.qty=it.count*it.rackSize;
        if(!d.packages[pi].movements)d.packages[pi].movements=[];
        if(diff!==0)d.packages[pi].movements.push({date:new Date().toISOString().split("T")[0],type:diff>0?"add":"remove",modelNo:it.modelNo,count:Math.abs(diff),qty:Math.abs(diff)*it.rackSize,by:userName||""});
        if(it.count<=0){d.packages[pi].items.splice(idx,1)}
        const totalRemain=d.packages[pi].items.reduce((s,x)=>s+(x.qty||0),0);
        if(totalRemain<=0){d.packages[pi].status="مغلقة";d.packages[pi].closedAt=new Date().toISOString()}})};
      const removePkgItem=(idx)=>{upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgId);if(pi<0)return;const it=d.packages[pi].items[idx];
        if(!d.packages[pi].movements)d.packages[pi].movements=[];
        if(it)d.packages[pi].movements.push({date:new Date().toISOString().split("T")[0],type:"remove",modelNo:it.modelNo,count:it.count,qty:it.qty,by:userName||""});
        d.packages[pi].items.splice(idx,1);
        const totalRemain=d.packages[pi].items.reduce((s,x)=>s+(x.qty||0),0);
        if(totalRemain<=0){d.packages[pi].status="مغلقة";d.packages[pi].closedAt=new Date().toISOString()}});showToast("✓ تم الحذف")};
      const reprintQR=()=>{const qrData=JSON.stringify({app:"clark",type:"pkg",id:pkg.id,num:pkg.number});
        printPkgLabel(pkg.number,pkg.date,pkg.note||"",(pkg.items||[]).map(it=>({...it,desc:orders.find(o=>o.id===it.orderId)?.modelDesc||""})),pkg.movements||[],pkg.status||"مخزن",pkg.createdBy||"",qrData)};
      const printContents=()=>{const qrData=JSON.stringify({app:"clark",type:"pkg",id:pkg.id,num:pkg.number});
        printPkgLabel(pkg.number,pkg.date,pkg.note||"",(pkg.items||[]).map(it=>({...it,desc:orders.find(o=>o.id===it.orderId)?.modelDesc||""})),pkg.movements||[],pkg.status||"مخزن",pkg.createdBy||"",qrData)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setPkgPopup("list")}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":600,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>{"📦 "+pkg.number}</div><div style={{fontSize:FS-2,color:T.textMut}}>{pkg.date+(pkg.note?" — "+pkg.note:"")+(pkg.createdBy?" | "+pkg.createdBy:"")}</div></div>
            <div style={{display:"flex",gap:4}}>
              <Btn small onClick={reprintQR} style={{background:"#0EA5E912",color:"#0EA5E9",border:"1px solid #0EA5E930"}}>QR</Btn>
              <Btn small onClick={printContents} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
              {canEdit&&<DelBtn onConfirm={()=>{upSales(d=>{d.packages=(d.packages||[]).filter(p=>p.id!==pkgId)});setPkgPopup("list");showToast("✓ تم الحذف")}}/>}
              <Btn ghost small onClick={()=>setPkgPopup("list")}>← رجوع</Btn>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:10}}>
            <div style={{padding:8,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>التاريخ</div><div style={{fontSize:FS-1,fontWeight:700}}>{pkg.date}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#0EA5E908",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>موديلات</div><div style={{fontSize:FS+1,fontWeight:800,color:"#0EA5E9"}}>{pkg.items?.length||0}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#8B5CF608",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>سيريهات</div><div style={{fontSize:FS+1,fontWeight:800,color:"#8B5CF6"}}>{totalSeries}</div></div>
            <div style={{padding:8,borderRadius:10,background:T.ok+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>قطع</div><div style={{fontSize:FS+1,fontWeight:800,color:T.ok}}>{totalQ}</div></div>
          </div>
          {/* Edit: add model */}
          {canEdit&&<div style={{marginBottom:10,padding:10,borderRadius:10,border:"1px dashed "+T.accent+"40",background:T.accent+"04"}}>
            <div style={{fontSize:FS-1,fontWeight:700,color:T.accent,marginBottom:6}}>➕ اضف موديل</div>
            <div style={{display:"flex",gap:6}}>
              <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(v)addToPkg(v)}} options={stockModels.filter(m=>m.avail>0).map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc}))} placeholder="اختر موديل..."/></div>
              <Btn small onClick={()=>{if(pkgScan){try{const v=document.getElementById("pkg-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}}setPkgScan(!pkgScan)}} style={{background:pkgScan?"#EF444412":"#0EA5E912",color:pkgScan?"#EF4444":"#0EA5E9",border:"1px solid "+(pkgScan?"#EF444430":"#0EA5E930")}}>{pkgScan?"⏹":"📷"}</Btn>
            </div>
            {pkgScan&&<div style={{marginTop:8}}>
              <div style={{position:"relative",width:"100%",maxWidth:240,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
                <video id="pkg-scan-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                  const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                  const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                    {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;try{const parts=_qr.split(":");if(parts[0]==="CLARK"&&parts[1]){addToPkg(parts[1])}}catch(e){}}}}
                    if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");setPkgScan(false)}})()}}/>
                <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:110,height:110,border:"2px solid #0EA5E9",borderRadius:10,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
              </div>

            </div>}
          </div>}
          {/* Contents table with edit */}
          <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","السيري","سيريهات","الكمية",...(canEdit?[""]:[])] .map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {(pkg.items||[]).map((it,i)=>{const o=orders.find(x=>x.id===it.orderId);return<tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:700,color:T.accent}}>{it.modelNo}</td><td style={{...TD,fontSize:FS-2}}>{o?.modelDesc||"—"}</td><td style={{...TD,textAlign:"center"}}>{it.rackSize}</td>
                <td style={{...TD,textAlign:"center"}}>{canEdit?<input type="number" min="1" value={it.count} onChange={e=>updatePkgItem(i,Number(e.target.value)||1)} style={{width:45,textAlign:"center",border:"1px solid "+T.brd,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit"}}/>:it.count}</td>
                <td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{it.qty}</td>
                {canEdit&&<td style={{...TD,textAlign:"center"}}><span onClick={()=>removePkgItem(i)} style={{cursor:"pointer",color:T.err,fontSize:12}}>🗑️</span></td>}</tr>})}
              <tr style={{background:"#0EA5E908"}}><td colSpan={3} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{totalSeries}</td><td style={{...TD,textAlign:"center",fontWeight:800,fontSize:FS+2,color:"#0EA5E9"}}>{totalQ}</td>{canEdit&&<td style={TD}></td>}</tr>
            </tbody></table>
          </div>
          {/* Movement timeline */}
          {(pkg.movements||[]).length>0&&<div style={{marginTop:12}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:6}}>📋 سجل الحركات:</div>
            <div style={{maxHeight:150,overflowY:"auto",border:"1px solid "+T.brd,borderRadius:10,padding:8}}>
              {(pkg.movements||[]).slice().reverse().map((m,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"4px 0",borderBottom:i<(pkg.movements.length-1)?"1px solid "+T.brd+"40":"none",fontSize:FS-2}}>
                <span style={{color:T.textMut,flexShrink:0}}>{m.date}</span>
                <span style={{fontWeight:800,color:m.type==="add"?"#10B981":m.type==="sell"?"#8B5CF6":"#EF4444",flexShrink:0}}>{m.type==="add"?"📥":m.type==="sell"?"💰":"📤"}</span>
                <span style={{fontWeight:700,color:m.type==="sell"?"#8B5CF6":T.accent}}>{m.type==="sell"?"بيع لـ "+m.custName:m.modelNo}</span>
                <span style={{color:T.textSec}}>{m.type==="sell"?m.totalQty+" ق":"× "+m.count}</span>
                {m.type!=="sell"&&<span style={{fontWeight:800,color:m.type==="add"?"#10B981":"#EF4444"}}>{(m.type==="add"?"+":"-")+m.qty+" ق"}</span>}
                {m.by&&<span style={{color:T.textMut,fontSize:FS-3}}>{m.by}</span>}
              </div>)}
            </div>
          </div>}
          {/* Closed status */}
          {(pkg.status==="مغلقة"||pkg.status==="مباعة")&&<div style={{marginTop:12,padding:10,borderRadius:10,background:(pkg.status==="مباعة"?"#8B5CF6":"#EF4444")+"10",border:"1px solid "+(pkg.status==="مباعة"?"#8B5CF6":"#EF4444")+"30",textAlign:"center"}}>
            <div style={{fontSize:FS,fontWeight:800,color:pkg.status==="مباعة"?"#8B5CF6":"#EF4444"}}>{pkg.status==="مباعة"?"💰 تم البيع":"🔒 كرتونة مغلقة"}</div>
            <div style={{fontSize:FS-2,color:T.textMut}}>{pkg.closedAt?"تم الإغلاق: "+pkg.closedAt.split("T")[0]:""}</div>
          </div>}
        </div>
      </div>})()}
    {/* Stock Receive from Finishing - استلام مخزن جاهز */}
    {stockRcv&&(()=>{const rcvItems=stockRcv.items||{};
      const available=orders.filter(o=>{const wds=o.workshopDeliveries||[];const rcvFromWs=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return rcvFromWs-stockDel>0}).map(o=>{const wds=o.workshopDeliveries||[];const rcvFromWs=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return{id:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,fromFinishing:rcvFromWs-stockDel,rackSize:getRackSize(o.id)}});
      const handleStockScan=(text)=>{try{const parts=text.split(":");if(parts[0]!=="CLARK"||!parts[1])return;const orderId=parts[1];const qrRs=Number(parts[2])||1;
        const o=orders.find(x=>x.id===orderId);if(!o){playBeep("error");showToast("⛔ موديل غير موجود");return}
        const _sz=o.sizeLabel?o.sizeLabel.split(/[-\/,]/).map(s=>s.trim()).filter(Boolean):[];const rs=_sz.length>1?Math.max(qrRs,_sz.length):qrRs;
        setStockRcv(p=>({...p,items:{...p.items,[orderId]:(p.items[orderId]||0)+rs}}));playBeep("ok");showToast("✅ "+o.modelNo+" +"+rs)}catch(e){}};
      const closeStockCam=()=>{try{const v=document.getElementById("stock-rcv-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setStockRcv(p=>({...p,scanning:false}))};
      const totalRcv=Object.values(rcvItems).reduce((s,v)=>s+v,0);
      const confirmStockRcv=()=>{if(totalRcv<=0){showToast("⚠️ لا توجد كميات للاستلام");return}
        Object.entries(rcvItems).forEach(([oid,qty])=>{if(qty<=0)return;updOrder(oid,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty,notes:"استلام من التشطيب",createdBy:userName||""});o.deliveredQty=(o.deliveredQty||0)+qty;o.status=recomputeStatus(o)})});
        playBeep("done");showToast("✅ تم استلام "+totalRcv+" قطعة في مخزن الجاهز");closeStockCam();setStockRcv(null)};
      const printStockRcv=()=>{let h="<h2 style='text-align:center'>📥 إذن استلام مخزن جاهز — "+new Date().toISOString().split("T")[0]+"</h2>";
        h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>متاح من التشطيب</th><th>المستلم</th><th>الفرق</th></tr></thead><tbody>";
        available.forEach(m=>{const rcv=rcvItems[m.id]||0;const diff=rcv-m.fromFinishing;h+="<tr><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center'>"+m.fromFinishing+"</td><td style='text-align:center;font-weight:800;color:#0EA5E9'>"+rcv+"</td><td style='text-align:center;font-weight:800;color:"+(diff===0?"#10B981":diff>0?"#0EA5E9":"#EF4444")+"'>"+diff+"</td></tr>"});
        h+="<tr style='background:#F1F5F9;font-weight:800'><td colspan='3'>الاجمالي</td><td style='text-align:center;color:#0EA5E9'>"+totalRcv+"</td><td></td></tr></tbody></table>";
        h+="<div class='sig'><div class='sig-box'>مسؤول التشطيب</div><div class='sig-box'>أمين المخزن<br/>"+(userName||"")+"</div></div>";printPage("استلام مخزن جاهز",h)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>{closeStockCam();setStockRcv(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,width:"100%",maxWidth:isMob?"100%":650,maxHeight:"92vh",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:isMob?"12px 16px":"16px 24px",borderBottom:"1px solid "+T.brd,flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>📥 استلام مخزن الجاهز</div>
              <div style={{display:"flex",gap:4}}><Btn small onClick={printStockRcv} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>{closeStockCam();setStockRcv(null)}}>✕</Btn></div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <Btn small onClick={()=>{if(stockRcv.scanning){closeStockCam()}else{setStockRcv(p=>({...p,scanning:true}))}}} style={{background:stockRcv.scanning?"#EF444412":"#0EA5E912",color:stockRcv.scanning?"#EF4444":"#0EA5E9",border:"1px solid "+(stockRcv.scanning?"#EF444430":"#0EA5E930")}}>{stockRcv.scanning?"⏹ Stop":"📷 Scan"}</Btn>
              <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(!v)return;const _o=orders.find(x=>x.id===v);const _szz=_o?.sizeLabel?_o.sizeLabel.split(/[-\/,]/).map(s=>s.trim()).filter(Boolean):[];const rs=_szz.length>1?Math.max(getRackSize(v),_szz.length):getRackSize(v);setStockRcv(p=>({...p,items:{...p.items,[v]:(p.items[v]||0)+rs}}));playBeep("ok")}} options={available.map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc+" ("+m.fromFinishing+")"}))} placeholder="اضف يدوي..."/></div>
            </div>
            {stockRcv.scanning&&<div style={{marginTop:8}}>
              <div style={{position:"relative",width:"100%",maxWidth:200,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
                <video id="stock-rcv-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                  const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                  const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                    {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;handleStockScan(t)}}}
                    if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");closeStockCam()}})()}}/>
                <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:100,height:100,border:"2px solid #0EA5E9",borderRadius:10,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
              </div>
            </div>}
          </div>
          <div style={{flex:1,overflowY:"auto",overflowX:"auto",padding:isMob?"8px 16px 16px":"8px 24px 24px"}}>
          <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","من التشطيب","المستلم","الفرق","الحالة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {available.map((m,i)=>{const rcv=rcvItems[m.id]||0;const diff=rcv-m.fromFinishing;
                return<tr key={m.id} style={{background:i%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,fontWeight:700,color:T.accent}}>{m.modelNo}</td>
                  <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</td>
                  <td style={{...TD,textAlign:"center",fontWeight:700,color:"#F59E0B"}}>{m.fromFinishing}</td>
                  <td style={{...TD,textAlign:"center"}}><input type="number" value={rcv||""} onChange={e=>setStockRcv(p=>({...p,items:{...p.items,[m.id]:Math.max(0,Number(e.target.value)||0)}}))} placeholder="0" style={{width:55,textAlign:"center",border:"2px solid "+(rcv?"#0EA5E9":T.brd),borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:rcv?"#0EA5E906":"transparent"}}/></td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:diff===0?"#10B981":diff>0?"#0EA5E9":"#EF4444"}}>{diff}</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2}}>{!rcv?"—":diff===0?"✅ مطابق":diff>0?"🔵 زيادة":"⚠️ عجز"}</td>
                </tr>})}
              {available.length===0&&<tr><td colSpan={6} style={{...TD,textAlign:"center",color:T.textMut,padding:20}}>لا توجد كميات متاحة من التشطيب</td></tr>}
              {available.length>0&&<tr style={{background:"#0EA5E908"}}><td colSpan={3} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{totalRcv}</td><td colSpan={2} style={TD}></td></tr>}
            </tbody></table>
          </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",padding:"12px 24px",borderTop:"1px solid "+T.brd,flexShrink:0}}>
            <Btn onClick={confirmStockRcv} style={{background:"#0EA5E9",color:"#fff",border:"none",fontWeight:700}}>📥 تأكيد الاستلام ({totalRcv} قطعة)</Btn>
            <Btn ghost onClick={()=>{closeStockCam();setStockRcv(null)}}>الغاء</Btn>
          </div>
        </div>
      </div>})()}
    {/* Inventory Audit - جرد المخزن */}
    {invAudit&&(()=>{const auditItems=invAudit.items||{};
      const allStock=stockModels.filter(m=>m.stockQty>0||auditItems[m.id]);
      const handleAuditScan=(text)=>{try{const parts=text.split(":");if(parts[0]!=="CLARK"||!parts[1])return;const orderId=parts[1];const qrRs=Number(parts[2])||1;
        const o=orders.find(x=>x.id===orderId);if(!o){playBeep("error");showToast("⛔ موديل غير موجود");return}
        const _sz=o.sizeLabel?o.sizeLabel.split(/[-\/,]/).map(s=>s.trim()).filter(Boolean):[];const rs=_sz.length>1?Math.max(qrRs,_sz.length):qrRs;
        setInvAudit(p=>{const items={...p.items};items[orderId]=(items[orderId]||0)+rs;return{...p,items}});playBeep("ok");showToast("✅ "+o.modelNo+" +"+rs)}catch(e){}};
      const closeAuditCam=()=>{try{const v=document.getElementById("audit-scan-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setInvAudit(p=>({...p,scanning:false}))};
      const totalSystem=allStock.reduce((s,m)=>s+m.avail,0);const totalCounted=allStock.reduce((s,m)=>s+(auditItems[m.id]||0),0);const totalDiff=totalCounted-totalSystem;
      const applyAdjust=()=>{let adj=0;allStock.forEach(m=>{const counted=auditItems[m.id];if(counted===undefined)return;const diff=counted-m.avail;if(diff===0)return;adj++;
        const adjustQty=diff;updOrder(m.id,o=>{if(!o.deliveries)o.deliveries=[];if(adjustQty>0){o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:adjustQty,notes:"تسوية جرد (زيادة)",createdBy:userName||"",isAdjustment:true})}
          else{const absAdj=Math.abs(adjustQty);const existing=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const custDel=(o.customerDeliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);const custRet=(o.customerReturns||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
            if(!o.customerDeliveries)o.customerDeliveries=[];o.customerDeliveries.push({custId:"_adjust",custName:"تسوية جرد",qty:absAdj,date:new Date().toISOString().split("T")[0],createdBy:userName||"",isAdjustment:true})}})});
        upTasks(d=>{if(!d.inventoryAudits)d.inventoryAudits=[];d.inventoryAudits.push({id:Date.now().toString(36),date:new Date().toISOString().split("T")[0],by:userName||"",items:{...auditItems},adjustments:adj})});
        showToast("✅ تم حفظ الجرد وتسوية "+adj+" موديل");closeAuditCam();setInvAudit(null)};
      const printAudit=()=>{let h="<h2 style='text-align:center'>📋 تقرير جرد المخزن — "+new Date().toISOString().split("T")[0]+"</h2>";
        h+="<table style='margin:0 auto 12px'><tr><th>النظام</th><td style='font-weight:800'>"+totalSystem+"</td><th>الجرد</th><td style='font-weight:800'>"+totalCounted+"</td><th>الفرق</th><td style='font-weight:800;color:"+(totalDiff===0?"#10B981":totalDiff>0?"#0EA5E9":"#EF4444")+"'>"+totalDiff+"</td></tr></table>";
        h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>النظام</th><th>الجرد</th><th>الفرق</th><th>الحالة</th></tr></thead><tbody>";
        allStock.forEach(m=>{const counted=auditItems[m.id]||0;const diff=counted-m.avail;h+="<tr style='background:"+(diff<0?"#FEF2F2":diff>0?"#EFF6FF":"transparent")+"'><td style='font-weight:800'>"+m.modelNo+"</td><td>"+m.modelDesc+"</td><td style='text-align:center'>"+m.avail+"</td><td style='text-align:center;font-weight:800'>"+counted+"</td><td style='text-align:center;font-weight:800;color:"+(diff===0?"#10B981":diff>0?"#0EA5E9":"#EF4444")+"'>"+diff+"</td><td style='text-align:center'>"+(diff===0?"✅ مطابق":diff>0?"🔵 زيادة":"⚠️ عجز")+"</td></tr>"});
        h+="</tbody></table><div class='sig'><div class='sig-box'>أمين المخزن</div><div class='sig-box'>المدير</div></div>";printPage("جرد المخزن",h)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>{closeAuditCam();setInvAudit(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":700,maxHeight:"92vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🏪 جرد المخزن</div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printAudit} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>{closeAuditCam();setInvAudit(null)}}>✕</Btn></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            <div style={{padding:8,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>النظام</div><div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{totalSystem}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#8B5CF608",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>الجرد</div><div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{totalCounted}</div></div>
            <div style={{padding:8,borderRadius:10,background:(totalDiff===0?"#10B981":totalDiff>0?"#0EA5E9":"#EF4444")+"08",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>الفرق</div><div style={{fontSize:FS+2,fontWeight:800,color:totalDiff===0?"#10B981":totalDiff>0?"#0EA5E9":"#EF4444"}}>{totalDiff}</div></div>
          </div>
          {/* Scan or manual */}
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            <Btn small onClick={()=>{if(invAudit.scanning){closeAuditCam()}else{setInvAudit(p=>({...p,scanning:true}))}}} style={{background:invAudit.scanning?"#EF444412":"#8B5CF612",color:invAudit.scanning?"#EF4444":"#8B5CF6",border:"1px solid "+(invAudit.scanning?"#EF444430":"#8B5CF630")}}>{invAudit.scanning?"⏹ Stop":"📷 Scan"}</Btn>
            <div style={{flex:1}}><SearchSel value="" onChange={v=>{if(!v)return;const _o2=orders.find(x=>x.id===v);const _szz2=_o2?.sizeLabel?_o2.sizeLabel.split(/[-\/,]/).map(s=>s.trim()).filter(Boolean):[];const rs=_szz2.length>1?Math.max(getRackSize(v),_szz2.length):getRackSize(v);setInvAudit(p=>{const items={...p.items};items[v]=(items[v]||0)+rs;return{...p,items}});playBeep("ok")}} options={stockModels.map(m=>({value:m.id,label:m.modelNo+" — "+m.modelDesc+" ("+m.avail+")"}))} placeholder="اضف يدوي..."/></div>
          </div>
          {invAudit.scanning&&<div style={{marginBottom:10}}>
            <div style={{position:"relative",width:"100%",maxWidth:260,margin:"0 auto",borderRadius:12,overflow:"hidden",background:"#000"}}>
              <video id="audit-scan-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
                const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
                const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                  {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;handleAuditScan(t)}}}
                  if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");closeAuditCam()}})()}}/>
              <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:130,height:130,border:"2px solid #8B5CF6",borderRadius:10,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
            </div>
          </div>}
          {/* Table */}
          <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","النظام","الجرد","الفرق","الحالة"].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
              {allStock.map((m,i)=>{const counted=auditItems[m.id]||0;const diff=counted-m.avail;const rs=m.rackSize||1;
                return<tr key={m.id} style={{background:diff<0?"#FEF2F208":diff>0?"#EFF6FF":i%2===0?"transparent":T.bg+"80"}}>
                  <td style={{...TD,fontWeight:700,color:T.accent}}>{m.modelNo}</td>
                  <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</td>
                  <td style={{...TD,textAlign:"center"}}>{m.avail}</td>
                  <td style={{...TD,textAlign:"center"}}><input type="number" value={counted||""} onChange={e=>setInvAudit(p=>({...p,items:{...p.items,[m.id]:Math.max(0,Number(e.target.value)||0)}}))} placeholder="0" style={{width:60,textAlign:"center",border:"2px solid "+(counted?"#8B5CF6":T.brd),borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit",background:counted?"#8B5CF606":"transparent"}}/></td>
                  <td style={{...TD,textAlign:"center",fontWeight:800,color:diff===0?"#10B981":diff>0?"#0EA5E9":"#EF4444"}}>{diff}</td>
                  <td style={{...TD,textAlign:"center",fontSize:FS-2}}>{counted===0&&!auditItems[m.id]?"—":diff===0?"✅":diff>0?"🔵 +"+diff:"⚠️ "+diff}</td>
                </tr>})}
            </tbody></table>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12}}>
            <Btn onClick={()=>{const hasChanges=Object.keys(auditItems).some(id=>{const m=stockModels.find(x=>x.id===id);return m&&auditItems[id]!==m.avail});
              if(!hasChanges){showToast("✅ لا توجد فروقات — المخزن مطابق");return}if(confirm("تأكيد التسوية؟ سيتم تعديل أرصدة المخزن"))applyAdjust()}} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>🔧 تسوية الفروقات</Btn>
            <Btn ghost onClick={()=>{closeAuditCam();setInvAudit(null)}}>الغاء</Btn>
          </div>
        </div>
      </div>})()}
    {/* Customer Sales Log */}
        {quoteCust&&(()=>{
      if(quoteCust==="pick"){const custsWithSales=customers.filter(c=>getCustTotal(c.id)>0);
        return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setQuoteCust(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:500,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>🧾 بيان سعر — اختر عميل</div>
              <Btn ghost small onClick={()=>setQuoteCust(null)}>✕</Btn>
            </div>
            {custsWithSales.length>0?custsWithSales.map(c=><div key={c.id} onClick={()=>setQuoteCust(c.id)} style={{padding:"10px 14px",borderRadius:10,border:"1px solid "+T.brd,marginBottom:6,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"06"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div><div style={{fontWeight:700}}>{c.name}</div><div style={{fontSize:FS-2,color:T.textMut}}>{c.type||"مكتب"}{c.phone?" | "+c.phone:""}</div></div>
              <div style={{fontWeight:800,color:T.accent}}>{fmt(getCustTotal(c.id))+" قطعة"}</div>
            </div>):<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد مبيعات</div>}
          </div></div>}
      const cust=customers.find(c=>c.id===quoteCust);if(!cust)return null;
      const rows=[];let grandTotal=0;let missingPrice=false;
      orders.forEach(o=>{const cd=(o.customerDeliveries||[]).filter(d=>d.custId===quoteCust).reduce((s,d)=>s+(Number(d.qty)||0),0);const ret=(o.customerReturns||[]).filter(r=>r.custId===quoteCust).reduce((s,r)=>s+(Number(r.qty)||0),0);const net=cd-ret;
        if(net>0){const price=Number(o.sellPrice)||0;if(!price)missingPrice=true;const lineTotal=net*price;grandTotal+=lineTotal;rows.push({no:o.modelNo,desc:o.modelDesc||"",qty:net,price,total:lineTotal})}});
      const disc=Math.round(grandTotal*0.1);const netTotal=grandTotal-disc;
      const printQuote=()=>{let h="<h2 style='text-align:center'>CLARK — بيان سعر</h2>";
        h+="<table style='margin:0 auto 12px'><tr><td style='padding:4px 12px;font-weight:700'>العميل</td><td style='padding:4px 12px;font-weight:800'>"+cust.name+"</td><td style='padding:4px 12px;font-weight:700'>التاريخ</td><td style='padding:4px 12px'>"+new Date().toISOString().split("T")[0]+"</td></tr></table>";
        h+="<table><thead><tr><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>سعر القطعة</th><th>الاجمالي</th></tr></thead><tbody>";
        rows.forEach(r=>{h+="<tr><td style='font-weight:800'>"+r.no+"</td><td>"+r.desc+"</td><td style='text-align:center;font-weight:700'>"+r.qty+"</td><td style='text-align:center'>"+fmt(r.price)+"</td><td style='text-align:center;font-weight:800'>"+fmt(r.total)+"</td></tr>"});
        h+="</tbody></table><div style='margin-top:16px;padding:12px;border:2px solid #000;border-radius:8px'>";
        h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px'><span style='font-weight:700'>الاجمالي قبل الخصم</span><span style='font-weight:800;font-size:14px'>"+fmt(grandTotal)+" ج.م</span></div>";
        h+="<div style='display:flex;justify-content:space-between;margin-bottom:6px;color:#EF4444'><span style='font-weight:700'>خصم 10%</span><span style='font-weight:800'>- "+fmt(disc)+" ج.م</span></div>";
        h+="<div style='display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #000'><span style='font-weight:800;font-size:16px'>المستحق</span><span style='font-weight:900;font-size:18px;color:#059669'>"+fmt(netTotal)+" ج.م</span></div></div>";
        h+="<div class='sig'><div class='sig-box'>مسؤول المبيعات</div><div class='sig-box'>العميل: "+cust.name+"</div></div>";
        printPage("بيان سعر — "+cust.name,h)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>setQuoteCust(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:600,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{"🧾 بيان سعر — "+cust.name}</div><div style={{fontSize:FS-2,color:T.textMut}}>{cust.phone||""}{cust.type?" | "+cust.type:""}</div></div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printQuote} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>setQuoteCust(null)}>✕</Btn></div>
          </div>
          {missingPrice&&<div style={{padding:8,borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",marginBottom:10,fontSize:FS-1,color:"#EF4444",fontWeight:700}}>⚠️ بعض الموديلات بدون سعر — ادخل الأسعار من جدول التوزيع</div>}
          {rows.length>0?<div>
            <div style={{overflowX:"auto",marginBottom:12}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الموديل","الوصف","الكمية","سعر القطعة","الاجمالي"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
              {rows.map((r,i)=><tr key={i} style={{background:i%2===0?"transparent":T.bg+"80"}}><td style={{...TD,fontWeight:800}}>{r.no}</td><td style={{...TD,fontSize:FS-2}}>{r.desc}</td><td style={{...TDB,fontWeight:700}}>{r.qty}</td><td style={{...TDB}}>{r.price?fmt(r.price):<span style={{color:"#EF4444"}}>—</span>}</td><td style={{...TDB,fontWeight:800,color:T.accent}}>{r.total?fmt(r.total):"—"}</td></tr>)}
            </tbody></table></div>
            <div style={{padding:14,borderRadius:12,border:"2px solid "+T.brd,background:T.bg}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontWeight:700}}>الاجمالي قبل الخصم</span><span style={{fontWeight:800,fontSize:FS+2}}>{fmt(grandTotal)+" ج.م"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,color:"#EF4444"}}><span style={{fontWeight:700}}>خصم 10%</span><span style={{fontWeight:800}}>{"- "+fmt(disc)+" ج.م"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"2px solid "+T.brd}}><span style={{fontWeight:800,fontSize:FS+2}}>المستحق</span><span style={{fontWeight:900,fontSize:FS+4,color:"#059669"}}>{fmt(netTotal)+" ج.م"}</span></div>
            </div>
          </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>لا توجد مبيعات لهذا العميل</div>}
        </div></div>})()}

    {custSalesLog&&(()=>{const isAll=custSalesLog==="all";const cust=isAll?{name:"جميع العملاء",phone:"",type:""}:customers.find(c=>c.id===custSalesLog);if(!cust)return null;
      const moves=[];orders.forEach(o=>{
        (o.customerDeliveries||[]).filter(d=>isAll||d.custId===custSalesLog).forEach((d,di)=>{moves.push({type:"sale",orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,qty:Number(d.qty)||0,date:d.date,sessId:d.sessionId,by:d.createdBy||"",idx:di,rackSize:Number(o.rackSize)||1,custName:d.custName||""})});
        (o.customerReturns||[]).filter(r=>isAll||r.custId===custSalesLog).forEach((r,ri)=>{moves.push({type:"return",orderId:o.id,modelNo:o.modelNo,modelDesc:o.modelDesc,qty:Number(r.qty)||0,date:r.date,note:r.note||"",by:r.createdBy||"",idx:ri,custName:r.custName||""})})});
      moves.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      const totalDel=moves.filter(m=>m.type==="sale").reduce((s,m)=>s+m.qty,0);
      const totalRet=moves.filter(m=>m.type==="return").reduce((s,m)=>s+m.qty,0);
      const saveEdit=(m)=>{const newQty=Math.max(0,editSaleQty);
        if(m.type==="sale"){updOrder(m.orderId,o=>{if(o.customerDeliveries&&o.customerDeliveries[m.idx]){o.customerDeliveries[m.idx].qty=newQty}})}
        else{updOrder(m.orderId,o=>{if(o.customerReturns&&o.customerReturns[m.idx]){o.customerReturns[m.idx].qty=newQty}})}
        setEditSaleIdx(null);showToast("✓ تم تعديل الكمية — المخزن محدّث")};
      const delMove=(m)=>{if(m.type==="sale"){updOrder(m.orderId,o=>{if(o.customerDeliveries)o.customerDeliveries.splice(m.idx,1)})}
        else{updOrder(m.orderId,o=>{if(o.customerReturns)o.customerReturns.splice(m.idx,1)})}showToast("✓ تم الحذف")};
      const printLog=()=>{let h="<h2 style='text-align:center'>📋 سجل مبيعات — "+cust.name+"</h2>";
        h+="<table style='margin:0 auto 12px'><tr><th>اجمالي البيع</th><td style='font-weight:800;color:#0EA5E9'>"+totalDel+"</td><th>المرتجع</th><td style='font-weight:800;color:#EF4444'>"+totalRet+"</td><th>الصافي</th><td style='font-weight:800;color:#10B981'>"+(totalDel-totalRet)+"</td></tr></table>";
        h+="<table><thead><tr><th>التاريخ</th><th>النوع</th><th>الموديل</th><th>الوصف</th><th>الكمية</th><th>بواسطة</th></tr></thead><tbody>";
        moves.forEach(m=>{const isRet=m.type==="return";h+="<tr style='background:"+(isRet?"#FEF2F2":"transparent")+"'><td>"+m.date+"</td><td style='font-weight:800;color:"+(isRet?"#EF4444":"#10B981")+"'>"+(isRet?"↩️ مرتجع":"💰 بيع")+"</td><td style='font-weight:700'>"+m.modelNo+"</td><td style='font-size:10px'>"+m.modelDesc+"</td><td style='text-align:center;font-weight:800;color:"+(isRet?"#EF4444":"#0EA5E9")+"'>"+(isRet?"-":"")+m.qty+"</td><td>"+(m.by||"—")+"</td></tr>"});
        h+="</tbody></table>";printPage("سجل مبيعات — "+cust.name,h)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={()=>{setCustSalesLog(null);setEditSaleIdx(null)}}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?"100%":700,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color:"#059669"}}>{isAll?"📋 سجل حركات البيع":"📋 سجل مبيعات — "+cust.name}</div><div style={{fontSize:FS-2,color:T.textMut}}>{cust.phone||""}{cust.type?" | "+cust.type:""}</div></div>
            <div style={{display:"flex",gap:4}}><Btn small onClick={printLog} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn ghost small onClick={()=>{setCustSalesLog(null);setEditSaleIdx(null)}}>✕</Btn></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
            <div style={{padding:8,borderRadius:10,background:"#0EA5E908",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>بيع</div><div style={{fontSize:FS+2,fontWeight:800,color:"#0EA5E9"}}>{totalDel}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#EF444408",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>مرتجع</div><div style={{fontSize:FS+2,fontWeight:800,color:"#EF4444"}}>{totalRet}</div></div>
            <div style={{padding:8,borderRadius:10,background:"#10B98108",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>صافي</div><div style={{fontSize:FS+2,fontWeight:800,color:"#10B981"}}>{totalDel-totalRet}</div></div>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:120}}><Inp value={logFilter} onChange={v=>{setLogFilter(v);setLogLimit(50)}} placeholder="بحث بالموديل أو العميل..."/></div>
            <Sel value={logTypeFilter} onChange={v=>{setLogTypeFilter(v);setLogLimit(50)}}><option value="">كل الحركات</option><option value="sale">بيع فقط</option><option value="return">مرتجع فقط</option></Sel>
          </div>
          {(()=>{const fMoves=moves.filter(m=>{if(logTypeFilter&&m.type!==logTypeFilter)return false;if(logFilter.trim()){const q=logFilter.trim().toLowerCase();if(!(m.modelNo||"").toLowerCase().includes(q)&&!(m.modelDesc||"").toLowerCase().includes(q)&&!(m.custName||"").toLowerCase().includes(q)&&!(m.date||"").includes(q))return false}return true});
            const fDel=fMoves.filter(m=>m.type==="sale").reduce((s,m)=>s+m.qty,0);const fRet=fMoves.filter(m=>m.type==="return").reduce((s,m)=>s+m.qty,0);
            const shown=fMoves.slice(0,logLimit);const hasMore=fMoves.length>logLimit;
            return fMoves.length>0?<div>
              {(logFilter||logTypeFilter)&&<div style={{fontSize:FS-2,color:T.textMut,marginBottom:6}}>{"نتائج الفلتر: "+fMoves.length+" حركة | بيع: "+fDel+" | مرتجع: "+fRet+" | صافي: "+(fDel-fRet)}</div>}
              <div style={{border:"1px solid "+T.brd,borderRadius:12,overflow:"hidden"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{[...(isAll?["العميل"]:[]),"التاريخ","النوع","الموديل","الوصف","الكمية","بواسطة",""].map(h=><th key={h} style={{...TH,fontSize:FS-2}}>{h}</th>)}</tr></thead><tbody>
            {shown.map((m,i)=>{const isRet=m.type==="return";const isEditing=editSaleIdx===m.type+"_"+m.orderId+"_"+m.idx;const key=m.type+"_"+m.orderId+"_"+m.idx;
              return<tr key={key} style={{background:isRet?"#FEF2F2":i%2===0?"transparent":T.bg+"80"}}>
                {isAll&&<td style={{...TD,fontWeight:600,fontSize:FS-2,color:T.text}}>{m.custName||"—"}</td>}
                <td style={{...TD,fontSize:FS-2}}>{m.date}</td>
                <td style={{...TD,fontWeight:800,color:isRet?"#EF4444":"#10B981",fontSize:FS-1}}>{isRet?"↩️ مرتجع":"💰 بيع"}</td>
                <td style={{...TD,fontWeight:700,color:T.accent}}>{m.modelNo}</td>
                <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{m.modelDesc}</td>
                <td style={{...TD,textAlign:"center"}}>{isEditing?<input type="number" value={editSaleQty} onChange={e=>setEditSaleQty(Number(e.target.value)||0)} style={{width:55,textAlign:"center",border:"2px solid "+T.accent,borderRadius:4,padding:"2px",fontSize:FS,fontWeight:700,fontFamily:"inherit"}} autoFocus/>:<span style={{fontWeight:800,color:isRet?"#EF4444":"#0EA5E9"}}>{(isRet?"-":"")+m.qty}</span>}</td>
                <td style={{...TD,fontSize:FS-3,color:T.textMut}}>{m.by||"—"}</td>
                <td style={{...TD,textAlign:"center"}}>{canEdit&&<div style={{display:"flex",gap:2}}>
                  {isEditing?<><span onClick={()=>saveEdit(m)} style={{cursor:"pointer",fontSize:14}}>💾</span><span onClick={()=>setEditSaleIdx(null)} style={{cursor:"pointer",fontSize:14}}>✕</span></>
                  :<><span onClick={()=>{setEditSaleIdx(key);setEditSaleQty(m.qty)}} style={{cursor:"pointer",fontSize:12}}>✏️</span><DelBtn small onConfirm={()=>delMove(m)}/></>}
                </div>}</td>
              </tr>})}
          </tbody></table></div>
          {hasMore&&<div style={{textAlign:"center",padding:10}}><Btn onClick={()=>setLogLimit(l=>l+25)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>{"عرض المزيد ("+Math.min(25,fMoves.length-logLimit)+" من "+(fMoves.length-logLimit)+" متبقي)"}</Btn></div>}
          <div style={{fontSize:FS-2,color:T.textMut,textAlign:"center",marginTop:6}}>{"عرض "+Math.min(logLimit,fMoves.length)+" من "+fMoves.length+" حركة"}</div>
          </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>{logFilter||logTypeFilter?"لا توجد نتائج":"لا توجد حركات"}</div>})()}
        </div>
      </div>})()}
    {/* Package Action Menu (from QR scan) */}
    {pkgAction?.mode==="menu"&&(()=>{const pkg=(config.packages||[]).find(p=>p.id===pkgAction.id);if(!pkg)return null;const totalQ=pkg.items?.reduce((s,it)=>s+(Number(it.qty)||0),0)||0;
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPkgAction(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:FS+4,fontWeight:900,color:"#0EA5E9"}}>{"📦 "+pkg.number}</div>
            <div style={{fontSize:FS,color:T.textMut}}>{pkg.date+" | "+(pkg.items?.length||0)+" موديل | "+totalQ+" قطعة"}</div>
            {pkg.status==="مغلقة"&&<div style={{fontSize:FS,fontWeight:800,color:"#EF4444",marginTop:4}}>🔒 مغلقة</div>}
          </div>
          {[
            {icon:"📋",label:"عرض المحتويات",desc:"الموديلات والكميات وسجل الحركات",color:T.accent,action:()=>{setPkgAction(null);setPkgPopup("view_"+pkg.id)}},
            ...(pkg.status!=="مغلقة"?[
              {icon:"📥",label:"اضافة للكرتونة",desc:"اسكان QR موديل → يضاف تلقائي",color:"#10B981",action:()=>setPkgAction({id:pkg.id,mode:"add"})},
              {icon:"📤",label:"سحب من الكرتونة",desc:"اسكان QR موديل → ينقص من الكرتونة",color:"#F59E0B",action:()=>setPkgAction({id:pkg.id,mode:"remove"})},
              {icon:"💰",label:"بيع محتويات الكرتونة",desc:"اختار عميل → بيع كل المحتويات + أرشيف",color:"#8B5CF6",action:()=>{setPkgAction(null);setQrSale({mode:"sale",custId:null,items:pkg.items.map(it=>({orderId:it.orderId,modelNo:it.modelNo,modelDesc:orders.find(o=>o.id===it.orderId)?.modelDesc||"",rackSize:it.rackSize,qty:it.qty})),note:"",_pkgId:pkg.id,_pkgNum:pkg.number})}},
            ]:[]),
            {icon:"🖨",label:"طباعة",desc:"طباعة QR + محتويات الكرتونة",color:T.text,action:()=>{setPkgAction(null);setPkgPopup("view_"+pkg.id)}},
          ].map(op=><div key={op.label} onClick={op.action} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,cursor:"pointer",border:"1px solid "+op.color+"20",marginBottom:6}} onMouseEnter={e=>e.currentTarget.style.background=op.color+"08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{width:42,height:42,borderRadius:10,background:op.color+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{op.icon}</div>
            <div><div style={{fontWeight:700,fontSize:FS,color:op.color}}>{op.label}</div><div style={{fontSize:FS-2,color:T.textMut}}>{op.desc}</div></div>
          </div>)}
          <div style={{textAlign:"center",marginTop:8}}><Btn ghost onClick={()=>setPkgAction(null)}>الغاء</Btn></div>
        </div>
      </div>})()}
    {/* Package Scan Add/Remove */}
    {pkgAction&&(pkgAction.mode==="add"||pkgAction.mode==="remove")&&(()=>{const pkg=(config.packages||[]).find(p=>p.id===pkgAction.id);if(!pkg)return null;
      const isAdd=pkgAction.mode==="add";const color=isAdd?"#10B981":"#F59E0B";const title=isAdd?"📥 اضافة لكرتونة ":"📤 سحب من كرتونة ";
      const totalQ=pkg.items?.reduce((s,it)=>s+(Number(it.qty)||0),0)||0;
      const handlePkgScan=(text)=>{try{const parts=text.split(":");if(parts[0]!=="CLARK"||!parts[1])return;const orderId=parts[1];const o=orders.find(x=>x.id===orderId);if(!o){playBeep("error");showToast("⛔ موديل غير موجود");return}
        const rs=getRackSize(orderId);
        if(isAdd){upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgAction.id);if(pi<0)return;
          const existing=d.packages[pi].items.findIndex(it=>it.orderId===orderId);
          if(existing>=0){d.packages[pi].items[existing].count++;d.packages[pi].items[existing].qty=d.packages[pi].items[existing].count*d.packages[pi].items[existing].rackSize}
          else{d.packages[pi].items.push({orderId,modelNo:o.modelNo,rackSize:rs,count:1,qty:rs})}
          if(!d.packages[pi].movements)d.packages[pi].movements=[];
          d.packages[pi].movements.push({date:new Date().toISOString().split("T")[0],type:"add",modelNo:o.modelNo,count:1,qty:rs,by:userName||""})});
          playBeep("ok");showToast("✅ "+o.modelNo+" +1 سيري")}
        else{upSales(d=>{const pi=d.packages.findIndex(p=>p.id===pkgAction.id);if(pi<0)return;
          const existing=d.packages[pi].items.findIndex(it=>it.orderId===orderId);
          if(existing<0){playBeep("error");showToast("⛔ "+o.modelNo+" غير موجود في الكرتونة");return}
          if(d.packages[pi].items[existing].count<=0){playBeep("error");showToast("⛔ "+o.modelNo+" الكمية = 0");return}
          d.packages[pi].items[existing].count--;d.packages[pi].items[existing].qty=d.packages[pi].items[existing].count*d.packages[pi].items[existing].rackSize;
          if(!d.packages[pi].movements)d.packages[pi].movements=[];
          d.packages[pi].movements.push({date:new Date().toISOString().split("T")[0],type:"remove",modelNo:o.modelNo,count:1,qty:rs,by:userName||""});
          if(d.packages[pi].items[existing].count<=0)d.packages[pi].items.splice(existing,1);
          const totalRemain=d.packages[pi].items.reduce((s,x)=>s+(x.qty||0),0);
          if(totalRemain<=0){d.packages[pi].status="مغلقة";d.packages[pi].closedAt=new Date().toISOString();playBeep("done");showToast("🔒 الكرتونة فارغة — تم الإغلاق")}else{playBeep("ok");showToast("📤 "+o.modelNo+" -1 سيري")}})}
      }catch(e){}};
      const closePkgScan=()=>{try{const v=document.getElementById("pkg-action-video");if(v&&v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}}catch(e){}setPkgAction(null)};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:99999,display:"flex",alignItems:"center",justifyContent:"center",padding:isMob?8:16}} onClick={closePkgScan}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:isMob?16:24,width:"100%",maxWidth:isMob?420:500,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div><div style={{fontSize:FS+2,fontWeight:800,color}}>{title+pkg.number}</div><div style={{fontSize:FS-1,color:T.textMut}}>{totalQ+" قطعة حالياً"}</div></div>
            <div style={{display:"flex",gap:4}}><Btn ghost small onClick={()=>setPkgAction({id:pkgAction.id,mode:"menu"})}>← رجوع</Btn><Btn ghost small onClick={closePkgScan}>✕</Btn></div>
          </div>
          <div style={{position:"relative",width:"100%",maxWidth:280,margin:"0 auto 12px",borderRadius:12,overflow:"hidden",background:"#000"}}>
            <video id="pkg-action-video" playsInline muted autoPlay style={{width:"100%",display:"block"}} ref={el=>{if(!el||el.srcObject)return;(async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:640}}});el.srcObject=stream;
              const hasBD=typeof BarcodeDetector!=="undefined";const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;const canvas=document.createElement("canvas");let lastScan="";let lastTime=0;
              const scan=async()=>{if(!el.srcObject)return;if(el.readyState<2){requestAnimationFrame(scan);return}canvas.width=el.videoWidth;canvas.height=el.videoHeight;canvas.getContext("2d").drawImage(el,0,0);
                {const _qr=await scanQR(canvas);if(_qr){const now=Date.now();if(_qr!==lastScan||now-lastTime>2000){lastScan=_qr;lastTime=now;handlePkgScan(t)}}}
                if(el.srcObject)requestAnimationFrame(scan)};setTimeout(scan,500)}catch(e){showToast("⚠️ تعذر فتح الكاميرا");setPkgAction({id:pkgAction.id,mode:"menu"})}})()}}/>
            <div style={{position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",width:140,height:140,border:"2px solid "+color,borderRadius:12,boxShadow:"0 0 0 999px rgba(0,0,0,0.4)"}}/>
          </div>
          <div style={{textAlign:"center",fontSize:FS-1,color:T.textMut,marginBottom:10}}>{isAdd?"وجّه الكاميرا على QR الموديل للاضافة":"وجّه الكاميرا على QR الموديل للسحب"}</div>
          {pkg.items?.length>0&&<div style={{border:"1px solid "+T.brd,borderRadius:10,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{...TH,fontSize:FS-2}}>الموديل</th><th style={{...TH,fontSize:FS-2}}>سيريهات</th><th style={{...TH,fontSize:FS-2}}>الكمية</th></tr></thead><tbody>
              {pkg.items.map((it,i)=><tr key={i}><td style={{...TD,fontWeight:700,color:T.accent}}>{it.modelNo}</td><td style={{...TD,textAlign:"center"}}>{it.count}</td><td style={{...TD,textAlign:"center",fontWeight:800,color:"#0EA5E9"}}>{it.qty}</td></tr>)}
              <tr style={{background:color+"10"}}><td style={{...TD,fontWeight:800}}>الاجمالي</td><td style={{...TD,textAlign:"center",fontWeight:800}}>{pkg.items.reduce((s,it)=>s+(it.count||0),0)}</td><td style={{...TD,textAlign:"center",fontWeight:800,color}}>{totalQ}</td></tr>
            </tbody></table>
          </div>}
        </div>
      </div>})()}
    {/* Custom Label Print */}
    {customLabel==="pick"&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCustomLabel(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:450,maxHeight:"80vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>🏷️ ليبلات QR — اختر موديل</div>
          <Btn ghost small onClick={()=>setCustomLabel(null)} title="إغلاق">✕</Btn>
        </div>
        <div style={{marginBottom:10}}><Inp value={custFilter} onChange={setCustFilter} placeholder="فلتر بالموديل أو الوصف..."/></div>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {stockModels.filter(m=>{if(!custFilter.trim())return true;const q=custFilter.trim().toLowerCase();return(m.modelNo||"").toLowerCase().includes(q)||(m.modelDesc||"").toLowerCase().includes(q)}).map(m=><div key={m.id} onClick={()=>{setCustomLabel(m.id);setCustFilter("")}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:10,cursor:"pointer",border:"1px solid "+T.brd}} onMouseEnter={e=>e.currentTarget.style.background="#F59E0B08"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div><div style={{fontWeight:700,color:T.accent}}>{m.modelNo}</div><div style={{fontSize:FS-2,color:T.textMut}}>{m.modelDesc}</div></div>
            <div style={{textAlign:"left",fontSize:FS-1}}><div style={{fontWeight:700}}>{"رصيد: "+m.avail}</div><div style={{color:T.textMut}}>{"سيري: "+m.rackSize}</div></div>
          </div>)}
        </div>
      </div>
    </div>}
    {customLabel&&customLabel!=="pick"&&(()=>{const clId=typeof customLabel==="object"?customLabel._id:customLabel;const o=orders.find(x=>x.id===clId);if(!o)return null;const rs=getRackSize(o.id);const sm=stockModels.find(m=>m.id===o.id);const totalLabels=sm?Math.ceil(sm.stockQty/rs):0;
      const clQty=(typeof customLabel==="object"?customLabel._qty:null)||rs;
      const clCopies=(typeof customLabel==="object"?customLabel._copies:null)||1;
      const setClField=(f,v)=>setCustomLabel(p=>{const base=typeof p==="object"?p:{_id:p};return{...base,[f]:v}});
      const printQRLabels=(qty,copies)=>{const qrText="CLARK:"+o.id+":"+qty;const ps=config.printSettings||{};const lw=ps.labelWidth||50;const lh=ps.labelHeight||40;const mg=ps.margins||2;const fl=ps.fields||{};
        const qrMM=Math.min(lw-mg*2,lh-mg*2)-8;
        let h="";for(let i=0;i<copies;i++){h+="<div class='lbl'>";
          if(fl.brand?.show)h+="<div style='font-weight:900;font-size:"+((fl.brand?.size||14)/2.5)+"mm;letter-spacing:2px;line-height:1'>CLARK</div>";
          if(fl.modelNo?.show!==false)h+="<div style='font-weight:800;font-size:"+((fl.modelNo?.size||16)/2.5)+"mm;line-height:1.1'>"+o.modelNo+"</div>";
          if(fl.desc?.show)h+="<div style='font-size:"+((fl.desc?.size||10)/2.5)+"mm;color:#444;line-height:1'>"+o.modelDesc+"</div>";
          if(fl.qr?.show!==false)h+="<div style='flex:1;display:flex;align-items:center;justify-content:center'><img class='qr-img' data-text='"+qrText+"' style='width:"+qrMM+"mm;height:"+qrMM+"mm'/></div>";
          if(fl.series?.show!==false)h+="<div style='font-weight:700;font-size:"+((fl.series?.size||12)/2.5)+"mm;line-height:1'>سيري: "+qty+"</div>";
          if(fl.sizeLabel?.show)h+="<div style='font-size:"+((fl.sizeLabel?.size||10)/2.5)+"mm;line-height:1'>"+(o.sizeLabel||"—")+"</div>";
          if(fl.price?.show)h+="<div style='font-size:"+((fl.price?.size||10)/2.5)+"mm;line-height:1'>"+((Number(o.sellPrice)||0)||"—")+" ج.م</div>";
          h+="</div>"}
        const qrOpts2=JSON.stringify({width:400,margin:ps.qrMargin??1,errorCorrectionLevel:ps.qrLevel||"M",color:{dark:ps.qrColor||"#000000",light:"#ffffff"}});
        const w=window.open("","_blank");if(!w)return;w.document.write("<html dir='rtl'><head><title>QR</title><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><style>@page{size:"+lw+"mm "+lh+"mm;margin:"+mg+"mm}*{margin:0;padding:0}body{margin:0;padding:0;font-family:'Cairo',Arial,sans-serif}.lbl{width:"+(lw-mg*2)+"mm;height:"+(lh-mg*2)+"mm;page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden"+(ps.showBorder?";border:1px dashed #999":"")+"}</style></head><body>"+h+"<script>var qrOpts="+qrOpts2+";document.querySelectorAll('.qr-img').forEach(function(img){QRCode.toDataURL(img.dataset.text,qrOpts).then(function(url){img.src=url}).catch(function(){})});setTimeout(function(){window.print()},800)</"+"script></body></html>");w.document.close()};
      return<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCustomLabel(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B"}}>🏷️ ليبلات QR</div>
            <Btn ghost small onClick={()=>setCustomLabel("pick")}>← رجوع</Btn>
          </div>
          <div style={{fontSize:FS-1,color:T.textMut,marginBottom:16}}>{o.modelNo+" — "+o.modelDesc+" (سيري: "+rs+")"}</div>
          <div style={{textAlign:"center",marginBottom:16}}><QRImg text={"CLARK:"+o.id+":"+rs} size={120}/></div>
          {totalLabels>0&&<div onClick={()=>{printQRLabels(rs,totalLabels);setCustomLabel(null);showToast("✓ تم طباعة "+totalLabels+" ليبل")}} style={{padding:14,borderRadius:12,border:"1px solid #F59E0B30",background:"#F59E0B06",cursor:"pointer",textAlign:"center",marginBottom:8}} onMouseEnter={e=>e.currentTarget.style.background="#F59E0B12"} onMouseLeave={e=>e.currentTarget.style.background="#F59E0B06"}>
            <div style={{fontSize:FS,fontWeight:700,color:"#F59E0B"}}>{"🖨 طباعة كل الليبلات ("+totalLabels+" ليبل)"}</div>
            <div style={{fontSize:FS-2,color:T.textMut}}>{sm.stockQty+" قطعة ÷ "+rs+" سيري = "+totalLabels+" ليبل"}</div>
          </div>}
          <div style={{padding:14,borderRadius:12,border:"1px solid "+T.brd,background:T.bg+"40"}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>🏷️ ليبل مخصص</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label style={{fontSize:FS-2,color:T.textSec}}>عدد القطع</label><Sel value={clQty} onChange={v=>setClField("_qty",Number(v))}>{Array.from({length:20},(_,i)=>(i+1)*rs).map(n=><option key={n} value={n}>{n+" قطعة"}</option>)}</Sel></div>
              <div><label style={{fontSize:FS-2,color:T.textSec}}>عدد النسخ</label><Sel value={clCopies} onChange={v=>setClField("_copies",Number(v))}>{Array.from({length:20},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</Sel></div>
            </div>
            <Btn onClick={()=>{printQRLabels(clQty,clCopies);setCustomLabel(null);showToast("✓ تم الطباعة")}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700,width:"100%"}}>{"🖨 طباعة "+clCopies+" ليبل بكمية "+clQty}</Btn>
          </div>
        </div>
      </div>})()}
    {/* Register Customer Popup */}
    {showCustForm&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowCustForm(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:16}}>{cEditId?"✏️ تعديل عميل":"+ تسجيل عميل جديد"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اسم العميل *</label><Inp value={cName} onChange={setCName} placeholder="الاسم بالكامل..."/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>رقم التليفون *</label><Inp value={cPhone} onChange={setCPhone} placeholder="01xxxxxxxxx"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع العميل</label><Sel value={cType} onChange={setCType}><option value="مكتب">🏢 مكتب</option><option value="محل">🏪 محل</option><option value="أونلاين">🌐 أونلاين</option><option value="أخرى">📦 أخرى</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>العنوان</label><Inp value={cAddr} onChange={setCAddr} placeholder="اختياري..."/></div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setShowCustForm(false)}>الغاء</Btn><Btn primary onClick={saveCust} title="حفظ التعديلات">💾 حفظ</Btn></div>
        </div>
      </div>
    </div>}
    {/* New Session Popup */}
    {showNewSession&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowNewSession(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:550,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#059669"}}>🚚 تسليم جديد</div>
          <Btn ghost onClick={()=>setShowNewSession(false)} title="إغلاق">✕</Btn>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>📦 اختر الموديلات:</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto"}}>
            {stockModels.filter(m=>m.avail>0).map(m=><label key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:10,background:selModels[m.id]?T.accent+"08":T.bg,border:"1px solid "+(selModels[m.id]?T.accent+"30":T.brd),cursor:"pointer"}}>
              <input type="checkbox" checked={!!selModels[m.id]} onChange={e=>setSelModels(p=>({...p,[m.id]:e.target.checked}))} style={{width:18,height:18}}/>
              <span style={{fontWeight:700,color:T.accent}}>{m.modelNo}</span>
              <span style={{fontSize:FS-2,color:T.textSec,flex:1}}>{m.modelDesc}</span>
              <span style={{fontSize:FS-2,fontWeight:700,color:T.ok}}>{"متاح: "+m.avail}</span>
              <span style={{fontSize:FS-3,color:T.textMut}}>{"سيري: "+m.rackSize}</span>
            </label>)}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:8}}>👥 اختر العملاء:</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:200,overflowY:"auto"}}>
            {customers.map(c=><label key={c.id} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:10,background:selCusts[c.id]?"#05966908":T.bg,border:"1px solid "+(selCusts[c.id]?"#05966930":T.brd),cursor:"pointer",fontSize:FS-1}}>
              <input type="checkbox" checked={!!selCusts[c.id]} onChange={e=>setSelCusts(p=>({...p,[c.id]:e.target.checked}))} style={{width:16,height:16}}/>
              <span style={{fontWeight:600}}>{c.name}</span>
            </label>)}
          </div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowNewSession(false)}>الغاء</Btn>
          <Btn onClick={createSession} style={{background:"#059669",color:"#fff",border:"none",fontWeight:700}}>✓ انشاء وفتح الجدول</Btn>
        </div>
      </div>
    </div>}
    {/* Shipment Labels Popup */}
    {shipPopup&&activeSess&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShipPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:"#F59E0B",marginBottom:12}}>{"🏷️ طباعة ليبل — "+shipPopup.cust.name}</div>
        <div style={{padding:12,borderRadius:10,background:T.bg,border:"1px solid "+T.brd,marginBottom:12}}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>الاجمالي: <b style={{color:T.accent}}>{shipPopup.total+" قطعة"}</b></div>
          {aMods.map(m=>{const q=Number(aGrid[m.id+"_"+shipPopup.cust.id])||0;return q>0?<div key={m.id} style={{fontSize:FS-2,color:T.text}}>{"• "+m.modelNo+": "+q+" قطعة"}</div>:null})}
        </div>
        <div style={{marginBottom:16}}>
          <label style={{fontSize:FS,fontWeight:700,color:T.text}}>عدد الشحنات (الأكياس)</label>
          <Inp type="number" value={shipCount} onChange={v=>setShipCount(Math.max(1,Number(v)||1))}/>
          <div style={{fontSize:FS-2,color:T.textMut,marginTop:4}}>{"سيتم طباعة "+shipCount+" ليبل مرقمة (1/"+shipCount+" ... "+shipCount+"/"+shipCount+")"}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn ghost onClick={()=>setShipPopup(null)}>الغاء</Btn>
          <Btn onClick={()=>{printCustLabels(shipPopup.cust,aMods,aGrid,activeSess.date,shipPopup.total,shipCount);setShipPopup(null)}} style={{background:"#F59E0B",color:"#fff",border:"none",fontWeight:700}}>{"🖨 طباعة "+shipCount+" ليبل"}</Btn>
          <Btn onClick={()=>{const lines=aMods.map(m=>{const q=Number(aGrid[m.id+"_"+shipPopup.cust.id])||0;return q>0?"• موديل *"+m.modelNo+"*: *"+q+"* قطعة":null}).filter(Boolean).join("%0A");
            const msg="*CLARK — تسليم عميل*%0A%0A• العميل: *"+shipPopup.cust.name+"*%0A• التاريخ: *"+activeSess.date+"*%0A• عدد الشحنات: *"+shipCount+"* شحنة%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+shipPopup.total+"* قطعة%0A%0A⚠️ *برجاء التأكد من استلام "+shipCount+" شحنات كاملة*%0A%0A*برجاء التأكيد*";
            window.open("https://wa.me/"+(shipPopup.cust.phone?shipPopup.cust.phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank");setShipPopup(null)}} style={{background:"#25D366",color:"#fff",border:"none",fontWeight:700}} title="ارسال عبر واتساب">📱 واتساب</Btn>
        </div>
      </div>
    </div>}
    {/* Sales Report Popup */}
    {showReport&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowReport(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:isMob?500:600,maxHeight:"85vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>📊 تقرير مبيعات</div>
          <Btn ghost small onClick={()=>setShowReport(false)} title="إغلاق">✕</Btn>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:FS-1,fontWeight:700,color:T.text,marginBottom:6,display:"block"}}>نوع التقرير</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[{k:"all",l:"📋 كل المبيعات",c:"#8B5CF6"},{k:"customer",l:"👤 حسب عميل",c:"#059669"},{k:"model",l:"📦 حسب موديل",c:T.accent}].map(t=>
              <div key={t.k} onClick={()=>setRptType(t.k)} style={{padding:"8px 14px",borderRadius:10,cursor:"pointer",fontWeight:700,fontSize:FS-1,background:rptType===t.k?t.c+"15":T.bg,color:rptType===t.k?t.c:T.textMut,border:"1.5px solid "+(rptType===t.k?t.c+"40":T.brd),transition:"all 0.15s"}}>{t.l}</div>)}
          </div>
        </div>
        {rptType==="customer"&&<div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>العميل</label>
          <Sel value={rptCust} onChange={setRptCust}><option value="">كل العملاء</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Sel>
        </div>}
        {rptType==="model"&&<div style={{marginBottom:12}}>
          <label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الموديل</label>
          <Sel value={rptModel} onChange={setRptModel}><option value="">كل الموديلات</option>{stockModels.map(m=><option key={m.id} value={m.id}>{m.modelNo+" — "+m.modelDesc}</option>)}</Sel>
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>من تاريخ (اختياري)</label><Inp type="date" value={reportRange.from} onChange={v=>setReportRange(p=>({...p,from:v}))}/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>إلى تاريخ (اختياري)</label><Inp type="date" value={reportRange.to} onChange={v=>setReportRange(p=>({...p,to:v}))}/></div>
        </div>
        <div style={{padding:10,borderRadius:8,background:T.bg,border:"1px solid "+T.brd,marginBottom:16,fontSize:FS-2,color:T.textSec}}>
          {"💡 "+(rptType==="all"?"تقرير شامل بكل العملاء والموديلات":rptType==="customer"?(rptCust?"تقرير مبيعات العميل المحدد بالتفصيل":"تقرير مقارنة كل العملاء"):(rptModel?"تقرير مبيعات الموديل المحدد لكل العملاء":"تقرير مقارنة كل الموديلات"))+(reportRange.from||reportRange.to?" — في الفترة المحددة":" — كل الفترات")}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn ghost onClick={()=>setShowReport(false)}>الغاء</Btn>
          <Btn onClick={printSalesReport} style={{background:"#8B5CF6",color:"#fff",border:"none",fontWeight:700}}>🖨 طباعة التقرير</Btn>
        </div>
      </div>
    </div>}
    {/* Return Popup */}
    {returnPopup&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setReturnPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div style={{fontSize:FS+2,fontWeight:800,color:T.err}}>{"↩️ مرتجع — "+returnPopup.custName}</div><Btn ghost small onClick={()=>setReturnPopup(null)}>✕</Btn></div>
        {returnPopup.models&&returnPopup.models.length>1&&<div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اختر الموديل</label>
          <Sel value={returnPopup.orderId} onChange={v=>{const m=returnPopup.models.find(x=>x.id===v);setReturnPopup(p=>({...p,orderId:v,modelNo:m?.modelNo||""}))}}>
            {returnPopup.models.map(m=><option key={m.id} value={m.id}>{m.modelNo}</option>)}
          </Sel></div>}
        <div style={{fontSize:FS-1,color:T.textSec,marginBottom:8}}>{"موديل: "+returnPopup.modelNo}</div>
        <div style={{marginBottom:10}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الكمية المرتجعة</label><Inp type="number" value={retQty} onChange={v=>setRetQty(Number(v)||0)}/></div>
        <div style={{marginBottom:16}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظة</label><Inp value={retNote} onChange={setRetNote} placeholder="سبب المرتجع..."/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setReturnPopup(null)}>الغاء</Btn><Btn onClick={doReturn} disabled={retQty<=0} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>↩️ تسجيل مرتجع</Btn></div>
      </div>
    </div>}
    {/* Customer QR Popup */}
    {custQR&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setCustQR(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:320,border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",textAlign:"center"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{"👤 "+custQR.name}</div><Btn ghost small onClick={()=>setCustQR(null)}>✕</Btn></div>
        <div style={{fontSize:FS-1,color:T.textMut,marginBottom:12}}>{custQR.phone}</div>
        <img src={custQR.src} style={{width:200,height:200,borderRadius:12,border:"1px solid "+T.brd}}/>
        <div style={{marginTop:12,fontSize:FS-2,color:T.textMut}}>مسح الكود = فتح تسليمات العميل</div>
        <div style={{marginTop:12}}><Btn onClick={()=>{printPage("QR — "+custQR.name,"<div style='text-align:center;padding:20px'><h2 style='margin-bottom:10px'>"+custQR.name+"</h2><p style='margin-bottom:16px'>"+custQR.phone+"</p><img src='"+custQR.src+"' style='width:200px'/></div>")}} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨 طباعة QR</Btn></div>
      </div>
    </div>}
  </div>
}

function SettingsPg({config,upConfig,upSales,upTasks,isMob,user,theme,setTheme,season,orders,syncWsIds,replaceOrder,updOrder,configDoc,salesDoc,tasksDoc}){
  const[newSeason,setNewSeason]=useState("");const[delConfirm,setDelConfirm]=useState("");
  const[newUserEmail,setNewUserEmail]=useState("");const[newUserRole,setNewUserRole]=useState("viewer");
  const[newUserName,setNewUserName]=useState("");const[newUserPass,setNewUserPass]=useState("");const[newUserPass2,setNewUserPass2]=useState("");
  const[createErr,setCreateErr]=useState("");const[createOk,setCreateOk]=useState("");const[creating,setCreating]=useState(false);
  const[clearConfirm,setClearConfirm]=useState(false);
  const[atSelUser,setAtSelUser]=useState("");const[atEditIdx,setAtEditIdx]=useState(null);const[nfEditUser,setNfEditUser]=useState("");
  const[linkMap,setLinkMap]=useState({});
  const[compressing,setCompressing]=useState(false);
  /* Admin password gate */
  const[pendingAction,setPendingAction]=useState(null);const[adminPass,setAdminPass]=useState("");const[passErr,setPassErr]=useState("");const[passLoading,setPassLoading]=useState(false);
  const requirePass=(action)=>{setPendingAction(()=>action);setAdminPass("");setPassErr("")};
  const confirmPass=async()=>{if(!adminPass){setPassErr("ادخل كلمة المرور");return}setPassLoading(true);setPassErr("");
    try{await signInWithEmailAndPassword(auth,user.email,adminPass);if(pendingAction)pendingAction();setPendingAction(null);setAdminPass("")}
    catch(e){setPassErr("كلمة المرور غير صحيحة")}finally{setPassLoading(false)}};
  const handleLogo=async e=>{const f=e.target.files[0];if(!f)return;const compressed=await compressImage(f,200,0.6);requirePass(()=>upConfig(d=>{d.logo=compressed}))};
  const addSeason=()=>{if(!newSeason.trim())return;requirePass(()=>{upConfig(d=>{if(!d.seasons)d.seasons=[];if(!d.seasons.includes(newSeason.trim()))d.seasons.push(newSeason.trim());d.activeSeason=newSeason.trim()});setNewSeason("")})};
  const deleteSeason=(s)=>{requirePass(async()=>{try{const snap=await getDocs(collection(db,"seasons",s,"orders"));await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",s,"orders",d.id))))}catch(e){}upConfig(d=>{d.seasons=(d.seasons||[]).filter(x=>x!==s);if(d.activeSeason===s)d.activeSeason=d.seasons[0]||""})})};
  const clearAllOrders=()=>{requirePass(async()=>{try{const snap=await getDocs(collection(db,"seasons",season,"orders"));await Promise.all(snap.docs.map(d=>deleteDoc(doc(db,"seasons",season,"orders",d.id))))}catch(e){}setClearConfirm(false)})};

  const createUser=async()=>{
    setCreateErr("");setCreateOk("");
    if(!newUserName.trim()||!newUserEmail.trim()||!newUserPass){setCreateErr("اكمل جميع البيانات");return}
    if(newUserPass.length<6){setCreateErr("كلمة المرور 6 حروف على الأقل");return}
    if(newUserPass!==newUserPass2){setCreateErr("كلمة المرور غير متطابقة");return}
    setCreating(true);
    try{
      const secAuth=getSecondaryAuth();
      const cred=await createUserWithEmailAndPassword(secAuth,newUserEmail.trim(),newUserPass);
      await updateProfile(cred.user,{displayName:newUserName.trim()});
      await signOut(secAuth);
      upConfig(d=>{if(!d.usersList)d.usersList=[];const ex=d.usersList.find(u=>u.email===newUserEmail.trim());if(ex){ex.role=newUserRole;ex.name=newUserName.trim()}else{d.usersList.push({email:newUserEmail.trim(),role:newUserRole,name:newUserName.trim()})}});
      setCreateOk("تم انشاء الحساب بنجاح: "+newUserEmail.trim());
      setNewUserName("");setNewUserEmail("");setNewUserPass("");setNewUserPass2("");setNewUserRole("viewer");
    }catch(e){
      setCreateErr(e.code==="auth/email-already-in-use"?"الايميل مستخدم بالفعل":"خطأ: "+e.message)
    }
    setCreating(false);
  };

  return<div>
    {/* Admin Password Modal */}
    {pendingAction&&<div className="pop-overlay" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",direction:"rtl"}} onClick={()=>{setPendingAction(null);setAdminPass("");setPassErr("")}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:isMob?300:360,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",border:"1px solid "+T.brd}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.text,marginBottom:4,textAlign:"center"}}>🔐 تأكيد الهوية</div>
        <div style={{fontSize:FS-1,color:T.textSec,textAlign:"center",marginBottom:16}}>ادخل كلمة مرور المدير للمتابعة</div>
        <Inp type="password" value={adminPass} onChange={setAdminPass} placeholder="كلمة المرور"/>
        {passErr&&<div style={{color:T.err,fontSize:FS-1,fontWeight:600,marginTop:6,textAlign:"center"}}>{passErr}</div>}
        <div style={{display:"flex",gap:8,marginTop:14,justifyContent:"center"}}>
          <Btn primary onClick={confirmPass} disabled={passLoading}>{passLoading?"جاري التحقق...":"تأكيد"}</Btn>
          <Btn ghost onClick={()=>{setPendingAction(null);setAdminPass("");setPassErr("")}}>الغاء</Btn>
        </div>
      </div>
    </div>}
    <Card title="ادارة المواسم" style={{marginBottom:12}}>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}><Inp value={newSeason} onChange={setNewSeason} placeholder="اسم الموسم (مثال: SS27)" style={{width:220}}/><Btn primary onClick={addSeason}>+ موسم جديد</Btn></div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {(config.seasons||[]).map(s=><div key={s} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:12,border:s===config.activeSeason?"2px solid "+T.accent:"1px solid "+T.brd,background:s===config.activeSeason?T.accentBg:T.cardSolid,flexWrap:"wrap",gap:8}}>
          <div onClick={()=>requirePass(()=>upConfig(d=>{d.activeSeason=s}))} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:10}}><span style={{fontWeight:700,fontSize:FS+2,color:s===config.activeSeason?T.accent:T.text}}>{s}</span>{s===config.activeSeason&&<span style={{fontSize:FS-3,color:T.ok,background:T.ok+"15",padding:"2px 10px",borderRadius:12}}>نشط</span>}</div>
          <div style={{display:"flex",gap:8}}>{s!==config.activeSeason&&<Btn small onClick={()=>requirePass(()=>upConfig(d=>{d.activeSeason=s}))} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تفعيل</Btn>}<Btn danger small onClick={()=>deleteSeason(s)}>حذف</Btn></div>
        </div>)}
      </div>
    </Card>
    <Card title="نسخ احتياطي" style={{marginBottom:12}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <Btn primary onClick={()=>{const backup={config,orders,exportDate:new Date().toISOString(),season};const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="clark-backup-"+season+"-"+new Date().toISOString().split("T")[0]+".json";a.click();URL.revokeObjectURL(url)}}>📥 تصدير</Btn>
        <div style={{position:"relative"}}><Btn onClick={()=>{}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>📤 استيراد</Btn><input type="file" accept=".json" onChange={e=>{const f=e.target.files[0];if(!f)return;requirePass(()=>{const reader=new FileReader();reader.onload=async ev=>{try{const d=JSON.parse(ev.target.result);if(d.config){await setDoc(doc(db,"factory","config"),d.config)}if(d.sales){await setDoc(doc(db,"factory","sales"),d.sales)}if(d.tasks){await setDoc(doc(db,"factory","tasks"),d.tasks)}if(d.orders&&d.season){for(const o of d.orders){const{_docId,...rest}=o;await addDoc(collection(db,"seasons",d.season,"orders"),rest)}}alert("تم استيراد النسخة الاحتياطية بنجاح")}catch(err){alert("خطأ في الملف: "+err.message)}};reader.readAsText(f)});e.target.value=""}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div>
        <span style={{fontSize:FS-2,color:T.textSec}}>{"الموسم: "+season}</span>
      </div>
    </Card>
    <Card title="مسح بيانات الأوردرات" style={{marginBottom:12}}>
      <div style={{fontSize:FS,color:T.textSec,marginBottom:10}}>{"الموسم الحالي: "+season+" - عدد الأوردرات: "+(orders||[]).length}</div>
      {!clearConfirm?<Btn danger onClick={()=>setClearConfirm(true)}>مسح جميع الأوردرات للموسم الحالي</Btn>:
      <div style={{padding:16,background:T.err+"08",borderRadius:12,border:"1px solid "+T.err+"30"}}>
        <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:10}}>{"⚠️ سيتم حذف "+(orders||[]).length+" أوردر نهائياً مع جميع التسليمات - هل أنت متأكد؟"}</div>
        <div style={{display:"flex",gap:8}}><Btn danger onClick={clearAllOrders}>تأكيد المسح</Btn><Btn ghost onClick={()=>setClearConfirm(false)}>الغاء</Btn></div>
      </div>}
    </Card>
    <Card title="لوجو المصنع" style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{width:80,height:80,borderRadius:12,border:"2px dashed "+T.brd,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:T.inputBg||T.cardSolid,cursor:"pointer",position:"relative"}}>{config.logo?<img src={config.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:FS-1,color:T.textMut}}>لوجو</span>}<input type="file" accept="image/*" onChange={handleLogo} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div>
        <div><div style={{fontSize:FS,color:T.text,fontWeight:600,marginBottom:4}}>اضغط لرفع اللوجو</div>{config.logo&&<Btn danger small onClick={()=>requirePass(()=>upConfig(d=>{d.logo=""}))} style={{marginTop:4}}>حذف اللوجو</Btn>}</div>
      </div>
    </Card>
    <Card title="ادارة المستخدمين" style={{marginBottom:16}}>
      {/* Create new user */}
      <div style={{padding:20,background:T.accentBg,borderRadius:14,marginBottom:20,border:"1px solid "+T.accent+"20"}}>
        <div style={{fontSize:FS+1,fontWeight:700,color:T.accent,marginBottom:14}}>انشاء حساب جديد</div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>اسم المستخدم *</label><Inp value={newUserName} onChange={setNewUserName} placeholder="الاسم الكامل"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>البريد الالكتروني *</label><Inp value={newUserEmail} onChange={setNewUserEmail} placeholder="example@email.com" type="email"/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>كلمة المرور *</label><Inp value={newUserPass} onChange={setNewUserPass} type="password" placeholder="6 حروف على الأقل"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>تأكيد كلمة المرور *</label><Inp value={newUserPass2} onChange={setNewUserPass2} type="password" placeholder="أعد كتابة كلمة المرور"/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>الصلاحية</label><Sel value={newUserRole} onChange={setNewUserRole}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="sales_accountant">محاسب مبيعات</option><option value="purchase_accountant">محاسب مشتريات</option><option value="viewer">مشاهد فقط</option></Sel></div>
        </div>
        {createErr&&<div style={{color:T.err,fontSize:FS,marginBottom:10,fontWeight:600}}>{"⚠️ "+createErr}</div>}
        {createOk&&<div style={{color:T.ok,fontSize:FS,marginBottom:10,fontWeight:600}}>{"✓ "+createOk}</div>}
        <Btn primary onClick={createUser} disabled={creating}>{creating?"جاري الانشاء...":"انشاء الحساب"}</Btn>
      </div>
      {/* Existing users */}
      <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:10}}>المستخدمين الحاليين</div>
      {(config.usersList||[]).length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["الاسم","البريد","الصلاحية",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {(config.usersList||[]).map((u,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{u.name||"-"}</td><td style={TD}>{u.email}</td><td style={TD}><Sel value={u.role} onChange={v=>requirePass(()=>upConfig(d=>{const x=(d.usersList||[]).find(z=>z.email===u.email);if(x)x.role=v}))}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="sales_accountant">محاسب مبيعات</option><option value="purchase_accountant">محاسب مشتريات</option><option value="viewer">مشاهد فقط</option></Sel></td><td style={TD}>{(()=>{const hasTasks=(Array.isArray(config.tasks)?config.tasks:[]).some(t=>t.toEmail===u.email&&!t.done);return<DelBtn onConfirm={()=>requirePass(()=>upConfig(d=>{d.usersList=(d.usersList||[]).filter(x=>x.email!==u.email)}))} blocked={hasTasks?"لديه مهام مفتوحة":null}/>})()}</td></tr>)}
      </tbody></table></div>}
      {(config.usersList||[]).length===0&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة مستخدمين</div>}
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        {[["مدير النظام",T.accent,"كل الصلاحيات + اعدادات"],["مدير انتاج",T.ok,"اضافة وتعديل"],["محاسب مبيعات","#8B5CF6","تسليم عملاء + تقارير"],["محاسب مشتريات","#F59E0B","تشغيل + حسابات ورش"],["مشاهد",T.warn,"عرض فقط"]].map(([n,c,d])=><div key={n} style={{padding:14,borderRadius:12,background:c+"08",border:"1px solid "+c+"25"}}><div style={{fontSize:FS,fontWeight:700,color:c,marginBottom:4}}>{n}</div><div style={{fontSize:FS-2,color:T.textSec}}>{d}</div></div>)}
      </div>
    </Card>
    {/* Send Notifications */}
    {/* Permissions Management */}
    <Card title="🔐 صلاحيات المستخدمين" style={{marginBottom:16}}>
      {(()=>{
        const perms=config.permissions||{};
        const roles=["admin","manager","sales_accountant","purchase_accountant","viewer"];
        const roleLabels={admin:"أدمن",manager:"مدير",sales_accountant:"مبيعات",purchase_accountant:"مشتريات",viewer:"مشاهد"};
        const tabs=TABS;
        const levels=["edit","view","hide"];
        const levelLabels={edit:"✏️ تعديل",view:"👁 عرض",hide:"❌ مخفي"};
        const levelColors={edit:T.ok,view:T.warn,hide:T.err};
        const setPerm=(role,tabKey,level)=>upConfig(d=>{if(!d.permissions)d.permissions={};if(!d.permissions[role])d.permissions[role]={};d.permissions[role][tabKey]=level});
        return<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
          <thead><tr><th style={TH}>الشاشة</th>{roles.map(r=><th key={r} style={{...TH,textAlign:"center"}}>{roleLabels[r]}</th>)}</tr></thead>
          <tbody>{tabs.map(t=><tr key={t.key}>
            <td style={{...TD,fontWeight:600}}><span style={{marginLeft:6}}>{t.icon}</span>{t.label}</td>
            {roles.map(r=>{const defPerms={admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit",custDeliver:"edit"},manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"edit"},sales_accountant:{dashboard:"view",details:"view",external:"hide",stock:"view",reports:"edit",calc:"hide",tasks:"edit",db:"hide",settings:"hide",custDeliver:"edit"},purchase_accountant:{dashboard:"view",details:"view",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide",custDeliver:"hide"},viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide",custDeliver:"hide"}};const cur=(perms[r]||{})[t.key]||(defPerms[r]||{})[t.key]||"view";
              return<td key={r} style={{...TD,textAlign:"center",padding:"4px 6px"}}>
                {r==="admin"&&t.key==="settings"?<span style={{fontSize:FS-2,color:T.ok,fontWeight:600}}>✏️ دائماً</span>:
                <select value={cur} onChange={e=>setPerm(r,t.key,e.target.value)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid "+T.brd,fontSize:FS-2,fontFamily:"inherit",background:T.inputBg||T.cardSolid,color:levelColors[cur],fontWeight:700,cursor:"pointer"}}>
                  {levels.map(l=><option key={l} value={l}>{levelLabels[l]}</option>)}
                </select>}
              </td>})}
          </tr>)}</tbody>
        </table></div>
      })()}
    </Card>
    {/* Print Settings */}
    <Card title="🖨 إعدادات طباعة QR" style={{marginBottom:16}}>
      {(()=>{const ps=config.printSettings||{labelWidth:50,labelHeight:40,orientation:"portrait",margins:2,qrLevel:"M",qrMargin:1,qrColor:"#000000",showBorder:false,fields:{brand:{show:false,size:14},modelNo:{show:true,size:16},desc:{show:false,size:10},qr:{show:true,size:80},series:{show:true,size:12},sizeLabel:{show:true,size:12},price:{show:false,size:10}}};
        const savePS=(fn)=>upConfig(d=>{if(!d.printSettings)d.printSettings={...ps};fn(d.printSettings)});
        const fields=[{key:"brand",label:"اسم الشركة (CLARK)"},{key:"modelNo",label:"رقم الموديل"},{key:"desc",label:"الوصف"},{key:"qr",label:"كود QR"},{key:"series",label:"عدد القطع (سيري)"},{key:"sizeLabel",label:"المقاس"},{key:"price",label:"السعر"}];
        const printTest=()=>{const w=ps.labelWidth||50;const h=ps.labelHeight||40;const m=ps.margins||2;const qrMM=Math.min(w-m*2,h-m*2)-8;
          const pw_=window.open("","_blank");let html="<html dir='rtl'><head><title>طباعة تجريبية</title><script src='https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js'></"+"script><style>@page{size:"+w+"mm "+h+"mm;margin:"+m+"mm}*{margin:0;padding:0}body{margin:0;padding:0;font-family:'Cairo',Arial,sans-serif}.lbl{width:"+(w-m*2)+"mm;height:"+(h-m*2)+"mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center"+(ps.showBorder?";border:1px dashed #999":"")+"}</style></head><body><div class='lbl'>";
          if(ps.fields?.brand?.show)html+="<div style='font-weight:900;font-size:"+((ps.fields?.brand?.size||14)/2.5)+"mm;letter-spacing:2px;line-height:1'>CLARK</div>";
          if(ps.fields?.modelNo?.show!==false)html+="<div style='font-weight:800;font-size:"+((ps.fields?.modelNo?.size||16)/2.5)+"mm;line-height:1.1'>3262114</div>";
          if(ps.fields?.desc?.show)html+="<div style='font-size:"+((ps.fields?.desc?.size||10)/2.5)+"mm;color:#444;line-height:1'>توينز اولادي قطعتين</div>";
          if(ps.fields?.sizeLabel?.show)html+="<div style='font-weight:700;font-size:"+((ps.fields?.sizeLabel?.size||12)/2.5)+"mm;line-height:1'>مقاس: 8</div>";
          if(ps.fields?.qr?.show!==false)html+="<div style='flex:1;display:flex;align-items:center;justify-content:center'><canvas id='qr' style='width:"+qrMM+"mm;height:"+qrMM+"mm'></canvas></div>";
          if(ps.fields?.series?.show)html+="<div style='font-weight:700;font-size:"+((ps.fields?.series?.size||12)/2.5)+"mm;line-height:1'>سيري: 4</div>";
          if(ps.fields?.price?.show)html+="<div style='font-size:"+((ps.fields?.price?.size||10)/2.5)+"mm;line-height:1'>95 ج.م</div>";
          html+="</div><script>if(document.getElementById('qr'))QRCode.toCanvas(document.getElementById('qr'),'CLARK:test:4',{width:400,margin:"+(ps.qrMargin??1)+",errorCorrectionLevel:'"+(ps.qrLevel||"M")+"',color:{dark:'"+(ps.qrColor||"#000000")+"',light:'#ffffff'}},()=>{});setTimeout(()=>window.print(),800)</"+"script></body></html>";
          pw_.document.write(html);pw_.document.close()};
        return<div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:FS,fontWeight:700,color:T.accent}}>📐 مقاس الليبل:</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>العرض (مم)</label><Inp type="number" value={ps.labelWidth||50} onChange={v=>savePS(s=>{s.labelWidth=Number(v)||50})}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>الارتفاع (مم)</label><Inp type="number" value={ps.labelHeight||40} onChange={v=>savePS(s=>{s.labelHeight=Number(v)||40})}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>الهوامش (مم)</label><Inp type="number" value={ps.margins||2} onChange={v=>savePS(s=>{s.margins=Number(v)||2})}/></div>
          </div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الاتجاه</label><Sel value={ps.orientation||"portrait"} onChange={v=>savePS(s=>{s.orientation=v})}><option value="portrait">رأسي (طولي)</option><option value="landscape">أفقي (عرضي)</option></Sel></div>
          <div style={{fontSize:FS,fontWeight:700,color:T.accent,marginTop:4}}>🔧 إعدادات QR:</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>تصحيح الأخطاء</label><Sel value={ps.qrLevel||"M"} onChange={v=>savePS(s=>{s.qrLevel=v})}><option value="L">L — خفيف (7%)</option><option value="M">M — متوسط (15%)</option><option value="Q">Q — عالي (25%)</option><option value="H">H — أعلى (30%)</option></Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>هامش QR</label><Sel value={ps.qrMargin??1} onChange={v=>savePS(s=>{s.qrMargin=Number(v)})}><option value="0">0 — بدون</option><option value="1">1 — صغير</option><option value="2">2 — متوسط</option><option value="3">3 — كبير</option></Sel></div>
            <div><label style={{fontSize:FS-2,color:T.textSec}}>لون QR</label><Sel value={ps.qrColor||"#000000"} onChange={v=>savePS(s=>{s.qrColor=v})}><option value="#000000">⬛ أسود</option><option value="#1B2A4A">🟦 كحلي</option><option value="#1a1a1a">◼ رمادي غامق</option></Sel></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span onClick={()=>savePS(s=>{s.showBorder=!s.showBorder})} style={{cursor:"pointer",fontSize:16}}>{ps.showBorder?"☑":"☐"}</span>
            <span style={{fontSize:FS-1,fontWeight:600,color:T.text}}>إطار حول الليبل (للاختبار)</span>
          </div>
          <div style={{fontSize:FS,fontWeight:700,color:T.accent,marginTop:4}}>📝 محتوى الليبل:</div>
          {fields.map(f=>{const fv=ps.fields?.[f.key]||{show:false,size:12};return<div key={f.key} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
            <span onClick={()=>savePS(s=>{if(!s.fields)s.fields={};if(!s.fields[f.key])s.fields[f.key]={show:false,size:12};s.fields[f.key].show=!s.fields[f.key].show})} style={{cursor:"pointer",fontSize:16}}>{fv.show?"☑":"☐"}</span>
            <span style={{flex:1,fontSize:FS-1,fontWeight:600,color:fv.show?T.text:T.textMut}}>{f.label}</span>
            {fv.show&&<div style={{width:60}}><Inp type="number" value={fv.size||(f.key==="qr"?80:12)} onChange={v=>savePS(s=>{if(!s.fields)s.fields={};if(!s.fields[f.key])s.fields[f.key]={show:true,size:12};s.fields[f.key].size=Number(v)||12})}/></div>}
          </div>})}
          <div style={{display:"flex",gap:8,marginTop:4}}><Btn onClick={printTest} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨 طباعة تجريبية</Btn></div>
        </div>})()}
    </Card>
    {/* Data Maintenance */}
    <Card title="🔧 صيانة البيانات" style={{marginBottom:16}}>
      {(()=>{
        const wsList=config.workshops||[];const wsNames=new Set(wsList.map(w=>w.name));
        const gtList=config.garmentTypes||[];const gtNames=new Set(gtList.map(g=>g.name));
        const stList=(config.statusCards||[]);const stNames=new Set(stList.map(s=>s.name));
        /* Orphaned workshops */
        const orphanWs=new Map();
        orders.forEach(o=>{(o.workshopDeliveries||[]).forEach(wd=>{if(!wd.wsId&&!wsNames.has(wd.wsName)&&wd.wsName)orphanWs.set(wd.wsName,(orphanWs.get(wd.wsName)||0)+1)})});
        (config.wsPayments||[]).forEach(p=>{if(!p.wsId&&!wsNames.has(p.wsName)&&p.wsName)orphanWs.set(p.wsName,(orphanWs.get(p.wsName)||0)+1)});
        /* Orphaned garment types */
        const orphanGt=new Map();
        orders.forEach(o=>{(o.orderPieces||[]).forEach(p=>{if(!gtNames.has(p)&&p)orphanGt.set(p,(orphanGt.get(p)||0)+1)});(o.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType&&!gtNames.has(wd.garmentType))orphanGt.set(wd.garmentType,(orphanGt.get(wd.garmentType)||0)+1)})});
        /* Orphaned statuses */
        const orphanSt=new Map();
        orders.forEach(o=>{if(o.status&&!stNames.has(o.status))orphanSt.set(o.status,(orphanSt.get(o.status)||0)+1)});
        const totalOrphans=orphanWs.size+orphanGt.size+orphanSt.size;
        /* Dolink */
        const doLink=async()=>{
          const entries=Object.entries(linkMap).filter(([,v])=>v);if(entries.length===0)return;
          const wsMap={};entries.filter(([k])=>orphanWs.has(k)).forEach(([k,v])=>{wsMap[k]=v});
          if(Object.keys(wsMap).length)await syncWsIds(wsMap);
          /* Garment & status renames directly */
          for(const[oldName,newName] of entries){
            if(orphanGt.has(oldName)&&newName){for(const o of orders){let ch=false;const u=JSON.parse(JSON.stringify(o));(u.workshopDeliveries||[]).forEach(wd=>{if(wd.garmentType===oldName){wd.garmentType=newName;ch=true}});u.orderPieces=(u.orderPieces||[]).map(p=>p===oldName?(ch=true,newName):p);FKEYS.forEach(k=>{if(u["fabricPieces"+k])u["fabricPieces"+k]=u["fabricPieces"+k].map(p=>p===oldName?(ch=true,newName):p)});if(ch)await replaceOrder(o.id,u)}}
            if(orphanSt.has(oldName)&&newName){for(const o of orders){if(o.status===oldName){const u={...o};u.status=newName;await replaceOrder(o.id,u)}}}
          }
          setLinkMap({});showToast("✓ تم الربط والتحديث");
        };
        /* Data integrity */
        const issues=[];
        orders.forEach(o=>{const t=calcOrder(o);
          if(!o.modelNo)issues.push({ord:o.id,msg:"بدون رقم موديل",sev:"err"});
          if(!o.fabricA&&!o.fabricB)issues.push({ord:o.id,no:o.modelNo,msg:"بدون خامة",sev:"warn"});
          if(t.cutQty===0)issues.push({ord:o.id,no:o.modelNo,msg:"كمية القص = 0",sev:"warn"});
          if(!o.sizeSetId&&!o.sizeLabel)issues.push({ord:o.id,no:o.modelNo,msg:"بدون مقاس",sev:"warn"});
          /* Orphan deliveries — sessionId not found */
          (o.customerDeliveries||[]).forEach(d=>{if(d.sessionId&&!(config.custDeliverySessions||[]).some(s=>s.id===d.sessionId))issues.push({ord:o.id,no:o.modelNo,msg:"تسليم عميل يتيم (جلسة محذوفة)",sev:"err"})});
          /* Orphan returns — sessId not found */
          /* customerReturns are independent — no session linking */;
        });
        /* Orphan session grid entries */
        const orderIds=new Set(orders.map(o=>o.id));const custIds=new Set((config.customers||[]).map(c=>c.id));
        let orphanGridCount=0;
        (config.custDeliverySessions||[]).forEach(s=>{Object.keys(s.grid||{}).forEach(k=>{const[oid,cid]=k.split("_");if(!orderIds.has(oid)||!custIds.has(cid))orphanGridCount++})});
        (config.salesAudits||[]).forEach(a=>{Object.keys(a.grid||{}).forEach(k=>{const[oid,cid]=k.split("_");if(!orderIds.has(oid)||!custIds.has(cid))orphanGridCount++})});
        if(orphanGridCount>0)issues.push({msg:orphanGridCount+" بيانات يتيمة في جلسات/جرد (أوردر أو عميل محذوف)",sev:"err"});
        const cleanOrphans=()=>{
          /* Clean orphan deliveries & returns from orders */
          const sessIds=new Set((config.custDeliverySessions||[]).map(s=>s.id));
          orders.forEach(o=>{const hasBadDel=(o.customerDeliveries||[]).some(d=>d.sessionId&&!sessIds.has(d.sessionId));const hasBadRet=false;
            if(hasBadDel||hasBadRet)updOrder(o.id,u=>{u.customerDeliveries=(u.customerDeliveries||[]).filter(d=>!d.sessionId||sessIds.has(d.sessionId));/* returns have no sessId */})});
          /* Clean orphan grid entries in sessions & audits */
          upSales(d=>{(d.custDeliverySessions||[]).forEach(s=>{if(!s.grid)return;Object.keys(s.grid).forEach(k=>{const[oid,cid]=k.split("_");if(!orderIds.has(oid)||!custIds.has(cid))delete s.grid[k]})});
            (d.salesAudits||[]).forEach(a=>{if(!a.grid)return;Object.keys(a.grid).forEach(k=>{const[oid,cid]=k.split("_");if(!orderIds.has(oid)||!custIds.has(cid))delete a.grid[k]})})});
          showToast("✓ تم تنظيف البيانات اليتيمة")};
        /* Notifications cleanup */
        const notifs=config.notifications||[];const now=new Date();
        const oldNotifs=notifs.filter(n=>{const d=new Date(n.createdAt);return(now-d)/(1000*60*60*24)>30});
        const excessNotifs=notifs.length>50?notifs.length-50:0;
        const cleanNotifs=()=>upConfig(d=>{const cutoff=new Date();cutoff.setDate(cutoff.getDate()-30);d.notifications=(d.notifications||[]).filter(n=>new Date(n.createdAt)>=cutoff).slice(-50);showToast("✓ تم تنظيف الاشعارات")});
        /* Storage stats */
        const configSize=JSON.stringify(config).length;const ordersSize=JSON.stringify(orders).length;
        const totalSize=configSize+ordersSize;
        const imgSize=orders.reduce((s,o)=>{let sz=(o.image||"").length;(o.attachments||[]).forEach(a=>sz+=(a.data||"").length);return s+sz},0);
        const wsImgSize=(config.workshops||[]).reduce((s,w)=>s+(w.ownerPhoto||"").length+(w.idCard||"").length,0);
        /* Backup */
        const doBackup=()=>{const backup={config:configDoc,sales:salesDoc,tasks:tasksDoc,orders:orders.map(o=>{const c={...o};delete c._docId;return c}),exportDate:new Date().toISOString(),season};const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="CLARK_backup_"+season+"_"+new Date().toISOString().split("T")[0]+".json";a.click();URL.revokeObjectURL(url);showToast("✓ تم تنزيل النسخة الاحتياطية")};
        /* Compress images */
        const compressOldImages=async()=>{setCompressing(true);let cnt=0;
          for(const o of orders){if(!o.image||o.image.length<50000)continue;
            try{const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=o.image});
              const canvas=document.createElement("canvas");const max=150;const ratio=Math.min(max/img.width,max/img.height,1);canvas.width=img.width*ratio;canvas.height=img.height*ratio;canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
              const compressed=canvas.toDataURL("image/jpeg",0.4);
              if(compressed.length<o.image.length){await replaceOrder(o.id,{...o,image:compressed});cnt++}
            }catch(e){}
          }
          setCompressing(false);showToast("✓ تم ضغط صور "+cnt+" أوردر")};

        return<div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* 1. Orphan linking */}
          <div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              <Btn onClick={()=>syncWsIds()} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🔄 مزامنة</Btn>
              <span style={{fontSize:FS-2,color:T.textSec}}>مزامنة أسماء الورش في كل الحركات</span>
            </div>
            {totalOrphans>0?<div style={{marginTop:10,padding:14,borderRadius:12,background:T.err+"06",border:"1px solid "+T.err+"20"}}>
              <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:8}}>{"⚠️ أسماء غير مرتبطة ("+totalOrphans+")"}</div>
              {[...orphanWs.entries()].map(([name,count])=><div key={"ws-"+name} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,padding:"6px 10px",background:T.cardSolid,borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1}}>
                <span style={{color:T.err,fontWeight:700}}>🏭 {name}</span><span style={{fontSize:FS-3,color:T.textMut}}>{"("+count+")"}</span><span style={{color:T.textSec}}>→</span>
                <Sel value={linkMap[name]||""} onChange={v=>setLinkMap(p=>({...p,[name]:v}))}><option value="">--</option>{wsList.map(w=><option key={w.id} value={w.id}>{wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — "+w.name}</option>)}</Sel>
              </div>)}
              {[...orphanGt.entries()].map(([name,count])=><div key={"gt-"+name} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,padding:"6px 10px",background:T.cardSolid,borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1}}>
                <span style={{color:T.warn,fontWeight:700}}>👕 {name}</span><span style={{fontSize:FS-3,color:T.textMut}}>{"("+count+")"}</span><span style={{color:T.textSec}}>→</span>
                <Sel value={linkMap[name]||""} onChange={v=>setLinkMap(p=>({...p,[name]:v}))}><option value="">--</option>{gtList.map(g=><option key={g.id} value={g.name}>{g.name}</option>)}</Sel>
              </div>)}
              {[...orphanSt.entries()].map(([name,count])=><div key={"st-"+name} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,padding:"6px 10px",background:T.cardSolid,borderRadius:8,border:"1px solid "+T.brd,fontSize:FS-1}}>
                <span style={{color:T.accent,fontWeight:700}}>📌 {name}</span><span style={{fontSize:FS-3,color:T.textMut}}>{"("+count+")"}</span><span style={{color:T.textSec}}>→</span>
                <Sel value={linkMap[name]||""} onChange={v=>setLinkMap(p=>({...p,[name]:v}))}><option value="">--</option>{stList.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</Sel>
              </div>)}
              <Btn primary onClick={doLink} disabled={!Object.values(linkMap).some(v=>v)} style={{marginTop:8}}>✓ ربط وتحديث</Btn>
            </div>:<div style={{marginTop:6,fontSize:FS-1,color:T.ok,fontWeight:600}}>✓ كل الأسماء مرتبطة</div>}
          </div>

          {/* 2. Notifications cleanup */}
          {(oldNotifs.length>0||excessNotifs>0)&&<div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"20"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:FS-1,color:T.warn,fontWeight:600}}>{"🔔 "+notifs.length+" اشعار"+(oldNotifs.length>0?" — "+oldNotifs.length+" أقدم من 30 يوم":"")+(excessNotifs>0?" — "+excessNotifs+" زيادة عن 50":"")}</span>
              <Btn small onClick={cleanNotifs} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>🧹 تنظيف</Btn>
            </div>
          </div>}

          {/* 3. Data integrity */}
          {issues.length>0&&<div style={{padding:12,borderRadius:10,background:T.err+"06",border:"1px solid "+T.err+"15"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:FS,fontWeight:700,color:T.err}}>{"🔍 مشاكل في البيانات ("+issues.length+")"}</div>
              {issues.some(i=>i.msg.includes("يتيم"))&&<Btn small onClick={cleanOrphans} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30"}}>🧹 تنظيف اليتيمة</Btn>}
            </div>
            {issues.slice(0,10).map((iss,i)=><div key={i} style={{fontSize:FS-2,padding:"4px 0",color:iss.sev==="err"?T.err:T.warn}}>{"• "+(iss.no||"—")+" — "+iss.msg}</div>)}
            {issues.length>10&&<div style={{fontSize:FS-3,color:T.textMut}}>{"و "+(issues.length-10)+" مشكلة أخرى..."}</div>}
          </div>}
          {issues.length===0&&<div style={{fontSize:FS-1,color:T.ok,fontWeight:600}}>✓ لا توجد مشاكل في البيانات</div>}

          {/* 4+5. Backup & Restore */}
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <Btn onClick={doBackup} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>💾 نسخة احتياطية</Btn>
            <label style={{cursor:"pointer",padding:"6px 16px",borderRadius:8,background:"#8B5CF612",color:"#8B5CF6",border:"1px solid #8B5CF630",fontSize:FS-1,fontWeight:600}}>
              📂 استعادة
              <input type="file" accept=".json" style={{display:"none"}} onChange={async e=>{const file=e.target.files[0];if(!file)return;if(!confirm("⚠️ سيتم استبدال جميع البيانات الحالية بالنسخة الاحتياطية. متأكد؟"))return;try{const text=await file.text();const backup=JSON.parse(text);if(!backup.config||!backup.orders){alert("ملف غير صالح");return}upConfig(d=>{Object.assign(d,backup.config)});showToast("✓ تم استعادة الاعدادات — الأوردرات تحتاج استعادة يدوية من Firebase")}catch(er){alert("خطأ في قراءة الملف")}}}/>
            </label>
            <span style={{fontSize:FS-3,color:T.textMut}}>JSON بكل بيانات الموسم</span>
          </div>

          {/* 6. Compress images */}
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <Btn onClick={compressOldImages} disabled={compressing} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>{compressing?"جاري الضغط...":"🗜️ ضغط الصور"}</Btn>
            <span style={{fontSize:FS-3,color:T.textMut}}>يعيد ضغط صور الأوردرات الكبيرة (أكبر من 50KB)</span>
          </div>

          {/* 7. Storage stats */}
          <div style={{padding:14,borderRadius:12,background:T.bg,border:"1px solid "+T.brd}}>
            <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:10}}>📊 احصائيات التخزين</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:T.cardSolid}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>اجمالي</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{(totalSize/1024/1024).toFixed(2)+" MB"}</div>
              </div>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:T.cardSolid}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>الأوردرات</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{(ordersSize/1024/1024).toFixed(2)+" MB"}</div>
              </div>
              <div style={{textAlign:"center",padding:8,borderRadius:8,background:T.cardSolid}}>
                <div style={{fontSize:FS-2,color:T.textSec}}>الصور</div>
                <div style={{fontSize:FS+2,fontWeight:800,color:T.warn}}>{((imgSize+wsImgSize)/1024/1024).toFixed(2)+" MB"}</div>
              </div>
            </div>
            <div style={{marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:FS-2,color:T.textSec,marginBottom:3}}><span>استهلاك التخزين</span><span>{(totalSize/1024/1024).toFixed(2)+" / 1.0 MB (حد المستند)"}</span></div>
              <div style={{height:8,borderRadius:4,background:"#E2E8F0",overflow:"hidden"}}><div style={{height:"100%",width:Math.min(100,totalSize/1024/1024*100)+"%",borderRadius:4,background:totalSize>800000?T.err:totalSize>500000?T.warn:T.ok}}/></div>
            </div>
          </div>
        </div>})()}
    </Card>
    {/* ── Data Maintenance ── */}
    <Card title="🔧 صيانة البيانات" style={{marginTop:16}}>
      {(()=>{const sessIds=new Set((config.custDeliverySessions||[]).map(s=>s.id));
        let orphanCount=0;const orphanDetails=[];
        orders.forEach(o=>{
          const orphans=(o.customerDeliveries||[]).filter(d=>!d.sessionId||!sessIds.has(d.sessionId));
          if(orphans.length>0){orphanCount+=orphans.length;orphanDetails.push({model:o.modelNo,count:orphans.length})}
        });
        const orphanReturns=orders.reduce((s,o)=>{const rets=(o.customerReturns||[]).filter(r=>{if(!r.custId)return true;const custExists=(config.customers||[]).some(c=>c.id===r.custId);return!custExists});return s+rets.length},0);
        const emptyDels=orders.filter(o=>(o.customerDeliveries||[]).some(d=>!d.qty||d.qty<=0)).length;
        const totalIssues=orphanCount+orphanReturns+emptyDels;
        const cleanOrphans=()=>{
          let cleaned=0;
          orders.forEach(o=>{
            const orphans=(o.customerDeliveries||[]).filter(d=>!d.sessionId||!sessIds.has(d.sessionId));
            const emptyQ=(o.customerDeliveries||[]).filter(d=>!d.qty||d.qty<=0);
            const orphanRets=(o.customerReturns||[]).filter(r=>!r.custId||!(config.customers||[]).some(c=>c.id===r.custId));
            if(orphans.length>0||emptyQ.length>0||orphanRets.length>0){
              updOrder(o.id,ord=>{
                if(orphans.length>0||emptyQ.length>0){ord.customerDeliveries=(ord.customerDeliveries||[]).filter(d=>d.sessionId&&sessIds.has(d.sessionId)&&d.qty>0)}
                if(orphanRets.length>0){ord.customerReturns=(ord.customerReturns||[]).filter(r=>r.custId&&(config.customers||[]).some(c=>c.id===r.custId))}
              });cleaned+=orphans.length+emptyQ.length+orphanRets.length}
          });
          showToast("✓ تم تنظيف "+cleaned+" سجل يتيم")};
        return<div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
            <div style={{padding:10,borderRadius:8,background:totalIssues>0?T.warn+"08":T.ok+"08",border:"1px solid "+(totalIssues>0?T.warn:T.ok)+"15",textAlign:"center",flex:1,minWidth:120}}>
              <div style={{fontSize:FS-2,color:T.textSec}}>بيانات يتيمة</div>
              <div style={{fontSize:18,fontWeight:800,color:totalIssues>0?T.warn:T.ok}}>{totalIssues}</div>
            </div>
            <div style={{padding:10,borderRadius:8,background:T.bg,border:"1px solid "+T.brd,textAlign:"center",flex:1,minWidth:120}}>
              <div style={{fontSize:FS-2,color:T.textSec}}>تسليمات يتيمة</div>
              <div style={{fontSize:18,fontWeight:800,color:orphanCount>0?T.err:T.ok}}>{orphanCount}</div>
            </div>
            <div style={{padding:10,borderRadius:8,background:T.bg,border:"1px solid "+T.brd,textAlign:"center",flex:1,minWidth:120}}>
              <div style={{fontSize:FS-2,color:T.textSec}}>مرتجعات يتيمة</div>
              <div style={{fontSize:18,fontWeight:800,color:orphanReturns>0?T.err:T.ok}}>{orphanReturns}</div>
            </div>
          </div>
          {orphanDetails.length>0&&<div style={{marginBottom:12,fontSize:FS-2,color:T.textMut}}>
            {orphanDetails.map(d=><span key={d.model} style={{display:"inline-block",padding:"2px 8px",margin:2,borderRadius:6,background:T.warn+"10",color:T.warn,fontWeight:600}}>{"موديل "+d.model+": "+d.count+" يتيم"}</span>)}
          </div>}
          {totalIssues>0?<Btn onClick={cleanOrphans} style={{background:T.warn,color:"#fff",border:"none",fontWeight:700}}>🧹 تنظيف البيانات اليتيمة ({totalIssues})</Btn>
          :<div style={{fontSize:FS-1,color:T.ok,fontWeight:600}}>✅ البيانات نظيفة — لا توجد سجلات يتيمة</div>}
        </div>})()}
    </Card>
    {/* ── Auto Bot Tasks Settings (multi-user) ── */}
    {/* ── Notification Control ── */}
    <Card title="🔔 التحكم في الاشعارات" style={{marginTop:16}}>
      {(()=>{const users=config.usersList||[];const prefs=config.notifPrefs||{};
        const NTYPES=[{key:"botAlerts",label:"تنبيهات البوت الذكية",icon:"🤖"},{key:"tasks",label:"المهام",icon:"📌"},{key:"movements",label:"حركات التشغيل",icon:"🔄"},{key:"statusChanges",label:"تغيير حالة الأوردر",icon:"📋"},{key:"stockDelivery",label:"تسليم مخزن جاهز",icon:"📦"},{key:"custDelivery",label:"تسليم عملاء",icon:"🚚"}];
        const updatePref=(email,key,val)=>{upConfig(d=>{if(!d.notifPrefs)d.notifPrefs={};if(!d.notifPrefs[email])d.notifPrefs[email]={};d.notifPrefs[email][key]=val})};
        return<div>
          <div style={{fontSize:FS-1,color:T.textMut,marginBottom:10}}>تحكم في نوع الإشعارات اللي يستلمها كل مستخدم</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {users.map(u=>{const up=prefs[u.email]||{};const isOpen=nfEditUser===u.email;
              const enabledCount=NTYPES.filter(t=>up[t.key]!==false).length;
              return<div key={u.email} style={{borderRadius:10,border:"1px solid "+(isOpen?T.accent:T.brd),overflow:"hidden"}}>
                <div onClick={()=>setNfEditUser(isOpen?"":u.email)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer",background:isOpen?T.accent+"06":T.bg}}>
                  <span style={{fontSize:14}}>👤</span>
                  <span style={{flex:1,fontWeight:700,fontSize:FS-1}}>{u.name||u.email}</span>
                  <span style={{fontSize:FS-3,color:T.textMut}}>{enabledCount+"/"+NTYPES.length+" مفعّل"}</span>
                  <span style={{color:T.textMut,fontSize:10}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&<div style={{padding:"8px 12px",borderTop:"1px solid "+T.brd,display:"flex",flexDirection:"column",gap:6}}>
                  {NTYPES.map(t=>{const enabled=up[t.key]!==false;
                    return<label key={t.key} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:6,background:enabled?T.ok+"06":T.bg,border:"1px solid "+(enabled?T.ok+"15":T.brd),cursor:"pointer"}}>
                      <input type="checkbox" checked={enabled} onChange={e=>updatePref(u.email,t.key,e.target.checked)} style={{width:16,height:16}}/>
                      <span style={{fontSize:14}}>{t.icon}</span>
                      <span style={{fontSize:FS-2,fontWeight:600,color:enabled?T.text:T.textMut}}>{t.label}</span>
                    </label>})}
                </div>}
              </div>})}
          </div>
        </div>})()}
    </Card>
    <Card title="🤖 المهام التلقائية" style={{marginTop:16}}>
      {(()=>{const at=config.autoTasks||{enabled:false,users:[]};const atUsers=at.users||[];const allUsers=config.usersList||[];
        const RULES=[{key:"noDeliver",label:"موديل مقصوص ولم يُسلَّم لورشة",icon:"✂️",dd:5},{key:"availPiece",label:"قطعة متاحة ولم تُسلَّم",icon:"👔",dd:5},{key:"slowWorkshop",label:"ورشة متأخرة في الاستلام",icon:"🐢",dd:14},{key:"stockNoSale",label:"مخزن جاهز لم يُسلَّم لعملاء",icon:"📦",dd:7}];
        const defaultRules=()=>{const r={};RULES.forEach(ru=>{r[ru.key]={enabled:true,days:ru.dd}});return r};
        const toggleEnabled=()=>{upConfig(d=>{if(!d.autoTasks)d.autoTasks={enabled:false,users:[]};d.autoTasks.enabled=!d.autoTasks.enabled})};
        const addUser=()=>{if(!atSelUser)return;const u=allUsers.find(x=>x.email===atSelUser);if(atUsers.some(x=>x.email===atSelUser)){showToast("⚠️ المستخدم مضاف بالفعل");return}
          upConfig(d=>{if(!d.autoTasks)d.autoTasks={enabled:true,users:[]};if(!d.autoTasks.users)d.autoTasks.users=[];d.autoTasks.users.push({email:atSelUser,name:u?.name||atSelUser.split("@")[0],rules:defaultRules()})});setAtSelUser("");showToast("✓ تم الإضافة")};
        const removeUser=(email)=>{upConfig(d=>{d.autoTasks.users=(d.autoTasks.users||[]).filter(x=>x.email!==email)});if(atEditIdx!==null)setAtEditIdx(null)};
        const updateRule=(idx,ruleKey,field,val)=>{upConfig(d=>{const u=d.autoTasks.users[idx];if(!u)return;if(!u.rules)u.rules=defaultRules();if(!u.rules[ruleKey])u.rules[ruleKey]={enabled:true,days:5};u.rules[ruleKey][field]=val})};
        return<div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
              <input type="checkbox" checked={!!at.enabled} onChange={toggleEnabled} style={{width:20,height:20}}/>
              <span style={{fontSize:FS,fontWeight:700,color:at.enabled?T.ok:T.textMut}}>{at.enabled?"مفعّلة":"معطّلة"}</span>
            </label>
            <span style={{fontSize:FS-2,color:T.textMut}}>{"("+atUsers.length+" مستخدم)"}</span>
          </div>
          {at.enabled&&<div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
              <div style={{flex:1}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>اضافة مستخدم</label>
                <Sel value={atSelUser} onChange={setAtSelUser}><option value="">-- اختر --</option>
                  {allUsers.filter(u=>!atUsers.some(a=>a.email===u.email)).map(u=><option key={u.email} value={u.email}>{u.name||u.email}</option>)}
                </Sel></div>
              <Btn primary onClick={addUser} disabled={!atSelUser}>+ اضافة</Btn>
            </div>
            {atUsers.map((au,idx)=>{const isOpen=atEditIdx===idx;const rules=au.rules||{};
              return<div key={au.email} style={{borderRadius:12,border:"1px solid "+(isOpen?T.accent:T.brd),overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:isOpen?T.accent+"06":T.bg,cursor:"pointer"}} onClick={()=>setAtEditIdx(isOpen?null:idx)}>
                  <span style={{fontSize:16}}>👤</span>
                  <span style={{flex:1,fontWeight:700,fontSize:FS}}>{au.name||au.email}</span>
                  <span style={{fontSize:FS-2,color:T.textMut}}>{Object.values(rules).filter(r=>r.enabled).length+" قاعدة فعّالة"}</span>
                  <span style={{color:T.textMut,fontSize:12}}>{isOpen?"▲":"▼"}</span>
                </div>
                {isOpen&&<div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:8,borderTop:"1px solid "+T.brd}}>
                  {RULES.map(rule=>{const r=rules[rule.key]||{enabled:true,days:rule.dd};
                    return<div key={rule.key} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:8,background:r.enabled?T.ok+"06":T.bg,border:"1px solid "+(r.enabled?T.ok+"15":T.brd),flexWrap:"wrap"}}>
                      <input type="checkbox" checked={r.enabled!==false} onChange={e=>updateRule(idx,rule.key,"enabled",e.target.checked)} style={{width:16,height:16}}/>
                      <span style={{fontSize:14}}>{rule.icon}</span>
                      <span style={{flex:1,fontSize:FS-2,fontWeight:600,color:r.enabled?T.text:T.textMut,minWidth:100}}>{rule.label}</span>
                      <span style={{fontSize:FS-3,color:T.textSec}}>بعد</span>
                      <input type="number" value={r.days||rule.dd} onChange={e=>updateRule(idx,rule.key,"days",Number(e.target.value)||rule.dd)} style={{width:45,textAlign:"center",padding:"3px",borderRadius:5,border:"1px solid "+T.brd,fontSize:FS-2,fontWeight:700,fontFamily:"inherit",background:T.bg,color:T.text}}/>
                      <span style={{fontSize:FS-3,color:T.textSec}}>يوم</span>
                    </div>})}
                  <div style={{display:"flex",justifyContent:"flex-end"}}><Btn small onClick={()=>removeUser(au.email)} style={{background:T.err+"12",color:T.err,border:"1px solid "+T.err+"30",fontSize:FS-2}}>🗑️ حذف المستخدم</Btn></div>
                </div>}
              </div>})}
            <div style={{padding:10,borderRadius:8,background:T.accent+"06",border:"1px solid "+T.accent+"15",fontSize:FS-2,color:T.textSec}}>💡 كل مستخدم يستلم المهام حسب القواعد المحددة له. المهام لا تتكرر طالما مفتوحة.</div>
          </div>}
        </div>})()}
    </Card>
  </div>
}
