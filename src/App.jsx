import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { auth, db, getSecondaryAuth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "firebase/auth";
import { doc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";

/* Optional libs - loaded dynamically */
let _XLSX=null,_QR=null;
const loadXLSX=async()=>{if(!_XLSX)try{_XLSX=await import("xlsx")}catch(e){};return _XLSX};
const loadQR=async()=>{if(!_QR)try{const m=await import("qrcode");_QR=m.default||m}catch(e){};return _QR};

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
    admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit"},
    manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide"},
    viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide"}
  },
};

function gid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
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

const PRINT_CSS="*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',Arial,sans-serif;padding:24px;font-size:12px;direction:rtl;color:#1E293B;line-height:1.4}.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0284C7;padding-bottom:10px;margin-bottom:18px}.hdr img{height:22px}.hdr-info{text-align:left;font-size:10px;color:#64748B;font-weight:600}h2{font-size:14px;color:#0284C7;margin:12px 0 6px;padding-bottom:3px;border-bottom:1px solid #E2E8F0}table{width:100%;border-collapse:collapse;margin:6px 0 12px;border:1px solid #CBD5E1}th{background:linear-gradient(180deg,#F1F5F9,#E2E8F0);font-weight:700;font-size:10px;color:#475569;padding:4px 8px;text-align:right;border:1px solid #CBD5E1}td{padding:3px 8px;text-align:right;border:1px solid #E2E8F0;font-size:11px}tr:nth-child(even){background:#F8FAFC}.info{font-weight:700;color:#0284C7}.ok{color:#10B981;font-weight:700}.err{color:#EF4444;font-weight:700}.sig{margin-top:40px;display:flex;justify-content:space-between}.sig-box{text-align:center;width:180px;border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px}.badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;margin:2px}@media print{body{padding:12px}table{page-break-inside:auto}tr{page-break-inside:avoid}@page{margin:12mm;@bottom-center{content:counter(page)' / 'counter(pages)}}}";
function printPage(title,bodyHtml){const pw=window.open("","_blank");if(!pw)return;const today=new Date().toLocaleDateString("ar-EG");pw.document.write("<!DOCTYPE html><html dir='rtl'><head><meta charset='utf-8'/><link href='https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap' rel='stylesheet'/><title>"+title+"</title><style>"+PRINT_CSS+".pbar{position:sticky;top:0;background:#fff;padding:8px 16px;border-bottom:2px solid #E2E8F0;display:none;justify-content:center;gap:10px;z-index:999}.pbar button{padding:8px 22px;border-radius:8px;border:none;cursor:pointer;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700}.pb-back{background:#F1F5F9;color:#475569}.pb-print{background:#0EA5E9;color:#fff}@media(max-width:1024px){.pbar{display:flex}}@media print{.pbar{display:none}}</style></head><body><div class='pbar'><button class='pb-back' onclick='window.close()'>↩ رجوع</button><button class='pb-print' onclick='window.print()'>🖨 طباعة</button></div><div class='hdr'><div><img src='"+CLARK_LOGO+"'/></div><div class='hdr-info'>"+title+"<br/>"+today+"</div></div>"+bodyHtml+"</body></html>");pw.document.close();if(window.innerWidth>1024)setTimeout(()=>{pw.focus();pw.print()},500)}

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
        const hasBD=typeof BarcodeDetector!=="undefined";
        const detector=hasBD?new BarcodeDetector({formats:["qr_code"]}):null;
        const scan=async()=>{
          if(!active||!videoRef.current||!canvasRef.current)return;
          const v=videoRef.current;const c=canvasRef.current;
          if(v.readyState>=2){
            c.width=v.videoWidth;c.height=v.videoHeight;
            const ctx=c.getContext("2d");ctx.drawImage(v,0,0);
            if(detector){try{const codes=await detector.detect(c);if(codes.length>0&&active){active=false;onScan(codes[0].rawValue);return}}catch(e){}}
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
  /* Generate QR for receive */
  let qrSrc="";try{const QR=await loadQR();if(QR&&order.id)qrSrc=await QR.toDataURL(window.location.origin+"?act=rcv&oid="+encodeURIComponent(order.id)+"&wdi="+wdIdx,{width:120,margin:1,errorCorrectionLevel:"L"})}catch(e){}
  const modelNo=order.modelNo||"";const modelDesc=order.modelDesc||"";const sizeLabel=order.sizeLabel||"";const marker=order.marker||"";
  let h="<h2>اذن تسليم ورشة</h2>";
  /* Order info table */
  h+="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  if(qrSrc)h+="<div style='flex-shrink:0;text-align:center'><img src='"+qrSrc+"' style='width:88px;height:88px'/><div style='font-size:8px;color:#94A3B8;margin-top:2px'>مسح للاستلام</div></div>";
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
  const o={id:gid(),date:today,createdAt:new Date().toISOString(),modelNo:"",modelDesc:"",poNumber:"",sizeSetId:"",sizeLabel:"",status:"تم القص",cutQty:0,deliveredQty:0,accItems:[],deliveries:[],workshopDeliveries:[],orderPieces:[],image:"",instructions:"",attachments:[],marker:"",favorite:false,priority:"normal"};
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
  let qrSrc="";try{const QR=await loadQR();if(QR)qrSrc=await QR.toDataURL(window.location.origin+"?o="+encodeURIComponent(order.modelNo),{width:100,margin:1,errorCorrectionLevel:"L"})}catch(e){}
  let wsRows="";(order.workshopDeliveries||[]).forEach(wd=>{const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);wsRows+="<tr><td>"+wd.wsName+"</td><td>"+(wd.garmentType||"-")+"</td><td>"+wd.qty+"</td><td>"+rcvd+"</td><td>"+(wd.qty-rcvd)+"</td></tr>"});
  const col=getStatusColor(order.status,statusCards);
  const pieces=order.orderPieces||[];
  let h="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:100px;height:133px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  if(qrSrc)h+="<div style='flex-shrink:0;text-align:center'><img src='"+qrSrc+"' style='width:88px;height:88px'/><div style='font-size:9px;color:#64748B;margin-top:2px'>سكان لفتح الأوردر</div></div>";
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
  if(wsRows)h+="<h2 style='font-size:14px;margin:12px 0 6px'>الورش</h2><table><tr><th>الورشة</th><th>القطعة</th><th>الكمية</th><th>استلام مصنع</th><th>الرصيد</th></tr>"+wsRows+"</table>";
  if(order.instructions)h+="<h2 style='font-size:14px;margin:12px 0 6px'>تعليمات التشغيل</h2><div style='background:#f8fafc;padding:10px;border-radius:6px;white-space:pre-wrap;font-size:12px'>"+order.instructions+"</div>";
  h+="<div class='sig'><div class='sig-box'>توقيع مسؤول القص</div><div class='sig-box'>مسؤول التشغيل</div><div class='sig-box'>مدير الانتاج</div></div>";
  printPage("أمر قص — "+order.modelNo,h)
}

async function printStockDelivery(order,qty,date,note,totalDelivered,totalCut){
  if(!order)return;
  let qrSrc="";try{const QR=await loadQR();if(QR)qrSrc=await QR.toDataURL(window.location.origin+"?o="+encodeURIComponent(order.modelNo),{width:100,margin:1,errorCorrectionLevel:"L"})}catch(e){}
  let h="<div style='display:flex;gap:16px;align-items:flex-start;margin-bottom:16px'>";
  if(order.image)h+="<div style='width:80px;height:107px;border-radius:8px;overflow:hidden;border:1px solid #ddd;flex-shrink:0'><img src='"+order.image+"' style='width:100%;height:100%;object-fit:cover'/></div>";
  if(qrSrc)h+="<div style='flex-shrink:0;text-align:center'><img src='"+qrSrc+"' style='width:80px;height:80px'/><div style='font-size:9px;color:#64748B;margin-top:2px'>سكان لفتح الأوردر</div></div>";
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

function Btn({children,on,primary,danger,ghost,onClick,small,disabled,style:sx}){
  let bg=T.cardSolid,fg=T.text,bd="1px solid "+T.brd;
  if(on||primary){bg="linear-gradient(135deg,"+T.accent+","+T.accent+"CC)";fg="#fff";bd="none"}
  if(danger){bg=T.err+"12";fg=T.err;bd="1px solid "+T.err+"30"}
  if(ghost){bg="transparent";bd="none";fg=T.textSec}
  const mob=typeof window!=="undefined"&&window.innerWidth<768;
  return<button onClick={onClick} disabled={disabled} style={{padding:small?(mob?"6px 12px":"4px 10px"):(mob?"9px 18px":"7px 16px"),borderRadius:8,fontSize:small?FS-2:FS,fontWeight:600,background:bg,color:fg,border:bd,cursor:disabled?"default":"pointer",fontFamily:"inherit",opacity:disabled?0.5:1,boxShadow:primary?"0 2px 8px "+T.accent+"33":"none",minHeight:mob?36:undefined,...(sx||{})}}>{children}</button>
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
  const[open,setOpen]=useState(false);const[q,setQ]=useState("");const ref=useRef(null);
  const selected=options.find(o=>o.value===value);
  const filtered=q?options.filter(o=>o.label.toLowerCase().includes(q.toLowerCase())).slice(0,10):options.slice(0,10);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[]);
  return<div ref={ref} style={{position:"relative",zIndex:open?9999:1}}>
    <div style={{display:"flex",border:"1px solid "+T.brd,borderRadius:6,overflow:"hidden",background:T.cardSolid}}>
      <input value={open?q:(selected?selected.label:"")} onChange={e=>{setQ(e.target.value);if(!open)setOpen(true)}} onFocus={()=>{setOpen(true);setQ("")}} onKeyDown={e=>{if(e.key==="Escape")setOpen(false)}}
        placeholder={placeholder||"بحث..."} style={{flex:1,padding:"5px 8px",border:"none",outline:"none",fontSize:FS,fontFamily:"inherit",background:"transparent",color:T.text,boxSizing:"border-box"}}/>
      <div onClick={()=>{setOpen(!open);setQ("")}} style={{padding:"4px 8px",cursor:"pointer",display:"flex",alignItems:"center",color:T.textSec,borderRight:"1px solid "+T.brd,background:T.bg,fontSize:12}}>{open?"▲":"▼"}</div>
    </div>
    {open&&<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:9999,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:"0 0 8px 8px",boxShadow:"0 8px 24px rgba(0,0,0,0.15)",maxHeight:240,overflowY:"auto"}}>
      {filtered.length>0?filtered.map(o=><div key={o.value} onClick={()=>{onChange(o.value);setOpen(false);setQ("")}} style={{padding:"8px 12px",cursor:"pointer",fontSize:FS,color:o.value===value?T.accent:T.text,fontWeight:o.value===value?700:400,background:o.value===value?T.accent+"08":"transparent",borderBottom:"1px solid "+T.brd+"40"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"12"} onMouseLeave={e=>e.currentTarget.style.background=o.value===value?T.accent+"08":"transparent"}>{o.label}</div>)
      :<div style={{padding:"12px",textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد نتائج</div>}
    </div>}
  </div>
}

function Card({children,title,extra,accent,style:sx}){
  return<div style={{background:T.card,backdropFilter:"blur(12px)",borderRadius:12,border:"1px solid "+T.brd,boxShadow:T.shadow,overflow:"visible",...(sx||{})}}>
    {(title||extra)&&<div style={{padding:"10px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:accent||"rgba(248,250,252,0.8)",borderRadius:"12px 12px 0 0"}}><span style={{fontSize:FS+1,fontWeight:700,color:accent?"#fff":T.text}}>{title}</span>{extra}</div>}
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
  if(confirm)return<div style={{display:"inline-flex",gap:4,alignItems:"center"}}><Btn danger small onClick={()=>{onConfirm();setConfirm(false)}}>✓ تأكيد</Btn><Btn ghost small onClick={()=>setConfirm(false)}>✕</Btn></div>;
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
    {showPick&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowPick(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:450,maxHeight:"70vh",overflow:"auto",border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>اختر بنود الاكسسوار</div>
          <Btn ghost small onClick={()=>setShowPick(false)}>✕</Btn>
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
  const[config,setConfig]=useState(INIT_CONFIG);const[orders,setOrders]=useState([]);const[dataLoading,setDataLoading]=useState(true);
  const[tab,setTab_]=useState(()=>sessionStorage.getItem("clark_tab")||"home");const[sel,setSel_]=useState(()=>sessionStorage.getItem("clark_sel")||null);
  const setTab=v=>{setTab_(v);sessionStorage.setItem("clark_tab",v)};
  const setSel=v=>{setSel_(v);if(v)sessionStorage.setItem("clark_sel",v);else sessionStorage.removeItem("clark_sel")};
  const[gSearch,setGSearch]=useState("");const[showAlerts,setShowAlerts]=useState(false);const[showLogout,setShowLogout]=useState(false);const[showScanner,setShowScanner]=useState(false);const[dbSub,setDbSub]=useState(null);const[showTheme,setShowTheme]=useState(false);
  const[stickyForm,setStickyForm]=useState(null);
  const[quickPopup,setQuickPopup]=useState(null);/* "task"|"notif"|null */
  const[qpTo,setQpTo]=useState("");const[qpText,setQpText]=useState("");const[qpType,setQpType]=useState("تذكير");
  const[aiMsgs,setAiMsgs]=useState([]);const[aiInput,setAiInput]=useState("");const[aiLoading,setAiLoading]=useState(false);const[aiOpen,setAiOpen]=useState(false);
  const askAI=async()=>{if(!aiInput.trim()||aiLoading)return;const q=aiInput.trim();setAiInput("");setAiMsgs(p=>[...p,{role:"user",text:q}]);setAiLoading(true);
    try{
      const ws=(config.workshops||[]).map(w=>{let del=0,rcv=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});
        const payments=(config.wsPayments||[]).filter(p=>p.wsName===w.name);const paid=payments.filter(p=>p.type==="payment").reduce((s,p)=>s+(Number(p.amount)||0),0);
        let due=0;orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===w.name).forEach(wd=>{(wd.receives||[]).forEach(r=>{due+=r2((Number(r.qty)||0)*(Number(r.price)||0))})})});
        return{name:w.name,type:w.type,delivered:del,received:rcv,balance:del-rcv,dueMoney:r2(due),paid:r2(paid),owedMoney:r2(due-paid)}});
      const ords=orders.map(o=>{const t=calcOrder(o);const wds=o.workshopDeliveries||[];const totalDel=wds.reduce((s,wd)=>s+(Number(wd.qty)||0),0);const totalRcv=wds.reduce((s,wd)=>(wd.receives||[]).reduce((ss,r)=>ss+(Number(r.qty)||0),0)+s,0);const stockDel=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
        const lastMove=wds.reduce((d,wd)=>{let ld=wd.date||"";(wd.receives||[]).forEach(r=>{if(r.date>ld)ld=r.date});return ld>d?ld:d},"");
        const days=lastMove?Math.floor((Date.now()-new Date(lastMove))/(86400000)):null;
        return{modelNo:o.modelNo,desc:o.modelDesc,status:o.status,cutQty:t.cutQty,deliveredToWs:totalDel,receivedFromWs:totalRcv,wsBalance:totalDel-totalRcv,stockDelivered:stockDel,workshops:wds.map(wd=>wd.wsName).filter((v,i,a)=>a.indexOf(v)===i),daysSinceLastMove:days,pieces:o.orderPieces||[]}});
      const ctx="أنت مساعد ذكي لنظام CLARK لإدارة مصانع الملابس. أجب بالعربية بشكل مختصر ومفيد.\n\nبيانات الموسم "+season+":\n\nالأوردرات ("+ords.length+"):\n"+JSON.stringify(ords,null,0)+"\n\nالورش ("+ws.length+"):\n"+JSON.stringify(ws,null,0)+"\n\nالتاريخ: "+new Date().toISOString().split("T")[0];
      const res=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:ctx,messages:[...aiMsgs.map(m=>({role:m.role==="user"?"user":"assistant",content:m.text})),{role:"user",content:q}]})});
      const data2=await res.json();if(data2.error){setAiMsgs(p=>[...p,{role:"ai",text:"⚠️ "+(data2.error.message||data2.error||"خطأ غير معروف")}]);setAiLoading(false);return}
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
  const themeKey="clark-theme-"+(user?.uid||"default");
  const[theme,setTheme_]=useState(()=>localStorage.getItem("clark-theme-default")||"light");
  const setTheme=v=>{setTheme_(v);localStorage.setItem(themeKey,v)};
  useEffect(()=>{const saved=localStorage.getItem(themeKey);if(saved&&saved!==theme)setTheme_(saved)},[themeKey]);
  T=THEMES[theme]||THEMES.light;
  useEffect(()=>{localStorage.setItem(themeKey,theme);document.body.style.background=T.bodyBg||T.bg},[theme,themeKey]);
  const w=useWin();const isMob=w<768;const season=config.activeSeason||"WS26";

  useEffect(()=>{const unsub=onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false)});return unsub},[]);
  useEffect(()=>{if(!user)return;const unsub=onSnapshot(doc(db,"factory","config"),snap=>{if(snap.exists())setConfig(snap.data());else setDoc(doc(db,"factory","config"),INIT_CONFIG)});return()=>unsub()},[user]);
  useEffect(()=>{if(!user||!season)return;setDataLoading(true);const unsub=onSnapshot(collection(db,"seasons",season,"orders"),snap=>{setOrders(snap.docs.map(d=>({_docId:d.id,...d.data()})).filter(o=>o.id&&o.modelNo));setDataLoading(false)});return()=>unsub()},[user,season]);

  const upConfig=useCallback(fn=>{setConfig(prev=>{try{const next=JSON.parse(JSON.stringify(prev));fn(next);setDoc(doc(db,"factory","config"),next).catch(e=>console.error("upConfig write error:",e));return next}catch(e){console.error("upConfig error:",e);showToast("⚠️ خطأ في الحفظ");return prev}})},[]);
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
  /* QR scan auto-navigate */
  const qrDone=useRef(false);
  useEffect(()=>{if(qrDone.current||orders.length===0)return;
    if(qrModelNo){const o=orders.find(x=>x.modelNo===qrModelNo);if(o){qrDone.current=true;goD(o.id);window.history.replaceState({},"",window.location.pathname)}}
    if(qrAction==="rcv"&&qrOid){const o=orders.find(x=>x.id===qrOid);if(o){qrDone.current=true;setTab("external");window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrReceive={oid:qrOid,wdi:Number(qrWdi)||0};window.dispatchEvent(new Event("qr-receive"))},600)}}
    if(qrAction==="wsacc"&&qrWs){qrDone.current=true;setTab("external");window.history.replaceState({},"",window.location.pathname);setTimeout(()=>{window.__qrWsAcc={ws:decodeURIComponent(qrWs)};window.dispatchEvent(new Event("qr-wsacc"))},600)}
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
  const DEFAULT_PERMS={admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit"},manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide"},viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide"}};
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
        {tab!=="home"&&<div onClick={goHome} style={{cursor:"pointer",fontSize:isMob?22:28,color:T.accent,padding:isMob?"4px 8px":"6px 12px",borderRadius:10,background:T.accentBg,lineHeight:1}}>{"⌂"}</div>}
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
          <div onClick={()=>setShowAlerts(!showAlerts)} style={{cursor:"pointer",fontSize:isMob?18:22,padding:"2px 6px",borderRadius:8,background:alertCount>0?T.warn+"12":"transparent",position:"relative"}}>🔔
            {alertCount>0&&<span style={{position:"absolute",top:-2,left:-2,width:16,height:16,borderRadius:8,background:T.err,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{alertCount}</span>}
          </div>
          {showAlerts&&<div style={{position:"absolute",top:"100%",left:0,marginTop:6,width:isMob?280:340,background:T.cardSolid,border:"1px solid "+T.brd,borderRadius:12,boxShadow:"0 8px 30px rgba(0,0,0,0.15)",zIndex:999,maxHeight:400,overflow:"auto"}}>
            <div style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,fontWeight:700,fontSize:FS,color:T.text}}>{"الاشعارات ("+alertCount+")"}</div>
            {alertCount>0?allAlerts.map((a,i)=><div key={i} onClick={()=>{if(a.isNotif)markRead(a.notifId);if(a.orderId){goD(a.orderId);setShowAlerts(false)}else if(a.isNotif)setShowAlerts(false)}} style={{padding:"10px 14px",borderBottom:"1px solid "+T.brd,display:"flex",gap:8,alignItems:"flex-start",cursor:a.orderId||a.isNotif?"pointer":"default",background:a.isNotif?a.color+"06":"transparent",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=a.color+"12"} onMouseLeave={e=>e.currentTarget.style.background=a.isNotif?a.color+"06":"transparent"}>
              <span style={{fontSize:16,flexShrink:0}}>{a.icon}</span>
              <div style={{flex:1}}><span style={{fontSize:FS-1,color:a.color,fontWeight:600,lineHeight:1.5}}>{a.msg}</span>{a.from&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{"من: "+a.from+(a.date?" — "+a.date:"")}</div>}{a.orderId&&!a.isNotif&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>اضغط لفتح الأوردر</div>}</div>
            </div>):<div style={{padding:20,textAlign:"center",color:T.textMut,fontSize:FS-1}}>لا توجد اشعارات</div>}
          </div>}
        </div>
        <div style={{position:"relative"}} onClick={e=>e.stopPropagation()}>
          <div onClick={()=>setAiOpen(!aiOpen)} style={{cursor:"pointer",fontSize:isMob?16:18,padding:"3px 8px",borderRadius:8,background:aiOpen?"linear-gradient(135deg,#0EA5E920,#8B5CF620)":"transparent",transition:"all 0.2s",display:"flex",alignItems:"center",gap:isMob?0:4}}><span>🤖</span>{!isMob&&<span style={{fontSize:FS-2,fontWeight:600,color:aiOpen?"#8B5CF6":T.textSec}}>AI</span>}</div>
          {!isMob&&aiOpen&&<div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",marginTop:8,zIndex:9999}}>
            <div style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:"0 8px 40px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",height:460,width:380}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0EA5E910,#8B5CF610)",borderRadius:"16px 16px 0 0"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🤖</span><span style={{fontWeight:800,fontSize:FS+1,color:T.text}}>مساعد CLARK</span></div>
                <div style={{display:"flex",gap:4}}>
                  {aiMsgs.length>0&&<span onClick={()=>setAiMsgs([])} style={{cursor:"pointer",fontSize:11,padding:"2px 8px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:600}}>مسح</span>}
                  <span onClick={()=>setAiOpen(false)} style={{cursor:"pointer",fontSize:16,color:T.textMut}}>✕</span>
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
                {aiMsgs.length===0&&<div style={{textAlign:"center",padding:20,color:T.textMut}}>
                  <div style={{fontSize:32,marginBottom:8}}>🤖</div>
                  <div style={{fontSize:FS,fontWeight:600,marginBottom:6}}>اسألني عن أي حاجة!</div>
                  <div style={{fontSize:FS-2,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{"• موديل 3262 فين؟\n• كام أوردر متأخر؟\n• رصيد ورشة نورهان\n• ملخص الموسم"}</div>
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
          {/* Buttons grid - centered */}
          <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:isMob?10:16,maxWidth:900,margin:"0 auto"}}>
            {TABS.filter(t=>canViewTab(t.key)).map(t=>{const perm=getTabPerm(t.key);return<div key={t.key} onClick={()=>goTo(t.key)} style={{background:T.cardSolid,borderRadius:16,padding:isMob?"16px 8px":"20px 14px",border:"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",textAlign:"center",transition:"transform 0.15s,box-shadow 0.15s",opacity:perm==="view"?0.75:1,position:"relative",width:isMob?"calc(33.33% - 8px)":"calc(20% - 14px)",boxSizing:"border-box"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow="0 8px 30px rgba(0,0,0,0.12)"}} onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=T.shadow}}>
              <div style={{width:isMob?44:52,height:isMob?44:52,borderRadius:14,background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",fontSize:isMob?22:26}}>{t.icon}</div>
              <div style={{fontSize:isMob?FS-3:FS-1,fontWeight:700,color:T.text}}>{t.label}</div>
              {perm==="view"&&<div style={{position:"absolute",top:6,left:6,fontSize:9,padding:"1px 6px",borderRadius:4,background:T.warn+"18",color:T.warn,fontWeight:700}}>👁 عرض</div>}
            </div>})}
          </div>
          {isMob&&<div onClick={()=>setShowScanner(true)} style={{margin:"16px auto 0",display:"flex",justifyContent:"center"}}><div style={{background:"linear-gradient(135deg,#0EA5E9,#8B5CF6)",borderRadius:14,padding:"14px 30px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 20px rgba(14,165,233,0.3)"}}><span style={{fontSize:24}}>📷</span><span style={{fontSize:FS+1,fontWeight:700,color:"#fff"}}>مسح كود QR</span></div></div>}
          {/* Tasks panel - separate with yellow bg */}
          {(()=>{const uid=user?.uid||"";const uemail=user?.email||"";const rawTasks=(config||{}).tasks;const tasksList=Array.isArray(rawTasks)?rawTasks:[];const myTasks=tasksList.filter(t=>(t.toEmail===uemail||t.toUid===uid)&&!t.done);
            return myTasks.length>0&&<div style={{maxWidth:900,margin:"16px auto 0"}}>
              <div style={{background:"#FEF9C3",borderRadius:16,border:"1px solid #EAB30830",padding:14,boxShadow:"0 2px 8px rgba(234,179,8,0.08)"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><span style={{fontSize:18}}>📌</span><span style={{fontSize:FS,fontWeight:800,color:"#92400E"}}>{"مهامي ("+myTasks.length+")"}</span></div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>{myTasks.slice(0,isMob?5:8).map(t=><div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"8px 10px",borderRadius:8,background:"rgba(255,255,255,0.7)",border:"1px solid #EAB30820"}}>
                <span onClick={()=>upConfig(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const tk=arr.find(x=>x.id===t.id);if(tk){tk.done=true;tk.doneAt=new Date().toISOString()}})} style={{cursor:"pointer",fontSize:16,flexShrink:0,marginTop:1}}>⬜</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:FS-1,fontWeight:600,color:"#1C1917",lineHeight:1.4}}>{t.text}</div>
                  <div style={{fontSize:FS-3,color:"#78716C",marginTop:1}}>{"من: "+(t.fromName||"—")}</div>
                </div>
              </div>)}</div>
              {myTasks.length>(isMob?5:8)&&<div style={{textAlign:"center",marginTop:6}}><span onClick={()=>goTo("tasks")} style={{cursor:"pointer",fontSize:FS-2,color:"#92400E",fontWeight:700}}>{"عرض الكل ("+myTasks.length+")"}</span></div>}
            </div></div>})()}
          {/* ── Quick Action: Task / Notification ── */}
          <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"center"}}>
            <div onClick={()=>setQuickPopup("task")} style={{cursor:"pointer",padding:"10px 20px",borderRadius:12,background:T.accent+"10",border:"1px solid "+T.accent+"25",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=T.accent+"20"} onMouseLeave={e=>e.currentTarget.style.background=T.accent+"10"}>
              <span style={{fontSize:18}}>📌</span><span style={{fontSize:FS,fontWeight:700,color:T.accent}}>ارسال مهمة</span>
            </div>
            <div onClick={()=>setQuickPopup("notif")} style={{cursor:"pointer",padding:"10px 20px",borderRadius:12,background:"#8B5CF610",border:"1px solid #8B5CF625",display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="#8B5CF620"} onMouseLeave={e=>e.currentTarget.style.background="#8B5CF610"}>
              <span style={{fontSize:18}}>📩</span><span style={{fontSize:FS,fontWeight:700,color:"#8B5CF6"}}>ارسال اشعار</span>
            </div>
          </div>
          {/* ── Sticky Notes (Desktop only) ── */}
          {!isMob&&(()=>{const uemail=user?.email||"";const COLORS=[{key:"#FEF9C3",border:"#EAB308",name:"أصفر"},{key:"#DBEAFE",border:"#3B82F6",name:"أزرق"},{key:"#DCFCE7",border:"#22C55E",name:"أخضر"},{key:"#FCE7F3",border:"#EC4899",name:"وردي"},{key:"#EDE9FE",border:"#8B5CF6",name:"بنفسجي"},{key:"#FFEDD5",border:"#F97316",name:"برتقالي"}];
            const allNotes=(config.stickyNotes||[]);const myNotes=allNotes.filter(n=>n.email===uemail);
            const saveNote=(note)=>{upConfig(d=>{if(!d.stickyNotes)d.stickyNotes=[];const idx=d.stickyNotes.findIndex(n=>n.id===note.id);if(idx>=0)d.stickyNotes[idx]=note;else{if(d.stickyNotes.filter(n=>n.email===uemail).length>=20){showToast("⚠️ الحد الاقصى 20 ملاحظة");return}d.stickyNotes.push(note)}});setStickyForm(null);showToast("✓ تم الحفظ")};
            const delNote=(id)=>{upConfig(d=>{d.stickyNotes=(d.stickyNotes||[]).filter(n=>n.id!==id)})};
            return<div style={{marginTop:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                <span style={{fontSize:FS,fontWeight:700,color:T.textSec}}>{"📝 ملاحظاتي"+(myNotes.length>0?" ("+myNotes.length+"/20)":"")}</span>
                <span onClick={()=>setStickyForm({id:gid(),email:uemail,title:"",text:"",color:"#FEF9C3",date:new Date().toISOString().split("T")[0]})} style={{cursor:"pointer",fontSize:FS-2,padding:"3px 10px",borderRadius:6,background:T.accent+"12",color:T.accent,fontWeight:700}}>+ ملاحظة</span>
              </div>
              {stickyForm&&<div style={{maxWidth:360,background:stickyForm.color,borderRadius:10,padding:10,border:"2px solid "+(COLORS.find(c=>c.key===stickyForm.color)?.border||"#EAB308")+"40",marginBottom:12,boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
                <div style={{display:"flex",gap:3,marginBottom:6}}>{COLORS.map(c=><div key={c.key} onClick={()=>setStickyForm(p=>({...p,color:c.key}))} style={{width:18,height:18,borderRadius:5,background:c.key,border:stickyForm.color===c.key?"2px solid "+c.border:"1px solid #ccc",cursor:"pointer"}}/>)}</div>
                <input value={stickyForm.title} onChange={e=>setStickyForm(p=>({...p,title:e.target.value}))} placeholder="العنوان..." style={{width:"100%",padding:"4px 8px",borderRadius:6,border:"1px solid #ddd",fontSize:FS-1,fontFamily:"inherit",fontWeight:700,background:"rgba(255,255,255,0.6)",marginBottom:4,boxSizing:"border-box"}}/>
                <textarea value={stickyForm.text} onChange={e=>setStickyForm(p=>({...p,text:e.target.value}))} placeholder="ملاحظة قصيرة..." rows={2} style={{width:"100%",padding:"4px 8px",borderRadius:6,border:"1px solid #ddd",fontSize:FS-2,fontFamily:"inherit",background:"rgba(255,255,255,0.6)",resize:"none",boxSizing:"border-box"}}/>
                <div style={{display:"flex",gap:6,marginTop:6}}><Btn primary small onClick={()=>{if(!stickyForm.title?.trim()&&!stickyForm.text?.trim())return;saveNote(stickyForm)}}>💾 حفظ</Btn><Btn ghost small onClick={()=>setStickyForm(null)}>الغاء</Btn></div>
              </div>}
              {myNotes.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {myNotes.map(n=>{const bc=COLORS.find(c=>c.key===n.color);return<div key={n.id} style={{background:n.color||"#FEF9C3",borderRadius:10,padding:"8px 10px",border:"1px solid "+(bc?.border||"#EAB308")+"30",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",width:160}}>
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
              </div>}
            </div>})()}
      </div>}
      {/* PAGES with back button */}
      {tab!=="home"&&canViewTab(tab)&&<div>
        {tab==="dashboard"&&<DashPg data={data} goD={goD} isMob={isMob} season={season} statusCards={statusCards} upConfig={upConfig} user={user}/>}
        {tab==="db"&&<DBPg data={data} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("db")} statusCards={statusCards} initialSub={dbSub} onSubUsed={()=>setDbSub(null)} renameInOrders={renameInOrders}/>}
        {tab==="details"&&<DetPg data={data} updOrder={updOrder} replaceOrder={replaceOrder} addOrder={addOrder} delOrder={delOrder} sel={sel} setSel={setSel} isMob={isMob} canEdit={canEditTab("details")} statusCards={statusCards} goHome={goHome} upConfig={upConfig} user={user}/>}
        {tab==="external"&&<ExtProdPg data={data} updOrder={updOrder} upConfig={upConfig} isMob={isMob} canEdit={canEditTab("external")} statusCards={statusCards} season={season}/>}
        {tab==="stock"&&<StockPg data={data} updOrder={updOrder} isMob={isMob} canEdit={canEditTab("stock")} statusCards={statusCards} user={user}/>}
        {tab==="tasks"&&<TasksPg data={data} upConfig={upConfig} isMob={isMob} user={user} userRole={userRole}/>}
        {tab==="calc"&&<CalcPg data={data} isMob={isMob}/>}
        {tab==="reports"&&<ReportsHub data={data} isMob={isMob} season={season} statusCards={statusCards}/>}
        {tab==="settings"&&canEditTab("settings")&&<SettingsPg config={config} upConfig={upConfig} isMob={isMob} user={user} theme={theme} setTheme={setTheme} season={season} orders={orders} syncWsIds={syncWsIds} replaceOrder={replaceOrder}/>}
      </div>}
    </div>
    {/* Quick Task/Notification Popup */}
    {quickPopup&&(()=>{const allUsers=(config.usersList||[]);const me={email:user?.email||"",name:user?.displayName||(user?.email||"").split("@")[0],role:userRole};
      const targets=allUsers.find(u=>u.email===me.email)?allUsers:[me,...allUsers];
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:99998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setQuickPopup(null);setQpTo("");setQpText("");setQpType("تذكير")}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:20,width:"100%",maxWidth:380,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",gap:0,marginBottom:14,borderRadius:10,overflow:"hidden",border:"1px solid "+T.brd}}>
          <div onClick={()=>{setQuickPopup("task");setQpTo("");setQpText("")}} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:quickPopup==="task"?T.accent:T.bg,color:quickPopup==="task"?"#fff":T.text}}>📌 مهمة</div>
          <div onClick={()=>{setQuickPopup("notif");setQpTo("all");setQpText("")}} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontWeight:700,fontSize:FS,background:quickPopup==="notif"?"#8B5CF6":T.bg,color:quickPopup==="notif"?"#fff":T.text}}>📩 اشعار</div>
        </div>
        {quickPopup==="task"?<div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ارسال الى</label><Sel value={qpTo} onChange={setQpTo}><option value="">-- اختر --</option>{targets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===me.email?" (أنا)":"")+" — "+(u.role==="admin"?"مدير النظام":u.role==="manager"?"مدير انتاج":"مشاهد")}</option>)}</Sel></div>
          <div style={{marginBottom:8}}><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>المهمة</label><Inp value={qpText} onChange={setQpText} placeholder="اكتب المهمة..."/></div>
          <Btn primary onClick={()=>{if(!qpTo||!qpText.trim())return;const target=targets.find(u=>u.email===qpTo);
            upConfig(d=>{if(!Array.isArray(d.tasks))d.tasks=[];d.tasks.unshift({id:Date.now(),text:qpText.trim(),done:false,date:new Date().toISOString().split("T")[0],fromUid:user?.uid||"",fromEmail:user?.email||"",fromName:me.name,toEmail:qpTo,toName:target?.name||qpTo.split("@")[0]})});
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
    {isMob&&aiOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:99997,display:"flex",alignItems:"flex-end",justifyContent:"center",padding:10}} onClick={()=>setAiOpen(false)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,border:"1px solid "+T.brd,boxShadow:"0 8px 40px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",height:"85vh",width:"100%",maxWidth:420}}>
        <div style={{padding:"12px 16px",borderBottom:"1px solid "+T.brd,display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#0EA5E910,#8B5CF610)",borderRadius:"16px 16px 0 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:20}}>🤖</span><span style={{fontWeight:800,fontSize:FS+1,color:T.text}}>مساعد CLARK</span></div>
          <div style={{display:"flex",gap:4}}>
            {aiMsgs.length>0&&<span onClick={()=>setAiMsgs([])} style={{cursor:"pointer",fontSize:11,padding:"2px 8px",borderRadius:6,background:T.err+"10",color:T.err,fontWeight:600}}>مسح</span>}
            <span onClick={()=>setAiOpen(false)} style={{cursor:"pointer",fontSize:16,color:T.textMut}}>✕</span>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:12,display:"flex",flexDirection:"column",gap:8}}>
          {aiMsgs.length===0&&<div style={{textAlign:"center",padding:20,color:T.textMut}}>
            <div style={{fontSize:32,marginBottom:8}}>🤖</div>
            <div style={{fontSize:FS,fontWeight:600,marginBottom:6}}>اسألني عن أي حاجة!</div>
            <div style={{fontSize:FS-2,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{"• موديل 3262 فين؟\n• كام أوردر متأخر؟\n• رصيد ورشة نورهان\n• ملخص الموسم"}</div>
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
    {showScanner&&<QRScanner onClose={()=>setShowScanner(false)} onScan={url=>{setShowScanner(false);try{const u=new URL(url);const p=new URLSearchParams(u.search);if(p.get("o")){const o=orders.find(x=>x.modelNo===p.get("o"));if(o)goD(o.id)}else if(p.get("act")==="rcv"&&p.get("oid")){setTab("external");setTimeout(()=>{window.__qrReceive={oid:p.get("oid"),wdi:Number(p.get("wdi"))||0};window.dispatchEvent(new Event("qr-receive"))},600)}else if(p.get("act")==="wsacc"&&p.get("ws")){setTab("external");setTimeout(()=>{window.__qrWsAcc={ws:decodeURIComponent(p.get("ws"))};window.dispatchEvent(new Event("qr-wsacc"))},600)}else{showToast("QR غير معروف")}}catch(e){showToast("QR غير صالح")}}}/>}
  </div>
}
function DashPg({data,goD,isMob,season,statusCards,upConfig,user}){
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
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:10,marginBottom:12}}>
            <div style={{padding:12,borderRadius:10,background:T.accent+"08",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>✂️</div><div style={{fontSize:FS+4,fontWeight:800,color:T.accent}}>{todayCut}</div><div style={{fontSize:FS-2,color:T.textSec}}>تم قصها</div></div>
            <div style={{padding:12,borderRadius:10,background:"#8B5CF608",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>📤</div><div style={{fontSize:FS+4,fontWeight:800,color:"#8B5CF6"}}>{todayWsDel}</div><div style={{fontSize:FS-2,color:T.textSec}}>تسليم ورشة</div></div>
            <div style={{padding:12,borderRadius:10,background:T.ok+"08",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>📥</div><div style={{fontSize:FS+4,fontWeight:800,color:T.ok}}>{todayWsRcv}</div><div style={{fontSize:FS-2,color:T.textSec}}>استلام مصنع</div></div>
            <div style={{padding:12,borderRadius:10,background:"#05966908",textAlign:"center"}}><div style={{fontSize:22,marginBottom:2}}>📦</div><div style={{fontSize:FS+4,fontWeight:800,color:"#059669"}}>{todayStock}</div><div style={{fontSize:FS-2,color:T.textSec}}>مخزن جاهز</div></div>
          </div>
          {todayOrders.length>0&&<div style={{fontSize:FS-1,color:T.textSec}}>{"أوامر قص: "+todayOrders.join("، ")}</div>}
          {todayWsNames.size>0&&<div style={{fontSize:FS-1,color:T.textSec}}>{"ورش: "+[...todayWsNames].join("، ")}</div>}
        </div>:<div style={{textAlign:"center",padding:20,color:T.textMut}}>
          <div style={{fontSize:28,marginBottom:6}}>☀️</div>
          <div style={{fontSize:FS,fontWeight:600}}>لا توجد حركات اليوم بعد</div>
        </div>}
      </Card>})()}
    <Card title={"الانتاج - الموسم "+season+" ("+orders.length+" موديل)"} style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(6,1fr)",gap:10}}>
        <div style={{padding:10,borderRadius:8,background:T.accent+"06",border:"1px solid "+T.accent+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>كمية القص</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.accent}}>{fmt(cutQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:T.ok+"06",border:"1px solid "+T.ok+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>مخزن جاهز</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.ok}}>{fmt(delQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:T.warn+"06",border:"1px solid "+T.warn+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>رصيد المصنع</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:T.warn}}>{fmt(cutQ-delQ)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:"#8B5CF606",border:"1px solid #8B5CF612",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>عند الورش</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:"#8B5CF6"}}>{fmt(Math.max(0,inProdQty))+" قطعة"}</div>
          {Object.keys(wsPieces).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center",marginTop:6}}>{Object.entries(wsPieces).sort((a,b)=>b[1]-a[1]).map(([piece,qty])=><span key={piece} style={{fontSize:FS-3,padding:"2px 6px",borderRadius:5,background:"#8B5CF610",color:"#7C3AED",fontWeight:600}}>{gIcon(piece,data.garmentTypes)+" "+piece+": "+fmt(qty)}</span>)}</div>}
          <div style={{marginTop:6,fontSize:FS-2,fontWeight:700,color:totalCompleteSets>0?"#10B981":"#94A3B8"}}>{"✅ طقم كامل: "+fmt(totalCompleteSets)}</div>
          <div style={{fontSize:FS-3,color:T.textMut}}>{"تسليم: "+fmt(totalDeliveredToWs)+" | استلام: "+fmt(totalReceivedFromWs)}</div></div>
        <div style={{padding:10,borderRadius:8,background:"#F59E0B06",border:"1px solid #F59E0B12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>تشطيب وتعبئة</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:"#F59E0B"}}>{fmt(finishingQty)}</div><div style={{fontSize:FS-3,color:T.textMut}}>قطعة</div></div>
        <div style={{padding:10,borderRadius:8,background:(comp>=80?T.ok:comp>=50?T.warn:T.err)+"06",border:"1px solid "+(comp>=80?T.ok:comp>=50?T.warn:T.err)+"12",textAlign:"center"}}><div style={{fontSize:FS-2,color:T.textSec}}>الانجاز</div><div style={{fontSize:isMob?18:22,fontWeight:800,color:comp>=80?T.ok:comp>=50?T.warn:T.err}}>{comp+"%"}</div><PBar value={comp}/></div>
      </div>
    </Card>
    {/* Workshop Accounts Summary */}
    <Card title="حسابات الورش" style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        <div style={{padding:12,borderRadius:10,background:T.accent+"08",border:"1px solid "+T.accent+"15",textAlign:"center"}}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>مستحق للورش</div>
          <div style={{fontSize:20,fontWeight:800,color:T.accent}}>{fmt(r2(wsDue+wsPurchase))+" ج.م"}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"15",textAlign:"center"}}>
          <div style={{fontSize:FS-1,color:T.textSec,marginBottom:4}}>اجمالي المدفوع</div>
          <div style={{fontSize:20,fontWeight:800,color:T.warn}}>{fmt(r2(wsPaid))+" ج.م"}</div>
        </div>
        <div style={{padding:12,borderRadius:10,background:(wsBalance>0?T.err:T.ok)+"08",border:"1px solid "+(wsBalance>0?T.err:T.ok)+"15",textAlign:"center"}}>
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
      return wasteRows.length>0&&<Card title={"📉 تقرير الفاقد ("+wasteRows.length+")"} style={{marginTop:16}} extra={<Btn small onClick={printWaste} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>}>
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
        const printComp=()=>{let h="<h2 style='text-align:center'>📊 تقرير مقارنة الورش</h2><table><thead><tr><th>الورشة</th><th>النوع</th><th>تسليم</th><th>استلام</th><th>فاقد</th><th>نسبة</th><th>المستحق</th><th>الرصيد</th></tr></thead><tbody>";wsComp.forEach(w=>{h+="<tr><td style='font-weight:700'>"+w.name+"</td><td>"+wsTypeInfo(w.type).key+"</td><td>"+w.del+"</td><td style='color:#10B981'>"+w.rcv+"</td><td style='color:#EF4444'>"+w.waste+"</td><td>"+w.wastePct+"%</td><td>"+fmt(r2(w.totalAmt))+"</td><td style='color:"+(w.balance>0?"#EF4444":"#10B981")+"'>"+fmt(r2(w.balance))+"</td></tr>"});h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='2'>الاجمالي</td><td>"+fmt(tDel)+"</td><td style='color:#10B981'>"+fmt(tRcv)+"</td><td style='color:#EF4444'>"+fmt(tWaste)+"</td><td>"+(tDel?Math.round((tWaste/tDel)*100):0)+"%</td><td>"+fmt(r2(tAmt))+"</td><td style='color:"+(tBal>0?"#EF4444":"#10B981")+"'>"+fmt(r2(tBal))+"</td></tr></tbody></table><div style='margin-top:12px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management</div>";printPage("تقرير مقارنة الورش",h)};
        return wsComp.length>0?<div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}><Btn small onClick={printComp} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨 طباعة</Btn></div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["الورشة","النوع","تسليم","استلام","فاقد","نسبة","المستحق","الرصيد"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
        <tbody>{wsComp.map(w=><tr key={w.name}><td style={{...TD,fontWeight:700}}>{w.name}</td><td style={{...TD,fontSize:FS-2}}>{wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key}</td><td style={TDB}>{w.del}</td><td style={{...TDB,color:T.ok}}>{w.rcv}</td><td style={{...TDB,color:w.waste>0?T.err:T.ok}}>{w.waste}</td><td style={{...TDB,color:w.wastePct>5?T.err:T.warn}}>{w.wastePct+"%"}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(w.totalAmt))}</td><td style={{...TDB,color:w.balance>0?T.err:T.ok}}>{fmt(r2(w.balance))}</td></tr>)}
        <tr style={{background:T.accent+"06"}}><td colSpan={2} style={{...TD,fontWeight:800}}>الاجمالي</td><td style={TDB}>{fmt(tDel)}</td><td style={{...TDB,color:T.ok}}>{fmt(tRcv)}</td><td style={{...TDB,color:T.err}}>{fmt(tWaste)}</td><td style={{...TDB,color:T.err}}>{(tDel?Math.round((tWaste/tDel)*100):0)+"%"}</td><td style={{...TDB,color:T.accent}}>{fmt(r2(tAmt))}</td><td style={{...TDB,color:tBal>0?T.err:T.ok}}>{fmt(r2(tBal))}</td></tr>
        </tbody></table></div></div>:<div style={{textAlign:"center",color:T.textMut,padding:20}}>لا توجد ورش</div>})()}
    </Card>
  </div>
}

/* ══ DB ══ */
function DBPg({data,upConfig,isMob,canEdit,statusCards,initialSub,onSubUsed,renameInOrders}){
  const[sub,setSub]=useState(initialSub||"fab");
  useEffect(()=>{if(initialSub){setSub(initialSub);if(onSubUsed)onSubUsed()}},[initialSub]);
  const[ff,setFf]=useState({name:"",unit:"كيلو",price:"",_eid:null});
  const[af,setAf]=useState({name:"",unit:"قطعة",price:"",_eid:null});
  const[sfld,setSfld]=useState({label:"",pcs:0,_eid:null});
  const[wf,setWf]=useState("");
  const[stName,setStName]=useState("");const[stColor,setStColor]=useState("#0EA5E9");const[stEid,setStEid]=useState(null);const[stShow,setStShow]=useState(false);
  const[gName,setGName]=useState("");const[gEid,setGEid]=useState(null);const[gIconSel,setGIconSel]=useState("👕");const[gShow,setGShow]=useState(false);

  const saveFab=()=>{if(!ff.name)return;upConfig(d=>{if(ff._eid){const idx=d.fabrics.findIndex(x=>x.id===ff._eid);if(idx>=0)d.fabrics[idx]={...d.fabrics[idx],name:ff.name,unit:ff.unit,price:Number(ff.price)||0}}else{d.fabrics.push({id:Date.now(),name:ff.name,unit:ff.unit,price:Number(ff.price)||0})}});setFf({name:"",unit:"كيلو",price:"",_eid:null})};
  const saveAcc=()=>{if(!af.name)return;upConfig(d=>{if(af._eid){const idx=d.accessories.findIndex(x=>x.id===af._eid);if(idx>=0)d.accessories[idx]={...d.accessories[idx],name:af.name,unit:af.unit,price:Number(af.price)||0}}else{d.accessories.push({id:Date.now(),name:af.name,unit:af.unit,price:Number(af.price)||0})}});setAf({name:"",unit:"قطعة",price:"",_eid:null})};
  const saveSize=()=>{if(!sfld.label)return;upConfig(d=>{if(sfld._eid){const idx=d.sizeSets.findIndex(x=>x.id===sfld._eid);if(idx>=0)d.sizeSets[idx]={...d.sizeSets[idx],label:sfld.label,pcsPerSeries:Number(sfld.pcs)||0}}else{d.sizeSets.push({id:Date.now(),label:sfld.label,pcsPerSeries:Number(sfld.pcs)||0})}});setSfld({label:"",pcs:0,_eid:null})};
  const saveGarment=()=>{if(!gName.trim())return;const oldName=gEid?(data.garmentTypes||[]).find(x=>x.id===gEid)?.name:null;upConfig(d=>{if(!d.garmentTypes)d.garmentTypes=[];if(gEid){const idx=d.garmentTypes.findIndex(x=>x.id===gEid);if(idx>=0){d.garmentTypes[idx].name=gName.trim();d.garmentTypes[idx].icon=gIconSel}}else{d.garmentTypes.push({id:Date.now(),name:gName.trim(),icon:gIconSel})}});if(oldName&&oldName!==gName.trim())renameInOrders("garment",oldName,gName.trim());setGName("");setGEid(null);setGIconSel("👕")};
  const saveStatus=()=>{if(!stName.trim())return;const oldName=stEid?(statusCards||[]).find(x=>x.id===stEid)?.name:null;upConfig(d=>{if(!d.statusCards)d.statusCards=[...DEFAULT_STATUSES];if(stEid){const idx=d.statusCards.findIndex(x=>x.id===stEid);if(idx>=0){d.statusCards[idx].name=stName.trim();d.statusCards[idx].color=stColor}}else{d.statusCards.push({id:Date.now(),name:stName.trim(),color:stColor})}});if(oldName&&oldName!==stName.trim())renameInOrders("status",oldName,stName.trim());setStName("");setStColor("#0EA5E9");setStEid(null)};

  const eBtn=(onClick)=><Btn small onClick={onClick} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>;
  const ords=data.orders||[];
  const fabBlock=(f)=>ords.some(o=>FKEYS.some(k=>Number(o["fabric"+k])===f.id))?"مستخدم في أوردرات":null;
  const accBlock=(a)=>ords.some(o=>(o.accItems||[]).some(x=>x.name===a.name))?"مستخدم في أوردرات":null;
  const sizeBlock=(s)=>ords.some(o=>Number(o.sizeSetId)===s.id)?"مستخدم في أوردرات":null;
  const garmentBlock=(g)=>ords.some(o=>(o.orderPieces||[]).includes(g.name))?"مستخدم في أوردرات":null;
  return<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>{[["fab","الأقمشة"],["acc","تشغيل + اكسسوار"],["size","المقاسات"],["garment","قطع الموديل"],["ws","الورش"],["status","حالات الأوردر"]].map(([k,l])=><Btn key={k} on={sub===k} onClick={()=>setSub(k)}>{l}</Btn>)}</div>
    {sub==="fab"&&<><Card title="جدول الأقمشة" extra={canEdit&&<Btn primary small onClick={()=>setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:true})}>+ اضافة</Btn>}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:450}}><thead><tr>{["#","القماش","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.fabrics.map((f,i)=><tr key={f.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{f.name}</td><td style={TD}>{f.unit}</td><td style={{...TDB,color:T.accent}}>{f.price+" ج.م"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setFf({name:f.name,unit:f.unit,price:f.price,_eid:f.id,_show:true}))}<DelBtn onConfirm={()=>upConfig(d=>{d.fabrics=d.fabrics.filter(x=>x.id!==f.id)})} blocked={fabBlock(f)}/></div></td>}</tr>)}</tbody></table></div></Card>
    {ff._show&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setFf({...ff,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{ff._eid?"✏️ تعديل القماش":"+ قماش جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم القماش</label><Inp value={ff.name} onChange={v=>setFf({...ff,name:v})}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الوحدة</label><Sel value={ff.unit} onChange={v=>setFf({...ff,unit:v})}><option value="كيلو">كيلو</option><option value="متر">متر</option><option value="يارد">يارد</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>السعر</label><Inp value={ff.price} onChange={v=>setFf({...ff,price:v})} type="number"/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveFab();setFf({name:"",unit:"كيلو",price:"",_eid:null,_show:false})}}>💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="acc"&&<><Card title="تشغيل + اكسسوار" extra={canEdit&&<Btn primary small onClick={()=>setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:true})}>+ اضافة</Btn>}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><thead><tr>{["#","الوصف","الوحدة","السعر",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.accessories.map((a,i)=><tr key={a.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{a.name}</td><td style={TD}>{a.unit}</td><td style={{...TDB,color:T.accent}}>{a.price+" ج.م"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setAf({name:a.name,unit:a.unit,price:a.price,_eid:a.id,_show:true}))}<DelBtn onConfirm={()=>upConfig(d=>{d.accessories=d.accessories.filter(x=>x.id!==a.id)})} blocked={accBlock(a)}/></div></td>}</tr>)}</tbody></table></div></Card>
    {af._show&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setAf({...af,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:420,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{af._eid?"✏️ تعديل البند":"+ بند جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>الوصف</label><Inp value={af.name} onChange={v=>setAf({...af,name:v})}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الوحدة</label><Sel value={af.unit} onChange={v=>setAf({...af,unit:v})}><option value="قطعة">قطعة</option><option value="متر">متر</option></Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>السعر</label><Inp value={af.price} onChange={v=>setAf({...af,price:v})} type="number"/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveAcc();setAf({name:"",unit:"قطعة",price:"",_eid:null,_show:false})}}>💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="size"&&<><Card title="المقاسات" extra={canEdit&&<Btn primary small onClick={()=>setSfld({label:"",pcs:0,_eid:null,_show:true})}>+ اضافة</Btn>}>
      <table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["#","المقاسات","قطع/سيري",...(canEdit?[""]:[])] .map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>{data.sizeSets.map((s,i)=><tr key={s.id}><td style={TD}>{i+1}</td><td style={{...TD,fontWeight:600}}>{s.label}</td><td style={{...TDB,color:T.accent}}>{s.pcsPerSeries||"-"}</td>{canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:4}}>{eBtn(()=>setSfld({label:s.label,pcs:s.pcsPerSeries||0,_eid:s.id,_show:true}))}<DelBtn onConfirm={()=>upConfig(d=>{d.sizeSets=d.sizeSets.filter(x=>x.id!==s.id)})} blocked={sizeBlock(s)}/></div></td>}</tr>)}</tbody></table></Card>
    {sfld._show&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setSfld({...sfld,_show:false})}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:400,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{sfld._eid?"✏️ تعديل المقاس":"+ مقاس جديد"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>المقاسات</label><Inp value={sfld.label} onChange={v=>setSfld({...sfld,label:v})} placeholder="S-M-L-XL"/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>قطع/سيري</label><Inp type="number" value={sfld.pcs||""} onChange={v=>setSfld({...sfld,pcs:Number(v)||0})}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setSfld({label:"",pcs:0,_eid:null,_show:false})}>الغاء</Btn><Btn primary onClick={()=>{saveSize();setSfld({label:"",pcs:0,_eid:null,_show:false})}}>💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="garment"&&<><Card title="قطع الموديل" extra={canEdit&&<Btn primary small onClick={()=>{setGName("");setGEid(null);setGIconSel("👕");setGShow(true)}}>+ اضافة</Btn>}>
      <div style={{display:"flex",flexWrap:"wrap",gap:10}}>{(data.garmentTypes||[]).map(g=><span key={g.id} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 18px",borderRadius:12,border:"1px solid "+T.brd,fontSize:FS,fontWeight:600,background:T.cardSolid}}>{(g.icon||gIcon(g.name,data.garmentTypes))+" "+g.name}{canEdit&&<>{" "}{eBtn(()=>{setGName(g.name);setGEid(g.id);setGIconSel(g.icon||gIcon(g.name,data.garmentTypes));setGShow(true)})}<DelBtn onConfirm={()=>upConfig(d=>{d.garmentTypes=(d.garmentTypes||[]).filter(x=>x.id!==g.id)})} blocked={garmentBlock(g)}/></>}</span>)}</div>
      {(!data.garmentTypes||data.garmentTypes.length===0)&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة قطع بعد</div>}
    </Card>
    {gShow&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setGShow(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{gEid?"✏️ تعديل القطعة":"+ قطعة جديدة"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"auto 1fr",gap:8}}>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>الأيقونة</label><Sel value={gIconSel} onChange={setGIconSel}>{GARMENT_ICONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}</Sel></div>
          <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم القطعة</label><Inp value={gName} onChange={setGName} placeholder="قميص، شورت..."/></div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setGShow(false)}>الغاء</Btn><Btn primary onClick={()=>{saveGarment();setGShow(false)}}>💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
    {sub==="ws"&&<WsManager workshops={data.workshops||[]} upConfig={upConfig} canEdit={canEdit} isMob={isMob} orders={data.orders} renameInOrders={renameInOrders}/>}
    {sub==="status"&&<><Card title="حالات الأوردر" extra={canEdit&&<Btn primary small onClick={()=>{setStName("");setStColor("#0EA5E9");setStEid(null);setStShow(true)}}>+ اضافة</Btn>}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:12}}>
        {statusCards.map(s=><div key={s.id} style={{padding:16,borderRadius:14,border:"2px solid "+s.color+"40",background:s.color+"08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:20,height:20,borderRadius:6,background:s.color}}/><span style={{fontWeight:700,fontSize:FS,color:T.text}}>{s.name}</span></div>
          {canEdit&&<div style={{display:"flex",gap:4}}>{eBtn(()=>{setStName(s.name);setStColor(s.color);setStEid(s.id);setStShow(true)})}<DelBtn onConfirm={()=>upConfig(d=>{d.statusCards=(d.statusCards||[]).filter(x=>x.id!==s.id)})} blocked={ords.some(o=>o.status===s.name)?"يوجد أوردرات بهذه الحالة":null}/></div>}
        </div>)}
      </div>
    </Card>
    {stShow&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setStShow(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
      <div style={{fontSize:FS+2,fontWeight:800,color:T.accent,marginBottom:14}}>{stEid?"✏️ تعديل الحالة":"+ حالة جديدة"}</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اسم الحالة</label><Inp value={stName} onChange={setStName}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec}}>اللون</label><input type="color" value={stColor} onChange={e=>setStColor(e.target.value)} style={{width:"100%",height:40,borderRadius:8,border:"1px solid "+T.brd,cursor:"pointer"}}/></div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setStShow(false)}>الغاء</Btn><Btn primary onClick={()=>{saveStatus();setStShow(false)}}>💾 حفظ</Btn></div>
      </div>
    </div></div>}</>}
  </div>
}

/* ══ WORKSHOP MANAGER ══ */
function WsManager({workshops,upConfig,canEdit,isMob,orders,renameInOrders}){
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
  const wsBlock=(ws)=>{const used=(orders||[]).some(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===ws.name));return used?"يوجد أوردرات مرتبطة بهذه الورشة":null};

  return<div>
    <Card title="ادارة الورش" extra={canEdit&&<Btn primary small onClick={startNew}>+ ورشة جديدة</Btn>}>
      {/* Workshop Cards */}
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:14}}>
        {(workshops||[]).map(ws=>{
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
    {showForm&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>{setShowForm(false);setEditId(null)}}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:600,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.accent}}>{editId?"✏️ تعديل الورشة":"+ ورشة جديدة"}</div>
          <Btn ghost onClick={()=>{setShowForm(false);setEditId(null)}}>✕</Btn>
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
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Btn ghost onClick={()=>{setShowForm(false);setEditId(null)}}>الغاء</Btn><Btn primary onClick={save}>💾 حفظ</Btn></div>
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
  return<><Card title={initial.modelNo?"تعديل الأوردر":_isDup?"تكرار أوردر":"أمر قص جديد"} accent={"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)"} extra={<div style={{display:"flex",gap:8}}>{!initial.modelNo&&!isMob&&!_isDup&&<Btn small onClick={()=>setTplMode(true)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}}>📂 قوالب</Btn>}{!initial.modelNo&&!isMob&&!_isDup&&<Btn small onClick={()=>setCopyMode(true)} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}}>نسخ من أوردر</Btn>}{!initial.modelNo&&!isMob&&!_isDup&&data.orders.length>0&&<Btn small onClick={()=>{setDupPopup(true);setDupModelNo("")}} style={{background:"rgba(255,255,255,0.2)",color:"#fff",border:"none"}}>📋 تكرار</Btn>}<Btn small onClick={save} style={{background:"#fff",color:T.accent,border:"none",fontWeight:700}}>حفظ</Btn>{form.fabricA&&!_isDup&&<Btn small onClick={saveTpl} style={{background:"rgba(255,255,255,0.15)",color:"#fff",border:"none"}}>💾 حفظ كقالب</Btn>}<Btn small onClick={handleCancel} style={{background:"rgba(255,255,255,0.3)",color:"#fff",border:"none"}}>الغاء</Btn></div>} style={{marginBottom:20}}>
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
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>الحالة</label><div style={{display:"flex",alignItems:"center",gap:6}}>{editStatusForm?<><Sel value={form.status} onChange={v=>{updF("status",v);setEditStatusForm(false)}}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel><Btn ghost small onClick={()=>setEditStatusForm(false)}>✕</Btn></>:<><Badge t={form.status} cards={statusCards}/><Btn ghost small onClick={()=>setEditStatusForm(true)} style={{fontSize:FS-3,padding:"2px 8px"}}>✏️</Btn></>}</div></div>
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
    {qfab&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setQfab(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:FS+2,fontWeight:800,color:T.ok}}>{"اضافة خامة سريعة ("+qfab.forKey+")"}</div>
          <Btn ghost small onClick={()=>setQfab(null)}>✕</Btn>
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
  {dupPopup&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setDupPopup(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:380,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)"}}>
    <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6",marginBottom:14}}>📋 تكرار من أوردر</div>
    <div style={{marginBottom:12}}><label style={{fontSize:FS-2,color:T.textSec}}>اختر الأوردر</label><Sel value={dupModelNo} onChange={setDupModelNo}><option value="">-- اختر --</option>{data.orders.map(o=><option key={o.id} value={o.modelNo}>{o.modelNo+" — "+o.modelDesc}</option>)}</Sel></div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn ghost onClick={()=>setDupPopup(false)}>الغاء</Btn><Btn primary disabled={!dupModelNo} onClick={()=>{const src=data.orders.find(o=>o.modelNo===dupModelNo);if(!src)return;setForm(p=>{const n={...p};n.sizeSetId=src.sizeSetId;n.sizeLabel=src.sizeLabel;n.orderPieces=[...(src.orderPieces||[])];n.accItems=JSON.parse(JSON.stringify(src.accItems||[]));n.instructions=src.instructions||"";FKEYS.forEach(k=>{n["fabric"+k]=src["fabric"+k]||"";n["cons"+k]=src["cons"+k]||"";n["colors"+k]=JSON.parse(JSON.stringify(src["colors"+k]||[]));n["cutDate"+k]=new Date().toISOString().split("T")[0];n["fabricPieces"+k]=src["fabricPieces"+k]||[]});return n});setDupPopup(false);showToast("✓ تم نسخ بيانات "+dupModelNo)}}>تكرار</Btn></div>
  </div></div>}
  {cancelPopup&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"30vh",padding:"30vh 16px 16px"}} onClick={()=>setCancelPopup(false)}><div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:360,border:"1px solid "+T.brd,boxShadow:"0 10px 40px rgba(0,0,0,0.2)",textAlign:"center"}}>
    <div style={{fontSize:40,marginBottom:10}}>⚠️</div>
    <div style={{fontSize:FS+2,fontWeight:800,color:T.warn,marginBottom:8}}>هل تريد الخروج؟</div>
    <div style={{fontSize:FS,color:T.textSec,marginBottom:16}}>يوجد بيانات مدخلة لم يتم حفظها</div>
    <div style={{display:"flex",gap:10,justifyContent:"center"}}><Btn ghost onClick={()=>setCancelPopup(false)}>متابعة التسجيل</Btn><Btn danger onClick={()=>{setCancelPopup(false);window.__formDirty=false;onCancel()}}>خروج بدون حفظ</Btn></div>
  </div></div>}
</>}

/* ══ DETAILS ══ */
function DetPg({data,updOrder,replaceOrder,addOrder,delOrder,sel,setSel,isMob,canEdit,statusCards,goHome,upConfig,user}){
  const order=data.orders.find(o=>o.id===sel);const[editing,setEditing]=useState(false);
  const userName=user?.displayName||user?.email?.split("@")[0]||"";
  const[detQ,setDetQ]=useState("");const[detSt,setDetSt]=useState("الكل");
  const[editStockIdx,setEditStockIdx]=useState(null);
  const[settReason,setSettReason]=useState("");const[settNotes,setSettNotes]=useState("");
  const[showNew,setShowNew]=useState(false);
  const[dupInit,setDupInit]=useState(null);
  const[showDeliver,setShowDeliver]=useState(false);
  const[editStatusMode,setEditStatusMode]=useState(false);
  const[editRcv,setEditRcv]=useState(null);const[edRcvQty,setEdRcvQty]=useState(0);const[edRcvDate,setEdRcvDate]=useState("");const[edRcvNote,setEdRcvNote]=useState("");
  const[dWs,setDWs]=useState("");const[dType,setDType]=useState("");const[dQty,setDQty]=useState(0);const[dPrice,setDPrice]=useState("");const[dNote,setDNote]=useState("");const[dDate,setDDate]=useState(new Date().toISOString().split("T")[0]);
  const statuses=(statusCards||DEFAULT_STATUSES).map(s=>s.name);
  const workshops=data.workshops||[];
  const isInternal=(name)=>{const w=workshops.find(x=>x.name===name);return w?wsIsInternal(w.type):false};

  if(dupInit)return<OrdForm data={data} initial={dupInit} onSave={o=>{addOrder(o);setDupInit(null);showToast("✓ تم تكرار الأوردر")}} onCancel={()=>setDupInit(null)} isMob={isMob} statusCards={statusCards} upConfig={upConfig}/>;
  if(showNew)return<OrdForm data={data} initial={mkOrder()} onSave={o=>{addOrder(o);setShowNew(false);showToast("✓ تم اضافة أمر القص")}} onCancel={()=>setShowNew(false)} isMob={isMob} statusCards={statusCards} upConfig={upConfig}/>;

  if(!order){
    const filtered=data.orders.filter(o=>{
      if(detSt==="⭐"&&!o.favorite)return false;
      if(detSt==="🔴"&&o.priority!=="urgent")return false;
      if(detSt==="⚠️"){const _now=new Date();let _ld=o.date;(o.workshopDeliveries||[]).forEach(wd=>{if(wd.date>_ld)_ld=wd.date;(wd.receives||[]).forEach(r=>{if(r.date>_ld)_ld=r.date})});(o.deliveries||[]).forEach(d=>{if(d.date>_ld)_ld=d.date});if(Math.floor((_now-new Date(_ld))/(1000*60*60*24))<=7||o.status==="تم التسليم"||o.status==="تم الشحن")return false}
      if(detSt!=="الكل"&&detSt!=="⭐"&&detSt!=="🔴"&&detSt!=="⚠️"&&o.status!==detSt)return false;
      if(detQ.trim()){const s=detQ.trim().toLowerCase();const h=[o.modelNo,o.modelDesc,o.sizeLabel,o.status].filter(Boolean).join(" ").toLowerCase();if(!h.includes(s))return false}
      return true
    });
    return<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
        <h2 style={{fontSize:FS+1,fontWeight:700,margin:0,color:T.textSec}}>{"اختر أوردر ("+filtered.length+")"}</h2>
        {canEdit&&<Btn primary onClick={()=>setShowNew(true)}>+ أمر قص جديد</Btn>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:8,marginBottom:10}}>
        <Inp value={detQ} onChange={setDetQ} placeholder="بحث بالرقم أو الوصف أو المقاسات..."/>
        <Sel value={detSt} onChange={setDetSt}><option value="الكل">كل الحالات</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
        <span onClick={()=>setDetSt(detSt==="⭐"?"الكل":"⭐")} style={{padding:"4px 10px",borderRadius:6,background:detSt==="⭐"?T.warn+"20":T.bg,border:"1px solid "+(detSt==="⭐"?T.warn:T.brd),cursor:"pointer",fontSize:FS-1,fontWeight:600,color:detSt==="⭐"?T.warn:T.textSec}}>⭐ المفضلة</span>
        <span onClick={()=>setDetSt(detSt==="🔴"?"الكل":"🔴")} style={{padding:"4px 10px",borderRadius:6,background:detSt==="🔴"?T.err+"20":T.bg,border:"1px solid "+(detSt==="🔴"?T.err:T.brd),cursor:"pointer",fontSize:FS-1,fontWeight:600,color:detSt==="🔴"?T.err:T.textSec}}>🔴 عاجل</span>
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
          const pri=o.priority||"normal";const priColor=pri==="urgent"?T.err:pri==="low"?"#10B981":T.warn;
          return<div key={o.id} data-oid={o.id} style={{display:"flex",gap:16,padding:16,background:T.cardSolid,borderRadius:16,border:isStale?"2px solid "+T.err+"60":"1px solid "+T.brd,boxShadow:T.shadow,cursor:"pointer",alignItems:"flex-start",position:"relative"}} onClick={()=>setSel(o.id)}>
          {canEdit&&!hasData&&<div onClick={e=>{e.stopPropagation()}} style={{position:"absolute",top:8,left:8}}><DelBtn onConfirm={()=>delOrder(o.id)}/></div>}
          {/* Favorite star + Priority */}
          <div onClick={e=>{e.stopPropagation();updOrder(o.id,u=>{u.favorite=!u.favorite})}} style={{position:"absolute",top:8,right:8,cursor:"pointer",fontSize:18,zIndex:2}}>{o.favorite?"⭐":"☆"}</div>
          {pri!=="normal"&&<div style={{position:"absolute",top:28,right:10,fontSize:10}}>{pri==="urgent"?"🔴":"🟢"}</div>}
          {isStale&&<div style={{position:"absolute",bottom:8,left:8,fontSize:FS-3,padding:"2px 6px",borderRadius:4,background:T.err+"15",color:T.err,fontWeight:700}}>{ageDays+" يوم"}</div>}
          {o.image?<img src={o.image} alt="" style={{width:80,height:107,borderRadius:10,objectFit:"cover",flexShrink:0,border:"1px solid "+T.brd}}/>:<div style={{width:80,height:107,borderRadius:10,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:28,color:T.textMut}}>📷</div>}
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
              <span style={{fontSize:FS,color:T.textSec}}>{"تكلفة: "}<b style={{color:"#8B5CF6"}}>{t.costPer+" ج.م"}</b></span>
              {o.settlement&&<span style={{fontSize:FS-1,padding:"2px 8px",borderRadius:6,background:T.err+"12",color:T.err,fontWeight:700}}>{"🔴 هالك: "+fmt(r2(o.settlement.cost))+" ج.م"}</span>}
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
        <Btn ghost onClick={()=>setSel(null)} style={{fontSize:isMob?16:20}}>✕</Btn>
        <div>
          <h1 style={{fontSize:isMob?16:20,fontWeight:800,margin:0}}>{order.poNumber?<>{"أمر تشغيل: "}<span style={{color:T.accent,fontFamily:"monospace"}}>{order.poNumber}</span></>:<>{"أمر تشغيل: "}<span style={{color:T.accent}}>{order.modelNo}</span></>}</h1>
          {order.poNumber&&<div style={{fontSize:FS-1,color:T.textSec,marginTop:2}}>{"موديل: "+order.modelNo+" — "+order.modelDesc}</div>}
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <span onClick={()=>updOrder(sel,o=>{o.favorite=!o.favorite})} style={{cursor:"pointer",fontSize:16}}>{order.favorite?"⭐":"☆"}</span>
          {["urgent","normal","low"].map(p=><span key={p} onClick={()=>updOrder(sel,o=>{o.priority=o.priority===p?"normal":p})} style={{cursor:"pointer",fontSize:11,padding:"2px 6px",borderRadius:5,background:order.priority===p?(p==="urgent"?T.err:p==="low"?T.ok:T.warn)+"15":"transparent",border:order.priority===p?"1px solid "+(p==="urgent"?T.err:p==="low"?T.ok:T.warn)+"30":"1px solid transparent",fontWeight:600,color:p==="urgent"?T.err:p==="low"?T.ok:T.warn}}>{p==="urgent"?"🔴 عاجل":p==="low"?"🟢 مرن":"🟡 عادي"}</span>)}
        </div>
      </div>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        <Btn small onClick={()=>prevId&&setSel(prevId)} disabled={!prevId} style={{fontSize:18,padding:"2px 8px",opacity:prevId?1:0.3}}>→</Btn>
        <span style={{fontSize:FS-2,color:T.textSec}}>{(curIdx+1)+"/"+sortedIds.length}</span>
        <Btn small onClick={()=>nextId&&setSel(nextId)} disabled={!nextId} style={{fontSize:18,padding:"2px 8px",opacity:nextId?1:0.3}}>←</Btn>
        <div style={{width:1,height:20,background:T.brd,margin:"0 4px"}}/>
        <Btn small onClick={()=>printOrderSheet(order,t,activeFabs,statusCards)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn>
        {canEdit&&!order.closed&&<Btn small primary onClick={()=>setEditing(true)}>✏️</Btn>}
        {canEdit&&!order.closed&&<Btn small onClick={()=>{const dup=JSON.parse(JSON.stringify(order));dup.id=gid();dup.date=new Date().toISOString().split("T")[0];dup.createdAt=new Date().toISOString();dup.modelNo="";dup.status="تم القص";dup.deliveredQty=0;dup.deliveries=[];dup.workshopDeliveries=[];dup._isDup=true;delete dup._docId;setDupInit(dup)}} style={{background:"#8B5CF6"+"12",color:"#8B5CF6",border:"1px solid #8B5CF630"}}>📋 تكرار</Btn>}
        {canEdit&&!order.closed&&t.cutQty>0&&<Btn small onClick={()=>{setShowDeliver(true);setDWs("");setDType("");setDQty(0);setDPrice("");setDNote("")}} style={{background:"#8B5CF6"+"12",color:"#8B5CF6",border:"1px solid #8B5CF630"}}>📤 تسليم ورشة</Btn>}
        {canEdit&&!order.closed&&<Btn small onClick={()=>setShowNew(true)} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>+ جديد</Btn>}
        {order.closed&&<span style={{padding:"4px 12px",borderRadius:8,background:"#64748B12",color:"#64748B",fontWeight:700,fontSize:FS-1}}>🔒 مغلق</span>}
      </div>
    </div>
    <div id="parea">
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        {isMob&&order.image&&<div style={{flexShrink:0}}><img src={order.image} alt="" style={{width:70,height:93,objectFit:"cover",borderRadius:10,border:"1px solid "+T.brd}}/></div>}
        <div style={{flex:1,display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:isMob?6:12}}>
          <MetricCard label="كمية القص" value={t.cutQty} icon="✂️" color={T.accent}/><MetricCard label="تم التسليم" value={order.deliveredQty||0} icon="📦" color={T.ok}/><MetricCard label="الرصيد" value={t.balance} icon="📊" color={t.balance>0?T.warn:T.ok}/><MetricCard label="تكلفة القطعة" value={t.costPer+" ج.م"} icon="💰" color={T.accent}/>
        </div>
      </div>
      {/* Timeline - horizontal after cards */}
      {(()=>{const ev=[];ev.push({title:"تم القص",date:order.date,color:T.accent,detail:"كمية: "+t.cutQty});
        (order.workshopDeliveries||[]).forEach(wd=>{ev.push({title:"تسليم ورشة — "+wd.wsName,date:wd.date,color:"#8B5CF6",detail:(wd.garmentType||"")+" | "+wd.qty+" قطعة"});(wd.receives||[]).forEach(r=>{ev.push({title:"استلام مصنع — "+wd.wsName,date:r.date,color:T.ok,detail:r.qty+" قطعة"})})});
        (order.deliveries||[]).forEach(d=>{ev.push({title:"مخزن جاهز",date:d.date,color:"#059669",detail:d.qty+" قطعة"})});
        ev.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
        return ev.length>1&&<div style={{marginBottom:14,background:T.cardSolid,borderRadius:10,padding:"10px 14px",border:"1px solid "+T.brd}}><Timeline events={ev}/></div>})()}
      <div style={{display:"grid",gridTemplateColumns:order.image&&!isMob?"auto 1fr":"1fr",gap:16,marginBottom:16}}>
        {!isMob&&order.image&&<div><img src={order.image} alt="" style={{width:135,height:180,aspectRatio:"3/4",objectFit:"cover",borderRadius:16,border:"1px solid "+T.brd,boxShadow:T.shadow}}/></div>}
        <Card title="بيانات الموديل">
          <div style={{marginBottom:8}}>
            {order.poNumber&&<div style={{fontSize:FS+4,fontWeight:800,color:T.accent,fontFamily:"monospace",letterSpacing:1}}>{"📋 "+order.poNumber}</div>}
            <div style={{fontSize:order.poNumber?FS+1:FS+4,fontWeight:700,color:order.poNumber?T.textSec:T.accent}}>{(order.poNumber?"🏷 ":"🏷 ")+order.modelNo}<span style={{fontSize:FS,fontWeight:600,color:T.textSec,marginRight:10}}>{" — "+order.modelDesc}</span></div>
          </div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}><tbody>
          <tr><td style={TDL}>المقاسات</td><td style={TDB}>{order.sizeLabel}</td><td style={TDL}>الحالة</td><td style={TD}><div style={{display:"flex",alignItems:"center",gap:6}}>{canEdit&&editStatusMode?<><Sel value={order.status} onChange={v=>{updOrder(sel,o=>{o.status=v});setEditStatusMode(false)}}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</Sel><Btn ghost small onClick={()=>setEditStatusMode(false)}>✕</Btn></>:<><Badge t={order.status} cards={statusCards}/>{canEdit&&<Btn ghost small onClick={()=>setEditStatusMode(true)} style={{fontSize:FS-3,padding:"2px 8px"}}>✏️</Btn>}</>}</div></td></tr>
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
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1.5fr 1fr",gap:16,marginBottom:16}}>
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
          return<Card title="تسليم مخزن جاهز" extra={canEdit&&canStock&&<Btn primary small onClick={()=>updOrder(sel,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:new Date().toISOString().split("T")[0],qty:0,notes:"",createdBy:userName});setTimeout(()=>setEditStockIdx(o.deliveries.length-1),100)})}>+ تسليم</Btn>}>
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
              <td style={{...TD,minWidth:100}}>{isEd?<Inp type="number" value={d.qty} onChange={v=>updOrder(sel,o=>{const maxQ=t.cutQty-o.deliveries.filter((_,j)=>j!==i).reduce((s,x)=>s+(Number(x.qty)||0),0);o.deliveries[i].qty=Math.min(Number(v)||0,maxQ);o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)})}/>:<span style={{fontWeight:700,color:T.accent}}>{d.qty}</span>}</td>
              <td style={{...TD,minWidth:120}}>{isEd?<Inp value={d.notes} onChange={v=>updOrder(sel,o=>{o.deliveries[i].notes=v})} placeholder="ملاحظات"/>:(d.notes||"-")}</td>
              {canEdit&&<td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
                {isEd?<><Btn small primary onClick={()=>setEditStockIdx(null)}>💾</Btn><Btn danger small onClick={()=>{updOrder(sel,o=>{o.deliveries.splice(i,1);o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)});setEditStockIdx(null)}}>🗑️</Btn></>
                :<Btn small onClick={()=>setEditStockIdx(i)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>}
              </div></td>}
            </tr>})}
            {(!order.deliveries||order.deliveries.length===0)&&<tr><td colSpan={canEdit?5:4} style={{...TD,textAlign:"center",color:T.textSec}}>لا توجد تسليمات</td></tr>}
          </tbody></table></div>
          </Card>})()}
          {/* ── Settlement & Close ── */}
          {(()=>{
            const stockDel=(order.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);
            const remain=t.cutQty-stockDel;
            const hasSett=!!order.settlement;const isClosed=!!order.closed;
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
                <div style={{padding:12,borderRadius:10,background:T.warn+"08",border:"1px solid "+T.warn+"20",marginBottom:12}}>
                  <div style={{fontSize:FS,fontWeight:700,color:T.warn,marginBottom:6}}>{"⚠️ يوجد "+remain+" قطعة لم تسلّم للمخزن"}</div>
                  <div style={{fontSize:FS-1,color:T.textSec}}>يمكنك عمل تسوية لتسجيل الفرق كهالك ثم غلق الأوردر</div>
                </div>
                {canEdit&&(()=>{
                  const settCost=r2(remain*t.costPer);
                  const REASONS=["عيوب تصنيع","تالف خامة","فاقد ورشة","خطأ قص","أخرى"];
                  return<div style={{padding:14,borderRadius:10,background:T.err+"04",border:"1px solid "+T.err+"15"}}>
                    <div style={{fontSize:FS+1,fontWeight:800,color:T.err,marginBottom:10}}>{"🔴 تكلفة الهالك: "+fmt(settCost)+" ج.م"}</div>
                    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:8,marginBottom:10}}>
                      <div><label style={{fontSize:FS-2,color:T.textSec}}>سبب التسوية</label><Sel value={settReason} onChange={setSettReason}><option value="">-- اختر --</option>{REASONS.map(r=><option key={r} value={r}>{r}</option>)}</Sel></div>
                      <div><label style={{fontSize:FS-2,color:T.textSec}}>ملاحظات</label><Inp value={settNotes} onChange={setSettNotes} placeholder="ملاحظات اضافية..."/></div>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <Btn onClick={()=>{if(!settReason){showToast("⚠️ اختر سبب التسوية");return}
                        updOrder(sel,o=>{o.settlement={qty:remain,reason:settReason,notes:settNotes,cost:settCost,date:new Date().toISOString().split("T")[0],createdBy:userName};o.closed=true;o.status="تم التسليم"});setSettReason("");setSettNotes("")}} style={{background:T.err,color:"#fff",border:"none",fontWeight:700}}>⚖️ تسوية + غلق الأوردر</Btn>
                      <Btn onClick={()=>{if(!settReason){showToast("⚠️ اختر سبب التسوية");return}
                        updOrder(sel,o=>{o.settlement={qty:remain,reason:settReason,notes:settNotes,cost:settCost,date:new Date().toISOString().split("T")[0],createdBy:userName}});setSettReason("");setSettNotes("")}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>⚖️ تسوية فقط</Btn>
                    </div>
                  </div>})()}
              </div>}
            </Card>
          })()}
      </div>
      {/* Workshop Deliveries Info */}
      {(order.workshopDeliveries||[]).length>0&&<Card title="التشغيل الخارجي" style={{marginBottom:16}}>
        {(order.workshopDeliveries||[]).map((wd,i)=>{
          const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
          const bal=(Number(wd.qty)||0)-rcvd;
          return<div key={i} style={{border:"1px solid "+T.brd,borderRadius:8,marginBottom:8,overflow:"hidden"}}>
            <div style={{padding:"8px 12px",background:bal>0?T.err+"05":T.ok+"05",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontWeight:700,fontSize:FS}}>{wd.wsName}</span>
                {wd.garmentType&&<span style={{fontSize:FS-3,color:T.purple,background:T.purple+"10",padding:"1px 6px",borderRadius:6}}>{wd.garmentType}</span>}
                <span style={{fontSize:FS-3,padding:"1px 6px",borderRadius:6,background:bal>0?T.err+"10":T.ok+"10",color:bal>0?T.err:T.ok,fontWeight:700}}>{"رصيد: "+bal}</span>
              </div>
            </div>
            <div style={{padding:"4px 12px 8px"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr>{["","الحركة","التاريخ","الكمية","ملاحظات",...(canEdit?[""]:[])] .map(h=><th key={h} style={{...TH,fontSize:FS-3,padding:"4px 8px"}}>{h}</th>)}</tr></thead>
              <tbody>
                <tr style={{background:"#F0FDF408"}}><td style={{...TD,padding:"4px 8px",textAlign:"center",color:T.ok,fontSize:14}}>↗</td><td style={{...TD,padding:"4px 8px",fontWeight:600,color:T.ok}}>تسليم ورشة</td><td style={{...TD,padding:"4px 8px"}}>{wd.date}</td><td style={{...TDB,padding:"4px 8px",color:T.ok}}>{wd.qty}</td><td style={{...TD,padding:"4px 8px",fontSize:FS-2}}>{wd.notes||"-"}</td>{canEdit&&<td style={{...TD,padding:"4px 8px"}}></td>}</tr>
                {(wd.receives||[]).map((r,ri)=>{const isEdR=editRcv&&editRcv.wdIdx===i&&editRcv.rIdx===ri;return<tr key={ri} style={{background:isEdR?T.warn+"08":"#EFF6FF08"}}><td style={{...TD,padding:"4px 8px",textAlign:"center",color:T.accent,fontSize:14}}>↙</td><td style={{...TD,padding:"4px 8px",fontWeight:600,color:T.accent}}>استلام مصنع</td><td style={{...TD,padding:"4px 8px"}}>{isEdR?<Inp type="date" value={edRcvDate} onChange={setEdRcvDate} sx={{padding:"2px 4px",fontSize:FS-2}}/>:r.date}</td><td style={{...TDB,padding:"4px 8px",color:T.accent}}>{isEdR?<Inp type="number" value={edRcvQty} onChange={v=>setEdRcvQty(Number(v)||0)} sx={{padding:"2px 4px",fontSize:FS-1,width:60}}/>:r.qty}</td><td style={{...TD,padding:"4px 8px",fontSize:FS-2}}>{isEdR?<Inp value={edRcvNote} onChange={setEdRcvNote} sx={{padding:"2px 4px",fontSize:FS-2}}/>:(r.notes||"-")}</td>{canEdit&&<td style={{...TD,padding:"4px 8px",whiteSpace:"nowrap"}}>{isEdR?<div style={{display:"flex",gap:3}}><Btn small primary onClick={()=>{updOrder(sel,o=>{const rc=o.workshopDeliveries[i].receives[ri];if(rc){rc.qty=edRcvQty;rc.date=edRcvDate;rc.notes=edRcvNote}o.status=recomputeStatus(o)});setEditRcv(null)}}>💾</Btn><Btn ghost small onClick={()=>setEditRcv(null)}>✕</Btn></div>:<Btn ghost small onClick={()=>{setEditRcv({wdIdx:i,rIdx:ri});setEdRcvQty(r.qty);setEdRcvDate(r.date);setEdRcvNote(r.notes||"")}} style={{fontSize:FS-3,padding:"2px 6px"}}>✏️</Btn>}</td>}</tr>})}
              </tbody>
            </table></div>
          </div>
        })}
      </Card>}
      {/* Attachments */}
      {(order.attachments||[]).length>0&&<Card title="ملفات مرفقة" style={{marginBottom:16}}><div style={{display:"flex",flexWrap:"wrap",gap:10}}>{order.attachments.map((a,i)=><a key={i} href={a.data} download={a.name} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:10,background:T.accentBg,border:"1px solid "+T.brd,fontSize:FS,color:T.accent,fontWeight:600,textDecoration:"none"}}>{"📎 "+a.name}</a>)}</div></Card>}
      <Card title="ملخص تكلفة الموديل" accent={"linear-gradient(135deg,"+T.accent+","+T.accent+"CC)"}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:FS+1}}><thead><tr>{["البند","التكلفة الكلية","تكلفة القطعة"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
          <tr><td style={TD}>تكلفة الخامات</td><td style={TDB}>{fmt(r2(t.totalFab))+" ج.م"}</td><td style={TDB}>{t.fabPer+" ج.م"}</td></tr>
          <tr><td style={TD}>تكاليف الاكسسوار</td><td style={TDB}>{fmt(accAll)+" ج.م"}</td><td style={TDB}>{t.accPer+" ج.م"}</td></tr>
          <tr style={{background:T.accentBg}}><td style={{...TD,fontWeight:800,fontSize:FS+4,color:T.accent}}>الاجمالي</td><td style={{...TD,fontWeight:800,fontSize:FS+4,color:T.accent}}>{fmt(r2(t.costAll))+" ج.م"}</td><td style={{...TD,fontWeight:800,fontSize:FS+6,color:T.accent}}>{t.costPer+" ج.م"}</td></tr>
          {order.settlement&&<><tr style={{background:T.err+"08"}}><td style={{...TD,fontWeight:800,color:T.err}}>{"🔴 هالك ("+order.settlement.qty+" قطعة)"}</td><td style={{...TD,fontWeight:800,color:T.err}}>{fmt(r2(order.settlement.cost))+" ج.م"}</td><td style={{...TD,fontWeight:700,color:T.err}}>{order.settlement.reason}</td></tr>
          <tr style={{background:"#1E293B08"}}><td style={{...TD,fontWeight:800,fontSize:FS+2}}>التكلفة الفعلية</td><td style={{...TD,fontWeight:800,fontSize:FS+2,color:T.err}}>{fmt(r2(t.costAll+order.settlement.cost))+" ج.م"}</td><td style={{...TD,fontWeight:800,fontSize:FS+2,color:T.err}}>{(order.deliveredQty>0?r2((t.costAll+order.settlement.cost)/order.deliveredQty):0)+" ج.م/قطعة"}</td></tr></>}
        </tbody></table>
      </Card>
      {order.instructions&&<Card title="تعليمات التشغيل" style={{marginTop:16}}><div style={{whiteSpace:"pre-wrap",fontSize:FS+1,lineHeight:2}}>{order.instructions}</div></Card>}
    </div>
    {/* Deliver to Workshop Popup */}
    {showDeliver&&(()=>{
      const pieces=order.orderPieces||[];
      const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(order,k))(order["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
      const isLinked=p=>linkedPieces.size===0||linkedPieces.has(p);
      const availPieces=pieces.filter(p=>{if(!isLinked(p))return false;const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return delForP<t.cutQty});
      const totalDelForType=dType?(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===dType).reduce((s,wd)=>s+(Number(wd.qty)||0),0):0;
      const maxQty=dType?Math.max(0,t.cutQty-totalDelForType):t.cutQty;
      const doDeliver=(print,wa)=>{
        if(!dWs||!dType||!dQty)return;
        const wsObj=workshops.find(w=>w.name===dWs);
        const wd={wsName:dWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",qty:Number(dQty),garmentType:dType,price:Number(dPrice)||0,notes:dNote,date:dDate||new Date().toISOString().split("T")[0],receives:[],createdBy:userName};
        const upd=JSON.parse(JSON.stringify(order));
        if(!upd||!upd.id||!upd.modelNo){showToast("⚠️ خطأ — بيانات الأوردر غير صالحة");return}
        if(!upd.workshopDeliveries)upd.workshopDeliveries=[];upd.workshopDeliveries.push(wd);
        upd.status=recomputeStatus(upd);
        replaceOrder(order.id,upd);
        showToast("✓ تم التسليم — "+dWs);setShowDeliver(false);
        if(print){setTimeout(()=>{printReceipt(dWs,wsObj?wsObj.owner:"",upd,dType,Number(dQty),dDate||new Date().toISOString().split("T")[0],maxQty-Number(dQty),data.garmentTypes)},300)}
        if(wa){const phone=wsObj?.phone||"";const d=dDate||new Date().toISOString().split("T")[0];const msg="*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+dWs+"*%0A• رقم الموديل: *"+order.modelNo+"*%0A• الوصف: "+order.modelDesc+"%0A• نوع القطعة: *"+dType+"*%0A• الكمية المستلمة: *"+dQty+"* قطعة%0A• السعر: *"+(dPrice||0)+"* ج.م/قطعة%0A• التاريخ: *"+d+"*%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
      };
      return<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowDeliver(false)}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:20,padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",border:"1px solid "+T.brd,boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:FS+2,fontWeight:800,color:"#8B5CF6"}}>{"📤 تسليم "+order.modelNo+" لورشة"}</div>
            <Btn ghost onClick={()=>setShowDeliver(false)}>✕</Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الورشة *</label><SearchSel value={dWs} onChange={v=>{setDWs(v);setDPrice("")}} options={workshops.map(w=>({value:w.name,label:wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — "+w.name+(w.owner?" - "+w.owner:"")}))} placeholder="ابحث عن ورشة..."/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>نوع القطعة *</label><Sel value={dType} onChange={v=>{setDType(v);const delForP=(order.workshopDeliveries||[]).filter(wd=>wd.garmentType===v).reduce((s,wd)=>s+(Number(wd.qty)||0),0);setDQty(Math.max(0,t.cutQty-delForP))}}><option value="">-- اختر --</option>{(availPieces.length>0?availPieces:pieces.length>0?pieces:["عام"]).map(p=><option key={p} value={p}>{(gIcon(p,data.garmentTypes))+" "+p}</option>)}</Sel></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>الكمية *</label><Inp type="number" value={dQty} onChange={v=>setDQty(Math.min(Number(v)||0,maxQty))}/></div>
            {dWs&&!isInternal(dWs)&&<div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>سعر القطعة</label><Inp type="number" value={dPrice} onChange={setDPrice}/></div>}
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ملاحظات</label><Inp value={dNote} onChange={setDNote}/></div>
            <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>التاريخ</label><Inp type="date" value={dDate} onChange={setDDate}/></div>
          </div>
          {dWs&&dType&&<div style={{padding:10,borderRadius:8,background:T.accentBg,marginBottom:12,fontSize:FS-1,color:T.textSec}}>
            {"كمية القص: "+t.cutQty+" | تم تسليمه: "+totalDelForType+" | متاح: "+maxQty}
          </div>}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn ghost onClick={()=>setShowDeliver(false)}>الغاء</Btn>
            <Btn primary onClick={()=>doDeliver(false)} disabled={!dWs||!dType||!dQty}>تسليم وحفظ</Btn>
            <Btn onClick={()=>doDeliver(true)} disabled={!dWs||!dType||!dQty} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تسليم + طباعة</Btn>
            <Btn onClick={()=>doDeliver(false,true)} disabled={!dWs||!dType||!dQty} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱 واتساب</Btn>
          </div>
        </div>
      </div>})()}
  </div>
}

/* ══ EXTERNAL PRODUCTION ══ */
function ExtProdPg({data,updOrder,upConfig,isMob,canEdit,statusCards,season}){
  const[mode,setMode]=useState(null);
  const[selWs,setSelWs]=useState("");
  const[selOrder,setSelOrder]=useState("");
  const[ordSearch,setOrdSearch]=useState("");
  const[delQty,setDelQty]=useState(0);
  const[delType,setDelType]=useState("");
  const[delNote,setDelNote]=useState("");
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
  const[movTypeF,setMovTypeF]=useState("الكل");
  const[movLimit,setMovLimit]=useState(50);
  const[wsMovLimit,setWsMovLimit]=useState(10);
  const[rcvSearch,setRcvSearch]=useState("");
  const[batchItems,setBatchItems]=useState([]);const[batchDate,setBatchDate]=useState(new Date().toISOString().split("T")[0]);const[batchQ,setBatchQ]=useState("");
  const[editMov,setEditMov]=useState(null);
  const[editQty,setEditQty]=useState(0);
  const[editNote,setEditNote]=useState("");
  const[editPrice,setEditPrice]=useState(0);
  const[editDate,setEditDate]=useState("");
  const workshops=data.workshops||[];
  const isInternal=(name)=>{const w=workshops.find(x=>x.name===name);return w?wsIsInternal(w.type):false};
  const extWorkshops=workshops.filter(w=>!wsIsInternal(w.type));

  /* QR scan receive handler */
  useEffect(()=>{const h=()=>{const qr=window.__qrReceive;if(!qr)return;const ord=data.orders.find(o=>o.id===qr.oid);if(!ord)return;const wd=(ord.workshopDeliveries||[])[qr.wdi];if(!wd)return;setMode("receive");setSelWs(wd.wsName);setRcvSearch(ord.modelNo);delete window.__qrReceive};window.addEventListener("qr-receive",h);return()=>window.removeEventListener("qr-receive",h)},[data.orders]);
  useEffect(()=>{const h=()=>{const qr=window.__qrWsAcc;if(!qr)return;setMode("accounts");setAccWsF(qr.ws);delete window.__qrWsAcc};window.addEventListener("qr-wsacc",h);return()=>window.removeEventListener("qr-wsacc",h)},[]);

  const startEditMov=(m)=>{setEditMov(m);setEditQty(m.qty);setEditNote(m.notes||"");setEditPrice(m.price||0);setEditDate(m.date||"")};
  const saveEditMov=()=>{if(!editMov)return;
    if(editMov.type==="deliver"){updOrder(editMov.orderId,o=>{const wd=o.workshopDeliveries[editMov.wdIdx];if(wd){wd.qty=Number(editQty)||0;wd.notes=editNote;wd.price=Number(editPrice)||0;if(editDate)wd.date=editDate};o.status=recomputeStatus(o)})}
    else{updOrder(editMov.orderId,o=>{const r=o.workshopDeliveries[editMov.wdIdx].receives[editMov.rIdx];if(r){r.qty=Number(editQty)||0;r.notes=editNote;if(editDate)r.date=editDate};o.status=recomputeStatus(o)})}
    setEditMov(null)};
  const printMov=(m)=>{
    const ord=data.orders.find(o=>o.id===m.orderId);
    const ws=(data.workshops||[]).find(w=>w.name===m.wsName);
    if(m.type==="deliver")printReceipt(m.wsName||"",ws?ws.owner:"",ord||{modelNo:m.orderNo||"",modelDesc:m.orderDesc||""},m.garmentType||"",m.qty,m.date,0,data.garmentTypes);
    else printReceiveReceipt(m.wsName||"",ord||{modelNo:m.orderNo||"",modelDesc:m.orderDesc||""},m.garmentType||"",m.qty,m.date,0,data.garmentTypes)
  };

  const wsObj=workshops.find(w=>(w.name||w)===(selWs));
  const prodOrders=useMemo(()=>data.orders.filter(o=>o.status==="تم القص"||o.status==="في التشغيل"),[data.orders]);
  const wsOrders=selWs?data.orders.filter(o=>(o.workshopDeliveries||[]).some(wd=>wd.wsName===selWs)):[];

  const deliverToWs=(andPrint,andWa)=>{
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
      o.workshopDeliveries.push({id:gid(),wsName:selWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",wsOwner:wsObj?wsObj.owner:"",qty:saveQty,garmentType:saveType,notes:saveNote,price:savePrice,date:saveDate,receives:[],createdBy:userName});
      o.status=recomputeStatus(o);
    });
    setSelOrder("");setDelQty(0);setDelType("");setDelNote("");setDelPrice("");setDelDate(new Date().toISOString().split("T")[0]);showToast("✓ تم تسليم "+saveQty+" قطعة لـ "+selWs);
    if(andPrint){const printOrd=JSON.parse(JSON.stringify(ord));const pWs=selWs;const pWsOwner=wsObj?wsObj.owner:"";const pGt=data.garmentTypes;setTimeout(()=>printReceipt(pWs,pWsOwner,printOrd,saveType,saveQty,saveDate,Math.max(0,availAfter),pGt),400)}
    if(andWa){const phone=wsObj?.phone||"";const msg="*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+selWs+"*%0A• رقم الموديل: *"+ord.modelNo+"*%0A• الوصف: "+ord.modelDesc+"%0A• نوع القطعة: *"+saveType+"*%0A• الكمية: *"+saveQty+"* قطعة%0A• السعر: *"+savePrice+"* ج.م/قطعة%0A• التاريخ: *"+saveDate+"*%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
  };

  const receiveFromWs=(orderId,wdIdx,andPrint,printData,cardKey,andWa)=>{
    const rv=getRcv(cardKey);
    if(!rv.qty)return;
    const ord=data.orders.find(o=>o.id===orderId);if(!ord)return;
    const wd=(ord.workshopDeliveries||[])[wdIdx];if(!wd)return;
    const rcvd=(wd.receives||[]).reduce((s,r)=>s+(Number(r.qty)||0),0);
    const maxRcv=(Number(wd.qty)||0)-rcvd;
    const saveQty=Math.min(Number(rv.qty),maxRcv);if(saveQty<=0)return;
    const saveNote=rv.note;const wdPrice=Number(wd.price)||0;const saveDate=rv.date||new Date().toISOString().split("T")[0];const saveQuality=rv.quality||"جيد جداً";
    updOrder(orderId,o=>{
      if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];
      o.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty,notes:saveNote,price:wdPrice,amount:r2(saveQty*wdPrice),quality:saveQuality,createdBy:userName});
      o.status=recomputeStatus(o)
    });
    clearRcv(cardKey);showToast("✓ تم استلام "+saveQty+" قطعة");
    if(andPrint&&printData){const pOrd=JSON.parse(JSON.stringify(ord));if(pOrd.workshopDeliveries&&pOrd.workshopDeliveries[wdIdx]){if(!pOrd.workshopDeliveries[wdIdx].receives)pOrd.workshopDeliveries[wdIdx].receives=[];pOrd.workshopDeliveries[wdIdx].receives.push({date:saveDate,qty:saveQty})}const pWs=selWs;const pType=wd.garmentType||"";const pGt=data.garmentTypes;setTimeout(()=>printReceiveReceipt(pWs,pOrd,pType,saveQty,saveDate,0,pGt),400)}
    if(andWa){const wsObj=workshops.find(w=>w.name===wd.wsName);const phone=wsObj?.phone||"";const remaining=maxRcv-saveQty;const msg="*CLARK — اذن استلام من ورشة*%0A%0A• الورشة: *"+wd.wsName+"*%0A• رقم الموديل: *"+ord.modelNo+"*%0A• الوصف: "+ord.modelDesc+"%0A• نوع القطعة: *"+(wd.garmentType||"عام")+"*%0A• الكمية المستلمة: *"+saveQty+"* قطعة%0A• الرصيد المتبقي: *"+remaining+"* قطعة%0A• التاريخ: *"+saveDate+"*%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
  };

  /* Collect all movements for the log — memoized */
  const movements=useMemo(()=>{const mvs=[];let _mi=0;
  data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{
    mvs.push({type:"deliver",date:wd.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx,_i:_mi++,createdBy:wd.createdBy||""});
    (wd.receives||[]).forEach((r,rIdx)=>{mvs.push({type:"receive",date:r.date,wsName:wd.wsName,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",notes:r.notes||"",orderId:ord.id,wdIdx,rIdx,_i:_mi++,createdBy:r.createdBy||""})})
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
  const addPayment=(wa)=>{if(!payWs||!payAmt)return;const wsObj=workshops.find(w=>w.name===payWs);upConfig(d=>{if(!d.wsPayments)d.wsPayments=[];d.wsPayments.push({id:gid(),wsName:payWs,wsId:wsObj?wsObj.id:null,amount:Number(payAmt),type:payType,notes:payNote,date:payDate,createdBy:userName})});
    if(wa){const acc=wsAccounts(payWs);let del=0,rcv=0;data.orders.forEach(o=>{(o.workshopDeliveries||[]).filter(wd=>wd.wsName===payWs).forEach(wd=>{del+=Number(wd.qty)||0;(wd.receives||[]).forEach(r=>{rcv+=Number(r.qty)||0})})});
      const allPay=(data.wsPayments||[]).filter(p=>p.wsName===payWs&&p.type==="payment");const totalPaid=allPay.reduce((s,p)=>s+(Number(p.amount)||0),0)+Number(payAmt);
      const phone=wsObj?.phone||"";
      const msg="*CLARK — اشعار دفعة*%0A%0A• الورشة: *"+payWs+"*%0A• نوع العملية: *"+(payType==="payment"?"دفعة":"مشتريات")+"*%0A• المبلغ: *"+fmt(Number(payAmt))+"* ج.م%0A• التاريخ: *"+payDate+"*%0A"+(payNote?"• ملاحظات: "+payNote+"%0A":"")+"%0A─────────────────%0A*ملخص الحساب*%0A• تم تسليمه للورشة: "+fmt(del)+" قطعة%0A• تم استلامه للمصنع: "+fmt(rcv)+" قطعة%0A• اجمالي المستحق: "+fmt(r2(acc.due))+" ج.م%0A• اجمالي المشتريات: "+fmt(r2(acc.totalPurchase))+" ج.م%0A• اجمالي المدفوع: "+fmt(r2(totalPaid))+" ج.م%0A• الرصيد المتبقي: *"+fmt(r2(acc.due+acc.totalPurchase-totalPaid))+"* ج.م";
      window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}
    setPayAmt("");setPayNote("");setPayDate(new Date().toISOString().split("T")[0])};

  if(!mode)return<div>
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(6,1fr)",gap:12,marginBottom:20}}>
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
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
        <Inp value={movQ} onChange={setMovQ} placeholder="بحث بالموديل أو الورشة..."/>
        <Sel value={movWsF} onChange={setMovWsF}><option value="الكل">كل الورش</option>{workshops.map(w=><option key={w.id||w} value={w.name||w}>{(w.type?wsTypeInfo(w.type).icon+" "+wsTypeInfo(w.type).key+" — ":"")+(w.name||w)}</option>)}</Sel>
        <Sel value={movTypeF} onChange={setMovTypeF}><option value="الكل">كل الحركات</option><option value="deliver">تسليم ورشة</option><option value="receive">استلام مصنع</option></Sel>
        <div style={{display:"flex",gap:4}}>
          <Btn onClick={()=>{const el=document.getElementById("mov-log");if(!el)return;printPage("سجل حركات التشغيل الخارجي",el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd,flex:1}}>🖨 المعروض</Btn>
          <Btn onClick={()=>{const allH="<table><thead><tr>"+["نوع","التاريخ","الورشة","موديل","الوصف","القطعة","الكمية","السعر","ملاحظات"].map(h=>"<th>"+h+"</th>").join("")+"</tr></thead><tbody>"+movements.map(m=>"<tr style='background:"+(m.type==="deliver"?"#F0FDF4":"#EFF6FF")+"'><td style='color:"+(m.type==="deliver"?"#10B981":"#0EA5E9")+";font-weight:700'>"+(m.type==="deliver"?"تسليم ورشة":"استلام مصنع")+"</td><td>"+m.date+"</td><td>"+m.wsName+"</td><td><b>"+m.orderNo+"</b></td><td>"+(m.orderDesc||"")+"</td><td>"+(m.garmentType||"-")+"</td><td><b>"+m.qty+"</b></td><td>"+(m.price?m.price+" ج.م":"-")+"</td><td>"+(m.notes||"-")+"</td></tr>").join("")+"</tbody></table>";printPage("سجل حركات التشغيل الخارجي (كامل - "+movements.length+" حركة)",allH)}} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30",flex:1}}>🖨 الكل</Btn>
        </div>
      </div>
      {(()=>{const fMov=movements.filter(m=>{if(movWsF!=="الكل"&&m.wsName!==movWsF)return false;if(movTypeF!=="الكل"&&m.type!==movTypeF)return false;if(movQ.trim()){const s=movQ.trim().toLowerCase();if(!((m.orderNo||"").toLowerCase().includes(s)||(m.wsName||"").toLowerCase().includes(s)||(m.orderDesc||"").toLowerCase().includes(s)))return false}return true});const shown=fMov.slice(0,movLimit);
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
      const waBatch=()=>{if(selArr.length===0)return;const byWs={};selArr.forEach(m=>{if(!byWs[m.wsName])byWs[m.wsName]=[];byWs[m.wsName].push(m)});Object.entries(byWs).forEach(([ws,items])=>{const wsObj=workshops.find(w=>w.name===ws);const phone=wsObj?.phone||"";const lines=items.map(m=>"• "+(m.type==="deliver"?"تسليم":"استلام")+" — موديل *"+m.orderNo+"*%0A  "+(m.orderDesc||"-")+" — "+(m.garmentType||"عام")+" — *"+m.qty+"* قطعة").join("%0A");const tQty=items.reduce((s,m)=>s+(Number(m.qty)||0),0);const msg="*CLARK — ملخص حركات*%0A%0A• الورشة: *"+ws+"*%0A%0A─────────────────%0A"+lines+"%0A─────────────────%0A• الاجمالي: *"+tQty+"* قطعة%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")})};
      return<div id="mov-log">
      {selArr.length>0&&<div style={{padding:"10px 14px",borderRadius:10,background:"#8B5CF608",border:"1px solid #8B5CF625",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <span style={{fontWeight:700,color:"#8B5CF6",fontSize:FS}}>{"☑ "+selArr.length+" حركة محددة ("+selArr.reduce((s,m)=>s+(Number(m.qty)||0),0)+" قطعة)"}</span>
        <div style={{display:"flex",gap:6}}><Btn small onClick={printBatchCombined} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨 طباعة مجمعة</Btn><Btn small onClick={waBatch} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱 واتساب مجمع</Btn><Btn ghost small onClick={()=>setSelMoves(new Set())}>✕ الغاء</Btn></div>
      </div>}
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
        <thead><tr>{["☐","نوع الحركة","التاريخ","الورشة","موديل","الوصف","نوع القطعة","الكمية","سعر التشغيل","ملاحظات",""].map(h=><th key={h} style={{...TH,width:h==="☐"?30:"auto"}}>{h==="☐"?<span onClick={()=>{if(selMoves.size===shown.length)setSelMoves(new Set());else setSelMoves(new Set(shown.map((_,i)=>i)))}} style={{cursor:"pointer",fontSize:16}}>{selMoves.size===shown.length&&shown.length>0?"☑":"☐"}</span>:h}</th>)}</tr></thead>
        <tbody>{shown.length>0?shown.map((m,i)=>{
          const isEditing=editMov&&editMov.orderId===m.orderId&&editMov.wdIdx===m.wdIdx&&editMov.type===m.type&&(m.type==="deliver"||editMov.rIdx===m.rIdx);
          const isSel=selMoves.has(i);
          return<tr key={i} style={{background:isSel?"#8B5CF610":m.type==="deliver"?"#F0FDF4":"#EFF6FF"}}>
          <td style={{...TD,textAlign:"center"}}><span onClick={()=>toggleSel(i)} style={{cursor:"pointer",fontSize:16}}>{isSel?"☑":"☐"}</span></td>
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEditing?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:130}}/>:m.date}</td><td style={{...TD,fontWeight:600}}>{m.wsName}</td><td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td>
          <td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:T.accent}}>{isEditing?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:70}}/>:m.qty}</td>
          <td style={TD}>{isEditing&&m.type==="deliver"?<Inp type="number" value={editPrice} onChange={v=>setEditPrice(Number(v)||0)} style={{width:70}}/>:(m.price?m.price+" ج.م":"-")}</td>
          <td style={TD}>{isEditing?<Inp value={editNote} onChange={setEditNote} style={{width:100}}/>:<>{m.notes||"-"}{m.createdBy&&<div style={{fontSize:FS-3,color:T.textMut,marginTop:2}}>{"👤 "+m.createdBy}</div>}</>}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {isEditing?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)}>الغاء</Btn></>:<>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn>
            <Btn small onClick={()=>{const wsObj=workshops.find(w=>w.name===m.wsName);const phone=wsObj?.phone||"";const msg=m.type==="deliver"?"*CLARK — اذن تسليم ورشة*%0A%0A• الورشة: *"+m.wsName+"*%0A• رقم الموديل: *"+m.orderNo+"*%0A• الوصف: "+m.orderDesc+"%0A• نوع القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"* قطعة%0A• السعر: *"+(m.price||0)+"* ج.م/قطعة%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — اذن استلام من ورشة*%0A%0A• الورشة: *"+m.wsName+"*%0A• رقم الموديل: *"+m.orderNo+"*%0A• الوصف: "+m.orderDesc+"%0A• نوع القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية المستلمة: *"+m.qty+"* قطعة%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱</Btn>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>
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
  const availOrders=prodOrders.filter(o=>getAvailQty(o)>0);
  /* Workshop-specific movements */
  const wsMoves=[];
  if(selWs)data.orders.forEach(ord=>{(ord.workshopDeliveries||[]).forEach((wd,wdIdx)=>{if(wd.wsName===selWs){wsMoves.push({type:"deliver",date:wd.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:wd.qty,garmentType:wd.garmentType||"",price:wd.price||0,notes:wd.notes||"",orderId:ord.id,wdIdx,_ts:new Date(wd.date).getTime()+wdIdx,createdBy:wd.createdBy||""});(wd.receives||[]).forEach((r,rIdx)=>{wsMoves.push({type:"receive",date:r.date,orderNo:ord.modelNo,orderDesc:ord.modelDesc,qty:r.qty,garmentType:wd.garmentType||"",price:r.price||0,notes:r.notes||"",orderId:ord.id,wdIdx,rIdx,_ts:new Date(r.date).getTime()+wdIdx*100+rIdx,createdBy:r.createdBy||""})})}})});
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
            <div style={{padding:"6px 8px",borderRadius:8,background:(wsBal>0?T.err:T.ok)+"10",textAlign:"center"}}><div style={{fontSize:FS-3,color:T.textSec}}>الرصيد</div><div style={{fontWeight:800,color:wsBal>0?T.err:T.ok}}>{wsBal}</div></div>
          </div>
        </div>})()}
    </Card>
    {selWs&&<Card title={"أوردرات متاحة للتسليم ("+availOrders.length+")"} style={{marginBottom:16}}>
      {availOrders.length>0?<div>
        <Inp value={ordSearch} onChange={setOrdSearch} placeholder="بحث بالرقم أو الوصف..." style={{marginBottom:10}}/>
        {(()=>{const fOrds=ordSearch.trim()?availOrders.filter(o=>{const s=ordSearch.trim().toLowerCase();return(o.modelNo||"").toLowerCase().includes(s)||(o.modelDesc||"").toLowerCase().includes(s)}):availOrders;return<div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:10,marginBottom:10}}>
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
            const isLinked=p=>linkedPieces.size===0||linkedPieces.has(p);
            /* Compute available pieces */
            const availPieces=pieces.filter(p=>{if(!isLinked(p))return false;const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return delForP<t.cutQty});
            const unlinkedPieces=pieces.filter(p=>!isLinked(p));
            return pieces.length>0?<><Sel value={delType} onChange={v=>{setDelType(v);if(v&&ord){const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===v).reduce((s,wd)=>s+(Number(wd.qty)||0),0);setDelQty(t.cutQty-delForP)}}}>
              <option value="">-- اختر القطعة --</option>
              {availPieces.map(p=>{const delForP=(ord.workshopDeliveries||[]).filter(wd=>wd.garmentType===p).reduce((s,wd)=>s+(Number(wd.qty)||0),0);return<option key={p} value={p}>{gIcon(p,data.garmentTypes)+" "+p+" (متاح: "+(t.cutQty-delForP)+")"}</option>})}
            </Sel>{unlinkedPieces.length>0&&<div style={{marginTop:4}}>{unlinkedPieces.map(p=><span key={p} style={{display:"inline-block",padding:"3px 10px",borderRadius:6,fontSize:FS-2,fontWeight:600,color:T.err,background:T.err+"10",border:"1px solid "+T.err+"20",marginLeft:4}}>{gIcon(p,data.garmentTypes)+" "+p+" — لم يتم القص"}</span>)}</div>}</>:<Inp value={delType} onChange={setDelType} placeholder="نوع القطعة..."/>
          })()}</div>
          {!isInternal(selWs)&&<div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>سعر التشغيل</label><Inp type="number" step="0.01" value={delPrice} onChange={v=>setDelPrice(v)} placeholder="سعر القطعة"/></div>}
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>ملاحظات</label><Inp value={delNote} onChange={setDelNote} placeholder="ملاحظات..."/></div>
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>التاريخ</label><Inp type="date" value={delDate} onChange={setDelDate}/></div>
        </div>
        <div style={{display:"flex",gap:8}}><Btn primary onClick={()=>deliverToWs(false)} disabled={!selOrder||!delQty||!delType}>تسليم وحفظ</Btn><Btn onClick={()=>deliverToWs(true)} disabled={!selOrder||!delQty||!delType} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>تسليم + طباعة</Btn><Btn onClick={()=>deliverToWs(false,true)} disabled={!selOrder||!delQty||!delType} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱 واتساب</Btn><Btn ghost onClick={()=>{setSelOrder("");setDelQty(0);setDelType("");setDelNote("");setDelPrice("")}}>الغاء</Btn></div>
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
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEd?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:120}}/>:m.date}</td>
          <td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td><td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:T.accent}}>{isEd?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:60}}/>:m.qty}</td>
          {!isInternal(selWs)&&<td style={TD}>{isEd&&m.type==="deliver"?<Inp type="number" step="0.01" value={editPrice} onChange={v=>setEditPrice(v)} style={{width:60}}/>:(m.price?m.price+" ج.م":"-")}</td>}
          <td style={TD}>{isEd?<Inp value={editNote} onChange={setEditNote} style={{width:80}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)}>✕</Btn></>:<>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn>
            <Btn small onClick={()=>{const phone=wsObj?.phone||"";const msg=m.type==="deliver"?"*CLARK — تسليم*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — استلام*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱</Btn></>}
          </div>}</td></tr>})}</tbody>
      </table></div>
    </Card>}
  </div>;

  /* ── BATCH DELIVER MODE ── */
  if(mode==="batch"){
    /* Build available items when workshop selected */
    const buildBatchItems=()=>{if(!selWs)return[];const items=[];
      data.orders.forEach(o=>{const t=calcOrder(o);const pieces=o.orderPieces||[];const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
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
        items.forEach(item=>{updated.workshopDeliveries.push({id:gid(),wsName:selWs,wsId:wsObj?wsObj.id:null,wsType:wsObj?wsObj.type:"",wsOwner:wsObj?wsObj.owner:"",qty:item.qty,garmentType:item.garmentType,notes:"تسليم مُجمع",price:item.price,date:batchDate,receives:[],createdBy:user?.displayName||user?.email?.split("@")[0]||""})});
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
          {checked.length>0&&<><Btn small primary onClick={()=>doBatchDeliver(false)}>📦 تسليم ({checked.length})</Btn><Btn small onClick={()=>doBatchDeliver(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn><Btn small onClick={()=>doBatchDeliver(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱</Btn></>}
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
              <Btn onClick={()=>doBatchDeliver(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱 واتساب</Btn>
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
          updated.workshopDeliveries[item.wdIdx].receives.push({date:batchDate,qty:item.qty,notes:"استلام مُجمع",price:item.price,amount:r2(item.qty*item.price),quality:"جيد جداً",createdBy:user?.displayName||user?.email?.split("@")[0]||""})});
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
          {checkedRcv.length>0&&<><Btn small onClick={()=>doBatchReceive(false)} style={{background:T.ok,color:"#fff",border:"none"}}>📥 استلام ({checkedRcv.length})</Btn><Btn small onClick={()=>doBatchReceive(true)} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn><Btn small onClick={()=>doBatchReceive(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱</Btn></>}
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
              <Btn onClick={()=>doBatchReceive(false,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱 واتساب</Btn>
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
                  {wd.receives.map((r,ri)=>{const rBal=bal+Number(r.qty);return<tr key={ri}><td style={TD}>{ri+1}</td><td style={TD}>{r.date}</td><td style={TDB}>{r.qty}</td><td style={TD}>{r.notes||"-"}</td><td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}><Btn small onClick={()=>printReceiveReceipt(selWs,ord,wd.garmentType||"",r.qty,r.date,rBal,data.garmentTypes)} style={{background:T.ok+"15",color:T.ok,border:"1px solid "+T.ok+"30"}}>🖨</Btn></div></td></tr>})}
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
                  <Btn onClick={()=>receiveFromWs(ord.id,actualIdx,false,null,ck,true)} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱</Btn>
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
          <td style={{...TD,fontWeight:700,color:m.type==="deliver"?T.ok:T.accent}}>{m.type==="deliver"?"↗ تسليم ورشة":"↙ استلام مصنع"}</td>
          <td style={TD}>{isEd?<Inp type="date" value={editDate} onChange={setEditDate} style={{width:120}}/>:m.date}</td>
          <td style={TDB}>{m.orderNo}</td><td style={TD}>{m.orderDesc}</td><td style={TD}>{m.garmentType||"-"}</td>
          <td style={{...TDB,color:m.type==="deliver"?T.ok:T.accent}}>{isEd?<Inp type="number" value={editQty} onChange={v=>setEditQty(Number(v)||0)} style={{width:60}}/>:m.qty}</td>
          {!isInternal(selWs)&&<td style={TD}>{isEd&&m.type==="deliver"?<Inp type="number" step="0.01" value={editPrice} onChange={v=>setEditPrice(v)} style={{width:60}}/>:(m.price?m.price+" ج.م":"-")}</td>}
          <td style={TD}>{isEd?<Inp value={editNote} onChange={setEditNote} style={{width:80}}/>:(m.notes||"-")}</td>
          <td style={{...TD,whiteSpace:"nowrap"}}>{canEdit&&<div style={{display:"flex",gap:3}}>
            {isEd?<><Btn small primary onClick={saveEditMov}>حفظ</Btn><Btn ghost small onClick={()=>setEditMov(null)}>✕</Btn></>:<>
            <Btn small onClick={()=>startEditMov(m)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>
            <DelBtn onConfirm={()=>delMovement(m)} blocked={getMovBlock(m)}/>
            <Btn small onClick={()=>printMov(m)} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨</Btn>
            <Btn small onClick={()=>{const phone=wsObj?.phone||"";const msg=m.type==="deliver"?"*CLARK — تسليم*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*":"*CLARK — استلام*%0A%0A• الورشة: *"+selWs+"*%0A• موديل: *"+m.orderNo+"*%0A• الوصف: "+(m.orderDesc||"-")+"%0A• القطعة: *"+(m.garmentType||"عام")+"*%0A• الكمية: *"+m.qty+"*%0A• التاريخ: *"+m.date+"*%0A%0A*برجاء التأكيد*";window.open("https://wa.me/"+(phone?phone.replace(/[^0-9]/g,""):"")+"?text="+msg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱</Btn></>}
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
      <Btn onClick={()=>addPayment(true)} disabled={!payWs||!payAmt} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱 واتساب</Btn>
    </Card>
    {payWs&&<Card title={"دفعات "+payWs}><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["التاريخ","النوع","المبلغ","ملاحظات",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
      {(data.wsPayments||[]).filter(p=>p.wsName===payWs).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map((p,i)=>{const isEd=editPayId===p.id;
        return<tr key={i} style={{background:isEd?T.warn+"08":p.type==="payment"?"#FEF2F2":"#F0FDF4"}}>
        <td style={{...TD,minWidth:110}}>{isEd?<Inp type="date" value={edPayDate} onChange={setEdPayDate}/>:p.date}</td>
        <td style={{...TD,fontWeight:700,color:p.type==="payment"?T.err:T.ok}}>{isEd?<Sel value={edPayType} onChange={setEdPayType}><option value="payment">دفعة</option><option value="purchase">مشتريات</option></Sel>:(p.type==="payment"?"دفعة ↗":"مشتريات ↙")}</td>
        <td style={{...TDB,color:p.type==="payment"?T.err:T.ok,minWidth:90}}>{isEd?<Inp type="number" value={edPayAmt} onChange={setEdPayAmt}/>:fmt(p.amount)+" ج.م"}</td>
        <td style={{...TD,minWidth:80}}>{isEd?<Inp value={edPayNote} onChange={setEdPayNote}/>:(p.notes||"-")}</td>
        <td style={{...TD,whiteSpace:"nowrap"}}><div style={{display:"flex",gap:3}}>
          {isEd?<><Btn small primary onClick={()=>{upConfig(d=>{const t=(d.wsPayments||[]).find(x=>x.id===p.id);if(t){t.date=edPayDate;t.amount=Number(edPayAmt)||0;t.notes=edPayNote;t.type=edPayType}});setEditPayId(null);showToast("✓ تم التعديل")}}>💾</Btn><Btn ghost small onClick={()=>setEditPayId(null)}>✕</Btn></>
          :<><Btn small onClick={()=>{setEditPayId(p.id);setEdPayDate(p.date);setEdPayAmt(p.amount);setEdPayNote(p.notes||"");setEdPayType(p.type)}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn>
          <Btn small onClick={()=>{const wsO=workshops.find(w=>w.name===payWs);const ph=wsO?.phone||"";const ac=wsAccounts(payWs);const mg="*CLARK — "+(p.type==="payment"?"اشعار دفعة":"اشعار مشتريات")+"*%0A%0A• الورشة: *"+payWs+"*%0A• المبلغ: *"+fmt(p.amount)+"* ج.م%0A• التاريخ: *"+p.date+"*%0A"+(p.notes?"• ملاحظات: "+p.notes+"%0A":"")+"%0A─────────────────%0A*الرصيد الحالي: "+fmt(r2(ac.balance))+" ج.م*";window.open("https://wa.me/"+(ph?ph.replace(/[^0-9]/g,""):"")+"?text="+mg,"_blank")}} style={{background:"#25D36612",color:"#25D366",border:"1px solid #25D36630"}}>📱</Btn>
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
          <Btn onClick={()=>{const el=document.getElementById("ws-acc-area");if(!el)return;printPage("حسابات الورش — "+season,el.innerHTML)}} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
          h+="<div style='padding:10px 16px;border-radius:8px;background:"+(a.balance>0?"#FEE2E2":"#F0FDF4")+";text-align:center;min-width:100px'><div style='font-size:11px;color:#64748B'>الرصيد</div><div style='font-size:18px;font-weight:800;color:"+(a.balance>0?"#EF4444":"#10B981")+"'>"+fmt(r2(a.balance))+"</div></div></div>";
          h+="<table><thead><tr><th>التاريخ</th><th>البيان</th><th>كمية</th><th>سعر</th><th>مستحق</th><th>مدفوع</th><th>الرصيد</th></tr></thead><tbody>";
          let pRun=0;entries.forEach(e=>{if(e.type==="due"||e.type==="purchase")pRun+=e.amount;else pRun-=e.amount;
            h+="<tr style='background:"+(e.type==="payment"?"#FEF2F2":e.type==="purchase"?"#F0FDF4":"")+"'><td>"+e.date+"</td><td>"+e.desc+"</td><td style='font-weight:700'>"+(e.qty||"-")+"</td><td>"+(e.price||"-")+"</td><td style='color:#0284C7;font-weight:700'>"+(e.type==="due"?fmt(e.amount):e.type==="purchase"?fmt(e.amount):"-")+"</td><td style='color:#EF4444;font-weight:700'>"+(e.type==="payment"?fmt(e.amount):"-")+"</td><td style='font-weight:700;color:"+(pRun>0?"#EF4444":"#10B981")+"'>"+fmt(r2(pRun))+"</td></tr>"});
          h+="</tbody></table>";
          h+="<div style='display:flex;justify-content:space-between;align-items:flex-end;margin-top:30px'><div style='text-align:center;width:180px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px'>توقيع المسؤول</div></div><div style='text-align:center;width:180px'><div style='border-top:2px solid #333;padding-top:8px;font-weight:700;font-size:12px'>توقيع الورشة</div></div>"+(qrSrc?"<div style='text-align:center'><img src='"+qrSrc+"' style='width:80px;height:80px'/><div style='font-size:8px;color:#94A3B8'>"+w.name+"</div></div>":"")+"</div>";
          h+="<div style='margin-top:16px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px'>CLARK Factory Management — "+new Date().toLocaleDateString("ar-EG")+"</div>";
          printPage("كشف حساب — "+w.name,h)
        };
        return<Card key={w.id} title={"كشف حساب: "+w.name} style={{marginTop:12}} extra={<Btn small onClick={printStmt} style={{background:T.accent+"12",color:T.accent,border:"1px solid "+T.accent+"30"}}>🖨 طباعة</Btn>}>
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
        {i>0&&<Btn danger small onClick={()=>setCFabs(p=>p.filter((_,j)=>j!==i))} style={{alignSelf:"end"}}>✕</Btn>}
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
    updOrder(selOrder,o=>{if(!o.deliveries)o.deliveries=[];o.deliveries.push({date:stDate,qty,notes:stNote,createdBy:userName});o.deliveredQty=o.deliveries.reduce((s,x)=>s+(Number(x.qty)||0),0);o.status=recomputeStatus(o)});
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
    <Card style={{marginBottom:12}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{"اختر الأوردر ("+eligible.length+")"}</label>
          <SearchSel value={selOrder} onChange={v=>{setSelOrder(v);setStQty(0)}} options={eligible.map(o=>{const tc=calcOrder(o);const sd=(o.deliveries||[]).reduce((s,d)=>s+(Number(d.qty)||0),0);return{value:o.id,label:o.modelNo+" — "+o.modelDesc+" (متبقي: "+(tc.cutQty-sd)+")"}})} placeholder="ابحث بالموديل أو الوصف..."/>
        </div>
        {selOrder&&<><div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>{"الكمية (طقم كامل متاح: "+stockRemain+")"}</label><Inp type="number" value={stQty} onChange={v=>setStQty(Number(v)||0)}/></div>
        <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap"}}>التاريخ</label><Inp type="date" value={stDate} onChange={setStDate}/></div>
        <div style={{display:"flex",gap:6}}><Btn primary onClick={()=>saveStock(false)} disabled={!stQty||stQty<=0}>📦 تسليم</Btn><Btn onClick={()=>saveStock(true)} disabled={!stQty||stQty<=0} style={{background:T.accentBg,color:T.accent,border:"1px solid "+T.accent+"30"}}>📦 تسليم + طباعة</Btn></div></>}
      </div>
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
            {isEditing?<><Btn small primary onClick={()=>{updOrder(selOrder,o=>{const r=o.workshopDeliveries[lastRcvWdIdx].receives[lastRcvRIdx];if(r)r.qty=qEditQty;o.status=recomputeStatus(o)});setQEditPiece(null);showToast("✓ تم تعديل الاستلام")}}>💾</Btn><Btn ghost small onClick={()=>setQEditPiece(null)}>✕</Btn></>
            :isAdding?<><Btn small primary onClick={()=>{if(!qRcvQty||qRcvQty<=0)return;updOrder(selOrder,o=>{if(!o.workshopDeliveries[wdIdx].receives)o.workshopDeliveries[wdIdx].receives=[];o.workshopDeliveries[wdIdx].receives.push({date:qRcvDate,qty:qRcvQty,notes:"استلام سريع",price:Number(wdForP.price)||0,amount:r2(qRcvQty*(Number(wdForP.price)||0)),createdBy:userName});o.status=recomputeStatus(o)});setQRcvPiece(null);setQRcvQty(0);showToast("✓ تم استلام "+qRcvQty+" "+p.piece)}}>💾</Btn><Btn ghost small onClick={()=>setQRcvPiece(null)}>✕</Btn></>
            :<>{hasRcv&&<Btn ghost small onClick={()=>{const lastR=wds[lastRcvWdIdx].receives[lastRcvRIdx];setQEditPiece(p.piece);setQEditQty(lastR.qty);setQRcvPiece(null)}} style={{fontSize:FS-3,padding:"2px 6px"}}>✏️</Btn>}{p.balance>0&&wdIdx>=0&&<Btn ghost small onClick={()=>{setQRcvPiece(p.piece);setQRcvQty(0);setQRcvDate(new Date().toISOString().split("T")[0]);setQEditPiece(null)}} style={{fontSize:FS-3,padding:"2px 8px",color:T.accent}}>📥</Btn>}</>}
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
    {showLimitPopup&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowLimitPopup(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.cardSolid,borderRadius:16,padding:24,width:"100%",maxWidth:480,border:"1px solid "+T.err+"40",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{fontSize:FS+2,fontWeight:800,color:T.err,marginBottom:12}}>⚠️ لا يمكن تسليم {showLimitPopup.requested} طقم</div>
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
      return allStock.length>0&&<Card title={"سجل تسليمات المخزن ("+allStock.length+")"} extra={<Btn small onClick={printLog} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>}>
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
            {isEd?<><Btn small primary onClick={saveEdit}>💾</Btn><Btn ghost small onClick={()=>setEditSt(null)}>✕</Btn></>
            :<><Btn small onClick={()=>startEdit(s)} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>✏️</Btn><DelBtn onConfirm={()=>delStock(s)}/></>}
          </div></td>}
        </tr>})}{filtered.length===0&&<tr><td colSpan={canEdit?7:6} style={{...TD,textAlign:"center",color:T.textMut,padding:20}}>لا توجد نتائج</td></tr>}</tbody>
      </table></div>})()}</Card>})()}
  </div>
}

/* ══ UNCUT PIECES REPORT ══ */
function UncutReport({data,isMob,season}){
  const rows=[];
  data.orders.forEach(o=>{const pieces=o.orderPieces||[];if(pieces.length===0)return;
    const linkedPieces=new Set();FKEYS.forEach(k=>{if(gf(o,k))(o["fabricPieces"+k]||[]).forEach(p=>linkedPieces.add(p))});
    const linked=pieces.filter(p=>linkedPieces.has(p));const unlinked=pieces.filter(p=>!linkedPieces.has(p));const t=calcOrder(o);
    unlinked.forEach(p=>rows.push({modelNo:o.modelNo,modelDesc:o.modelDesc,date:o.date,cutQty:t.cutQty,piece:p,linked,id:o.id}))});
  const printRep=()=>{const el=document.getElementById("uncut-rep");if(el)printPage("تقرير القطع غير المقصوصة — "+season,el.innerHTML)};
  const exportXls=()=>{const xRows=[["رقم الموديل","الوصف","التاريخ","كمية القص","تم قصها","لم يتم قصها"]];rows.forEach(r=>xRows.push([r.modelNo,r.modelDesc,r.date,r.cutQty,r.linked.join("، "),r.piece]));xRows.push([]);xRows.push(["الاجمالي",rows.length+" قطعة غير مقصوصة"]);exportExcel(xRows,"قطع_غير_مقصوصة_"+season)};
  return<div id="uncut-rep">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.err}}>✂️ قطع لم يتم قصها</h1><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season+" — "+rows.length+" قطعة"}</div></div>
      <div style={{display:"flex",gap:6}}><Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn><Btn onClick={exportXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn></div>
    </div>
    {rows.length>0?<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
      <thead><tr>{["#","رقم الموديل","الوصف","التاريخ","كمية القص","تم قصها ✓","لم يتم قصها ✕"].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r,i)=><tr key={i}><td style={TD}>{i+1}</td><td style={TDB}>{r.modelNo}</td><td style={TD}>{r.modelDesc}</td><td style={TD}>{r.date}</td><td style={{...TDB,color:T.accent}}>{r.cutQty}</td><td style={{...TD,color:T.ok}}>{r.linked.map(p=>gIcon(p,data.garmentTypes)+" "+p).join("، ")||"—"}</td><td style={{...TDB,color:T.err}}>{gIcon(r.piece,data.garmentTypes)+" "+r.piece}</td></tr>)}</tbody>
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
      <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
    h+="<table><thead><tr><th>#</th><th>رقم الموديل</th><th>الوصف</th><th>القطعة</th><th>كمية القص</th><th>تم تسليمه</th><th>متاح للتسليم</th></tr></thead><tbody>";
    rows.forEach((r,i)=>{h+="<tr><td>"+(i+1)+"</td><td style='font-weight:700'>"+r.modelNo+"</td><td>"+r.modelDesc+"</td><td style='color:#8B5CF6;font-weight:700'>"+r.piece+"</td><td style='font-weight:700'>"+r.cutQty+"</td><td style='color:#F59E0B;font-weight:700'>"+r.delivered+"</td><td style='color:#10B981;font-weight:800;font-size:14px'>"+r.available+"</td></tr>"});
    h+="<tr style='background:#EFF6FF;font-weight:800'><td colspan='4'>الاجمالي</td><td>"+fmt(rows.reduce((s,r)=>s+r.cutQty,0))+"</td><td>"+fmt(rows.reduce((s,r)=>s+r.delivered,0))+"</td><td style='color:#10B981;font-size:16px'>"+fmt(totalAvail)+"</td></tr>";
    h+="</tbody></table>";
    h+="<div style='margin-top:20px;padding:12px;border:2px solid #E2E8F0;border-radius:8px;text-align:center;font-size:11px;color:#94A3B8'>تم الطباعة في "+new Date().toLocaleDateString("ar-EG")+" — CLARK Factory Management</div>";
    printPage("القطع المتاحة للتسليم — "+season,h)
  };
  return<div id="avail-rep">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div><h1 style={{fontSize:isMob?18:24,fontWeight:800,margin:"0 0 4px",color:T.accent}}>📤 القطع المتاحة للتسليم</h1><div style={{fontSize:FS-1,color:T.textSec}}>{"الموسم: "+season+" — "+rows.length+" بند — "+fmt(totalAvail)+" قطعة متاحة"}</div></div>
      <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
  ];
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
      <Btn onClick={printFab} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
      <Btn onClick={printWsPerf} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
      <Btn onClick={printDel} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
      <Btn onClick={printSum} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
        <Btn onClick={printRep} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
        {(cDateFrom||cDateTo)&&<Btn ghost small onClick={()=>{setCDateFrom("");setCDateTo("")}}>✕</Btn>}
      </div>
      <div style={{display:"flex",gap:6}}>
        <Btn onClick={exportCostXls} style={{background:T.ok+"12",color:T.ok,border:"1px solid "+T.ok+"30"}}>📊 Excel</Btn>
        <Btn onClick={printCost} style={{background:T.bg,color:T.text,border:"1px solid "+T.brd}}>🖨</Btn>
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
function TasksPg({data,upConfig,isMob,user,userRole}){
  const[taskText,setTaskText]=useState("");const[taskTo,setTaskTo]=useState("");
  const uid=user?.uid||"default";const userEmail=user?.email||"";
  const allTasks=Array.isArray(data.tasks)?data.tasks:[];
  const myTasks=allTasks.filter(t=>t.toEmail===userEmail||t.toUid===uid);
  const sentTasks=allTasks.filter(t=>t.fromEmail===userEmail||t.fromUid===uid);
  const users=(data.usersList||[]);
  /* Ensure current user always in list */
  const allowedTargets=users.find(u=>u.email===userEmail)?users:[{email:userEmail,name:user?.displayName||userEmail.split("@")[0],role:userRole},...users];
  const addTask=()=>{if(!taskText.trim()||!taskTo)return;const target=allowedTargets.find(u=>u.email===taskTo);
    upConfig(d=>{if(!Array.isArray(d.tasks))d.tasks=[];d.tasks.unshift({id:Date.now(),text:taskText.trim(),done:false,date:new Date().toISOString().split("T")[0],fromUid:uid,fromEmail:userEmail,fromName:user?.displayName||userEmail.split("@")[0],toEmail:taskTo,toName:target?.name||taskTo.split("@")[0]})});
    setTaskText("");showToast("✓ تم ارسال المهمة")};
  const toggleTask=(tid)=>{upConfig(d=>{const arr=Array.isArray(d.tasks)?d.tasks:[];const t=arr.find(x=>x.id===tid);if(t){t.done=!t.done;t.doneAt=t.done?new Date().toISOString():null}})};
  const delTask=(tid)=>{upConfig(d=>{d.tasks=Array.isArray(d.tasks)?d.tasks.filter(x=>x.id!==tid):[]})};
  return<div>
    <Card title="📌 ارسال مهمة جديدة" style={{marginBottom:16}}>
      <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 2fr auto",gap:8,alignItems:"end"}}>
        <div><label style={{fontSize:FS-2,color:T.textSec,fontWeight:600}}>ارسال الى</label><Sel value={taskTo} onChange={setTaskTo}><option value="">-- اختر مستخدم --</option>{allowedTargets.map(u=><option key={u.email} value={u.email}>{(u.name||u.email.split("@")[0])+(u.email===userEmail?" (أنا)":"")+" — "+(u.role==="admin"?"مدير النظام":u.role==="manager"?"مدير انتاج":"مشاهد")}</option>)}</Sel></div>
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

function SettingsPg({config,upConfig,isMob,user,theme,setTheme,season,orders,syncWsIds,replaceOrder}){
  const[newSeason,setNewSeason]=useState("");const[delConfirm,setDelConfirm]=useState("");
  const[newUserEmail,setNewUserEmail]=useState("");const[newUserRole,setNewUserRole]=useState("viewer");
  const[newUserName,setNewUserName]=useState("");const[newUserPass,setNewUserPass]=useState("");const[newUserPass2,setNewUserPass2]=useState("");
  const[createErr,setCreateErr]=useState("");const[createOk,setCreateOk]=useState("");const[creating,setCreating]=useState(false);
  const[clearConfirm,setClearConfirm]=useState(false);
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
    {pendingAction&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",direction:"rtl"}} onClick={()=>{setPendingAction(null);setAdminPass("");setPassErr("")}}>
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
        <div style={{position:"relative"}}><Btn onClick={()=>{}} style={{background:T.warn+"12",color:T.warn,border:"1px solid "+T.warn+"30"}}>📤 استيراد</Btn><input type="file" accept=".json" onChange={e=>{const f=e.target.files[0];if(!f)return;requirePass(()=>{const reader=new FileReader();reader.onload=async ev=>{try{const d=JSON.parse(ev.target.result);if(d.config){await setDoc(doc(db,"factory","config"),d.config)}if(d.orders&&d.season){for(const o of d.orders){const{_docId,...rest}=o;await addDoc(collection(db,"seasons",d.season,"orders"),rest)}}alert("تم استيراد النسخة الاحتياطية بنجاح")}catch(err){alert("خطأ في الملف: "+err.message)}};reader.readAsText(f)});e.target.value=""}} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/></div>
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
          <div><label style={{fontSize:FS-2,color:T.textSec,whiteSpace:"nowrap",fontWeight:600}}>الصلاحية</label><Sel value={newUserRole} onChange={setNewUserRole}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="viewer">مشاهد فقط</option></Sel></div>
        </div>
        {createErr&&<div style={{color:T.err,fontSize:FS,marginBottom:10,fontWeight:600}}>{"⚠️ "+createErr}</div>}
        {createOk&&<div style={{color:T.ok,fontSize:FS,marginBottom:10,fontWeight:600}}>{"✓ "+createOk}</div>}
        <Btn primary onClick={createUser} disabled={creating}>{creating?"جاري الانشاء...":"انشاء الحساب"}</Btn>
      </div>
      {/* Existing users */}
      <div style={{fontSize:FS,fontWeight:700,color:T.text,marginBottom:10}}>المستخدمين الحاليين</div>
      {(config.usersList||[]).length>0&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}><thead><tr>{["الاسم","البريد","الصلاحية",""].map(h=><th key={h} style={TH}>{h}</th>)}</tr></thead><tbody>
        {(config.usersList||[]).map((u,i)=><tr key={i}><td style={{...TD,fontWeight:600}}>{u.name||"-"}</td><td style={TD}>{u.email}</td><td style={TD}><Sel value={u.role} onChange={v=>requirePass(()=>upConfig(d=>{const x=(d.usersList||[]).find(z=>z.email===u.email);if(x)x.role=v}))}><option value="admin">مدير النظام</option><option value="manager">مدير انتاج</option><option value="viewer">مشاهد فقط</option></Sel></td><td style={TD}>{(()=>{const hasTasks=(Array.isArray(config.tasks)?config.tasks:[]).some(t=>t.toEmail===u.email&&!t.done);return<DelBtn onConfirm={()=>requirePass(()=>upConfig(d=>{d.usersList=(d.usersList||[]).filter(x=>x.email!==u.email)}))} blocked={hasTasks?"لديه مهام مفتوحة":null}/>})()}</td></tr>)}
      </tbody></table></div>}
      {(config.usersList||[]).length===0&&<div style={{textAlign:"center",padding:20,color:T.textSec}}>لم يتم اضافة مستخدمين</div>}
      <div style={{marginTop:16,display:"grid",gridTemplateColumns:isMob?"1fr":"repeat(3,1fr)",gap:12}}>
        {[["مدير النظام",T.accent,"كل الصلاحيات + اعدادات"],["مدير انتاج",T.ok,"اضافة وتعديل"],["مشاهد",T.warn,"عرض فقط"]].map(([n,c,d])=><div key={n} style={{padding:14,borderRadius:12,background:c+"08",border:"1px solid "+c+"25"}}><div style={{fontSize:FS,fontWeight:700,color:c,marginBottom:4}}>{n}</div><div style={{fontSize:FS-2,color:T.textSec}}>{d}</div></div>)}
      </div>
    </Card>
    {/* Send Notifications */}
    {/* Permissions Management */}
    <Card title="🔐 صلاحيات المستخدمين" style={{marginBottom:16}}>
      {(()=>{
        const perms=config.permissions||{};
        const roles=["admin","manager","viewer"];
        const roleLabels={admin:"أدمن",manager:"مدير",viewer:"مشاهد"};
        const tabs=TABS;
        const levels=["edit","view","hide"];
        const levelLabels={edit:"✏️ تعديل",view:"👁 عرض",hide:"❌ مخفي"};
        const levelColors={edit:T.ok,view:T.warn,hide:T.err};
        const setPerm=(role,tabKey,level)=>upConfig(d=>{if(!d.permissions)d.permissions={};if(!d.permissions[role])d.permissions[role]={};d.permissions[role][tabKey]=level});
        return<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:500}}>
          <thead><tr><th style={TH}>الشاشة</th>{roles.map(r=><th key={r} style={{...TH,textAlign:"center"}}>{roleLabels[r]}</th>)}</tr></thead>
          <tbody>{tabs.map(t=><tr key={t.key}>
            <td style={{...TD,fontWeight:600}}><span style={{marginLeft:6}}>{t.icon}</span>{t.label}</td>
            {roles.map(r=>{const defPerms={admin:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"edit"},manager:{dashboard:"edit",details:"edit",external:"edit",stock:"edit",reports:"edit",calc:"edit",tasks:"edit",db:"edit",settings:"hide"},viewer:{dashboard:"view",details:"view",external:"hide",stock:"hide",reports:"view",calc:"view",tasks:"edit",db:"hide",settings:"hide"}};const cur=(perms[r]||{})[t.key]||(defPerms[r]||{})[t.key]||"view";
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
        });
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
        const doBackup=()=>{const backup={config,orders:orders.map(o=>{const c={...o};delete c._docId;return c}),exportDate:new Date().toISOString(),season};const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="CLARK_backup_"+season+"_"+new Date().toISOString().split("T")[0]+".json";a.click();URL.revokeObjectURL(url);showToast("✓ تم تنزيل النسخة الاحتياطية")};
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
            <div style={{fontSize:FS,fontWeight:700,color:T.err,marginBottom:8}}>{"🔍 مشاكل في البيانات ("+issues.length+")"}</div>
            {issues.slice(0,10).map((iss,i)=><div key={i} style={{fontSize:FS-2,padding:"4px 0",color:iss.sev==="err"?T.err:T.warn}}>{"• "+(iss.no||"—")+" — "+iss.msg}</div>)}
            {issues.length>10&&<div style={{fontSize:FS-3,color:T.textMut}}>{"و "+( issues.length-10)+" مشكلة أخرى..."}</div>}
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
  </div>
}
