var Ac=Object.defineProperty;var Cc=(s,t,e)=>t in s?Ac(s,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):s[t]=e;var L=(s,t,e)=>Cc(s,typeof t!="symbol"?t+"":t,e);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))n(i);new MutationObserver(i=>{for(const r of i)if(r.type==="childList")for(const o of r.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&n(o)}).observe(document,{childList:!0,subtree:!0});function e(i){const r={};return i.integrity&&(r.integrity=i.integrity),i.referrerPolicy&&(r.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?r.credentials="include":i.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(i){if(i.ep)return;i.ep=!0;const r=e(i);fetch(i.href,r)}})();const Rc=64,Pc=.55;function na(s,t){const e=Math.pow(Rc/Math.max(8,s),Pc);return Math.max(250,Math.min(2e3,t*e))}class Ml{constructor(t){L(this,"nx");L(this,"ny");L(this,"nz");L(this,"zTop");L(this,"xExtent");L(this,"yExtent");L(this,"xyExtent");L(this,"dx");L(this,"dy");L(this,"dz");L(this,"n");L(this,"nu");L(this,"nv");L(this,"nw");this.nx=Math.max(8,Math.floor(t.nx)),this.ny=Math.max(8,Math.floor(t.ny)),this.nz=Math.max(8,Math.floor(t.nz)),this.zTop=Math.max(2e3,t.zTop);const e=Math.max(200,t.dxMeters??1e3);this.dx=na(this.nx,e),this.dy=na(this.ny,e),this.xExtent=this.nx*this.dx,this.yExtent=this.ny*this.dy,this.xyExtent=Math.max(this.xExtent,this.yExtent),this.dz=this.zTop/this.nz,this.n=this.nx*this.ny*this.nz,this.nu=(this.nx+1)*this.ny*this.nz,this.nv=this.nx*(this.ny+1)*this.nz,this.nw=this.nx*this.ny*(this.nz+1)}idx(t,e,n){return t+this.nx*(e+this.ny*n)}uIdx(t,e,n){return t+(this.nx+1)*(e+this.ny*n)}vIdx(t,e,n){return t+this.nx*(e+(this.ny+1)*n)}wIdx(t,e,n){return t+this.nx*(e+this.ny*n)}cellCount(){return this.n}estimateBytes(){return(this.n*5+this.nu+this.nv+this.nw+this.nz*7)*4}uCenter(t,e,n,i){return .5*(t[this.uIdx(e,n,i)]+t[this.uIdx(e+1,n,i)])}vCenter(t,e,n,i){return .5*(t[this.vIdx(e,n,i)]+t[this.vIdx(e,n+1,i)])}wCenter(t,e,n,i){return .5*(t[this.wIdx(e,n,i)]+t[this.wIdx(e,n,i+1)])}}const Lc=128,Dc=128,Ic=48;function To(s,t,e){const n=Math.max(1,Math.ceil(s/Lc)),i=Math.max(1,Math.ceil(t/Dc)),r=Math.max(1,Math.ceil(e/Ic));return{sx:n,sy:i,sz:r,nx:Math.ceil(s/n),ny:Math.ceil(t/i),nz:Math.ceil(e/r)}}function Uc(s,t,e,n,i){const r=To(t,e,n),o=r.nx*r.ny*r.nz*4;if(!(i.length<o||s.length<t*e*n*4)){if(r.sx===1&&r.sy===1&&r.sz===1){i.set(s.subarray(0,o));return}for(let a=0;a<r.nz;a++){const c=Math.min(n-1,a*r.sz);for(let l=0;l<r.ny;l++){const u=Math.min(e-1,l*r.sy);for(let p=0;p<r.nx;p++){const h=(Math.min(t-1,p*r.sx)+t*(u+e*c))*4,g=(p+r.nx*(l+r.ny*a))*4;i[g]=s[h],i[g+1]=s[h+1],i[g+2]=s[h+2],i[g+3]=s[h+3]}}}}}function Nc(s){const t=s.cellCount();return t>512*512*64?`Very high resolution (${t.toLocaleString()} cells). Expect heavy CPU load — try ≤128×128×48 for interactive rates.`:t>9216*48?`High resolution (${t.toLocaleString()} cells). Simulation may run slowly on some machines.`:null}const bi=512*1024*1024;function Ts(s,t,e,n){const i=s*t*e*4,r=s*t*4;return Math.max(0,n)*(i+r)}function Ks(s,t){const e=Math.max(1,s),n=Math.max(.5,t);return Math.floor(e/n)+1}class Fc{constructor(t,e,n){L(this,"nx");L(this,"ny");L(this,"nz");L(this,"frames",[]);this.nx=t,this.ny=e,this.nz=n}get length(){return this.frames.length}clear(){this.frames=[]}push(t){this.frames.push(t)}get(t){return t<0||t>=this.frames.length?null:this.frames[t]}last(){return this.frames.length?this.frames[this.frames.length-1]:null}bytesUsed(){return Ts(this.nx,this.ny,this.nz,this.frames.length)}}const Dr=1;function kc(){return new Promise(s=>{requestAnimationFrame(()=>s())})}async function Oc(s,t){var d,h,g,v;const e=Math.max(1,t.durationSec),n=Math.max(.5,t.outputIntervalSec),i=Math.max(.25,t.fixedDt),{nx:r,ny:o,nz:a}=s.grid,c=new Fc(r,o,a),l=()=>{const m=new Uint8Array(r*o*a*4),f=new Uint8Array(r*o*4);s.packVolumeRGBA(m),s.packMapProduct("refl",f),c.push({t:s.time,solarHour:s.radiation.solarHour,volume:m,radar:f})};l();let u=n;for((d=t.onProgress)==null||d.call(t,{frac:0,t:s.time,frames:c.length,message:"Recording…"});s.time<e-1e-6;){if((h=t.shouldCancel)!=null&&h.call(t))throw new Error("Batch cancelled");const m=performance.now()+20;for(;performance.now()<m&&s.time<e-1e-6;){const _=e-s.time;for(s.step(Math.min(i,_));u<=e+1e-6&&s.time+1e-6>=u;)l(),u+=n}const f=Math.min(1,s.time/e);(g=t.onProgress)==null||g.call(t,{frac:f,t:s.time,frames:c.length,message:`Integrating t=${s.time.toFixed(0)}s / ${e.toFixed(0)}s`}),await kc()}const p=c.last();return(!p||s.time-p.t>.05)&&l(),(v=t.onProgress)==null||v.call(t,{frac:1,t:s.time,frames:c.length,message:"Done"}),c}const Ao=287.05,Co=1004,Bc=25e5,yl=9.81,Vs=1e5;function li(s){const t=s-273.15;return 611.2*Math.exp(17.67*t/(t+243.5))}const Ro=180,zc=360,Po=.25,Ns=Math.round((zc-Ro)/Po)+1,ni=new Float32Array(Ns);for(let s=0;s<Ns;s++)ni[s]=li(Ro+s*Po);function Wi(s){const t=(s-Ro)/Po,e=Math.floor(t);if(e<=0)return ni[0];if(e>=Ns-1)return ni[Ns-1];const n=t-e;return ni[e]+(ni[e+1]-ni[e])*n}function Sl(s){return Math.pow(Math.max(s,1)/Vs,Ao/Co)}function Nn(s,t){return .622*s/Math.max(t-s,1)}function Gs(s,t){return Nn(li(s),t)}function Fn(s){const t=Math.log(Math.max(s,1)/611.2);return 243.5*t/(17.67-t)}function Lo(s){return 611.2*Math.exp(17.67*s/(s+243.5))}function Hc(s,t){return s*Math.pow(Vs/Math.max(t,1),Ao/Co)}function on(s,t){return s*Sl(t)}function si(s,t,e=288){const n=Ao*e/yl;return Vs*Math.exp(-s/n)*(1-.05*(s/Math.max(t,1)))}function Oi(s,t){const e=Math.hypot(s,t);if(e<1e-6)return{spd:0,dir:0};let n=Math.atan2(-s,-t)*180/Math.PI;return n<0&&(n+=360),{spd:e,dir:n}}function Bi(s,t){const e=t*Math.PI/180,n=Math.max(0,s);return{u:-n*Math.sin(e),v:-n*Math.cos(e)}}function vn(s,t=40){const e=[];for(let n=0;n<t;n++){const i=n/(t-1)*s,r=si(i,s);let o=302-.0085*i;i>11e3&&(o=215+.001*(i-11e3));let a=o-273.15-.8;i>1500&&(a=18-.006*(i-1500)),i>5e3&&(a=-8-.0035*(i-5e3)),i>9e3&&(a=-28-.002*(i-9e3));const c=a+273.15,l=5+.002*i,u=2+5e-4*i;e.push({z:i,p:r,T:o,Td:c,u:l,v:u})}return e}function bl(s,t){if(s.length===0)return{z:t,p:Vs,T:288,Td:280,u:0,v:0};if(t<=s[0].z)return{...s[0],z:t};if(t>=s[s.length-1].z)return{...s[s.length-1],z:t};let e=0;for(;e<s.length-1&&s[e+1].z<t;)e++;const n=s[e],i=s[e+1],r=(t-n.z)/Math.max(i.z-n.z,1e-6),o=(a,c)=>a+(c-a)*r;return{z:t,p:o(n.p,i.p),T:o(n.T,i.T),Td:o(n.Td,i.Td),u:o(n.u,i.u),v:o(n.v,i.v)}}const El=287.05,wl=1004,Zs=25e5,Vc=461.5,Ki=El/wl,Ui=1e5;function Gc(s,t){return Math.max(0,125*(s-t))}function Wc(s,t){const e=Wi(Math.max(180,s)),n=.622*e/Math.max(t-e,1),i=9.81*(1+Zs*n/(El*Math.max(s,1))),r=wl+Zs*Zs*n/(Vc*Math.max(s,1)*Math.max(s,1)),o=i/Math.max(r,1);return Math.min(.0098,Math.max(.002,o))}function qc(s,t,e,n){if(e<1)return Ui;if(n<=s[0])return t[0];for(let i=1;i<e;i++)if(s[i]>=n){const r=Math.max(s[i]-s[i-1],.001),o=(n-s[i-1])/r;return t[i-1]+(t[i]-t[i-1])*o}return t[e-1]}function Tl(s,t,e,n,i,r){if(i<3)return{tSfcC:0,tdSfcC:0,cape:0,cin:0,lclM:0};const o=e[0],a=Math.min(n[0],o),c=o-273.15,l=a-273.15,u=Math.min(r*.9,Gc(c,l)),p=Lo(l),d=Nn(p,Math.max(t[0],1)),h=o*Math.pow(Ui/Math.max(t[0],1),Ki),g=qc(s,t,i,u);let v=0,m=0,f=!1,_=h*Math.pow(Math.max(g,1)/Ui,Ki),M=u;for(let x=1;x<i;x++){const A=s[x]-s[x-1];if(A<=0)continue;const w=.5*(s[x-1]+s[x]),T=.5*(t[x-1]+t[x]),P=.5*(e[x-1]+e[x]);let S;if(w<u)S=h*Math.pow(Math.max(T,1)/Ui,Ki);else{const C=w-M;if(C>0){const D=Math.max(.0068,Wc(_,T));_-=D*C,M=w}S=_;const I=Nn(Wi(Math.max(180,S)),T);d<I*.45&&(S=h*Math.pow(Math.max(T,1)/Ui,Ki))}const y=9.81*((S-P)/Math.max(P,1));y>0?(f=!0,v+=y*A):!f&&w<u+6e3&&(m+=-y*A)}return{tSfcC:c,tdSfcC:l,cape:Math.max(0,v),cin:Math.max(0,m),lclM:u}}function Xc(s,t){if(s.length<3)return{tSfcC:0,tdSfcC:0,cape:0,cin:0,lclM:0};const e=[...s].sort((c,l)=>c.z-l.z),n=e.length,i=new Float64Array(n),r=new Float64Array(n),o=new Float64Array(n),a=new Float64Array(n);for(let c=0;c<n;c++)i[c]=e[c].z,r[c]=e[c].p,o[c]=e[c].T,a[c]=e[c].Td;return Tl(i,r,o,a,n,t)}function Ni(s){return s===void 0||!Number.isFinite(s)?!0:Math.abs(s)>=900&&Math.abs(s)<1e6&&Number.isInteger(Math.abs(s))}function ia(s){return s===void 0||!Number.isFinite(s)?!0:Math.abs(s)>=9e3}function Yc(s,t){const n=s.replace(/^\uFEFF/,"").replace(/\r\n/g,`
`).split(`
`).map(h=>h.trim()).filter(h=>h.length>0),i=$c(n,t);if(i)return i;let r=n;const o=n.findIndex(h=>/^%RAW%/i.test(h)),a=n.findIndex(h=>/^%END%/i.test(h));o>=0&&(r=n.slice(o+1,a>o?a:void 0));const c=n.some(h=>/\bPRES\b/i.test(h)&&/\bHGHT\b/i.test(h)&&/\bTEMP\b/i.test(h));r=r.filter(h=>!h.startsWith("#")&&!h.startsWith("%")&&!/^-{3,}/.test(h)&&!/^[A-Za-z_]/.test(h)&&!/^LEVEL\b/i.test(h)&&!/^hPa\b/i.test(h));const l=[];for(const h of r){const g=h.split(/[,\s\t]+/).map(v=>v.trim()).filter(v=>v.length>0).map(v=>Number(v));g.length<4||g.some(v=>Number.isNaN(v))||l.push(g)}if(l.length<3)return{ok:!1,message:"Need at least 3 numeric levels. Try SHARPpy, Extra, SPC, CM1 input_sounding, or Stormforge CSV.",levels:[],format:"unknown"};const u=Kc(l,c||o>=0),p=(u==="sharppy"||u==="spc")&&jc(l,u),d=[];for(const h of l){let g,v,m,f,_=0,M=0;if(u==="sharppy"){v=h[0]*(h[0]>0&&h[0]<1200?100:1),g=h[1],m=h[2],f=h[3];const w=Ni(h[4])?0:h[4]??0;let T=Ni(h[5])?0:h[5]??0;p&&(T*=.514444);const P=Bi(T,w);_=P.u,M=P.v}else if(u==="spc"){v=h[0]*(h[0]>0&&h[0]<1200?100:1),g=h[1],m=h[2],f=h[3];const w=Ni(h[6])?0:h[6]??0;let T=Ni(h[7])?0:h[7]??0;p&&(T*=.514444);const P=Bi(T,w);_=P.u,M=P.v}else if(u==="extra"){g=h[0],v=h[1],m=h[2],f=h[4],v>0&&v<1200&&(v*=100);let w=h[6]??0;const T=h[7]??0;w>80&&(w=w/3.6);const P=Bi(w,T);_=P.u,M=P.v,g>0&&g<40&&t>1e3&&(g*=1e3)}else g=h[0],v=h[1],m=h[2],f=h[3],_=h.length>4?h[h.length-2]:0,M=h.length>5?h[h.length-1]:0,v>0&&v<1200&&(v*=100),g>0&&g<40&&t>1e3&&(g*=1e3);if(ia(m)||!Number.isFinite(g)||!(v>0))continue;let x=Math.abs(m)<200?m+273.15:m,A;ia(f)?A=x-20:A=Math.abs(f)<200?f+273.15:f,A>x&&(A=x),v>1e3&&v<12e4||(v=si(Math.max(0,g),t)),!(g<0)&&d.push({z:g,p:v,T:x,Td:A,u:_,v:M})}return d.length<3?{ok:!1,message:"Parsed fewer than 3 valid levels.",levels:[],format:u}:Al(d,u)}function $c(s,t){if(s.some(m=>/^%RAW%/i.test(m)))return null;const e=[];for(const m of s){if(m.startsWith("#")||/^[A-Za-z_%]/.test(m))continue;const f=m.split(/[,\s\t]+/).map(_=>Number(_.trim())).filter(_=>!Number.isNaN(_));f.length>=3&&e.push(f)}if(e.length<4)return null;const n=e[0],i=n[0],r=n[1],o=n[2];if(!(i>=50&&i<=1100&&r>=250&&r<=400)||!(o>=0&&o<=50))return null;const a=e.slice(1);if(a.filter(m=>m.length>=3&&m[0]>=0&&m[0]<=4e4&&m[1]>=250&&m[1]<=400&&m[2]>=0&&m[2]<=50).length<a.length*.75)return null;let l=0;for(let m=1;m<Math.min(a.length,8);m++)a[m][1]<a[m-1][1]-5&&l++;if(l>=3)return null;const u=[],p=i*100,d=o>1?o/1e3:o,h=on(r,p),g=Math.min(li(h)*.999,d*p/(.622+d)),v=Fn(g)+273.15;u.push({z:0,p,T:h,Td:Math.min(v,h),u:n[3]??0,v:n[4]??0});for(const m of a){const f=m[0],_=m[1];let M=m[2];M>1&&(M/=1e3);const x=m[3]??0,A=m[4]??0,w=si(f,t),T=on(_,w),P=Math.min(li(T)*.999,M*w/(.622+Math.max(M,1e-9))),S=Math.min(Fn(P)+273.15,T);f<0||!Number.isFinite(T)||u.push({z:f,p:w,T,Td:S,u:x,v:A})}return u.length<3?null:Al(u,"cm1")}function Al(s,t,e){s.sort((o,a)=>o.z-a.z);const n=s[0].z;if(n>50&&n<5e3)for(const o of s)o.z=Math.max(0,o.z-n);const i=[];for(const o of s){const a=i[i.length-1];a&&Math.abs(a.z-o.z)<1?i[i.length-1]=o:i.push(o)}const r=t==="sharppy"?"SHARPpy":t==="extra"?"Extra":t==="spc"?"SPC/UWYO":t==="cm1"?"CM1":"Stormforge";return{ok:!0,message:`Imported ${i.length} levels (${r}).`,levels:i,format:t}}function jc(s,t){let e=0;const n=t==="spc"?7:5;for(const i of s)i.length>n&&!Ni(i[n])&&(e=Math.max(e,i[n]));return e>80}function Kc(s,t){const e=s.slice(0,Math.min(10,s.length)),n=e.reduce((a,c)=>Math.max(a,c.length),0);if(n>=10){let a=0;for(const c of e){const l=c[0],u=c[1];l>=50&&l<=1100&&u>=0&&u<=4e4&&c.length>=8&&a++}if(a>=e.length*.6)return"spc"}if(n>=8){const a=e.every(l=>l.length===8||l.length===9);let c=0;for(const l of e)l.length>=8&&l[0]>=0&&l[0]<=4e4&&l[1]>=50&&l[1]<=1100&&c++;if(a&&c>=e.length*.6)return"extra";if((t||c<e.length*.4)&&e.filter(u=>u[0]>=50&&u[0]<=1100).length>=e.length*.7)return n>=10?"spc":"sharppy";if(c>=e.length*.6)return"extra"}let i=0,r=0;for(const a of e){const c=a[0],l=a[1],u=a[4];c>=50&&c<=1100&&l>=0&&l<=4e4&&(a.length>=6&&u>=0&&u<=360||t)&&i++,c>=0&&c<=4e4&&l>=50&&l<=1100&&r++}return i>=e.length*.6?"sharppy":r>=e.length*.6?"stormforge":e.filter(a=>a[0]>=50&&a[0]<=1100).length>=e.length*.7&&n<=7?"sharppy":"stormforge"}class Cl{constructor(t,e=12e3){L(this,"levels");L(this,"mode","T");L(this,"dragging",!1);L(this,"zTop");L(this,"metricsEl",null);L(this,"onChange",null);L(this,"tMinC",-40);L(this,"tMaxC",40);L(this,"skew",.55);L(this,"draw",()=>{const t=this.canvas.getContext("2d");if(!t)return;const{dpr:e,w:n,h:i,padL:r,padT:o,padB:a,thermoR:c,plotH:l}=this.layout();t.clearRect(0,0,n,i),t.fillStyle="#0a101c",t.fillRect(0,0,n,i),this.drawBackground(t),t.fillStyle="rgba(20, 32, 52, 0.9)",t.fillRect(c,0,n-c,i),t.strokeStyle="#2a3a55",t.beginPath(),t.moveTo(c,0),t.lineTo(c,i),t.stroke(),t.fillStyle="#7a8aa3",t.font=`${10*e}px sans-serif`,t.textAlign="left",t.fillText("Skew-T / log-P",r,14*e),t.fillText(this.mode==="T"?"editing T":"editing Td",r,26*e),t.fillText("Wind",c+8,14*e),t.fillText("(Hodograph)",c+8,26*e),t.fillStyle="#c4a070",t.font=`${9*e}px sans-serif`,t.textAlign="center";const u=this.pToY(this.pBot()),p=Math.ceil(this.tMinC/10)*10;for(let d=p;d<=this.tMaxC;d+=10){const h=this.tpToX(d+273.15,this.pBot());h<r||h>c-4||t.fillText(`${d}`,h,Math.min(i-4,u+14*e))}t.textAlign="left",t.fillStyle="#8a7a60",t.fillText("°C",r,i-6*e),this.strokeProfile(t,d=>d.Td,"#3ecf8e",2*e),this.strokeProfile(t,d=>d.T,"#ff8b5c",2.5*e),this.drawWindBarbs(t),this.refreshMetrics()});L(this,"onPointerDown",t=>{this.dragging=!0,this.canvas.setPointerCapture(t.pointerId),this.applyPointer(t)});L(this,"onPointerMove",t=>{this.dragging&&this.applyPointer(t)});L(this,"onPointerUp",()=>{this.dragging=!1});this.canvas=t,this.zTop=e,this.levels=vn(e,41),this.refitView(),this.resize(),this.draw(),t.addEventListener("pointerdown",this.onPointerDown),t.addEventListener("pointermove",this.onPointerMove),t.addEventListener("pointerup",this.onPointerUp),t.addEventListener("pointerleave",this.onPointerUp)}setMetricsElement(t){this.metricsEl=t,this.refreshMetrics()}setZTop(t){var n;this.zTop=t;const e=((n=this.levels[this.levels.length-1])==null?void 0:n.z)||t;for(const i of this.levels)i.z=i.z/Math.max(e,1)*t,i.p=si(i.z,t);this.refitView(),this.draw()}setMode(t){this.mode=t,this.draw()}getLevels(){return this.levels.map(t=>({...t}))}setLevels(t){var e;this.levels=t.map(n=>({...n})).sort((n,i)=>n.z-i.z),this.refitView(),this.draw(),(e=this.onChange)==null||e.call(this,this.getLevels())}resetDefault(){var t;this.levels=vn(this.zTop,41),this.refitView(),this.draw(),(t=this.onChange)==null||t.call(this,this.getLevels())}refitView(){if(!this.levels.length){this.tMinC=-40,this.tMaxC=40;return}let t=1/0,e=-1/0;for(const i of this.levels)t=Math.min(t,i.T-273.15,i.Td-273.15),e=Math.max(e,i.T-273.15,i.Td-273.15);if(!Number.isFinite(t)||!Number.isFinite(e)){this.tMinC=-40,this.tMaxC=40;return}t-=6,e+=8;const n=45;if(e-t<n){const i=.5*(t+e);t=i-n*.5,e=i+n*.5}this.tMinC=Math.max(-55,t),this.tMaxC=Math.min(48,e),this.tMaxC-this.tMinC<n&&(this.tMaxC=Math.min(48,this.tMinC+n),this.tMinC=this.tMaxC-n)}exportText(){const t=["alt_m,p_hPa,t_C,td_C,u,v"];for(const e of this.levels)t.push([e.z.toFixed(1),(e.p/100).toFixed(2),(e.T-273.15).toFixed(2),(e.Td-273.15).toFixed(2),e.u.toFixed(2),e.v.toFixed(2)].join(","));return t.join(`
`)}importText(t){const e=Yc(t,this.zTop);return e.ok?(this.setLevels(e.levels),{ok:!0,message:e.message}):{ok:!1,message:e.message}}resize(){if(this.canvas.classList.contains("hidden"))return;const t=this.canvas.getBoundingClientRect();if(t.width<2||t.height<2)return;const e=Math.min(window.devicePixelRatio||1,2),n=Math.max(1,Math.floor(t.width*e)),i=Math.max(1,Math.floor(t.height*e));(this.canvas.width!==n||this.canvas.height!==i)&&(this.canvas.width=n,this.canvas.height=i),this.draw()}layout(){const t=window.devicePixelRatio||1,e=this.canvas.width,n=this.canvas.height,i=28*t,r=4*t,o=18*t,a=24*t,c=Math.max(48*t,e*.16),l=e-c,u=Math.max(40,l-i-r),p=Math.max(40,n-o-a);return{dpr:t,w:e,h:n,padL:i,padR:r,padT:o,padB:a,windW:c,thermoR:l,plotW:u,plotH:p}}pBot(){var e;return(((e=this.levels[0])==null?void 0:e.p)??si(0,this.zTop))*1.02}pTop(){var e;const t=((e=this.levels[this.levels.length-1])==null?void 0:e.p)??si(this.zTop,this.zTop);return Math.max(t*.94,this.pBot()*.08)}pNorm(t){const e=this.pBot(),n=this.pTop(),i=Math.log(e),r=Math.log(n),o=Math.log(Math.max(n,Math.min(e,t)));return(i-o)/Math.max(1e-6,i-r)}pToY(t){const{padT:e,plotH:n}=this.layout();return e+(1-this.pNorm(t))*n}yToP(t){const{padT:e,plotH:n}=this.layout(),i=1-(t-e)/Math.max(1,n),r=this.pBot(),o=this.pTop(),a=Math.log(r)-i*(Math.log(r)-Math.log(o));return Math.exp(a)}tpToX(t,e){const{padL:n,plotW:i}=this.layout(),o=(t-273.15-this.tMinC)/Math.max(.001,this.tMaxC-this.tMinC);return n+o*i+this.skew*this.pNorm(e)*i}xToT(t,e){const{padL:n,plotW:i}=this.layout(),r=(t-n-this.skew*this.pNorm(e)*i)/Math.max(1,i);return this.tMinC+r*(this.tMaxC-this.tMinC)+273.15}drawBackground(t){const{dpr:e,padL:n,padT:i,plotH:r,thermoR:o}=this.layout(),a=this.pBot(),c=this.pTop();t.save(),t.beginPath(),t.rect(n,i,o-n,r),t.clip();const l=[1e3,925,850,700,600,500,400,300,250,200,150,100];t.strokeStyle="#1a283c",t.lineWidth=1*e,t.font=`${9*e}px sans-serif`,t.fillStyle="#5a6a82",t.textAlign="left";for(const p of l){const d=p*100;if(d>a||d<c)continue;const h=this.pToY(d);t.beginPath(),t.moveTo(n,h),t.lineTo(o,h),t.stroke(),p>=150&&t.fillText(`${p}`,n+2,h-3*e)}t.setLineDash([4*e,4*e]),t.strokeStyle="rgba(40, 140, 70, 0.45)",t.lineWidth=1*e;for(const p of[.4,1,2,3,5,8,12,16,20])this.traceBackground(t,d=>this.tempFromMixingRatioGkg(p,d/100)+273.15);t.setLineDash([]),t.strokeStyle="rgba(200, 70, 55, 0.35)",t.lineWidth=1*e;for(let p=240;p<=380;p+=10)this.traceBackground(t,d=>on(p,d));t.setLineDash([5*e,4*e]),t.strokeStyle="rgba(50, 180, 90, 0.4)";for(const p of[32,24,16,8,0,-8])this.traceMoistAdiabat(t,p);t.setLineDash([]),t.strokeStyle="rgba(255, 150, 60, 0.5)",t.lineWidth=1*e;const u=Math.floor(this.tMinC/10)*10;for(let p=u;p<=this.tMaxC+20;p+=10)this.traceBackground(t,()=>p+273.15);t.strokeStyle="rgba(255, 160, 70, 0.9)",t.lineWidth=1.5*e,this.traceBackground(t,()=>273.15),t.restore()}traceBackground(t,e){const{padL:n,thermoR:i}=this.layout(),r=this.pBot(),o=this.pTop(),a=48;t.beginPath();let c=!1;for(let l=0;l<=a;l++){const u=l/a,p=Math.log(r)-u*(Math.log(r)-Math.log(o)),d=Math.exp(p),h=e(d);if(!Number.isFinite(h))continue;const g=this.tpToX(h,d),v=this.pToY(d);if(g<n-20||g>i+20){c=!1;continue}c?t.lineTo(g,v):(t.moveTo(g,v),c=!0)}c&&t.stroke()}traceMoistAdiabat(t,e){const{padL:n,thermoR:i}=this.layout(),r=this.pBot(),o=this.pTop(),a=this.mixingRatioFromDewpoint(e,r/100);let c=e+273.15,l=!1;const u=56;t.beginPath();let p=!1;for(let d=0;d<=u;d++){const h=d/u,g=Math.log(r)-h*(Math.log(r)-Math.log(o)),v=Math.exp(g);if(d>0){const _=Math.log(r)-(d-1)/u*(Math.log(r)-Math.log(o)),M=Math.exp(_),x=Math.log(v)-Math.log(M),A=-287.05*c*x/9.81;if(l)c-=this.moistLapseKperM(c,v)*A;else{c-=.0098*A;const w=this.dewpointFromMixingRatio(a,v/100)+273.15;c<=w&&(l=!0,c=w)}}const m=this.tpToX(c,v),f=this.pToY(v);if(m<n-30||m>i+30){p=!1;continue}p?t.lineTo(m,f):(t.moveTo(m,f),p=!0)}p&&t.stroke()}moistLapseKperM(t,e){const n=Math.max(1e-6,.622*li(t)/Math.max(e-li(t),1)),i=9.81*(1+25e5*n/(287.05*t)),r=1004+25e5*25e5*n*.622/(287.05*t*t);return i/r}mixingRatioFromDewpoint(t,e){const n=Lo(t),i=e*100;return .622*n/Math.max(i-n,1)}dewpointFromMixingRatio(t,e){const n=e*100,i=t*n/(.622+t);return Fn(Math.max(1,i))}tempFromMixingRatioGkg(t,e){const n=t/1e3;let i=-80,r=40;for(let o=0;o<24;o++){const a=.5*(i+r);this.mixingRatioFromDewpoint(a,e)>n?r=a:i=a}return .5*(i+r)}refreshMetrics(){if(!this.metricsEl)return;const t=Xc(this.levels,this.zTop),e=t.cape>=2e3?"hot":t.cape>=1e3?"warm":"ok",n=t.cin>=50?"warn":"ok";this.metricsEl.innerHTML=`
      <div class="metric"><span class="k">T</span><span class="v">${t.tSfcC.toFixed(1)}°C</span></div>
      <div class="metric"><span class="k">Td</span><span class="v">${t.tdSfcC.toFixed(1)}°C</span></div>
      <div class="metric"><span class="k">CAPE</span><span class="v ${e}">${Math.round(t.cape)}</span><span class="u">J/kg</span></div>
      <div class="metric"><span class="k">CINH</span><span class="v ${n}">${Math.round(t.cin)}</span><span class="u">J/kg</span></div>
      <div class="metric"><span class="k">LCL</span><span class="v">${(t.lclM/1e3).toFixed(2)}</span><span class="u">km</span></div>
    `}strokeProfile(t,e,n,i){const{padL:r,thermoR:o}=this.layout();t.strokeStyle=n,t.lineWidth=i,t.beginPath();let a=!1;for(const c of this.levels){const l=this.tpToX(e(c),c.p),u=this.pToY(c.p);l<r-40||l>o+40||(a?t.lineTo(l,u):(t.moveTo(l,u),a=!0))}a&&t.stroke()}drawWindBarbs(t){const{dpr:e,w:n,thermoR:i}=this.layout(),r=(i+n-10)/2,o=Math.max(1,Math.floor(this.levels.length/16));for(let c=0;c<this.levels.length;c+=o){const l=this.levels[c],{spd:u,dir:p}=Oi(l.u,l.v),d=this.pToY(l.p);this.drawBarb(t,r,d,u,p,e)}const a=this.levels[Math.floor(this.levels.length/4)];if(a){const{spd:c,dir:l}=Oi(a.u,a.v);t.fillStyle="#9aabc4",t.font=`${10*e}px sans-serif`,t.textAlign="left",t.fillText(`${c.toFixed(0)} m/s  ${l.toFixed(0)}°`,i+4,this.canvas.height-8)}}drawBarb(t,e,n,i,r,o){const a=14*o,c=r*Math.PI/180,l=Math.sin(c)*a,u=-Math.cos(c)*a;t.strokeStyle="#c5d4ea",t.fillStyle="#c5d4ea",t.lineWidth=1.5*o,t.beginPath(),t.moveTo(e,n),t.lineTo(e+l,n+u),t.stroke();const p=Math.min(8,Math.round(i/5));for(let d=0;d<p;d++){const h=.35+d*.12,g=e+l*h,v=n+u*h,m=-u*.35,f=l*.35;t.beginPath(),t.moveTo(g,v),t.lineTo(g+m,v+f),t.stroke()}t.beginPath(),t.arc(e,n,1.6*o,0,Math.PI*2),t.fill()}nearestIndexByP(t){let e=0,n=1/0;for(let i=0;i<this.levels.length;i++){const r=Math.abs(Math.log(this.levels[i].p)-Math.log(t));r<n&&(n=r,e=i)}return e}applyPointer(t){var u;const e=this.canvas.getBoundingClientRect(),n=this.canvas.width/Math.max(1,e.width),i=(t.clientX-e.left)*n,r=(t.clientY-e.top)*n,{thermoR:o}=this.layout();if(i>o)return;const a=this.yToP(r),c=this.nearestIndexByP(a),l=this.xToT(i,this.levels[c].p);this.mode==="T"?(this.levels[c].T=Math.max(180,Math.min(320,l)),this.levels[c].Td>this.levels[c].T&&(this.levels[c].Td=this.levels[c].T)):this.levels[c].Td=Math.max(180,Math.min(this.levels[c].T,l));for(const p of[c-1,c+1])p<0||p>=this.levels.length||(this.mode==="T"?this.levels[p].T=this.levels[p].T*.7+this.levels[c].T*.3:this.levels[p].Td=this.levels[p].Td*.7+this.levels[c].Td*.3);this.draw(),(u=this.onChange)==null||u.call(this,this.getLevels())}dispose(){this.canvas.removeEventListener("pointerdown",this.onPointerDown),this.canvas.removeEventListener("pointermove",this.onPointerMove),this.canvas.removeEventListener("pointerup",this.onPointerUp),this.canvas.removeEventListener("pointerleave",this.onPointerUp)}}class Rl{constructor(t,e=12e3){L(this,"levels");L(this,"handles",[]);L(this,"dragging",!1);L(this,"dragIndex",-1);L(this,"hoverIndex",-1);L(this,"selectedIndex",0);L(this,"maxSpd",40);L(this,"onChange",null);L(this,"draw",()=>{const t=this.canvas.getContext("2d");if(!t)return;const e=this.canvas.width,n=this.canvas.height;if(e<2||n<2)return;const{listW:i,footerH:r,cx:o,cy:a,r:c,dpr:l}=this.layout();if(!(c>1))return;t.clearRect(0,0,e,n),t.fillStyle="#0a101c",t.fillRect(0,0,e,n),t.fillStyle="#121a2b",t.fillRect(0,0,i,n-r),t.fillStyle="#7a8aa3",t.font=`${10*l}px sans-serif`,t.textAlign="left",t.fillText("Height",8*l,16*l);const u=(n-r-28*l)/Math.max(1,this.handles.length);this.handles.forEach((d,h)=>{const g=24*l+h*u;(h===this.selectedIndex||h===this.hoverIndex)&&(t.fillStyle=h===this.selectedIndex?"rgba(77,184,255,0.22)":"rgba(77,184,255,0.10)",t.fillRect(0,g,i,u)),t.fillStyle=this.heightColor(d.z),t.beginPath(),t.arc(12*l,g+u*.5,4*l,0,Math.PI*2),t.fill(),t.fillStyle="#e8eef8",t.font=`${11*l}px sans-serif`,t.fillText(d.label,22*l,g+u*.5+4*l)}),t.fillStyle="#0d1524",t.fillRect(i,0,e-i,n-r),t.textAlign="center";for(let d=10;d<=this.maxSpd;d+=10){const h=d/this.maxSpd*c;t.strokeStyle=d%20===0?"#2a3a55":"#1c2a40",t.lineWidth=d%20===0?1.5*l:1*l,t.beginPath(),t.arc(o,a,h,0,Math.PI*2),t.stroke(),t.fillStyle="#6a7a93",t.font=`${9*l}px sans-serif`,t.fillText(`${d}`,o,a-h+11*l)}t.strokeStyle="#3a4a65",t.lineWidth=1.25*l,t.beginPath(),t.moveTo(o-c,a),t.lineTo(o+c,a),t.moveTo(o,a-c),t.lineTo(o,a+c),t.stroke(),t.fillStyle="#c5d4ea",t.font=`bold ${12*l}px sans-serif`,t.fillText("N",o,a-c-8*l),t.fillText("S",o,a+c+14*l),t.fillText("W",o-c-12*l,a+4*l),t.fillText("E",o+c+12*l,a+4*l),this.handles.length&&(t.lineWidth=2.5*l,t.strokeStyle="#4db8ff",t.beginPath(),this.handles.forEach((d,h)=>{const g=this.uvToXY(d.u,d.v);h===0?t.moveTo(g.x,g.y):t.lineTo(g.x,g.y)}),t.stroke(),this.handles.forEach((d,h)=>{const g=this.uvToXY(d.u,d.v),v=h===this.selectedIndex,m=h===this.hoverIndex,f=(v?9:m?8:6.5)*l;t.beginPath(),t.arc(g.x,g.y,f+3*l,0,Math.PI*2),t.fillStyle=v?"rgba(77,184,255,0.35)":"transparent",t.fill(),t.fillStyle=this.heightColor(d.z),t.beginPath(),t.arc(g.x,g.y,f,0,Math.PI*2),t.fill(),t.strokeStyle=v?"#ffffff":"#0a101c",t.lineWidth=v?2*l:1.25*l,t.stroke()})),t.fillStyle="#121a2b",t.fillRect(0,n-r,e,r),t.strokeStyle="#2a3a55",t.beginPath(),t.moveTo(0,n-r),t.lineTo(e,n-r),t.stroke();const p=this.handles[this.selectedIndex]??this.handles[0];if(p){const{spd:d,dir:h}=Oi(p.u,p.v),g=(p.z/1e3).toFixed(p.z<1e3?2:1);t.fillStyle="#e8eef8",t.font=`bold ${13*l}px sans-serif`,t.textAlign="left",t.fillText(`${p.label}  ·  ${g} km  ·  ${d.toFixed(0)} m/s from ${h.toFixed(0)}°`,10*l,n-r*.55),t.fillStyle="#9aabc4",t.font=`${10*l}px sans-serif`,t.fillText("Click height → drag tip  ·  scroll = speed  ·  Apply when done",10*l,n-r*.22)}});L(this,"onPointerDown",t=>{const{x:e,y:n}=this.pointerXY(t),{listW:i,footerH:r}=this.layout();if(n>this.canvas.height-r)return;if(e<i){const l=this.hitListIndex(n);l>=0&&(this.selectedIndex=l,this.draw());return}const o=this.nearestHandle(e,n,20),c=this.nearestHandle(e,n,28)===this.selectedIndex?this.selectedIndex:o;c<0||(this.dragIndex=c,this.selectedIndex=c,this.dragging=!0,this.canvas.setPointerCapture(t.pointerId),this.applyDrag(e,n))});L(this,"onPointerMove",t=>{const{x:e,y:n}=this.pointerXY(t),{listW:i,footerH:r}=this.layout();if(this.dragging){this.applyDrag(e,n);return}let o=-1;n<this.canvas.height-r&&(e<i?o=this.hitListIndex(n):o=this.nearestHandle(e,n)),o!==this.hoverIndex&&(this.hoverIndex=o,this.canvas.style.cursor=o>=0?"grab":"default",this.draw())});L(this,"onPointerUp",()=>{this.dragging=!1,this.dragIndex=-1,this.canvas.style.cursor=this.hoverIndex>=0?"grab":"default"});L(this,"onPointerLeave",()=>{this.dragging=!1,this.dragIndex=-1,this.hoverIndex=-1,this.canvas.style.cursor="default",this.draw()});L(this,"onWheel",t=>{var c;t.preventDefault();const e=this.selectedIndex,n=this.handles[e];if(!n)return;const{spd:i,dir:r}=Oi(n.u,n.v),o=Math.max(0,Math.min(this.maxSpd,i-Math.sign(t.deltaY))),a=Bi(o,r||270);n.u=a.u,n.v=a.v,this.autoscale(),this.applyHandlesToLevels(),this.draw(),(c=this.onChange)==null||c.call(this,this.getLevels())});this.canvas=t,this.zTop=e,this.levels=vn(e,41),this.rebuildHandlesFromLevels(),this.resize(),this.draw(),t.addEventListener("pointerdown",this.onPointerDown),t.addEventListener("pointermove",this.onPointerMove),t.addEventListener("pointerup",this.onPointerUp),t.addEventListener("pointerleave",this.onPointerLeave),t.addEventListener("wheel",this.onWheel,{passive:!1})}setZTop(t){this.zTop=t,this.rebuildHandlesFromLevels(),this.draw()}getLevels(){return this.levels.map(t=>({...t}))}setLevels(t){var e;this.levels=t.map(n=>({...n})).sort((n,i)=>n.z-i.z),this.rebuildHandlesFromLevels(),this.draw(),(e=this.onChange)==null||e.call(this,this.getLevels())}resetDefault(){var t;this.levels=vn(this.zTop,41),this.rebuildHandlesFromLevels(),this.draw(),(t=this.onChange)==null||t.call(this,this.getLevels())}resize(){if(this.canvas.classList.contains("hidden"))return;const t=this.canvas.getBoundingClientRect();if(t.width<2||t.height<2)return;const e=Math.min(window.devicePixelRatio||1,2),n=Math.max(1,Math.floor(t.width*e)),i=Math.max(1,Math.floor(t.height*e));(this.canvas.width!==n||this.canvas.height!==i)&&(this.canvas.width=n,this.canvas.height=i),this.draw()}handleHeights(){const t=this.zTop,e=[{z:0,label:"Sfc"},{z:1e3,label:"1 km"},{z:2e3,label:"2 km"},{z:3e3,label:"3 km"},{z:5e3,label:"5 km"},{z:7e3,label:"7 km"},{z:Math.min(1e4,t*.85),label:"10 km"},{z:t,label:"Top"}],n=[];for(const i of e)if(!(i.z>t+1)){if(n.length&&Math.abs(n[n.length-1].z-i.z)<200){n[n.length-1]={z:Math.min(i.z,t),label:i.label};continue}n.push({z:Math.min(i.z,t),label:i.label})}return n}rebuildHandlesFromLevels(){this.handles=this.handleHeights().map(({z:t,label:e})=>{const n=bl(this.levels,t);return{z:t,u:n.u,v:n.v,label:e}}),this.autoscale(),this.selectedIndex=Math.min(this.selectedIndex,Math.max(0,this.handles.length-1))}applyHandlesToLevels(){if(this.handles.length!==0)for(const t of this.levels){const e=t.z;if(e<=this.handles[0].z){t.u=this.handles[0].u,t.v=this.handles[0].v;continue}const n=this.handles[this.handles.length-1];if(e>=n.z){t.u=n.u,t.v=n.v;continue}let i=0;for(;i<this.handles.length-1&&this.handles[i+1].z<e;)i++;const r=this.handles[i],o=this.handles[i+1],a=(e-r.z)/Math.max(1e-6,o.z-r.z);t.u=r.u+(o.u-r.u)*a,t.v=r.v+(o.v-r.v)*a}}autoscale(){let t=25;for(const e of this.handles)t=Math.max(t,Math.hypot(e.u,e.v)*1.35);this.maxSpd=Math.min(60,Math.max(25,Math.ceil(t/5)*5))}layout(){const t=window.devicePixelRatio||1,e=72*t,n=52*t,i=e+(this.canvas.width-e)*.5,r=(this.canvas.height-n)*.52,o=Math.min(this.canvas.width-e,this.canvas.height-n)*.36;return{listW:e,footerH:n,cx:i,cy:r,r:o,dpr:t}}uvToXY(t,e){const{cx:n,cy:i,r}=this.layout();return{x:n+t/this.maxSpd*r,y:i-e/this.maxSpd*r}}xyToUV(t,e){const{cx:n,cy:i,r}=this.layout();let o=(t-n)/r*this.maxSpd,a=(i-e)/r*this.maxSpd;const{spd:c,dir:l}=Oi(o,a),u=Math.round(c);return Bi(Math.min(this.maxSpd,u),l)}heightColor(t){const e=Math.max(0,Math.min(1,t/Math.max(this.zTop,1))),n=Math.floor(255*(1-e)+90*e),i=Math.floor(150+30*Math.sin(e*Math.PI)),r=Math.floor(90*(1-e)+255*e);return`rgb(${n},${i},${r})`}nearestHandle(t,e,n=22){const i=window.devicePixelRatio||1,r=(n*i)**2;let o=-1,a=r;for(let c=0;c<this.handles.length;c++){const l=this.uvToXY(this.handles[c].u,this.handles[c].v),u=(l.x-t)**2+(l.y-e)**2;u<=a&&(a=u,o=c)}return o}hitListIndex(t){const{listW:e,footerH:n,dpr:i}=this.layout(),r=(this.canvas.height-n-28*i)/Math.max(1,this.handles.length),o=Math.floor((t-24*i)/r);return o<0||o>=this.handles.length?-1:o}pointerXY(t){const e=this.canvas.getBoundingClientRect(),n=this.canvas.width/Math.max(1,e.width);return{x:(t.clientX-e.left)*n,y:(t.clientY-e.top)*n}}applyDrag(t,e){var r;const n=this.dragIndex>=0?this.dragIndex:this.selectedIndex,i=this.xyToUV(t,e);this.handles[n].u=i.u,this.handles[n].v=i.v,this.selectedIndex=n,this.autoscale(),this.applyHandlesToLevels(),this.draw(),(r=this.onChange)==null||r.call(this,this.getLevels())}dispose(){this.canvas.removeEventListener("pointerdown",this.onPointerDown),this.canvas.removeEventListener("pointermove",this.onPointerMove),this.canvas.removeEventListener("pointerup",this.onPointerUp),this.canvas.removeEventListener("pointerleave",this.onPointerLeave),this.canvas.removeEventListener("wheel",this.onWheel)}}const Zc={cold:{dTheta:-7.5,qDrop:.58,depth:2200,wind:10,windDepth:1800,warmBump:1.35,converge:4,along:8},warm:{dTheta:3.2,qDrop:-.12,depth:2e3,wind:6,windDepth:1800,warmBump:0,converge:3,along:4},stationary:{dTheta:-4,qDrop:.32,depth:1800,wind:5,windDepth:1600,warmBump:.7,converge:2,along:3},dryline:{dTheta:2.4,qDrop:.8,depth:2e3,wind:8,windDepth:1800,warmBump:0,converge:3,along:2},outflow:{dTheta:-4.8,qDrop:.22,depth:550,wind:7,windDepth:700,warmBump:0,converge:1,along:0}};function As(s){const t=s<0?0:s>1?1:s;return t*t*(3-2*t)}function Jc(s,t,e,n){const i=[];for(let r=0;r<=n;r++){const o=r/n*Math.PI*2;i.push({x:s+e*Math.cos(o),y:t+e*Math.sin(o)})}return i}function Hi(){return{marine:!0,latitudeDeg:35,fronts:[{id:"front-cold",kind:"cold",enabled:!0,points:[{x:.02,y:.2},{x:.42,y:.6},{x:.84,y:.98}]},{id:"front-dry",kind:"dryline",enabled:!0,points:[{x:.4,y:.02},{x:.4,y:.28},{x:.4,y:.52}]},{id:"front-outflow",kind:"outflow",enabled:!0,points:Jc(.66,.58,.1,18)}],centers:[]}}function Pl(s){return{marine:s.marine,latitudeDeg:s.latitudeDeg,fronts:s.fronts.map(t=>({...t,points:t.points.map(e=>({x:e.x,y:e.y}))})),centers:s.centers.map(t=>({...t}))}}let Ws=Hi();function Qc(s){Ws=Pl(s??Hi())}function th(){return Ws}function Do(s,t,e){let n=1/0,i=0,r=1,o=0;for(let a=0;a<s.length-1;a++){const c=s[a].x,l=s[a].y,u=s[a+1].x,p=s[a+1].y,d=u-c,h=p-l,g=d*d+h*h;if(g<1e-8)continue;let v=((t-c)*d+(e-l)*h)/g;v<0?v=0:v>1&&(v=1);const m=c+v*d,f=l+v*h,_=t-m,M=e-f,x=Math.hypot(_,M);if(x<n){n=x;const A=Math.sqrt(g);r=d/A,o=h/A,i=(r*M-o*_>=0?1:-1)*x}}return Number.isFinite(n)?{dist:n,signed:i,tx:r,ty:o}:null}function Ll(s){if(s.length<4)return!1;const t=s[0],e=s[s.length-1];return Math.hypot(t.x-e.x,t.y-e.y)<.04}function eh(s){const t=Ll(s)?s.length-1:s.length;let e=0,n=0;const i=Math.max(1,t);for(let r=0;r<i;r++)e+=s[r].x,n+=s[r].y;return{x:e/i,y:n/i}}function Dl(s){return s==="dryline"?.05:s==="outflow"?.04:.08}function nh(s,t,e){let n=0,i=0;for(const a of s.fronts){if(!a.enabled||a.points.length<2)continue;const c=Do(a.points,t,e);if(!c)continue;const l=Dl(a.kind),u=As((c.signed+l)/(2*l));a.kind==="dryline"?i=Math.max(i,u):a.kind!=="warm"&&(n=Math.max(n,u))}let r=0,o=0;for(const a of s.centers){if(!a.enabled)continue;const c=Math.hypot(t-a.x,e-a.y),l=Math.exp(-(c*c)/(2*.16*.16));a.kind==="low"?r=Math.max(r,l):o=Math.max(o,l)}return{cold:n,dry:i,low:r,high:o}}function ih(s,t,e,n){let i=0,r=1,o=0,a=0;for(const u of s.fronts){if(!u.enabled||u.points.length<2)continue;const p=Do(u.points,t,e);if(!p)continue;const d=Zc[u.kind],h=Dl(u.kind),g=As((p.signed+h)/(2*h)),v=Math.exp(-n/d.depth);i+=d.dTheta*g*v,d.qDrop>=0?r*=1-d.qDrop*g*v:r*=1+-d.qDrop*g*v,d.warmBump>0&&(i+=d.warmBump*(1-g)*Math.exp(-p.dist/.35)*Math.exp(-n/1600));const m=Math.exp(-n/d.windDepth),f=d.wind*g*(.4+.6*Math.exp(-p.dist/.3))*m;let _,M;if(u.kind==="outflow"&&Ll(u.points)){const w=eh(u.points),T=t-w.x,P=e-w.y,S=Math.hypot(T,P)||1;_=T/S,M=P/S}else _=p.ty,M=-p.tx;o+=_*f,a+=M*f;const x=(1-g)*Math.exp(-p.dist/.2)*d.converge*m;o+=-_*x,a+=-M*x;const A=(1-g)*Math.exp(-p.dist/.45)*d.along*Math.exp(-n/2200);o+=p.tx*A,a+=p.ty*A}const c=s.latitudeDeg>=0?1:-1,l=.16;for(const u of s.centers){if(!u.enabled)continue;const p=t-u.x,d=e-u.y,h=Math.hypot(p,d),g=Math.exp(-(h*h)/(2*l*l)),v=h/Math.max(l,.001)*g,m=u.hPa/6*11*v*Math.exp(-n/1600),f=(u.kind==="low"?1:-1)*c;if(h>1e-4){o+=f*m*(-d/h),a+=f*m*(p/h);const _=(u.kind==="low"?-.28:.22)*m;o+=_*(p/h),a+=_*(d/h)}i+=(u.kind==="low"?1.6:-1.6)*g*Math.exp(-n/1400)}if(s.marine){const u=As((t-.7)/.1)*As((.3-e)/.1),p=Math.exp(-n/450);i+=u*-2.6*p,u>0&&(r+=(1.02-r)*u*p*.55),o+=u*p*-5,a+=u*p*5}return i<-14?i=-14:i>8&&(i=8),{dTheta:i,qScale:Math.max(.05,r),du:o,dv:a}}function mn(s,t,e){return ih(Ws,s,t,e)}function sh(s,t){let e=0;const n=.16;for(const i of Ws.centers){if(!i.enabled)continue;const r=Math.hypot(s-i.x,t-i.y),o=Math.exp(-(r*r)/(2*n*n));e+=(i.kind==="low"?-i.hPa:i.hPa)*o}return e}function rh(s,t,e){Qc(e);const{nx:n,ny:i,nz:r,dz:o}=s,a=Math.max(1,n-1),c=Math.max(1,i-1);for(let l=0;l<r;l++){const u=(l+.5)*o,p=t.p0[l],d=l*n*i;for(let h=0;h<i;h++){const g=h/c,v=h*n;for(let m=0;m<n;m++){const f=mn(m/a,g,u),_=v+m+d,M=t.theta0[l]+f.dTheta;t.theta[_]=M;const x=t.qv0[l]*f.qScale,A=Gs(on(M,p),p)*.98;t.qv[_]=Math.min(Math.max(0,x),A)}}}for(let l=0;l<r;l++){const u=(l+.5)*o;for(let p=0;p<i;p++){const d=p/c;for(let h=0;h<=n;h++){const g=mn(Math.max(0,h-1)/a,d,u),v=mn(Math.min(n-1,h)/a,d,u);t.u[s.uIdx(h,p,l)]=t.u0[l]+.5*(g.du+v.du)}}for(let p=0;p<=i;p++){const d=Math.max(0,p-1)/c,h=Math.min(i-1,p)/c;for(let g=0;g<n;g++){const v=g/a,m=mn(v,d,u),f=mn(v,h,u);t.v[s.vIdx(g,p,l)]=t.v0[l]+.5*(m.dv+f.dv)}}}}const oh={cold:"Cold front",warm:"Warm front",stationary:"Stationary",dryline:"Dryline",outflow:"Outflow"},sa={cold:"#4db8ff",warm:"#ff5d5d",stationary:"#c084fc",dryline:"#e0a15a",outflow:"#d070e0"};class ah{constructor(){L(this,"root");L(this,"canvas");L(this,"ctx");L(this,"listEl");L(this,"strengthRow");L(this,"strengthVal");L(this,"strengthInput");L(this,"deleteBtn");L(this,"marineInput");L(this,"setup",Hi());L(this,"tool","cold");L(this,"selectedId",null);L(this,"draft",null);L(this,"dragging",null);L(this,"seq",10);L(this,"ro",null);this.root=document.createElement("aside"),this.root.className="setup-card setup-fronts",this.root.tabIndex=0,this.root.innerHTML=`
      <h2>Fronts</h2>
      <p class="hint fronts-desc">
        Draw a front where it should sit. The air on the left of your stroke
        is the cold or dry side. Triangles point the way it will move.
      </p>
      <div class="front-tools" id="sf-front-tools">
        <button type="button" data-tool="select">Select</button>
        <button type="button" data-tool="cold" class="active">Cold</button>
        <button type="button" data-tool="warm">Warm</button>
        <button type="button" data-tool="stationary">Stationary</button>
        <button type="button" data-tool="dryline">Dryline</button>
        <button type="button" data-tool="outflow">Outflow</button>
        <button type="button" data-tool="low">Low</button>
        <button type="button" data-tool="high">High</button>
      </div>
      <canvas id="sf-front-canvas"></canvas>
      <label class="front-marine">
        <input id="sf-front-marine" type="checkbox" checked />
        Southeast marine layer
      </label>
      <div class="front-list" id="sf-front-list"></div>
      <label class="front-strength" id="sf-front-strength">
        Strength
        <input id="sf-front-hpa" type="range" min="2" max="12" step="1" value="6" />
        <span id="sf-front-hpa-val">6 hPa</span>
      </label>
      <div class="panel-actions">
        <button type="button" id="sf-front-delete" disabled>Delete</button>
        <button type="button" id="sf-front-reset">Reset pattern</button>
      </div>
    `,this.canvas=this.root.querySelector("#sf-front-canvas"),this.ctx=this.canvas.getContext("2d"),this.listEl=this.root.querySelector("#sf-front-list"),this.strengthRow=this.root.querySelector("#sf-front-strength"),this.strengthVal=this.root.querySelector("#sf-front-hpa-val"),this.strengthInput=this.root.querySelector("#sf-front-hpa"),this.deleteBtn=this.root.querySelector("#sf-front-delete"),this.marineInput=this.root.querySelector("#sf-front-marine"),this.root.querySelector("#sf-front-tools").addEventListener("click",t=>{const e=t.target.closest("button[data-tool]");if(e){this.tool=e.dataset.tool,this.draft=null;for(const n of this.root.querySelectorAll(".front-tools button"))n.classList.toggle("active",n===e);this.canvas.classList.toggle("drawing",this.tool!=="select")}}),this.marineInput.addEventListener("change",()=>{this.setup.marine=this.marineInput.checked,this.draw()}),this.strengthInput.addEventListener("input",()=>{const t=this.selectedCenter();t&&(t.hPa=Number(this.strengthInput.value),this.strengthVal.textContent=`${t.hPa} hPa`,this.renderList(),this.draw())}),this.deleteBtn.addEventListener("click",()=>this.deleteSelected()),this.root.querySelector("#sf-front-reset").addEventListener("click",()=>{this.setup=Hi(),this.selectedId=null,this.draft=null,this.marineInput.checked=!0,this.syncSelectionUi(),this.renderList(),this.draw()}),this.listEl.addEventListener("click",t=>{const e=t.target.closest("[data-id]");if(!e)return;const n=e.dataset.id;if(t.target.matches("input[type=checkbox]")){const i=t.target.checked,r=this.setup.fronts.find(a=>a.id===n),o=this.setup.centers.find(a=>a.id===n);r&&(r.enabled=i),o&&(o.enabled=i),this.draw();return}this.selectedId=n,this.syncSelectionUi(),this.renderList(),this.draw()}),this.root.addEventListener("keydown",t=>{t.key!=="Delete"&&t.key!=="Backspace"||t.target instanceof HTMLInputElement||(t.preventDefault(),this.deleteSelected())}),this.canvas.addEventListener("pointerdown",t=>this.onDown(t)),this.canvas.addEventListener("pointermove",t=>this.onMove(t)),this.canvas.addEventListener("pointerup",t=>this.onUp(t)),this.canvas.addEventListener("pointercancel",t=>this.onUp(t)),this.ro=new ResizeObserver(()=>this.draw()),this.ro.observe(this.canvas),this.renderList(),this.syncSelectionUi()}getSetup(){return Pl(this.setup)}resize(){this.draw()}nextId(t){return this.seq+=1,`${t}-${this.seq}`}selectedCenter(){return this.setup.centers.find(t=>t.id===this.selectedId)}deleteSelected(){this.selectedId&&(this.setup.fronts=this.setup.fronts.filter(t=>t.id!==this.selectedId),this.setup.centers=this.setup.centers.filter(t=>t.id!==this.selectedId),this.selectedId=null,this.syncSelectionUi(),this.renderList(),this.draw())}syncSelectionUi(){const t=this.selectedCenter();this.deleteBtn.disabled=!this.selectedId,this.strengthRow.classList.toggle("visible",!!t),t&&(this.strengthInput.value=String(t.hPa),this.strengthVal.textContent=`${t.hPa} hPa`)}renderList(){const t=[];for(const e of this.setup.fronts)t.push(this.rowHtml(e.id,oh[e.kind],e.enabled,sa[e.kind]));for(const e of this.setup.centers){const n=e.kind==="low"?"Surface low":"Surface high",i=e.kind==="low"?"#ff5d5d":"#6eb6ff";t.push(this.rowHtml(e.id,`${n} ${e.hPa}`,e.enabled,i))}this.listEl.innerHTML=t.join("")||'<p class="hint">No fronts yet. Pick a tool and draw on the map.</p>'}rowHtml(t,e,n,i){return`<div class="front-row${t===this.selectedId?" selected":""}" data-id="${t}">
      <input type="checkbox" ${n?"checked":""} aria-label="Enable ${e}" />
      <span class="front-swatch" style="background:${i}"></span>
      <span class="front-name">${e}</span>
    </div>`}norm(t){const e=this.canvas.getBoundingClientRect(),n=(t.clientX-e.left)/Math.max(1,e.width),i=1-(t.clientY-e.top)/Math.max(1,e.height);return{x:Math.min(1,Math.max(0,n)),y:Math.min(1,Math.max(0,i))}}hitCenter(t){let e=null,n=.045;for(const i of this.setup.centers){const r=Math.hypot(i.x-t.x,i.y-t.y);r<n&&(e=i,n=r)}return e}hitFront(t){let e=null,n=.03;for(const i of this.setup.fronts){const r=Do(i.points,t.x,t.y);r&&r.dist<n&&(e=i,n=r.dist)}return e}onDown(t){this.canvas.setPointerCapture(t.pointerId),this.root.focus();const e=this.norm(t);if(this.tool==="low"||this.tool==="high"){const n={id:this.nextId(this.tool),kind:this.tool,enabled:!0,x:e.x,y:e.y,hPa:6};this.setup.centers.push(n),this.selectedId=n.id,this.syncSelectionUi(),this.renderList(),this.draw();return}if(this.tool==="select"){const n=this.hitCenter(e);if(n)this.selectedId=n.id,this.dragging={id:n.id,dx:n.x-e.x,dy:n.y-e.y};else{const i=this.hitFront(e);this.selectedId=(i==null?void 0:i.id)??null,this.dragging=null}this.syncSelectionUi(),this.renderList(),this.draw();return}this.draft=[e],this.draw()}onMove(t){const e=this.norm(t);if(this.dragging){const i=this.setup.centers.find(r=>r.id===this.dragging.id);if(!i)return;i.x=Math.min(1,Math.max(0,e.x+this.dragging.dx)),i.y=Math.min(1,Math.max(0,e.y+this.dragging.dy)),this.draw();return}if(!this.draft)return;const n=this.draft[this.draft.length-1];Math.hypot(n.x-e.x,n.y-e.y)<.02||(this.draft.push(e),this.draw())}onUp(t){if(this.canvas.hasPointerCapture(t.pointerId)&&this.canvas.releasePointerCapture(t.pointerId),this.dragging=null,!this.draft)return;const e=this.draft;if(this.draft=null,e.length<2){this.draw();return}const n=this.tool;n==="outflow"&&e.length>=3&&Math.hypot(e[0].x-e[e.length-1].x,e[0].y-e[e.length-1].y)<.08&&e.push({...e[0]});const i={id:this.nextId(n),kind:n,enabled:!0,points:e};this.setup.fronts.push(i),this.selectedId=i.id,this.syncSelectionUi(),this.renderList(),this.draw()}draw(){const t=Math.max(1,this.canvas.clientWidth),e=Math.max(1,this.canvas.clientHeight),n=Math.min(window.devicePixelRatio||1,2),i=Math.floor(t*n),r=Math.floor(e*n);(this.canvas.width!==i||this.canvas.height!==r)&&(this.canvas.width=i,this.canvas.height=r);const o=this.ctx;o.setTransform(n,0,0,n,0,0),o.clearRect(0,0,t,e),o.fillStyle="#0c1424",o.fillRect(0,0,t,e),this.paintTint(t,e),this.paintMarine(t,e);for(const a of this.setup.fronts)this.paintFront(a,t,e,!1);this.draft&&this.draft.length>0&&this.tool!=="select"&&this.tool!=="low"&&this.tool!=="high"&&this.paintFront({id:"draft",kind:this.tool,enabled:!0,points:this.draft},t,e,!0);for(const a of this.setup.centers)this.paintCenter(a,t,e);this.paintCompass(t,e)}toPx(t,e,n){return{x:t.x*e,y:(1-t.y)*n}}paintTint(t,e){const i=t/28,r=e/28;for(let o=0;o<28;o++)for(let a=0;a<28;a++){const c=(a+.5)/28,l=1-(o+.5)/28,u=nh(this.setup,c,l);u.cold>.2&&(this.ctx.fillStyle=`rgba(80, 150, 220, ${.14*u.cold})`,this.ctx.fillRect(a*i,o*r,i+.5,r+.5)),u.dry>.2&&(this.ctx.fillStyle=`rgba(210, 150, 70, ${.16*u.dry})`,this.ctx.fillRect(a*i,o*r,i+.5,r+.5)),u.low>.15&&(this.ctx.fillStyle=`rgba(255, 80, 80, ${.12*u.low})`,this.ctx.fillRect(a*i,o*r,i+.5,r+.5)),u.high>.15&&(this.ctx.fillStyle=`rgba(80, 160, 255, ${.12*u.high})`,this.ctx.fillRect(a*i,o*r,i+.5,r+.5))}}paintMarine(t,e){this.setup.marine&&(this.ctx.fillStyle="rgba(40, 120, 170, 0.28)",this.ctx.beginPath(),this.ctx.moveTo(.7*t,e),this.ctx.lineTo(t,e),this.ctx.lineTo(t,(1-.3)*e),this.ctx.lineTo(.8*t,(1-.2)*e),this.ctx.closePath(),this.ctx.fill())}paintFront(t,e,n,i){if(t.points.length<1)return;const r=this.ctx,o=sa[t.kind];r.save(),r.globalAlpha=t.enabled?1:.35,r.strokeStyle=o,r.fillStyle=o,r.lineWidth=t.id===this.selectedId?3:2,r.lineJoin="round",r.lineCap="round",r.setLineDash(t.enabled?[]:[5,4]),r.beginPath();const a=this.toPx(t.points[0],e,n);r.moveTo(a.x,a.y);for(let c=1;c<t.points.length;c++){const l=this.toPx(t.points[c],e,n);r.lineTo(l.x,l.y)}r.stroke(),r.setLineDash([]),!i&&t.points.length>=2&&this.paintSymbols(t,e,n),r.restore()}paintSymbols(t,e,n){this.ctx;const i=.055;let r=i*.5,o=0;for(let a=0;a<t.points.length-1;a++){const c=t.points[a],l=t.points[a+1],u=l.x-c.x,p=l.y-c.y,d=Math.hypot(u,p);if(d<1e-4)continue;const h=u/d,g=p/d,v=g,m=-h;let f=r;for(;f<d;){const _=c.x+h*f,M=c.y+g*f,x=this.symbolKind(t.kind,o);this.paintBarb(x,_,M,h,g,v,m,e,n),o+=1,f+=i}r=f-d}}symbolKind(t,e){return t!=="stationary"?t:e%2===0?"cold":"warm"}paintBarb(t,e,n,i,r,o,a,c,l){const u=this.ctx,p=this.toPx({x:e+o*.03,y:n+a*.03},c,l),d=this.toPx({x:e-i*.012-o*.004,y:n-r*.012-a*.004},c,l),h=this.toPx({x:e+i*.012-o*.004,y:n+r*.012-a*.004},c,l);if(u.beginPath(),t==="warm"){u.moveTo(d.x,d.y),u.quadraticCurveTo(p.x,p.y,h.x,h.y),u.stroke();return}if(t==="dryline"){u.moveTo(d.x,d.y),u.quadraticCurveTo(p.x,p.y,h.x,h.y),u.stroke();return}u.moveTo(p.x,p.y),u.lineTo(d.x,d.y),u.lineTo(h.x,h.y),u.closePath(),u.fill()}paintCenter(t,e,n){const i=this.ctx,r=this.toPx(t,e,n);i.save(),i.globalAlpha=t.enabled?1:.4,i.fillStyle=t.kind==="low"?"#ff5d5d":"#6eb6ff",i.font="700 18px Segoe UI, system-ui, sans-serif",i.textAlign="center",i.textBaseline="middle",i.fillText(t.kind==="low"?"L":"H",r.x,r.y),i.font="11px Segoe UI, system-ui, sans-serif",i.fillText(String(t.hPa),r.x,r.y+14),t.id===this.selectedId&&(i.strokeStyle="#ffffff",i.lineWidth=1.5,i.beginPath(),i.arc(r.x,r.y,16,0,Math.PI*2),i.stroke()),i.restore()}paintCompass(t,e){const n=this.ctx;n.fillStyle="rgba(232, 238, 248, 0.7)",n.font="12px Segoe UI, system-ui, sans-serif",n.textAlign="center",n.textBaseline="top",n.fillText("N",t/2,6),n.textBaseline="middle",n.textAlign="left",n.fillText("E",t-16,e/2),n.textAlign="right",n.fillText("W",16,e/2),n.textAlign="center",n.textBaseline="bottom",n.fillText("S",t/2,e-6)}}class lh{constructor(t){L(this,"root");L(this,"warnEl");L(this,"onStart");L(this,"skewt",null);L(this,"hodo",null);L(this,"panelView","skewt");L(this,"sounding",vn(12e3,41));L(this,"fronts");var c,l,u,p,d,h,g,v,m;this.onStart=t,this.root=document.createElement("div"),this.root.id="setup-screen",this.root.className="screen active",this.root.innerHTML=`
      <div class="setup-shell">
        <div class="setup-card setup-main">
          <h1>Stormforge</h1>
          <p class="tagline">3D clouds &amp; rain sandbox — CM1-inspired, sounding-driven</p>
          <div class="fields">
            <label>
              Run name
              <input id="sf-name" type="text" value="Stormforge Run" maxlength="64" />
            </label>

            <fieldset class="run-mode-fieldset">
              <legend>Run mode</legend>
              <label class="run-mode-option">
                <input type="radio" name="sf-runmode" value="live" checked />
                <span>
                  <strong>Live sandbox</strong>
                  <span class="hint">Interactive — physics runs in real time while you watch</span>
                </span>
              </label>
              <label class="run-mode-option">
                <input type="radio" name="sf-runmode" value="batch" />
                <span>
                  <strong>Batch then review</strong>
                  <span class="hint">CM1-style — integrate a fixed length, then scrub the recording</span>
                </span>
              </label>
            </fieldset>

            <div id="sf-batch-fields" class="batch-fields hidden">
              <div class="field-row">
                <label>
                  Duration (sim s)
                  <input id="sf-duration" type="number" min="30" max="7200" step="30" value="300" />
                </label>
                <label>
                  Output every (s)
                  <input id="sf-outint" type="number" min="1" max="120" step="1" value="5" />
                </label>
                <label>
                  Step dt (s)
                  <input id="sf-batchdt" type="number" min="0.5" max="10" step="0.5" value="${Dr}" disabled />
                </label>
              </div>
              <p class="hint" id="sf-batch-hint">~120 frames · ~75 MB — review clouds + reflectivity after the run</p>
            </div>

            <div class="field-row">
              <label>
                Resolution X
                <input id="sf-nx" type="number" min="16" max="256" step="8" value="64" />
              </label>
              <label>
                Resolution Y
                <input id="sf-ny" type="number" min="16" max="256" step="8" value="64" />
              </label>
              <label>
                Resolution Z
                <input id="sf-nz" type="number" min="16" max="96" step="4" value="40" />
              </label>
            </div>
            <p class="hint" id="sf-domain-hint">Domain ~64×64×12 km · Δx/Δy ≈ 1000 m · Δz ≈ 300 m</p>
            <label>
              Domain altitude (m)
              <input id="sf-ztop" type="range" min="5000" max="24000" step="500" value="12000" />
              <span class="hint"><span id="sf-ztop-val">12000</span> m &nbsp;·&nbsp; higher Z = finer vertical detail</span>
            </label>
            <label>
              Warm bubble (K)
              <input id="sf-bubble" type="range" min="0" max="8" step="0.25" value="3" />
              <span class="hint"><span id="sf-bubble-val">3.0</span> K at center — fires convection (CM1-style)</span>
            </label>
            <div class="field-row">
              <label>
                Latitude
                <input id="sf-lat" type="range" min="-60" max="60" step="1" value="35" />
                <span class="hint"><span id="sf-lat-val">35</span>° — sun strength</span>
              </label>
              <label>
                Month
                <input id="sf-month" type="range" min="1" max="12" step="1" value="6" />
                <span class="hint"><span id="sf-month-val">Jun</span> — season</span>
              </label>
              <label>
                Start hour
                <input id="sf-hour" type="range" min="0" max="23.75" step="0.25" value="12" />
                <span class="hint"><span id="sf-hour-val">12:00</span> local solar</span>
              </label>
            </div>
            <p class="hint sun-hint">Sun heats the near-surface by day; IR cools at night. Month + latitude set solar strength.</p>
          </div>
          <div id="sf-perf-warn" class="perf-warn"></div>
          <div class="setup-actions">
            <button class="primary" id="sf-start">Start simulation</button>
            <span class="hint" id="sf-start-hint">Edit or import a sounding on the right, then start</span>
          </div>
        </div>

        <aside class="setup-card setup-sounding">
          <h2>Sounding</h2>
          <p class="hint setup-sounding-desc" id="sf-sounding-desc">
            Orange = T, green = Td. Import a file or draw before you run — used for live and batch.
          </p>
          <div class="panel-toggle">
            <button type="button" id="sf-view-skewt" class="active">Skew-T</button>
            <button type="button" id="sf-view-hodo">Hodograph</button>
          </div>
          <div class="mode-tabs" id="sf-mode-tabs">
            <button type="button" id="sf-mode-t" class="active">T</button>
            <button type="button" id="sf-mode-td">Td</button>
          </div>
          <canvas id="sf-skewt-canvas"></canvas>
          <div id="sf-skewt-metrics" class="skewt-metrics"></div>
          <canvas id="sf-hodo-canvas" class="hidden"></canvas>
          <div class="panel-actions setup-sounding-actions">
            <button type="button" id="sf-btn-default">Default</button>
            <button type="button" id="sf-btn-import">Import</button>
          </div>
          <div id="sf-import-box">
            <textarea id="sf-import-text" placeholder="Paste SHARPpy %RAW%, Extra CSV, SPC/UWYO, CM1 input_sounding, or Stormforge CSV…"></textarea>
            <div class="import-row">
              <button type="button" id="sf-btn-import-go" class="primary">Load sounding</button>
              <label class="file-btn">
                Open file
                <input id="sf-import-file" type="file" accept="*/*" hidden />
              </label>
            </div>
            <span class="hint" id="sf-import-msg">Formats: SHARPpy · Extra · SPC · CM1 · Stormforge</span>
          </div>
        </aside>
      </div>
    `,this.warnEl=this.root.querySelector("#sf-perf-warn"),this.fronts=new ah,this.root.querySelector(".setup-shell").append(this.fronts.root);const e=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],n=f=>{const _=Math.floor(f),M=Math.round((f-_)*60);return`${String(_).padStart(2,"0")}:${String(M).padStart(2,"0")}`},i=()=>this.updateWarn();for(const f of["sf-nx","sf-ny","sf-nz","sf-ztop","sf-bubble","sf-lat","sf-month","sf-hour","sf-duration","sf-outint"])(c=this.root.querySelector("#"+f))==null||c.addEventListener("input",()=>{if(f==="sf-ztop"){const _=this.root.querySelector("#sf-ztop").value;this.root.querySelector("#sf-ztop-val").textContent=_,this.applyZTop(Number(_))}if(f==="sf-bubble"){const _=Number(this.root.querySelector("#sf-bubble").value);this.root.querySelector("#sf-bubble-val").textContent=_.toFixed(1)}if(f==="sf-lat"){const _=this.root.querySelector("#sf-lat").value;this.root.querySelector("#sf-lat-val").textContent=_}if(f==="sf-month"){const _=Number(this.root.querySelector("#sf-month").value);this.root.querySelector("#sf-month-val").textContent=e[_-1]??String(_)}if(f==="sf-hour"){const _=Number(this.root.querySelector("#sf-hour").value);this.root.querySelector("#sf-hour-val").textContent=n(_)}i()});for(const f of this.root.querySelectorAll('input[name="sf-runmode"]'))f.addEventListener("change",()=>this.syncRunModeUi());(l=this.root.querySelector("#sf-view-skewt"))==null||l.addEventListener("click",()=>{this.setPanelView("skewt")}),(u=this.root.querySelector("#sf-view-hodo"))==null||u.addEventListener("click",()=>{this.setPanelView("hodograph")}),(p=this.root.querySelector("#sf-mode-t"))==null||p.addEventListener("click",()=>{var f,_,M;(f=this.skewt)==null||f.setMode("T"),(_=this.root.querySelector("#sf-mode-t"))==null||_.classList.add("active"),(M=this.root.querySelector("#sf-mode-td"))==null||M.classList.remove("active")}),(d=this.root.querySelector("#sf-mode-td"))==null||d.addEventListener("click",()=>{var f,_,M;(f=this.skewt)==null||f.setMode("Td"),(_=this.root.querySelector("#sf-mode-td"))==null||_.classList.add("active"),(M=this.root.querySelector("#sf-mode-t"))==null||M.classList.remove("active")}),(h=this.root.querySelector("#sf-btn-default"))==null||h.addEventListener("click",()=>{var f,_;(f=this.skewt)==null||f.resetDefault(),this.skewt&&(this.sounding=this.skewt.getLevels(),(_=this.hodo)==null||_.setLevels(this.sounding))});const r=this.root.querySelector("#sf-import-box");(g=this.root.querySelector("#sf-btn-import"))==null||g.addEventListener("click",()=>{var f;r.classList.toggle("visible"),r.classList.contains("visible")&&((f=this.root.querySelector("#sf-import-text"))==null||f.focus())});const o=f=>{var x;const _=this.root.querySelector("#sf-import-msg");if(!f.trim()){_.textContent="Paste sounding text or open a file first.",_.style.color="var(--danger)";return}if(!this.skewt){_.textContent="Sounding editor not ready.",_.style.color="var(--danger)";return}this.setPanelView("skewt");const M=this.skewt.importText(f);_.textContent=M.message,_.style.color=M.ok?"var(--ok)":"var(--danger)",M.ok&&(this.sounding=this.skewt.getLevels(),(x=this.hodo)==null||x.setLevels(this.sounding))};(v=this.root.querySelector("#sf-btn-import-go"))==null||v.addEventListener("click",()=>{o(this.root.querySelector("#sf-import-text").value)});const a=this.root.querySelector("#sf-import-file");a==null||a.addEventListener("change",()=>{var M;const f=(M=a.files)==null?void 0:M[0];if(!f)return;const _=new FileReader;_.onload=()=>{const x=String(_.result??"");this.root.querySelector("#sf-import-text").value=x,o(x),a.value=""},_.readAsText(f)}),(m=this.root.querySelector("#sf-start"))==null||m.addEventListener("click",()=>{const f=this.readValues();if(f.runMode==="batch"){const _=Ks(f.durationSec,f.outputIntervalSec),M=Ts(f.nx,f.ny,f.nz,_);if(M>bi){this.warnEl.textContent=`Batch strip ~${(M/(1024*1024)).toFixed(0)} MB exceeds the ${(bi/(1024*1024)).toFixed(0)} MB cap. Increase “Output every”, shorten duration, or lower resolution.`,this.warnEl.classList.add("visible");return}}this.onStart(f)}),this.mountEditors(),this.syncRunModeUi(),this.updateWarn(),requestAnimationFrame(()=>{requestAnimationFrame(()=>{this.resizeEditors(),this.fronts.resize()})})}show(){this.root.classList.add("active"),requestAnimationFrame(()=>{requestAnimationFrame(()=>{this.resizeEditors(),this.fronts.resize()})})}hide(){this.root.classList.remove("active")}readValues(){const t=this.root.querySelector('input[name="sf-runmode"]:checked'),e=(t==null?void 0:t.value)==="batch"?"batch":"live";return this.syncSoundingFromEditors(),{name:this.root.querySelector("#sf-name").value.trim()||"Stormforge Run",nx:Number(this.root.querySelector("#sf-nx").value),ny:Number(this.root.querySelector("#sf-ny").value),nz:Number(this.root.querySelector("#sf-nz").value),zTop:Number(this.root.querySelector("#sf-ztop").value),bubbleStrength:Number(this.root.querySelector("#sf-bubble").value),latitudeDeg:Number(this.root.querySelector("#sf-lat").value),month:Number(this.root.querySelector("#sf-month").value),startHour:Number(this.root.querySelector("#sf-hour").value),runMode:e,durationSec:Number(this.root.querySelector("#sf-duration").value),outputIntervalSec:Number(this.root.querySelector("#sf-outint").value),sounding:this.sounding.map(n=>({...n})),synoptic:this.readSynoptic()}}readSynoptic(){const t=this.fronts.getSetup();return t.latitudeDeg=Number(this.root.querySelector("#sf-lat").value),t}mountEditors(){const t=this.root.querySelector("#sf-skewt-canvas"),e=this.root.querySelector("#sf-hodo-canvas"),n=Number(this.root.querySelector("#sf-ztop").value);this.sounding=vn(n,41),this.skewt=new Cl(t,n),this.hodo=new Rl(e,n);const i=this.root.querySelector("#sf-skewt-metrics");this.skewt.setMetricsElement(i),this.skewt.setLevels(this.sounding),this.hodo.setLevels(this.sounding),this.skewt.onChange=r=>{this.sounding=r},this.hodo.onChange=r=>{this.sounding=r},this.setPanelView("skewt")}syncSoundingFromEditors(){var t,e;this.panelView==="hodograph"&&this.hodo?(this.sounding=this.hodo.getLevels(),(t=this.skewt)==null||t.setLevels(this.sounding)):this.skewt&&(this.sounding=this.skewt.getLevels(),(e=this.hodo)==null||e.setLevels(this.sounding))}applyZTop(t){var e,n,i,r;(e=this.skewt)==null||e.setZTop(t),this.skewt?(this.sounding=this.skewt.getLevels(),(n=this.hodo)==null||n.setZTop(t),(i=this.hodo)==null||i.setLevels(this.sounding)):(r=this.hodo)==null||r.setZTop(t)}setPanelView(t){var a,c;this.syncSoundingFromEditors(),this.panelView=t;const e=this.root.querySelector("#sf-skewt-canvas"),n=this.root.querySelector("#sf-hodo-canvas"),i=this.root.querySelector("#sf-skewt-metrics"),r=this.root.querySelector("#sf-mode-tabs"),o=this.root.querySelector("#sf-sounding-desc");(a=this.root.querySelector("#sf-view-skewt"))==null||a.classList.toggle("active",t==="skewt"),(c=this.root.querySelector("#sf-view-hodo"))==null||c.classList.toggle("active",t==="hodograph"),t==="skewt"?(e.classList.remove("hidden"),i.classList.remove("hidden"),n.classList.add("hidden"),r.classList.remove("hidden"),o&&(o.textContent="Orange = T, green = Td. Import a file or draw before you run — used for live and batch."),requestAnimationFrame(()=>{var l;return(l=this.skewt)==null?void 0:l.resize()})):(e.classList.add("hidden"),i.classList.add("hidden"),n.classList.remove("hidden"),r.classList.add("hidden"),o&&(o.textContent="Drag tips to set wind (north-up). Apply is automatic when you start the run."),requestAnimationFrame(()=>{requestAnimationFrame(()=>{var l;return(l=this.hodo)==null?void 0:l.resize()})}))}resizeEditors(){var t,e;this.panelView==="hodograph"?(t=this.hodo)==null||t.resize():(e=this.skewt)==null||e.resize()}syncRunModeUi(){var r;const e=this.readValues().runMode==="batch";(r=this.root.querySelector("#sf-batch-fields"))==null||r.classList.toggle("hidden",!e);const n=this.root.querySelector("#sf-start"),i=this.root.querySelector("#sf-start-hint");n&&(n.textContent=e?"Run & review":"Start simulation"),i&&(i.textContent=e?"Uses the sounding on the right, then records for review":"Uses the sounding on the right — you can keep editing after start"),this.updateWarn()}updateWarn(){const t=this.readValues(),e={nx:t.nx,ny:t.ny,nz:t.nz,zTop:t.zTop},n=new Ml(e),i=this.root.querySelector("#sf-domain-hint");if(i){const c=(n.xExtent/1e3).toFixed(0),l=(n.yExtent/1e3).toFixed(0),u=(n.zTop/1e3).toFixed(1),p=Math.round(n.dx),d=Math.round(n.dy),h=Math.round(n.dz);i.textContent=`Domain ~${c}×${l}×${u} km · Δx≈${p} m · Δy≈${d} m · Δz≈${h} m · ${n.cellCount().toLocaleString()} cells (higher X/Y = larger + finer)`}const r=this.root.querySelector("#sf-batch-hint");if(r&&t.runMode==="batch"){const c=Ks(t.durationSec,t.outputIntervalSec),u=Ts(t.nx,t.ny,t.nz,c)/(1024*1024);r.textContent=`~${c} frames · ~${u.toFixed(0)} MB · dt=${Dr}s — review clouds + reflectivity after the run`}const o=[],a=Nc(n);if(a&&o.push(a),t.runMode==="batch"){const c=Ks(t.durationSec,t.outputIntervalSec),l=Ts(t.nx,t.ny,t.nz,c);l>bi?o.push(`Batch strip ~${(l/(1024*1024)).toFixed(0)} MB exceeds the ${(bi/(1024*1024)).toFixed(0)} MB cap. Increase “Output every”, shorten duration, or lower resolution.`):l>bi*.6&&o.push(`Batch strip ~${(l/(1024*1024)).toFixed(0)} MB is large — consider a longer output interval.`)}o.length?(this.warnEl.textContent=o.join(" "),this.warnEl.classList.add("visible")):(this.warnEl.textContent="",this.warnEl.classList.remove("visible"))}}function ra(s){const t=s.n,e=s.nz;return{u:new Float32Array(s.nu),v:new Float32Array(s.nv),w:new Float32Array(s.nw),theta:new Float32Array(t),qv:new Float32Array(t),qc:new Float32Array(t),qr:new Float32Array(t),p:new Float32Array(t),theta0:new Float32Array(e),qv0:new Float32Array(e),p0:new Float32Array(e),rho0:new Float32Array(e),rho0w:new Float32Array(e+1),u0:new Float32Array(e),v0:new Float32Array(e)}}function ch(s,t=.14){return{bubbleR:t*Math.min(s.xExtent,s.yExtent,s.zTop),cx:s.xExtent/2,cy:s.yExtent/2,cz:Math.min(1400,Math.max(s.dz*2.5,s.zTop*.1))}}function Il(s,t,e){if(e.bubbleStrength<=0)return;const{nx:n,ny:i,nz:r,dx:o,dy:a,dz:c}=s,{bubbleR:l,cx:u,cy:p,cz:d}=ch(s,e.bubbleRadiusFrac??.14);for(let h=0;h<r;h++){const g=(h+.5)*c;for(let v=0;v<i;v++){const m=(v+.5)*a;for(let f=0;f<n;f++){const M=((f+.5)*o-u)/l,x=(m-p)/l,A=(g-d)/(l*.65),w=M*M+x*x+A*A;if(w>=1)continue;const T=s.idx(f,v,h),P=Math.cos(.5*Math.PI*Math.sqrt(w)),S=P*P;let y=t.theta[T]+e.bubbleStrength*S;const C=Gs(on(y,t.p0[h]),t.p0[h]),I=.0015*S*Math.max(.4,e.bubbleStrength/3),D=Math.max(t.qv[T],C*(1.01+.04*S));t.theta[T]=y,t.qv[T]=Math.max(0,D),t.qc[T]=Math.max(t.qc[T],I);const G=2.5*S,q=s.wIdx(f,v,h),U=s.wIdx(f,v,h+1);t.w[q]=Math.max(t.w[q],G*.5),t.w[U]=Math.max(t.w[U],G*.5)}}}for(let h=0;h<i;h++)for(let g=0;g<n;g++)t.w[s.wIdx(g,h,0)]=0,t.w[s.wIdx(g,h,r)]=0}function oa(s,t,e,n){const{nx:i,ny:r,nz:o}=s;for(let a=0;a<o;a++){const c=(a+.5)*s.dz,l=bl(t,c),u=l.Td-273.15,p=Lo(u),d=Math.min(Nn(p,l.p),Gs(l.T,l.p)*.98),h=Hc(l.T,l.p);e.theta0[a]=h,e.qv0[a]=d,e.p0[a]=l.p,e.rho0[a]=l.p/(287.05*l.T),e.u0[a]=l.u,e.v0[a]=l.v}e.rho0w[0]=e.rho0[0],e.rho0w[o]=e.rho0[o-1];for(let a=1;a<o;a++)e.rho0w[a]=.5*(e.rho0[a-1]+e.rho0[a]);for(let a=0;a<o;a++)for(let c=0;c<r;c++)for(let l=0;l<i;l++){const u=s.idx(l,c,a);e.theta[u]=e.theta0[a],e.qv[u]=e.qv0[a],e.qc[u]=0,e.qr[u]=0,e.p[u]=0}for(let a=0;a<o;a++){for(let c=0;c<r;c++)for(let l=0;l<=i;l++)e.u[s.uIdx(l,c,a)]=e.u0[a];for(let c=0;c<=r;c++)for(let l=0;l<i;l++)e.v[s.vIdx(l,c,a)]=e.v0[a]}e.w.fill(0),rh(s,e,n.synoptic),n.bubbleStrength>0&&Il(s,e,n)}function hh(s,t){return 14*(1-.18*(s/Math.max(t-1,1)))}function uh(s,t,e,n,i){const{nx:r,ny:o,nz:a,dz:c}=s,l=.002,u=35e-5,p=2.8,d=.004,h=.0035,g=1-Math.exp(-2*e),v=1-Math.exp(-.35*e),m=r*o,f=Bc/Co;for(let _=0;_<a;_++){const M=t.p0[_],x=i[_],A=_*m;for(let w=0;w<o;w++){const T=A+w*r;for(let P=0;P<r;P++){const S=T+P;let y=t.qv[S],C=t.qc[S],I=t.qr[S],D=t.theta[S];const G=D*x,q=Math.max(1e-6,Nn(Wi(G),M)),U=y-q;if(U>0){const H=Math.min(U,U*g);y-=H,C+=H,D+=f*H*D/Math.max(G,1)}else if(C>0){const H=-U,z=Math.min(C,H*v);y+=z,C-=z,D-=f*z*D/Math.max(G,1)}if(C>u){const H=Math.min(C-u*.5,l*e*(C-u));H>0&&(C-=H,I+=H)}if(C>0&&I>0){const H=Math.min(C,p*C*I*e);C-=H,I+=H}if(I>0&&y<q){const H=Math.min(I,d*(q-y)*e);I-=H,y+=H,D-=f*H*D/Math.max(G,1)}C>h&&(I+=C-h,C=h),t.qv[S]=Math.max(0,y),t.qc[S]=Math.max(0,C),t.qr[S]=Math.max(0,I),t.theta[S]=D}}}dh(s,t,e,n)}function dh(s,t,e,n){const{nx:i,ny:r,nz:o,dz:a}=s,c=i*r;n.fill(0);for(let l=0;l<o;l++){const u=hh(l,o),p=Math.min(1.8,u*e/Math.max(a,1)),d=l*c;for(let h=0;h<r;h++){const g=d+h*i;for(let v=0;v<i;v++){const m=t.qr[g+v];if(m<=0)continue;const f=l-p;if(f<=0)continue;const _=Math.floor(f),M=Math.min(o-1,_+1),x=f-_,A=v+h*i;n[A+_*c]+=m*(1-x),M!==_&&(n[A+M*c]+=m*x)}}}t.qr.set(n)}const aa={refl:{id:"refl",title:"Column-max reflectivity",units:"dBZ",legendCss:"linear-gradient(90deg,#00a000 0%,#00dc00 25%,#ffff00 45%,#ff8c00 60%,#ff0000 75%,#ff00ff 90%,#ffffff 100%)",ticks:["5","30","50","70"]},doppler:{id:"doppler",title:"Radial velocity (center radar)",units:"m/s",legendCss:"linear-gradient(90deg,#2040ff 0%,#a0c0ff 40%,#f0f0f0 50%,#ffb0a0 60%,#ff2020 100%)",ticks:["-30","0","+30"]},cape:{id:"cape",title:"Surface-based CAPE",units:"J/kg",legendCss:"linear-gradient(90deg,#1a2030 0%,#fff7c0 25%,#ffb040 55%,#ff4020 80%,#c00080 100%)",ticks:["0","1000","3000","5000"]},cin:{id:"cin",title:"Surface-based CIN",units:"J/kg",legendCss:"linear-gradient(90deg,#1a2030 0%,#5078b4 35%,#2850c8 70%,#7828b4 100%)",ticks:["0","50","150","300"]},tsfc:{id:"tsfc",title:"Surface temperature",units:"°C",legendCss:"linear-gradient(90deg,#2030a0 0%,#40c0ff 25%,#f0f0f0 45%,#ffc040 70%,#ff2020 100%)",ticks:["0","15","25","35"]},td:{id:"td",title:"Surface dewpoint",units:"°C",legendCss:"linear-gradient(90deg,#2030a0 0%,#40c0ff 25%,#f0f0f0 45%,#ffc040 70%,#ff2020 100%)",ticks:["0","10","20","28"]},wspd:{id:"wspd",title:"Surface wind speed",units:"m/s",legendCss:"linear-gradient(90deg,#1a2030 0%,#3cb46a 30%,#ffe060 65%,#ffffff 100%)",ticks:["0","10","20","40"]},psfc:{id:"psfc",title:"Surface pressure",units:"hPa",legendCss:"linear-gradient(90deg,#2040ff 0%,#a0c0ff 40%,#f0f0f0 50%,#ffb0a0 60%,#ff2020 100%)",ticks:["-12","0","+12"]},ltg:{id:"ltg",title:"Lightning hotspots",units:"/min",legendCss:"linear-gradient(90deg,#1a1428 0%,#c87820 40%,#ffe060 70%,#ffffff 100%)",ticks:["0","5","15","30"]}};function fh(s,t,e,n){switch(s){case"refl":ph(t,e,n);break;case"doppler":mh(t,e,n);break;case"cape":ca(t,e,n,"cape");break;case"cin":ca(t,e,n,"cin");break;case"tsfc":vh(t,e,n);break;case"td":xh(t,e,n);break;case"wspd":_h(t,e,n);break;case"psfc":Mh(t,e,n);break}}function Mn(s,t,e,n){return(s+(n-1-t)*e)*4}function ph(s,t,e){const{nx:n,ny:i,nz:r}=s,o=r>48?Math.ceil(r/48):1;for(let a=0;a<i;a++)for(let c=0;c<n;c++){let l=-30;for(let u=0;u<r;u+=o){const p=s.idx(c,a,u),d=Ul(t.qr[p],t.qc[p]);d>l&&(l=d)}Sh(l,e,Mn(c,a,n,i))}}function mh(s,t,e){const{nx:n,ny:i,nz:r,dz:o}=s,a=(n-1)*.5,c=(i-1)*.5,l=Math.max(1,Math.min(r-2,Math.round(1500/Math.max(o,1))));let u=0,p=0,d=0;for(let v=0;v<i;v++)for(let m=0;m<n;m++)u+=s.uCenter(t.u,m,v,l),p+=s.vCenter(t.v,m,v,l),d++;const h=u/Math.max(1,d),g=p/Math.max(1,d);for(let v=0;v<i;v++)for(let m=0;m<n;m++){const f=m-a,_=v-c,M=Math.hypot(f,_);let x=0;if(M>.5){const A=s.uCenter(t.u,m,v,l)-h,w=s.vCenter(t.v,m,v,l)-g;x=(A*f+w*_)/M}Fl(x,-30,30,e,Mn(m,v,n,i))}}let la=0,Ir=new Float64Array(0),Ur=new Float64Array(0),Nr=new Float64Array(0),Fr=new Float64Array(0);function gh(s){s<=la||(la=s,Ir=new Float64Array(s),Ur=new Float64Array(s),Nr=new Float64Array(s),Fr=new Float64Array(s))}function ca(s,t,e,n){const{nx:i,ny:r,nz:o,dz:a,zTop:c}=s,l=Math.max(1,Math.floor(o/20)),u=[];for(let d=0;d<o;d+=l)u.push(d);u[u.length-1]!==o-1&&u.push(o-1);const p=u.length;gh(p);for(let d=0;d<r;d++)for(let h=0;h<i;h++){for(let m=0;m<p;m++){const f=u[m],_=s.idx(h,d,f),M=t.p0[f],x=on(t.theta[_],M),A=Math.max(0,t.qv[_]),w=A*M/(.622+A);Ir[m]=(f+.5)*a,Ur[m]=M,Nr[m]=x,Fr[m]=Math.min(x,Fn(Math.max(1,w))+273.15)}const g=Tl(Ir,Ur,Nr,Fr,p,c),v=Mn(h,d,i,r);n==="cape"?Th(g.cape,e,v):bh(g.cin,e,v)}}function vh(s,t,e){const{nx:n,ny:i}=s,r=t.p0[0];for(let o=0;o<i;o++)for(let a=0;a<n;a++){const c=t.theta[s.idx(a,o,0)],l=on(c,r)-273.15;Nl(l,0,38,e,Mn(a,o,n,i))}}function xh(s,t,e){const{nx:n,ny:i}=s,r=t.p0[0];for(let o=0;o<i;o++)for(let a=0;a<n;a++){const c=Math.max(0,t.qv[s.idx(a,o,0)]),l=c*r/(.622+c),u=Fn(Math.max(1,l));Nl(u,0,28,e,Mn(a,o,n,i))}}function _h(s,t,e){const{nx:n,ny:i}=s;for(let r=0;r<i;r++)for(let o=0;o<n;o++){const a=Math.hypot(s.uCenter(t.u,o,r,0),s.vCenter(t.v,o,r,0));Eh(a,e,Mn(o,r,n,i))}}function Mh(s,t,e){const{nx:n,ny:i}=s,r=t.rho0[0]/100;for(let o=0;o<i;o++)for(let a=0;a<n;a++){const c=a/Math.max(1,n-1),l=o/Math.max(1,i-1),u=t.p[s.idx(a,o,0)]*r+sh(c,l);Fl(u,-12,12,e,Mn(a,o,n,i))}}function yh(s,t,e){const{nx:n,ny:i}=s;for(let r=0;r<i;r++)for(let o=0;o<n;o++){const a=t[o+r*n]??0;wh(a,e,Mn(o,r,n,i))}}function Ul(s,t){const e=4e7*Math.pow(Math.max(0,s),1.75)+8e4*Math.pow(Math.max(0,t),2);return e<1e-8?-30:10*Math.log10(e)}function Sh(s,t,e){if(s<5){t[e]=0,t[e+1]=0,t[e+2]=0,t[e+3]=0;return}mi(s,[[5,0,160,0],[20,0,220,0],[30,255,255,0],[40,255,140,0],[50,255,0,0],[60,255,0,255],[70,255,255,255]],t,e,220)}function bh(s,t,e){if(s<10){t[e]=20,t[e+1]=24,t[e+2]=36,t[e+3]=255;return}const n=[[10,80,120,180],[50,80,140,220],[150,40,80,200],[300,120,40,180]];mi(Math.min(400,s),n,t,e,255)}function Eh(s,t,e){const n=[[0,26,32,48],[10,60,180,106],[20,255,224,96],[40,255,255,255]];mi(Math.min(40,Math.max(0,s)),n,t,e,255)}function wh(s,t,e){if(s<.4){t[e]=20,t[e+1]=16,t[e+2]=32,t[e+3]=255;return}const n=[[.4,80,40,20],[5,200,120,32],[15,255,224,96],[30,255,255,255]];mi(Math.min(40,s),n,t,e,255)}function Th(s,t,e){if(s<50){t[e]=20,t[e+1]=24,t[e+2]=36,t[e+3]=255;return}const n=[[50,255,247,192],[800,255,196,64],[1800,255,96,32],[3200,210,24,56],[5e3,150,0,140]];mi(Math.min(5e3,Math.max(0,s)),n,t,e,255)}function Nl(s,t,e,n,i){const r=[[t,32,48,160],[t+(e-t)*.25,64,192,255],[t+(e-t)*.45,240,240,240],[t+(e-t)*.7,255,192,64],[e,255,32,32]];mi(Math.min(e,Math.max(t,s)),r,n,i,255)}function Fl(s,t,e,n,i){const r=(s-t)/Math.max(1e-6,e-t),o=Math.min(1,Math.max(0,r));if(o<.5){const a=o*2;n[i]=32+208*a|0,n[i+1]=64+176*a|0,n[i+2]=255-15*a|0}else{const a=(o-.5)*2;n[i]=240+15*a|0,n[i+1]=240-208*a|0,n[i+2]=240-208*a|0}n[i+3]=255}function mi(s,t,e,n,i){let r=0;for(;r<t.length-1&&s>t[r+1][0];)r++;const o=t[r],a=t[Math.min(t.length-1,r+1)],c=o[0]===a[0]?0:(s-o[0])/Math.max(1e-6,a[0]-o[0]);e[n]=o[1]+(a[1]-o[1])*c|0,e[n+1]=o[2]+(a[2]-o[2])*c|0,e[n+2]=o[3]+(a[3]-o[3])*c|0,e[n+3]=i}const Ah={enabled:!0,latitudeDeg:35,month:6,solarHour:12,diurnalSpeed:15},Vi=Math.PI/180;function kl(s){const t=Math.min(12,Math.max(1,Math.round(s))),e=[15,45,74,105,135,166,196,227,258,288,319,349][t-1];return 23.45*Vi*Math.sin((284+e)/365*2*Math.PI)}function Ch(s,t,e){const n=s*Vi,i=kl(t),o=((e%24+24)%24-12)*15*Vi,a=Math.max(-1,Math.min(1,Math.sin(n)*Math.sin(i)+Math.cos(n)*Math.cos(i)*Math.cos(o))),c=Math.sqrt(Math.max(0,1-a*a)),l=Math.max(.08,c),u=-Math.sin(o)*Math.cos(i)/l,p=(Math.sin(i)*Math.cos(n)-Math.cos(i)*Math.sin(n)*Math.cos(o))/l,d=c*u,h=c*p,g=Math.hypot(d,a,h)||1;return{x:d/g,y:a/g,z:-h/g}}function Ol(s,t,e){const n=s*Vi,i=kl(t),o=((e%24+24)%24-12)*15*Vi;return Math.sin(n)*Math.sin(i)+Math.cos(n)*Math.cos(i)*Math.cos(o)}function Zi(s,t){let e=Math.imul(s,374761393)+Math.imul(t,668265263);return e=Math.imul(e^e>>>13,1274126177),((e^e>>>16)>>>0)/4294967295}function Rh(s,t){const e=Math.floor(s),n=Math.floor(t),i=s-e,r=t-n,o=i*i*(3-2*i),a=r*r*(3-2*r),c=Zi(e,n),l=Zi(e+1,n),u=Zi(e,n+1),p=Zi(e+1,n+1),d=c+(l-c)*o,h=u+(p-u)*o;return d+(h-d)*a}function ha(s,t,e=!0){const n=new Float32Array(s*t),i=Math.max(4,Math.round(Math.min(s,t)/8)),r=Math.max(1,s-1),o=Math.max(1,t-1);for(let a=0;a<t;a++){const c=a*s,l=a/i,u=a/o;for(let p=0;p<s;p++){const d=.55+Rh(p/i,l)*.9;if(!e){n[c+p]=d;continue}const h=p/r,g=Math.min(1,Math.max(0,(h-.7)/.1))*Math.min(1,Math.max(0,(.3-u)/.1));n[c+p]=d*(1-g)+.08*g}}return n}function kr(s){const t=(s%24+24)%24,e=Math.floor(t),n=Math.floor((t-e)*60);return`${String(e).padStart(2,"0")}:${String(n).padStart(2,"0")}`}function Bl(s){const t=Ol(s.latitudeDeg,s.month,s.solarHour),e=Math.max(0,t),n=e>.02;return{cosZ:t,isDay:n,sunFrac:e,clock:kr(s.solarHour),label:n?"day":"night"}}function Ph(s,t,e,n,i){if(!n.enabled||e<=0)return;const{nx:r,ny:o,nz:a}=s,c=Ol(n.latitudeDeg,n.month,n.solarHour),l=Math.max(0,c),u=Math.max(1,n.diurnalSpeed),p=3.2*u/3600*l,d=1.4*u/3600,h=Math.min(a-1,4),g=i!==void 0&&i.length>=r*o;for(let v=0;v<h;v++){const m=Math.exp(-v/1.15);if(m<.08)continue;const f=t.theta0[v],_=t.p0[v];for(let M=0;M<o;M++){const x=M*r;for(let A=0;A<r;A++){const w=s.idx(A,M,v),T=t.theta[w],P=on(T,_),S=d*(.85+.15*Math.max(0,(P-275)/40)),y=g?i[x+A]:1,C=(p*y-S)*m*e,I=T+C,D=f-9,G=f+11;t.theta[w]=Math.max(D,Math.min(G,I))}}}}function Lh(s,t,e){const n=t*e/3600;return((s+n)%24+24)%24}const Dh=240,Ih=2,Ei=1500;function Uh(s,t,e,n,i,r,o){if(e<=0)return;const a=s.nx*s.ny;for(let l=0;l<a;l++)i[l]>0&&(i[l]=Math.max(0,i[l]-e));const c=Bl(o).sunFrac;!o.enabled||c<=.25||n.length<a||(Nh(s,t,e,n,r,c,o.diurnalSpeed),Fh(s,t,n,i,r))}function Nh(s,t,e,n,i,r,o){const{nx:a,ny:c,nz:l}=s,p=84e-7*(Math.max(1,o)/15)*r,d=Math.min(l-1,4);for(let h=0;h<d;h++){const g=Math.exp(-h/1.15);if(g<.08)continue;const v=t.p0[h],m=i[h],f=h*a*c;for(let _=0;_<c;_++){const M=_*a;for(let x=0;x<a;x++){const A=f+M+x,w=n[M+x],T=t.theta[A]*m,S=.95*Nn(Wi(T),v),y=t.qv[A];y>=S||(t.qv[A]=Math.min(S,y+p*w*g*e))}}}}function Fh(s,t,e,n,i){const{nx:r,ny:o,nz:a,dx:c,dy:l,dz:u}=s;let p=-1,d=-1,h=1.2,g=-1,v=-1,m=1.2;const f=t.p0[0],_=i[0];for(let x=0;x<o;x++){const A=x*r;for(let w=0;w<r;w++){const T=A+w;if(n[T]>0||e[T]<=1)continue;const P=t.theta[T],S=P-t.theta0[0];if(S<=m)continue;const y=P*_,C=Math.max(0,t.qv[T]),I=C*f/(.622+C),D=y-273.15,G=Fn(Math.max(1,I)),q=125*(D-G);q<400||q>2500||(S>h?(g=p,v=d,m=h,p=w,d=x,h=S):(g=w,v=x,m=S))}}const M=[];p>=0&&M.push([p,d]),g>=0&&M.length<Ih&&M.push([g,v]);for(const[x,A]of M)kh(s,t,n,i,x,A,c,l,u,r,o,a)}function kh(s,t,e,n,i,r,o,a,c,l,u,p){const d=i+r*l,h=t.p0[0],g=Math.max(0,t.qv[d]),v=t.theta[d]*n[0],m=g*h/(.622+Math.max(g,1e-8)),f=125*(v-273.15-Fn(Math.max(1,m))),_=(i+.5)*o,M=(r+.5)*a,x=Math.max(0,i-Math.ceil(Ei/o)-1),A=Math.min(l-1,i+Math.ceil(Ei/o)+1),w=Math.max(0,r-Math.ceil(Ei/a)-1),T=Math.min(u-1,r+Math.ceil(Ei/a)+1),P=Math.min(p-1,Math.ceil((f+800)/c)),S=l*u;for(let y=w;y<=T;y++){const C=(y+.5)*a;for(let I=x;I<=A;I++){const D=(I+.5)*o,G=Math.hypot(D-_,C-M)/Ei;if(G>=1)continue;const q=Math.cos(.5*Math.PI*G),U=q*q;e[I+y*l]=Math.max(e[I+y*l],Dh);for(let H=0;H<=P;H++){const z=(H+.5)*c;if(z>f+800)break;const et=z<=f?1:Math.max(0,1-(z-f)/800),tt=U*et;if(tt<.02)continue;const st=I+l*y+H*S;t.theta[st]+=2*tt;const gt=t.p0[H],Tt=Nn(Wi(t.theta[st]*n[H]),gt),J=Math.min(1,z/Math.max(f,1))<1?g:Math.min(g,Tt*.99);t.qv[st]+=(J-t.qv[st])*tt,z>=f-c&&z<=f+1.5*c&&(t.qc[st]=Math.max(t.qc[st],45e-5*U));const lt=2*U*et;t.w[s.wIdx(I,y,H)]+=lt*.5,t.w[s.wIdx(I,y,Math.min(p,H+1))]+=lt*.5}}}for(let y=0;y<u;y++)for(let C=0;C<l;C++)t.w[s.wIdx(C,y,0)]=0,t.w[s.wIdx(C,y,p)]=0}class Oh{constructor(t){L(this,"grid");L(this,"fields");L(this,"tmp");L(this,"tmpQv");L(this,"tmpQc");L(this,"tmpQr");L(this,"tmpU");L(this,"tmpV");L(this,"tmpW");L(this,"div");L(this,"qrScratch");L(this,"samp4",new Float32Array(4));L(this,"exner");L(this,"landMask");L(this,"plumeCooldown");L(this,"flash");L(this,"mgLevels",[]);L(this,"lastBubbleOpts",{bubbleStrength:3});L(this,"radiation",{...Ah});L(this,"clockPaused",!1);L(this,"time",0);L(this,"stepCount",0);this.grid=t,this.fields=ra(t),this.tmp=new Float32Array(0),this.tmpQv=this.tmp,this.tmpQc=this.tmp,this.tmpQr=this.tmp,this.tmpU=this.tmp,this.tmpV=this.tmp,this.tmpW=this.tmp,this.div=this.tmp,this.qrScratch=this.tmp,this.exner=this.tmp,this.landMask=this.tmp,this.plumeCooldown=this.tmp,this.flash=this.tmp,this.allocWork()}allocWork(){const t=this.grid,e=t.n;this.tmp=new Float32Array(e),this.tmpQv=new Float32Array(e),this.tmpQc=new Float32Array(e),this.tmpQr=new Float32Array(e),this.tmpU=new Float32Array(t.nu),this.tmpV=new Float32Array(t.nv),this.tmpW=new Float32Array(t.nw),this.div=new Float32Array(e),this.qrScratch=new Float32Array(e),this.exner=new Float32Array(t.nz),this.exner.fill(1),this.landMask=ha(t.nx,t.ny),this.plumeCooldown=new Float32Array(t.nx*t.ny),this.flash=new Float32Array(t.nx*t.ny),this.buildMg()}refreshLandMask(){this.landMask=ha(this.grid.nx,this.grid.ny,th().marine)}refreshExner(){const t=this.grid.nz,e=this.fields.p0;for(let n=0;n<t;n++)this.exner[n]=Sl(e[n])}rebuild(t,e,n){this.grid=t,this.fields=ra(t),this.time=0,this.stepCount=0,this.lastBubbleOpts={...n},this.allocWork(),oa(t,e,this.fields,n),this.refreshLandMask(),this.refreshExner()}reset(t,e){this.time=0,this.stepCount=0;const n=e.synoptic??this.lastBubbleOpts.synoptic;this.lastBubbleOpts={...e,synoptic:n},oa(this.grid,t,this.fields,this.lastBubbleOpts),this.refreshLandMask(),this.plumeCooldown.fill(0),this.flash.fill(0),this.refreshExner()}setRadiation(t){this.radiation={...this.radiation,...t},this.radiation.month<1&&(this.radiation.month=1),this.radiation.month>12&&(this.radiation.month=12),this.radiation.latitudeDeg=Math.max(-90,Math.min(90,this.radiation.latitudeDeg)),this.radiation.solarHour=(this.radiation.solarHour%24+24)%24}setSolarHour(t){this.radiation.solarHour=(t%24+24)%24}getSolarStatus(){return Bl(this.radiation)}respawnBubble(t){const e=(t==null?void 0:t.bubbleStrength)??this.lastBubbleOpts.bubbleStrength??3,n={...this.lastBubbleOpts,...t,bubbleStrength:Math.max(.5,e)};this.lastBubbleOpts=n,Il(this.grid,this.fields,n)}step(t){const{dx:e,dy:n,dz:i}=this.grid,r=this.fields;let o=1;for(let p=0;p<r.u.length;p++){const d=Math.abs(r.u[p]);d>o&&(o=d)}for(let p=0;p<r.v.length;p++){const d=Math.abs(r.v[p]);d>o&&(o=d)}for(let p=0;p<r.w.length;p++){const d=Math.abs(r.w[p]);d>o&&(o=d)}o+=15;const a=Math.min(e,n,i),c=Math.max(.001,.85*a/o);let l=Math.max(1,Math.ceil(t/c));l>2&&(l=2);const u=t/l;for(let p=0;p<l;p++)this.applyBuoyancy(u),this.advectVelocity(u),this.project(u),this.advectScalars(u),Ph(this.grid,this.fields,u,this.radiation,this.landMask),Uh(this.grid,this.fields,u,this.landMask,this.plumeCooldown,this.exner,this.radiation),uh(this.grid,this.fields,u,this.qrScratch,this.exner),this.updateLightning(u),this.applySponge(u),this.clockPaused||(this.radiation.solarHour=Lh(this.radiation.solarHour,u,this.radiation.diurnalSpeed)),this.time+=u,this.stepCount++}applyBuoyancy(t){const{nx:e,ny:n,nz:i}=this.grid,r=this.fields,o=yl;for(let a=1;a<i;a++){const c=r.theta0[a-1],l=r.theta0[a],u=r.qv0[a-1],p=r.qv0[a],d=.5*(c*(1+.608*u)+l*(1+.608*p));for(let h=0;h<n;h++)for(let g=0;g<e;g++){const v=this.grid.idx(g,h,a-1),m=this.grid.idx(g,h,a),f=r.theta[v],_=r.theta[m],M=r.qv[v],x=r.qv[m],A=.5*(f*(1+.608*M)+_*(1+.608*x)),w=.5*(r.qc[v]+r.qc[m]),T=.5*(r.qr[v]+r.qr[m]),P=o*((A-d)/Math.max(1,d)-w-1.6*T);r.w[this.grid.wIdx(g,h,a)]+=P*t}}}sampleQuad(t,e,n,i,r,o,a){const{nx:c,ny:l,nz:u}=this.grid,p=r<0?0:r>c-1.001?c-1.001:r,d=o<0?0:o>l-1.001?l-1.001:o,h=a<0?0:a>u-1.001?u-1.001:a,g=p|0,v=d|0,m=h|0,f=g+1<c?g+1:c-1,_=v+1<l?v+1:l-1,M=m+1<u?m+1:u-1,x=p-g,A=d-v,w=h-m,T=c*l,P=v*c,S=_*c,y=m*T,C=M*T,I=y+P+g,D=y+P+f,G=y+S+g,q=y+S+f,U=C+P+g,H=C+P+f,z=C+S+g,et=C+S+f,tt=1-x,st=1-A,gt=1-w,Tt=this.samp4,$=t[I]*tt+t[D]*x,J=t[G]*tt+t[q]*x,lt=t[U]*tt+t[H]*x,rt=t[z]*tt+t[et]*x;Tt[0]=($*st+J*A)*gt+(lt*st+rt*A)*w;const bt=e[I]*tt+e[D]*x,At=e[G]*tt+e[q]*x,Ct=e[U]*tt+e[H]*x,qt=e[z]*tt+e[et]*x;Tt[1]=(bt*st+At*A)*gt+(Ct*st+qt*A)*w;const Ot=n[I]*tt+n[D]*x,ee=n[G]*tt+n[q]*x,F=n[U]*tt+n[H]*x,ue=n[z]*tt+n[et]*x;Tt[2]=(Ot*st+ee*A)*gt+(F*st+ue*A)*w;const Ft=i[I]*tt+i[D]*x,kt=i[G]*tt+i[q]*x,St=i[U]*tt+i[H]*x,$t=i[z]*tt+i[et]*x;Tt[3]=(Ft*st+kt*A)*gt+(St*st+$t*A)*w}sampleU(t,e,n){const i=this.grid,r=i.nx+1,o=Math.min(r-1.001,Math.max(0,t)),a=Math.min(i.ny-1.001,Math.max(0,e)),c=Math.min(i.nz-1.001,Math.max(0,n)),l=Math.floor(o),u=Math.floor(a),p=Math.floor(c),d=Math.min(r-1,l+1),h=Math.min(i.ny-1,u+1),g=Math.min(i.nz-1,p+1),v=o-l,m=a-u,f=c-p,_=this.fields.u,M=_[i.uIdx(l,u,p)],x=_[i.uIdx(d,u,p)],A=_[i.uIdx(l,h,p)],w=_[i.uIdx(d,h,p)],T=_[i.uIdx(l,u,g)],P=_[i.uIdx(d,u,g)],S=_[i.uIdx(l,h,g)],y=_[i.uIdx(d,h,g)],C=M*(1-v)+x*v,I=A*(1-v)+w*v,D=T*(1-v)+P*v,G=S*(1-v)+y*v,q=C*(1-m)+I*m,U=D*(1-m)+G*m;return q*(1-f)+U*f}sampleV(t,e,n){const i=this.grid,r=i.ny+1,o=Math.min(i.nx-1.001,Math.max(0,t)),a=Math.min(r-1.001,Math.max(0,e)),c=Math.min(i.nz-1.001,Math.max(0,n)),l=Math.floor(o),u=Math.floor(a),p=Math.floor(c),d=Math.min(i.nx-1,l+1),h=Math.min(r-1,u+1),g=Math.min(i.nz-1,p+1),v=o-l,m=a-u,f=c-p,_=this.fields.v,M=_[i.vIdx(l,u,p)],x=_[i.vIdx(d,u,p)],A=_[i.vIdx(l,h,p)],w=_[i.vIdx(d,h,p)],T=_[i.vIdx(l,u,g)],P=_[i.vIdx(d,u,g)],S=_[i.vIdx(l,h,g)],y=_[i.vIdx(d,h,g)],C=M*(1-v)+x*v,I=A*(1-v)+w*v,D=T*(1-v)+P*v,G=S*(1-v)+y*v,q=C*(1-m)+I*m,U=D*(1-m)+G*m;return q*(1-f)+U*f}sampleW(t,e,n){const i=this.grid,r=i.nz+1,o=Math.min(i.nx-1.001,Math.max(0,t)),a=Math.min(i.ny-1.001,Math.max(0,e)),c=Math.min(r-1.001,Math.max(0,n)),l=Math.floor(o),u=Math.floor(a),p=Math.floor(c),d=Math.min(i.nx-1,l+1),h=Math.min(i.ny-1,u+1),g=Math.min(r-1,p+1),v=o-l,m=a-u,f=c-p,_=this.fields.w,M=_[i.wIdx(l,u,p)],x=_[i.wIdx(d,u,p)],A=_[i.wIdx(l,h,p)],w=_[i.wIdx(d,h,p)],T=_[i.wIdx(l,u,g)],P=_[i.wIdx(d,u,g)],S=_[i.wIdx(l,h,g)],y=_[i.wIdx(d,h,g)],C=M*(1-v)+x*v,I=A*(1-v)+w*v,D=T*(1-v)+P*v,G=S*(1-v)+y*v,q=C*(1-m)+I*m,U=D*(1-m)+G*m;return q*(1-f)+U*f}advectVelocity(t){const e=this.grid,n=this.fields,{nx:i,ny:r,nz:o,dx:a,dy:c,dz:l}=e;for(let h=0;h<o;h++)for(let g=0;g<r;g++)for(let v=0;v<=i;v++){const m=e.uIdx(v,g,h),f=n.u[m],_=v===0?n.v[e.vIdx(0,g,h)]*.5+n.v[e.vIdx(0,g+1,h)]*.5:v===i?n.v[e.vIdx(i-1,g,h)]*.5+n.v[e.vIdx(i-1,g+1,h)]*.5:.25*(n.v[e.vIdx(v-1,g,h)]+n.v[e.vIdx(v,g,h)]+n.v[e.vIdx(v-1,g+1,h)]+n.v[e.vIdx(v,g+1,h)]),M=v===0?.5*(n.w[e.wIdx(0,g,h)]+n.w[e.wIdx(0,g,h+1)]):v===i?.5*(n.w[e.wIdx(i-1,g,h)]+n.w[e.wIdx(i-1,g,h+1)]):.25*(n.w[e.wIdx(v-1,g,h)]+n.w[e.wIdx(v,g,h)]+n.w[e.wIdx(v-1,g,h+1)]+n.w[e.wIdx(v,g,h+1)]),x=v-f*t/a,A=g-_*t/c,w=h-M*t/l;if(x<0||x>i){const T=Math.min(r-1,Math.max(0,g))/Math.max(1,r-1),P=mn(x<0?0:1,T,(h+.5)*l);this.tmpU[m]=n.u0[h]+P.du}else this.tmpU[m]=this.sampleU(x,A,w)}for(let h=0;h<o;h++)for(let g=0;g<=r;g++)for(let v=0;v<i;v++){const m=e.vIdx(v,g,h),f=n.v[m],_=g===0?.5*(n.u[e.uIdx(v,0,h)]+n.u[e.uIdx(v+1,0,h)]):g===r?.5*(n.u[e.uIdx(v,r-1,h)]+n.u[e.uIdx(v+1,r-1,h)]):.25*(n.u[e.uIdx(v,g-1,h)]+n.u[e.uIdx(v+1,g-1,h)]+n.u[e.uIdx(v,g,h)]+n.u[e.uIdx(v+1,g,h)]),M=g===0?.5*(n.w[e.wIdx(v,0,h)]+n.w[e.wIdx(v,0,h+1)]):g===r?.5*(n.w[e.wIdx(v,r-1,h)]+n.w[e.wIdx(v,r-1,h+1)]):.25*(n.w[e.wIdx(v,g-1,h)]+n.w[e.wIdx(v,g,h)]+n.w[e.wIdx(v,g-1,h+1)]+n.w[e.wIdx(v,g,h+1)]),x=v-_*t/a,A=g-f*t/c,w=h-M*t/l;if(A<0||A>r){const T=Math.min(i-1,Math.max(0,v))/Math.max(1,i-1),P=mn(T,A<0?0:1,(h+.5)*l);this.tmpV[m]=n.v0[h]+P.dv}else this.tmpV[m]=this.sampleV(x,A,w)}for(let h=0;h<=o;h++)for(let g=0;g<r;g++)for(let v=0;v<i;v++){const m=e.wIdx(v,g,h);if(h===0||h===o){this.tmpW[m]=0;continue}const f=n.w[m],_=.25*(n.u[e.uIdx(v,g,h-1)]+n.u[e.uIdx(v+1,g,h-1)]+n.u[e.uIdx(v,g,h)]+n.u[e.uIdx(v+1,g,h)]),M=.25*(n.v[e.vIdx(v,g,h-1)]+n.v[e.vIdx(v,g+1,h-1)]+n.v[e.vIdx(v,g,h)]+n.v[e.vIdx(v,g+1,h)]),x=v-_*t/a,A=g-M*t/c,w=h-f*t/l;x<0||x>i-1||A<0||A>r-1?this.tmpW[m]=0:this.tmpW[m]=this.sampleW(x,A,w)}n.u.set(this.tmpU),n.v.set(this.tmpV),n.w.set(this.tmpW);const u=Math.min(.2,.01*t),p=i*r,d=(h,g,v)=>{if(h<0||g<0||h>=i||g>=r)return!1;const m=h+i*g+v*p;if(n.qc[m]+n.qr[m]>1e-5)return!0;const f=n.theta[m]-n.theta0[v];return f>.6||f<-.6};for(let h=0;h<o;h++){const v=(h+.5)*l<1500?u*.15:u;for(let m=0;m<r;m++)for(let f=0;f<=i;f++){if(d(f-1,m,h)||d(f,m,h))continue;const _=e.uIdx(f,m,h);n.u[_]+=(n.u0[h]-n.u[_])*v}for(let m=0;m<=r;m++)for(let f=0;f<i;f++){if(d(f,m-1,h)||d(f,m,h))continue;const _=e.vIdx(f,m,h);n.v[_]+=(n.v0[h]-n.v[_])*v}}}advectScalars(t){const e=this.grid,n=this.fields,{nx:i,ny:r,nz:o,dx:a,dy:c,dz:l}=e,u=i*r,p=i+1,d=r+1,h=n.u,g=n.v,v=n.w,m=this.tmp,f=this.tmpQv,_=this.tmpQc,M=this.tmpQr,x=t/a,A=t/c,w=t/l,T=i-1,P=r-1,S=this.samp4;for(let y=0;y<o;y++){const C=n.theta0[y],I=n.qv0[y],D=y*u,G=y*p*r,q=y*i*d,U=y*u,H=(y+1)*u;for(let z=0;z<r;z++){const et=D+z*i,tt=G+z*p,st=q+z*i,gt=q+(z+1)*i,Tt=U+z*i,$=H+z*i;for(let J=0;J<i;J++){const lt=et+J,rt=.5*(h[tt+J]+h[tt+J+1]),bt=.5*(g[st+J]+g[gt+J]),At=.5*(v[Tt+J]+v[$+J]),Ct=J-rt*x,qt=z-bt*A,Ot=y-At*w;if(Ct<0||Ct>T||qt<0||qt>P){const ee=(Ct<0?0:Ct>T?T:J)/Math.max(1,T),F=(qt<0?0:qt>P?P:z)/Math.max(1,P),ue=mn(ee,F,(y+.5)*l),Ft=C+ue.dTheta,kt=n.p0[y],St=I*ue.qScale,$t=Gs(on(Ft,kt),kt)*.98;m[lt]=Ft,f[lt]=Math.min(Math.max(0,St),$t),_[lt]=0,M[lt]=0}else this.sampleQuad(n.theta,n.qv,n.qc,n.qr,Ct,qt,Ot),m[lt]=S[0],f[lt]=S[1],_[lt]=S[2],M[lt]=S[3]}}}n.theta.set(m),n.qv.set(f),n.qc.set(_),n.qr.set(M)}buildMg(){const t=[];let e=this.grid.nx,n=this.grid.ny;const i=this.grid.nz,r=this.grid.xExtent,o=this.grid.yExtent;let a=this.grid.dx,c=this.grid.dy;const l=this.grid.dz;for(;;){const u=e*n*i,p=t.length===0;if(t.push({nx:e,ny:n,nz:i,dx:a,dy:c,dz:l,n:u,p:p?null:new Float32Array(u),rhs:p?null:new Float32Array(u),resid:new Float32Array(u)}),Math.min(e,n)<=16)break;const d=e>>1,h=n>>1;if(d<8||h<8)break;e=d,n=h,a=r/e,c=o/n}this.mgLevels=t}setLids(){const{nx:t,ny:e,nz:n}=this.grid,i=this.fields.w,r=t*e;for(let o=0;o<e;o++){const a=o*t,c=n*r+a;for(let l=0;l<t;l++)i[a+l]=0,i[c+l]=0}}fillDivergence(t){const e=this.grid,{nx:n,ny:i,nz:r,dx:o,dy:a,dz:c}=e,l=this.fields,u=this.div,p=n*i,d=n+1,h=i+1,g=1/o,v=1/a,m=1/c;let f=0;for(let _=0;_<r;_++){const M=l.rho0[_],x=l.rho0w[_],A=l.rho0w[_+1],w=_*p,T=_*d*i,P=_*n*h,S=_*p,y=(_+1)*p;for(let C=0;C<i;C++){const I=T+C*d,D=P+C*n,G=P+(C+1)*n,q=S+C*n,U=y+C*n,H=w+C*n;for(let z=0;z<n;z++){const et=M*(l.u[I+z+1]-l.u[I+z])*g,tt=M*(l.v[G+z]-l.v[D+z])*v,st=(A*l.w[U+z]-x*l.w[q+z])*m,gt=et+tt+st,Tt=gt<0?-gt:gt;Tt>f&&(f=Tt),u[H+z]=gt*t}}}return f}smoothLevel(t,e,n,i){const{nx:r,ny:o,nz:a,dx:c,dy:l,dz:u}=t,p=c*c,d=l*l,h=u*u,g=this.fields.rho0,v=this.fields.rho0w,m=r*o;for(let f=0;f<i;f++)for(let _=0;_<a;_++){const M=g[_],x=v[_],A=v[_+1],T=1/(2*M/p+2*M/d+A/h+x/h),P=M/p,S=M/d,y=A/h,C=x/h,I=_*m,D=_<a-1?(_+1)*m:I,G=_>0?(_-1)*m:I;if(r>2&&o>2)for(let U=1;U<o-1;U++){const H=I+U*r,z=H+r,et=H-r,tt=D+U*r,st=G+U*r;for(let gt=1;gt<r-1;gt++){const Tt=H+gt,$=P*(e[Tt+1]+e[Tt-1])+S*(e[z+gt]+e[et+gt])+y*e[tt+gt]+C*e[st+gt];e[Tt]=($-n[Tt])*T}}const q=(U,H)=>{const z=U<r-1?U+1:U,et=U>0?U-1:U,tt=H<o-1?H+1:H,st=H>0?H-1:H,gt=I+H*r+U,Tt=P*(e[I+H*r+z]+e[I+H*r+et])+S*(e[I+tt*r+U]+e[I+st*r+U])+y*e[D+H*r+U]+C*e[G+H*r+U];e[gt]=(Tt-n[gt])*T};for(let U=0;U<r;U++)q(U,0),o>1&&q(U,o-1);for(let U=1;U<o-1;U++)q(0,U),r>1&&q(r-1,U)}}residualLevel(t,e,n,i){const{nx:r,ny:o,nz:a,dx:c,dy:l,dz:u}=t,p=c*c,d=l*l,h=u*u,g=this.fields.rho0,v=this.fields.rho0w,m=r*o;for(let f=0;f<a;f++){const _=g[f],M=v[f],x=v[f+1],A=2*_/p+2*_/d+x/h+M/h,w=_/p,T=_/d,P=x/h,S=M/h,y=f*m,C=f<a-1?(f+1)*m:y,I=f>0?(f-1)*m:y;for(let D=0;D<o;D++){const G=D<o-1?D+1:D,q=D>0?D-1:D;for(let U=0;U<r;U++){const H=U<r-1?U+1:U,z=U>0?U-1:U,et=y+D*r+U,tt=w*(e[y+D*r+H]+e[y+D*r+z])+T*(e[y+G*r+U]+e[y+q*r+U])+P*e[C+D*r+U]+S*e[I+D*r+U];i[et]=n[et]-tt+A*e[et]}}}}restrictResidual(t,e){const n=e.rhs,i=e.resid;n.fill(0),i.fill(0);const{nx:r,ny:o,nz:a}=t,c=e.nx,l=e.ny,u=r*o,p=c*l,d=t.resid;for(let h=0;h<a;h++){const g=h*u,v=h*p;for(let m=0;m<o;m++){const f=m>>1<l?m>>1:l-1,_=g+m*r,M=v+f*c;for(let x=0;x<r;x++){const A=x>>1<c?x>>1:c-1,w=M+A;n[w]+=d[_+x],i[w]+=1}}}for(let h=0;h<e.n;h++)n[h]=i[h]>0?n[h]/i[h]:0}prolongAdd(t,e,n){const i=t.p,{nx:r,ny:o,nz:a}=n,c=t.nx,l=t.ny,u=r*o,p=c*l;for(let d=0;d<a;d++){const h=d*u,g=d*p;for(let v=0;v<o;v++){const m=v*.5;let f=m|0,_=m-f;f>=l-1&&(f=l-1,_=0);const M=f+1<l?f+1:f,x=g+f*c,A=g+M*c,w=h+v*r,T=1-_;for(let P=0;P<r;P++){const S=P*.5;let y=S|0,C=S-y;y>=c-1&&(y=c-1,C=0);const I=y+1<c?y+1:y,D=1-C;e[w+P]+=i[x+y]*D*T+i[x+I]*C*T+i[A+y]*D*_+i[A+I]*C*_}}}}vcycle(t){const e=this.mgLevels[t],n=t===0?this.fields.p:e.p,i=t===0?this.div:e.rhs;if(t===this.mgLevels.length-1){t>0&&n.fill(0),this.smoothLevel(e,n,i,8);return}this.smoothLevel(e,n,i,2),this.residualLevel(e,n,i,e.resid);const o=this.mgLevels[t+1];this.restrictResidual(e,o),o.p.fill(0),this.vcycle(t+1),this.prolongAdd(o,n,e),this.smoothLevel(e,n,i,2)}correctVelocity(t){const e=this.grid,{nx:n,ny:i,nz:r,dx:o,dy:a,dz:c}=e,l=this.fields,u=l.p,p=n*i,d=n+1,h=i+1,g=t/o,v=t/a,m=t/c;for(let f=0;f<r;f++){const _=f*p,M=f*d*i,x=f*n*h;for(let A=0;A<i;A++){const w=_+A*n,T=M+A*d;for(let P=1;P<n;P++)l.u[T+P]-=(u[w+P]-u[w+P-1])*g}for(let A=1;A<i;A++){const w=_+A*n,T=w-n,P=x+A*n;for(let S=0;S<n;S++)l.v[P+S]-=(u[w+S]-u[T+S])*v}}for(let f=1;f<r;f++){const _=f*p,M=(f-1)*p,x=f*p;for(let A=0;A<i;A++){const w=_+A*n,T=M+A*n,P=x+A*n;for(let S=0;S<n;S++)l.w[P+S]-=(u[w+S]-u[T+S])*m}}}project(t){const e=1/Math.max(1e-6,t);this.setLids();const n=this.fillDivergence(e);this.vcycle(0),this.correctVelocity(t),this.setLids();const i=this.fillDivergence(e);if(i>.02&&n>1e-8&&i>.25*n){const r=this.tmp;r.set(this.fields.p),this.fields.p.fill(0),this.vcycle(0),this.correctVelocity(t);const o=this.fields.p;for(let a=0;a<o.length;a++)o[a]+=r[a];this.setLids()}}applySponge(t){const e=this.grid,{nx:n,ny:i,nz:r}=e,o=this.fields,a=Math.floor(r*.75);for(let l=a;l<r;l++){const u=(l-a)/Math.max(1,r-1-a),p=.05*u*u*t;for(let d=0;d<i;d++){for(let h=0;h<n;h++)o.theta[e.idx(h,d,l)]+=(o.theta0[l]-o.theta[e.idx(h,d,l)])*p*.5;for(let h=0;h<=n;h++){const g=e.uIdx(h,d,l);o.u[g]+=(o.u0[l]-o.u[g])*p}}for(let d=0;d<=i;d++)for(let h=0;h<n;h++){const g=e.vIdx(h,d,l);o.v[g]+=(o.v0[l]-o.v[g])*p}for(let d=0;d<i;d++)for(let h=0;h<n;h++)o.w[e.wIdx(h,d,l)]*=1-p,o.w[e.wIdx(h,d,l+1)]*=1-p}const c=Math.min(4,Math.floor(Math.min(n,i)/6));if(!(c<1)){for(let l=0;l<i;l++)for(let u=0;u<n;u++){const p=Math.min(u,n-1-u),d=Math.min(l,i-1-l),h=Math.min(p,d);if(h>=c)continue;const g=1-h/c,v=Math.min(.85,.12*g*g*t);if(!(v<=0))for(let m=0;m<r;m++){const f=e.idx(u,l,m);o.qc[f]*=1-v,o.qr[f]*=1-v,o.w[e.wIdx(u,l,m)]*=1-v,o.w[e.wIdx(u,l,m+1)]*=1-v,o.u[e.uIdx(u,l,m)]+=(o.u0[m]-o.u[e.uIdx(u,l,m)])*v*.5,o.u[e.uIdx(u+1,l,m)]+=(o.u0[m]-o.u[e.uIdx(u+1,l,m)])*v*.5,o.v[e.vIdx(u,l,m)]+=(o.v0[m]-o.v[e.vIdx(u,l,m)])*v*.5,o.v[e.vIdx(u,l+1,m)]+=(o.v0[m]-o.v[e.vIdx(u,l+1,m)])*v*.5}}for(let l=0;l<i;l++)for(let u=0;u<n;u++)o.w[e.wIdx(u,l,0)]=0,o.w[e.wIdx(u,l,r)]=0}}packVolumeRGBA(t){const e=this.fields,{nx:n,ny:i,nz:r,n:o}=this.grid,a=(u,p)=>{const d=Math.min(1,e.qc[u]*3800),h=Math.min(1,e.qr[u]*2800);t[p]=d*255|0,t[p+1]=h*255|0,t[p+2]=0,t[p+3]=Math.min(255,(d*.75+h*.55)*255|0)};if(t.length>=o*4){for(let u=0;u<o;u++)a(u,u*4);return}const c=To(n,i,r),l=n*i;for(let u=0;u<c.nz;u++){const d=Math.min(r-1,u*c.sz)*l;for(let h=0;h<c.ny;h++){const g=Math.min(i-1,h*c.sy),v=d+g*n;for(let m=0;m<c.nx;m++){const f=Math.min(n-1,m*c.sx);a(v+f,(m+c.nx*(h+c.ny*u))*4)}}}}updateLightning(t){const{nx:e,ny:n,nz:i}=this.grid,r=this.fields,o=Math.exp(-t/300),a=e*n,c=r.w;for(let l=0;l<n;l++)for(let u=0;u<e;u++){const p=u+l*e;let d=0,h=-30;for(let v=0;v<i;v++){const m=p+v*a,f=.5*(c[m]+c[m+a]);f>d&&(d=f);const _=r.qr[m],M=r.qc[m];if(_<1e-5&&M<1e-5)continue;const x=Ul(_,M);x>h&&(h=x)}let g=this.flash[p]*o;if(d>6&&h>40){const v=Math.min(1,(h-40)/30),m=Math.min(2,(d-6)/10),f=4+16*v*m;g+=f*(1-o)}this.flash[p]=g}}rollLightning(t){if(t<=0)return[];const{nx:e,ny:n,nz:i}=this.grid,r=this.fields,o=e*n,a=[];for(let c=0;c<n;c++)for(let l=0;l<e;l++){const u=this.flash[l+c*e];if(u<.8)continue;const p=1-Math.exp(-(u/60)*t);if(Math.random()>p)continue;let d=Math.floor(i*.45),h=-1e9;for(let g=1;g<i-1;g++){const v=l+e*(c+n*g),m=r.qr[v]*4+r.qc[v]+Math.max(0,r.w[v+o])*.002;m>h&&(h=m,d=g)}a.push({i:l,j:c,k:d,rate:u})}return a.sort((c,l)=>l.rate-c.rate),a.slice(0,2).map(({i:c,j:l,k:u})=>({i:c,j:l,k:u}))}packRadarComposite(t){this.packMapProduct("refl",t)}packMapProduct(t,e){const n=this.grid.nx*this.grid.ny*4;if(!(e.length<n)){if(t==="ltg"){yh(this.grid,this.flash,e);return}fh(t,this.grid,this.fields,e)}}cloudRainStats(){const t=this.fields;let e=0,n=0,i=0;for(let r=0;r<t.qc.length;r++)t.qc[r]>e&&(e=t.qc[r]),t.qr[r]>n&&(n=t.qr[r]),i+=t.qc[r]+t.qr[r];return{cloudMax:e,rainMax:n,cloudMass:i}}}/**
 * @license
 * Copyright 2010-2024 Three.js Authors
 * SPDX-License-Identifier: MIT
 */const Io="170",Bh=0,ua=1,zh=2,zl=1,Hh=2,en=3,xn=0,ge=1,We=2,sn=0,ri=1,da=2,fa=3,pa=4,Vh=5,Pn=100,Gh=101,Wh=102,qh=103,Xh=104,Yh=200,$h=201,jh=202,Kh=203,Or=204,Br=205,Zh=206,Jh=207,Qh=208,tu=209,eu=210,nu=211,iu=212,su=213,ru=214,zr=0,Hr=1,Vr=2,ci=3,Gr=4,Wr=5,qr=6,Xr=7,Hl=0,ou=1,au=2,gn=0,lu=1,cu=2,hu=3,uu=4,du=5,fu=6,pu=7,Vl=300,hi=301,ui=302,Yr=303,$r=304,qs=306,jr=1e3,Dn=1001,Kr=1002,xe=1003,mu=1004,Ji=1005,Ee=1006,Js=1007,In=1008,Ne=1009,Gl=1010,Wl=1011,Gi=1012,Uo=1013,kn=1014,Xe=1015,qi=1016,No=1017,Fo=1018,di=1020,ql=35902,Xl=1021,Yl=1022,we=1023,$l=1024,jl=1025,oi=1026,fi=1027,ko=1028,Oo=1029,Kl=1030,Bo=1031,zo=1033,Cs=33776,Rs=33777,Ps=33778,Ls=33779,Zr=35840,Jr=35841,Qr=35842,to=35843,eo=36196,no=37492,io=37496,so=37808,ro=37809,oo=37810,ao=37811,lo=37812,co=37813,ho=37814,uo=37815,fo=37816,po=37817,mo=37818,go=37819,vo=37820,xo=37821,Ds=36492,_o=36494,Mo=36495,Zl=36283,yo=36284,So=36285,bo=36286,gu=3200,vu=3201,Jl=0,xu=1,qe="",Ie="srgb",gi="srgb-linear",Xs="linear",Kt="srgb",Hn=7680,ma=519,_u=512,Mu=513,yu=514,Ql=515,Su=516,bu=517,Eu=518,wu=519,ga=35044,zi="300 es",nn=2e3,Fs=2001;class vi{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});const n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){if(this._listeners===void 0)return!1;const n=this._listeners;return n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){if(this._listeners===void 0)return;const i=this._listeners[t];if(i!==void 0){const r=i.indexOf(e);r!==-1&&i.splice(r,1)}}dispatchEvent(t){if(this._listeners===void 0)return;const n=this._listeners[t.type];if(n!==void 0){t.target=this;const i=n.slice(0);for(let r=0,o=i.length;r<o;r++)i[r].call(this,t);t.target=null}}}const fe=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],Is=Math.PI/180,Eo=180/Math.PI;function Xi(){const s=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(fe[s&255]+fe[s>>8&255]+fe[s>>16&255]+fe[s>>24&255]+"-"+fe[t&255]+fe[t>>8&255]+"-"+fe[t>>16&15|64]+fe[t>>24&255]+"-"+fe[e&63|128]+fe[e>>8&255]+"-"+fe[e>>16&255]+fe[e>>24&255]+fe[n&255]+fe[n>>8&255]+fe[n>>16&255]+fe[n>>24&255]).toLowerCase()}function be(s,t,e){return Math.max(t,Math.min(e,s))}function Tu(s,t){return(s%t+t)%t}function Qs(s,t,e){return(1-e)*s+e*t}function wi(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("Invalid component type.")}}function Se(s,t){switch(t.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("Invalid component type.")}}class Wt{constructor(t=0,e=0){Wt.prototype.isVector2=!0,this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){const e=this.x,n=this.y,i=t.elements;return this.x=i[0]*e+i[3]*n+i[6],this.y=i[1]*e+i[4]*n+i[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(be(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){const n=Math.cos(e),i=Math.sin(e),r=this.x-t.x,o=this.y-t.y;return this.x=r*n-o*i+t.x,this.y=r*i+o*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class It{constructor(t,e,n,i,r,o,a,c,l){It.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,o,a,c,l)}set(t,e,n,i,r,o,a,c,l){const u=this.elements;return u[0]=t,u[1]=i,u[2]=a,u[3]=e,u[4]=r,u[5]=c,u[6]=n,u[7]=o,u[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){const e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[3],c=n[6],l=n[1],u=n[4],p=n[7],d=n[2],h=n[5],g=n[8],v=i[0],m=i[3],f=i[6],_=i[1],M=i[4],x=i[7],A=i[2],w=i[5],T=i[8];return r[0]=o*v+a*_+c*A,r[3]=o*m+a*M+c*w,r[6]=o*f+a*x+c*T,r[1]=l*v+u*_+p*A,r[4]=l*m+u*M+p*w,r[7]=l*f+u*x+p*T,r[2]=d*v+h*_+g*A,r[5]=d*m+h*M+g*w,r[8]=d*f+h*x+g*T,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],u=t[8];return e*o*u-e*a*l-n*r*u+n*a*c+i*r*l-i*o*c}invert(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],u=t[8],p=u*o-a*l,d=a*c-u*r,h=l*r-o*c,g=e*p+n*d+i*h;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);const v=1/g;return t[0]=p*v,t[1]=(i*l-u*n)*v,t[2]=(a*n-i*o)*v,t[3]=d*v,t[4]=(u*e-i*c)*v,t[5]=(i*r-a*e)*v,t[6]=h*v,t[7]=(n*c-l*e)*v,t[8]=(o*e-n*r)*v,this}transpose(){let t;const e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){const e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,i,r,o,a){const c=Math.cos(r),l=Math.sin(r);return this.set(n*c,n*l,-n*(c*o+l*a)+o+t,-i*l,i*c,-i*(-l*o+c*a)+a+e,0,0,1),this}scale(t,e){return this.premultiply(tr.makeScale(t,e)),this}rotate(t){return this.premultiply(tr.makeRotation(-t)),this}translate(t,e){return this.premultiply(tr.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){const e=this.elements,n=t.elements;for(let i=0;i<9;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}}const tr=new It;function tc(s){for(let t=s.length-1;t>=0;--t)if(s[t]>=65535)return!0;return!1}function ks(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Au(){const s=ks("canvas");return s.style.display="block",s}const va={};function Fi(s){s in va||(va[s]=!0,console.warn(s))}function Cu(s,t,e){return new Promise(function(n,i){function r(){switch(s.clientWaitSync(t,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:i();break;case s.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}function Ru(s){const t=s.elements;t[2]=.5*t[2]+.5*t[3],t[6]=.5*t[6]+.5*t[7],t[10]=.5*t[10]+.5*t[11],t[14]=.5*t[14]+.5*t[15]}function Pu(s){const t=s.elements;t[11]===-1?(t[10]=-t[10]-1,t[14]=-t[14]):(t[10]=-t[10],t[14]=-t[14]+1)}const Vt={enabled:!0,workingColorSpace:gi,spaces:{},convert:function(s,t,e){return this.enabled===!1||t===e||!t||!e||(this.spaces[t].transfer===Kt&&(s.r=rn(s.r),s.g=rn(s.g),s.b=rn(s.b)),this.spaces[t].primaries!==this.spaces[e].primaries&&(s.applyMatrix3(this.spaces[t].toXYZ),s.applyMatrix3(this.spaces[e].fromXYZ)),this.spaces[e].transfer===Kt&&(s.r=ai(s.r),s.g=ai(s.g),s.b=ai(s.b))),s},fromWorkingColorSpace:function(s,t){return this.convert(s,this.workingColorSpace,t)},toWorkingColorSpace:function(s,t){return this.convert(s,t,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===qe?Xs:this.spaces[s].transfer},getLuminanceCoefficients:function(s,t=this.workingColorSpace){return s.fromArray(this.spaces[t].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,t,e){return s.copy(this.spaces[t].toXYZ).multiply(this.spaces[e].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace}};function rn(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function ai(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}const xa=[.64,.33,.3,.6,.15,.06],_a=[.2126,.7152,.0722],Ma=[.3127,.329],ya=new It().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Sa=new It().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);Vt.define({[gi]:{primaries:xa,whitePoint:Ma,transfer:Xs,toXYZ:ya,fromXYZ:Sa,luminanceCoefficients:_a,workingColorSpaceConfig:{unpackColorSpace:Ie},outputColorSpaceConfig:{drawingBufferColorSpace:Ie}},[Ie]:{primaries:xa,whitePoint:Ma,transfer:Kt,toXYZ:ya,fromXYZ:Sa,luminanceCoefficients:_a,outputColorSpaceConfig:{drawingBufferColorSpace:Ie}}});let Vn;class Lu{static getDataURL(t){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let e;if(t instanceof HTMLCanvasElement)e=t;else{Vn===void 0&&(Vn=ks("canvas")),Vn.width=t.width,Vn.height=t.height;const n=Vn.getContext("2d");t instanceof ImageData?n.putImageData(t,0,0):n.drawImage(t,0,0,t.width,t.height),e=Vn}return e.width>2048||e.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",t),e.toDataURL("image/jpeg",.6)):e.toDataURL("image/png")}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){const e=ks("canvas");e.width=t.width,e.height=t.height;const n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);const i=n.getImageData(0,0,t.width,t.height),r=i.data;for(let o=0;o<r.length;o++)r[o]=rn(r[o]/255)*255;return n.putImageData(i,0,0),e}else if(t.data){const e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(rn(e[n]/255)*255):e[n]=rn(e[n]);return{data:e,width:t.width,height:t.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}}let Du=0;class ec{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Du++}),this.uuid=Xi(),this.data=t,this.dataReady=!0,this.version=0}set needsUpdate(t){t===!0&&this.version++}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];const n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let o=0,a=i.length;o<a;o++)i[o].isDataTexture?r.push(er(i[o].image)):r.push(er(i[o]))}else r=er(i);n.url=r}return e||(t.images[this.uuid]=n),n}}function er(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?Lu.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}let Iu=0;class _e extends vi{constructor(t=_e.DEFAULT_IMAGE,e=_e.DEFAULT_MAPPING,n=Dn,i=Dn,r=Ee,o=In,a=we,c=Ne,l=_e.DEFAULT_ANISOTROPY,u=qe){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Iu++}),this.uuid=Xi(),this.name="",this.source=new ec(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=o,this.anisotropy=l,this.format=a,this.internalFormat=null,this.type=c,this.offset=new Wt(0,0),this.repeat=new Wt(1,1),this.center=new Wt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new It,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=u,this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(t=null){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}toJSON(t){const e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];const n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==Vl)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case jr:t.x=t.x-Math.floor(t.x);break;case Dn:t.x=t.x<0?0:1;break;case Kr:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case jr:t.y=t.y-Math.floor(t.y);break;case Dn:t.y=t.y<0?0:1;break;case Kr:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}}_e.DEFAULT_IMAGE=null;_e.DEFAULT_MAPPING=Vl;_e.DEFAULT_ANISOTROPY=1;class Zt{constructor(t=0,e=0,n=0,i=1){Zt.prototype.isVector4=!0,this.x=t,this.y=e,this.z=n,this.w=i}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,i){return this.x=t,this.y=e,this.z=n,this.w=i,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){const e=this.x,n=this.y,i=this.z,r=this.w,o=t.elements;return this.x=o[0]*e+o[4]*n+o[8]*i+o[12]*r,this.y=o[1]*e+o[5]*n+o[9]*i+o[13]*r,this.z=o[2]*e+o[6]*n+o[10]*i+o[14]*r,this.w=o[3]*e+o[7]*n+o[11]*i+o[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);const e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,i,r;const c=t.elements,l=c[0],u=c[4],p=c[8],d=c[1],h=c[5],g=c[9],v=c[2],m=c[6],f=c[10];if(Math.abs(u-d)<.01&&Math.abs(p-v)<.01&&Math.abs(g-m)<.01){if(Math.abs(u+d)<.1&&Math.abs(p+v)<.1&&Math.abs(g+m)<.1&&Math.abs(l+h+f-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;const M=(l+1)/2,x=(h+1)/2,A=(f+1)/2,w=(u+d)/4,T=(p+v)/4,P=(g+m)/4;return M>x&&M>A?M<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(M),i=w/n,r=T/n):x>A?x<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(x),n=w/i,r=P/i):A<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(A),n=T/r,i=P/r),this.set(n,i,r,e),this}let _=Math.sqrt((m-g)*(m-g)+(p-v)*(p-v)+(d-u)*(d-u));return Math.abs(_)<.001&&(_=1),this.x=(m-g)/_,this.y=(p-v)/_,this.z=(d-u)/_,this.w=Math.acos((l+h+f-1)/2),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this.w=Math.max(t.w,Math.min(e.w,this.w)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this.z=Math.max(t,Math.min(e,this.z)),this.w=Math.max(t,Math.min(e,this.w)),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class Uu extends vi{constructor(t=1,e=1,n={}){super(),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=1,this.scissor=new Zt(0,0,t,e),this.scissorTest=!1,this.viewport=new Zt(0,0,t,e);const i={width:t,height:e,depth:1};n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Ee,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1},n);const r=new _e(i,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace);r.flipY=!1,r.generateMipmaps=n.generateMipmaps,r.internalFormat=n.internalFormat,this.textures=[];const o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0;this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this.depthTexture=n.depthTexture,this.samples=n.samples}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)this.textures[i].image.width=t,this.textures[i].image.height=e,this.textures[i].image.depth=n;this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let n=0,i=t.textures.length;n<i;n++)this.textures[n]=t.textures[n].clone(),this.textures[n].isRenderTargetTexture=!0;const e=Object.assign({},t.texture.image);return this.texture.source=new ec(e),this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class _n extends Uu{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}}class nc extends _e{constructor(t=null,e=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=xe,this.minFilter=xe,this.wrapR=Dn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}}class ic extends _e{constructor(t=null,e=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:i},this.magFilter=xe,this.minFilter=xe,this.wrapR=Dn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Yi{constructor(t=0,e=0,n=0,i=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=i}static slerpFlat(t,e,n,i,r,o,a){let c=n[i+0],l=n[i+1],u=n[i+2],p=n[i+3];const d=r[o+0],h=r[o+1],g=r[o+2],v=r[o+3];if(a===0){t[e+0]=c,t[e+1]=l,t[e+2]=u,t[e+3]=p;return}if(a===1){t[e+0]=d,t[e+1]=h,t[e+2]=g,t[e+3]=v;return}if(p!==v||c!==d||l!==h||u!==g){let m=1-a;const f=c*d+l*h+u*g+p*v,_=f>=0?1:-1,M=1-f*f;if(M>Number.EPSILON){const A=Math.sqrt(M),w=Math.atan2(A,f*_);m=Math.sin(m*w)/A,a=Math.sin(a*w)/A}const x=a*_;if(c=c*m+d*x,l=l*m+h*x,u=u*m+g*x,p=p*m+v*x,m===1-a){const A=1/Math.sqrt(c*c+l*l+u*u+p*p);c*=A,l*=A,u*=A,p*=A}}t[e]=c,t[e+1]=l,t[e+2]=u,t[e+3]=p}static multiplyQuaternionsFlat(t,e,n,i,r,o){const a=n[i],c=n[i+1],l=n[i+2],u=n[i+3],p=r[o],d=r[o+1],h=r[o+2],g=r[o+3];return t[e]=a*g+u*p+c*h-l*d,t[e+1]=c*g+u*d+l*p-a*h,t[e+2]=l*g+u*h+a*d-c*p,t[e+3]=u*g-a*p-c*d-l*h,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,i){return this._x=t,this._y=e,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){const n=t._x,i=t._y,r=t._z,o=t._order,a=Math.cos,c=Math.sin,l=a(n/2),u=a(i/2),p=a(r/2),d=c(n/2),h=c(i/2),g=c(r/2);switch(o){case"XYZ":this._x=d*u*p+l*h*g,this._y=l*h*p-d*u*g,this._z=l*u*g+d*h*p,this._w=l*u*p-d*h*g;break;case"YXZ":this._x=d*u*p+l*h*g,this._y=l*h*p-d*u*g,this._z=l*u*g-d*h*p,this._w=l*u*p+d*h*g;break;case"ZXY":this._x=d*u*p-l*h*g,this._y=l*h*p+d*u*g,this._z=l*u*g+d*h*p,this._w=l*u*p-d*h*g;break;case"ZYX":this._x=d*u*p-l*h*g,this._y=l*h*p+d*u*g,this._z=l*u*g-d*h*p,this._w=l*u*p+d*h*g;break;case"YZX":this._x=d*u*p+l*h*g,this._y=l*h*p+d*u*g,this._z=l*u*g-d*h*p,this._w=l*u*p-d*h*g;break;case"XZY":this._x=d*u*p-l*h*g,this._y=l*h*p-d*u*g,this._z=l*u*g+d*h*p,this._w=l*u*p+d*h*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){const n=e/2,i=Math.sin(n);return this._x=t.x*i,this._y=t.y*i,this._z=t.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){const e=t.elements,n=e[0],i=e[4],r=e[8],o=e[1],a=e[5],c=e[9],l=e[2],u=e[6],p=e[10],d=n+a+p;if(d>0){const h=.5/Math.sqrt(d+1);this._w=.25/h,this._x=(u-c)*h,this._y=(r-l)*h,this._z=(o-i)*h}else if(n>a&&n>p){const h=2*Math.sqrt(1+n-a-p);this._w=(u-c)/h,this._x=.25*h,this._y=(i+o)/h,this._z=(r+l)/h}else if(a>p){const h=2*Math.sqrt(1+a-n-p);this._w=(r-l)/h,this._x=(i+o)/h,this._y=.25*h,this._z=(c+u)/h}else{const h=2*Math.sqrt(1+p-n-a);this._w=(o-i)/h,this._x=(r+l)/h,this._y=(c+u)/h,this._z=.25*h}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<Number.EPSILON?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(be(this.dot(t),-1,1)))}rotateTowards(t,e){const n=this.angleTo(t);if(n===0)return this;const i=Math.min(1,e/n);return this.slerp(t,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){const n=t._x,i=t._y,r=t._z,o=t._w,a=e._x,c=e._y,l=e._z,u=e._w;return this._x=n*u+o*a+i*l-r*c,this._y=i*u+o*c+r*a-n*l,this._z=r*u+o*l+n*c-i*a,this._w=o*u-n*a-i*c-r*l,this._onChangeCallback(),this}slerp(t,e){if(e===0)return this;if(e===1)return this.copy(t);const n=this._x,i=this._y,r=this._z,o=this._w;let a=o*t._w+n*t._x+i*t._y+r*t._z;if(a<0?(this._w=-t._w,this._x=-t._x,this._y=-t._y,this._z=-t._z,a=-a):this.copy(t),a>=1)return this._w=o,this._x=n,this._y=i,this._z=r,this;const c=1-a*a;if(c<=Number.EPSILON){const h=1-e;return this._w=h*o+e*this._w,this._x=h*n+e*this._x,this._y=h*i+e*this._y,this._z=h*r+e*this._z,this.normalize(),this}const l=Math.sqrt(c),u=Math.atan2(l,a),p=Math.sin((1-e)*u)/l,d=Math.sin(e*u)/l;return this._w=o*p+this._w*d,this._x=n*p+this._x*d,this._y=i*p+this._y*d,this._z=r*p+this._z*d,this._onChangeCallback(),this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){const t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(t),i*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class B{constructor(t=0,e=0,n=0){B.prototype.isVector3=!0,this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(ba.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(ba.setFromAxisAngle(t,e))}applyMatrix3(t){const e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*i,this.y=r[1]*e+r[4]*n+r[7]*i,this.z=r[2]*e+r[5]*n+r[8]*i,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){const e=this.x,n=this.y,i=this.z,r=t.elements,o=1/(r[3]*e+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*i+r[12])*o,this.y=(r[1]*e+r[5]*n+r[9]*i+r[13])*o,this.z=(r[2]*e+r[6]*n+r[10]*i+r[14])*o,this}applyQuaternion(t){const e=this.x,n=this.y,i=this.z,r=t.x,o=t.y,a=t.z,c=t.w,l=2*(o*i-a*n),u=2*(a*e-r*i),p=2*(r*n-o*e);return this.x=e+c*l+o*p-a*u,this.y=n+c*u+a*l-r*p,this.z=i+c*p+r*u-o*l,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){const e=this.x,n=this.y,i=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*i,this.y=r[1]*e+r[5]*n+r[9]*i,this.z=r[2]*e+r[6]*n+r[10]*i,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=Math.max(t.x,Math.min(e.x,this.x)),this.y=Math.max(t.y,Math.min(e.y,this.y)),this.z=Math.max(t.z,Math.min(e.z,this.z)),this}clampScalar(t,e){return this.x=Math.max(t,Math.min(e,this.x)),this.y=Math.max(t,Math.min(e,this.y)),this.z=Math.max(t,Math.min(e,this.z)),this}clampLength(t,e){const n=this.length();return this.divideScalar(n||1).multiplyScalar(Math.max(t,Math.min(e,n)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){const n=t.x,i=t.y,r=t.z,o=e.x,a=e.y,c=e.z;return this.x=i*c-r*a,this.y=r*o-n*c,this.z=n*a-i*o,this}projectOnVector(t){const e=t.lengthSq();if(e===0)return this.set(0,0,0);const n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return nr.copy(this).projectOnVector(t),this.sub(nr)}reflect(t){return this.sub(nr.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){const e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;const n=this.dot(t)/e;return Math.acos(be(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){const e=this.x-t.x,n=this.y-t.y,i=this.z-t.z;return e*e+n*n+i*i}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){const i=Math.sin(e)*t;return this.x=i*Math.sin(n),this.y=Math.cos(e)*t,this.z=i*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){const e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){const e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),i=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=i,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const nr=new B,ba=new Yi;class Bn{constructor(t=new B(1/0,1/0,1/0),e=new B(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(Oe.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(Oe.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){const n=Oe.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);const n=t.geometry;if(n!==void 0){const r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)t.isMesh===!0?t.getVertexPosition(o,Oe):Oe.fromBufferAttribute(r,o),Oe.applyMatrix4(t.matrixWorld),this.expandByPoint(Oe);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),Qi.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Qi.copy(n.boundingBox)),Qi.applyMatrix4(t.matrixWorld),this.union(Qi)}const i=t.children;for(let r=0,o=i.length;r<o;r++)this.expandByObject(i[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,Oe),Oe.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(Ti),ts.subVectors(this.max,Ti),Gn.subVectors(t.a,Ti),Wn.subVectors(t.b,Ti),qn.subVectors(t.c,Ti),cn.subVectors(Wn,Gn),hn.subVectors(qn,Wn),Sn.subVectors(Gn,qn);let e=[0,-cn.z,cn.y,0,-hn.z,hn.y,0,-Sn.z,Sn.y,cn.z,0,-cn.x,hn.z,0,-hn.x,Sn.z,0,-Sn.x,-cn.y,cn.x,0,-hn.y,hn.x,0,-Sn.y,Sn.x,0];return!ir(e,Gn,Wn,qn,ts)||(e=[1,0,0,0,1,0,0,0,1],!ir(e,Gn,Wn,qn,ts))?!1:(es.crossVectors(cn,hn),e=[es.x,es.y,es.z],ir(e,Gn,Wn,qn,ts))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,Oe).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(Oe).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(Ke[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),Ke[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),Ke[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),Ke[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),Ke[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),Ke[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),Ke[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),Ke[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(Ke),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}}const Ke=[new B,new B,new B,new B,new B,new B,new B,new B],Oe=new B,Qi=new Bn,Gn=new B,Wn=new B,qn=new B,cn=new B,hn=new B,Sn=new B,Ti=new B,ts=new B,es=new B,bn=new B;function ir(s,t,e,n,i){for(let r=0,o=s.length-3;r<=o;r+=3){bn.fromArray(s,r);const a=i.x*Math.abs(bn.x)+i.y*Math.abs(bn.y)+i.z*Math.abs(bn.z),c=t.dot(bn),l=e.dot(bn),u=n.dot(bn);if(Math.max(-Math.max(c,l,u),Math.min(c,l,u))>a)return!1}return!0}const Nu=new Bn,Ai=new B,sr=new B;class xi{constructor(t=new B,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){const n=this.center;e!==void 0?n.copy(e):Nu.setFromPoints(t).getCenter(n);let i=0;for(let r=0,o=t.length;r<o;r++)i=Math.max(i,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(i),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){const e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){const n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;Ai.subVectors(t,this.center);const e=Ai.lengthSq();if(e>this.radius*this.radius){const n=Math.sqrt(e),i=(n-this.radius)*.5;this.center.addScaledVector(Ai,i/n),this.radius+=i}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(sr.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(Ai.copy(t.center).add(sr)),this.expandByPoint(Ai.copy(t.center).sub(sr))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}}const Ze=new B,rr=new B,ns=new B,un=new B,or=new B,is=new B,ar=new B;class sc{constructor(t=new B,e=new B(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,Ze)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);const n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){const e=Ze.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(Ze.copy(this.origin).addScaledVector(this.direction,e),Ze.distanceToSquared(t))}distanceSqToSegment(t,e,n,i){rr.copy(t).add(e).multiplyScalar(.5),ns.copy(e).sub(t).normalize(),un.copy(this.origin).sub(rr);const r=t.distanceTo(e)*.5,o=-this.direction.dot(ns),a=un.dot(this.direction),c=-un.dot(ns),l=un.lengthSq(),u=Math.abs(1-o*o);let p,d,h,g;if(u>0)if(p=o*c-a,d=o*a-c,g=r*u,p>=0)if(d>=-g)if(d<=g){const v=1/u;p*=v,d*=v,h=p*(p+o*d+2*a)+d*(o*p+d+2*c)+l}else d=r,p=Math.max(0,-(o*d+a)),h=-p*p+d*(d+2*c)+l;else d=-r,p=Math.max(0,-(o*d+a)),h=-p*p+d*(d+2*c)+l;else d<=-g?(p=Math.max(0,-(-o*r+a)),d=p>0?-r:Math.min(Math.max(-r,-c),r),h=-p*p+d*(d+2*c)+l):d<=g?(p=0,d=Math.min(Math.max(-r,-c),r),h=d*(d+2*c)+l):(p=Math.max(0,-(o*r+a)),d=p>0?r:Math.min(Math.max(-r,-c),r),h=-p*p+d*(d+2*c)+l);else d=o>0?-r:r,p=Math.max(0,-(o*d+a)),h=-p*p+d*(d+2*c)+l;return n&&n.copy(this.origin).addScaledVector(this.direction,p),i&&i.copy(rr).addScaledVector(ns,d),h}intersectSphere(t,e){Ze.subVectors(t.center,this.origin);const n=Ze.dot(this.direction),i=Ze.dot(Ze)-n*n,r=t.radius*t.radius;if(i>r)return null;const o=Math.sqrt(r-i),a=n-o,c=n+o;return c<0?null:a<0?this.at(c,e):this.at(a,e)}intersectsSphere(t){return this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){const e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;const n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){const n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){const e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,i,r,o,a,c;const l=1/this.direction.x,u=1/this.direction.y,p=1/this.direction.z,d=this.origin;return l>=0?(n=(t.min.x-d.x)*l,i=(t.max.x-d.x)*l):(n=(t.max.x-d.x)*l,i=(t.min.x-d.x)*l),u>=0?(r=(t.min.y-d.y)*u,o=(t.max.y-d.y)*u):(r=(t.max.y-d.y)*u,o=(t.min.y-d.y)*u),n>o||r>i||((r>n||isNaN(n))&&(n=r),(o<i||isNaN(i))&&(i=o),p>=0?(a=(t.min.z-d.z)*p,c=(t.max.z-d.z)*p):(a=(t.max.z-d.z)*p,c=(t.min.z-d.z)*p),n>c||a>i)||((a>n||n!==n)&&(n=a),(c<i||i!==i)&&(i=c),i<0)?null:this.at(n>=0?n:i,e)}intersectsBox(t){return this.intersectBox(t,Ze)!==null}intersectTriangle(t,e,n,i,r){or.subVectors(e,t),is.subVectors(n,t),ar.crossVectors(or,is);let o=this.direction.dot(ar),a;if(o>0){if(i)return null;a=1}else if(o<0)a=-1,o=-o;else return null;un.subVectors(this.origin,t);const c=a*this.direction.dot(is.crossVectors(un,is));if(c<0)return null;const l=a*this.direction.dot(or.cross(un));if(l<0||c+l>o)return null;const u=-a*un.dot(ar);return u<0?null:this.at(u/o,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Jt{constructor(t,e,n,i,r,o,a,c,l,u,p,d,h,g,v,m){Jt.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,i,r,o,a,c,l,u,p,d,h,g,v,m)}set(t,e,n,i,r,o,a,c,l,u,p,d,h,g,v,m){const f=this.elements;return f[0]=t,f[4]=e,f[8]=n,f[12]=i,f[1]=r,f[5]=o,f[9]=a,f[13]=c,f[2]=l,f[6]=u,f[10]=p,f[14]=d,f[3]=h,f[7]=g,f[11]=v,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Jt().fromArray(this.elements)}copy(t){const e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){const e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){const e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){const e=this.elements,n=t.elements,i=1/Xn.setFromMatrixColumn(t,0).length(),r=1/Xn.setFromMatrixColumn(t,1).length(),o=1/Xn.setFromMatrixColumn(t,2).length();return e[0]=n[0]*i,e[1]=n[1]*i,e[2]=n[2]*i,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*o,e[9]=n[9]*o,e[10]=n[10]*o,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){const e=this.elements,n=t.x,i=t.y,r=t.z,o=Math.cos(n),a=Math.sin(n),c=Math.cos(i),l=Math.sin(i),u=Math.cos(r),p=Math.sin(r);if(t.order==="XYZ"){const d=o*u,h=o*p,g=a*u,v=a*p;e[0]=c*u,e[4]=-c*p,e[8]=l,e[1]=h+g*l,e[5]=d-v*l,e[9]=-a*c,e[2]=v-d*l,e[6]=g+h*l,e[10]=o*c}else if(t.order==="YXZ"){const d=c*u,h=c*p,g=l*u,v=l*p;e[0]=d+v*a,e[4]=g*a-h,e[8]=o*l,e[1]=o*p,e[5]=o*u,e[9]=-a,e[2]=h*a-g,e[6]=v+d*a,e[10]=o*c}else if(t.order==="ZXY"){const d=c*u,h=c*p,g=l*u,v=l*p;e[0]=d-v*a,e[4]=-o*p,e[8]=g+h*a,e[1]=h+g*a,e[5]=o*u,e[9]=v-d*a,e[2]=-o*l,e[6]=a,e[10]=o*c}else if(t.order==="ZYX"){const d=o*u,h=o*p,g=a*u,v=a*p;e[0]=c*u,e[4]=g*l-h,e[8]=d*l+v,e[1]=c*p,e[5]=v*l+d,e[9]=h*l-g,e[2]=-l,e[6]=a*c,e[10]=o*c}else if(t.order==="YZX"){const d=o*c,h=o*l,g=a*c,v=a*l;e[0]=c*u,e[4]=v-d*p,e[8]=g*p+h,e[1]=p,e[5]=o*u,e[9]=-a*u,e[2]=-l*u,e[6]=h*p+g,e[10]=d-v*p}else if(t.order==="XZY"){const d=o*c,h=o*l,g=a*c,v=a*l;e[0]=c*u,e[4]=-p,e[8]=l*u,e[1]=d*p+v,e[5]=o*u,e[9]=h*p-g,e[2]=g*p-h,e[6]=a*u,e[10]=v*p+d}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(Fu,t,ku)}lookAt(t,e,n){const i=this.elements;return Ce.subVectors(t,e),Ce.lengthSq()===0&&(Ce.z=1),Ce.normalize(),dn.crossVectors(n,Ce),dn.lengthSq()===0&&(Math.abs(n.z)===1?Ce.x+=1e-4:Ce.z+=1e-4,Ce.normalize(),dn.crossVectors(n,Ce)),dn.normalize(),ss.crossVectors(Ce,dn),i[0]=dn.x,i[4]=ss.x,i[8]=Ce.x,i[1]=dn.y,i[5]=ss.y,i[9]=Ce.y,i[2]=dn.z,i[6]=ss.z,i[10]=Ce.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){const n=t.elements,i=e.elements,r=this.elements,o=n[0],a=n[4],c=n[8],l=n[12],u=n[1],p=n[5],d=n[9],h=n[13],g=n[2],v=n[6],m=n[10],f=n[14],_=n[3],M=n[7],x=n[11],A=n[15],w=i[0],T=i[4],P=i[8],S=i[12],y=i[1],C=i[5],I=i[9],D=i[13],G=i[2],q=i[6],U=i[10],H=i[14],z=i[3],et=i[7],tt=i[11],st=i[15];return r[0]=o*w+a*y+c*G+l*z,r[4]=o*T+a*C+c*q+l*et,r[8]=o*P+a*I+c*U+l*tt,r[12]=o*S+a*D+c*H+l*st,r[1]=u*w+p*y+d*G+h*z,r[5]=u*T+p*C+d*q+h*et,r[9]=u*P+p*I+d*U+h*tt,r[13]=u*S+p*D+d*H+h*st,r[2]=g*w+v*y+m*G+f*z,r[6]=g*T+v*C+m*q+f*et,r[10]=g*P+v*I+m*U+f*tt,r[14]=g*S+v*D+m*H+f*st,r[3]=_*w+M*y+x*G+A*z,r[7]=_*T+M*C+x*q+A*et,r[11]=_*P+M*I+x*U+A*tt,r[15]=_*S+M*D+x*H+A*st,this}multiplyScalar(t){const e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){const t=this.elements,e=t[0],n=t[4],i=t[8],r=t[12],o=t[1],a=t[5],c=t[9],l=t[13],u=t[2],p=t[6],d=t[10],h=t[14],g=t[3],v=t[7],m=t[11],f=t[15];return g*(+r*c*p-i*l*p-r*a*d+n*l*d+i*a*h-n*c*h)+v*(+e*c*h-e*l*d+r*o*d-i*o*h+i*l*u-r*c*u)+m*(+e*l*p-e*a*h-r*o*p+n*o*h+r*a*u-n*l*u)+f*(-i*a*u-e*c*p+e*a*d+i*o*p-n*o*d+n*c*u)}transpose(){const t=this.elements;let e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){const i=this.elements;return t.isVector3?(i[12]=t.x,i[13]=t.y,i[14]=t.z):(i[12]=t,i[13]=e,i[14]=n),this}invert(){const t=this.elements,e=t[0],n=t[1],i=t[2],r=t[3],o=t[4],a=t[5],c=t[6],l=t[7],u=t[8],p=t[9],d=t[10],h=t[11],g=t[12],v=t[13],m=t[14],f=t[15],_=p*m*l-v*d*l+v*c*h-a*m*h-p*c*f+a*d*f,M=g*d*l-u*m*l-g*c*h+o*m*h+u*c*f-o*d*f,x=u*v*l-g*p*l+g*a*h-o*v*h-u*a*f+o*p*f,A=g*p*c-u*v*c-g*a*d+o*v*d+u*a*m-o*p*m,w=e*_+n*M+i*x+r*A;if(w===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const T=1/w;return t[0]=_*T,t[1]=(v*d*r-p*m*r-v*i*h+n*m*h+p*i*f-n*d*f)*T,t[2]=(a*m*r-v*c*r+v*i*l-n*m*l-a*i*f+n*c*f)*T,t[3]=(p*c*r-a*d*r-p*i*l+n*d*l+a*i*h-n*c*h)*T,t[4]=M*T,t[5]=(u*m*r-g*d*r+g*i*h-e*m*h-u*i*f+e*d*f)*T,t[6]=(g*c*r-o*m*r-g*i*l+e*m*l+o*i*f-e*c*f)*T,t[7]=(o*d*r-u*c*r+u*i*l-e*d*l-o*i*h+e*c*h)*T,t[8]=x*T,t[9]=(g*p*r-u*v*r-g*n*h+e*v*h+u*n*f-e*p*f)*T,t[10]=(o*v*r-g*a*r+g*n*l-e*v*l-o*n*f+e*a*f)*T,t[11]=(u*a*r-o*p*r-u*n*l+e*p*l+o*n*h-e*a*h)*T,t[12]=A*T,t[13]=(u*v*i-g*p*i+g*n*d-e*v*d-u*n*m+e*p*m)*T,t[14]=(g*a*i-o*v*i-g*n*c+e*v*c+o*n*m-e*a*m)*T,t[15]=(o*p*i-u*a*i+u*n*c-e*p*c-o*n*d+e*a*d)*T,this}scale(t){const e=this.elements,n=t.x,i=t.y,r=t.z;return e[0]*=n,e[4]*=i,e[8]*=r,e[1]*=n,e[5]*=i,e[9]*=r,e[2]*=n,e[6]*=i,e[10]*=r,e[3]*=n,e[7]*=i,e[11]*=r,this}getMaxScaleOnAxis(){const t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],i=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,i))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){const e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){const e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){const n=Math.cos(e),i=Math.sin(e),r=1-n,o=t.x,a=t.y,c=t.z,l=r*o,u=r*a;return this.set(l*o+n,l*a-i*c,l*c+i*a,0,l*a+i*c,u*a+n,u*c-i*o,0,l*c-i*a,u*c+i*o,r*c*c+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,i,r,o){return this.set(1,n,r,0,t,1,o,0,e,i,1,0,0,0,0,1),this}compose(t,e,n){const i=this.elements,r=e._x,o=e._y,a=e._z,c=e._w,l=r+r,u=o+o,p=a+a,d=r*l,h=r*u,g=r*p,v=o*u,m=o*p,f=a*p,_=c*l,M=c*u,x=c*p,A=n.x,w=n.y,T=n.z;return i[0]=(1-(v+f))*A,i[1]=(h+x)*A,i[2]=(g-M)*A,i[3]=0,i[4]=(h-x)*w,i[5]=(1-(d+f))*w,i[6]=(m+_)*w,i[7]=0,i[8]=(g+M)*T,i[9]=(m-_)*T,i[10]=(1-(d+v))*T,i[11]=0,i[12]=t.x,i[13]=t.y,i[14]=t.z,i[15]=1,this}decompose(t,e,n){const i=this.elements;let r=Xn.set(i[0],i[1],i[2]).length();const o=Xn.set(i[4],i[5],i[6]).length(),a=Xn.set(i[8],i[9],i[10]).length();this.determinant()<0&&(r=-r),t.x=i[12],t.y=i[13],t.z=i[14],Be.copy(this);const l=1/r,u=1/o,p=1/a;return Be.elements[0]*=l,Be.elements[1]*=l,Be.elements[2]*=l,Be.elements[4]*=u,Be.elements[5]*=u,Be.elements[6]*=u,Be.elements[8]*=p,Be.elements[9]*=p,Be.elements[10]*=p,e.setFromRotationMatrix(Be),n.x=r,n.y=o,n.z=a,this}makePerspective(t,e,n,i,r,o,a=nn){const c=this.elements,l=2*r/(e-t),u=2*r/(n-i),p=(e+t)/(e-t),d=(n+i)/(n-i);let h,g;if(a===nn)h=-(o+r)/(o-r),g=-2*o*r/(o-r);else if(a===Fs)h=-o/(o-r),g=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=l,c[4]=0,c[8]=p,c[12]=0,c[1]=0,c[5]=u,c[9]=d,c[13]=0,c[2]=0,c[6]=0,c[10]=h,c[14]=g,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,i,r,o,a=nn){const c=this.elements,l=1/(e-t),u=1/(n-i),p=1/(o-r),d=(e+t)*l,h=(n+i)*u;let g,v;if(a===nn)g=(o+r)*p,v=-2*p;else if(a===Fs)g=r*p,v=-1*p;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=2*l,c[4]=0,c[8]=0,c[12]=-d,c[1]=0,c[5]=2*u,c[9]=0,c[13]=-h,c[2]=0,c[6]=0,c[10]=v,c[14]=-g,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){const e=this.elements,n=t.elements;for(let i=0;i<16;i++)if(e[i]!==n[i])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){const n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}}const Xn=new B,Be=new Jt,Fu=new B(0,0,0),ku=new B(1,1,1),dn=new B,ss=new B,Ce=new B,Ea=new Jt,wa=new Yi;class Ye{constructor(t=0,e=0,n=0,i=Ye.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=i}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,i=this._order){return this._x=t,this._y=e,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){const i=t.elements,r=i[0],o=i[4],a=i[8],c=i[1],l=i[5],u=i[9],p=i[2],d=i[6],h=i[10];switch(e){case"XYZ":this._y=Math.asin(be(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-u,h),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(d,l),this._z=0);break;case"YXZ":this._x=Math.asin(-be(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(a,h),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-p,r),this._z=0);break;case"ZXY":this._x=Math.asin(be(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-p,h),this._z=Math.atan2(-o,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-be(p,-1,1)),Math.abs(p)<.9999999?(this._x=Math.atan2(d,h),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-o,l));break;case"YZX":this._z=Math.asin(be(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-u,l),this._y=Math.atan2(-p,r)):(this._x=0,this._y=Math.atan2(a,h));break;case"XZY":this._z=Math.asin(-be(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(d,l),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-u,h),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return Ea.makeRotationFromQuaternion(t),this.setFromRotationMatrix(Ea,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return wa.setFromEuler(this),this.setFromQuaternion(wa,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}Ye.DEFAULT_ORDER="XYZ";class rc{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}}let Ou=0;const Ta=new B,Yn=new Yi,Je=new Jt,rs=new B,Ci=new B,Bu=new B,zu=new Yi,Aa=new B(1,0,0),Ca=new B(0,1,0),Ra=new B(0,0,1),Pa={type:"added"},Hu={type:"removed"},$n={type:"childadded",child:null},lr={type:"childremoved",child:null};class oe extends vi{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Ou++}),this.uuid=Xi(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=oe.DEFAULT_UP.clone();const t=new B,e=new Ye,n=new Yi,i=new B(1,1,1);function r(){n.setFromEuler(e,!1)}function o(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Jt},normalMatrix:{value:new It}}),this.matrix=new Jt,this.matrixWorld=new Jt,this.matrixAutoUpdate=oe.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=oe.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new rc,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return Yn.setFromAxisAngle(t,e),this.quaternion.multiply(Yn),this}rotateOnWorldAxis(t,e){return Yn.setFromAxisAngle(t,e),this.quaternion.premultiply(Yn),this}rotateX(t){return this.rotateOnAxis(Aa,t)}rotateY(t){return this.rotateOnAxis(Ca,t)}rotateZ(t){return this.rotateOnAxis(Ra,t)}translateOnAxis(t,e){return Ta.copy(t).applyQuaternion(this.quaternion),this.position.add(Ta.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Aa,t)}translateY(t){return this.translateOnAxis(Ca,t)}translateZ(t){return this.translateOnAxis(Ra,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(Je.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?rs.copy(t):rs.set(t,e,n);const i=this.parent;this.updateWorldMatrix(!0,!1),Ci.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Je.lookAt(Ci,rs,this.up):Je.lookAt(rs,Ci,this.up),this.quaternion.setFromRotationMatrix(Je),i&&(Je.extractRotation(i.matrixWorld),Yn.setFromRotationMatrix(Je),this.quaternion.premultiply(Yn.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Pa),$n.child=t,this.dispatchEvent($n),$n.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}const e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(Hu),lr.child=t,this.dispatchEvent(lr),lr.child=null),this}removeFromParent(){const t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),Je.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),Je.multiply(t.parent.matrixWorld)),t.applyMatrix4(Je),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Pa),$n.child=t,this.dispatchEvent($n),$n.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,i=this.children.length;n<i;n++){const o=this.children[n].getObjectByProperty(t,e);if(o!==void 0)return o}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);const i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ci,t,Bu),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ci,zu,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);const e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].traverseVisible(t)}traverseAncestors(t){const e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);const e=this.children;for(let n=0,i=e.length;n<i;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e){const n=this.parent;if(t===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),e===!0){const i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].updateWorldMatrix(!1,!0)}}toJSON(t){const e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});const i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.visibility=this._visibility,i.active=this._active,i.bounds=this._bounds.map(a=>({boxInitialized:a.boxInitialized,boxMin:a.box.min.toArray(),boxMax:a.box.max.toArray(),sphereInitialized:a.sphereInitialized,sphereRadius:a.sphere.radius,sphereCenter:a.sphere.center.toArray()})),i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.geometryCount=this._geometryCount,i.matricesTexture=this._matricesTexture.toJSON(t),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(i.boundingSphere={center:i.boundingSphere.center.toArray(),radius:i.boundingSphere.radius}),this.boundingBox!==null&&(i.boundingBox={min:i.boundingBox.min.toArray(),max:i.boundingBox.max.toArray()}));function r(a,c){return a[c.uuid]===void 0&&(a[c.uuid]=c.toJSON(t)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(t.geometries,this.geometry);const a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){const c=a.shapes;if(Array.isArray(c))for(let l=0,u=c.length;l<u;l++){const p=c[l];r(t.shapes,p)}else r(t.shapes,c)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const a=[];for(let c=0,l=this.material.length;c<l;c++)a.push(r(t.materials,this.material[c]));i.material=a}else i.material=r(t.materials,this.material);if(this.children.length>0){i.children=[];for(let a=0;a<this.children.length;a++)i.children.push(this.children[a].toJSON(t).object)}if(this.animations.length>0){i.animations=[];for(let a=0;a<this.animations.length;a++){const c=this.animations[a];i.animations.push(r(t.animations,c))}}if(e){const a=o(t.geometries),c=o(t.materials),l=o(t.textures),u=o(t.images),p=o(t.shapes),d=o(t.skeletons),h=o(t.animations),g=o(t.nodes);a.length>0&&(n.geometries=a),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),u.length>0&&(n.images=u),p.length>0&&(n.shapes=p),d.length>0&&(n.skeletons=d),h.length>0&&(n.animations=h),g.length>0&&(n.nodes=g)}return n.object=i,n;function o(a){const c=[];for(const l in a){const u=a[l];delete u.metadata,c.push(u)}return c}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){const i=t.children[n];this.add(i.clone())}return this}}oe.DEFAULT_UP=new B(0,1,0);oe.DEFAULT_MATRIX_AUTO_UPDATE=!0;oe.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;const ze=new B,Qe=new B,cr=new B,tn=new B,jn=new B,Kn=new B,La=new B,hr=new B,ur=new B,dr=new B,fr=new Zt,pr=new Zt,mr=new Zt;class Ue{constructor(t=new B,e=new B,n=new B){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,i){i.subVectors(n,e),ze.subVectors(t,e),i.cross(ze);const r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(t,e,n,i,r){ze.subVectors(i,e),Qe.subVectors(n,e),cr.subVectors(t,e);const o=ze.dot(ze),a=ze.dot(Qe),c=ze.dot(cr),l=Qe.dot(Qe),u=Qe.dot(cr),p=o*l-a*a;if(p===0)return r.set(0,0,0),null;const d=1/p,h=(l*c-a*u)*d,g=(o*u-a*c)*d;return r.set(1-h-g,g,h)}static containsPoint(t,e,n,i){return this.getBarycoord(t,e,n,i,tn)===null?!1:tn.x>=0&&tn.y>=0&&tn.x+tn.y<=1}static getInterpolation(t,e,n,i,r,o,a,c){return this.getBarycoord(t,e,n,i,tn)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(r,tn.x),c.addScaledVector(o,tn.y),c.addScaledVector(a,tn.z),c)}static getInterpolatedAttribute(t,e,n,i,r,o){return fr.setScalar(0),pr.setScalar(0),mr.setScalar(0),fr.fromBufferAttribute(t,e),pr.fromBufferAttribute(t,n),mr.fromBufferAttribute(t,i),o.setScalar(0),o.addScaledVector(fr,r.x),o.addScaledVector(pr,r.y),o.addScaledVector(mr,r.z),o}static isFrontFacing(t,e,n,i){return ze.subVectors(n,e),Qe.subVectors(t,e),ze.cross(Qe).dot(i)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,i){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[i]),this}setFromAttributeAndIndices(t,e,n,i){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,i),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return ze.subVectors(this.c,this.b),Qe.subVectors(this.a,this.b),ze.cross(Qe).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return Ue.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return Ue.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,i,r){return Ue.getInterpolation(t,this.a,this.b,this.c,e,n,i,r)}containsPoint(t){return Ue.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return Ue.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){const n=this.a,i=this.b,r=this.c;let o,a;jn.subVectors(i,n),Kn.subVectors(r,n),hr.subVectors(t,n);const c=jn.dot(hr),l=Kn.dot(hr);if(c<=0&&l<=0)return e.copy(n);ur.subVectors(t,i);const u=jn.dot(ur),p=Kn.dot(ur);if(u>=0&&p<=u)return e.copy(i);const d=c*p-u*l;if(d<=0&&c>=0&&u<=0)return o=c/(c-u),e.copy(n).addScaledVector(jn,o);dr.subVectors(t,r);const h=jn.dot(dr),g=Kn.dot(dr);if(g>=0&&h<=g)return e.copy(r);const v=h*l-c*g;if(v<=0&&l>=0&&g<=0)return a=l/(l-g),e.copy(n).addScaledVector(Kn,a);const m=u*g-h*p;if(m<=0&&p-u>=0&&h-g>=0)return La.subVectors(r,i),a=(p-u)/(p-u+(h-g)),e.copy(i).addScaledVector(La,a);const f=1/(m+v+d);return o=v*f,a=d*f,e.copy(n).addScaledVector(jn,o).addScaledVector(Kn,a)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}}const oc={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},fn={h:0,s:0,l:0},os={h:0,s:0,l:0};function gr(s,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?s+(t-s)*6*e:e<1/2?t:e<2/3?s+(t-s)*6*(2/3-e):s}class Bt{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){const i=t;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=Ie){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,Vt.toWorkingColorSpace(this,e),this}setRGB(t,e,n,i=Vt.workingColorSpace){return this.r=t,this.g=e,this.b=n,Vt.toWorkingColorSpace(this,i),this}setHSL(t,e,n,i=Vt.workingColorSpace){if(t=Tu(t,1),e=be(e,0,1),n=be(n,0,1),e===0)this.r=this.g=this.b=n;else{const r=n<=.5?n*(1+e):n+e-n*e,o=2*n-r;this.r=gr(o,r,t+1/3),this.g=gr(o,r,t),this.b=gr(o,r,t-1/3)}return Vt.toWorkingColorSpace(this,i),this}setStyle(t,e=Ie){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+t+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(t)){let r;const o=i[1],a=i[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:console.warn("THREE.Color: Unknown color model "+t)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(t)){const r=i[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(o===6)return this.setHex(parseInt(r,16),e);console.warn("THREE.Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=Ie){const n=oc[t.toLowerCase()];return n!==void 0?this.setHex(n,e):console.warn("THREE.Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=rn(t.r),this.g=rn(t.g),this.b=rn(t.b),this}copyLinearToSRGB(t){return this.r=ai(t.r),this.g=ai(t.g),this.b=ai(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=Ie){return Vt.fromWorkingColorSpace(pe.copy(this),t),Math.round(be(pe.r*255,0,255))*65536+Math.round(be(pe.g*255,0,255))*256+Math.round(be(pe.b*255,0,255))}getHexString(t=Ie){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=Vt.workingColorSpace){Vt.fromWorkingColorSpace(pe.copy(this),e);const n=pe.r,i=pe.g,r=pe.b,o=Math.max(n,i,r),a=Math.min(n,i,r);let c,l;const u=(a+o)/2;if(a===o)c=0,l=0;else{const p=o-a;switch(l=u<=.5?p/(o+a):p/(2-o-a),o){case n:c=(i-r)/p+(i<r?6:0);break;case i:c=(r-n)/p+2;break;case r:c=(n-i)/p+4;break}c/=6}return t.h=c,t.s=l,t.l=u,t}getRGB(t,e=Vt.workingColorSpace){return Vt.fromWorkingColorSpace(pe.copy(this),e),t.r=pe.r,t.g=pe.g,t.b=pe.b,t}getStyle(t=Ie){Vt.fromWorkingColorSpace(pe.copy(this),t);const e=pe.r,n=pe.g,i=pe.b;return t!==Ie?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(t,e,n){return this.getHSL(fn),this.setHSL(fn.h+t,fn.s+e,fn.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(fn),t.getHSL(os);const n=Qs(fn.h,os.h,e),i=Qs(fn.s,os.s,e),r=Qs(fn.l,os.l,e);return this.setHSL(n,i,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){const e=this.r,n=this.g,i=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*i,this.g=r[1]*e+r[4]*n+r[7]*i,this.b=r[2]*e+r[5]*n+r[8]*i,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const pe=new Bt;Bt.NAMES=oc;let Vu=0;class _i extends vi{static get type(){return"Material"}get type(){return this.constructor.type}set type(t){}constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Vu++}),this.uuid=Xi(),this.name="",this.blending=ri,this.side=xn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Or,this.blendDst=Br,this.blendEquation=Pn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Bt(0,0,0),this.blendAlpha=0,this.depthFunc=ci,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=ma,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=Hn,this.stencilZFail=Hn,this.stencilZPass=Hn,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(const e in t){const n=t[e];if(n===void 0){console.warn(`THREE.Material: parameter '${e}' has value of undefined.`);continue}const i=this[e];if(i===void 0){console.warn(`THREE.Material: '${e}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[e]=n}}toJSON(t){const e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});const n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==ri&&(n.blending=this.blending),this.side!==xn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==Or&&(n.blendSrc=this.blendSrc),this.blendDst!==Br&&(n.blendDst=this.blendDst),this.blendEquation!==Pn&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==ci&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==ma&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==Hn&&(n.stencilFail=this.stencilFail),this.stencilZFail!==Hn&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==Hn&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){const o=[];for(const a in r){const c=r[a];delete c.metadata,o.push(c)}return o}if(e){const r=i(t.textures),o=i(t.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;const e=t.clippingPlanes;let n=null;if(e!==null){const i=e.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}onBuild(){console.warn("Material: onBuild() has been removed.")}}class Ho extends _i{static get type(){return"MeshBasicMaterial"}constructor(t){super(),this.isMeshBasicMaterial=!0,this.color=new Bt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ye,this.combine=Hl,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}}const re=new B,as=new Wt;class Me{constructor(t,e,n=!1){if(Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=ga,this.updateRanges=[],this.gpuType=Xe,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[t+i]=e.array[n+i];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)as.fromBufferAttribute(this,e),as.applyMatrix3(t),this.setXY(e,as.x,as.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)re.fromBufferAttribute(this,e),re.applyMatrix3(t),this.setXYZ(e,re.x,re.y,re.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)re.fromBufferAttribute(this,e),re.applyMatrix4(t),this.setXYZ(e,re.x,re.y,re.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)re.fromBufferAttribute(this,e),re.applyNormalMatrix(t),this.setXYZ(e,re.x,re.y,re.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)re.fromBufferAttribute(this,e),re.transformDirection(t),this.setXYZ(e,re.x,re.y,re.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=wi(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=Se(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=wi(e,this.array)),e}setX(t,e){return this.normalized&&(e=Se(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=wi(e,this.array)),e}setY(t,e){return this.normalized&&(e=Se(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=wi(e,this.array)),e}setZ(t,e){return this.normalized&&(e=Se(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=wi(e,this.array)),e}setW(t,e){return this.normalized&&(e=Se(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=Se(e,this.array),n=Se(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,i){return t*=this.itemSize,this.normalized&&(e=Se(e,this.array),n=Se(n,this.array),i=Se(i,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this}setXYZW(t,e,n,i,r){return t*=this.itemSize,this.normalized&&(e=Se(e,this.array),n=Se(n,this.array),i=Se(i,this.array),r=Se(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=i,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==ga&&(t.usage=this.usage),t}}class ac extends Me{constructor(t,e,n){super(new Uint16Array(t),e,n)}}class lc extends Me{constructor(t,e,n){super(new Uint32Array(t),e,n)}}class he extends Me{constructor(t,e,n){super(new Float32Array(t),e,n)}}let Gu=0;const De=new Jt,vr=new oe,Zn=new B,Re=new Bn,Ri=new Bn,ce=new B;class Te extends vi{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Gu++}),this.uuid=Xi(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(tc(t)?lc:ac)(t,1):this.index=t,this}setIndirect(t){return this.indirect=t,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){const e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);const n=this.attributes.normal;if(n!==void 0){const r=new It().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}const i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(t),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(t){return De.makeRotationFromQuaternion(t),this.applyMatrix4(De),this}rotateX(t){return De.makeRotationX(t),this.applyMatrix4(De),this}rotateY(t){return De.makeRotationY(t),this.applyMatrix4(De),this}rotateZ(t){return De.makeRotationZ(t),this.applyMatrix4(De),this}translate(t,e,n){return De.makeTranslation(t,e,n),this.applyMatrix4(De),this}scale(t,e,n){return De.makeScale(t,e,n),this.applyMatrix4(De),this}lookAt(t){return vr.lookAt(t),vr.updateMatrix(),this.applyMatrix4(vr.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Zn).negate(),this.translate(Zn.x,Zn.y,Zn.z),this}setFromPoints(t){const e=this.getAttribute("position");if(e===void 0){const n=[];for(let i=0,r=t.length;i<r;i++){const o=t[i];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new he(n,3))}else{for(let n=0,i=e.count;n<i;n++){const r=t[n];e.setXYZ(n,r.x,r.y,r.z||0)}t.length>e.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Bn);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new B(-1/0,-1/0,-1/0),new B(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,i=e.length;n<i;n++){const r=e[n];Re.setFromBufferAttribute(r),this.morphTargetsRelative?(ce.addVectors(this.boundingBox.min,Re.min),this.boundingBox.expandByPoint(ce),ce.addVectors(this.boundingBox.max,Re.max),this.boundingBox.expandByPoint(ce)):(this.boundingBox.expandByPoint(Re.min),this.boundingBox.expandByPoint(Re.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new xi);const t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new B,1/0);return}if(t){const n=this.boundingSphere.center;if(Re.setFromBufferAttribute(t),e)for(let r=0,o=e.length;r<o;r++){const a=e[r];Ri.setFromBufferAttribute(a),this.morphTargetsRelative?(ce.addVectors(Re.min,Ri.min),Re.expandByPoint(ce),ce.addVectors(Re.max,Ri.max),Re.expandByPoint(ce)):(Re.expandByPoint(Ri.min),Re.expandByPoint(Ri.max))}Re.getCenter(n);let i=0;for(let r=0,o=t.count;r<o;r++)ce.fromBufferAttribute(t,r),i=Math.max(i,n.distanceToSquared(ce));if(e)for(let r=0,o=e.length;r<o;r++){const a=e[r],c=this.morphTargetsRelative;for(let l=0,u=a.count;l<u;l++)ce.fromBufferAttribute(a,l),c&&(Zn.fromBufferAttribute(t,l),ce.add(Zn)),i=Math.max(i,n.distanceToSquared(ce))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const n=e.position,i=e.normal,r=e.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Me(new Float32Array(4*n.count),4));const o=this.getAttribute("tangent"),a=[],c=[];for(let P=0;P<n.count;P++)a[P]=new B,c[P]=new B;const l=new B,u=new B,p=new B,d=new Wt,h=new Wt,g=new Wt,v=new B,m=new B;function f(P,S,y){l.fromBufferAttribute(n,P),u.fromBufferAttribute(n,S),p.fromBufferAttribute(n,y),d.fromBufferAttribute(r,P),h.fromBufferAttribute(r,S),g.fromBufferAttribute(r,y),u.sub(l),p.sub(l),h.sub(d),g.sub(d);const C=1/(h.x*g.y-g.x*h.y);isFinite(C)&&(v.copy(u).multiplyScalar(g.y).addScaledVector(p,-h.y).multiplyScalar(C),m.copy(p).multiplyScalar(h.x).addScaledVector(u,-g.x).multiplyScalar(C),a[P].add(v),a[S].add(v),a[y].add(v),c[P].add(m),c[S].add(m),c[y].add(m))}let _=this.groups;_.length===0&&(_=[{start:0,count:t.count}]);for(let P=0,S=_.length;P<S;++P){const y=_[P],C=y.start,I=y.count;for(let D=C,G=C+I;D<G;D+=3)f(t.getX(D+0),t.getX(D+1),t.getX(D+2))}const M=new B,x=new B,A=new B,w=new B;function T(P){A.fromBufferAttribute(i,P),w.copy(A);const S=a[P];M.copy(S),M.sub(A.multiplyScalar(A.dot(S))).normalize(),x.crossVectors(w,S);const C=x.dot(c[P])<0?-1:1;o.setXYZW(P,M.x,M.y,M.z,C)}for(let P=0,S=_.length;P<S;++P){const y=_[P],C=y.start,I=y.count;for(let D=C,G=C+I;D<G;D+=3)T(t.getX(D+0)),T(t.getX(D+1)),T(t.getX(D+2))}}computeVertexNormals(){const t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new Me(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let d=0,h=n.count;d<h;d++)n.setXYZ(d,0,0,0);const i=new B,r=new B,o=new B,a=new B,c=new B,l=new B,u=new B,p=new B;if(t)for(let d=0,h=t.count;d<h;d+=3){const g=t.getX(d+0),v=t.getX(d+1),m=t.getX(d+2);i.fromBufferAttribute(e,g),r.fromBufferAttribute(e,v),o.fromBufferAttribute(e,m),u.subVectors(o,r),p.subVectors(i,r),u.cross(p),a.fromBufferAttribute(n,g),c.fromBufferAttribute(n,v),l.fromBufferAttribute(n,m),a.add(u),c.add(u),l.add(u),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(v,c.x,c.y,c.z),n.setXYZ(m,l.x,l.y,l.z)}else for(let d=0,h=e.count;d<h;d+=3)i.fromBufferAttribute(e,d+0),r.fromBufferAttribute(e,d+1),o.fromBufferAttribute(e,d+2),u.subVectors(o,r),p.subVectors(i,r),u.cross(p),n.setXYZ(d+0,u.x,u.y,u.z),n.setXYZ(d+1,u.x,u.y,u.z),n.setXYZ(d+2,u.x,u.y,u.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){const t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)ce.fromBufferAttribute(t,e),ce.normalize(),t.setXYZ(e,ce.x,ce.y,ce.z)}toNonIndexed(){function t(a,c){const l=a.array,u=a.itemSize,p=a.normalized,d=new l.constructor(c.length*u);let h=0,g=0;for(let v=0,m=c.length;v<m;v++){a.isInterleavedBufferAttribute?h=c[v]*a.data.stride+a.offset:h=c[v]*u;for(let f=0;f<u;f++)d[g++]=l[h++]}return new Me(d,u,p)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const e=new Te,n=this.index.array,i=this.attributes;for(const a in i){const c=i[a],l=t(c,n);e.setAttribute(a,l)}const r=this.morphAttributes;for(const a in r){const c=[],l=r[a];for(let u=0,p=l.length;u<p;u++){const d=l[u],h=t(d,n);c.push(h)}e.morphAttributes[a]=c}e.morphTargetsRelative=this.morphTargetsRelative;const o=this.groups;for(let a=0,c=o.length;a<c;a++){const l=o[a];e.addGroup(l.start,l.count,l.materialIndex)}return e}toJSON(){const t={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0){const c=this.parameters;for(const l in c)c[l]!==void 0&&(t[l]=c[l]);return t}t.data={attributes:{}};const e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});const n=this.attributes;for(const c in n){const l=n[c];t.data.attributes[c]=l.toJSON(t.data)}const i={};let r=!1;for(const c in this.morphAttributes){const l=this.morphAttributes[c],u=[];for(let p=0,d=l.length;p<d;p++){const h=l[p];u.push(h.toJSON(t.data))}u.length>0&&(i[c]=u,r=!0)}r&&(t.data.morphAttributes=i,t.data.morphTargetsRelative=this.morphTargetsRelative);const o=this.groups;o.length>0&&(t.data.groups=JSON.parse(JSON.stringify(o)));const a=this.boundingSphere;return a!==null&&(t.data.boundingSphere={center:a.center.toArray(),radius:a.radius}),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const e={};this.name=t.name;const n=t.index;n!==null&&this.setIndex(n.clone(e));const i=t.attributes;for(const l in i){const u=i[l];this.setAttribute(l,u.clone(e))}const r=t.morphAttributes;for(const l in r){const u=[],p=r[l];for(let d=0,h=p.length;d<h;d++)u.push(p[d].clone(e));this.morphAttributes[l]=u}this.morphTargetsRelative=t.morphTargetsRelative;const o=t.groups;for(let l=0,u=o.length;l<u;l++){const p=o[l];this.addGroup(p.start,p.count,p.materialIndex)}const a=t.boundingBox;a!==null&&(this.boundingBox=a.clone());const c=t.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}const Da=new Jt,En=new sc,ls=new xi,Ia=new B,cs=new B,hs=new B,us=new B,xr=new B,ds=new B,Ua=new B,fs=new B;class me extends oe{constructor(t=new Te,e=new Ho){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){const a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(t,e){const n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;e.fromBufferAttribute(i,t);const a=this.morphTargetInfluences;if(r&&a){ds.set(0,0,0);for(let c=0,l=r.length;c<l;c++){const u=a[c],p=r[c];u!==0&&(xr.fromBufferAttribute(p,t),o?ds.addScaledVector(xr,u):ds.addScaledVector(xr.sub(e),u))}e.add(ds)}return e}raycast(t,e){const n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),ls.copy(n.boundingSphere),ls.applyMatrix4(r),En.copy(t.ray).recast(t.near),!(ls.containsPoint(En.origin)===!1&&(En.intersectSphere(ls,Ia)===null||En.origin.distanceToSquared(Ia)>(t.far-t.near)**2))&&(Da.copy(r).invert(),En.copy(t.ray).applyMatrix4(Da),!(n.boundingBox!==null&&En.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,En)))}_computeIntersections(t,e,n){let i;const r=this.geometry,o=this.material,a=r.index,c=r.attributes.position,l=r.attributes.uv,u=r.attributes.uv1,p=r.attributes.normal,d=r.groups,h=r.drawRange;if(a!==null)if(Array.isArray(o))for(let g=0,v=d.length;g<v;g++){const m=d[g],f=o[m.materialIndex],_=Math.max(m.start,h.start),M=Math.min(a.count,Math.min(m.start+m.count,h.start+h.count));for(let x=_,A=M;x<A;x+=3){const w=a.getX(x),T=a.getX(x+1),P=a.getX(x+2);i=ps(this,f,t,n,l,u,p,w,T,P),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{const g=Math.max(0,h.start),v=Math.min(a.count,h.start+h.count);for(let m=g,f=v;m<f;m+=3){const _=a.getX(m),M=a.getX(m+1),x=a.getX(m+2);i=ps(this,o,t,n,l,u,p,_,M,x),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}else if(c!==void 0)if(Array.isArray(o))for(let g=0,v=d.length;g<v;g++){const m=d[g],f=o[m.materialIndex],_=Math.max(m.start,h.start),M=Math.min(c.count,Math.min(m.start+m.count,h.start+h.count));for(let x=_,A=M;x<A;x+=3){const w=x,T=x+1,P=x+2;i=ps(this,f,t,n,l,u,p,w,T,P),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=m.materialIndex,e.push(i))}}else{const g=Math.max(0,h.start),v=Math.min(c.count,h.start+h.count);for(let m=g,f=v;m<f;m+=3){const _=m,M=m+1,x=m+2;i=ps(this,o,t,n,l,u,p,_,M,x),i&&(i.faceIndex=Math.floor(m/3),e.push(i))}}}}function Wu(s,t,e,n,i,r,o,a){let c;if(t.side===ge?c=n.intersectTriangle(o,r,i,!0,a):c=n.intersectTriangle(i,r,o,t.side===xn,a),c===null)return null;fs.copy(a),fs.applyMatrix4(s.matrixWorld);const l=e.ray.origin.distanceTo(fs);return l<e.near||l>e.far?null:{distance:l,point:fs.clone(),object:s}}function ps(s,t,e,n,i,r,o,a,c,l){s.getVertexPosition(a,cs),s.getVertexPosition(c,hs),s.getVertexPosition(l,us);const u=Wu(s,t,e,n,cs,hs,us,Ua);if(u){const p=new B;Ue.getBarycoord(Ua,cs,hs,us,p),i&&(u.uv=Ue.getInterpolatedAttribute(i,a,c,l,p,new Wt)),r&&(u.uv1=Ue.getInterpolatedAttribute(r,a,c,l,p,new Wt)),o&&(u.normal=Ue.getInterpolatedAttribute(o,a,c,l,p,new B),u.normal.dot(n.direction)>0&&u.normal.multiplyScalar(-1));const d={a,b:c,c:l,normal:new B,materialIndex:0};Ue.getNormal(cs,hs,us,d.normal),u.face=d,u.barycoord=p}return u}class On extends Te{constructor(t=1,e=1,n=1,i=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:i,heightSegments:r,depthSegments:o};const a=this;i=Math.floor(i),r=Math.floor(r),o=Math.floor(o);const c=[],l=[],u=[],p=[];let d=0,h=0;g("z","y","x",-1,-1,n,e,t,o,r,0),g("z","y","x",1,-1,n,e,-t,o,r,1),g("x","z","y",1,1,t,n,e,i,o,2),g("x","z","y",1,-1,t,n,-e,i,o,3),g("x","y","z",1,-1,t,e,n,i,r,4),g("x","y","z",-1,-1,t,e,-n,i,r,5),this.setIndex(c),this.setAttribute("position",new he(l,3)),this.setAttribute("normal",new he(u,3)),this.setAttribute("uv",new he(p,2));function g(v,m,f,_,M,x,A,w,T,P,S){const y=x/T,C=A/P,I=x/2,D=A/2,G=w/2,q=T+1,U=P+1;let H=0,z=0;const et=new B;for(let tt=0;tt<U;tt++){const st=tt*C-D;for(let gt=0;gt<q;gt++){const Tt=gt*y-I;et[v]=Tt*_,et[m]=st*M,et[f]=G,l.push(et.x,et.y,et.z),et[v]=0,et[m]=0,et[f]=w>0?1:-1,u.push(et.x,et.y,et.z),p.push(gt/T),p.push(1-tt/P),H+=1}}for(let tt=0;tt<P;tt++)for(let st=0;st<T;st++){const gt=d+st+q*tt,Tt=d+st+q*(tt+1),$=d+(st+1)+q*(tt+1),J=d+(st+1)+q*tt;c.push(gt,Tt,J),c.push(Tt,$,J),z+=6}a.addGroup(h,z,S),h+=z,d+=H}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new On(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}}function pi(s){const t={};for(const e in s){t[e]={};for(const n in s[e]){const i=s[e][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=i.clone():Array.isArray(i)?t[e][n]=i.slice():t[e][n]=i}}return t}function ve(s){const t={};for(let e=0;e<s.length;e++){const n=pi(s[e]);for(const i in n)t[i]=n[i]}return t}function qu(s){const t=[];for(let e=0;e<s.length;e++)t.push(s[e].clone());return t}function cc(s){const t=s.getRenderTarget();return t===null?s.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:Vt.workingColorSpace}const Xu={clone:pi,merge:ve};var Yu=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,$u=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class He extends _i{static get type(){return"ShaderMaterial"}constructor(t){super(),this.isShaderMaterial=!0,this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Yu,this.fragmentShader=$u,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=pi(t.uniforms),this.uniformsGroups=qu(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this}toJSON(t){const e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(const i in this.uniforms){const o=this.uniforms[i].value;o&&o.isTexture?e.uniforms[i]={type:"t",value:o.toJSON(t).uuid}:o&&o.isColor?e.uniforms[i]={type:"c",value:o.getHex()}:o&&o.isVector2?e.uniforms[i]={type:"v2",value:o.toArray()}:o&&o.isVector3?e.uniforms[i]={type:"v3",value:o.toArray()}:o&&o.isVector4?e.uniforms[i]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?e.uniforms[i]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?e.uniforms[i]={type:"m4",value:o.toArray()}:e.uniforms[i]={value:o}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;const n={};for(const i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}}class hc extends oe{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Jt,this.projectionMatrix=new Jt,this.projectionMatrixInverse=new Jt,this.coordinateSystem=nn}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(t,e){super.updateWorldMatrix(t,e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}}const pn=new B,Na=new Wt,Fa=new Wt;class Pe extends hc{constructor(t=50,e=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){const e=.5*this.getFilmHeight()/t;this.fov=Eo*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){const t=Math.tan(Is*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Eo*2*Math.atan(Math.tan(Is*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){pn.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(pn.x,pn.y).multiplyScalar(-t/pn.z),pn.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(pn.x,pn.y).multiplyScalar(-t/pn.z)}getViewSize(t,e){return this.getViewBounds(t,Na,Fa),e.subVectors(Fa,Na)}setViewOffset(t,e,n,i,r,o){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=this.near;let e=t*Math.tan(Is*.5*this.fov)/this.zoom,n=2*e,i=this.aspect*n,r=-.5*i;const o=this.view;if(this.view!==null&&this.view.enabled){const c=o.fullWidth,l=o.fullHeight;r+=o.offsetX*i/c,e-=o.offsetY*n/l,i*=o.width/c,n*=o.height/l}const a=this.filmOffset;a!==0&&(r+=t*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,e,e-n,t,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}}const Jn=-90,Qn=1;class ju extends oe{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;const i=new Pe(Jn,Qn,t,e);i.layers=this.layers,this.add(i);const r=new Pe(Jn,Qn,t,e);r.layers=this.layers,this.add(r);const o=new Pe(Jn,Qn,t,e);o.layers=this.layers,this.add(o);const a=new Pe(Jn,Qn,t,e);a.layers=this.layers,this.add(a);const c=new Pe(Jn,Qn,t,e);c.layers=this.layers,this.add(c);const l=new Pe(Jn,Qn,t,e);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){const t=this.coordinateSystem,e=this.children.concat(),[n,i,r,o,a,c]=e;for(const l of e)this.remove(l);if(t===nn)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(t===Fs)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(const l of e)this.add(l),l.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();const{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());const[r,o,a,c,l,u]=this.children,p=t.getRenderTarget(),d=t.getActiveCubeFace(),h=t.getActiveMipmapLevel(),g=t.xr.enabled;t.xr.enabled=!1;const v=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,t.setRenderTarget(n,0,i),t.render(e,r),t.setRenderTarget(n,1,i),t.render(e,o),t.setRenderTarget(n,2,i),t.render(e,a),t.setRenderTarget(n,3,i),t.render(e,c),t.setRenderTarget(n,4,i),t.render(e,l),n.texture.generateMipmaps=v,t.setRenderTarget(n,5,i),t.render(e,u),t.setRenderTarget(p,d,h),t.xr.enabled=g,n.texture.needsPMREMUpdate=!0}}class uc extends _e{constructor(t,e,n,i,r,o,a,c,l,u){t=t!==void 0?t:[],e=e!==void 0?e:hi,super(t,e,n,i,r,o,a,c,l,u),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}}class Ku extends _n{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;const n={width:t,height:t,depth:1},i=[n,n,n,n,n,n];this.texture=new uc(i,e.mapping,e.wrapS,e.wrapT,e.magFilter,e.minFilter,e.format,e.type,e.anisotropy,e.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=e.generateMipmaps!==void 0?e.generateMipmaps:!1,this.texture.minFilter=e.minFilter!==void 0?e.minFilter:Ee}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;const n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new On(5,5,5),r=new He({name:"CubemapFromEquirect",uniforms:pi(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:ge,blending:sn});r.uniforms.tEquirect.value=e;const o=new me(i,r),a=e.minFilter;return e.minFilter===In&&(e.minFilter=Ee),new ju(1,10,this).update(t,o),e.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(t,e,n,i){const r=t.getRenderTarget();for(let o=0;o<6;o++)t.setRenderTarget(this,o),t.clear(e,n,i);t.setRenderTarget(r)}}const _r=new B,Zu=new B,Ju=new It;class Cn{constructor(t=new B(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,i){return this.normal.set(t,e,n),this.constant=i,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){const i=_r.subVectors(n,e).cross(Zu.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(i,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){const t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e){const n=t.delta(_r),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;const r=-(t.start.dot(this.normal)+this.constant)/i;return r<0||r>1?null:e.copy(t.start).addScaledVector(n,r)}intersectsLine(t){const e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){const n=e||Ju.getNormalMatrix(t),i=this.coplanarPoint(_r).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}}const wn=new xi,ms=new B;class Vo{constructor(t=new Cn,e=new Cn,n=new Cn,i=new Cn,r=new Cn,o=new Cn){this.planes=[t,e,n,i,r,o]}set(t,e,n,i,r,o){const a=this.planes;return a[0].copy(t),a[1].copy(e),a[2].copy(n),a[3].copy(i),a[4].copy(r),a[5].copy(o),this}copy(t){const e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=nn){const n=this.planes,i=t.elements,r=i[0],o=i[1],a=i[2],c=i[3],l=i[4],u=i[5],p=i[6],d=i[7],h=i[8],g=i[9],v=i[10],m=i[11],f=i[12],_=i[13],M=i[14],x=i[15];if(n[0].setComponents(c-r,d-l,m-h,x-f).normalize(),n[1].setComponents(c+r,d+l,m+h,x+f).normalize(),n[2].setComponents(c+o,d+u,m+g,x+_).normalize(),n[3].setComponents(c-o,d-u,m-g,x-_).normalize(),n[4].setComponents(c-a,d-p,m-v,x-M).normalize(),e===nn)n[5].setComponents(c+a,d+p,m+v,x+M).normalize();else if(e===Fs)n[5].setComponents(a,p,v,M).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),wn.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{const e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),wn.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(wn)}intersectsSprite(t){return wn.center.set(0,0,0),wn.radius=.7071067811865476,wn.applyMatrix4(t.matrixWorld),this.intersectsSphere(wn)}intersectsSphere(t){const e=this.planes,n=t.center,i=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(t){const e=this.planes;for(let n=0;n<6;n++){const i=e[n];if(ms.x=i.normal.x>0?t.max.x:t.min.x,ms.y=i.normal.y>0?t.max.y:t.min.y,ms.z=i.normal.z>0?t.max.z:t.min.z,i.distanceToPoint(ms)<0)return!1}return!0}containsPoint(t){const e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}function dc(){let s=null,t=!1,e=null,n=null;function i(r,o){e(r,o),n=s.requestAnimationFrame(i)}return{start:function(){t!==!0&&e!==null&&(n=s.requestAnimationFrame(i),t=!0)},stop:function(){s.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){s=r}}}function Qu(s){const t=new WeakMap;function e(a,c){const l=a.array,u=a.usage,p=l.byteLength,d=s.createBuffer();s.bindBuffer(c,d),s.bufferData(c,l,u),a.onUploadCallback();let h;if(l instanceof Float32Array)h=s.FLOAT;else if(l instanceof Uint16Array)a.isFloat16BufferAttribute?h=s.HALF_FLOAT:h=s.UNSIGNED_SHORT;else if(l instanceof Int16Array)h=s.SHORT;else if(l instanceof Uint32Array)h=s.UNSIGNED_INT;else if(l instanceof Int32Array)h=s.INT;else if(l instanceof Int8Array)h=s.BYTE;else if(l instanceof Uint8Array)h=s.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)h=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:d,type:h,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:p}}function n(a,c,l){const u=c.array,p=c.updateRanges;if(s.bindBuffer(l,a),p.length===0)s.bufferSubData(l,0,u);else{p.sort((h,g)=>h.start-g.start);let d=0;for(let h=1;h<p.length;h++){const g=p[d],v=p[h];v.start<=g.start+g.count+1?g.count=Math.max(g.count,v.start+v.count-g.start):(++d,p[d]=v)}p.length=d+1;for(let h=0,g=p.length;h<g;h++){const v=p[h];s.bufferSubData(l,v.start*u.BYTES_PER_ELEMENT,u,v.start,v.count)}c.clearUpdateRanges()}c.onUploadCallback()}function i(a){return a.isInterleavedBufferAttribute&&(a=a.data),t.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);const c=t.get(a);c&&(s.deleteBuffer(c.buffer),t.delete(a))}function o(a,c){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){const u=t.get(a);(!u||u.version<a.version)&&t.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}const l=t.get(a);if(l===void 0)t.set(a,e(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(l.buffer,a,c),l.version=a.version}}return{get:i,remove:r,update:o}}class Un extends Te{constructor(t=1,e=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:i};const r=t/2,o=e/2,a=Math.floor(n),c=Math.floor(i),l=a+1,u=c+1,p=t/a,d=e/c,h=[],g=[],v=[],m=[];for(let f=0;f<u;f++){const _=f*d-o;for(let M=0;M<l;M++){const x=M*p-r;g.push(x,-_,0),v.push(0,0,1),m.push(M/a),m.push(1-f/c)}}for(let f=0;f<c;f++)for(let _=0;_<a;_++){const M=_+l*f,x=_+l*(f+1),A=_+1+l*(f+1),w=_+1+l*f;h.push(M,x,w),h.push(x,A,w)}this.setIndex(h),this.setAttribute("position",new he(g,3)),this.setAttribute("normal",new he(v,3)),this.setAttribute("uv",new he(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Un(t.width,t.height,t.widthSegments,t.heightSegments)}}var td=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,ed=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,nd=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,id=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,sd=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,rd=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,od=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,ad=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,ld=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,cd=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,hd=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,ud=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,dd=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,fd=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,pd=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,md=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,gd=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,vd=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,xd=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,_d=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,Md=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,yd=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,Sd=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,bd=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Ed=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,wd=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,Td=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Ad=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Cd=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Rd=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Pd="gl_FragColor = linearToOutputTexel( gl_FragColor );",Ld=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Dd=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,Id=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,Ud=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Nd=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Fd=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,kd=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Od=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Bd=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,zd=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Hd=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Vd=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Gd=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Wd=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,qd=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,Xd=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,Yd=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,$d=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,jd=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Kd=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Zd=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Jd=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Qd=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,tf=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,ef=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,nf=`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,sf=`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,rf=`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,of=`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,af=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,lf=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,cf=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,hf=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,uf=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,df=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,ff=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,pf=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,mf=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,gf=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,vf=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,xf=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,_f=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,Mf=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,yf=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Sf=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,bf=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Ef=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,wf=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Tf=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Af=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Cf=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Rf=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,Pf=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Lf=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Df=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,If=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Uf=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Nf=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,Ff=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,kf=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Of=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Bf=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,zf=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Hf=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Vf=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,Gf=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,Wf=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,qf=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Xf=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Yf=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,$f=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,jf=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
		
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
		
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		
		#else
		
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,Kf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Zf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Jf=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,Qf=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const tp=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,ep=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,np=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,ip=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,sp=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,rp=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,op=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,ap=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,lp=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,cp=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,hp=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,up=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,dp=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,fp=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,pp=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,mp=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,gp=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,vp=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,xp=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,_p=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Mp=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,yp=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Sp=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,bp=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ep=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,wp=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Tp=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Ap=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Cp=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,Rp=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Pp=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Lp=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Dp=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Ip=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Nt={alphahash_fragment:td,alphahash_pars_fragment:ed,alphamap_fragment:nd,alphamap_pars_fragment:id,alphatest_fragment:sd,alphatest_pars_fragment:rd,aomap_fragment:od,aomap_pars_fragment:ad,batching_pars_vertex:ld,batching_vertex:cd,begin_vertex:hd,beginnormal_vertex:ud,bsdfs:dd,iridescence_fragment:fd,bumpmap_pars_fragment:pd,clipping_planes_fragment:md,clipping_planes_pars_fragment:gd,clipping_planes_pars_vertex:vd,clipping_planes_vertex:xd,color_fragment:_d,color_pars_fragment:Md,color_pars_vertex:yd,color_vertex:Sd,common:bd,cube_uv_reflection_fragment:Ed,defaultnormal_vertex:wd,displacementmap_pars_vertex:Td,displacementmap_vertex:Ad,emissivemap_fragment:Cd,emissivemap_pars_fragment:Rd,colorspace_fragment:Pd,colorspace_pars_fragment:Ld,envmap_fragment:Dd,envmap_common_pars_fragment:Id,envmap_pars_fragment:Ud,envmap_pars_vertex:Nd,envmap_physical_pars_fragment:Xd,envmap_vertex:Fd,fog_vertex:kd,fog_pars_vertex:Od,fog_fragment:Bd,fog_pars_fragment:zd,gradientmap_pars_fragment:Hd,lightmap_pars_fragment:Vd,lights_lambert_fragment:Gd,lights_lambert_pars_fragment:Wd,lights_pars_begin:qd,lights_toon_fragment:Yd,lights_toon_pars_fragment:$d,lights_phong_fragment:jd,lights_phong_pars_fragment:Kd,lights_physical_fragment:Zd,lights_physical_pars_fragment:Jd,lights_fragment_begin:Qd,lights_fragment_maps:tf,lights_fragment_end:ef,logdepthbuf_fragment:nf,logdepthbuf_pars_fragment:sf,logdepthbuf_pars_vertex:rf,logdepthbuf_vertex:of,map_fragment:af,map_pars_fragment:lf,map_particle_fragment:cf,map_particle_pars_fragment:hf,metalnessmap_fragment:uf,metalnessmap_pars_fragment:df,morphinstance_vertex:ff,morphcolor_vertex:pf,morphnormal_vertex:mf,morphtarget_pars_vertex:gf,morphtarget_vertex:vf,normal_fragment_begin:xf,normal_fragment_maps:_f,normal_pars_fragment:Mf,normal_pars_vertex:yf,normal_vertex:Sf,normalmap_pars_fragment:bf,clearcoat_normal_fragment_begin:Ef,clearcoat_normal_fragment_maps:wf,clearcoat_pars_fragment:Tf,iridescence_pars_fragment:Af,opaque_fragment:Cf,packing:Rf,premultiplied_alpha_fragment:Pf,project_vertex:Lf,dithering_fragment:Df,dithering_pars_fragment:If,roughnessmap_fragment:Uf,roughnessmap_pars_fragment:Nf,shadowmap_pars_fragment:Ff,shadowmap_pars_vertex:kf,shadowmap_vertex:Of,shadowmask_pars_fragment:Bf,skinbase_vertex:zf,skinning_pars_vertex:Hf,skinning_vertex:Vf,skinnormal_vertex:Gf,specularmap_fragment:Wf,specularmap_pars_fragment:qf,tonemapping_fragment:Xf,tonemapping_pars_fragment:Yf,transmission_fragment:$f,transmission_pars_fragment:jf,uv_pars_fragment:Kf,uv_pars_vertex:Zf,uv_vertex:Jf,worldpos_vertex:Qf,background_vert:tp,background_frag:ep,backgroundCube_vert:np,backgroundCube_frag:ip,cube_vert:sp,cube_frag:rp,depth_vert:op,depth_frag:ap,distanceRGBA_vert:lp,distanceRGBA_frag:cp,equirect_vert:hp,equirect_frag:up,linedashed_vert:dp,linedashed_frag:fp,meshbasic_vert:pp,meshbasic_frag:mp,meshlambert_vert:gp,meshlambert_frag:vp,meshmatcap_vert:xp,meshmatcap_frag:_p,meshnormal_vert:Mp,meshnormal_frag:yp,meshphong_vert:Sp,meshphong_frag:bp,meshphysical_vert:Ep,meshphysical_frag:wp,meshtoon_vert:Tp,meshtoon_frag:Ap,points_vert:Cp,points_frag:Rp,shadow_vert:Pp,shadow_frag:Lp,sprite_vert:Dp,sprite_frag:Ip},ot={common:{diffuse:{value:new Bt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new It},alphaMap:{value:null},alphaMapTransform:{value:new It},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new It}},envmap:{envMap:{value:null},envMapRotation:{value:new It},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new It}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new It}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new It},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new It},normalScale:{value:new Wt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new It},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new It}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new It}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new It}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Bt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new Bt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new It},alphaTest:{value:0},uvTransform:{value:new It}},sprite:{diffuse:{value:new Bt(16777215)},opacity:{value:1},center:{value:new Wt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new It},alphaMap:{value:null},alphaMapTransform:{value:new It},alphaTest:{value:0}}},Ge={basic:{uniforms:ve([ot.common,ot.specularmap,ot.envmap,ot.aomap,ot.lightmap,ot.fog]),vertexShader:Nt.meshbasic_vert,fragmentShader:Nt.meshbasic_frag},lambert:{uniforms:ve([ot.common,ot.specularmap,ot.envmap,ot.aomap,ot.lightmap,ot.emissivemap,ot.bumpmap,ot.normalmap,ot.displacementmap,ot.fog,ot.lights,{emissive:{value:new Bt(0)}}]),vertexShader:Nt.meshlambert_vert,fragmentShader:Nt.meshlambert_frag},phong:{uniforms:ve([ot.common,ot.specularmap,ot.envmap,ot.aomap,ot.lightmap,ot.emissivemap,ot.bumpmap,ot.normalmap,ot.displacementmap,ot.fog,ot.lights,{emissive:{value:new Bt(0)},specular:{value:new Bt(1118481)},shininess:{value:30}}]),vertexShader:Nt.meshphong_vert,fragmentShader:Nt.meshphong_frag},standard:{uniforms:ve([ot.common,ot.envmap,ot.aomap,ot.lightmap,ot.emissivemap,ot.bumpmap,ot.normalmap,ot.displacementmap,ot.roughnessmap,ot.metalnessmap,ot.fog,ot.lights,{emissive:{value:new Bt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Nt.meshphysical_vert,fragmentShader:Nt.meshphysical_frag},toon:{uniforms:ve([ot.common,ot.aomap,ot.lightmap,ot.emissivemap,ot.bumpmap,ot.normalmap,ot.displacementmap,ot.gradientmap,ot.fog,ot.lights,{emissive:{value:new Bt(0)}}]),vertexShader:Nt.meshtoon_vert,fragmentShader:Nt.meshtoon_frag},matcap:{uniforms:ve([ot.common,ot.bumpmap,ot.normalmap,ot.displacementmap,ot.fog,{matcap:{value:null}}]),vertexShader:Nt.meshmatcap_vert,fragmentShader:Nt.meshmatcap_frag},points:{uniforms:ve([ot.points,ot.fog]),vertexShader:Nt.points_vert,fragmentShader:Nt.points_frag},dashed:{uniforms:ve([ot.common,ot.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Nt.linedashed_vert,fragmentShader:Nt.linedashed_frag},depth:{uniforms:ve([ot.common,ot.displacementmap]),vertexShader:Nt.depth_vert,fragmentShader:Nt.depth_frag},normal:{uniforms:ve([ot.common,ot.bumpmap,ot.normalmap,ot.displacementmap,{opacity:{value:1}}]),vertexShader:Nt.meshnormal_vert,fragmentShader:Nt.meshnormal_frag},sprite:{uniforms:ve([ot.sprite,ot.fog]),vertexShader:Nt.sprite_vert,fragmentShader:Nt.sprite_frag},background:{uniforms:{uvTransform:{value:new It},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Nt.background_vert,fragmentShader:Nt.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new It}},vertexShader:Nt.backgroundCube_vert,fragmentShader:Nt.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Nt.cube_vert,fragmentShader:Nt.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Nt.equirect_vert,fragmentShader:Nt.equirect_frag},distanceRGBA:{uniforms:ve([ot.common,ot.displacementmap,{referencePosition:{value:new B},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Nt.distanceRGBA_vert,fragmentShader:Nt.distanceRGBA_frag},shadow:{uniforms:ve([ot.lights,ot.fog,{color:{value:new Bt(0)},opacity:{value:1}}]),vertexShader:Nt.shadow_vert,fragmentShader:Nt.shadow_frag}};Ge.physical={uniforms:ve([Ge.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new It},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new It},clearcoatNormalScale:{value:new Wt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new It},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new It},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new It},sheen:{value:0},sheenColor:{value:new Bt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new It},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new It},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new It},transmissionSamplerSize:{value:new Wt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new It},attenuationDistance:{value:0},attenuationColor:{value:new Bt(0)},specularColor:{value:new Bt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new It},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new It},anisotropyVector:{value:new Wt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new It}}]),vertexShader:Nt.meshphysical_vert,fragmentShader:Nt.meshphysical_frag};const gs={r:0,b:0,g:0},Tn=new Ye,Up=new Jt;function Np(s,t,e,n,i,r,o){const a=new Bt(0);let c=r===!0?0:1,l,u,p=null,d=0,h=null;function g(_){let M=_.isScene===!0?_.background:null;return M&&M.isTexture&&(M=(_.backgroundBlurriness>0?e:t).get(M)),M}function v(_){let M=!1;const x=g(_);x===null?f(a,c):x&&x.isColor&&(f(x,1),M=!0);const A=s.xr.getEnvironmentBlendMode();A==="additive"?n.buffers.color.setClear(0,0,0,1,o):A==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(s.autoClear||M)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))}function m(_,M){const x=g(M);x&&(x.isCubeTexture||x.mapping===qs)?(u===void 0&&(u=new me(new On(1,1,1),new He({name:"BackgroundCubeMaterial",uniforms:pi(Ge.backgroundCube.uniforms),vertexShader:Ge.backgroundCube.vertexShader,fragmentShader:Ge.backgroundCube.fragmentShader,side:ge,depthTest:!1,depthWrite:!1,fog:!1})),u.geometry.deleteAttribute("normal"),u.geometry.deleteAttribute("uv"),u.onBeforeRender=function(A,w,T){this.matrixWorld.copyPosition(T.matrixWorld)},Object.defineProperty(u.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(u)),Tn.copy(M.backgroundRotation),Tn.x*=-1,Tn.y*=-1,Tn.z*=-1,x.isCubeTexture&&x.isRenderTargetTexture===!1&&(Tn.y*=-1,Tn.z*=-1),u.material.uniforms.envMap.value=x,u.material.uniforms.flipEnvMap.value=x.isCubeTexture&&x.isRenderTargetTexture===!1?-1:1,u.material.uniforms.backgroundBlurriness.value=M.backgroundBlurriness,u.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,u.material.uniforms.backgroundRotation.value.setFromMatrix4(Up.makeRotationFromEuler(Tn)),u.material.toneMapped=Vt.getTransfer(x.colorSpace)!==Kt,(p!==x||d!==x.version||h!==s.toneMapping)&&(u.material.needsUpdate=!0,p=x,d=x.version,h=s.toneMapping),u.layers.enableAll(),_.unshift(u,u.geometry,u.material,0,0,null)):x&&x.isTexture&&(l===void 0&&(l=new me(new Un(2,2),new He({name:"BackgroundMaterial",uniforms:pi(Ge.background.uniforms),vertexShader:Ge.background.vertexShader,fragmentShader:Ge.background.fragmentShader,side:xn,depthTest:!1,depthWrite:!1,fog:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=x,l.material.uniforms.backgroundIntensity.value=M.backgroundIntensity,l.material.toneMapped=Vt.getTransfer(x.colorSpace)!==Kt,x.matrixAutoUpdate===!0&&x.updateMatrix(),l.material.uniforms.uvTransform.value.copy(x.matrix),(p!==x||d!==x.version||h!==s.toneMapping)&&(l.material.needsUpdate=!0,p=x,d=x.version,h=s.toneMapping),l.layers.enableAll(),_.unshift(l,l.geometry,l.material,0,0,null))}function f(_,M){_.getRGB(gs,cc(s)),n.buffers.color.setClear(gs.r,gs.g,gs.b,M,o)}return{getClearColor:function(){return a},setClearColor:function(_,M=1){a.set(_),c=M,f(a,c)},getClearAlpha:function(){return c},setClearAlpha:function(_){c=_,f(a,c)},render:v,addToRenderList:m}}function Fp(s,t){const e=s.getParameter(s.MAX_VERTEX_ATTRIBS),n={},i=d(null);let r=i,o=!1;function a(y,C,I,D,G){let q=!1;const U=p(D,I,C);r!==U&&(r=U,l(r.object)),q=h(y,D,I,G),q&&g(y,D,I,G),G!==null&&t.update(G,s.ELEMENT_ARRAY_BUFFER),(q||o)&&(o=!1,x(y,C,I,D),G!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,t.get(G).buffer))}function c(){return s.createVertexArray()}function l(y){return s.bindVertexArray(y)}function u(y){return s.deleteVertexArray(y)}function p(y,C,I){const D=I.wireframe===!0;let G=n[y.id];G===void 0&&(G={},n[y.id]=G);let q=G[C.id];q===void 0&&(q={},G[C.id]=q);let U=q[D];return U===void 0&&(U=d(c()),q[D]=U),U}function d(y){const C=[],I=[],D=[];for(let G=0;G<e;G++)C[G]=0,I[G]=0,D[G]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:C,enabledAttributes:I,attributeDivisors:D,object:y,attributes:{},index:null}}function h(y,C,I,D){const G=r.attributes,q=C.attributes;let U=0;const H=I.getAttributes();for(const z in H)if(H[z].location>=0){const tt=G[z];let st=q[z];if(st===void 0&&(z==="instanceMatrix"&&y.instanceMatrix&&(st=y.instanceMatrix),z==="instanceColor"&&y.instanceColor&&(st=y.instanceColor)),tt===void 0||tt.attribute!==st||st&&tt.data!==st.data)return!0;U++}return r.attributesNum!==U||r.index!==D}function g(y,C,I,D){const G={},q=C.attributes;let U=0;const H=I.getAttributes();for(const z in H)if(H[z].location>=0){let tt=q[z];tt===void 0&&(z==="instanceMatrix"&&y.instanceMatrix&&(tt=y.instanceMatrix),z==="instanceColor"&&y.instanceColor&&(tt=y.instanceColor));const st={};st.attribute=tt,tt&&tt.data&&(st.data=tt.data),G[z]=st,U++}r.attributes=G,r.attributesNum=U,r.index=D}function v(){const y=r.newAttributes;for(let C=0,I=y.length;C<I;C++)y[C]=0}function m(y){f(y,0)}function f(y,C){const I=r.newAttributes,D=r.enabledAttributes,G=r.attributeDivisors;I[y]=1,D[y]===0&&(s.enableVertexAttribArray(y),D[y]=1),G[y]!==C&&(s.vertexAttribDivisor(y,C),G[y]=C)}function _(){const y=r.newAttributes,C=r.enabledAttributes;for(let I=0,D=C.length;I<D;I++)C[I]!==y[I]&&(s.disableVertexAttribArray(I),C[I]=0)}function M(y,C,I,D,G,q,U){U===!0?s.vertexAttribIPointer(y,C,I,G,q):s.vertexAttribPointer(y,C,I,D,G,q)}function x(y,C,I,D){v();const G=D.attributes,q=I.getAttributes(),U=C.defaultAttributeValues;for(const H in q){const z=q[H];if(z.location>=0){let et=G[H];if(et===void 0&&(H==="instanceMatrix"&&y.instanceMatrix&&(et=y.instanceMatrix),H==="instanceColor"&&y.instanceColor&&(et=y.instanceColor)),et!==void 0){const tt=et.normalized,st=et.itemSize,gt=t.get(et);if(gt===void 0)continue;const Tt=gt.buffer,$=gt.type,J=gt.bytesPerElement,lt=$===s.INT||$===s.UNSIGNED_INT||et.gpuType===Uo;if(et.isInterleavedBufferAttribute){const rt=et.data,bt=rt.stride,At=et.offset;if(rt.isInstancedInterleavedBuffer){for(let Ct=0;Ct<z.locationSize;Ct++)f(z.location+Ct,rt.meshPerAttribute);y.isInstancedMesh!==!0&&D._maxInstanceCount===void 0&&(D._maxInstanceCount=rt.meshPerAttribute*rt.count)}else for(let Ct=0;Ct<z.locationSize;Ct++)m(z.location+Ct);s.bindBuffer(s.ARRAY_BUFFER,Tt);for(let Ct=0;Ct<z.locationSize;Ct++)M(z.location+Ct,st/z.locationSize,$,tt,bt*J,(At+st/z.locationSize*Ct)*J,lt)}else{if(et.isInstancedBufferAttribute){for(let rt=0;rt<z.locationSize;rt++)f(z.location+rt,et.meshPerAttribute);y.isInstancedMesh!==!0&&D._maxInstanceCount===void 0&&(D._maxInstanceCount=et.meshPerAttribute*et.count)}else for(let rt=0;rt<z.locationSize;rt++)m(z.location+rt);s.bindBuffer(s.ARRAY_BUFFER,Tt);for(let rt=0;rt<z.locationSize;rt++)M(z.location+rt,st/z.locationSize,$,tt,st*J,st/z.locationSize*rt*J,lt)}}else if(U!==void 0){const tt=U[H];if(tt!==void 0)switch(tt.length){case 2:s.vertexAttrib2fv(z.location,tt);break;case 3:s.vertexAttrib3fv(z.location,tt);break;case 4:s.vertexAttrib4fv(z.location,tt);break;default:s.vertexAttrib1fv(z.location,tt)}}}}_()}function A(){P();for(const y in n){const C=n[y];for(const I in C){const D=C[I];for(const G in D)u(D[G].object),delete D[G];delete C[I]}delete n[y]}}function w(y){if(n[y.id]===void 0)return;const C=n[y.id];for(const I in C){const D=C[I];for(const G in D)u(D[G].object),delete D[G];delete C[I]}delete n[y.id]}function T(y){for(const C in n){const I=n[C];if(I[y.id]===void 0)continue;const D=I[y.id];for(const G in D)u(D[G].object),delete D[G];delete I[y.id]}}function P(){S(),o=!0,r!==i&&(r=i,l(r.object))}function S(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:a,reset:P,resetDefaultState:S,dispose:A,releaseStatesOfGeometry:w,releaseStatesOfProgram:T,initAttributes:v,enableAttribute:m,disableUnusedAttributes:_}}function kp(s,t,e){let n;function i(l){n=l}function r(l,u){s.drawArrays(n,l,u),e.update(u,n,1)}function o(l,u,p){p!==0&&(s.drawArraysInstanced(n,l,u,p),e.update(u,n,p))}function a(l,u,p){if(p===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,u,0,p);let h=0;for(let g=0;g<p;g++)h+=u[g];e.update(h,n,1)}function c(l,u,p,d){if(p===0)return;const h=t.get("WEBGL_multi_draw");if(h===null)for(let g=0;g<l.length;g++)o(l[g],u[g],d[g]);else{h.multiDrawArraysInstancedWEBGL(n,l,0,u,0,d,0,p);let g=0;for(let v=0;v<p;v++)g+=u[v]*d[v];e.update(g,n,1)}}this.setMode=i,this.render=r,this.renderInstances=o,this.renderMultiDraw=a,this.renderMultiDrawInstances=c}function Op(s,t,e,n){let i;function r(){if(i!==void 0)return i;if(t.has("EXT_texture_filter_anisotropic")===!0){const T=t.get("EXT_texture_filter_anisotropic");i=s.getParameter(T.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(T){return!(T!==we&&n.convert(T)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(T){const P=T===qi&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(T!==Ne&&n.convert(T)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE)&&T!==Xe&&!P)}function c(T){if(T==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";T="mediump"}return T==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=e.precision!==void 0?e.precision:"highp";const u=c(l);u!==l&&(console.warn("THREE.WebGLRenderer:",l,"not supported, using",u,"instead."),l=u);const p=e.logarithmicDepthBuffer===!0,d=e.reverseDepthBuffer===!0&&t.has("EXT_clip_control"),h=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),g=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),v=s.getParameter(s.MAX_TEXTURE_SIZE),m=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),f=s.getParameter(s.MAX_VERTEX_ATTRIBS),_=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),M=s.getParameter(s.MAX_VARYING_VECTORS),x=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),A=g>0,w=s.getParameter(s.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:p,reverseDepthBuffer:d,maxTextures:h,maxVertexTextures:g,maxTextureSize:v,maxCubemapSize:m,maxAttributes:f,maxVertexUniforms:_,maxVaryings:M,maxFragmentUniforms:x,vertexTextures:A,maxSamples:w}}function Bp(s){const t=this;let e=null,n=0,i=!1,r=!1;const o=new Cn,a=new It,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(p,d){const h=p.length!==0||d||n!==0||i;return i=d,n=p.length,h},this.beginShadows=function(){r=!0,u(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(p,d){e=u(p,d,0)},this.setState=function(p,d,h){const g=p.clippingPlanes,v=p.clipIntersection,m=p.clipShadows,f=s.get(p);if(!i||g===null||g.length===0||r&&!m)r?u(null):l();else{const _=r?0:n,M=_*4;let x=f.clippingState||null;c.value=x,x=u(g,d,M,h);for(let A=0;A!==M;++A)x[A]=e[A];f.clippingState=x,this.numIntersection=v?this.numPlanes:0,this.numPlanes+=_}};function l(){c.value!==e&&(c.value=e,c.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function u(p,d,h,g){const v=p!==null?p.length:0;let m=null;if(v!==0){if(m=c.value,g!==!0||m===null){const f=h+v*4,_=d.matrixWorldInverse;a.getNormalMatrix(_),(m===null||m.length<f)&&(m=new Float32Array(f));for(let M=0,x=h;M!==v;++M,x+=4)o.copy(p[M]).applyMatrix4(_,a),o.normal.toArray(m,x),m[x+3]=o.constant}c.value=m,c.needsUpdate=!0}return t.numPlanes=v,t.numIntersection=0,m}}function zp(s){let t=new WeakMap;function e(o,a){return a===Yr?o.mapping=hi:a===$r&&(o.mapping=ui),o}function n(o){if(o&&o.isTexture){const a=o.mapping;if(a===Yr||a===$r)if(t.has(o)){const c=t.get(o).texture;return e(c,o.mapping)}else{const c=o.image;if(c&&c.height>0){const l=new Ku(c.height);return l.fromEquirectangularTexture(s,o),t.set(o,l),o.addEventListener("dispose",i),e(l.texture,o.mapping)}else return null}}return o}function i(o){const a=o.target;a.removeEventListener("dispose",i);const c=t.get(a);c!==void 0&&(t.delete(a),c.dispose())}function r(){t=new WeakMap}return{get:n,dispose:r}}class Go extends hc{constructor(t=-1,e=1,n=1,i=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=i,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,i,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2;let r=n-t,o=n+t,a=i+e,c=i-e;if(this.view!==null&&this.view.enabled){const l=(this.right-this.left)/this.view.fullWidth/this.zoom,u=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,o=r+l*this.view.width,a-=u*this.view.offsetY,c=a-u*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,c,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){const e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}}const ii=4,ka=[.125,.215,.35,.446,.526,.582],Ln=20,Mr=new Go,Oa=new Bt;let yr=null,Sr=0,br=0,Er=!1;const Rn=(1+Math.sqrt(5))/2,ti=1/Rn,Ba=[new B(-Rn,ti,0),new B(Rn,ti,0),new B(-ti,0,Rn),new B(ti,0,Rn),new B(0,Rn,-ti),new B(0,Rn,ti),new B(-1,1,-1),new B(1,1,-1),new B(-1,1,1),new B(1,1,1)];class za{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(t,e=0,n=.1,i=100){yr=this._renderer.getRenderTarget(),Sr=this._renderer.getActiveCubeFace(),br=this._renderer.getActiveMipmapLevel(),Er=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(256);const r=this._allocateTargets();return r.depthBuffer=!0,this._sceneToCubeUV(t,n,i,r),e>0&&this._blur(r,0,0,e),this._applyPMREM(r),this._cleanup(r),r}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Ga(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Va(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodPlanes.length;t++)this._lodPlanes[t].dispose()}_cleanup(t){this._renderer.setRenderTarget(yr,Sr,br),this._renderer.xr.enabled=Er,t.scissorTest=!1,vs(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===hi||t.mapping===ui?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),yr=this._renderer.getRenderTarget(),Sr=this._renderer.getActiveCubeFace(),br=this._renderer.getActiveMipmapLevel(),Er=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){const t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:Ee,minFilter:Ee,generateMipmaps:!1,type:qi,format:we,colorSpace:gi,depthBuffer:!1},i=Ha(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Ha(t,e,n);const{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=Hp(r)),this._blurMaterial=Vp(r,t,e)}return i}_compileMaterial(t){const e=new me(this._lodPlanes[0],t);this._renderer.compile(e,Mr)}_sceneToCubeUV(t,e,n,i){const a=new Pe(90,1,e,n),c=[1,-1,1,1,1,1],l=[1,1,1,-1,-1,-1],u=this._renderer,p=u.autoClear,d=u.toneMapping;u.getClearColor(Oa),u.toneMapping=gn,u.autoClear=!1;const h=new Ho({name:"PMREM.Background",side:ge,depthWrite:!1,depthTest:!1}),g=new me(new On,h);let v=!1;const m=t.background;m?m.isColor&&(h.color.copy(m),t.background=null,v=!0):(h.color.copy(Oa),v=!0);for(let f=0;f<6;f++){const _=f%3;_===0?(a.up.set(0,c[f],0),a.lookAt(l[f],0,0)):_===1?(a.up.set(0,0,c[f]),a.lookAt(0,l[f],0)):(a.up.set(0,c[f],0),a.lookAt(0,0,l[f]));const M=this._cubeSize;vs(i,_*M,f>2?M:0,M,M),u.setRenderTarget(i),v&&u.render(g,a),u.render(t,a)}g.geometry.dispose(),g.material.dispose(),u.toneMapping=d,u.autoClear=p,t.background=m}_textureToCubeUV(t,e){const n=this._renderer,i=t.mapping===hi||t.mapping===ui;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=Ga()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Va());const r=i?this._cubemapMaterial:this._equirectMaterial,o=new me(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=t;const c=this._cubeSize;vs(e,0,0,3*c,2*c),n.setRenderTarget(e),n.render(o,Mr)}_applyPMREM(t){const e=this._renderer,n=e.autoClear;e.autoClear=!1;const i=this._lodPlanes.length;for(let r=1;r<i;r++){const o=Math.sqrt(this._sigmas[r]*this._sigmas[r]-this._sigmas[r-1]*this._sigmas[r-1]),a=Ba[(i-r-1)%Ba.length];this._blur(t,r-1,r,o,a)}e.autoClear=n}_blur(t,e,n,i,r){const o=this._pingPongRenderTarget;this._halfBlur(t,o,e,n,i,"latitudinal",r),this._halfBlur(o,t,n,n,i,"longitudinal",r)}_halfBlur(t,e,n,i,r,o,a){const c=this._renderer,l=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");const u=3,p=new me(this._lodPlanes[i],l),d=l.uniforms,h=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*h):2*Math.PI/(2*Ln-1),v=r/g,m=isFinite(r)?1+Math.floor(u*v):Ln;m>Ln&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${Ln}`);const f=[];let _=0;for(let T=0;T<Ln;++T){const P=T/v,S=Math.exp(-P*P/2);f.push(S),T===0?_+=S:T<m&&(_+=2*S)}for(let T=0;T<f.length;T++)f[T]=f[T]/_;d.envMap.value=t.texture,d.samples.value=m,d.weights.value=f,d.latitudinal.value=o==="latitudinal",a&&(d.poleAxis.value=a);const{_lodMax:M}=this;d.dTheta.value=g,d.mipInt.value=M-n;const x=this._sizeLods[i],A=3*x*(i>M-ii?i-M+ii:0),w=4*(this._cubeSize-x);vs(e,A,w,3*x,2*x),c.setRenderTarget(e),c.render(p,Mr)}}function Hp(s){const t=[],e=[],n=[];let i=s;const r=s-ii+1+ka.length;for(let o=0;o<r;o++){const a=Math.pow(2,i);e.push(a);let c=1/a;o>s-ii?c=ka[o-s+ii-1]:o===0&&(c=0),n.push(c);const l=1/(a-2),u=-l,p=1+l,d=[u,u,p,u,p,p,u,u,p,p,u,p],h=6,g=6,v=3,m=2,f=1,_=new Float32Array(v*g*h),M=new Float32Array(m*g*h),x=new Float32Array(f*g*h);for(let w=0;w<h;w++){const T=w%3*2/3-1,P=w>2?0:-1,S=[T,P,0,T+2/3,P,0,T+2/3,P+1,0,T,P,0,T+2/3,P+1,0,T,P+1,0];_.set(S,v*g*w),M.set(d,m*g*w);const y=[w,w,w,w,w,w];x.set(y,f*g*w)}const A=new Te;A.setAttribute("position",new Me(_,v)),A.setAttribute("uv",new Me(M,m)),A.setAttribute("faceIndex",new Me(x,f)),t.push(A),i>ii&&i--}return{lodPlanes:t,sizeLods:e,sigmas:n}}function Ha(s,t,e){const n=new _n(s,t,e);return n.texture.mapping=qs,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function vs(s,t,e,n,i){s.viewport.set(t,e,n,i),s.scissor.set(t,e,n,i)}function Vp(s,t,e){const n=new Float32Array(Ln),i=new B(0,1,0);return new He({name:"SphericalGaussianBlur",defines:{n:Ln,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:Wo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:sn,depthTest:!1,depthWrite:!1})}function Va(){return new He({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Wo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:sn,depthTest:!1,depthWrite:!1})}function Ga(){return new He({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Wo(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:sn,depthTest:!1,depthWrite:!1})}function Wo(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function Gp(s){let t=new WeakMap,e=null;function n(a){if(a&&a.isTexture){const c=a.mapping,l=c===Yr||c===$r,u=c===hi||c===ui;if(l||u){let p=t.get(a);const d=p!==void 0?p.texture.pmremVersion:0;if(a.isRenderTargetTexture&&a.pmremVersion!==d)return e===null&&(e=new za(s)),p=l?e.fromEquirectangular(a,p):e.fromCubemap(a,p),p.texture.pmremVersion=a.pmremVersion,t.set(a,p),p.texture;if(p!==void 0)return p.texture;{const h=a.image;return l&&h&&h.height>0||u&&h&&i(h)?(e===null&&(e=new za(s)),p=l?e.fromEquirectangular(a):e.fromCubemap(a),p.texture.pmremVersion=a.pmremVersion,t.set(a,p),a.addEventListener("dispose",r),p.texture):null}}}return a}function i(a){let c=0;const l=6;for(let u=0;u<l;u++)a[u]!==void 0&&c++;return c===l}function r(a){const c=a.target;c.removeEventListener("dispose",r);const l=t.get(c);l!==void 0&&(t.delete(c),l.dispose())}function o(){t=new WeakMap,e!==null&&(e.dispose(),e=null)}return{get:n,dispose:o}}function Wp(s){const t={};function e(n){if(t[n]!==void 0)return t[n];let i;switch(n){case"WEBGL_depth_texture":i=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=s.getExtension(n)}return t[n]=i,i}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){const i=e(n);return i===null&&Fi("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function qp(s,t,e,n){const i={},r=new WeakMap;function o(p){const d=p.target;d.index!==null&&t.remove(d.index);for(const g in d.attributes)t.remove(d.attributes[g]);for(const g in d.morphAttributes){const v=d.morphAttributes[g];for(let m=0,f=v.length;m<f;m++)t.remove(v[m])}d.removeEventListener("dispose",o),delete i[d.id];const h=r.get(d);h&&(t.remove(h),r.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,e.memory.geometries--}function a(p,d){return i[d.id]===!0||(d.addEventListener("dispose",o),i[d.id]=!0,e.memory.geometries++),d}function c(p){const d=p.attributes;for(const g in d)t.update(d[g],s.ARRAY_BUFFER);const h=p.morphAttributes;for(const g in h){const v=h[g];for(let m=0,f=v.length;m<f;m++)t.update(v[m],s.ARRAY_BUFFER)}}function l(p){const d=[],h=p.index,g=p.attributes.position;let v=0;if(h!==null){const _=h.array;v=h.version;for(let M=0,x=_.length;M<x;M+=3){const A=_[M+0],w=_[M+1],T=_[M+2];d.push(A,w,w,T,T,A)}}else if(g!==void 0){const _=g.array;v=g.version;for(let M=0,x=_.length/3-1;M<x;M+=3){const A=M+0,w=M+1,T=M+2;d.push(A,w,w,T,T,A)}}else return;const m=new(tc(d)?lc:ac)(d,1);m.version=v;const f=r.get(p);f&&t.remove(f),r.set(p,m)}function u(p){const d=r.get(p);if(d){const h=p.index;h!==null&&d.version<h.version&&l(p)}else l(p);return r.get(p)}return{get:a,update:c,getWireframeAttribute:u}}function Xp(s,t,e){let n;function i(d){n=d}let r,o;function a(d){r=d.type,o=d.bytesPerElement}function c(d,h){s.drawElements(n,h,r,d*o),e.update(h,n,1)}function l(d,h,g){g!==0&&(s.drawElementsInstanced(n,h,r,d*o,g),e.update(h,n,g))}function u(d,h,g){if(g===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,h,0,r,d,0,g);let m=0;for(let f=0;f<g;f++)m+=h[f];e.update(m,n,1)}function p(d,h,g,v){if(g===0)return;const m=t.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<d.length;f++)l(d[f]/o,h[f],v[f]);else{m.multiDrawElementsInstancedWEBGL(n,h,0,r,d,0,v,0,g);let f=0;for(let _=0;_<g;_++)f+=h[_]*v[_];e.update(f,n,1)}}this.setMode=i,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=u,this.renderMultiDrawInstances=p}function Yp(s){const t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(e.calls++,o){case s.TRIANGLES:e.triangles+=a*(r/3);break;case s.LINES:e.lines+=a*(r/2);break;case s.LINE_STRIP:e.lines+=a*(r-1);break;case s.LINE_LOOP:e.lines+=a*r;break;case s.POINTS:e.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function i(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:i,update:n}}function $p(s,t,e){const n=new WeakMap,i=new Zt;function r(o,a,c){const l=o.morphTargetInfluences,u=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,p=u!==void 0?u.length:0;let d=n.get(a);if(d===void 0||d.count!==p){let y=function(){P.dispose(),n.delete(a),a.removeEventListener("dispose",y)};var h=y;d!==void 0&&d.texture.dispose();const g=a.morphAttributes.position!==void 0,v=a.morphAttributes.normal!==void 0,m=a.morphAttributes.color!==void 0,f=a.morphAttributes.position||[],_=a.morphAttributes.normal||[],M=a.morphAttributes.color||[];let x=0;g===!0&&(x=1),v===!0&&(x=2),m===!0&&(x=3);let A=a.attributes.position.count*x,w=1;A>t.maxTextureSize&&(w=Math.ceil(A/t.maxTextureSize),A=t.maxTextureSize);const T=new Float32Array(A*w*4*p),P=new nc(T,A,w,p);P.type=Xe,P.needsUpdate=!0;const S=x*4;for(let C=0;C<p;C++){const I=f[C],D=_[C],G=M[C],q=A*w*4*C;for(let U=0;U<I.count;U++){const H=U*S;g===!0&&(i.fromBufferAttribute(I,U),T[q+H+0]=i.x,T[q+H+1]=i.y,T[q+H+2]=i.z,T[q+H+3]=0),v===!0&&(i.fromBufferAttribute(D,U),T[q+H+4]=i.x,T[q+H+5]=i.y,T[q+H+6]=i.z,T[q+H+7]=0),m===!0&&(i.fromBufferAttribute(G,U),T[q+H+8]=i.x,T[q+H+9]=i.y,T[q+H+10]=i.z,T[q+H+11]=G.itemSize===4?i.w:1)}}d={count:p,texture:P,size:new Wt(A,w)},n.set(a,d),a.addEventListener("dispose",y)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)c.getUniforms().setValue(s,"morphTexture",o.morphTexture,e);else{let g=0;for(let m=0;m<l.length;m++)g+=l[m];const v=a.morphTargetsRelative?1:1-g;c.getUniforms().setValue(s,"morphTargetBaseInfluence",v),c.getUniforms().setValue(s,"morphTargetInfluences",l)}c.getUniforms().setValue(s,"morphTargetsTexture",d.texture,e),c.getUniforms().setValue(s,"morphTargetsTextureSize",d.size)}return{update:r}}function jp(s,t,e,n){let i=new WeakMap;function r(c){const l=n.render.frame,u=c.geometry,p=t.get(c,u);if(i.get(p)!==l&&(t.update(p),i.set(p,l)),c.isInstancedMesh&&(c.hasEventListener("dispose",a)===!1&&c.addEventListener("dispose",a),i.get(c)!==l&&(e.update(c.instanceMatrix,s.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,s.ARRAY_BUFFER),i.set(c,l))),c.isSkinnedMesh){const d=c.skeleton;i.get(d)!==l&&(d.update(),i.set(d,l))}return p}function o(){i=new WeakMap}function a(c){const l=c.target;l.removeEventListener("dispose",a),e.remove(l.instanceMatrix),l.instanceColor!==null&&e.remove(l.instanceColor)}return{update:r,dispose:o}}class fc extends _e{constructor(t,e,n,i,r,o,a,c,l,u=oi){if(u!==oi&&u!==fi)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&u===oi&&(n=kn),n===void 0&&u===fi&&(n=di),super(null,i,r,o,a,c,u,n,l),this.isDepthTexture=!0,this.image={width:t,height:e},this.magFilter=a!==void 0?a:xe,this.minFilter=c!==void 0?c:xe,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.compareFunction=t.compareFunction,this}toJSON(t){const e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}}const pc=new _e,Wa=new fc(1,1),mc=new nc,gc=new ic,vc=new uc,qa=[],Xa=[],Ya=new Float32Array(16),$a=new Float32Array(9),ja=new Float32Array(4);function Mi(s,t,e){const n=s[0];if(n<=0||n>0)return s;const i=t*e;let r=qa[i];if(r===void 0&&(r=new Float32Array(i),qa[i]=r),t!==0){n.toArray(r,0);for(let o=1,a=0;o!==t;++o)a+=e,s[o].toArray(r,a)}return r}function ae(s,t){if(s.length!==t.length)return!1;for(let e=0,n=s.length;e<n;e++)if(s[e]!==t[e])return!1;return!0}function le(s,t){for(let e=0,n=t.length;e<n;e++)s[e]=t[e]}function Ys(s,t){let e=Xa[t];e===void 0&&(e=new Int32Array(t),Xa[t]=e);for(let n=0;n!==t;++n)e[n]=s.allocateTextureUnit();return e}function Kp(s,t){const e=this.cache;e[0]!==t&&(s.uniform1f(this.addr,t),e[0]=t)}function Zp(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(ae(e,t))return;s.uniform2fv(this.addr,t),le(e,t)}}function Jp(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(s.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(ae(e,t))return;s.uniform3fv(this.addr,t),le(e,t)}}function Qp(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(ae(e,t))return;s.uniform4fv(this.addr,t),le(e,t)}}function tm(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(ae(e,t))return;s.uniformMatrix2fv(this.addr,!1,t),le(e,t)}else{if(ae(e,n))return;ja.set(n),s.uniformMatrix2fv(this.addr,!1,ja),le(e,n)}}function em(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(ae(e,t))return;s.uniformMatrix3fv(this.addr,!1,t),le(e,t)}else{if(ae(e,n))return;$a.set(n),s.uniformMatrix3fv(this.addr,!1,$a),le(e,n)}}function nm(s,t){const e=this.cache,n=t.elements;if(n===void 0){if(ae(e,t))return;s.uniformMatrix4fv(this.addr,!1,t),le(e,t)}else{if(ae(e,n))return;Ya.set(n),s.uniformMatrix4fv(this.addr,!1,Ya),le(e,n)}}function im(s,t){const e=this.cache;e[0]!==t&&(s.uniform1i(this.addr,t),e[0]=t)}function sm(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(ae(e,t))return;s.uniform2iv(this.addr,t),le(e,t)}}function rm(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(ae(e,t))return;s.uniform3iv(this.addr,t),le(e,t)}}function om(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(ae(e,t))return;s.uniform4iv(this.addr,t),le(e,t)}}function am(s,t){const e=this.cache;e[0]!==t&&(s.uniform1ui(this.addr,t),e[0]=t)}function lm(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(s.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(ae(e,t))return;s.uniform2uiv(this.addr,t),le(e,t)}}function cm(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(s.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(ae(e,t))return;s.uniform3uiv(this.addr,t),le(e,t)}}function hm(s,t){const e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(s.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(ae(e,t))return;s.uniform4uiv(this.addr,t),le(e,t)}}function um(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r;this.type===s.SAMPLER_2D_SHADOW?(Wa.compareFunction=Ql,r=Wa):r=pc,e.setTexture2D(t||r,i)}function dm(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture3D(t||gc,i)}function fm(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTextureCube(t||vc,i)}function pm(s,t,e){const n=this.cache,i=e.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),e.setTexture2DArray(t||mc,i)}function mm(s){switch(s){case 5126:return Kp;case 35664:return Zp;case 35665:return Jp;case 35666:return Qp;case 35674:return tm;case 35675:return em;case 35676:return nm;case 5124:case 35670:return im;case 35667:case 35671:return sm;case 35668:case 35672:return rm;case 35669:case 35673:return om;case 5125:return am;case 36294:return lm;case 36295:return cm;case 36296:return hm;case 35678:case 36198:case 36298:case 36306:case 35682:return um;case 35679:case 36299:case 36307:return dm;case 35680:case 36300:case 36308:case 36293:return fm;case 36289:case 36303:case 36311:case 36292:return pm}}function gm(s,t){s.uniform1fv(this.addr,t)}function vm(s,t){const e=Mi(t,this.size,2);s.uniform2fv(this.addr,e)}function xm(s,t){const e=Mi(t,this.size,3);s.uniform3fv(this.addr,e)}function _m(s,t){const e=Mi(t,this.size,4);s.uniform4fv(this.addr,e)}function Mm(s,t){const e=Mi(t,this.size,4);s.uniformMatrix2fv(this.addr,!1,e)}function ym(s,t){const e=Mi(t,this.size,9);s.uniformMatrix3fv(this.addr,!1,e)}function Sm(s,t){const e=Mi(t,this.size,16);s.uniformMatrix4fv(this.addr,!1,e)}function bm(s,t){s.uniform1iv(this.addr,t)}function Em(s,t){s.uniform2iv(this.addr,t)}function wm(s,t){s.uniform3iv(this.addr,t)}function Tm(s,t){s.uniform4iv(this.addr,t)}function Am(s,t){s.uniform1uiv(this.addr,t)}function Cm(s,t){s.uniform2uiv(this.addr,t)}function Rm(s,t){s.uniform3uiv(this.addr,t)}function Pm(s,t){s.uniform4uiv(this.addr,t)}function Lm(s,t,e){const n=this.cache,i=t.length,r=Ys(e,i);ae(n,r)||(s.uniform1iv(this.addr,r),le(n,r));for(let o=0;o!==i;++o)e.setTexture2D(t[o]||pc,r[o])}function Dm(s,t,e){const n=this.cache,i=t.length,r=Ys(e,i);ae(n,r)||(s.uniform1iv(this.addr,r),le(n,r));for(let o=0;o!==i;++o)e.setTexture3D(t[o]||gc,r[o])}function Im(s,t,e){const n=this.cache,i=t.length,r=Ys(e,i);ae(n,r)||(s.uniform1iv(this.addr,r),le(n,r));for(let o=0;o!==i;++o)e.setTextureCube(t[o]||vc,r[o])}function Um(s,t,e){const n=this.cache,i=t.length,r=Ys(e,i);ae(n,r)||(s.uniform1iv(this.addr,r),le(n,r));for(let o=0;o!==i;++o)e.setTexture2DArray(t[o]||mc,r[o])}function Nm(s){switch(s){case 5126:return gm;case 35664:return vm;case 35665:return xm;case 35666:return _m;case 35674:return Mm;case 35675:return ym;case 35676:return Sm;case 5124:case 35670:return bm;case 35667:case 35671:return Em;case 35668:case 35672:return wm;case 35669:case 35673:return Tm;case 5125:return Am;case 36294:return Cm;case 36295:return Rm;case 36296:return Pm;case 35678:case 36198:case 36298:case 36306:case 35682:return Lm;case 35679:case 36299:case 36307:return Dm;case 35680:case 36300:case 36308:case 36293:return Im;case 36289:case 36303:case 36311:case 36292:return Um}}class Fm{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=mm(e.type)}}class km{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=Nm(e.type)}}class Om{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){const i=this.seq;for(let r=0,o=i.length;r!==o;++r){const a=i[r];a.setValue(t,e[a.id],n)}}}const wr=/(\w+)(\])?(\[|\.)?/g;function Ka(s,t){s.seq.push(t),s.map[t.id]=t}function Bm(s,t,e){const n=s.name,i=n.length;for(wr.lastIndex=0;;){const r=wr.exec(n),o=wr.lastIndex;let a=r[1];const c=r[2]==="]",l=r[3];if(c&&(a=a|0),l===void 0||l==="["&&o+2===i){Ka(e,l===void 0?new Fm(a,s,t):new km(a,s,t));break}else{let p=e.map[a];p===void 0&&(p=new Om(a),Ka(e,p)),e=p}}}class Us{constructor(t,e){this.seq=[],this.map={};const n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let i=0;i<n;++i){const r=t.getActiveUniform(e,i),o=t.getUniformLocation(e,r.name);Bm(r,o,this)}}setValue(t,e,n,i){const r=this.map[e];r!==void 0&&r.setValue(t,n,i)}setOptional(t,e,n){const i=e[n];i!==void 0&&this.setValue(t,n,i)}static upload(t,e,n,i){for(let r=0,o=e.length;r!==o;++r){const a=e[r],c=n[a.id];c.needsUpdate!==!1&&a.setValue(t,c.value,i)}}static seqWithValue(t,e){const n=[];for(let i=0,r=t.length;i!==r;++i){const o=t[i];o.id in e&&n.push(o)}return n}}function Za(s,t,e){const n=s.createShader(t);return s.shaderSource(n,e),s.compileShader(n),n}const zm=37297;let Hm=0;function Vm(s,t){const e=s.split(`
`),n=[],i=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let o=i;o<r;o++){const a=o+1;n.push(`${a===t?">":" "} ${a}: ${e[o]}`)}return n.join(`
`)}const Ja=new It;function Gm(s){Vt._getMatrix(Ja,Vt.workingColorSpace,s);const t=`mat3( ${Ja.elements.map(e=>e.toFixed(4))} )`;switch(Vt.getTransfer(s)){case Xs:return[t,"LinearTransferOETF"];case Kt:return[t,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",s),[t,"LinearTransferOETF"]}}function Qa(s,t,e){const n=s.getShaderParameter(t,s.COMPILE_STATUS),i=s.getShaderInfoLog(t).trim();if(n&&i==="")return"";const r=/ERROR: 0:(\d+)/.exec(i);if(r){const o=parseInt(r[1]);return e.toUpperCase()+`

`+i+`

`+Vm(s.getShaderSource(t),o)}else return i}function Wm(s,t){const e=Gm(t);return[`vec4 ${s}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}function qm(s,t){let e;switch(t){case lu:e="Linear";break;case cu:e="Reinhard";break;case hu:e="Cineon";break;case uu:e="ACESFilmic";break;case fu:e="AgX";break;case pu:e="Neutral";break;case du:e="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",t),e="Linear"}return"vec3 "+s+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}const xs=new B;function Xm(){Vt.getLuminanceCoefficients(xs);const s=xs.x.toFixed(4),t=xs.y.toFixed(4),e=xs.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${s}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Ym(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",s.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(ki).join(`
`)}function $m(s){const t=[];for(const e in s){const n=s[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function jm(s,t){const e={},n=s.getProgramParameter(t,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){const r=s.getActiveAttrib(t,i),o=r.name;let a=1;r.type===s.FLOAT_MAT2&&(a=2),r.type===s.FLOAT_MAT3&&(a=3),r.type===s.FLOAT_MAT4&&(a=4),e[o]={type:r.type,location:s.getAttribLocation(t,o),locationSize:a}}return e}function ki(s){return s!==""}function tl(s,t){const e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function el(s,t){return s.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}const Km=/^[ \t]*#include +<([\w\d./]+)>/gm;function wo(s){return s.replace(Km,Jm)}const Zm=new Map;function Jm(s,t){let e=Nt[t];if(e===void 0){const n=Zm.get(t);if(n!==void 0)e=Nt[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("Can not resolve #include <"+t+">")}return wo(e)}const Qm=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function nl(s){return s.replace(Qm,t0)}function t0(s,t,e,n){let i="";for(let r=parseInt(t);r<parseInt(e);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function il(s){let t=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?t+=`
#define HIGH_PRECISION`:s.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}function e0(s){let t="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===zl?t="SHADOWMAP_TYPE_PCF":s.shadowMapType===Hh?t="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===en&&(t="SHADOWMAP_TYPE_VSM"),t}function n0(s){let t="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case hi:case ui:t="ENVMAP_TYPE_CUBE";break;case qs:t="ENVMAP_TYPE_CUBE_UV";break}return t}function i0(s){let t="ENVMAP_MODE_REFLECTION";if(s.envMap)switch(s.envMapMode){case ui:t="ENVMAP_MODE_REFRACTION";break}return t}function s0(s){let t="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case Hl:t="ENVMAP_BLENDING_MULTIPLY";break;case ou:t="ENVMAP_BLENDING_MIX";break;case au:t="ENVMAP_BLENDING_ADD";break}return t}function r0(s){const t=s.envMapCubeUVHeight;if(t===null)return null;const e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function o0(s,t,e,n){const i=s.getContext(),r=e.defines;let o=e.vertexShader,a=e.fragmentShader;const c=e0(e),l=n0(e),u=i0(e),p=s0(e),d=r0(e),h=Ym(e),g=$m(r),v=i.createProgram();let m,f,_=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(m=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(ki).join(`
`),m.length>0&&(m+=`
`),f=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(ki).join(`
`),f.length>0&&(f+=`
`)):(m=[il(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+u:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+c:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",e.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(ki).join(`
`),f=[il(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+l:"",e.envMap?"#define "+u:"",e.envMap?"#define "+p:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor||e.batchingColor?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+c:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",e.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==gn?"#define TONE_MAPPING":"",e.toneMapping!==gn?Nt.tonemapping_pars_fragment:"",e.toneMapping!==gn?qm("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",Nt.colorspace_pars_fragment,Wm("linearToOutputTexel",e.outputColorSpace),Xm(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(ki).join(`
`)),o=wo(o),o=tl(o,e),o=el(o,e),a=wo(a),a=tl(a,e),a=el(a,e),o=nl(o),a=nl(a),e.isRawShaderMaterial!==!0&&(_=`#version 300 es
`,m=[h,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,f=["#define varying in",e.glslVersion===zi?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===zi?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);const M=_+m+o,x=_+f+a,A=Za(i,i.VERTEX_SHADER,M),w=Za(i,i.FRAGMENT_SHADER,x);i.attachShader(v,A),i.attachShader(v,w),e.index0AttributeName!==void 0?i.bindAttribLocation(v,0,e.index0AttributeName):e.morphTargets===!0&&i.bindAttribLocation(v,0,"position"),i.linkProgram(v);function T(C){if(s.debug.checkShaderErrors){const I=i.getProgramInfoLog(v).trim(),D=i.getShaderInfoLog(A).trim(),G=i.getShaderInfoLog(w).trim();let q=!0,U=!0;if(i.getProgramParameter(v,i.LINK_STATUS)===!1)if(q=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,v,A,w);else{const H=Qa(i,A,"vertex"),z=Qa(i,w,"fragment");console.error("THREE.WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(v,i.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+I+`
`+H+`
`+z)}else I!==""?console.warn("THREE.WebGLProgram: Program Info Log:",I):(D===""||G==="")&&(U=!1);U&&(C.diagnostics={runnable:q,programLog:I,vertexShader:{log:D,prefix:m},fragmentShader:{log:G,prefix:f}})}i.deleteShader(A),i.deleteShader(w),P=new Us(i,v),S=jm(i,v)}let P;this.getUniforms=function(){return P===void 0&&T(this),P};let S;this.getAttributes=function(){return S===void 0&&T(this),S};let y=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return y===!1&&(y=i.getProgramParameter(v,zm)),y},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(v),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=Hm++,this.cacheKey=t,this.usedTimes=1,this.program=v,this.vertexShader=A,this.fragmentShader=w,this}let a0=0;class l0{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t){const e=t.vertexShader,n=t.fragmentShader,i=this._getShaderStage(e),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(t);return o.has(i)===!1&&(o.add(i),i.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(t){const e=this.materialCache.get(t);for(const n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderID(t){return this._getShaderStage(t.vertexShader).id}getFragmentShaderID(t){return this._getShaderStage(t.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){const e=this.materialCache;let n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){const e=this.shaderCache;let n=e.get(t);return n===void 0&&(n=new c0(t),e.set(t,n)),n}}class c0{constructor(t){this.id=a0++,this.code=t,this.usedTimes=0}}function h0(s,t,e,n,i,r,o){const a=new rc,c=new l0,l=new Set,u=[],p=i.logarithmicDepthBuffer,d=i.vertexTextures;let h=i.precision;const g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function v(S){return l.add(S),S===0?"uv":`uv${S}`}function m(S,y,C,I,D){const G=I.fog,q=D.geometry,U=S.isMeshStandardMaterial?I.environment:null,H=(S.isMeshStandardMaterial?e:t).get(S.envMap||U),z=H&&H.mapping===qs?H.image.height:null,et=g[S.type];S.precision!==null&&(h=i.getMaxPrecision(S.precision),h!==S.precision&&console.warn("THREE.WebGLProgram.getParameters:",S.precision,"not supported, using",h,"instead."));const tt=q.morphAttributes.position||q.morphAttributes.normal||q.morphAttributes.color,st=tt!==void 0?tt.length:0;let gt=0;q.morphAttributes.position!==void 0&&(gt=1),q.morphAttributes.normal!==void 0&&(gt=2),q.morphAttributes.color!==void 0&&(gt=3);let Tt,$,J,lt;if(et){const jt=Ge[et];Tt=jt.vertexShader,$=jt.fragmentShader}else Tt=S.vertexShader,$=S.fragmentShader,c.update(S),J=c.getVertexShaderID(S),lt=c.getFragmentShaderID(S);const rt=s.getRenderTarget(),bt=s.state.buffers.depth.getReversed(),At=D.isInstancedMesh===!0,Ct=D.isBatchedMesh===!0,qt=!!S.map,Ot=!!S.matcap,ee=!!H,F=!!S.aoMap,ue=!!S.lightMap,Ft=!!S.bumpMap,kt=!!S.normalMap,St=!!S.displacementMap,$t=!!S.emissiveMap,Et=!!S.metalnessMap,R=!!S.roughnessMap,b=S.anisotropy>0,V=S.clearcoat>0,K=S.dispersion>0,Q=S.iridescence>0,j=S.sheen>0,Mt=S.transmission>0,ct=b&&!!S.anisotropyMap,ft=V&&!!S.clearcoatMap,Ht=V&&!!S.clearcoatNormalMap,nt=V&&!!S.clearcoatRoughnessMap,pt=Q&&!!S.iridescenceMap,wt=Q&&!!S.iridescenceThicknessMap,Rt=j&&!!S.sheenColorMap,mt=j&&!!S.sheenRoughnessMap,zt=!!S.specularMap,Ut=!!S.specularColorMap,Qt=!!S.specularIntensityMap,N=Mt&&!!S.transmissionMap,at=Mt&&!!S.thicknessMap,Y=!!S.gradientMap,Z=!!S.alphaMap,dt=S.alphaTest>0,ht=!!S.alphaHash,Lt=!!S.extensions;let se=gn;S.toneMapped&&(rt===null||rt.isXRRenderTarget===!0)&&(se=s.toneMapping);const de={shaderID:et,shaderType:S.type,shaderName:S.name,vertexShader:Tt,fragmentShader:$,defines:S.defines,customVertexShaderID:J,customFragmentShaderID:lt,isRawShaderMaterial:S.isRawShaderMaterial===!0,glslVersion:S.glslVersion,precision:h,batching:Ct,batchingColor:Ct&&D._colorsTexture!==null,instancing:At,instancingColor:At&&D.instanceColor!==null,instancingMorph:At&&D.morphTexture!==null,supportsVertexTextures:d,outputColorSpace:rt===null?s.outputColorSpace:rt.isXRRenderTarget===!0?rt.texture.colorSpace:gi,alphaToCoverage:!!S.alphaToCoverage,map:qt,matcap:Ot,envMap:ee,envMapMode:ee&&H.mapping,envMapCubeUVHeight:z,aoMap:F,lightMap:ue,bumpMap:Ft,normalMap:kt,displacementMap:d&&St,emissiveMap:$t,normalMapObjectSpace:kt&&S.normalMapType===xu,normalMapTangentSpace:kt&&S.normalMapType===Jl,metalnessMap:Et,roughnessMap:R,anisotropy:b,anisotropyMap:ct,clearcoat:V,clearcoatMap:ft,clearcoatNormalMap:Ht,clearcoatRoughnessMap:nt,dispersion:K,iridescence:Q,iridescenceMap:pt,iridescenceThicknessMap:wt,sheen:j,sheenColorMap:Rt,sheenRoughnessMap:mt,specularMap:zt,specularColorMap:Ut,specularIntensityMap:Qt,transmission:Mt,transmissionMap:N,thicknessMap:at,gradientMap:Y,opaque:S.transparent===!1&&S.blending===ri&&S.alphaToCoverage===!1,alphaMap:Z,alphaTest:dt,alphaHash:ht,combine:S.combine,mapUv:qt&&v(S.map.channel),aoMapUv:F&&v(S.aoMap.channel),lightMapUv:ue&&v(S.lightMap.channel),bumpMapUv:Ft&&v(S.bumpMap.channel),normalMapUv:kt&&v(S.normalMap.channel),displacementMapUv:St&&v(S.displacementMap.channel),emissiveMapUv:$t&&v(S.emissiveMap.channel),metalnessMapUv:Et&&v(S.metalnessMap.channel),roughnessMapUv:R&&v(S.roughnessMap.channel),anisotropyMapUv:ct&&v(S.anisotropyMap.channel),clearcoatMapUv:ft&&v(S.clearcoatMap.channel),clearcoatNormalMapUv:Ht&&v(S.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:nt&&v(S.clearcoatRoughnessMap.channel),iridescenceMapUv:pt&&v(S.iridescenceMap.channel),iridescenceThicknessMapUv:wt&&v(S.iridescenceThicknessMap.channel),sheenColorMapUv:Rt&&v(S.sheenColorMap.channel),sheenRoughnessMapUv:mt&&v(S.sheenRoughnessMap.channel),specularMapUv:zt&&v(S.specularMap.channel),specularColorMapUv:Ut&&v(S.specularColorMap.channel),specularIntensityMapUv:Qt&&v(S.specularIntensityMap.channel),transmissionMapUv:N&&v(S.transmissionMap.channel),thicknessMapUv:at&&v(S.thicknessMap.channel),alphaMapUv:Z&&v(S.alphaMap.channel),vertexTangents:!!q.attributes.tangent&&(kt||b),vertexColors:S.vertexColors,vertexAlphas:S.vertexColors===!0&&!!q.attributes.color&&q.attributes.color.itemSize===4,pointsUvs:D.isPoints===!0&&!!q.attributes.uv&&(qt||Z),fog:!!G,useFog:S.fog===!0,fogExp2:!!G&&G.isFogExp2,flatShading:S.flatShading===!0,sizeAttenuation:S.sizeAttenuation===!0,logarithmicDepthBuffer:p,reverseDepthBuffer:bt,skinning:D.isSkinnedMesh===!0,morphTargets:q.morphAttributes.position!==void 0,morphNormals:q.morphAttributes.normal!==void 0,morphColors:q.morphAttributes.color!==void 0,morphTargetsCount:st,morphTextureStride:gt,numDirLights:y.directional.length,numPointLights:y.point.length,numSpotLights:y.spot.length,numSpotLightMaps:y.spotLightMap.length,numRectAreaLights:y.rectArea.length,numHemiLights:y.hemi.length,numDirLightShadows:y.directionalShadowMap.length,numPointLightShadows:y.pointShadowMap.length,numSpotLightShadows:y.spotShadowMap.length,numSpotLightShadowsWithMaps:y.numSpotLightShadowsWithMaps,numLightProbes:y.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:S.dithering,shadowMapEnabled:s.shadowMap.enabled&&C.length>0,shadowMapType:s.shadowMap.type,toneMapping:se,decodeVideoTexture:qt&&S.map.isVideoTexture===!0&&Vt.getTransfer(S.map.colorSpace)===Kt,decodeVideoTextureEmissive:$t&&S.emissiveMap.isVideoTexture===!0&&Vt.getTransfer(S.emissiveMap.colorSpace)===Kt,premultipliedAlpha:S.premultipliedAlpha,doubleSided:S.side===We,flipSided:S.side===ge,useDepthPacking:S.depthPacking>=0,depthPacking:S.depthPacking||0,index0AttributeName:S.index0AttributeName,extensionClipCullDistance:Lt&&S.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(Lt&&S.extensions.multiDraw===!0||Ct)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:S.customProgramCacheKey()};return de.vertexUv1s=l.has(1),de.vertexUv2s=l.has(2),de.vertexUv3s=l.has(3),l.clear(),de}function f(S){const y=[];if(S.shaderID?y.push(S.shaderID):(y.push(S.customVertexShaderID),y.push(S.customFragmentShaderID)),S.defines!==void 0)for(const C in S.defines)y.push(C),y.push(S.defines[C]);return S.isRawShaderMaterial===!1&&(_(y,S),M(y,S),y.push(s.outputColorSpace)),y.push(S.customProgramCacheKey),y.join()}function _(S,y){S.push(y.precision),S.push(y.outputColorSpace),S.push(y.envMapMode),S.push(y.envMapCubeUVHeight),S.push(y.mapUv),S.push(y.alphaMapUv),S.push(y.lightMapUv),S.push(y.aoMapUv),S.push(y.bumpMapUv),S.push(y.normalMapUv),S.push(y.displacementMapUv),S.push(y.emissiveMapUv),S.push(y.metalnessMapUv),S.push(y.roughnessMapUv),S.push(y.anisotropyMapUv),S.push(y.clearcoatMapUv),S.push(y.clearcoatNormalMapUv),S.push(y.clearcoatRoughnessMapUv),S.push(y.iridescenceMapUv),S.push(y.iridescenceThicknessMapUv),S.push(y.sheenColorMapUv),S.push(y.sheenRoughnessMapUv),S.push(y.specularMapUv),S.push(y.specularColorMapUv),S.push(y.specularIntensityMapUv),S.push(y.transmissionMapUv),S.push(y.thicknessMapUv),S.push(y.combine),S.push(y.fogExp2),S.push(y.sizeAttenuation),S.push(y.morphTargetsCount),S.push(y.morphAttributeCount),S.push(y.numDirLights),S.push(y.numPointLights),S.push(y.numSpotLights),S.push(y.numSpotLightMaps),S.push(y.numHemiLights),S.push(y.numRectAreaLights),S.push(y.numDirLightShadows),S.push(y.numPointLightShadows),S.push(y.numSpotLightShadows),S.push(y.numSpotLightShadowsWithMaps),S.push(y.numLightProbes),S.push(y.shadowMapType),S.push(y.toneMapping),S.push(y.numClippingPlanes),S.push(y.numClipIntersection),S.push(y.depthPacking)}function M(S,y){a.disableAll(),y.supportsVertexTextures&&a.enable(0),y.instancing&&a.enable(1),y.instancingColor&&a.enable(2),y.instancingMorph&&a.enable(3),y.matcap&&a.enable(4),y.envMap&&a.enable(5),y.normalMapObjectSpace&&a.enable(6),y.normalMapTangentSpace&&a.enable(7),y.clearcoat&&a.enable(8),y.iridescence&&a.enable(9),y.alphaTest&&a.enable(10),y.vertexColors&&a.enable(11),y.vertexAlphas&&a.enable(12),y.vertexUv1s&&a.enable(13),y.vertexUv2s&&a.enable(14),y.vertexUv3s&&a.enable(15),y.vertexTangents&&a.enable(16),y.anisotropy&&a.enable(17),y.alphaHash&&a.enable(18),y.batching&&a.enable(19),y.dispersion&&a.enable(20),y.batchingColor&&a.enable(21),S.push(a.mask),a.disableAll(),y.fog&&a.enable(0),y.useFog&&a.enable(1),y.flatShading&&a.enable(2),y.logarithmicDepthBuffer&&a.enable(3),y.reverseDepthBuffer&&a.enable(4),y.skinning&&a.enable(5),y.morphTargets&&a.enable(6),y.morphNormals&&a.enable(7),y.morphColors&&a.enable(8),y.premultipliedAlpha&&a.enable(9),y.shadowMapEnabled&&a.enable(10),y.doubleSided&&a.enable(11),y.flipSided&&a.enable(12),y.useDepthPacking&&a.enable(13),y.dithering&&a.enable(14),y.transmission&&a.enable(15),y.sheen&&a.enable(16),y.opaque&&a.enable(17),y.pointsUvs&&a.enable(18),y.decodeVideoTexture&&a.enable(19),y.decodeVideoTextureEmissive&&a.enable(20),y.alphaToCoverage&&a.enable(21),S.push(a.mask)}function x(S){const y=g[S.type];let C;if(y){const I=Ge[y];C=Xu.clone(I.uniforms)}else C=S.uniforms;return C}function A(S,y){let C;for(let I=0,D=u.length;I<D;I++){const G=u[I];if(G.cacheKey===y){C=G,++C.usedTimes;break}}return C===void 0&&(C=new o0(s,y,S,r),u.push(C)),C}function w(S){if(--S.usedTimes===0){const y=u.indexOf(S);u[y]=u[u.length-1],u.pop(),S.destroy()}}function T(S){c.remove(S)}function P(){c.dispose()}return{getParameters:m,getProgramCacheKey:f,getUniforms:x,acquireProgram:A,releaseProgram:w,releaseShaderCache:T,programs:u,dispose:P}}function u0(){let s=new WeakMap;function t(o){return s.has(o)}function e(o){let a=s.get(o);return a===void 0&&(a={},s.set(o,a)),a}function n(o){s.delete(o)}function i(o,a,c){s.get(o)[a]=c}function r(){s=new WeakMap}return{has:t,get:e,remove:n,update:i,dispose:r}}function d0(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.material.id!==t.material.id?s.material.id-t.material.id:s.z!==t.z?s.z-t.z:s.id-t.id}function sl(s,t){return s.groupOrder!==t.groupOrder?s.groupOrder-t.groupOrder:s.renderOrder!==t.renderOrder?s.renderOrder-t.renderOrder:s.z!==t.z?t.z-s.z:s.id-t.id}function rl(){const s=[];let t=0;const e=[],n=[],i=[];function r(){t=0,e.length=0,n.length=0,i.length=0}function o(p,d,h,g,v,m){let f=s[t];return f===void 0?(f={id:p.id,object:p,geometry:d,material:h,groupOrder:g,renderOrder:p.renderOrder,z:v,group:m},s[t]=f):(f.id=p.id,f.object=p,f.geometry=d,f.material=h,f.groupOrder=g,f.renderOrder=p.renderOrder,f.z=v,f.group=m),t++,f}function a(p,d,h,g,v,m){const f=o(p,d,h,g,v,m);h.transmission>0?n.push(f):h.transparent===!0?i.push(f):e.push(f)}function c(p,d,h,g,v,m){const f=o(p,d,h,g,v,m);h.transmission>0?n.unshift(f):h.transparent===!0?i.unshift(f):e.unshift(f)}function l(p,d){e.length>1&&e.sort(p||d0),n.length>1&&n.sort(d||sl),i.length>1&&i.sort(d||sl)}function u(){for(let p=t,d=s.length;p<d;p++){const h=s[p];if(h.id===null)break;h.id=null,h.object=null,h.geometry=null,h.material=null,h.group=null}}return{opaque:e,transmissive:n,transparent:i,init:r,push:a,unshift:c,finish:u,sort:l}}function f0(){let s=new WeakMap;function t(n,i){const r=s.get(n);let o;return r===void 0?(o=new rl,s.set(n,[o])):i>=r.length?(o=new rl,r.push(o)):o=r[i],o}function e(){s=new WeakMap}return{get:t,dispose:e}}function p0(){const s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new B,color:new Bt};break;case"SpotLight":e={position:new B,direction:new B,color:new Bt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new B,color:new Bt,distance:0,decay:0};break;case"HemisphereLight":e={direction:new B,skyColor:new Bt,groundColor:new Bt};break;case"RectAreaLight":e={color:new Bt,position:new B,halfWidth:new B,halfHeight:new B};break}return s[t.id]=e,e}}}function m0(){const s={};return{get:function(t){if(s[t.id]!==void 0)return s[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Wt};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Wt};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Wt,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[t.id]=e,e}}}let g0=0;function v0(s,t){return(t.castShadow?2:0)-(s.castShadow?2:0)+(t.map?1:0)-(s.map?1:0)}function x0(s){const t=new p0,e=m0(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)n.probe.push(new B);const i=new B,r=new Jt,o=new Jt;function a(l){let u=0,p=0,d=0;for(let S=0;S<9;S++)n.probe[S].set(0,0,0);let h=0,g=0,v=0,m=0,f=0,_=0,M=0,x=0,A=0,w=0,T=0;l.sort(v0);for(let S=0,y=l.length;S<y;S++){const C=l[S],I=C.color,D=C.intensity,G=C.distance,q=C.shadow&&C.shadow.map?C.shadow.map.texture:null;if(C.isAmbientLight)u+=I.r*D,p+=I.g*D,d+=I.b*D;else if(C.isLightProbe){for(let U=0;U<9;U++)n.probe[U].addScaledVector(C.sh.coefficients[U],D);T++}else if(C.isDirectionalLight){const U=t.get(C);if(U.color.copy(C.color).multiplyScalar(C.intensity),C.castShadow){const H=C.shadow,z=e.get(C);z.shadowIntensity=H.intensity,z.shadowBias=H.bias,z.shadowNormalBias=H.normalBias,z.shadowRadius=H.radius,z.shadowMapSize=H.mapSize,n.directionalShadow[h]=z,n.directionalShadowMap[h]=q,n.directionalShadowMatrix[h]=C.shadow.matrix,_++}n.directional[h]=U,h++}else if(C.isSpotLight){const U=t.get(C);U.position.setFromMatrixPosition(C.matrixWorld),U.color.copy(I).multiplyScalar(D),U.distance=G,U.coneCos=Math.cos(C.angle),U.penumbraCos=Math.cos(C.angle*(1-C.penumbra)),U.decay=C.decay,n.spot[v]=U;const H=C.shadow;if(C.map&&(n.spotLightMap[A]=C.map,A++,H.updateMatrices(C),C.castShadow&&w++),n.spotLightMatrix[v]=H.matrix,C.castShadow){const z=e.get(C);z.shadowIntensity=H.intensity,z.shadowBias=H.bias,z.shadowNormalBias=H.normalBias,z.shadowRadius=H.radius,z.shadowMapSize=H.mapSize,n.spotShadow[v]=z,n.spotShadowMap[v]=q,x++}v++}else if(C.isRectAreaLight){const U=t.get(C);U.color.copy(I).multiplyScalar(D),U.halfWidth.set(C.width*.5,0,0),U.halfHeight.set(0,C.height*.5,0),n.rectArea[m]=U,m++}else if(C.isPointLight){const U=t.get(C);if(U.color.copy(C.color).multiplyScalar(C.intensity),U.distance=C.distance,U.decay=C.decay,C.castShadow){const H=C.shadow,z=e.get(C);z.shadowIntensity=H.intensity,z.shadowBias=H.bias,z.shadowNormalBias=H.normalBias,z.shadowRadius=H.radius,z.shadowMapSize=H.mapSize,z.shadowCameraNear=H.camera.near,z.shadowCameraFar=H.camera.far,n.pointShadow[g]=z,n.pointShadowMap[g]=q,n.pointShadowMatrix[g]=C.shadow.matrix,M++}n.point[g]=U,g++}else if(C.isHemisphereLight){const U=t.get(C);U.skyColor.copy(C.color).multiplyScalar(D),U.groundColor.copy(C.groundColor).multiplyScalar(D),n.hemi[f]=U,f++}}m>0&&(s.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=ot.LTC_FLOAT_1,n.rectAreaLTC2=ot.LTC_FLOAT_2):(n.rectAreaLTC1=ot.LTC_HALF_1,n.rectAreaLTC2=ot.LTC_HALF_2)),n.ambient[0]=u,n.ambient[1]=p,n.ambient[2]=d;const P=n.hash;(P.directionalLength!==h||P.pointLength!==g||P.spotLength!==v||P.rectAreaLength!==m||P.hemiLength!==f||P.numDirectionalShadows!==_||P.numPointShadows!==M||P.numSpotShadows!==x||P.numSpotMaps!==A||P.numLightProbes!==T)&&(n.directional.length=h,n.spot.length=v,n.rectArea.length=m,n.point.length=g,n.hemi.length=f,n.directionalShadow.length=_,n.directionalShadowMap.length=_,n.pointShadow.length=M,n.pointShadowMap.length=M,n.spotShadow.length=x,n.spotShadowMap.length=x,n.directionalShadowMatrix.length=_,n.pointShadowMatrix.length=M,n.spotLightMatrix.length=x+A-w,n.spotLightMap.length=A,n.numSpotLightShadowsWithMaps=w,n.numLightProbes=T,P.directionalLength=h,P.pointLength=g,P.spotLength=v,P.rectAreaLength=m,P.hemiLength=f,P.numDirectionalShadows=_,P.numPointShadows=M,P.numSpotShadows=x,P.numSpotMaps=A,P.numLightProbes=T,n.version=g0++)}function c(l,u){let p=0,d=0,h=0,g=0,v=0;const m=u.matrixWorldInverse;for(let f=0,_=l.length;f<_;f++){const M=l[f];if(M.isDirectionalLight){const x=n.directional[p];x.direction.setFromMatrixPosition(M.matrixWorld),i.setFromMatrixPosition(M.target.matrixWorld),x.direction.sub(i),x.direction.transformDirection(m),p++}else if(M.isSpotLight){const x=n.spot[h];x.position.setFromMatrixPosition(M.matrixWorld),x.position.applyMatrix4(m),x.direction.setFromMatrixPosition(M.matrixWorld),i.setFromMatrixPosition(M.target.matrixWorld),x.direction.sub(i),x.direction.transformDirection(m),h++}else if(M.isRectAreaLight){const x=n.rectArea[g];x.position.setFromMatrixPosition(M.matrixWorld),x.position.applyMatrix4(m),o.identity(),r.copy(M.matrixWorld),r.premultiply(m),o.extractRotation(r),x.halfWidth.set(M.width*.5,0,0),x.halfHeight.set(0,M.height*.5,0),x.halfWidth.applyMatrix4(o),x.halfHeight.applyMatrix4(o),g++}else if(M.isPointLight){const x=n.point[d];x.position.setFromMatrixPosition(M.matrixWorld),x.position.applyMatrix4(m),d++}else if(M.isHemisphereLight){const x=n.hemi[v];x.direction.setFromMatrixPosition(M.matrixWorld),x.direction.transformDirection(m),v++}}}return{setup:a,setupView:c,state:n}}function ol(s){const t=new x0(s),e=[],n=[];function i(u){l.camera=u,e.length=0,n.length=0}function r(u){e.push(u)}function o(u){n.push(u)}function a(){t.setup(e)}function c(u){t.setupView(e,u)}const l={lightsArray:e,shadowsArray:n,camera:null,lights:t,transmissionRenderTarget:{}};return{init:i,state:l,setupLights:a,setupLightsView:c,pushLight:r,pushShadow:o}}function _0(s){let t=new WeakMap;function e(i,r=0){const o=t.get(i);let a;return o===void 0?(a=new ol(s),t.set(i,[a])):r>=o.length?(a=new ol(s),o.push(a)):a=o[r],a}function n(){t=new WeakMap}return{get:e,dispose:n}}class M0 extends _i{static get type(){return"MeshDepthMaterial"}constructor(t){super(),this.isMeshDepthMaterial=!0,this.depthPacking=gu,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}}class y0 extends _i{static get type(){return"MeshDistanceMaterial"}constructor(t){super(),this.isMeshDistanceMaterial=!0,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}}const S0=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,b0=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function E0(s,t,e){let n=new Vo;const i=new Wt,r=new Wt,o=new Zt,a=new M0({depthPacking:vu}),c=new y0,l={},u=e.maxTextureSize,p={[xn]:ge,[ge]:xn,[We]:We},d=new He({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Wt},radius:{value:4}},vertexShader:S0,fragmentShader:b0}),h=d.clone();h.defines.HORIZONTAL_PASS=1;const g=new Te;g.setAttribute("position",new Me(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const v=new me(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=zl;let f=this.type;this.render=function(w,T,P){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||w.length===0)return;const S=s.getRenderTarget(),y=s.getActiveCubeFace(),C=s.getActiveMipmapLevel(),I=s.state;I.setBlending(sn),I.buffers.color.setClear(1,1,1,1),I.buffers.depth.setTest(!0),I.setScissorTest(!1);const D=f!==en&&this.type===en,G=f===en&&this.type!==en;for(let q=0,U=w.length;q<U;q++){const H=w[q],z=H.shadow;if(z===void 0){console.warn("THREE.WebGLShadowMap:",H,"has no shadow.");continue}if(z.autoUpdate===!1&&z.needsUpdate===!1)continue;i.copy(z.mapSize);const et=z.getFrameExtents();if(i.multiply(et),r.copy(z.mapSize),(i.x>u||i.y>u)&&(i.x>u&&(r.x=Math.floor(u/et.x),i.x=r.x*et.x,z.mapSize.x=r.x),i.y>u&&(r.y=Math.floor(u/et.y),i.y=r.y*et.y,z.mapSize.y=r.y)),z.map===null||D===!0||G===!0){const st=this.type!==en?{minFilter:xe,magFilter:xe}:{};z.map!==null&&z.map.dispose(),z.map=new _n(i.x,i.y,st),z.map.texture.name=H.name+".shadowMap",z.camera.updateProjectionMatrix()}s.setRenderTarget(z.map),s.clear();const tt=z.getViewportCount();for(let st=0;st<tt;st++){const gt=z.getViewport(st);o.set(r.x*gt.x,r.y*gt.y,r.x*gt.z,r.y*gt.w),I.viewport(o),z.updateMatrices(H,st),n=z.getFrustum(),x(T,P,z.camera,H,this.type)}z.isPointLightShadow!==!0&&this.type===en&&_(z,P),z.needsUpdate=!1}f=this.type,m.needsUpdate=!1,s.setRenderTarget(S,y,C)};function _(w,T){const P=t.update(v);d.defines.VSM_SAMPLES!==w.blurSamples&&(d.defines.VSM_SAMPLES=w.blurSamples,h.defines.VSM_SAMPLES=w.blurSamples,d.needsUpdate=!0,h.needsUpdate=!0),w.mapPass===null&&(w.mapPass=new _n(i.x,i.y)),d.uniforms.shadow_pass.value=w.map.texture,d.uniforms.resolution.value=w.mapSize,d.uniforms.radius.value=w.radius,s.setRenderTarget(w.mapPass),s.clear(),s.renderBufferDirect(T,null,P,d,v,null),h.uniforms.shadow_pass.value=w.mapPass.texture,h.uniforms.resolution.value=w.mapSize,h.uniforms.radius.value=w.radius,s.setRenderTarget(w.map),s.clear(),s.renderBufferDirect(T,null,P,h,v,null)}function M(w,T,P,S){let y=null;const C=P.isPointLight===!0?w.customDistanceMaterial:w.customDepthMaterial;if(C!==void 0)y=C;else if(y=P.isPointLight===!0?c:a,s.localClippingEnabled&&T.clipShadows===!0&&Array.isArray(T.clippingPlanes)&&T.clippingPlanes.length!==0||T.displacementMap&&T.displacementScale!==0||T.alphaMap&&T.alphaTest>0||T.map&&T.alphaTest>0){const I=y.uuid,D=T.uuid;let G=l[I];G===void 0&&(G={},l[I]=G);let q=G[D];q===void 0&&(q=y.clone(),G[D]=q,T.addEventListener("dispose",A)),y=q}if(y.visible=T.visible,y.wireframe=T.wireframe,S===en?y.side=T.shadowSide!==null?T.shadowSide:T.side:y.side=T.shadowSide!==null?T.shadowSide:p[T.side],y.alphaMap=T.alphaMap,y.alphaTest=T.alphaTest,y.map=T.map,y.clipShadows=T.clipShadows,y.clippingPlanes=T.clippingPlanes,y.clipIntersection=T.clipIntersection,y.displacementMap=T.displacementMap,y.displacementScale=T.displacementScale,y.displacementBias=T.displacementBias,y.wireframeLinewidth=T.wireframeLinewidth,y.linewidth=T.linewidth,P.isPointLight===!0&&y.isMeshDistanceMaterial===!0){const I=s.properties.get(y);I.light=P}return y}function x(w,T,P,S,y){if(w.visible===!1)return;if(w.layers.test(T.layers)&&(w.isMesh||w.isLine||w.isPoints)&&(w.castShadow||w.receiveShadow&&y===en)&&(!w.frustumCulled||n.intersectsObject(w))){w.modelViewMatrix.multiplyMatrices(P.matrixWorldInverse,w.matrixWorld);const D=t.update(w),G=w.material;if(Array.isArray(G)){const q=D.groups;for(let U=0,H=q.length;U<H;U++){const z=q[U],et=G[z.materialIndex];if(et&&et.visible){const tt=M(w,et,S,y);w.onBeforeShadow(s,w,T,P,D,tt,z),s.renderBufferDirect(P,null,D,tt,w,z),w.onAfterShadow(s,w,T,P,D,tt,z)}}}else if(G.visible){const q=M(w,G,S,y);w.onBeforeShadow(s,w,T,P,D,q,null),s.renderBufferDirect(P,null,D,q,w,null),w.onAfterShadow(s,w,T,P,D,q,null)}}const I=w.children;for(let D=0,G=I.length;D<G;D++)x(I[D],T,P,S,y)}function A(w){w.target.removeEventListener("dispose",A);for(const P in l){const S=l[P],y=w.target.uuid;y in S&&(S[y].dispose(),delete S[y])}}}const w0={[zr]:Hr,[Vr]:qr,[Gr]:Xr,[ci]:Wr,[Hr]:zr,[qr]:Vr,[Xr]:Gr,[Wr]:ci};function T0(s,t){function e(){let N=!1;const at=new Zt;let Y=null;const Z=new Zt(0,0,0,0);return{setMask:function(dt){Y!==dt&&!N&&(s.colorMask(dt,dt,dt,dt),Y=dt)},setLocked:function(dt){N=dt},setClear:function(dt,ht,Lt,se,de){de===!0&&(dt*=se,ht*=se,Lt*=se),at.set(dt,ht,Lt,se),Z.equals(at)===!1&&(s.clearColor(dt,ht,Lt,se),Z.copy(at))},reset:function(){N=!1,Y=null,Z.set(-1,0,0,0)}}}function n(){let N=!1,at=!1,Y=null,Z=null,dt=null;return{setReversed:function(ht){if(at!==ht){const Lt=t.get("EXT_clip_control");at?Lt.clipControlEXT(Lt.LOWER_LEFT_EXT,Lt.ZERO_TO_ONE_EXT):Lt.clipControlEXT(Lt.LOWER_LEFT_EXT,Lt.NEGATIVE_ONE_TO_ONE_EXT);const se=dt;dt=null,this.setClear(se)}at=ht},getReversed:function(){return at},setTest:function(ht){ht?rt(s.DEPTH_TEST):bt(s.DEPTH_TEST)},setMask:function(ht){Y!==ht&&!N&&(s.depthMask(ht),Y=ht)},setFunc:function(ht){if(at&&(ht=w0[ht]),Z!==ht){switch(ht){case zr:s.depthFunc(s.NEVER);break;case Hr:s.depthFunc(s.ALWAYS);break;case Vr:s.depthFunc(s.LESS);break;case ci:s.depthFunc(s.LEQUAL);break;case Gr:s.depthFunc(s.EQUAL);break;case Wr:s.depthFunc(s.GEQUAL);break;case qr:s.depthFunc(s.GREATER);break;case Xr:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}Z=ht}},setLocked:function(ht){N=ht},setClear:function(ht){dt!==ht&&(at&&(ht=1-ht),s.clearDepth(ht),dt=ht)},reset:function(){N=!1,Y=null,Z=null,dt=null,at=!1}}}function i(){let N=!1,at=null,Y=null,Z=null,dt=null,ht=null,Lt=null,se=null,de=null;return{setTest:function(jt){N||(jt?rt(s.STENCIL_TEST):bt(s.STENCIL_TEST))},setMask:function(jt){at!==jt&&!N&&(s.stencilMask(jt),at=jt)},setFunc:function(jt,Fe,$e){(Y!==jt||Z!==Fe||dt!==$e)&&(s.stencilFunc(jt,Fe,$e),Y=jt,Z=Fe,dt=$e)},setOp:function(jt,Fe,$e){(ht!==jt||Lt!==Fe||se!==$e)&&(s.stencilOp(jt,Fe,$e),ht=jt,Lt=Fe,se=$e)},setLocked:function(jt){N=jt},setClear:function(jt){de!==jt&&(s.clearStencil(jt),de=jt)},reset:function(){N=!1,at=null,Y=null,Z=null,dt=null,ht=null,Lt=null,se=null,de=null}}}const r=new e,o=new n,a=new i,c=new WeakMap,l=new WeakMap;let u={},p={},d=new WeakMap,h=[],g=null,v=!1,m=null,f=null,_=null,M=null,x=null,A=null,w=null,T=new Bt(0,0,0),P=0,S=!1,y=null,C=null,I=null,D=null,G=null;const q=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let U=!1,H=0;const z=s.getParameter(s.VERSION);z.indexOf("WebGL")!==-1?(H=parseFloat(/^WebGL (\d)/.exec(z)[1]),U=H>=1):z.indexOf("OpenGL ES")!==-1&&(H=parseFloat(/^OpenGL ES (\d)/.exec(z)[1]),U=H>=2);let et=null,tt={};const st=s.getParameter(s.SCISSOR_BOX),gt=s.getParameter(s.VIEWPORT),Tt=new Zt().fromArray(st),$=new Zt().fromArray(gt);function J(N,at,Y,Z){const dt=new Uint8Array(4),ht=s.createTexture();s.bindTexture(N,ht),s.texParameteri(N,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(N,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let Lt=0;Lt<Y;Lt++)N===s.TEXTURE_3D||N===s.TEXTURE_2D_ARRAY?s.texImage3D(at,0,s.RGBA,1,1,Z,0,s.RGBA,s.UNSIGNED_BYTE,dt):s.texImage2D(at+Lt,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,dt);return ht}const lt={};lt[s.TEXTURE_2D]=J(s.TEXTURE_2D,s.TEXTURE_2D,1),lt[s.TEXTURE_CUBE_MAP]=J(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),lt[s.TEXTURE_2D_ARRAY]=J(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),lt[s.TEXTURE_3D]=J(s.TEXTURE_3D,s.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),rt(s.DEPTH_TEST),o.setFunc(ci),Ft(!1),kt(ua),rt(s.CULL_FACE),F(sn);function rt(N){u[N]!==!0&&(s.enable(N),u[N]=!0)}function bt(N){u[N]!==!1&&(s.disable(N),u[N]=!1)}function At(N,at){return p[N]!==at?(s.bindFramebuffer(N,at),p[N]=at,N===s.DRAW_FRAMEBUFFER&&(p[s.FRAMEBUFFER]=at),N===s.FRAMEBUFFER&&(p[s.DRAW_FRAMEBUFFER]=at),!0):!1}function Ct(N,at){let Y=h,Z=!1;if(N){Y=d.get(at),Y===void 0&&(Y=[],d.set(at,Y));const dt=N.textures;if(Y.length!==dt.length||Y[0]!==s.COLOR_ATTACHMENT0){for(let ht=0,Lt=dt.length;ht<Lt;ht++)Y[ht]=s.COLOR_ATTACHMENT0+ht;Y.length=dt.length,Z=!0}}else Y[0]!==s.BACK&&(Y[0]=s.BACK,Z=!0);Z&&s.drawBuffers(Y)}function qt(N){return g!==N?(s.useProgram(N),g=N,!0):!1}const Ot={[Pn]:s.FUNC_ADD,[Gh]:s.FUNC_SUBTRACT,[Wh]:s.FUNC_REVERSE_SUBTRACT};Ot[qh]=s.MIN,Ot[Xh]=s.MAX;const ee={[Yh]:s.ZERO,[$h]:s.ONE,[jh]:s.SRC_COLOR,[Or]:s.SRC_ALPHA,[eu]:s.SRC_ALPHA_SATURATE,[Qh]:s.DST_COLOR,[Zh]:s.DST_ALPHA,[Kh]:s.ONE_MINUS_SRC_COLOR,[Br]:s.ONE_MINUS_SRC_ALPHA,[tu]:s.ONE_MINUS_DST_COLOR,[Jh]:s.ONE_MINUS_DST_ALPHA,[nu]:s.CONSTANT_COLOR,[iu]:s.ONE_MINUS_CONSTANT_COLOR,[su]:s.CONSTANT_ALPHA,[ru]:s.ONE_MINUS_CONSTANT_ALPHA};function F(N,at,Y,Z,dt,ht,Lt,se,de,jt){if(N===sn){v===!0&&(bt(s.BLEND),v=!1);return}if(v===!1&&(rt(s.BLEND),v=!0),N!==Vh){if(N!==m||jt!==S){if((f!==Pn||x!==Pn)&&(s.blendEquation(s.FUNC_ADD),f=Pn,x=Pn),jt)switch(N){case ri:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case da:s.blendFunc(s.ONE,s.ONE);break;case fa:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case pa:s.blendFuncSeparate(s.ZERO,s.SRC_COLOR,s.ZERO,s.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",N);break}else switch(N){case ri:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case da:s.blendFunc(s.SRC_ALPHA,s.ONE);break;case fa:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case pa:s.blendFunc(s.ZERO,s.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",N);break}_=null,M=null,A=null,w=null,T.set(0,0,0),P=0,m=N,S=jt}return}dt=dt||at,ht=ht||Y,Lt=Lt||Z,(at!==f||dt!==x)&&(s.blendEquationSeparate(Ot[at],Ot[dt]),f=at,x=dt),(Y!==_||Z!==M||ht!==A||Lt!==w)&&(s.blendFuncSeparate(ee[Y],ee[Z],ee[ht],ee[Lt]),_=Y,M=Z,A=ht,w=Lt),(se.equals(T)===!1||de!==P)&&(s.blendColor(se.r,se.g,se.b,de),T.copy(se),P=de),m=N,S=!1}function ue(N,at){N.side===We?bt(s.CULL_FACE):rt(s.CULL_FACE);let Y=N.side===ge;at&&(Y=!Y),Ft(Y),N.blending===ri&&N.transparent===!1?F(sn):F(N.blending,N.blendEquation,N.blendSrc,N.blendDst,N.blendEquationAlpha,N.blendSrcAlpha,N.blendDstAlpha,N.blendColor,N.blendAlpha,N.premultipliedAlpha),o.setFunc(N.depthFunc),o.setTest(N.depthTest),o.setMask(N.depthWrite),r.setMask(N.colorWrite);const Z=N.stencilWrite;a.setTest(Z),Z&&(a.setMask(N.stencilWriteMask),a.setFunc(N.stencilFunc,N.stencilRef,N.stencilFuncMask),a.setOp(N.stencilFail,N.stencilZFail,N.stencilZPass)),$t(N.polygonOffset,N.polygonOffsetFactor,N.polygonOffsetUnits),N.alphaToCoverage===!0?rt(s.SAMPLE_ALPHA_TO_COVERAGE):bt(s.SAMPLE_ALPHA_TO_COVERAGE)}function Ft(N){y!==N&&(N?s.frontFace(s.CW):s.frontFace(s.CCW),y=N)}function kt(N){N!==Bh?(rt(s.CULL_FACE),N!==C&&(N===ua?s.cullFace(s.BACK):N===zh?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):bt(s.CULL_FACE),C=N}function St(N){N!==I&&(U&&s.lineWidth(N),I=N)}function $t(N,at,Y){N?(rt(s.POLYGON_OFFSET_FILL),(D!==at||G!==Y)&&(s.polygonOffset(at,Y),D=at,G=Y)):bt(s.POLYGON_OFFSET_FILL)}function Et(N){N?rt(s.SCISSOR_TEST):bt(s.SCISSOR_TEST)}function R(N){N===void 0&&(N=s.TEXTURE0+q-1),et!==N&&(s.activeTexture(N),et=N)}function b(N,at,Y){Y===void 0&&(et===null?Y=s.TEXTURE0+q-1:Y=et);let Z=tt[Y];Z===void 0&&(Z={type:void 0,texture:void 0},tt[Y]=Z),(Z.type!==N||Z.texture!==at)&&(et!==Y&&(s.activeTexture(Y),et=Y),s.bindTexture(N,at||lt[N]),Z.type=N,Z.texture=at)}function V(){const N=tt[et];N!==void 0&&N.type!==void 0&&(s.bindTexture(N.type,null),N.type=void 0,N.texture=void 0)}function K(){try{s.compressedTexImage2D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Q(){try{s.compressedTexImage3D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function j(){try{s.texSubImage2D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Mt(){try{s.texSubImage3D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function ct(){try{s.compressedTexSubImage2D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function ft(){try{s.compressedTexSubImage3D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Ht(){try{s.texStorage2D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function nt(){try{s.texStorage3D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function pt(){try{s.texImage2D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function wt(){try{s.texImage3D.apply(s,arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Rt(N){Tt.equals(N)===!1&&(s.scissor(N.x,N.y,N.z,N.w),Tt.copy(N))}function mt(N){$.equals(N)===!1&&(s.viewport(N.x,N.y,N.z,N.w),$.copy(N))}function zt(N,at){let Y=l.get(at);Y===void 0&&(Y=new WeakMap,l.set(at,Y));let Z=Y.get(N);Z===void 0&&(Z=s.getUniformBlockIndex(at,N.name),Y.set(N,Z))}function Ut(N,at){const Z=l.get(at).get(N);c.get(at)!==Z&&(s.uniformBlockBinding(at,Z,N.__bindingPointIndex),c.set(at,Z))}function Qt(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),o.setReversed(!1),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),u={},et=null,tt={},p={},d=new WeakMap,h=[],g=null,v=!1,m=null,f=null,_=null,M=null,x=null,A=null,w=null,T=new Bt(0,0,0),P=0,S=!1,y=null,C=null,I=null,D=null,G=null,Tt.set(0,0,s.canvas.width,s.canvas.height),$.set(0,0,s.canvas.width,s.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:rt,disable:bt,bindFramebuffer:At,drawBuffers:Ct,useProgram:qt,setBlending:F,setMaterial:ue,setFlipSided:Ft,setCullFace:kt,setLineWidth:St,setPolygonOffset:$t,setScissorTest:Et,activeTexture:R,bindTexture:b,unbindTexture:V,compressedTexImage2D:K,compressedTexImage3D:Q,texImage2D:pt,texImage3D:wt,updateUBOMapping:zt,uniformBlockBinding:Ut,texStorage2D:Ht,texStorage3D:nt,texSubImage2D:j,texSubImage3D:Mt,compressedTexSubImage2D:ct,compressedTexSubImage3D:ft,scissor:Rt,viewport:mt,reset:Qt}}function al(s,t,e,n){const i=A0(n);switch(e){case Xl:return s*t;case $l:return s*t;case jl:return s*t*2;case ko:return s*t/i.components*i.byteLength;case Oo:return s*t/i.components*i.byteLength;case Kl:return s*t*2/i.components*i.byteLength;case Bo:return s*t*2/i.components*i.byteLength;case Yl:return s*t*3/i.components*i.byteLength;case we:return s*t*4/i.components*i.byteLength;case zo:return s*t*4/i.components*i.byteLength;case Cs:case Rs:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case Ps:case Ls:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case Jr:case to:return Math.max(s,16)*Math.max(t,8)/4;case Zr:case Qr:return Math.max(s,8)*Math.max(t,8)/2;case eo:case no:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*8;case io:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case so:return Math.floor((s+3)/4)*Math.floor((t+3)/4)*16;case ro:return Math.floor((s+4)/5)*Math.floor((t+3)/4)*16;case oo:return Math.floor((s+4)/5)*Math.floor((t+4)/5)*16;case ao:return Math.floor((s+5)/6)*Math.floor((t+4)/5)*16;case lo:return Math.floor((s+5)/6)*Math.floor((t+5)/6)*16;case co:return Math.floor((s+7)/8)*Math.floor((t+4)/5)*16;case ho:return Math.floor((s+7)/8)*Math.floor((t+5)/6)*16;case uo:return Math.floor((s+7)/8)*Math.floor((t+7)/8)*16;case fo:return Math.floor((s+9)/10)*Math.floor((t+4)/5)*16;case po:return Math.floor((s+9)/10)*Math.floor((t+5)/6)*16;case mo:return Math.floor((s+9)/10)*Math.floor((t+7)/8)*16;case go:return Math.floor((s+9)/10)*Math.floor((t+9)/10)*16;case vo:return Math.floor((s+11)/12)*Math.floor((t+9)/10)*16;case xo:return Math.floor((s+11)/12)*Math.floor((t+11)/12)*16;case Ds:case _o:case Mo:return Math.ceil(s/4)*Math.ceil(t/4)*16;case Zl:case yo:return Math.ceil(s/4)*Math.ceil(t/4)*8;case So:case bo:return Math.ceil(s/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function A0(s){switch(s){case Ne:case Gl:return{byteLength:1,components:1};case Gi:case Wl:case qi:return{byteLength:2,components:1};case No:case Fo:return{byteLength:2,components:4};case kn:case Uo:case Xe:return{byteLength:4,components:1};case ql:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${s}.`)}function C0(s,t,e,n,i,r,o){const a=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new Wt,u=new WeakMap;let p;const d=new WeakMap;let h=!1;try{h=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(R,b){return h?new OffscreenCanvas(R,b):ks("canvas")}function v(R,b,V){let K=1;const Q=Et(R);if((Q.width>V||Q.height>V)&&(K=V/Math.max(Q.width,Q.height)),K<1)if(typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&R instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&R instanceof ImageBitmap||typeof VideoFrame<"u"&&R instanceof VideoFrame){const j=Math.floor(K*Q.width),Mt=Math.floor(K*Q.height);p===void 0&&(p=g(j,Mt));const ct=b?g(j,Mt):p;return ct.width=j,ct.height=Mt,ct.getContext("2d").drawImage(R,0,0,j,Mt),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+Q.width+"x"+Q.height+") to ("+j+"x"+Mt+")."),ct}else return"data"in R&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+Q.width+"x"+Q.height+")."),R;return R}function m(R){return R.generateMipmaps}function f(R){s.generateMipmap(R)}function _(R){return R.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:R.isWebGL3DRenderTarget?s.TEXTURE_3D:R.isWebGLArrayRenderTarget||R.isCompressedArrayTexture?s.TEXTURE_2D_ARRAY:s.TEXTURE_2D}function M(R,b,V,K,Q=!1){if(R!==null){if(s[R]!==void 0)return s[R];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+R+"'")}let j=b;if(b===s.RED&&(V===s.FLOAT&&(j=s.R32F),V===s.HALF_FLOAT&&(j=s.R16F),V===s.UNSIGNED_BYTE&&(j=s.R8)),b===s.RED_INTEGER&&(V===s.UNSIGNED_BYTE&&(j=s.R8UI),V===s.UNSIGNED_SHORT&&(j=s.R16UI),V===s.UNSIGNED_INT&&(j=s.R32UI),V===s.BYTE&&(j=s.R8I),V===s.SHORT&&(j=s.R16I),V===s.INT&&(j=s.R32I)),b===s.RG&&(V===s.FLOAT&&(j=s.RG32F),V===s.HALF_FLOAT&&(j=s.RG16F),V===s.UNSIGNED_BYTE&&(j=s.RG8)),b===s.RG_INTEGER&&(V===s.UNSIGNED_BYTE&&(j=s.RG8UI),V===s.UNSIGNED_SHORT&&(j=s.RG16UI),V===s.UNSIGNED_INT&&(j=s.RG32UI),V===s.BYTE&&(j=s.RG8I),V===s.SHORT&&(j=s.RG16I),V===s.INT&&(j=s.RG32I)),b===s.RGB_INTEGER&&(V===s.UNSIGNED_BYTE&&(j=s.RGB8UI),V===s.UNSIGNED_SHORT&&(j=s.RGB16UI),V===s.UNSIGNED_INT&&(j=s.RGB32UI),V===s.BYTE&&(j=s.RGB8I),V===s.SHORT&&(j=s.RGB16I),V===s.INT&&(j=s.RGB32I)),b===s.RGBA_INTEGER&&(V===s.UNSIGNED_BYTE&&(j=s.RGBA8UI),V===s.UNSIGNED_SHORT&&(j=s.RGBA16UI),V===s.UNSIGNED_INT&&(j=s.RGBA32UI),V===s.BYTE&&(j=s.RGBA8I),V===s.SHORT&&(j=s.RGBA16I),V===s.INT&&(j=s.RGBA32I)),b===s.RGB&&V===s.UNSIGNED_INT_5_9_9_9_REV&&(j=s.RGB9_E5),b===s.RGBA){const Mt=Q?Xs:Vt.getTransfer(K);V===s.FLOAT&&(j=s.RGBA32F),V===s.HALF_FLOAT&&(j=s.RGBA16F),V===s.UNSIGNED_BYTE&&(j=Mt===Kt?s.SRGB8_ALPHA8:s.RGBA8),V===s.UNSIGNED_SHORT_4_4_4_4&&(j=s.RGBA4),V===s.UNSIGNED_SHORT_5_5_5_1&&(j=s.RGB5_A1)}return(j===s.R16F||j===s.R32F||j===s.RG16F||j===s.RG32F||j===s.RGBA16F||j===s.RGBA32F)&&t.get("EXT_color_buffer_float"),j}function x(R,b){let V;return R?b===null||b===kn||b===di?V=s.DEPTH24_STENCIL8:b===Xe?V=s.DEPTH32F_STENCIL8:b===Gi&&(V=s.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):b===null||b===kn||b===di?V=s.DEPTH_COMPONENT24:b===Xe?V=s.DEPTH_COMPONENT32F:b===Gi&&(V=s.DEPTH_COMPONENT16),V}function A(R,b){return m(R)===!0||R.isFramebufferTexture&&R.minFilter!==xe&&R.minFilter!==Ee?Math.log2(Math.max(b.width,b.height))+1:R.mipmaps!==void 0&&R.mipmaps.length>0?R.mipmaps.length:R.isCompressedTexture&&Array.isArray(R.image)?b.mipmaps.length:1}function w(R){const b=R.target;b.removeEventListener("dispose",w),P(b),b.isVideoTexture&&u.delete(b)}function T(R){const b=R.target;b.removeEventListener("dispose",T),y(b)}function P(R){const b=n.get(R);if(b.__webglInit===void 0)return;const V=R.source,K=d.get(V);if(K){const Q=K[b.__cacheKey];Q.usedTimes--,Q.usedTimes===0&&S(R),Object.keys(K).length===0&&d.delete(V)}n.remove(R)}function S(R){const b=n.get(R);s.deleteTexture(b.__webglTexture);const V=R.source,K=d.get(V);delete K[b.__cacheKey],o.memory.textures--}function y(R){const b=n.get(R);if(R.depthTexture&&(R.depthTexture.dispose(),n.remove(R.depthTexture)),R.isWebGLCubeRenderTarget)for(let K=0;K<6;K++){if(Array.isArray(b.__webglFramebuffer[K]))for(let Q=0;Q<b.__webglFramebuffer[K].length;Q++)s.deleteFramebuffer(b.__webglFramebuffer[K][Q]);else s.deleteFramebuffer(b.__webglFramebuffer[K]);b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer[K])}else{if(Array.isArray(b.__webglFramebuffer))for(let K=0;K<b.__webglFramebuffer.length;K++)s.deleteFramebuffer(b.__webglFramebuffer[K]);else s.deleteFramebuffer(b.__webglFramebuffer);if(b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer),b.__webglMultisampledFramebuffer&&s.deleteFramebuffer(b.__webglMultisampledFramebuffer),b.__webglColorRenderbuffer)for(let K=0;K<b.__webglColorRenderbuffer.length;K++)b.__webglColorRenderbuffer[K]&&s.deleteRenderbuffer(b.__webglColorRenderbuffer[K]);b.__webglDepthRenderbuffer&&s.deleteRenderbuffer(b.__webglDepthRenderbuffer)}const V=R.textures;for(let K=0,Q=V.length;K<Q;K++){const j=n.get(V[K]);j.__webglTexture&&(s.deleteTexture(j.__webglTexture),o.memory.textures--),n.remove(V[K])}n.remove(R)}let C=0;function I(){C=0}function D(){const R=C;return R>=i.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+R+" texture units while this GPU supports only "+i.maxTextures),C+=1,R}function G(R){const b=[];return b.push(R.wrapS),b.push(R.wrapT),b.push(R.wrapR||0),b.push(R.magFilter),b.push(R.minFilter),b.push(R.anisotropy),b.push(R.internalFormat),b.push(R.format),b.push(R.type),b.push(R.generateMipmaps),b.push(R.premultiplyAlpha),b.push(R.flipY),b.push(R.unpackAlignment),b.push(R.colorSpace),b.join()}function q(R,b){const V=n.get(R);if(R.isVideoTexture&&St(R),R.isRenderTargetTexture===!1&&R.version>0&&V.__version!==R.version){const K=R.image;if(K===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(K.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{$(V,R,b);return}}e.bindTexture(s.TEXTURE_2D,V.__webglTexture,s.TEXTURE0+b)}function U(R,b){const V=n.get(R);if(R.version>0&&V.__version!==R.version){$(V,R,b);return}e.bindTexture(s.TEXTURE_2D_ARRAY,V.__webglTexture,s.TEXTURE0+b)}function H(R,b){const V=n.get(R);if(R.version>0&&V.__version!==R.version){$(V,R,b);return}e.bindTexture(s.TEXTURE_3D,V.__webglTexture,s.TEXTURE0+b)}function z(R,b){const V=n.get(R);if(R.version>0&&V.__version!==R.version){J(V,R,b);return}e.bindTexture(s.TEXTURE_CUBE_MAP,V.__webglTexture,s.TEXTURE0+b)}const et={[jr]:s.REPEAT,[Dn]:s.CLAMP_TO_EDGE,[Kr]:s.MIRRORED_REPEAT},tt={[xe]:s.NEAREST,[mu]:s.NEAREST_MIPMAP_NEAREST,[Ji]:s.NEAREST_MIPMAP_LINEAR,[Ee]:s.LINEAR,[Js]:s.LINEAR_MIPMAP_NEAREST,[In]:s.LINEAR_MIPMAP_LINEAR},st={[_u]:s.NEVER,[wu]:s.ALWAYS,[Mu]:s.LESS,[Ql]:s.LEQUAL,[yu]:s.EQUAL,[Eu]:s.GEQUAL,[Su]:s.GREATER,[bu]:s.NOTEQUAL};function gt(R,b){if(b.type===Xe&&t.has("OES_texture_float_linear")===!1&&(b.magFilter===Ee||b.magFilter===Js||b.magFilter===Ji||b.magFilter===In||b.minFilter===Ee||b.minFilter===Js||b.minFilter===Ji||b.minFilter===In)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(R,s.TEXTURE_WRAP_S,et[b.wrapS]),s.texParameteri(R,s.TEXTURE_WRAP_T,et[b.wrapT]),(R===s.TEXTURE_3D||R===s.TEXTURE_2D_ARRAY)&&s.texParameteri(R,s.TEXTURE_WRAP_R,et[b.wrapR]),s.texParameteri(R,s.TEXTURE_MAG_FILTER,tt[b.magFilter]),s.texParameteri(R,s.TEXTURE_MIN_FILTER,tt[b.minFilter]),b.compareFunction&&(s.texParameteri(R,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(R,s.TEXTURE_COMPARE_FUNC,st[b.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(b.magFilter===xe||b.minFilter!==Ji&&b.minFilter!==In||b.type===Xe&&t.has("OES_texture_float_linear")===!1)return;if(b.anisotropy>1||n.get(b).__currentAnisotropy){const V=t.get("EXT_texture_filter_anisotropic");s.texParameterf(R,V.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(b.anisotropy,i.getMaxAnisotropy())),n.get(b).__currentAnisotropy=b.anisotropy}}}function Tt(R,b){let V=!1;R.__webglInit===void 0&&(R.__webglInit=!0,b.addEventListener("dispose",w));const K=b.source;let Q=d.get(K);Q===void 0&&(Q={},d.set(K,Q));const j=G(b);if(j!==R.__cacheKey){Q[j]===void 0&&(Q[j]={texture:s.createTexture(),usedTimes:0},o.memory.textures++,V=!0),Q[j].usedTimes++;const Mt=Q[R.__cacheKey];Mt!==void 0&&(Q[R.__cacheKey].usedTimes--,Mt.usedTimes===0&&S(b)),R.__cacheKey=j,R.__webglTexture=Q[j].texture}return V}function $(R,b,V){let K=s.TEXTURE_2D;(b.isDataArrayTexture||b.isCompressedArrayTexture)&&(K=s.TEXTURE_2D_ARRAY),b.isData3DTexture&&(K=s.TEXTURE_3D);const Q=Tt(R,b),j=b.source;e.bindTexture(K,R.__webglTexture,s.TEXTURE0+V);const Mt=n.get(j);if(j.version!==Mt.__version||Q===!0){e.activeTexture(s.TEXTURE0+V);const ct=Vt.getPrimaries(Vt.workingColorSpace),ft=b.colorSpace===qe?null:Vt.getPrimaries(b.colorSpace),Ht=b.colorSpace===qe||ct===ft?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,Ht);let nt=v(b.image,!1,i.maxTextureSize);nt=$t(b,nt);const pt=r.convert(b.format,b.colorSpace),wt=r.convert(b.type);let Rt=M(b.internalFormat,pt,wt,b.colorSpace,b.isVideoTexture);gt(K,b);let mt;const zt=b.mipmaps,Ut=b.isVideoTexture!==!0,Qt=Mt.__version===void 0||Q===!0,N=j.dataReady,at=A(b,nt);if(b.isDepthTexture)Rt=x(b.format===fi,b.type),Qt&&(Ut?e.texStorage2D(s.TEXTURE_2D,1,Rt,nt.width,nt.height):e.texImage2D(s.TEXTURE_2D,0,Rt,nt.width,nt.height,0,pt,wt,null));else if(b.isDataTexture)if(zt.length>0){Ut&&Qt&&e.texStorage2D(s.TEXTURE_2D,at,Rt,zt[0].width,zt[0].height);for(let Y=0,Z=zt.length;Y<Z;Y++)mt=zt[Y],Ut?N&&e.texSubImage2D(s.TEXTURE_2D,Y,0,0,mt.width,mt.height,pt,wt,mt.data):e.texImage2D(s.TEXTURE_2D,Y,Rt,mt.width,mt.height,0,pt,wt,mt.data);b.generateMipmaps=!1}else Ut?(Qt&&e.texStorage2D(s.TEXTURE_2D,at,Rt,nt.width,nt.height),N&&e.texSubImage2D(s.TEXTURE_2D,0,0,0,nt.width,nt.height,pt,wt,nt.data)):e.texImage2D(s.TEXTURE_2D,0,Rt,nt.width,nt.height,0,pt,wt,nt.data);else if(b.isCompressedTexture)if(b.isCompressedArrayTexture){Ut&&Qt&&e.texStorage3D(s.TEXTURE_2D_ARRAY,at,Rt,zt[0].width,zt[0].height,nt.depth);for(let Y=0,Z=zt.length;Y<Z;Y++)if(mt=zt[Y],b.format!==we)if(pt!==null)if(Ut){if(N)if(b.layerUpdates.size>0){const dt=al(mt.width,mt.height,b.format,b.type);for(const ht of b.layerUpdates){const Lt=mt.data.subarray(ht*dt/mt.data.BYTES_PER_ELEMENT,(ht+1)*dt/mt.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,Y,0,0,ht,mt.width,mt.height,1,pt,Lt)}b.clearLayerUpdates()}else e.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,Y,0,0,0,mt.width,mt.height,nt.depth,pt,mt.data)}else e.compressedTexImage3D(s.TEXTURE_2D_ARRAY,Y,Rt,mt.width,mt.height,nt.depth,0,mt.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Ut?N&&e.texSubImage3D(s.TEXTURE_2D_ARRAY,Y,0,0,0,mt.width,mt.height,nt.depth,pt,wt,mt.data):e.texImage3D(s.TEXTURE_2D_ARRAY,Y,Rt,mt.width,mt.height,nt.depth,0,pt,wt,mt.data)}else{Ut&&Qt&&e.texStorage2D(s.TEXTURE_2D,at,Rt,zt[0].width,zt[0].height);for(let Y=0,Z=zt.length;Y<Z;Y++)mt=zt[Y],b.format!==we?pt!==null?Ut?N&&e.compressedTexSubImage2D(s.TEXTURE_2D,Y,0,0,mt.width,mt.height,pt,mt.data):e.compressedTexImage2D(s.TEXTURE_2D,Y,Rt,mt.width,mt.height,0,mt.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Ut?N&&e.texSubImage2D(s.TEXTURE_2D,Y,0,0,mt.width,mt.height,pt,wt,mt.data):e.texImage2D(s.TEXTURE_2D,Y,Rt,mt.width,mt.height,0,pt,wt,mt.data)}else if(b.isDataArrayTexture)if(Ut){if(Qt&&e.texStorage3D(s.TEXTURE_2D_ARRAY,at,Rt,nt.width,nt.height,nt.depth),N)if(b.layerUpdates.size>0){const Y=al(nt.width,nt.height,b.format,b.type);for(const Z of b.layerUpdates){const dt=nt.data.subarray(Z*Y/nt.data.BYTES_PER_ELEMENT,(Z+1)*Y/nt.data.BYTES_PER_ELEMENT);e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,Z,nt.width,nt.height,1,pt,wt,dt)}b.clearLayerUpdates()}else e.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,nt.width,nt.height,nt.depth,pt,wt,nt.data)}else e.texImage3D(s.TEXTURE_2D_ARRAY,0,Rt,nt.width,nt.height,nt.depth,0,pt,wt,nt.data);else if(b.isData3DTexture)Ut?(Qt&&e.texStorage3D(s.TEXTURE_3D,at,Rt,nt.width,nt.height,nt.depth),N&&e.texSubImage3D(s.TEXTURE_3D,0,0,0,0,nt.width,nt.height,nt.depth,pt,wt,nt.data)):e.texImage3D(s.TEXTURE_3D,0,Rt,nt.width,nt.height,nt.depth,0,pt,wt,nt.data);else if(b.isFramebufferTexture){if(Qt)if(Ut)e.texStorage2D(s.TEXTURE_2D,at,Rt,nt.width,nt.height);else{let Y=nt.width,Z=nt.height;for(let dt=0;dt<at;dt++)e.texImage2D(s.TEXTURE_2D,dt,Rt,Y,Z,0,pt,wt,null),Y>>=1,Z>>=1}}else if(zt.length>0){if(Ut&&Qt){const Y=Et(zt[0]);e.texStorage2D(s.TEXTURE_2D,at,Rt,Y.width,Y.height)}for(let Y=0,Z=zt.length;Y<Z;Y++)mt=zt[Y],Ut?N&&e.texSubImage2D(s.TEXTURE_2D,Y,0,0,pt,wt,mt):e.texImage2D(s.TEXTURE_2D,Y,Rt,pt,wt,mt);b.generateMipmaps=!1}else if(Ut){if(Qt){const Y=Et(nt);e.texStorage2D(s.TEXTURE_2D,at,Rt,Y.width,Y.height)}N&&e.texSubImage2D(s.TEXTURE_2D,0,0,0,pt,wt,nt)}else e.texImage2D(s.TEXTURE_2D,0,Rt,pt,wt,nt);m(b)&&f(K),Mt.__version=j.version,b.onUpdate&&b.onUpdate(b)}R.__version=b.version}function J(R,b,V){if(b.image.length!==6)return;const K=Tt(R,b),Q=b.source;e.bindTexture(s.TEXTURE_CUBE_MAP,R.__webglTexture,s.TEXTURE0+V);const j=n.get(Q);if(Q.version!==j.__version||K===!0){e.activeTexture(s.TEXTURE0+V);const Mt=Vt.getPrimaries(Vt.workingColorSpace),ct=b.colorSpace===qe?null:Vt.getPrimaries(b.colorSpace),ft=b.colorSpace===qe||Mt===ct?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,ft);const Ht=b.isCompressedTexture||b.image[0].isCompressedTexture,nt=b.image[0]&&b.image[0].isDataTexture,pt=[];for(let Z=0;Z<6;Z++)!Ht&&!nt?pt[Z]=v(b.image[Z],!0,i.maxCubemapSize):pt[Z]=nt?b.image[Z].image:b.image[Z],pt[Z]=$t(b,pt[Z]);const wt=pt[0],Rt=r.convert(b.format,b.colorSpace),mt=r.convert(b.type),zt=M(b.internalFormat,Rt,mt,b.colorSpace),Ut=b.isVideoTexture!==!0,Qt=j.__version===void 0||K===!0,N=Q.dataReady;let at=A(b,wt);gt(s.TEXTURE_CUBE_MAP,b);let Y;if(Ht){Ut&&Qt&&e.texStorage2D(s.TEXTURE_CUBE_MAP,at,zt,wt.width,wt.height);for(let Z=0;Z<6;Z++){Y=pt[Z].mipmaps;for(let dt=0;dt<Y.length;dt++){const ht=Y[dt];b.format!==we?Rt!==null?Ut?N&&e.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,dt,0,0,ht.width,ht.height,Rt,ht.data):e.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,dt,zt,ht.width,ht.height,0,ht.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):Ut?N&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,dt,0,0,ht.width,ht.height,Rt,mt,ht.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,dt,zt,ht.width,ht.height,0,Rt,mt,ht.data)}}}else{if(Y=b.mipmaps,Ut&&Qt){Y.length>0&&at++;const Z=Et(pt[0]);e.texStorage2D(s.TEXTURE_CUBE_MAP,at,zt,Z.width,Z.height)}for(let Z=0;Z<6;Z++)if(nt){Ut?N&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,0,0,pt[Z].width,pt[Z].height,Rt,mt,pt[Z].data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,zt,pt[Z].width,pt[Z].height,0,Rt,mt,pt[Z].data);for(let dt=0;dt<Y.length;dt++){const Lt=Y[dt].image[Z].image;Ut?N&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,dt+1,0,0,Lt.width,Lt.height,Rt,mt,Lt.data):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,dt+1,zt,Lt.width,Lt.height,0,Rt,mt,Lt.data)}}else{Ut?N&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,0,0,Rt,mt,pt[Z]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,0,zt,Rt,mt,pt[Z]);for(let dt=0;dt<Y.length;dt++){const ht=Y[dt];Ut?N&&e.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,dt+1,0,0,Rt,mt,ht.image[Z]):e.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+Z,dt+1,zt,Rt,mt,ht.image[Z])}}}m(b)&&f(s.TEXTURE_CUBE_MAP),j.__version=Q.version,b.onUpdate&&b.onUpdate(b)}R.__version=b.version}function lt(R,b,V,K,Q,j){const Mt=r.convert(V.format,V.colorSpace),ct=r.convert(V.type),ft=M(V.internalFormat,Mt,ct,V.colorSpace),Ht=n.get(b),nt=n.get(V);if(nt.__renderTarget=b,!Ht.__hasExternalTextures){const pt=Math.max(1,b.width>>j),wt=Math.max(1,b.height>>j);Q===s.TEXTURE_3D||Q===s.TEXTURE_2D_ARRAY?e.texImage3D(Q,j,ft,pt,wt,b.depth,0,Mt,ct,null):e.texImage2D(Q,j,ft,pt,wt,0,Mt,ct,null)}e.bindFramebuffer(s.FRAMEBUFFER,R),kt(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,K,Q,nt.__webglTexture,0,Ft(b)):(Q===s.TEXTURE_2D||Q>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&Q<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,K,Q,nt.__webglTexture,j),e.bindFramebuffer(s.FRAMEBUFFER,null)}function rt(R,b,V){if(s.bindRenderbuffer(s.RENDERBUFFER,R),b.depthBuffer){const K=b.depthTexture,Q=K&&K.isDepthTexture?K.type:null,j=x(b.stencilBuffer,Q),Mt=b.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,ct=Ft(b);kt(b)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,ct,j,b.width,b.height):V?s.renderbufferStorageMultisample(s.RENDERBUFFER,ct,j,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,j,b.width,b.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,Mt,s.RENDERBUFFER,R)}else{const K=b.textures;for(let Q=0;Q<K.length;Q++){const j=K[Q],Mt=r.convert(j.format,j.colorSpace),ct=r.convert(j.type),ft=M(j.internalFormat,Mt,ct,j.colorSpace),Ht=Ft(b);V&&kt(b)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,Ht,ft,b.width,b.height):kt(b)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,Ht,ft,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,ft,b.width,b.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function bt(R,b){if(b&&b.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(e.bindFramebuffer(s.FRAMEBUFFER,R),!(b.depthTexture&&b.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const K=n.get(b.depthTexture);K.__renderTarget=b,(!K.__webglTexture||b.depthTexture.image.width!==b.width||b.depthTexture.image.height!==b.height)&&(b.depthTexture.image.width=b.width,b.depthTexture.image.height=b.height,b.depthTexture.needsUpdate=!0),q(b.depthTexture,0);const Q=K.__webglTexture,j=Ft(b);if(b.depthTexture.format===oi)kt(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,Q,0,j):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,Q,0);else if(b.depthTexture.format===fi)kt(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,Q,0,j):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,Q,0);else throw new Error("Unknown depthTexture format")}function At(R){const b=n.get(R),V=R.isWebGLCubeRenderTarget===!0;if(b.__boundDepthTexture!==R.depthTexture){const K=R.depthTexture;if(b.__depthDisposeCallback&&b.__depthDisposeCallback(),K){const Q=()=>{delete b.__boundDepthTexture,delete b.__depthDisposeCallback,K.removeEventListener("dispose",Q)};K.addEventListener("dispose",Q),b.__depthDisposeCallback=Q}b.__boundDepthTexture=K}if(R.depthTexture&&!b.__autoAllocateDepthBuffer){if(V)throw new Error("target.depthTexture not supported in Cube render targets");bt(b.__webglFramebuffer,R)}else if(V){b.__webglDepthbuffer=[];for(let K=0;K<6;K++)if(e.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer[K]),b.__webglDepthbuffer[K]===void 0)b.__webglDepthbuffer[K]=s.createRenderbuffer(),rt(b.__webglDepthbuffer[K],R,!1);else{const Q=R.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,j=b.__webglDepthbuffer[K];s.bindRenderbuffer(s.RENDERBUFFER,j),s.framebufferRenderbuffer(s.FRAMEBUFFER,Q,s.RENDERBUFFER,j)}}else if(e.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer),b.__webglDepthbuffer===void 0)b.__webglDepthbuffer=s.createRenderbuffer(),rt(b.__webglDepthbuffer,R,!1);else{const K=R.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,Q=b.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,Q),s.framebufferRenderbuffer(s.FRAMEBUFFER,K,s.RENDERBUFFER,Q)}e.bindFramebuffer(s.FRAMEBUFFER,null)}function Ct(R,b,V){const K=n.get(R);b!==void 0&&lt(K.__webglFramebuffer,R,R.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),V!==void 0&&At(R)}function qt(R){const b=R.texture,V=n.get(R),K=n.get(b);R.addEventListener("dispose",T);const Q=R.textures,j=R.isWebGLCubeRenderTarget===!0,Mt=Q.length>1;if(Mt||(K.__webglTexture===void 0&&(K.__webglTexture=s.createTexture()),K.__version=b.version,o.memory.textures++),j){V.__webglFramebuffer=[];for(let ct=0;ct<6;ct++)if(b.mipmaps&&b.mipmaps.length>0){V.__webglFramebuffer[ct]=[];for(let ft=0;ft<b.mipmaps.length;ft++)V.__webglFramebuffer[ct][ft]=s.createFramebuffer()}else V.__webglFramebuffer[ct]=s.createFramebuffer()}else{if(b.mipmaps&&b.mipmaps.length>0){V.__webglFramebuffer=[];for(let ct=0;ct<b.mipmaps.length;ct++)V.__webglFramebuffer[ct]=s.createFramebuffer()}else V.__webglFramebuffer=s.createFramebuffer();if(Mt)for(let ct=0,ft=Q.length;ct<ft;ct++){const Ht=n.get(Q[ct]);Ht.__webglTexture===void 0&&(Ht.__webglTexture=s.createTexture(),o.memory.textures++)}if(R.samples>0&&kt(R)===!1){V.__webglMultisampledFramebuffer=s.createFramebuffer(),V.__webglColorRenderbuffer=[],e.bindFramebuffer(s.FRAMEBUFFER,V.__webglMultisampledFramebuffer);for(let ct=0;ct<Q.length;ct++){const ft=Q[ct];V.__webglColorRenderbuffer[ct]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,V.__webglColorRenderbuffer[ct]);const Ht=r.convert(ft.format,ft.colorSpace),nt=r.convert(ft.type),pt=M(ft.internalFormat,Ht,nt,ft.colorSpace,R.isXRRenderTarget===!0),wt=Ft(R);s.renderbufferStorageMultisample(s.RENDERBUFFER,wt,pt,R.width,R.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+ct,s.RENDERBUFFER,V.__webglColorRenderbuffer[ct])}s.bindRenderbuffer(s.RENDERBUFFER,null),R.depthBuffer&&(V.__webglDepthRenderbuffer=s.createRenderbuffer(),rt(V.__webglDepthRenderbuffer,R,!0)),e.bindFramebuffer(s.FRAMEBUFFER,null)}}if(j){e.bindTexture(s.TEXTURE_CUBE_MAP,K.__webglTexture),gt(s.TEXTURE_CUBE_MAP,b);for(let ct=0;ct<6;ct++)if(b.mipmaps&&b.mipmaps.length>0)for(let ft=0;ft<b.mipmaps.length;ft++)lt(V.__webglFramebuffer[ct][ft],R,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+ct,ft);else lt(V.__webglFramebuffer[ct],R,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+ct,0);m(b)&&f(s.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(Mt){for(let ct=0,ft=Q.length;ct<ft;ct++){const Ht=Q[ct],nt=n.get(Ht);e.bindTexture(s.TEXTURE_2D,nt.__webglTexture),gt(s.TEXTURE_2D,Ht),lt(V.__webglFramebuffer,R,Ht,s.COLOR_ATTACHMENT0+ct,s.TEXTURE_2D,0),m(Ht)&&f(s.TEXTURE_2D)}e.unbindTexture()}else{let ct=s.TEXTURE_2D;if((R.isWebGL3DRenderTarget||R.isWebGLArrayRenderTarget)&&(ct=R.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),e.bindTexture(ct,K.__webglTexture),gt(ct,b),b.mipmaps&&b.mipmaps.length>0)for(let ft=0;ft<b.mipmaps.length;ft++)lt(V.__webglFramebuffer[ft],R,b,s.COLOR_ATTACHMENT0,ct,ft);else lt(V.__webglFramebuffer,R,b,s.COLOR_ATTACHMENT0,ct,0);m(b)&&f(ct),e.unbindTexture()}R.depthBuffer&&At(R)}function Ot(R){const b=R.textures;for(let V=0,K=b.length;V<K;V++){const Q=b[V];if(m(Q)){const j=_(R),Mt=n.get(Q).__webglTexture;e.bindTexture(j,Mt),f(j),e.unbindTexture()}}}const ee=[],F=[];function ue(R){if(R.samples>0){if(kt(R)===!1){const b=R.textures,V=R.width,K=R.height;let Q=s.COLOR_BUFFER_BIT;const j=R.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,Mt=n.get(R),ct=b.length>1;if(ct)for(let ft=0;ft<b.length;ft++)e.bindFramebuffer(s.FRAMEBUFFER,Mt.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+ft,s.RENDERBUFFER,null),e.bindFramebuffer(s.FRAMEBUFFER,Mt.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+ft,s.TEXTURE_2D,null,0);e.bindFramebuffer(s.READ_FRAMEBUFFER,Mt.__webglMultisampledFramebuffer),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,Mt.__webglFramebuffer);for(let ft=0;ft<b.length;ft++){if(R.resolveDepthBuffer&&(R.depthBuffer&&(Q|=s.DEPTH_BUFFER_BIT),R.stencilBuffer&&R.resolveStencilBuffer&&(Q|=s.STENCIL_BUFFER_BIT)),ct){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,Mt.__webglColorRenderbuffer[ft]);const Ht=n.get(b[ft]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,Ht,0)}s.blitFramebuffer(0,0,V,K,0,0,V,K,Q,s.NEAREST),c===!0&&(ee.length=0,F.length=0,ee.push(s.COLOR_ATTACHMENT0+ft),R.depthBuffer&&R.resolveDepthBuffer===!1&&(ee.push(j),F.push(j),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,F)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,ee))}if(e.bindFramebuffer(s.READ_FRAMEBUFFER,null),e.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),ct)for(let ft=0;ft<b.length;ft++){e.bindFramebuffer(s.FRAMEBUFFER,Mt.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+ft,s.RENDERBUFFER,Mt.__webglColorRenderbuffer[ft]);const Ht=n.get(b[ft]).__webglTexture;e.bindFramebuffer(s.FRAMEBUFFER,Mt.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+ft,s.TEXTURE_2D,Ht,0)}e.bindFramebuffer(s.DRAW_FRAMEBUFFER,Mt.__webglMultisampledFramebuffer)}else if(R.depthBuffer&&R.resolveDepthBuffer===!1&&c){const b=R.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[b])}}}function Ft(R){return Math.min(i.maxSamples,R.samples)}function kt(R){const b=n.get(R);return R.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&b.__useRenderToTexture!==!1}function St(R){const b=o.render.frame;u.get(R)!==b&&(u.set(R,b),R.update())}function $t(R,b){const V=R.colorSpace,K=R.format,Q=R.type;return R.isCompressedTexture===!0||R.isVideoTexture===!0||V!==gi&&V!==qe&&(Vt.getTransfer(V)===Kt?(K!==we||Q!==Ne)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",V)),b}function Et(R){return typeof HTMLImageElement<"u"&&R instanceof HTMLImageElement?(l.width=R.naturalWidth||R.width,l.height=R.naturalHeight||R.height):typeof VideoFrame<"u"&&R instanceof VideoFrame?(l.width=R.displayWidth,l.height=R.displayHeight):(l.width=R.width,l.height=R.height),l}this.allocateTextureUnit=D,this.resetTextureUnits=I,this.setTexture2D=q,this.setTexture2DArray=U,this.setTexture3D=H,this.setTextureCube=z,this.rebindTextures=Ct,this.setupRenderTarget=qt,this.updateRenderTargetMipmap=Ot,this.updateMultisampleRenderTarget=ue,this.setupDepthRenderbuffer=At,this.setupFrameBufferTexture=lt,this.useMultisampledRTT=kt}function R0(s,t){function e(n,i=qe){let r;const o=Vt.getTransfer(i);if(n===Ne)return s.UNSIGNED_BYTE;if(n===No)return s.UNSIGNED_SHORT_4_4_4_4;if(n===Fo)return s.UNSIGNED_SHORT_5_5_5_1;if(n===ql)return s.UNSIGNED_INT_5_9_9_9_REV;if(n===Gl)return s.BYTE;if(n===Wl)return s.SHORT;if(n===Gi)return s.UNSIGNED_SHORT;if(n===Uo)return s.INT;if(n===kn)return s.UNSIGNED_INT;if(n===Xe)return s.FLOAT;if(n===qi)return s.HALF_FLOAT;if(n===Xl)return s.ALPHA;if(n===Yl)return s.RGB;if(n===we)return s.RGBA;if(n===$l)return s.LUMINANCE;if(n===jl)return s.LUMINANCE_ALPHA;if(n===oi)return s.DEPTH_COMPONENT;if(n===fi)return s.DEPTH_STENCIL;if(n===ko)return s.RED;if(n===Oo)return s.RED_INTEGER;if(n===Kl)return s.RG;if(n===Bo)return s.RG_INTEGER;if(n===zo)return s.RGBA_INTEGER;if(n===Cs||n===Rs||n===Ps||n===Ls)if(o===Kt)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Cs)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Rs)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Ps)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Ls)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Cs)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Rs)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Ps)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Ls)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Zr||n===Jr||n===Qr||n===to)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Zr)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Jr)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Qr)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===to)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===eo||n===no||n===io)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===eo||n===no)return o===Kt?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===io)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(n===so||n===ro||n===oo||n===ao||n===lo||n===co||n===ho||n===uo||n===fo||n===po||n===mo||n===go||n===vo||n===xo)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===so)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===ro)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===oo)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===ao)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===lo)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===co)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===ho)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===uo)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===fo)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===po)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===mo)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===go)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===vo)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===xo)return o===Kt?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Ds||n===_o||n===Mo)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===Ds)return o===Kt?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===_o)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Mo)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Zl||n===yo||n===So||n===bo)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===Ds)return r.COMPRESSED_RED_RGTC1_EXT;if(n===yo)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===So)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===bo)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===di?s.UNSIGNED_INT_24_8:s[n]!==void 0?s[n]:null}return{convert:e}}class P0 extends Pe{constructor(t=[]){super(),this.isArrayCamera=!0,this.cameras=t}}class _s extends oe{constructor(){super(),this.isGroup=!0,this.type="Group"}}const L0={type:"move"};class Tr{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new _s,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new _s,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new B,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new B),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new _s,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new B,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new B),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){const e=this._hand;if(e)for(const n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let i=null,r=null,o=null;const a=this._targetRay,c=this._grip,l=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(l&&t.hand){o=!0;for(const v of t.hand.values()){const m=e.getJointPose(v,n),f=this._getHandJoint(l,v);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}const u=l.joints["index-finger-tip"],p=l.joints["thumb-tip"],d=u.position.distanceTo(p.position),h=.02,g=.005;l.inputState.pinching&&d>h+g?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!l.inputState.pinching&&d<=h-g&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else c!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1));a!==null&&(i=e.getPose(t.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(a.matrix.fromArray(i.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,i.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(i.linearVelocity)):a.hasLinearVelocity=!1,i.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(i.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(L0)))}return a!==null&&(a.visible=i!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=o!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){const n=new _s;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}}const D0=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,I0=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class U0{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e,n){if(this.texture===null){const i=new _e,r=t.properties.get(i);r.__webglTexture=e.texture,(e.depthNear!=n.depthNear||e.depthFar!=n.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(t){if(this.texture!==null&&this.mesh===null){const e=t.cameras[0].viewport,n=new He({vertexShader:D0,fragmentShader:I0,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new me(new Un(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class N0 extends vi{constructor(t,e){super();const n=this;let i=null,r=1,o=null,a="local-floor",c=1,l=null,u=null,p=null,d=null,h=null,g=null;const v=new U0,m=e.getContextAttributes();let f=null,_=null;const M=[],x=[],A=new Wt;let w=null;const T=new Pe;T.viewport=new Zt;const P=new Pe;P.viewport=new Zt;const S=[T,P],y=new P0;let C=null,I=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function($){let J=M[$];return J===void 0&&(J=new Tr,M[$]=J),J.getTargetRaySpace()},this.getControllerGrip=function($){let J=M[$];return J===void 0&&(J=new Tr,M[$]=J),J.getGripSpace()},this.getHand=function($){let J=M[$];return J===void 0&&(J=new Tr,M[$]=J),J.getHandSpace()};function D($){const J=x.indexOf($.inputSource);if(J===-1)return;const lt=M[J];lt!==void 0&&(lt.update($.inputSource,$.frame,l||o),lt.dispatchEvent({type:$.type,data:$.inputSource}))}function G(){i.removeEventListener("select",D),i.removeEventListener("selectstart",D),i.removeEventListener("selectend",D),i.removeEventListener("squeeze",D),i.removeEventListener("squeezestart",D),i.removeEventListener("squeezeend",D),i.removeEventListener("end",G),i.removeEventListener("inputsourceschange",q);for(let $=0;$<M.length;$++){const J=x[$];J!==null&&(x[$]=null,M[$].disconnect(J))}C=null,I=null,v.reset(),t.setRenderTarget(f),h=null,d=null,p=null,i=null,_=null,Tt.stop(),n.isPresenting=!1,t.setPixelRatio(w),t.setSize(A.width,A.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function($){r=$,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function($){a=$,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||o},this.setReferenceSpace=function($){l=$},this.getBaseLayer=function(){return d!==null?d:h},this.getBinding=function(){return p},this.getFrame=function(){return g},this.getSession=function(){return i},this.setSession=async function($){if(i=$,i!==null){if(f=t.getRenderTarget(),i.addEventListener("select",D),i.addEventListener("selectstart",D),i.addEventListener("selectend",D),i.addEventListener("squeeze",D),i.addEventListener("squeezestart",D),i.addEventListener("squeezeend",D),i.addEventListener("end",G),i.addEventListener("inputsourceschange",q),m.xrCompatible!==!0&&await e.makeXRCompatible(),w=t.getPixelRatio(),t.getSize(A),i.renderState.layers===void 0){const J={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:r};h=new XRWebGLLayer(i,e,J),i.updateRenderState({baseLayer:h}),t.setPixelRatio(1),t.setSize(h.framebufferWidth,h.framebufferHeight,!1),_=new _n(h.framebufferWidth,h.framebufferHeight,{format:we,type:Ne,colorSpace:t.outputColorSpace,stencilBuffer:m.stencil})}else{let J=null,lt=null,rt=null;m.depth&&(rt=m.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,J=m.stencil?fi:oi,lt=m.stencil?di:kn);const bt={colorFormat:e.RGBA8,depthFormat:rt,scaleFactor:r};p=new XRWebGLBinding(i,e),d=p.createProjectionLayer(bt),i.updateRenderState({layers:[d]}),t.setPixelRatio(1),t.setSize(d.textureWidth,d.textureHeight,!1),_=new _n(d.textureWidth,d.textureHeight,{format:we,type:Ne,depthTexture:new fc(d.textureWidth,d.textureHeight,lt,void 0,void 0,void 0,void 0,void 0,void 0,J),stencilBuffer:m.stencil,colorSpace:t.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1})}_.isXRRenderTarget=!0,this.setFoveation(c),l=null,o=await i.requestReferenceSpace(a),Tt.setContext(i),Tt.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return v.getDepthTexture()};function q($){for(let J=0;J<$.removed.length;J++){const lt=$.removed[J],rt=x.indexOf(lt);rt>=0&&(x[rt]=null,M[rt].disconnect(lt))}for(let J=0;J<$.added.length;J++){const lt=$.added[J];let rt=x.indexOf(lt);if(rt===-1){for(let At=0;At<M.length;At++)if(At>=x.length){x.push(lt),rt=At;break}else if(x[At]===null){x[At]=lt,rt=At;break}if(rt===-1)break}const bt=M[rt];bt&&bt.connect(lt)}}const U=new B,H=new B;function z($,J,lt){U.setFromMatrixPosition(J.matrixWorld),H.setFromMatrixPosition(lt.matrixWorld);const rt=U.distanceTo(H),bt=J.projectionMatrix.elements,At=lt.projectionMatrix.elements,Ct=bt[14]/(bt[10]-1),qt=bt[14]/(bt[10]+1),Ot=(bt[9]+1)/bt[5],ee=(bt[9]-1)/bt[5],F=(bt[8]-1)/bt[0],ue=(At[8]+1)/At[0],Ft=Ct*F,kt=Ct*ue,St=rt/(-F+ue),$t=St*-F;if(J.matrixWorld.decompose($.position,$.quaternion,$.scale),$.translateX($t),$.translateZ(St),$.matrixWorld.compose($.position,$.quaternion,$.scale),$.matrixWorldInverse.copy($.matrixWorld).invert(),bt[10]===-1)$.projectionMatrix.copy(J.projectionMatrix),$.projectionMatrixInverse.copy(J.projectionMatrixInverse);else{const Et=Ct+St,R=qt+St,b=Ft-$t,V=kt+(rt-$t),K=Ot*qt/R*Et,Q=ee*qt/R*Et;$.projectionMatrix.makePerspective(b,V,K,Q,Et,R),$.projectionMatrixInverse.copy($.projectionMatrix).invert()}}function et($,J){J===null?$.matrixWorld.copy($.matrix):$.matrixWorld.multiplyMatrices(J.matrixWorld,$.matrix),$.matrixWorldInverse.copy($.matrixWorld).invert()}this.updateCamera=function($){if(i===null)return;let J=$.near,lt=$.far;v.texture!==null&&(v.depthNear>0&&(J=v.depthNear),v.depthFar>0&&(lt=v.depthFar)),y.near=P.near=T.near=J,y.far=P.far=T.far=lt,(C!==y.near||I!==y.far)&&(i.updateRenderState({depthNear:y.near,depthFar:y.far}),C=y.near,I=y.far),T.layers.mask=$.layers.mask|2,P.layers.mask=$.layers.mask|4,y.layers.mask=T.layers.mask|P.layers.mask;const rt=$.parent,bt=y.cameras;et(y,rt);for(let At=0;At<bt.length;At++)et(bt[At],rt);bt.length===2?z(y,T,P):y.projectionMatrix.copy(T.projectionMatrix),tt($,y,rt)};function tt($,J,lt){lt===null?$.matrix.copy(J.matrixWorld):($.matrix.copy(lt.matrixWorld),$.matrix.invert(),$.matrix.multiply(J.matrixWorld)),$.matrix.decompose($.position,$.quaternion,$.scale),$.updateMatrixWorld(!0),$.projectionMatrix.copy(J.projectionMatrix),$.projectionMatrixInverse.copy(J.projectionMatrixInverse),$.isPerspectiveCamera&&($.fov=Eo*2*Math.atan(1/$.projectionMatrix.elements[5]),$.zoom=1)}this.getCamera=function(){return y},this.getFoveation=function(){if(!(d===null&&h===null))return c},this.setFoveation=function($){c=$,d!==null&&(d.fixedFoveation=$),h!==null&&h.fixedFoveation!==void 0&&(h.fixedFoveation=$)},this.hasDepthSensing=function(){return v.texture!==null},this.getDepthSensingMesh=function(){return v.getMesh(y)};let st=null;function gt($,J){if(u=J.getViewerPose(l||o),g=J,u!==null){const lt=u.views;h!==null&&(t.setRenderTargetFramebuffer(_,h.framebuffer),t.setRenderTarget(_));let rt=!1;lt.length!==y.cameras.length&&(y.cameras.length=0,rt=!0);for(let At=0;At<lt.length;At++){const Ct=lt[At];let qt=null;if(h!==null)qt=h.getViewport(Ct);else{const ee=p.getViewSubImage(d,Ct);qt=ee.viewport,At===0&&(t.setRenderTargetTextures(_,ee.colorTexture,d.ignoreDepthValues?void 0:ee.depthStencilTexture),t.setRenderTarget(_))}let Ot=S[At];Ot===void 0&&(Ot=new Pe,Ot.layers.enable(At),Ot.viewport=new Zt,S[At]=Ot),Ot.matrix.fromArray(Ct.transform.matrix),Ot.matrix.decompose(Ot.position,Ot.quaternion,Ot.scale),Ot.projectionMatrix.fromArray(Ct.projectionMatrix),Ot.projectionMatrixInverse.copy(Ot.projectionMatrix).invert(),Ot.viewport.set(qt.x,qt.y,qt.width,qt.height),At===0&&(y.matrix.copy(Ot.matrix),y.matrix.decompose(y.position,y.quaternion,y.scale)),rt===!0&&y.cameras.push(Ot)}const bt=i.enabledFeatures;if(bt&&bt.includes("depth-sensing")){const At=p.getDepthInformation(lt[0]);At&&At.isValid&&At.texture&&v.init(t,At,i.renderState)}}for(let lt=0;lt<M.length;lt++){const rt=x[lt],bt=M[lt];rt!==null&&bt!==void 0&&bt.update(rt,J,l||o)}st&&st($,J),J.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:J}),g=null}const Tt=new dc;Tt.setAnimationLoop(gt),this.setAnimationLoop=function($){st=$},this.dispose=function(){}}}const An=new Ye,F0=new Jt;function k0(s,t){function e(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function n(m,f){f.color.getRGB(m.fogColor.value,cc(s)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function i(m,f,_,M,x){f.isMeshBasicMaterial||f.isMeshLambertMaterial?r(m,f):f.isMeshToonMaterial?(r(m,f),p(m,f)):f.isMeshPhongMaterial?(r(m,f),u(m,f)):f.isMeshStandardMaterial?(r(m,f),d(m,f),f.isMeshPhysicalMaterial&&h(m,f,x)):f.isMeshMatcapMaterial?(r(m,f),g(m,f)):f.isMeshDepthMaterial?r(m,f):f.isMeshDistanceMaterial?(r(m,f),v(m,f)):f.isMeshNormalMaterial?r(m,f):f.isLineBasicMaterial?(o(m,f),f.isLineDashedMaterial&&a(m,f)):f.isPointsMaterial?c(m,f,_,M):f.isSpriteMaterial?l(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,e(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,e(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===ge&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,e(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===ge&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,e(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,e(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,e(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);const _=t.get(f),M=_.envMap,x=_.envMapRotation;M&&(m.envMap.value=M,An.copy(x),An.x*=-1,An.y*=-1,An.z*=-1,M.isCubeTexture&&M.isRenderTargetTexture===!1&&(An.y*=-1,An.z*=-1),m.envMapRotation.value.setFromMatrix4(F0.makeRotationFromEuler(An)),m.flipEnvMap.value=M.isCubeTexture&&M.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap&&(m.lightMap.value=f.lightMap,m.lightMapIntensity.value=f.lightMapIntensity,e(f.lightMap,m.lightMapTransform)),f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,e(f.aoMap,m.aoMapTransform))}function o(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,e(f.map,m.mapTransform))}function a(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function c(m,f,_,M){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*_,m.scale.value=M*.5,f.map&&(m.map.value=f.map,e(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function l(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,e(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,e(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function u(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function p(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function d(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,e(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,e(f.roughnessMap,m.roughnessMapTransform)),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function h(m,f,_){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,e(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,e(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,e(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,e(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,e(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===ge&&m.clearcoatNormalScale.value.negate())),f.dispersion>0&&(m.dispersion.value=f.dispersion),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,e(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,e(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=_.texture,m.transmissionSamplerSize.value.set(_.width,_.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,e(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,e(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,e(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,e(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,e(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function v(m,f){const _=t.get(f).light;m.referencePosition.value.setFromMatrixPosition(_.matrixWorld),m.nearDistance.value=_.shadow.camera.near,m.farDistance.value=_.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function O0(s,t,e,n){let i={},r={},o=[];const a=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function c(_,M){const x=M.program;n.uniformBlockBinding(_,x)}function l(_,M){let x=i[_.id];x===void 0&&(g(_),x=u(_),i[_.id]=x,_.addEventListener("dispose",m));const A=M.program;n.updateUBOMapping(_,A);const w=t.render.frame;r[_.id]!==w&&(d(_),r[_.id]=w)}function u(_){const M=p();_.__bindingPointIndex=M;const x=s.createBuffer(),A=_.__size,w=_.usage;return s.bindBuffer(s.UNIFORM_BUFFER,x),s.bufferData(s.UNIFORM_BUFFER,A,w),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,M,x),x}function p(){for(let _=0;_<a;_++)if(o.indexOf(_)===-1)return o.push(_),_;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(_){const M=i[_.id],x=_.uniforms,A=_.__cache;s.bindBuffer(s.UNIFORM_BUFFER,M);for(let w=0,T=x.length;w<T;w++){const P=Array.isArray(x[w])?x[w]:[x[w]];for(let S=0,y=P.length;S<y;S++){const C=P[S];if(h(C,w,S,A)===!0){const I=C.__offset,D=Array.isArray(C.value)?C.value:[C.value];let G=0;for(let q=0;q<D.length;q++){const U=D[q],H=v(U);typeof U=="number"||typeof U=="boolean"?(C.__data[0]=U,s.bufferSubData(s.UNIFORM_BUFFER,I+G,C.__data)):U.isMatrix3?(C.__data[0]=U.elements[0],C.__data[1]=U.elements[1],C.__data[2]=U.elements[2],C.__data[3]=0,C.__data[4]=U.elements[3],C.__data[5]=U.elements[4],C.__data[6]=U.elements[5],C.__data[7]=0,C.__data[8]=U.elements[6],C.__data[9]=U.elements[7],C.__data[10]=U.elements[8],C.__data[11]=0):(U.toArray(C.__data,G),G+=H.storage/Float32Array.BYTES_PER_ELEMENT)}s.bufferSubData(s.UNIFORM_BUFFER,I,C.__data)}}}s.bindBuffer(s.UNIFORM_BUFFER,null)}function h(_,M,x,A){const w=_.value,T=M+"_"+x;if(A[T]===void 0)return typeof w=="number"||typeof w=="boolean"?A[T]=w:A[T]=w.clone(),!0;{const P=A[T];if(typeof w=="number"||typeof w=="boolean"){if(P!==w)return A[T]=w,!0}else if(P.equals(w)===!1)return P.copy(w),!0}return!1}function g(_){const M=_.uniforms;let x=0;const A=16;for(let T=0,P=M.length;T<P;T++){const S=Array.isArray(M[T])?M[T]:[M[T]];for(let y=0,C=S.length;y<C;y++){const I=S[y],D=Array.isArray(I.value)?I.value:[I.value];for(let G=0,q=D.length;G<q;G++){const U=D[G],H=v(U),z=x%A,et=z%H.boundary,tt=z+et;x+=et,tt!==0&&A-tt<H.storage&&(x+=A-tt),I.__data=new Float32Array(H.storage/Float32Array.BYTES_PER_ELEMENT),I.__offset=x,x+=H.storage}}}const w=x%A;return w>0&&(x+=A-w),_.__size=x,_.__cache={},this}function v(_){const M={boundary:0,storage:0};return typeof _=="number"||typeof _=="boolean"?(M.boundary=4,M.storage=4):_.isVector2?(M.boundary=8,M.storage=8):_.isVector3||_.isColor?(M.boundary=16,M.storage=12):_.isVector4?(M.boundary=16,M.storage=16):_.isMatrix3?(M.boundary=48,M.storage=48):_.isMatrix4?(M.boundary=64,M.storage=64):_.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",_),M}function m(_){const M=_.target;M.removeEventListener("dispose",m);const x=o.indexOf(M.__bindingPointIndex);o.splice(x,1),s.deleteBuffer(i[M.id]),delete i[M.id],delete r[M.id]}function f(){for(const _ in i)s.deleteBuffer(i[_]);o=[],i={},r={}}return{bind:c,update:l,dispose:f}}class B0{constructor(t={}){const{canvas:e=Au(),context:n=null,depth:i=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:u="default",failIfMajorPerformanceCaveat:p=!1,reverseDepthBuffer:d=!1}=t;this.isWebGLRenderer=!0;let h;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");h=n.getContextAttributes().alpha}else h=o;const g=new Uint32Array(4),v=new Int32Array(4);let m=null,f=null;const _=[],M=[];this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=Ie,this.toneMapping=gn,this.toneMappingExposure=1;const x=this;let A=!1,w=0,T=0,P=null,S=-1,y=null;const C=new Zt,I=new Zt;let D=null;const G=new Bt(0);let q=0,U=e.width,H=e.height,z=1,et=null,tt=null;const st=new Zt(0,0,U,H),gt=new Zt(0,0,U,H);let Tt=!1;const $=new Vo;let J=!1,lt=!1;const rt=new Jt,bt=new Jt,At=new B,Ct=new Zt,qt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let Ot=!1;function ee(){return P===null?z:1}let F=n;function ue(E,k){return e.getContext(E,k)}try{const E={alpha:!0,depth:i,stencil:r,antialias:a,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:u,failIfMajorPerformanceCaveat:p};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${Io}`),e.addEventListener("webglcontextlost",Z,!1),e.addEventListener("webglcontextrestored",dt,!1),e.addEventListener("webglcontextcreationerror",ht,!1),F===null){const k="webgl2";if(F=ue(k,E),F===null)throw ue(k)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(E){throw console.error("THREE.WebGLRenderer: "+E.message),E}let Ft,kt,St,$t,Et,R,b,V,K,Q,j,Mt,ct,ft,Ht,nt,pt,wt,Rt,mt,zt,Ut,Qt,N;function at(){Ft=new Wp(F),Ft.init(),Ut=new R0(F,Ft),kt=new Op(F,Ft,t,Ut),St=new T0(F,Ft),kt.reverseDepthBuffer&&d&&St.buffers.depth.setReversed(!0),$t=new Yp(F),Et=new u0,R=new C0(F,Ft,St,Et,kt,Ut,$t),b=new zp(x),V=new Gp(x),K=new Qu(F),Qt=new Fp(F,K),Q=new qp(F,K,$t,Qt),j=new jp(F,Q,K,$t),Rt=new $p(F,kt,R),nt=new Bp(Et),Mt=new h0(x,b,V,Ft,kt,Qt,nt),ct=new k0(x,Et),ft=new f0,Ht=new _0(Ft),wt=new Np(x,b,V,St,j,h,c),pt=new E0(x,j,kt),N=new O0(F,$t,kt,St),mt=new kp(F,Ft,$t),zt=new Xp(F,Ft,$t),$t.programs=Mt.programs,x.capabilities=kt,x.extensions=Ft,x.properties=Et,x.renderLists=ft,x.shadowMap=pt,x.state=St,x.info=$t}at();const Y=new N0(x,F);this.xr=Y,this.getContext=function(){return F},this.getContextAttributes=function(){return F.getContextAttributes()},this.forceContextLoss=function(){const E=Ft.get("WEBGL_lose_context");E&&E.loseContext()},this.forceContextRestore=function(){const E=Ft.get("WEBGL_lose_context");E&&E.restoreContext()},this.getPixelRatio=function(){return z},this.setPixelRatio=function(E){E!==void 0&&(z=E,this.setSize(U,H,!1))},this.getSize=function(E){return E.set(U,H)},this.setSize=function(E,k,W=!0){if(Y.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}U=E,H=k,e.width=Math.floor(E*z),e.height=Math.floor(k*z),W===!0&&(e.style.width=E+"px",e.style.height=k+"px"),this.setViewport(0,0,E,k)},this.getDrawingBufferSize=function(E){return E.set(U*z,H*z).floor()},this.setDrawingBufferSize=function(E,k,W){U=E,H=k,z=W,e.width=Math.floor(E*W),e.height=Math.floor(k*W),this.setViewport(0,0,E,k)},this.getCurrentViewport=function(E){return E.copy(C)},this.getViewport=function(E){return E.copy(st)},this.setViewport=function(E,k,W,X){E.isVector4?st.set(E.x,E.y,E.z,E.w):st.set(E,k,W,X),St.viewport(C.copy(st).multiplyScalar(z).round())},this.getScissor=function(E){return E.copy(gt)},this.setScissor=function(E,k,W,X){E.isVector4?gt.set(E.x,E.y,E.z,E.w):gt.set(E,k,W,X),St.scissor(I.copy(gt).multiplyScalar(z).round())},this.getScissorTest=function(){return Tt},this.setScissorTest=function(E){St.setScissorTest(Tt=E)},this.setOpaqueSort=function(E){et=E},this.setTransparentSort=function(E){tt=E},this.getClearColor=function(E){return E.copy(wt.getClearColor())},this.setClearColor=function(){wt.setClearColor.apply(wt,arguments)},this.getClearAlpha=function(){return wt.getClearAlpha()},this.setClearAlpha=function(){wt.setClearAlpha.apply(wt,arguments)},this.clear=function(E=!0,k=!0,W=!0){let X=0;if(E){let O=!1;if(P!==null){const it=P.texture.format;O=it===zo||it===Bo||it===Oo}if(O){const it=P.texture.type,ut=it===Ne||it===kn||it===Gi||it===di||it===No||it===Fo,vt=wt.getClearColor(),xt=wt.getClearAlpha(),Pt=vt.r,Dt=vt.g,_t=vt.b;ut?(g[0]=Pt,g[1]=Dt,g[2]=_t,g[3]=xt,F.clearBufferuiv(F.COLOR,0,g)):(v[0]=Pt,v[1]=Dt,v[2]=_t,v[3]=xt,F.clearBufferiv(F.COLOR,0,v))}else X|=F.COLOR_BUFFER_BIT}k&&(X|=F.DEPTH_BUFFER_BIT),W&&(X|=F.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),F.clear(X)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){e.removeEventListener("webglcontextlost",Z,!1),e.removeEventListener("webglcontextrestored",dt,!1),e.removeEventListener("webglcontextcreationerror",ht,!1),ft.dispose(),Ht.dispose(),Et.dispose(),b.dispose(),V.dispose(),j.dispose(),Qt.dispose(),N.dispose(),Mt.dispose(),Y.dispose(),Y.removeEventListener("sessionstart",$o),Y.removeEventListener("sessionend",jo),yn.stop()};function Z(E){E.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),A=!0}function dt(){console.log("THREE.WebGLRenderer: Context Restored."),A=!1;const E=$t.autoReset,k=pt.enabled,W=pt.autoUpdate,X=pt.needsUpdate,O=pt.type;at(),$t.autoReset=E,pt.enabled=k,pt.autoUpdate=W,pt.needsUpdate=X,pt.type=O}function ht(E){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",E.statusMessage)}function Lt(E){const k=E.target;k.removeEventListener("dispose",Lt),se(k)}function se(E){de(E),Et.remove(E)}function de(E){const k=Et.get(E).programs;k!==void 0&&(k.forEach(function(W){Mt.releaseProgram(W)}),E.isShaderMaterial&&Mt.releaseShaderCache(E))}this.renderBufferDirect=function(E,k,W,X,O,it){k===null&&(k=qt);const ut=O.isMesh&&O.matrixWorld.determinant()<0,vt=Ec(E,k,W,X,O);St.setMaterial(X,ut);let xt=W.index,Pt=1;if(X.wireframe===!0){if(xt=Q.getWireframeAttribute(W),xt===void 0)return;Pt=2}const Dt=W.drawRange,_t=W.attributes.position;let Gt=Dt.start*Pt,te=(Dt.start+Dt.count)*Pt;it!==null&&(Gt=Math.max(Gt,it.start*Pt),te=Math.min(te,(it.start+it.count)*Pt)),xt!==null?(Gt=Math.max(Gt,0),te=Math.min(te,xt.count)):_t!=null&&(Gt=Math.max(Gt,0),te=Math.min(te,_t.count));const ne=te-Gt;if(ne<0||ne===1/0)return;Qt.setup(O,X,vt,W,xt);let ye,Xt=mt;if(xt!==null&&(ye=K.get(xt),Xt=zt,Xt.setIndex(ye)),O.isMesh)X.wireframe===!0?(St.setLineWidth(X.wireframeLinewidth*ee()),Xt.setMode(F.LINES)):Xt.setMode(F.TRIANGLES);else if(O.isLine){let yt=X.linewidth;yt===void 0&&(yt=1),St.setLineWidth(yt*ee()),O.isLineSegments?Xt.setMode(F.LINES):O.isLineLoop?Xt.setMode(F.LINE_LOOP):Xt.setMode(F.LINE_STRIP)}else O.isPoints?Xt.setMode(F.POINTS):O.isSprite&&Xt.setMode(F.TRIANGLES);if(O.isBatchedMesh)if(O._multiDrawInstances!==null)Xt.renderMultiDrawInstances(O._multiDrawStarts,O._multiDrawCounts,O._multiDrawCount,O._multiDrawInstances);else if(Ft.get("WEBGL_multi_draw"))Xt.renderMultiDraw(O._multiDrawStarts,O._multiDrawCounts,O._multiDrawCount);else{const yt=O._multiDrawStarts,je=O._multiDrawCounts,Yt=O._multiDrawCount,ke=xt?K.get(xt).bytesPerElement:1,zn=Et.get(X).currentProgram.getUniforms();for(let Ae=0;Ae<Yt;Ae++)zn.setValue(F,"_gl_DrawID",Ae),Xt.render(yt[Ae]/ke,je[Ae])}else if(O.isInstancedMesh)Xt.renderInstances(Gt,ne,O.count);else if(W.isInstancedBufferGeometry){const yt=W._maxInstanceCount!==void 0?W._maxInstanceCount:1/0,je=Math.min(W.instanceCount,yt);Xt.renderInstances(Gt,ne,je)}else Xt.render(Gt,ne)};function jt(E,k,W){E.transparent===!0&&E.side===We&&E.forceSinglePass===!1?(E.side=ge,E.needsUpdate=!0,ji(E,k,W),E.side=xn,E.needsUpdate=!0,ji(E,k,W),E.side=We):ji(E,k,W)}this.compile=function(E,k,W=null){W===null&&(W=E),f=Ht.get(W),f.init(k),M.push(f),W.traverseVisible(function(O){O.isLight&&O.layers.test(k.layers)&&(f.pushLight(O),O.castShadow&&f.pushShadow(O))}),E!==W&&E.traverseVisible(function(O){O.isLight&&O.layers.test(k.layers)&&(f.pushLight(O),O.castShadow&&f.pushShadow(O))}),f.setupLights();const X=new Set;return E.traverse(function(O){if(!(O.isMesh||O.isPoints||O.isLine||O.isSprite))return;const it=O.material;if(it)if(Array.isArray(it))for(let ut=0;ut<it.length;ut++){const vt=it[ut];jt(vt,W,O),X.add(vt)}else jt(it,W,O),X.add(it)}),M.pop(),f=null,X},this.compileAsync=function(E,k,W=null){const X=this.compile(E,k,W);return new Promise(O=>{function it(){if(X.forEach(function(ut){Et.get(ut).currentProgram.isReady()&&X.delete(ut)}),X.size===0){O(E);return}setTimeout(it,10)}Ft.get("KHR_parallel_shader_compile")!==null?it():setTimeout(it,10)})};let Fe=null;function $e(E){Fe&&Fe(E)}function $o(){yn.stop()}function jo(){yn.start()}const yn=new dc;yn.setAnimationLoop($e),typeof self<"u"&&yn.setContext(self),this.setAnimationLoop=function(E){Fe=E,Y.setAnimationLoop(E),E===null?yn.stop():yn.start()},Y.addEventListener("sessionstart",$o),Y.addEventListener("sessionend",jo),this.render=function(E,k){if(k!==void 0&&k.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(A===!0)return;if(E.matrixWorldAutoUpdate===!0&&E.updateMatrixWorld(),k.parent===null&&k.matrixWorldAutoUpdate===!0&&k.updateMatrixWorld(),Y.enabled===!0&&Y.isPresenting===!0&&(Y.cameraAutoUpdate===!0&&Y.updateCamera(k),k=Y.getCamera()),E.isScene===!0&&E.onBeforeRender(x,E,k,P),f=Ht.get(E,M.length),f.init(k),M.push(f),bt.multiplyMatrices(k.projectionMatrix,k.matrixWorldInverse),$.setFromProjectionMatrix(bt),lt=this.localClippingEnabled,J=nt.init(this.clippingPlanes,lt),m=ft.get(E,_.length),m.init(),_.push(m),Y.enabled===!0&&Y.isPresenting===!0){const it=x.xr.getDepthSensingMesh();it!==null&&js(it,k,-1/0,x.sortObjects)}js(E,k,0,x.sortObjects),m.finish(),x.sortObjects===!0&&m.sort(et,tt),Ot=Y.enabled===!1||Y.isPresenting===!1||Y.hasDepthSensing()===!1,Ot&&wt.addToRenderList(m,E),this.info.render.frame++,J===!0&&nt.beginShadows();const W=f.state.shadowsArray;pt.render(W,E,k),J===!0&&nt.endShadows(),this.info.autoReset===!0&&this.info.reset();const X=m.opaque,O=m.transmissive;if(f.setupLights(),k.isArrayCamera){const it=k.cameras;if(O.length>0)for(let ut=0,vt=it.length;ut<vt;ut++){const xt=it[ut];Zo(X,O,E,xt)}Ot&&wt.render(E);for(let ut=0,vt=it.length;ut<vt;ut++){const xt=it[ut];Ko(m,E,xt,xt.viewport)}}else O.length>0&&Zo(X,O,E,k),Ot&&wt.render(E),Ko(m,E,k);P!==null&&(R.updateMultisampleRenderTarget(P),R.updateRenderTargetMipmap(P)),E.isScene===!0&&E.onAfterRender(x,E,k),Qt.resetDefaultState(),S=-1,y=null,M.pop(),M.length>0?(f=M[M.length-1],J===!0&&nt.setGlobalState(x.clippingPlanes,f.state.camera)):f=null,_.pop(),_.length>0?m=_[_.length-1]:m=null};function js(E,k,W,X){if(E.visible===!1)return;if(E.layers.test(k.layers)){if(E.isGroup)W=E.renderOrder;else if(E.isLOD)E.autoUpdate===!0&&E.update(k);else if(E.isLight)f.pushLight(E),E.castShadow&&f.pushShadow(E);else if(E.isSprite){if(!E.frustumCulled||$.intersectsSprite(E)){X&&Ct.setFromMatrixPosition(E.matrixWorld).applyMatrix4(bt);const ut=j.update(E),vt=E.material;vt.visible&&m.push(E,ut,vt,W,Ct.z,null)}}else if((E.isMesh||E.isLine||E.isPoints)&&(!E.frustumCulled||$.intersectsObject(E))){const ut=j.update(E),vt=E.material;if(X&&(E.boundingSphere!==void 0?(E.boundingSphere===null&&E.computeBoundingSphere(),Ct.copy(E.boundingSphere.center)):(ut.boundingSphere===null&&ut.computeBoundingSphere(),Ct.copy(ut.boundingSphere.center)),Ct.applyMatrix4(E.matrixWorld).applyMatrix4(bt)),Array.isArray(vt)){const xt=ut.groups;for(let Pt=0,Dt=xt.length;Pt<Dt;Pt++){const _t=xt[Pt],Gt=vt[_t.materialIndex];Gt&&Gt.visible&&m.push(E,ut,Gt,W,Ct.z,_t)}}else vt.visible&&m.push(E,ut,vt,W,Ct.z,null)}}const it=E.children;for(let ut=0,vt=it.length;ut<vt;ut++)js(it[ut],k,W,X)}function Ko(E,k,W,X){const O=E.opaque,it=E.transmissive,ut=E.transparent;f.setupLightsView(W),J===!0&&nt.setGlobalState(x.clippingPlanes,W),X&&St.viewport(C.copy(X)),O.length>0&&$i(O,k,W),it.length>0&&$i(it,k,W),ut.length>0&&$i(ut,k,W),St.buffers.depth.setTest(!0),St.buffers.depth.setMask(!0),St.buffers.color.setMask(!0),St.setPolygonOffset(!1)}function Zo(E,k,W,X){if((W.isScene===!0?W.overrideMaterial:null)!==null)return;f.state.transmissionRenderTarget[X.id]===void 0&&(f.state.transmissionRenderTarget[X.id]=new _n(1,1,{generateMipmaps:!0,type:Ft.has("EXT_color_buffer_half_float")||Ft.has("EXT_color_buffer_float")?qi:Ne,minFilter:In,samples:4,stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Vt.workingColorSpace}));const it=f.state.transmissionRenderTarget[X.id],ut=X.viewport||C;it.setSize(ut.z,ut.w);const vt=x.getRenderTarget();x.setRenderTarget(it),x.getClearColor(G),q=x.getClearAlpha(),q<1&&x.setClearColor(16777215,.5),x.clear(),Ot&&wt.render(W);const xt=x.toneMapping;x.toneMapping=gn;const Pt=X.viewport;if(X.viewport!==void 0&&(X.viewport=void 0),f.setupLightsView(X),J===!0&&nt.setGlobalState(x.clippingPlanes,X),$i(E,W,X),R.updateMultisampleRenderTarget(it),R.updateRenderTargetMipmap(it),Ft.has("WEBGL_multisampled_render_to_texture")===!1){let Dt=!1;for(let _t=0,Gt=k.length;_t<Gt;_t++){const te=k[_t],ne=te.object,ye=te.geometry,Xt=te.material,yt=te.group;if(Xt.side===We&&ne.layers.test(X.layers)){const je=Xt.side;Xt.side=ge,Xt.needsUpdate=!0,Jo(ne,W,X,ye,Xt,yt),Xt.side=je,Xt.needsUpdate=!0,Dt=!0}}Dt===!0&&(R.updateMultisampleRenderTarget(it),R.updateRenderTargetMipmap(it))}x.setRenderTarget(vt),x.setClearColor(G,q),Pt!==void 0&&(X.viewport=Pt),x.toneMapping=xt}function $i(E,k,W){const X=k.isScene===!0?k.overrideMaterial:null;for(let O=0,it=E.length;O<it;O++){const ut=E[O],vt=ut.object,xt=ut.geometry,Pt=X===null?ut.material:X,Dt=ut.group;vt.layers.test(W.layers)&&Jo(vt,k,W,xt,Pt,Dt)}}function Jo(E,k,W,X,O,it){E.onBeforeRender(x,k,W,X,O,it),E.modelViewMatrix.multiplyMatrices(W.matrixWorldInverse,E.matrixWorld),E.normalMatrix.getNormalMatrix(E.modelViewMatrix),O.onBeforeRender(x,k,W,X,E,it),O.transparent===!0&&O.side===We&&O.forceSinglePass===!1?(O.side=ge,O.needsUpdate=!0,x.renderBufferDirect(W,k,X,O,E,it),O.side=xn,O.needsUpdate=!0,x.renderBufferDirect(W,k,X,O,E,it),O.side=We):x.renderBufferDirect(W,k,X,O,E,it),E.onAfterRender(x,k,W,X,O,it)}function ji(E,k,W){k.isScene!==!0&&(k=qt);const X=Et.get(E),O=f.state.lights,it=f.state.shadowsArray,ut=O.state.version,vt=Mt.getParameters(E,O.state,it,k,W),xt=Mt.getProgramCacheKey(vt);let Pt=X.programs;X.environment=E.isMeshStandardMaterial?k.environment:null,X.fog=k.fog,X.envMap=(E.isMeshStandardMaterial?V:b).get(E.envMap||X.environment),X.envMapRotation=X.environment!==null&&E.envMap===null?k.environmentRotation:E.envMapRotation,Pt===void 0&&(E.addEventListener("dispose",Lt),Pt=new Map,X.programs=Pt);let Dt=Pt.get(xt);if(Dt!==void 0){if(X.currentProgram===Dt&&X.lightsStateVersion===ut)return ta(E,vt),Dt}else vt.uniforms=Mt.getUniforms(E),E.onBeforeCompile(vt,x),Dt=Mt.acquireProgram(vt,xt),Pt.set(xt,Dt),X.uniforms=vt.uniforms;const _t=X.uniforms;return(!E.isShaderMaterial&&!E.isRawShaderMaterial||E.clipping===!0)&&(_t.clippingPlanes=nt.uniform),ta(E,vt),X.needsLights=Tc(E),X.lightsStateVersion=ut,X.needsLights&&(_t.ambientLightColor.value=O.state.ambient,_t.lightProbe.value=O.state.probe,_t.directionalLights.value=O.state.directional,_t.directionalLightShadows.value=O.state.directionalShadow,_t.spotLights.value=O.state.spot,_t.spotLightShadows.value=O.state.spotShadow,_t.rectAreaLights.value=O.state.rectArea,_t.ltc_1.value=O.state.rectAreaLTC1,_t.ltc_2.value=O.state.rectAreaLTC2,_t.pointLights.value=O.state.point,_t.pointLightShadows.value=O.state.pointShadow,_t.hemisphereLights.value=O.state.hemi,_t.directionalShadowMap.value=O.state.directionalShadowMap,_t.directionalShadowMatrix.value=O.state.directionalShadowMatrix,_t.spotShadowMap.value=O.state.spotShadowMap,_t.spotLightMatrix.value=O.state.spotLightMatrix,_t.spotLightMap.value=O.state.spotLightMap,_t.pointShadowMap.value=O.state.pointShadowMap,_t.pointShadowMatrix.value=O.state.pointShadowMatrix),X.currentProgram=Dt,X.uniformsList=null,Dt}function Qo(E){if(E.uniformsList===null){const k=E.currentProgram.getUniforms();E.uniformsList=Us.seqWithValue(k.seq,E.uniforms)}return E.uniformsList}function ta(E,k){const W=Et.get(E);W.outputColorSpace=k.outputColorSpace,W.batching=k.batching,W.batchingColor=k.batchingColor,W.instancing=k.instancing,W.instancingColor=k.instancingColor,W.instancingMorph=k.instancingMorph,W.skinning=k.skinning,W.morphTargets=k.morphTargets,W.morphNormals=k.morphNormals,W.morphColors=k.morphColors,W.morphTargetsCount=k.morphTargetsCount,W.numClippingPlanes=k.numClippingPlanes,W.numIntersection=k.numClipIntersection,W.vertexAlphas=k.vertexAlphas,W.vertexTangents=k.vertexTangents,W.toneMapping=k.toneMapping}function Ec(E,k,W,X,O){k.isScene!==!0&&(k=qt),R.resetTextureUnits();const it=k.fog,ut=X.isMeshStandardMaterial?k.environment:null,vt=P===null?x.outputColorSpace:P.isXRRenderTarget===!0?P.texture.colorSpace:gi,xt=(X.isMeshStandardMaterial?V:b).get(X.envMap||ut),Pt=X.vertexColors===!0&&!!W.attributes.color&&W.attributes.color.itemSize===4,Dt=!!W.attributes.tangent&&(!!X.normalMap||X.anisotropy>0),_t=!!W.morphAttributes.position,Gt=!!W.morphAttributes.normal,te=!!W.morphAttributes.color;let ne=gn;X.toneMapped&&(P===null||P.isXRRenderTarget===!0)&&(ne=x.toneMapping);const ye=W.morphAttributes.position||W.morphAttributes.normal||W.morphAttributes.color,Xt=ye!==void 0?ye.length:0,yt=Et.get(X),je=f.state.lights;if(J===!0&&(lt===!0||E!==y)){const Le=E===y&&X.id===S;nt.setState(X,E,Le)}let Yt=!1;X.version===yt.__version?(yt.needsLights&&yt.lightsStateVersion!==je.state.version||yt.outputColorSpace!==vt||O.isBatchedMesh&&yt.batching===!1||!O.isBatchedMesh&&yt.batching===!0||O.isBatchedMesh&&yt.batchingColor===!0&&O.colorTexture===null||O.isBatchedMesh&&yt.batchingColor===!1&&O.colorTexture!==null||O.isInstancedMesh&&yt.instancing===!1||!O.isInstancedMesh&&yt.instancing===!0||O.isSkinnedMesh&&yt.skinning===!1||!O.isSkinnedMesh&&yt.skinning===!0||O.isInstancedMesh&&yt.instancingColor===!0&&O.instanceColor===null||O.isInstancedMesh&&yt.instancingColor===!1&&O.instanceColor!==null||O.isInstancedMesh&&yt.instancingMorph===!0&&O.morphTexture===null||O.isInstancedMesh&&yt.instancingMorph===!1&&O.morphTexture!==null||yt.envMap!==xt||X.fog===!0&&yt.fog!==it||yt.numClippingPlanes!==void 0&&(yt.numClippingPlanes!==nt.numPlanes||yt.numIntersection!==nt.numIntersection)||yt.vertexAlphas!==Pt||yt.vertexTangents!==Dt||yt.morphTargets!==_t||yt.morphNormals!==Gt||yt.morphColors!==te||yt.toneMapping!==ne||yt.morphTargetsCount!==Xt)&&(Yt=!0):(Yt=!0,yt.__version=X.version);let ke=yt.currentProgram;Yt===!0&&(ke=ji(X,k,O));let zn=!1,Ae=!1,yi=!1;const ie=ke.getUniforms(),Ve=yt.uniforms;if(St.useProgram(ke.program)&&(zn=!0,Ae=!0,yi=!0),X.id!==S&&(S=X.id,Ae=!0),zn||y!==E){St.buffers.depth.getReversed()?(rt.copy(E.projectionMatrix),Ru(rt),Pu(rt),ie.setValue(F,"projectionMatrix",rt)):ie.setValue(F,"projectionMatrix",E.projectionMatrix),ie.setValue(F,"viewMatrix",E.matrixWorldInverse);const an=ie.map.cameraPosition;an!==void 0&&an.setValue(F,At.setFromMatrixPosition(E.matrixWorld)),kt.logarithmicDepthBuffer&&ie.setValue(F,"logDepthBufFC",2/(Math.log(E.far+1)/Math.LN2)),(X.isMeshPhongMaterial||X.isMeshToonMaterial||X.isMeshLambertMaterial||X.isMeshBasicMaterial||X.isMeshStandardMaterial||X.isShaderMaterial)&&ie.setValue(F,"isOrthographic",E.isOrthographicCamera===!0),y!==E&&(y=E,Ae=!0,yi=!0)}if(O.isSkinnedMesh){ie.setOptional(F,O,"bindMatrix"),ie.setOptional(F,O,"bindMatrixInverse");const Le=O.skeleton;Le&&(Le.boneTexture===null&&Le.computeBoneTexture(),ie.setValue(F,"boneTexture",Le.boneTexture,R))}O.isBatchedMesh&&(ie.setOptional(F,O,"batchingTexture"),ie.setValue(F,"batchingTexture",O._matricesTexture,R),ie.setOptional(F,O,"batchingIdTexture"),ie.setValue(F,"batchingIdTexture",O._indirectTexture,R),ie.setOptional(F,O,"batchingColorTexture"),O._colorsTexture!==null&&ie.setValue(F,"batchingColorTexture",O._colorsTexture,R));const Si=W.morphAttributes;if((Si.position!==void 0||Si.normal!==void 0||Si.color!==void 0)&&Rt.update(O,W,ke),(Ae||yt.receiveShadow!==O.receiveShadow)&&(yt.receiveShadow=O.receiveShadow,ie.setValue(F,"receiveShadow",O.receiveShadow)),X.isMeshGouraudMaterial&&X.envMap!==null&&(Ve.envMap.value=xt,Ve.flipEnvMap.value=xt.isCubeTexture&&xt.isRenderTargetTexture===!1?-1:1),X.isMeshStandardMaterial&&X.envMap===null&&k.environment!==null&&(Ve.envMapIntensity.value=k.environmentIntensity),Ae&&(ie.setValue(F,"toneMappingExposure",x.toneMappingExposure),yt.needsLights&&wc(Ve,yi),it&&X.fog===!0&&ct.refreshFogUniforms(Ve,it),ct.refreshMaterialUniforms(Ve,X,z,H,f.state.transmissionRenderTarget[E.id]),Us.upload(F,Qo(yt),Ve,R)),X.isShaderMaterial&&X.uniformsNeedUpdate===!0&&(Us.upload(F,Qo(yt),Ve,R),X.uniformsNeedUpdate=!1),X.isSpriteMaterial&&ie.setValue(F,"center",O.center),ie.setValue(F,"modelViewMatrix",O.modelViewMatrix),ie.setValue(F,"normalMatrix",O.normalMatrix),ie.setValue(F,"modelMatrix",O.matrixWorld),X.isShaderMaterial||X.isRawShaderMaterial){const Le=X.uniformsGroups;for(let an=0,ln=Le.length;an<ln;an++){const ea=Le[an];N.update(ea,ke),N.bind(ea,ke)}}return ke}function wc(E,k){E.ambientLightColor.needsUpdate=k,E.lightProbe.needsUpdate=k,E.directionalLights.needsUpdate=k,E.directionalLightShadows.needsUpdate=k,E.pointLights.needsUpdate=k,E.pointLightShadows.needsUpdate=k,E.spotLights.needsUpdate=k,E.spotLightShadows.needsUpdate=k,E.rectAreaLights.needsUpdate=k,E.hemisphereLights.needsUpdate=k}function Tc(E){return E.isMeshLambertMaterial||E.isMeshToonMaterial||E.isMeshPhongMaterial||E.isMeshStandardMaterial||E.isShadowMaterial||E.isShaderMaterial&&E.lights===!0}this.getActiveCubeFace=function(){return w},this.getActiveMipmapLevel=function(){return T},this.getRenderTarget=function(){return P},this.setRenderTargetTextures=function(E,k,W){Et.get(E.texture).__webglTexture=k,Et.get(E.depthTexture).__webglTexture=W;const X=Et.get(E);X.__hasExternalTextures=!0,X.__autoAllocateDepthBuffer=W===void 0,X.__autoAllocateDepthBuffer||Ft.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),X.__useRenderToTexture=!1)},this.setRenderTargetFramebuffer=function(E,k){const W=Et.get(E);W.__webglFramebuffer=k,W.__useDefaultFramebuffer=k===void 0},this.setRenderTarget=function(E,k=0,W=0){P=E,w=k,T=W;let X=!0,O=null,it=!1,ut=!1;if(E){const xt=Et.get(E);if(xt.__useDefaultFramebuffer!==void 0)St.bindFramebuffer(F.FRAMEBUFFER,null),X=!1;else if(xt.__webglFramebuffer===void 0)R.setupRenderTarget(E);else if(xt.__hasExternalTextures)R.rebindTextures(E,Et.get(E.texture).__webglTexture,Et.get(E.depthTexture).__webglTexture);else if(E.depthBuffer){const _t=E.depthTexture;if(xt.__boundDepthTexture!==_t){if(_t!==null&&Et.has(_t)&&(E.width!==_t.image.width||E.height!==_t.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");R.setupDepthRenderbuffer(E)}}const Pt=E.texture;(Pt.isData3DTexture||Pt.isDataArrayTexture||Pt.isCompressedArrayTexture)&&(ut=!0);const Dt=Et.get(E).__webglFramebuffer;E.isWebGLCubeRenderTarget?(Array.isArray(Dt[k])?O=Dt[k][W]:O=Dt[k],it=!0):E.samples>0&&R.useMultisampledRTT(E)===!1?O=Et.get(E).__webglMultisampledFramebuffer:Array.isArray(Dt)?O=Dt[W]:O=Dt,C.copy(E.viewport),I.copy(E.scissor),D=E.scissorTest}else C.copy(st).multiplyScalar(z).floor(),I.copy(gt).multiplyScalar(z).floor(),D=Tt;if(St.bindFramebuffer(F.FRAMEBUFFER,O)&&X&&St.drawBuffers(E,O),St.viewport(C),St.scissor(I),St.setScissorTest(D),it){const xt=Et.get(E.texture);F.framebufferTexture2D(F.FRAMEBUFFER,F.COLOR_ATTACHMENT0,F.TEXTURE_CUBE_MAP_POSITIVE_X+k,xt.__webglTexture,W)}else if(ut){const xt=Et.get(E.texture),Pt=k||0;F.framebufferTextureLayer(F.FRAMEBUFFER,F.COLOR_ATTACHMENT0,xt.__webglTexture,W||0,Pt)}S=-1},this.readRenderTargetPixels=function(E,k,W,X,O,it,ut){if(!(E&&E.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let vt=Et.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&ut!==void 0&&(vt=vt[ut]),vt){St.bindFramebuffer(F.FRAMEBUFFER,vt);try{const xt=E.texture,Pt=xt.format,Dt=xt.type;if(!kt.textureFormatReadable(Pt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!kt.textureTypeReadable(Dt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}k>=0&&k<=E.width-X&&W>=0&&W<=E.height-O&&F.readPixels(k,W,X,O,Ut.convert(Pt),Ut.convert(Dt),it)}finally{const xt=P!==null?Et.get(P).__webglFramebuffer:null;St.bindFramebuffer(F.FRAMEBUFFER,xt)}}},this.readRenderTargetPixelsAsync=async function(E,k,W,X,O,it,ut){if(!(E&&E.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let vt=Et.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&ut!==void 0&&(vt=vt[ut]),vt){const xt=E.texture,Pt=xt.format,Dt=xt.type;if(!kt.textureFormatReadable(Pt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!kt.textureTypeReadable(Dt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");if(k>=0&&k<=E.width-X&&W>=0&&W<=E.height-O){St.bindFramebuffer(F.FRAMEBUFFER,vt);const _t=F.createBuffer();F.bindBuffer(F.PIXEL_PACK_BUFFER,_t),F.bufferData(F.PIXEL_PACK_BUFFER,it.byteLength,F.STREAM_READ),F.readPixels(k,W,X,O,Ut.convert(Pt),Ut.convert(Dt),0);const Gt=P!==null?Et.get(P).__webglFramebuffer:null;St.bindFramebuffer(F.FRAMEBUFFER,Gt);const te=F.fenceSync(F.SYNC_GPU_COMMANDS_COMPLETE,0);return F.flush(),await Cu(F,te,4),F.bindBuffer(F.PIXEL_PACK_BUFFER,_t),F.getBufferSubData(F.PIXEL_PACK_BUFFER,0,it),F.deleteBuffer(_t),F.deleteSync(te),it}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(E,k=null,W=0){E.isTexture!==!0&&(Fi("WebGLRenderer: copyFramebufferToTexture function signature has changed."),k=arguments[0]||null,E=arguments[1]);const X=Math.pow(2,-W),O=Math.floor(E.image.width*X),it=Math.floor(E.image.height*X),ut=k!==null?k.x:0,vt=k!==null?k.y:0;R.setTexture2D(E,0),F.copyTexSubImage2D(F.TEXTURE_2D,W,0,0,ut,vt,O,it),St.unbindTexture()},this.copyTextureToTexture=function(E,k,W=null,X=null,O=0){E.isTexture!==!0&&(Fi("WebGLRenderer: copyTextureToTexture function signature has changed."),X=arguments[0]||null,E=arguments[1],k=arguments[2],O=arguments[3]||0,W=null);let it,ut,vt,xt,Pt,Dt,_t,Gt,te;const ne=E.isCompressedTexture?E.mipmaps[O]:E.image;W!==null?(it=W.max.x-W.min.x,ut=W.max.y-W.min.y,vt=W.isBox3?W.max.z-W.min.z:1,xt=W.min.x,Pt=W.min.y,Dt=W.isBox3?W.min.z:0):(it=ne.width,ut=ne.height,vt=ne.depth||1,xt=0,Pt=0,Dt=0),X!==null?(_t=X.x,Gt=X.y,te=X.z):(_t=0,Gt=0,te=0);const ye=Ut.convert(k.format),Xt=Ut.convert(k.type);let yt;k.isData3DTexture?(R.setTexture3D(k,0),yt=F.TEXTURE_3D):k.isDataArrayTexture||k.isCompressedArrayTexture?(R.setTexture2DArray(k,0),yt=F.TEXTURE_2D_ARRAY):(R.setTexture2D(k,0),yt=F.TEXTURE_2D),F.pixelStorei(F.UNPACK_FLIP_Y_WEBGL,k.flipY),F.pixelStorei(F.UNPACK_PREMULTIPLY_ALPHA_WEBGL,k.premultiplyAlpha),F.pixelStorei(F.UNPACK_ALIGNMENT,k.unpackAlignment);const je=F.getParameter(F.UNPACK_ROW_LENGTH),Yt=F.getParameter(F.UNPACK_IMAGE_HEIGHT),ke=F.getParameter(F.UNPACK_SKIP_PIXELS),zn=F.getParameter(F.UNPACK_SKIP_ROWS),Ae=F.getParameter(F.UNPACK_SKIP_IMAGES);F.pixelStorei(F.UNPACK_ROW_LENGTH,ne.width),F.pixelStorei(F.UNPACK_IMAGE_HEIGHT,ne.height),F.pixelStorei(F.UNPACK_SKIP_PIXELS,xt),F.pixelStorei(F.UNPACK_SKIP_ROWS,Pt),F.pixelStorei(F.UNPACK_SKIP_IMAGES,Dt);const yi=E.isDataArrayTexture||E.isData3DTexture,ie=k.isDataArrayTexture||k.isData3DTexture;if(E.isRenderTargetTexture||E.isDepthTexture){const Ve=Et.get(E),Si=Et.get(k),Le=Et.get(Ve.__renderTarget),an=Et.get(Si.__renderTarget);St.bindFramebuffer(F.READ_FRAMEBUFFER,Le.__webglFramebuffer),St.bindFramebuffer(F.DRAW_FRAMEBUFFER,an.__webglFramebuffer);for(let ln=0;ln<vt;ln++)yi&&F.framebufferTextureLayer(F.READ_FRAMEBUFFER,F.COLOR_ATTACHMENT0,Et.get(E).__webglTexture,O,Dt+ln),E.isDepthTexture?(ie&&F.framebufferTextureLayer(F.DRAW_FRAMEBUFFER,F.COLOR_ATTACHMENT0,Et.get(k).__webglTexture,O,te+ln),F.blitFramebuffer(xt,Pt,it,ut,_t,Gt,it,ut,F.DEPTH_BUFFER_BIT,F.NEAREST)):ie?F.copyTexSubImage3D(yt,O,_t,Gt,te+ln,xt,Pt,it,ut):F.copyTexSubImage2D(yt,O,_t,Gt,te+ln,xt,Pt,it,ut);St.bindFramebuffer(F.READ_FRAMEBUFFER,null),St.bindFramebuffer(F.DRAW_FRAMEBUFFER,null)}else ie?E.isDataTexture||E.isData3DTexture?F.texSubImage3D(yt,O,_t,Gt,te,it,ut,vt,ye,Xt,ne.data):k.isCompressedArrayTexture?F.compressedTexSubImage3D(yt,O,_t,Gt,te,it,ut,vt,ye,ne.data):F.texSubImage3D(yt,O,_t,Gt,te,it,ut,vt,ye,Xt,ne):E.isDataTexture?F.texSubImage2D(F.TEXTURE_2D,O,_t,Gt,it,ut,ye,Xt,ne.data):E.isCompressedTexture?F.compressedTexSubImage2D(F.TEXTURE_2D,O,_t,Gt,ne.width,ne.height,ye,ne.data):F.texSubImage2D(F.TEXTURE_2D,O,_t,Gt,it,ut,ye,Xt,ne);F.pixelStorei(F.UNPACK_ROW_LENGTH,je),F.pixelStorei(F.UNPACK_IMAGE_HEIGHT,Yt),F.pixelStorei(F.UNPACK_SKIP_PIXELS,ke),F.pixelStorei(F.UNPACK_SKIP_ROWS,zn),F.pixelStorei(F.UNPACK_SKIP_IMAGES,Ae),O===0&&k.generateMipmaps&&F.generateMipmap(yt),St.unbindTexture()},this.copyTextureToTexture3D=function(E,k,W=null,X=null,O=0){return E.isTexture!==!0&&(Fi("WebGLRenderer: copyTextureToTexture3D function signature has changed."),W=arguments[0]||null,X=arguments[1]||null,E=arguments[2],k=arguments[3],O=arguments[4]||0),Fi('WebGLRenderer: copyTextureToTexture3D function has been deprecated. Use "copyTextureToTexture" instead.'),this.copyTextureToTexture(E,k,W,X,O)},this.initRenderTarget=function(E){Et.get(E).__webglFramebuffer===void 0&&R.setupRenderTarget(E)},this.initTexture=function(E){E.isCubeTexture?R.setTextureCube(E,0):E.isData3DTexture?R.setTexture3D(E,0):E.isDataArrayTexture||E.isCompressedArrayTexture?R.setTexture2DArray(E,0):R.setTexture2D(E,0),St.unbindTexture()},this.resetState=function(){w=0,T=0,P=null,St.reset(),Qt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return nn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;const e=this.getContext();e.drawingBufferColorspace=Vt._getDrawingBufferColorSpace(t),e.unpackColorSpace=Vt._getUnpackColorSpace()}}class Os{constructor(t,e=1,n=1e3){this.isFog=!0,this.name="",this.color=new Bt(t),this.near=e,this.far=n}clone(){return new Os(this.color,this.near,this.far)}toJSON(){return{type:"Fog",name:this.name,color:this.color.getHex(),near:this.near,far:this.far}}}class Ar extends oe{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Ye,this.environmentIntensity=1,this.environmentRotation=new Ye,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){const e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}}class xc extends _e{constructor(t=null,e=1,n=1,i,r,o,a,c,l=xe,u=xe,p,d){super(null,o,a,c,l,u,i,r,p,d),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class ll extends Me{constructor(t,e,n,i=1){super(t,e,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}toJSON(){const t=super.toJSON();return t.meshPerAttribute=this.meshPerAttribute,t.isInstancedBufferAttribute=!0,t}}const ei=new Jt,cl=new Jt,Ms=[],hl=new Bn,z0=new Jt,Pi=new me,Li=new xi;class H0 extends me{constructor(t,e,n){super(t,e),this.isInstancedMesh=!0,this.instanceMatrix=new ll(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,z0)}computeBoundingBox(){const t=this.geometry,e=this.count;this.boundingBox===null&&(this.boundingBox=new Bn),t.boundingBox===null&&t.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,ei),hl.copy(t.boundingBox).applyMatrix4(ei),this.boundingBox.union(hl)}computeBoundingSphere(){const t=this.geometry,e=this.count;this.boundingSphere===null&&(this.boundingSphere=new xi),t.boundingSphere===null&&t.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,ei),Li.copy(t.boundingSphere).applyMatrix4(ei),this.boundingSphere.union(Li)}copy(t,e){return super.copy(t,e),this.instanceMatrix.copy(t.instanceMatrix),t.morphTexture!==null&&(this.morphTexture=t.morphTexture.clone()),t.instanceColor!==null&&(this.instanceColor=t.instanceColor.clone()),this.count=t.count,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}getColorAt(t,e){e.fromArray(this.instanceColor.array,t*3)}getMatrixAt(t,e){e.fromArray(this.instanceMatrix.array,t*16)}getMorphAt(t,e){const n=e.morphTargetInfluences,i=this.morphTexture.source.data.data,r=n.length+1,o=t*r+1;for(let a=0;a<n.length;a++)n[a]=i[o+a]}raycast(t,e){const n=this.matrixWorld,i=this.count;if(Pi.geometry=this.geometry,Pi.material=this.material,Pi.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Li.copy(this.boundingSphere),Li.applyMatrix4(n),t.ray.intersectsSphere(Li)!==!1))for(let r=0;r<i;r++){this.getMatrixAt(r,ei),cl.multiplyMatrices(n,ei),Pi.matrixWorld=cl,Pi.raycast(t,Ms);for(let o=0,a=Ms.length;o<a;o++){const c=Ms[o];c.instanceId=r,c.object=this,e.push(c)}Ms.length=0}}setColorAt(t,e){this.instanceColor===null&&(this.instanceColor=new ll(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),e.toArray(this.instanceColor.array,t*3)}setMatrixAt(t,e){e.toArray(this.instanceMatrix.array,t*16)}setMorphAt(t,e){const n=e.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new xc(new Float32Array(i*this.count),i,this.count,ko,Xe));const r=this.morphTexture.source.data.data;let o=0;for(let l=0;l<n.length;l++)o+=n[l];const a=this.geometry.morphTargetsRelative?1:1-o,c=i*t;r[c]=a,r.set(n,c+1)}updateMorphTargets(){}dispose(){return this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null),this}}class Bs extends _i{static get type(){return"LineBasicMaterial"}constructor(t){super(),this.isLineBasicMaterial=!0,this.color=new Bt(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.linewidth=t.linewidth,this.linecap=t.linecap,this.linejoin=t.linejoin,this.fog=t.fog,this}}const zs=new B,Hs=new B,ul=new Jt,Di=new sc,ys=new xi,Cr=new B,dl=new B;class _c extends oe{constructor(t=new Te,e=new Bs){super(),this.isLine=!0,this.type="Line",this.geometry=t,this.material=e,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[0];for(let i=1,r=e.count;i<r;i++)zs.fromBufferAttribute(e,i-1),Hs.fromBufferAttribute(e,i),n[i]=n[i-1],n[i]+=zs.distanceTo(Hs);t.setAttribute("lineDistance",new he(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(t,e){const n=this.geometry,i=this.matrixWorld,r=t.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),ys.copy(n.boundingSphere),ys.applyMatrix4(i),ys.radius+=r,t.ray.intersectsSphere(ys)===!1)return;ul.copy(i).invert(),Di.copy(t.ray).applyMatrix4(ul);const a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=this.isLineSegments?2:1,u=n.index,d=n.attributes.position;if(u!==null){const h=Math.max(0,o.start),g=Math.min(u.count,o.start+o.count);for(let v=h,m=g-1;v<m;v+=l){const f=u.getX(v),_=u.getX(v+1),M=Ss(this,t,Di,c,f,_);M&&e.push(M)}if(this.isLineLoop){const v=u.getX(g-1),m=u.getX(h),f=Ss(this,t,Di,c,v,m);f&&e.push(f)}}else{const h=Math.max(0,o.start),g=Math.min(d.count,o.start+o.count);for(let v=h,m=g-1;v<m;v+=l){const f=Ss(this,t,Di,c,v,v+1);f&&e.push(f)}if(this.isLineLoop){const v=Ss(this,t,Di,c,g-1,h);v&&e.push(v)}}}updateMorphTargets(){const e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){const i=e[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){const a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}}function Ss(s,t,e,n,i,r){const o=s.geometry.attributes.position;if(zs.fromBufferAttribute(o,i),Hs.fromBufferAttribute(o,r),e.distanceSqToSegment(zs,Hs,Cr,dl)>n)return;Cr.applyMatrix4(s.matrixWorld);const c=t.ray.origin.distanceTo(Cr);if(!(c<t.near||c>t.far))return{distance:c,point:dl.clone().applyMatrix4(s.matrixWorld),index:i,face:null,faceIndex:null,barycoord:null,object:s}}const fl=new B,pl=new B;class Mc extends _c{constructor(t,e){super(t,e),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const t=this.geometry;if(t.index===null){const e=t.attributes.position,n=[];for(let i=0,r=e.count;i<r;i+=2)fl.fromBufferAttribute(e,i),pl.fromBufferAttribute(e,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+fl.distanceTo(pl);t.setAttribute("lineDistance",new he(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class $s extends Te{constructor(t=1,e=1,n=1,i=32,r=1,o=!1,a=0,c=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:i,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:c};const l=this;i=Math.floor(i),r=Math.floor(r);const u=[],p=[],d=[],h=[];let g=0;const v=[],m=n/2;let f=0;_(),o===!1&&(t>0&&M(!0),e>0&&M(!1)),this.setIndex(u),this.setAttribute("position",new he(p,3)),this.setAttribute("normal",new he(d,3)),this.setAttribute("uv",new he(h,2));function _(){const x=new B,A=new B;let w=0;const T=(e-t)/n;for(let P=0;P<=r;P++){const S=[],y=P/r,C=y*(e-t)+t;for(let I=0;I<=i;I++){const D=I/i,G=D*c+a,q=Math.sin(G),U=Math.cos(G);A.x=C*q,A.y=-y*n+m,A.z=C*U,p.push(A.x,A.y,A.z),x.set(q,T,U).normalize(),d.push(x.x,x.y,x.z),h.push(D,1-y),S.push(g++)}v.push(S)}for(let P=0;P<i;P++)for(let S=0;S<r;S++){const y=v[S][P],C=v[S+1][P],I=v[S+1][P+1],D=v[S][P+1];(t>0||S!==0)&&(u.push(y,C,D),w+=3),(e>0||S!==r-1)&&(u.push(C,I,D),w+=3)}l.addGroup(f,w,0),f+=w}function M(x){const A=g,w=new Wt,T=new B;let P=0;const S=x===!0?t:e,y=x===!0?1:-1;for(let I=1;I<=i;I++)p.push(0,m*y,0),d.push(0,y,0),h.push(.5,.5),g++;const C=g;for(let I=0;I<=i;I++){const G=I/i*c+a,q=Math.cos(G),U=Math.sin(G);T.x=S*U,T.y=m*y,T.z=S*q,p.push(T.x,T.y,T.z),d.push(0,y,0),w.x=q*.5+.5,w.y=U*.5*y+.5,h.push(w.x,w.y),g++}for(let I=0;I<i;I++){const D=A+I,G=C+I;x===!0?u.push(G,G+1,D):u.push(G+1,G,D),P+=3}l.addGroup(f,P,x===!0?1:2),f+=P}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new $s(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}class qo extends $s{constructor(t=1,e=1,n=32,i=1,r=!1,o=0,a=Math.PI*2){super(0,t,e,n,i,r,o,a),this.type="ConeGeometry",this.parameters={radius:t,height:e,radialSegments:n,heightSegments:i,openEnded:r,thetaStart:o,thetaLength:a}}static fromJSON(t){return new qo(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}}const bs=new B,Es=new B,Rr=new B,ws=new Ue;class V0 extends Te{constructor(t=null,e=1){if(super(),this.type="EdgesGeometry",this.parameters={geometry:t,thresholdAngle:e},t!==null){const i=Math.pow(10,4),r=Math.cos(Is*e),o=t.getIndex(),a=t.getAttribute("position"),c=o?o.count:a.count,l=[0,0,0],u=["a","b","c"],p=new Array(3),d={},h=[];for(let g=0;g<c;g+=3){o?(l[0]=o.getX(g),l[1]=o.getX(g+1),l[2]=o.getX(g+2)):(l[0]=g,l[1]=g+1,l[2]=g+2);const{a:v,b:m,c:f}=ws;if(v.fromBufferAttribute(a,l[0]),m.fromBufferAttribute(a,l[1]),f.fromBufferAttribute(a,l[2]),ws.getNormal(Rr),p[0]=`${Math.round(v.x*i)},${Math.round(v.y*i)},${Math.round(v.z*i)}`,p[1]=`${Math.round(m.x*i)},${Math.round(m.y*i)},${Math.round(m.z*i)}`,p[2]=`${Math.round(f.x*i)},${Math.round(f.y*i)},${Math.round(f.z*i)}`,!(p[0]===p[1]||p[1]===p[2]||p[2]===p[0]))for(let _=0;_<3;_++){const M=(_+1)%3,x=p[_],A=p[M],w=ws[u[_]],T=ws[u[M]],P=`${x}_${A}`,S=`${A}_${x}`;S in d&&d[S]?(Rr.dot(d[S].normal)<=r&&(h.push(w.x,w.y,w.z),h.push(T.x,T.y,T.z)),d[S]=null):P in d||(d[P]={index0:l[_],index1:l[M],normal:Rr.clone()})}}for(const g in d)if(d[g]){const{index0:v,index1:m}=d[g];bs.fromBufferAttribute(a,v),Es.fromBufferAttribute(a,m),h.push(bs.x,bs.y,bs.z),h.push(Es.x,Es.y,Es.z)}this.setAttribute("position",new he(h,3))}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}}class Xo extends Te{constructor(t=1,e=32,n=16,i=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:i,phiLength:r,thetaStart:o,thetaLength:a},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));const c=Math.min(o+a,Math.PI);let l=0;const u=[],p=new B,d=new B,h=[],g=[],v=[],m=[];for(let f=0;f<=n;f++){const _=[],M=f/n;let x=0;f===0&&o===0?x=.5/e:f===n&&c===Math.PI&&(x=-.5/e);for(let A=0;A<=e;A++){const w=A/e;p.x=-t*Math.cos(i+w*r)*Math.sin(o+M*a),p.y=t*Math.cos(o+M*a),p.z=t*Math.sin(i+w*r)*Math.sin(o+M*a),g.push(p.x,p.y,p.z),d.copy(p).normalize(),v.push(d.x,d.y,d.z),m.push(w+x,1-M),_.push(l++)}u.push(_)}for(let f=0;f<n;f++)for(let _=0;_<e;_++){const M=u[f][_+1],x=u[f][_],A=u[f+1][_],w=u[f+1][_+1];(f!==0||o>0)&&h.push(M,x,w),(f!==n-1||c<Math.PI)&&h.push(x,A,w)}this.setIndex(h),this.setAttribute("position",new he(g,3)),this.setAttribute("normal",new he(v,3)),this.setAttribute("uv",new he(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new Xo(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}}class ml extends _i{static get type(){return"MeshStandardMaterial"}constructor(t){super(),this.isMeshStandardMaterial=!0,this.defines={STANDARD:""},this.color=new Bt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new Bt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Jl,this.normalScale=new Wt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Ye,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}}class Yo extends oe{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new Bt(t),this.intensity=e}dispose(){}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){const e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,this.groundColor!==void 0&&(e.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(e.object.distance=this.distance),this.angle!==void 0&&(e.object.angle=this.angle),this.decay!==void 0&&(e.object.decay=this.decay),this.penumbra!==void 0&&(e.object.penumbra=this.penumbra),this.shadow!==void 0&&(e.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(e.object.target=this.target.uuid),e}}class G0 extends Yo{constructor(t,e,n){super(t,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(oe.DEFAULT_UP),this.updateMatrix(),this.groundColor=new Bt(e)}copy(t,e){return super.copy(t,e),this.groundColor.copy(t.groundColor),this}}const Pr=new Jt,gl=new B,vl=new B;class yc{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Wt(512,512),this.map=null,this.mapPass=null,this.matrix=new Jt,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Vo,this._frameExtents=new Wt(1,1),this._viewportCount=1,this._viewports=[new Zt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){const e=this.camera,n=this.matrix;gl.setFromMatrixPosition(t.matrixWorld),e.position.copy(gl),vl.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(vl),e.updateMatrixWorld(),Pr.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Pr),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Pr)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.mapSize.copy(t.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){const t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}}const xl=new Jt,Ii=new B,Lr=new B;class W0 extends yc{constructor(){super(new Pe(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new Wt(4,2),this._viewportCount=6,this._viewports=[new Zt(2,1,1,1),new Zt(0,1,1,1),new Zt(3,1,1,1),new Zt(1,1,1,1),new Zt(3,0,1,1),new Zt(1,0,1,1)],this._cubeDirections=[new B(1,0,0),new B(-1,0,0),new B(0,0,1),new B(0,0,-1),new B(0,1,0),new B(0,-1,0)],this._cubeUps=[new B(0,1,0),new B(0,1,0),new B(0,1,0),new B(0,1,0),new B(0,0,1),new B(0,0,-1)]}updateMatrices(t,e=0){const n=this.camera,i=this.matrix,r=t.distance||n.far;r!==n.far&&(n.far=r,n.updateProjectionMatrix()),Ii.setFromMatrixPosition(t.matrixWorld),n.position.copy(Ii),Lr.copy(n.position),Lr.add(this._cubeDirections[e]),n.up.copy(this._cubeUps[e]),n.lookAt(Lr),n.updateMatrixWorld(),i.makeTranslation(-Ii.x,-Ii.y,-Ii.z),xl.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(xl)}}class q0 extends Yo{constructor(t,e,n=0,i=2){super(t,e),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new W0}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}}class X0 extends yc{constructor(){super(new Go(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class Y0 extends Yo{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(oe.DEFAULT_UP),this.updateMatrix(),this.target=new oe,this.shadow=new X0}dispose(){this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}}class $0 extends Mc{constructor(t=10,e=10,n=4473924,i=8947848){n=new Bt(n),i=new Bt(i);const r=e/2,o=t/e,a=t/2,c=[],l=[];for(let d=0,h=0,g=-a;d<=e;d++,g+=o){c.push(-a,0,g,a,0,g),c.push(g,0,-a,g,0,a);const v=d===r?n:i;v.toArray(l,h),h+=3,v.toArray(l,h),h+=3,v.toArray(l,h),h+=3,v.toArray(l,h),h+=3}const u=new Te;u.setAttribute("position",new he(c,3)),u.setAttribute("color",new he(l,3));const p=new Bs({vertexColors:!0,toneMapped:!1});super(u,p),this.type="GridHelper"}dispose(){this.geometry.dispose(),this.material.dispose()}}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Io}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Io);function j0(s,t,e=24){const{nx:n,ny:i}=s,r=Math.max(1,Math.floor(Math.max(n,i)/Math.max(4,e))),o=[],a=Math.floor(r/2),c=Math.floor(r/2);for(let l=c;l<i;l+=r)for(let u=a;u<n;u+=r){const p=s.uCenter(t.u,u,l,0),d=s.vCenter(t.v,u,l,0);o.push({i:u,j:l,u:p,v:d,spd:Math.hypot(p,d)})}return o}function Sc(s){let t=1;for(const e of s)e.spd>t&&(t=e.spd);return t}const K0=`
out vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,Z0=`
precision highp float;
precision highp sampler3D;
uniform sampler3D uVolume;
uniform sampler3D uVolumePrev;
uniform float uFade;
uniform vec3 uCameraPos;
uniform float uOpacity;
uniform float uStep;
in vec3 vPos;
out vec4 fragColor;

uniform vec3 uSunWorld;
uniform vec3 uScale;
uniform vec3 uFlashLocal;
uniform float uFlash;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Physics: i + nx*(j + ny*k), k = height, +j = north.
// Display: flip j like 2D mapPix so north sits on −Z (viewed from +Z).
// R = softened cloud, G = rain, B = shaft hung below the rain.
vec3 sampleMass(vec3 p) {
  vec3 uv = vec3(p.x + 0.5, 1.0 - (p.z + 0.5), p.y + 0.5);
  if (any(lessThan(uv, vec3(0.0))) || any(greaterThan(uv, vec3(1.0)))) {
    return vec3(0.0);
  }
  return mix(texture(uVolumePrev, uv).rgb, texture(uVolume, uv).rgb, uFade);
}

vec3 safeInv(vec3 d) {
  return vec3(
    abs(d.x) < 1e-5 ? 1e6 : 1.0 / d.x,
    abs(d.y) < 1e-5 ? 1e6 : 1.0 / d.y,
    abs(d.z) < 1e-5 ? 1e6 : 1.0 / d.z
  );
}

void main() {
  vec3 cam = uCameraPos;
  vec3 rayDir = normalize(vPos - cam);
  vec3 boxMin = vec3(-0.5);
  vec3 boxMax = vec3(0.5);
  bool inside = all(greaterThan(cam, boxMin)) && all(lessThan(cam, boxMax));
  vec3 pos = cam;
  if (!inside) {
    vec3 inv = safeInv(rayDir);
    vec3 t0 = (boxMin - cam) * inv;
    vec3 t1 = (boxMax - cam) * inv;
    vec3 tNear = min(t0, t1);
    float tEnter = max(max(tNear.x, tNear.y), tNear.z);
    pos = cam + rayDir * max(tEnter, 0.0);
  }
  vec3 worldRay = normalize(rayDir * uScale);
  vec3 sunLocal = uSunWorld / max(uScale, vec3(1.0));
  float sunLen = length(sunLocal);
  sunLocal = sunLen > 1e-5 ? sunLocal / sunLen : vec3(0.0, 1.0, 0.0);
  float mu = dot(worldRay, normalize(uSunWorld));
  float phase = 0.55 + 0.85 * pow(max(mu, 0.0), 4.0);
  float elev = uSunWorld.y;
  float day = smoothstep(-0.02, 0.30, elev);
  float sunVis = smoothstep(-0.04, 0.16, elev);
  float warm = smoothstep(-0.12, 0.0, elev) * (1.0 - smoothstep(0.02, 0.2, elev));
  vec3 sunCol = mix(vec3(1.0, 0.97, 0.93), vec3(1.0, 0.70, 0.40), warm);
  vec3 amb = mix(vec3(0.09, 0.10, 0.13), vec3(0.74, 0.80, 0.88), day);
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  pos += rayDir * uStep * jitter * 0.12;
  vec4 acc = vec4(0.0);

  for (int i = 0; i < 80; i++) {
    vec2 xz = pos.xz * uScale.xz;
    float yb = pos.y * 7.5;
    float n = noise2(xz * 0.0005 + vec2(yb, -yb * 0.6));
    float n2 = noise2(xz * 0.00135 + vec2(yb * 1.8, yb * 0.7) + 9.0);
    vec3 sp = pos + vec3((n - 0.5) * 0.03, (n - 0.5) * 0.04 + (n2 - 0.5) * 0.055, (n2 - 0.5) * 0.03);
    float puff = noise2(vec2(pos.x * 13.0 + pos.y * 17.0, pos.z * 13.0 - pos.y * 15.0));
    float puffB = noise2(vec2(pos.x * 6.5 - pos.y * 8.0, pos.z * 6.5 + pos.y * 7.0) + 4.2);
    vec3 mass = sampleMass(sp);
    float qc = mass.r;
    float fbm = puff * 0.62 + puffB * 0.38;
    float cloud = max(0.0, qc * (0.22 + fbm) - 0.03);
    cloud *= smoothstep(0.0, 0.12, cloud);
    // Same lumps as the cloud, and the shaft stays partly present inside it
    // so the base fades into the rain instead of ending on a line.
    float shaft = mass.b * (0.4 + 0.6 * fbm);
    shaft *= mix(0.5, 1.0, 1.0 - smoothstep(0.04, 0.7, cloud));
    float d = cloud + shaft * 0.5;
    float stepLen = d > 0.045 ? uStep * 0.7 : (d > 0.008 ? uStep : uStep * 2.1);
    if (d > 0.008) {
      float shadow = sampleMass(sp + sunLocal * (uStep * 3.2)).r;
      float light = exp(-shadow * 1.05);
      float wet = smoothstep(0.0, 0.55, shaft / max(cloud + shaft, 0.04));
      vec3 dry = mix(vec3(0.60, 0.64, 0.70), vec3(1.0, 0.99, 0.97), light);
      vec3 damp = mix(vec3(0.52, 0.56, 0.62), vec3(0.74, 0.78, 0.84), light * 0.65 + 0.35);
      vec3 albedo = mix(dry, damp, wet);
      vec3 lit = mix(vec3(0.50, 0.53, 0.60), albedo, sunVis);
      float sunAmt = sunVis * mix(1.0, 0.45, wet);
      vec3 col = lit * (amb + sunCol * light * phase * sunAmt);
      float flashDist = length((sp - uFlashLocal) * uScale);
      float glow = uFlash * exp(-flashDist * flashDist / (2200.0 * 2200.0));
      col += vec3(0.75, 0.84, 1.0) * glow * 1.6;
      float ext = mix(8.0, 2.4, wet);
      float a = 1.0 - exp(-d * ext * stepLen / max(uStep, 1e-4));
      a = clamp(a, 0.0, mix(1.0, 0.4, wet));
      acc.rgb += (1.0 - acc.a) * col * a;
      acc.a += (1.0 - acc.a) * a;
    }
    if (acc.a > 0.96) break;
    pos += rayDir * stepLen;
    if (pos.y < -0.5 || any(greaterThan(abs(pos), vec3(0.52)))) break;
  }

  if (acc.a < 0.01) discard;
  fragColor = acc;
}
`,J0=`
out vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;
}
`,Q0=`
precision highp float;
in vec3 vDir;
uniform vec3 uSunDir;
out vec4 fragColor;

void main() {
  vec3 dir = normalize(vDir);
  float day = smoothstep(-0.05, 0.25, uSunDir.y);
  vec3 zenith = mix(vec3(0.015, 0.02, 0.06), vec3(0.16, 0.42, 0.86), day);
  vec3 horiz = mix(vec3(0.04, 0.05, 0.10), vec3(0.78, 0.84, 0.90), day);
  float up = pow(clamp(dir.y, 0.0, 1.0), 0.42);
  vec3 col = mix(horiz, zenith, up);
  col = mix(col * vec3(0.45, 0.5, 0.55), col, smoothstep(-0.2, 0.02, dir.y));
  vec3 sun = normalize(uSunDir);
  float sunDot = dot(dir, sun);
  float disc = smoothstep(0.9985, 0.9995, sunDot);
  float glare = pow(max(sunDot, 0.0), 8.0);
  float wide = pow(max(sunDot, 0.0), 2.0);
  vec3 sunCol = mix(vec3(1.0, 0.40, 0.16), vec3(1.0, 0.98, 0.92), day);
  float vis = smoothstep(-0.04, 0.12, sun.y);
  col += sunCol * (disc * 3.2 + glare * 0.65 + wide * 0.16) * vis;
  fragColor = vec4(col, 1.0);
}
`,tg=`
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,eg=`
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = texture(uTex, vUv);
}
`;class ng{constructor(t){L(this,"renderer");L(this,"scene");L(this,"camera");L(this,"volumeTex",null);L(this,"volumePrevTex",null);L(this,"volumeMesh",null);L(this,"volumeData",null);L(this,"volumePrevData",null);L(this,"radarTex",null);L(this,"radarMesh",null);L(this,"radarData",null);L(this,"radarNx",0);L(this,"radarNy",0);L(this,"domainSpan",2);L(this,"volNx",1);L(this,"volNy",1);L(this,"volNz",1);L(this,"spanX",1e3);L(this,"spanZ",1e3);L(this,"spanY",1e3);L(this,"groundY",-500);L(this,"eyeM",2);L(this,"ground");L(this,"kmGrid",null);L(this,"hemi");L(this,"sunLight");L(this,"draggingLook",!1);L(this,"lookX",0);L(this,"lookY",0);L(this,"yaw",0);L(this,"pitch",-.22);L(this,"fovWide",80);L(this,"fovTight",18);L(this,"unbindLook",null);L(this,"domainBox");L(this,"windMesh",null);L(this,"windDummy",new oe);L(this,"windVisible",!1);L(this,"windNx",0);L(this,"windNy",0);L(this,"windSx",1);L(this,"windSz",1);L(this,"windY",-.48);L(this,"warnedEmpty",!1);L(this,"ro",null);L(this,"cloudScene",new Ar);L(this,"overlay",new Ar);L(this,"overlayCam",new Go(-1,1,1,-1,0,1));L(this,"cloudTarget",null);L(this,"sky");L(this,"blitMesh");L(this,"sunDir",new B(.25,.75,.2));L(this,"cloudsOn",!0);L(this,"volumeClear",!1);L(this,"lastVolumeMs",0);L(this,"clearScratch",new Bt);L(this,"cloudScratch",null);L(this,"cloudScratchB",null);L(this,"liveBolts",[]);L(this,"flashLights",[]);L(this,"boltLines",[]);this.container=t,this.renderer=new B0({antialias:!0,alpha:!1}),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)),this.renderer.setClearColor(660516,1);const e=this.renderer.domElement;e.style.display="block",e.style.width="100%",e.style.height="100%",this.container.appendChild(e),this.scene=new Ar,this.camera=new Pe(68,1,.4,25e4),this.camera.rotation.order="YXZ",this.camera.position.set(0,this.eyeM,0),document.pointerLockElement&&document.exitPointerLock(),this.bindLook(e),this.hemi=new G0(12967423,2771496,.95),this.scene.add(this.hemi),this.sunLight=new Y0(16773846,1.15),this.sunLight.position.set(80,200,40),this.scene.add(this.sunLight);for(let l=0;l<3;l++){const u=new q0(14411775,0,8e3,2);u.castShadow=!1,this.flashLights.push(u),this.scene.add(u);const p=new Te;p.setAttribute("position",new Me(new Float32Array(18),3));const d=new _c(p,new Bs({color:15988735,transparent:!0,opacity:0,fog:!1}));d.visible=!1,d.frustumCulled=!1,this.boltLines.push(d),this.scene.add(d)}this.scene.fog=new Os(9417940,18e3,7e4),this.renderer.setClearColor(9417940,1);const n=new Un(4,4),i=new ml({color:3963461,roughness:.95});this.ground=new me(n,i),this.ground.rotation.x=-Math.PI/2,this.ground.position.y=-.5,this.scene.add(this.ground);const r=new On(1,1,1),o=new V0(r);this.domainBox=new Mc(o,new Bs({color:3821680,transparent:!0,opacity:.55})),this.scene.add(this.domainBox);const a=new He({glslVersion:zi,vertexShader:J0,fragmentShader:Q0,uniforms:{uSunDir:{value:this.sunDir}},side:ge,depthTest:!1,depthWrite:!1,fog:!1});this.sky=new me(new Xo(1,32,18),a),this.sky.frustumCulled=!1,this.sky.renderOrder=-10,this.scene.add(this.sky);const c=new He({glslVersion:zi,vertexShader:tg,fragmentShader:eg,uniforms:{uTex:{value:null}},transparent:!0,depthTest:!1,depthWrite:!1});this.blitMesh=new me(new Un(2,2),c),this.blitMesh.frustumCulled=!1,this.overlay.add(this.blitMesh),this.ro=new ResizeObserver(()=>this.resize()),this.ro.observe(this.container),this.resize()}resize(){var a;const t=Math.max(1,this.container.clientWidth),e=Math.max(1,this.container.clientHeight);this.camera.aspect=t/e,this.camera.updateProjectionMatrix(),this.renderer.setSize(t,e,!0);const n=Math.max(1,this.renderer.domElement.width),i=Math.max(1,this.renderer.domElement.height),r=Math.max(1,Math.floor(n*.67)),o=Math.max(1,Math.floor(i*.67));if(!this.cloudTarget||this.cloudTarget.width!==r||this.cloudTarget.height!==o){(a=this.cloudTarget)==null||a.dispose(),this.cloudTarget=new _n(r,o,{minFilter:Ee,magFilter:Ee,format:we,type:Ne,depthBuffer:!1});const c=this.blitMesh.material;c.uniforms.uTex.value=this.cloudTarget.texture}}setVolumeVisible(t){this.cloudsOn=t,this.volumeMesh&&(this.volumeMesh.visible=t)}setRadarVisible(t){this.radarMesh&&(this.radarMesh.visible=t)}setWindsVisible(t){this.windVisible=t,this.windMesh&&(this.windMesh.visible=t)}teleportTo(t,e,n){const i=(Math.min(1,Math.max(0,t))-.5)*this.spanX,r=-((Math.min(1,Math.max(0,e))-.5)*this.spanZ),o=Math.min(this.spanY-2,Math.max(this.eyeM,n));this.camera.position.set(i,this.groundY+o,r)}playerState(){const t=this.spanX>0?this.camera.position.x/this.spanX+.5:.5,e=this.spanZ>0?-this.camera.position.z/this.spanZ+.5:.5;return{xn:Math.min(1,Math.max(0,t)),yn:Math.min(1,Math.max(0,e)),altitudeM:this.camera.position.y-this.groundY,eastM:this.camera.position.x,northM:-this.camera.position.z}}spawnPlayer(){this.yaw=0,this.pitch=-.22,this.camera.position.set(0,this.groundY+this.eyeM,0),this.camera.rotation.set(this.pitch,this.yaw,0),this.camera.fov=68,this.camera.updateProjectionMatrix()}bindLook(t){const e=o=>{o.button===0&&(this.draggingLook=!0,this.lookX=o.clientX,this.lookY=o.clientY,t.setPointerCapture(o.pointerId),t.style.cursor="grabbing")},n=o=>{if(!this.draggingLook)return;const a=o.clientX-this.lookX,c=o.clientY-this.lookY;this.lookX=o.clientX,this.lookY=o.clientY;const l=.0022;this.yaw-=a*l,this.pitch+=c*l;const u=Math.PI/2-.04;this.pitch>u&&(this.pitch=u),this.pitch<-u&&(this.pitch=-u),this.camera.rotation.set(this.pitch,this.yaw,0)},i=o=>{this.draggingLook&&(this.draggingLook=!1,t.hasPointerCapture(o.pointerId)&&t.releasePointerCapture(o.pointerId),t.style.cursor="grab")},r=o=>{o.preventDefault();const a=o.deltaY>0?3:-3;this.camera.fov=Math.min(this.fovWide,Math.max(this.fovTight,this.camera.fov+a)),this.camera.updateProjectionMatrix()};t.style.cursor="grab",t.addEventListener("pointerdown",e),t.addEventListener("pointermove",n),t.addEventListener("pointerup",i),t.addEventListener("pointercancel",i),t.addEventListener("wheel",r,{passive:!1}),this.unbindLook=()=>{t.removeEventListener("pointerdown",e),t.removeEventListener("pointermove",n),t.removeEventListener("pointerup",i),t.removeEventListener("pointercancel",i),t.removeEventListener("wheel",r)}}setSunFrac(t){const e=Math.min(1,Math.max(0,t)),n=(r,o)=>Math.round(r+(o-r)*e),i=n(10,143)<<16|n(16,180)<<8|n(28,214);this.renderer.setClearColor(i,1),this.scene.fog&&this.scene.fog.color.set(i),this.hemi.intensity=.22+.8*e,this.sunLight.intensity=.15+1.05*e}setSun(t,e){this.setSunFrac(t),this.sunDir.set(e.x,e.y,e.z),this.sunDir.lengthSq()<1e-8?this.sunDir.set(0,1,0):this.sunDir.normalize(),this.sunLight.position.copy(this.sunDir).multiplyScalar(400);const n=this.sunDir.y,i=Math.min(1,Math.max(0,(n+.02)/.28)),r=Math.min(1,Math.max(0,1-Math.abs(n)/.16))*(1-i);this.sunLight.color.setRGB(.55+i*.45+r*.15,.62+i*.34,Math.max(.25,.78+i*.14-r*.4))}setGrid(t){const e=Math.max(1,t.zTop),n=Math.max(1,t.xExtent),i=Math.max(1,t.yExtent);this.spanX=n,this.spanZ=i,this.spanY=e,this.groundY=-e/2,this.domainSpan=Math.max(n,i),this.domainBox.scale.set(n,e,i),this.ground.scale.set(n*1.12,i*1.12,1),this.ground.position.y=this.groundY,this.camera.far=Math.max(8e3,this.domainSpan*3),this.camera.updateProjectionMatrix();const r=Math.max(4e3,this.domainSpan*.28);this.scene.fog instanceof Os&&(this.scene.fog.near=r,this.scene.fog.far=r*3.2),this.rebuildKmGrid(n,i),this.warnedEmpty=!1,this.volumeMesh&&(this.cloudScene.remove(this.volumeMesh),this.volumeMesh.geometry.dispose(),this.volumeMesh.material.dispose(),this.volumeMesh=null),this.volumeTex&&(this.volumeTex.dispose(),this.volumeTex=null),this.volumePrevTex&&(this.volumePrevTex.dispose(),this.volumePrevTex=null),this.volumePrevData=null,this.disposeRadar(),this.disposeWinds(),this.windNx=t.nx,this.windNy=t.ny,this.windSx=n,this.windSz=i,this.windY=this.groundY+6;const o=To(t.nx,t.ny,t.nz),a=o.nx*o.ny*o.nz*4;this.volumeData=new Uint8Array(new ArrayBuffer(a)),this.volumePrevData=new Uint8Array(new ArrayBuffer(a)),this.volumeTex=this.makeVolumeTexture(this.volumeData,o.nx,o.ny,o.nz),this.volumePrevTex=this.makeVolumeTexture(this.volumePrevData,o.nx,o.ny,o.nz);const c=Math.min(.012,Math.max(.004,.55/Math.max(o.nz,16))),l=new He({glslVersion:zi,vertexShader:K0,fragmentShader:Z0,uniforms:{uVolume:{value:this.volumeTex},uVolumePrev:{value:this.volumePrevTex},uFade:{value:1},uCameraPos:{value:new B},uStep:{value:c},uSunWorld:{value:this.sunDir.clone()},uScale:{value:new B(n,e,i)},uFlashLocal:{value:new B(0,-2,0)},uFlash:{value:0}},transparent:!0,blending:sn,depthWrite:!1,depthTest:!1,side:ge,fog:!1}),u=new On(1,1,1);this.volumeMesh=new me(u,l),this.volumeMesh.scale.set(n,e,i),this.volumeMesh.frustumCulled=!1,this.volumeMesh.visible=this.cloudsOn,this.cloudScene.add(this.volumeMesh),this.volumeClear=!1,this.lastVolumeMs=0,this.volNx=o.nx,this.volNy=o.ny,this.volNz=o.nz,this.radarNx=t.nx,this.radarNy=t.ny,this.radarData=new Uint8Array(new ArrayBuffer(t.nx*t.ny*4)),this.radarTex=new xc(this.radarData,t.nx,t.ny,we,Ne),this.radarTex.minFilter=xe,this.radarTex.magFilter=xe,this.radarTex.flipY=!0,this.radarTex.needsUpdate=!0,"colorSpace"in this.radarTex&&(this.radarTex.colorSpace=qe);const p=new Ho({map:this.radarTex,transparent:!0,depthWrite:!1,side:We}),d=new Un(1,1);this.radarMesh=new me(d,p),this.radarMesh.rotation.x=-Math.PI/2,this.radarMesh.position.y=this.groundY+4,this.radarMesh.scale.set(n,i,1),this.radarMesh.visible=!1,this.radarMesh.frustumCulled=!1,this.scene.add(this.radarMesh),this.spawnPlayer(),this.resize()}rebuildKmGrid(t,e){this.kmGrid&&(this.scene.remove(this.kmGrid),this.kmGrid.geometry.dispose(),this.kmGrid.material.dispose(),this.kmGrid=null);const n=Math.max(t,e),i=Math.max(4,Math.round(n/5e3));this.kmGrid=new $0(n,i,9420698,4155980),this.kmGrid.position.y=this.groundY+1.5,this.scene.add(this.kmGrid)}updateVolume(t,e=0,n=0,i=!1){if(!this.volumeData||!this.volumeTex||!this.volumePrevData||!this.volumePrevTex)return;const r=e<1e-6&&n<1e-6,o=performance.now();if(!(!i&&(r&&this.volumeClear||o-this.lastVolumeMs<125))&&(this.volumePrevData.set(this.volumeData),this.volumePrevTex.needsUpdate=!0,this.lastVolumeMs=o,r?(this.volumeData.fill(0),this.volumeClear=!0):(t(this.volumeData),this.shapeVolume(this.volumeData,this.volNx,this.volNy,this.volNz),this.volumeClear=!1),this.volumeTex.needsUpdate=!0,!this.warnedEmpty&&!r)){let a=0;for(let c=3;c<this.volumeData.length;c+=4)this.volumeData[c]>a&&(a=this.volumeData[c]);a===0&&(console.warn("Stormforge: cloudMax > 0 but packed volume alpha is 0 — check pack gains."),this.warnedEmpty=!0)}}shapeVolume(t,e,n,i){if(e<2||n<2||i<2)return;const r=e*n*i;(!this.cloudScratch||this.cloudScratch.length<r)&&(this.cloudScratch=new Uint8Array(r),this.cloudScratchB=new Uint8Array(r));const o=this.cloudScratch,a=this.cloudScratchB,c=(d,h,g)=>d+e*(h+n*g),l=[1,2,4,7,4,2,1];for(let d=0;d<i;d++)for(let h=0;h<n;h++)for(let g=0;g<e;g++){let v=0,m=0;for(let f=-3;f<=3;f++){const _=d+f;if(_<0||_>=i)continue;const M=l[f+3];v+=t[c(g,h,_)*4]*M,m+=M}o[c(g,h,d)]=v/m+.5|0}for(let d=0;d<i;d++)for(let h=0;h<n;h++)for(let g=0;g<e;g++){let v=o[c(g,h,d)]*4,m=4;g>0&&(v+=o[c(g-1,h,d)]*2,m+=2),g>1&&(v+=o[c(g-2,h,d)],m++),g+1<e&&(v+=o[c(g+1,h,d)]*2,m+=2),g+2<e&&(v+=o[c(g+2,h,d)],m++),a[c(g,h,d)]=v/m+.5|0}for(let d=0;d<i;d++)for(let h=0;h<n;h++)for(let g=0;g<e;g++){let v=a[c(g,h,d)]*4,m=4;h>0&&(v+=a[c(g,h-1,d)]*2,m+=2),h>1&&(v+=a[c(g,h-2,d)],m++),h+1<n&&(v+=a[c(g,h+1,d)]*2,m+=2),h+2<n&&(v+=a[c(g,h+2,d)],m++),t[c(g,h,d)*4]=v/m+.5|0}for(let d=0;d<n;d++)for(let h=0;h<e;h++){let g=0;for(let v=i-1;v>=0;v--){const m=t[c(h,d,v)*4+1];g=m>8?Math.max(m*.8,g*.982):g*.965,t[c(h,d,v)*4+2]=Math.min(255,g)|0}}const u=[1,3,5,3,1];for(let d=0;d<i;d++)for(let h=0;h<n;h++)for(let g=0;g<e;g++){let v=0,m=0;for(let f=-2;f<=2;f++){const _=d+f;if(_<0||_>=i)continue;const M=u[f+2];v+=t[c(g,h,_)*4+2]*M,m+=M}a[c(g,h,d)]=v/m+.5|0}for(let d=0;d<i;d++)for(let h=0;h<n;h++)for(let g=0;g<e;g++)t[c(g,h,d)*4+2]=a[c(g,h,d)];for(let d=0;d<i;d++)for(let h=0;h<n;h++)for(let g=0;g<e;g++){let v=t[c(g,h,d)*4+2]*2,m=2;g>0&&(v+=t[c(g-1,h,d)*4+2],m++),g+1<e&&(v+=t[c(g+1,h,d)*4+2],m++),h>0&&(v+=t[c(g,h-1,d)*4+2],m++),h+1<n&&(v+=t[c(g,h+1,d)*4+2],m++),o[c(g,h,d)]=v/m+.5|0}const p=Math.max(1,i*.12|0);for(let d=0;d<=p;d++){const h=d===0?2:1,g=d===0?.72:.55;for(let v=0;v<n;v++)for(let m=0;m<e;m++){let f=0;for(let M=-h;M<=h;M++){const x=v+M;if(!(x<0||x>=n))for(let A=-h;A<=h;A++){const w=m+A;if(w<0||w>=e)continue;const T=o[c(w,x,d)];T>f&&(f=T)}}const _=o[c(m,v,d)];a[c(m,v,d)]=Math.max(_,f*g|0)}}for(let d=0;d<i;d++)for(let h=0;h<n;h++)for(let g=0;g<e;g++){const v=c(g,h,d);t[v*4+2]=d<=p?a[v]:o[v]}}updateRadar(t){!this.radarData||!this.radarTex||(t(this.radarData),this.radarTex.needsUpdate=!0)}updateWinds(t){if(this.windNx<1||t.length===0){this.windMesh&&(this.windMesh.visible=!1);return}if(!this.windMesh||this.windMesh.count<t.length){this.disposeWinds();const u=ig(),p=new ml({color:16769162,emissive:3811856,emissiveIntensity:.35,roughness:.55,metalness:.05});this.windMesh=new H0(u,p,t.length),this.windMesh.frustumCulled=!1,this.windMesh.visible=this.windVisible,this.scene.add(this.windMesh)}const e=this.windNx,n=this.windNy,i=this.windSx,r=this.windSz,o=Sc(t),a=Math.min(i/e,r/n)*.85,c=this.windDummy,l=this.windMesh;for(let u=0;u<t.length;u++){const p=t[u],d=((p.i+.5)/e-.5)*i,h=-((p.j+.5)/n-.5)*r,g=a*(.35+.65*Math.min(1,p.spd/Math.max(.001,o)));c.position.set(d,this.windY,h),c.rotation.set(0,Math.atan2(p.v,p.u||1e-6),0);const v=Math.min(18,Math.max(4,a*.04));c.scale.set(Math.max(g,a*.2),v,v),c.updateMatrix(),l.setMatrixAt(u,c.matrix)}for(let u=t.length;u<l.count;u++)c.position.set(0,-10,0),c.scale.set(0,0,0),c.updateMatrix(),l.setMatrixAt(u,c.matrix);l.instanceMatrix.needsUpdate=!0,l.visible=this.windVisible}render(){var e;if((this.renderer.domElement.width<2||this.renderer.domElement.height<2)&&this.resize(),this.sky.position.copy(this.camera.position),this.sky.scale.setScalar(this.camera.far*.9),this.renderer.setRenderTarget(null),this.renderer.autoClear=!0,this.renderer.render(this.scene,this.camera),this.cloudsOn&&((e=this.volumeMesh)==null?void 0:e.visible)&&this.cloudTarget&&this.volumeMesh&&this.cloudTarget){const n=this.volumeMesh.material;n.uniforms.uCameraPos.value.copy(this.volumeMesh.worldToLocal(this.camera.position.clone())),n.uniforms.uSunWorld.value.copy(this.sunDir),n.uniforms.uScale.value.set(this.spanX,this.spanY,this.spanZ);const i=Math.min(1,(performance.now()-this.lastVolumeMs)/125);n.uniforms.uFade.value=this.lastVolumeMs>0?i:1,this.applyFlashUniforms(n),this.renderer.getClearColor(this.clearScratch);const r=this.renderer.getClearAlpha();this.renderer.setRenderTarget(this.cloudTarget),this.renderer.setClearColor(0,0),this.renderer.clear(!0,!1,!1),this.renderer.render(this.cloudScene,this.camera),this.renderer.setRenderTarget(null),this.renderer.setClearColor(this.clearScratch,r),this.blitMesh.visible=!0}else this.blitMesh.visible=!1;this.blitMesh.visible&&(this.renderer.autoClear=!1,this.renderer.render(this.overlay,this.overlayCam),this.renderer.autoClear=!0)}addLightning(t){this.liveBolts.unshift({...t,age:0,life:.45,seed:Math.random()*20}),this.liveBolts.length>3&&(this.liveBolts.length=3)}clearLightning(){this.liveBolts.length=0,this.syncBoltVisuals()}tickLightning(t){if(t>0){for(const e of this.liveBolts)e.age+=t;this.liveBolts=this.liveBolts.filter(e=>e.age<e.life)}this.syncBoltVisuals()}lightningMarks(){return this.liveBolts.map(t=>({i:t.i,j:t.j,alpha:Math.max(0,1-t.age/t.life)}))}syncBoltVisuals(){for(let t=0;t<3;t++){const e=this.liveBolts[t],n=this.flashLights[t],i=this.boltLines[t];if(!e||!n||!i){n&&(n.intensity=0),i&&(i.visible=!1);continue}const r=Math.max(0,1-e.age/e.life),o=r*r;n.position.set(e.x,e.y-600,e.z),n.intensity=6e6*o;const a=i.geometry.getAttribute("position");let c=e.x,l=e.y,u=e.z;for(let d=0;d<6;d++)a.setXYZ(d,c,l,u),c+=Math.sin(e.seed+d*2.17)*90,u+=Math.cos(e.seed*1.3+d)*90,l-=240;a.needsUpdate=!0;const p=i.material;p.opacity=r,i.visible=r>.04}}applyFlashUniforms(t){const e=this.liveBolts[0];if(!e||!this.volumeMesh){t.uniforms.uFlash.value=0;return}const n=Math.max(0,1-e.age/e.life);t.uniforms.uFlash.value=n*n;const i=this.volumeMesh.worldToLocal(new B(e.x,e.y,e.z));t.uniforms.uFlashLocal.value.copy(i)}makeVolumeTexture(t,e,n,i){const r=new ic(t,e,n,i);return r.format=we,r.type=Ne,r.minFilter=Ee,r.magFilter=Ee,r.unpackAlignment=1,r.flipY=!1,"colorSpace"in r&&(r.colorSpace=qe),r.needsUpdate=!0,r}disposeRadar(){this.radarMesh&&(this.scene.remove(this.radarMesh),this.radarMesh.geometry.dispose(),this.radarMesh.material.dispose(),this.radarMesh=null),this.radarTex&&(this.radarTex.dispose(),this.radarTex=null),this.radarData=null,this.radarNx=0,this.radarNy=0}disposeWinds(){this.windMesh&&(this.scene.remove(this.windMesh),this.windMesh.geometry.dispose(),this.windMesh.material.dispose(),this.windMesh=null)}dispose(){var t,e,n;(t=this.ro)==null||t.disconnect(),this.ro=null,this.disposeRadar(),this.disposeWinds(),this.volumeMesh&&(this.cloudScene.remove(this.volumeMesh),this.volumeMesh.geometry.dispose(),this.volumeMesh.material.dispose(),this.volumeMesh=null),(e=this.cloudTarget)==null||e.dispose(),this.cloudTarget=null,this.sky.geometry.dispose(),this.sky.material.dispose(),this.blitMesh.geometry.dispose(),this.blitMesh.material.dispose(),this.volumeTex&&(this.volumeTex.dispose(),this.volumeTex=null),this.volumePrevTex&&(this.volumePrevTex.dispose(),this.volumePrevTex=null),this.volumePrevData=null,this.kmGrid&&(this.scene.remove(this.kmGrid),this.kmGrid.geometry.dispose(),this.kmGrid.material.dispose(),this.kmGrid=null),(n=this.unbindLook)==null||n.call(this),this.unbindLook=null,this.renderer.dispose(),this.renderer.domElement.parentElement===this.container&&this.container.removeChild(this.renderer.domElement)}}function ig(){const s=new $s(.045,.045,.62,5);s.rotateZ(-Math.PI/2),s.translate(.31,0,0);const t=new qo(.13,.38,6);t.rotateZ(-Math.PI/2),t.translate(.81,0,0);const e=s.attributes.position.array,n=t.attributes.position.array,i=s.attributes.normal.array,r=t.attributes.normal.array,o=s.index.array,a=t.index.array,c=e.length/3,l=new Float32Array(e.length+n.length),u=new Float32Array(i.length+r.length);l.set(e,0),l.set(n,e.length),u.set(i,0),u.set(r,i.length);const p=new Uint32Array(o.length+a.length);p.set(o,0);for(let h=0;h<a.length;h++)p[o.length+h]=a[h]+c;const d=new Te;return d.setAttribute("position",new Me(l,3)),d.setAttribute("normal",new Me(u,3)),d.setIndex(new Me(p,1)),s.dispose(),t.dispose(),d}class sg{constructor(t){L(this,"root");L(this,"canvas");L(this,"ctx");L(this,"titleEl");L(this,"unitsEl");L(this,"legendBar");L(this,"legendTicks");L(this,"tabsEl");L(this,"image",null);L(this,"nx",0);L(this,"ny",0);L(this,"product","refl");L(this,"onProductChange",null);L(this,"ro",null);L(this,"recordedOnly",!1);L(this,"windsVisible",!1);L(this,"windSamples",[]);L(this,"lightning",[]);L(this,"blitCanvas",null);L(this,"blitCtx",null);this.root=document.createElement("div"),this.root.className="radar2d-panel hidden",this.root.innerHTML=`
      <div class="radar2d-frame">
        <div class="map2d-tabs" id="map2d-tabs">
          <button type="button" data-product="refl" class="active">Reflectivity</button>
          <button type="button" data-product="doppler">Doppler</button>
          <button type="button" data-product="cape">CAPE</button>
          <button type="button" data-product="cin">CIN</button>
          <button type="button" data-product="tsfc">Surface T</button>
          <button type="button" data-product="td">Dewpoint</button>
          <button type="button" data-product="wspd">Wind</button>
          <button type="button" data-product="psfc">Pressure</button>
          <button type="button" data-product="ltg">Lightning</button>
        </div>
        <div class="radar2d-canvas-wrap">
          <canvas id="radar2d-canvas"></canvas>
          <div class="map2d-compass" aria-hidden="true">
            <span class="n">N</span>
            <span class="e">E</span>
            <span class="s">S</span>
            <span class="w">W</span>
          </div>
        </div>
        <div class="radar2d-meta">
          <span class="radar2d-title">Column-max reflectivity</span>
          <span class="radar2d-units">dBZ</span>
        </div>
        <div class="radar2d-legend">
          <div class="radar-legend-bar"></div>
          <div class="radar-legend-ticks"><span>5</span><span>30</span><span>50</span><span>70</span></div>
        </div>
      </div>
    `,t.appendChild(this.root),this.canvas=this.root.querySelector("canvas"),this.ctx=this.canvas.getContext("2d",{alpha:!1}),this.ctx.imageSmoothingEnabled=!1,this.titleEl=this.root.querySelector(".radar2d-title"),this.unitsEl=this.root.querySelector(".radar2d-units"),this.legendBar=this.root.querySelector(".radar-legend-bar"),this.legendTicks=this.root.querySelector(".radar-legend-ticks"),this.tabsEl=this.root.querySelector("#map2d-tabs"),this.tabsEl.addEventListener("click",e=>{var r;const n=e.target.closest("button[data-product]");if(!n||n.disabled)return;const i=n.dataset.product;this.setProduct(i),(r=this.onProductChange)==null||r.call(this,i)}),this.applyMeta(aa.refl),this.ro=new ResizeObserver(()=>this.layout()),this.ro.observe(this.root)}setOnProductChange(t){this.onProductChange=t}setProduct(t){const e=this.recordedOnly&&t!=="refl"?"refl":t;this.product=e,this.applyMeta(aa[e]);for(const n of this.tabsEl.querySelectorAll("button"))n.classList.toggle("active",n.getAttribute("data-product")===e)}getProduct(){return this.product}setRecordedOnly(t){this.recordedOnly=t;for(const e of this.tabsEl.querySelectorAll("button")){const n=e.getAttribute("data-product"),i=!t||n==="refl";e.disabled=!i,e.title=i?"":"Not recorded in batch review (reflectivity only)"}t&&this.setProduct("refl")}applyMeta(t){this.titleEl.textContent=t.title,this.unitsEl.textContent=t.units,this.legendBar.style.background=t.legendCss,this.legendTicks.innerHTML=t.ticks.map(e=>`<span>${e}</span>`).join("")}setVisible(t){this.root.classList.toggle("hidden",!t),t&&this.layout()}setWindsVisible(t){this.windsVisible=t,this.draw()}updateWinds(t){this.windSamples=t,this.draw()}setGrid(t,e){this.nx=Math.max(1,t),this.ny=Math.max(1,e),this.image=new ImageData(this.nx,this.ny),this.windSamples=[],this.layout()}update(t){!this.image||this.nx<1||(t(this.image.data),this.draw())}layout(){if(this.root.classList.contains("hidden"))return;const t=this.root.querySelector(".radar2d-frame"),e=Math.max(1,t.clientWidth),n=Math.max(1,t.clientHeight-96);if(this.nx<1||this.ny<1)return;const i=this.nx/this.ny;let r=e,o=e/i;o>n&&(o=n,r=n*i);const a=Math.min(window.devicePixelRatio||1,2);this.canvas.style.width=`${r}px`,this.canvas.style.height=`${o}px`,this.canvas.width=Math.max(1,Math.floor(r*a)),this.canvas.height=Math.max(1,Math.floor(o*a)),this.ctx.imageSmoothingEnabled=!1,this.draw()}blitTarget(){return(!this.blitCanvas||!this.blitCtx||this.blitCanvas.width!==this.nx||this.blitCanvas.height!==this.ny)&&(this.blitCanvas=document.createElement("canvas"),this.blitCanvas.width=this.nx,this.blitCanvas.height=this.ny,this.blitCtx=this.blitCanvas.getContext("2d")),this.blitCtx}draw(){if(!this.image)return;this.blitTarget().putImageData(this.image,0,0),this.ctx.fillStyle="#0a101c",this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height),this.ctx.imageSmoothingEnabled=!1,this.ctx.drawImage(this.blitCanvas,0,0,this.nx,this.ny,0,0,this.canvas.width,this.canvas.height),this.windsVisible&&this.windSamples.length>0&&this.drawWindArrows(),this.lightning.length>0&&this.drawLightning()}setLightning(t){this.lightning=t,this.root.classList.contains("hidden")||this.draw()}drawLightning(){const{nx:t,ny:e}=this,n=this.canvas.width,i=this.canvas.height,r=this.ctx;for(const o of this.lightning){const a=(o.i+.5)/t*n,c=(e-1-o.j+.5)/e*i,l=Math.max(7,Math.min(n,i)/e*.55);r.save(),r.translate(a,c),r.scale(l/10,l/10),r.beginPath(),r.moveTo(0,-9),r.lineTo(-4.2,-1.2),r.lineTo(.6,-1.6),r.lineTo(-1.4,9),r.lineTo(4.4,.4),r.lineTo(-.4,.8),r.closePath(),r.fillStyle=`rgba(255, 236, 160, ${Math.max(0,Math.min(1,o.alpha))})`,r.strokeStyle=`rgba(40, 30, 8, ${Math.max(0,Math.min(1,o.alpha))*.85})`,r.lineWidth=1.2,r.fill(),r.stroke(),r.restore()}}drawWindArrows(){const{nx:t,ny:e}=this,n=this.canvas.width,i=this.canvas.height,r=Sc(this.windSamples),o=Math.min(n/t,i/e),a=o*2.2;this.ctx.save(),this.ctx.lineCap="round",this.ctx.lineJoin="round",this.ctx.strokeStyle="rgba(255, 224, 138, 0.92)",this.ctx.fillStyle="rgba(255, 224, 138, 0.92)";for(const c of this.windSamples){const l=(c.i+.5)/t*n,u=(e-1-c.j+.5)/e*i,p=a*(.3+.7*Math.min(1,c.spd/Math.max(.001,r))),d=Math.atan2(-c.v,c.u),h=l+Math.cos(d)*p,g=u+Math.sin(d)*p,v=Math.max(4,p*.38),m=d+Math.PI;this.ctx.lineWidth=Math.max(1.25,o*.12),this.ctx.beginPath(),this.ctx.moveTo(l,u),this.ctx.lineTo(h,g),this.ctx.stroke(),this.ctx.beginPath(),this.ctx.moveTo(h,g),this.ctx.lineTo(h+Math.cos(m+.4)*v,g+Math.sin(m+.4)*v),this.ctx.lineTo(h+Math.cos(m-.4)*v,g+Math.sin(m-.4)*v),this.ctx.closePath(),this.ctx.fill()}this.ctx.restore()}dispose(){var t;(t=this.ro)==null||t.disconnect(),this.ro=null,this.root.remove()}}const _l=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];class rg{constructor(t){L(this,"setup");L(this,"simScreen");L(this,"viewport");L(this,"statsEl");L(this,"importBox");L(this,"importText");L(this,"skewtCanvas",null);L(this,"hodoCanvas",null);L(this,"modeTabs",null);L(this,"panelTitle",null);L(this,"panelDesc",null);L(this,"renderer",null);L(this,"radar2d",null);L(this,"solver",null);L(this,"skewt",null);L(this,"hodo",null);L(this,"sounding",vn(12e3,41));L(this,"panelView","skewt");L(this,"bubbleStrength",3);L(this,"paused",!1);L(this,"clockPaused",!1);L(this,"raf",0);L(this,"lastTs",0);L(this,"runName","Stormforge Run");L(this,"scrubbingSolar",!1);L(this,"showClouds",!0);L(this,"showRadar3d",!1);L(this,"showRadar2d",!1);L(this,"showSurfaceWinds",!1);L(this,"mapProduct","refl");L(this,"mapBucket",-1);L(this,"mapPackedProduct",null);L(this,"sessionMode","live");L(this,"frameStore",null);L(this,"playbackIndex",0);L(this,"playbackPlaying",!1);L(this,"playbackSpeed",1);L(this,"simSpeed",40);L(this,"outputIntervalSec",5);L(this,"batchCancel",!1);L(this,"pendingSetup",null);L(this,"synoptic",Hi());L(this,"playbackAccumMs",0);L(this,"loop",t=>{this.raf=requestAnimationFrame(this.loop);const e=Math.min(50,t-this.lastTs);if(this.lastTs=t,this.sessionMode==="batching")return;if(this.sessionMode==="playback"){if(this.playbackPlaying&&this.frameStore&&this.frameStore.length>1){const i=this.outputIntervalSec*1e3/this.playbackSpeed;for(this.playbackAccumMs+=e;this.playbackAccumMs>=i;)this.playbackAccumMs-=i,this.playbackIndex>=this.frameStore.length-1?this.playbackIndex=0:this.playbackIndex+=1,this.showPlaybackFrame(this.playbackIndex)}else this.renderer&&!this.showRadar2d&&this.renderer.render();return}const n=Math.min(.05,Math.max(0,e)/1e3);if(this.solver&&!this.paused&&this.solver.step(Math.max(1e-4,n*this.simSpeed)),this.solver&&this.renderer){this.syncLightning(n);const i=this.solver.cloudRainStats();if(this.showRadar2d&&this.radar2d){const r=this.radar2d.getProduct();this.mapProduct=r,this.mapRefreshDue(r)&&(this.radar2d.update(o=>this.solver.packMapProduct(r,o)),this.markMapPacked(r),this.pushSurfaceWinds())}else this.renderer.setVolumeVisible(this.showClouds),this.renderer.setRadarVisible(this.showRadar3d),this.renderer.setWindsVisible(this.showSurfaceWinds),this.showClouds&&this.renderer.updateVolume(r=>this.solver.packVolumeRGBA(r),i.cloudMax,i.rainMax),this.showRadar3d&&this.mapRefreshDue("refl")&&(this.renderer.updateRadar(r=>this.solver.packRadarComposite(r)),this.markMapPacked("refl")),this.pushSurfaceWinds(),this.renderer.render();this.updateStatsLine(!1),this.syncSunUi(!0),this.refreshPlayerHud()}});this.host=t,this.host.innerHTML="",this.setup=new lh(e=>this.startRun(e)),this.host.appendChild(this.setup.root),this.simScreen=document.createElement("div"),this.simScreen.id="sim-screen",this.simScreen.className="screen",this.simScreen.innerHTML=`
      <div class="sim-body">
        <div id="viewport">
          <button type="button" id="btn-sim-menu" class="corner-menu-btn" aria-expanded="false" aria-controls="sim-menu">Menu</button>
          <div id="sim-menu" class="sim-menu hidden">
            <div class="sim-menu-head">
              <span class="brand">Stormforge</span>
              <button type="button" id="btn-sim-menu-close">Close</button>
            </div>
            <span class="stats" id="sim-stats">—</span>
            <div class="sim-menu-actions">
              <button id="btn-pause" title="Pause / resume simulation time (Space)">Pause</button>
              <button id="btn-bubble">Respawn bubble</button>
              <button id="btn-reset">Reset</button>
              <button id="btn-menu">Main menu</button>
              <button id="btn-clouds" class="active" title="3D cloud volume (turn off to reduce lag)">Clouds</button>
              <button id="btn-radar3d" title="Radar plane in the 3D view">Radar 3D</button>
              <button id="btn-radar2d" title="2D maps: Reflectivity, Doppler, CAPE, Surface T">Maps 2D</button>
              <button id="btn-winds" title="Surface wind direction arrows (overlay on 3D or Maps 2D)">Winds</button>
              <button id="btn-teleport" title="Open the map and click to move">Teleport</button>
            </div>
            <label class="sim-speed">
              Simulation speed
              <select id="sim-speed">
                <option value="1">Realtime</option>
                <option value="5">5×</option>
                <option value="15">15×</option>
                <option value="40" selected>40×</option>
              </select>
            </label>
            <p class="hint sim-speed-note">Lightning runs in realtime only.</p>
            <div class="sun-controls">
              <span id="sun-clock" class="sun-clock">12:00 · day</span>
              <div id="sun-panel" class="sun-panel">
                <label>
                  Hour
                  <input id="live-hour" type="range" min="0" max="23.75" step="0.25" value="12" />
                  <span id="live-hour-val">12:00</span>
                </label>
                <label>
                  Latitude
                  <input id="live-lat" type="range" min="-60" max="60" step="1" value="35" />
                  <span id="live-lat-val">35°</span>
                </label>
                <label>
                  Month
                  <input id="live-month" type="range" min="1" max="12" step="1" value="6" />
                  <span id="live-month-val">Jun</span>
                </label>
                <label>
                  Day length
                  <input id="live-daylen" type="range" min="1" max="10" step="1" value="3" />
                  <span id="live-daylen-val">~3m</span>
                </label>
                <label class="pause-time-label">
                  <input id="live-pause" type="checkbox" />
                  Pause clock / sun
                </label>
              </div>
            </div>
          </div>
          <div class="viewport-hint" id="viewport-hint">
            <span id="look-hint">Drag to look · scroll to zoom</span>
            <span id="player-where">0.0 km E · 0.0 km N · 2 m</span>
          </div>
          <div class="crosshair" id="view-crosshair" aria-hidden="true"></div>
          <div id="teleport-panel" class="teleport-panel hidden">
            <div class="teleport-card">
              <h3>Teleport</h3>
              <p class="hint">Click the map. North is up. You stay facing the way you were looking.</p>
              <canvas id="teleport-map" width="280" height="280"></canvas>
              <label class="teleport-alt">
                Altitude
                <input id="teleport-alt" type="range" min="2" max="12000" step="10" value="2" />
                <span id="teleport-alt-val">2 m</span>
              </label>
              <p class="hint" id="teleport-where">Center · 2 m</p>
            </div>
          </div>
          <div id="radar-legend" class="radar-legend hidden" aria-hidden="true">
            <div class="radar-legend-title">dBZ</div>
            <div class="radar-legend-bar"></div>
            <div class="radar-legend-ticks"><span>5</span><span>30</span><span>50</span><span>70</span></div>
          </div>
          <div id="batch-overlay" class="batch-overlay hidden" aria-live="polite">
            <div class="batch-overlay-card">
              <h3>Batch run</h3>
              <p id="batch-status">Preparing…</p>
              <div class="batch-progress-track">
                <div id="batch-progress-bar" class="batch-progress-bar"></div>
              </div>
              <p id="batch-progress-meta" class="hint">—</p>
              <button type="button" id="btn-batch-cancel">Cancel</button>
            </div>
          </div>
          <div id="playback-bar" class="playback-bar hidden">
            <button type="button" id="btn-playback-play">Play</button>
            <input id="playback-scrub" type="range" min="0" max="0" step="1" value="0" />
            <select id="playback-speed" title="Playback speed">
              <option value="0.5">0.5×</option>
              <option value="1" selected>1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>
            <span id="playback-meta" class="playback-meta">frame 0/0</span>
          </div>
        </div>
        <aside class="side-panel">
          <h2 id="panel-title">Skew-T</h2>
          <p class="panel-desc" id="panel-desc">Orange = T, green = Td. Wind barbs are readout — use Hodograph to edit wind.</p>
          <div class="panel-toggle">
            <button id="view-skewt" class="active">Skew-T</button>
            <button id="view-hodo">Hodograph</button>
          </div>
          <div class="mode-tabs" id="mode-tabs">
            <button id="mode-t" class="active">T</button>
            <button id="mode-td">Td</button>
          </div>
          <canvas id="skewt-canvas"></canvas>
          <div id="skewt-metrics" class="skewt-metrics"></div>
          <canvas id="hodo-canvas" class="hidden"></canvas>
          <div class="panel-actions">
            <button id="btn-apply" class="primary">Apply sounding</button>
            <button id="btn-export">Export</button>
            <button id="btn-import">Import</button>
            <button id="btn-default">Default</button>
          </div>
          <div id="import-box">
            <textarea id="import-text" placeholder="Paste SHARPpy %RAW%, Extra CSV, SPC/UWYO, CM1 input_sounding, or Stormforge CSV…"></textarea>
            <div class="import-row">
              <button id="btn-import-go" class="primary">Load &amp; apply</button>
              <label class="file-btn">
                Open file
                <input id="import-file" type="file" accept="*/*" hidden />
              </label>
            </div>
            <span class="hint" id="import-msg">Formats: SHARPpy · Extra · SPC · CM1 · Stormforge (any filename)</span>
          </div>
        </aside>
      </div>
    `,this.host.appendChild(this.simScreen),this.viewport=this.simScreen.querySelector("#viewport"),this.statsEl=this.simScreen.querySelector("#sim-stats"),this.importBox=this.simScreen.querySelector("#import-box"),this.importText=this.simScreen.querySelector("#import-text"),this.skewtCanvas=this.simScreen.querySelector("#skewt-canvas"),this.hodoCanvas=this.simScreen.querySelector("#hodo-canvas"),this.modeTabs=this.simScreen.querySelector("#mode-tabs"),this.panelTitle=this.simScreen.querySelector("#panel-title"),this.panelDesc=this.simScreen.querySelector("#panel-desc"),this.bindSimUi()}syncSoundingFromEditors(){var t,e;return this.panelView==="hodograph"&&this.hodo?(this.sounding=this.hodo.getLevels(),(t=this.skewt)==null||t.setLevels(this.sounding)):this.skewt&&(this.sounding=this.skewt.getLevels(),(e=this.hodo)==null||e.setLevels(this.sounding)),this.sounding}setPanelView(t){var i,r,o,a,c,l,u,p;this.panelView=t;const e=d=>this.simScreen.querySelector(d);e("#view-skewt").classList.toggle("active",t==="skewt"),e("#view-hodo").classList.toggle("active",t==="hodograph");const n=this.simScreen.querySelector("#skewt-metrics");t==="skewt"?(this.hodo&&(this.sounding=this.hodo.getLevels(),(i=this.skewt)==null||i.setLevels(this.sounding)),(r=this.skewtCanvas)==null||r.classList.remove("hidden"),n==null||n.classList.remove("hidden"),(o=this.hodoCanvas)==null||o.classList.add("hidden"),(a=this.modeTabs)==null||a.classList.remove("hidden"),this.panelTitle&&(this.panelTitle.textContent="Skew-T"),this.panelDesc&&(this.panelDesc.textContent="Orange = T, green = Td. Metrics update as you edit. Wind via Hodograph."),requestAnimationFrame(()=>{var d;return(d=this.skewt)==null?void 0:d.resize()})):(this.skewt&&(this.sounding=this.skewt.getLevels(),(c=this.hodo)==null||c.setLevels(this.sounding)),(l=this.skewtCanvas)==null||l.classList.add("hidden"),n==null||n.classList.add("hidden"),(u=this.hodoCanvas)==null||u.classList.remove("hidden"),(p=this.modeTabs)==null||p.classList.add("hidden"),this.panelTitle&&(this.panelTitle.textContent="Hodograph"),this.panelDesc&&(this.panelDesc.textContent="Pick a height on the left, drag the tip (or scroll for speed). Plot is north-up: tip shows wind toward (+v up, +u right). Apply when done."),requestAnimationFrame(()=>{requestAnimationFrame(()=>{var d;return(d=this.hodo)==null?void 0:d.resize()})}))}setPaused(t){this.paused=t,this.syncPauseButton()}syncPauseButton(){const t=this.simScreen.querySelector("#btn-pause");t&&(this.sessionMode==="playback"?(t.disabled=!1,t.textContent=this.playbackPlaying?"Pause":"Resume",t.classList.toggle("active",!this.playbackPlaying),t.title="Pause / resume playback (Space)"):this.sessionMode==="batching"?(t.textContent="Pause",t.classList.remove("active"),t.disabled=!0,t.title="Batch integrating…"):(t.disabled=!1,t.textContent=this.paused?"Resume":"Pause",t.classList.toggle("active",this.paused),t.title="Pause / resume simulation time (Space)"))}setPlaybackPlaying(t){this.playbackPlaying=t,this.paused=!t;const e=this.simScreen.querySelector("#btn-playback-play");e&&(e.textContent=t?"Pause":"Play",e.classList.toggle("active",t)),this.syncPauseButton()}syncSessionControls(){var a,c,l,u,p,d;const t=this.sessionMode==="playback",e=this.sessionMode==="batching",n=t||e;for(const h of["#btn-bubble","#btn-reset","#btn-apply","#btn-import","#btn-import-go","#btn-default"]){const g=this.simScreen.querySelector(h);g&&(g.disabled=n)}const i=this.simScreen.querySelector("#sun-panel");if(i)for(const h of i.querySelectorAll("input"))h.disabled=n;(a=this.radar2d)==null||a.setRecordedOnly(t),t&&this.showSurfaceWinds&&(this.showSurfaceWinds=!1,(c=this.renderer)==null||c.setWindsVisible(!1),(l=this.radar2d)==null||l.setWindsVisible(!1),(u=this.simScreen.querySelector("#btn-winds"))==null||u.classList.remove("active"));const r=this.simScreen.querySelector("#btn-winds");r&&(r.disabled=t,r.title=t?"Surface winds not recorded in batch review":"Surface wind direction arrows (overlay on 3D or Maps 2D)"),this.viewport.classList.toggle("playback-mode",t),(p=this.simScreen.querySelector("#playback-bar"))==null||p.classList.toggle("hidden",!t),(d=this.simScreen.querySelector("#batch-overlay"))==null||d.classList.toggle("hidden",!e);const o=this.simScreen.querySelector("#look-hint");o&&(t?o.textContent="Scrub the timeline · open Menu for clouds and maps":e?o.textContent="Integrating batch run…":o.textContent="Drag to look · scroll to zoom"),this.syncPauseButton()}setClockPaused(t){this.clockPaused=t,this.solver&&(this.solver.clockPaused=t);const e=this.simScreen.querySelector("#live-pause");e&&(e.checked=t)}bindSimUi(){const t=M=>this.simScreen.querySelector(M);t("#btn-pause").addEventListener("click",()=>{this.sessionMode!=="batching"&&(this.sessionMode==="playback"?this.setPlaybackPlaying(!this.playbackPlaying):this.setPaused(!this.paused))}),t("#live-pause").addEventListener("change",()=>{this.sessionMode==="live"&&this.setClockPaused(t("#live-pause").checked)}),window.addEventListener("keydown",M=>{if(M.code!=="Space"||!this.simScreen.classList.contains("active")||this.sessionMode==="batching")return;const x=M.target;x&&(x.tagName==="INPUT"||x.tagName==="TEXTAREA"||x.tagName==="SELECT"||x.isContentEditable)||(M.preventDefault(),this.sessionMode==="playback"?this.setPlaybackPlaying(!this.playbackPlaying):this.setPaused(!this.paused))}),t("#btn-bubble").addEventListener("click",()=>{this.sessionMode!=="live"||!this.solver||this.solver.respawnBubble({bubbleStrength:this.bubbleStrength})}),t("#btn-reset").addEventListener("click",()=>{if(this.sessionMode!=="live"||!this.solver)return;const M=this.syncSoundingFromEditors();this.solver.reset(M,{bubbleStrength:this.bubbleStrength,synoptic:this.synoptic})}),t("#btn-batch-cancel").addEventListener("click",()=>{this.batchCancel=!0}),t("#btn-playback-play").addEventListener("click",()=>{this.sessionMode==="playback"&&this.setPlaybackPlaying(!this.playbackPlaying)});const e=t("#playback-scrub");e.addEventListener("input",()=>{this.sessionMode==="playback"&&(this.playbackIndex=Number(e.value),this.playbackAccumMs=0,this.showPlaybackFrame(this.playbackIndex))});const n=t("#playback-speed");n.addEventListener("change",()=>{this.playbackSpeed=Number(n.value)||1}),t("#btn-menu").addEventListener("click",()=>{if(this.sessionMode==="batching"){this.batchCancel=!0;const M=this.simScreen.querySelector("#batch-status");M&&(M.textContent="Cancelling…");return}this.returnToMenu()});const i=()=>this.showRadar3d||this.showRadar2d,r=()=>{!this.showClouds&&!i()&&(this.showClouds=!0)},o=()=>{var A,w,T;t("#btn-clouds").classList.toggle("active",this.showClouds),t("#btn-radar3d").classList.toggle("active",this.showRadar3d),t("#btn-radar2d").classList.toggle("active",this.showRadar2d),t("#btn-winds").classList.toggle("active",this.showSurfaceWinds);const M=t("#radar-legend"),x=this.showRadar3d&&!this.showRadar2d;M.classList.toggle("hidden",!x),M.setAttribute("aria-hidden",x?"false":"true"),(A=this.radar2d)==null||A.setVisible(this.showRadar2d),(w=this.renderer)==null||w.setWindsVisible(this.showSurfaceWinds&&!this.showRadar2d),(T=this.radar2d)==null||T.setWindsVisible(this.showSurfaceWinds&&this.showRadar2d)};t("#btn-clouds").addEventListener("click",()=>{this.showClouds=!this.showClouds,r(),o(),this.sessionMode==="playback"&&this.showPlaybackFrame(this.playbackIndex)}),t("#btn-radar3d").addEventListener("click",()=>{this.showRadar3d=!this.showRadar3d,this.showRadar3d&&(this.mapBucket=-1),r(),o(),this.sessionMode==="playback"&&this.showPlaybackFrame(this.playbackIndex)}),t("#btn-radar2d").addEventListener("click",()=>{this.showRadar2d=!this.showRadar2d,this.showRadar2d&&(this.mapBucket=-1),r(),o(),this.sessionMode==="playback"&&this.showPlaybackFrame(this.playbackIndex)}),t("#btn-winds").addEventListener("click",()=>{this.sessionMode==="playback"||this.sessionMode==="batching"||(this.showSurfaceWinds=!this.showSurfaceWinds,o(),this.pushSurfaceWinds())}),this.bindTeleport();const a=t("#sim-menu"),c=t("#btn-sim-menu"),l=M=>{a.classList.toggle("hidden",!M),c.setAttribute("aria-expanded",M?"true":"false")};c.addEventListener("click",()=>{l(a.classList.contains("hidden"))}),t("#btn-sim-menu-close").addEventListener("click",()=>l(!1));const u=t("#sim-speed");u.addEventListener("change",()=>{var x,A;const M=Number(u.value);this.simSpeed=M===1||M===5||M===15||M===40?M:40,this.simSpeed!==1&&((x=this.renderer)==null||x.clearLightning(),(A=this.radar2d)==null||A.setLightning([]))});const p=t("#live-hour"),d=t("#live-lat"),h=t("#live-month"),g=t("#live-daylen"),v=M=>Math.max(2,Math.round(45/Math.max(1,M))),m=()=>{if(!this.solver)return;const M=Number(g.value);this.solver.setRadiation({solarHour:Number(p.value),latitudeDeg:Number(d.value),month:Number(h.value),diurnalSpeed:v(M)}),this.simScreen.querySelector("#live-daylen-val").textContent=`~${M}m`,this.syncSunUi(!1)};p.addEventListener("pointerdown",()=>{this.scrubbingSolar=!0}),p.addEventListener("pointerup",()=>{this.scrubbingSolar=!1}),p.addEventListener("pointerleave",()=>{this.scrubbingSolar=!1}),p.addEventListener("input",m),d.addEventListener("input",m),h.addEventListener("input",m),g.addEventListener("input",m),t("#view-skewt").addEventListener("click",()=>this.setPanelView("skewt")),t("#view-hodo").addEventListener("click",()=>this.setPanelView("hodograph")),t("#mode-t").addEventListener("click",()=>{var M;(M=this.skewt)==null||M.setMode("T"),t("#mode-t").classList.add("active"),t("#mode-td").classList.remove("active")}),t("#mode-td").addEventListener("click",()=>{var M;(M=this.skewt)==null||M.setMode("Td"),t("#mode-td").classList.add("active"),t("#mode-t").classList.remove("active")}),t("#btn-apply").addEventListener("click",()=>{if(this.sessionMode!=="live"||!this.solver)return;const M=this.syncSoundingFromEditors();this.solver.reset(M,{bubbleStrength:this.bubbleStrength,synoptic:this.synoptic})}),t("#btn-export").addEventListener("click",()=>{var w;this.syncSoundingFromEditors();const M=((w=this.skewt)==null?void 0:w.exportText())??["alt_m,p_hPa,t_C,td_C,u,v"].concat(this.sounding.map(T=>[T.z.toFixed(1),(T.p/100).toFixed(2),(T.T-273.15).toFixed(2),(T.Td-273.15).toFixed(2),T.u.toFixed(2),T.v.toFixed(2)].join(","))).join(`
`),x=new Blob([M],{type:"text/plain"}),A=document.createElement("a");A.href=URL.createObjectURL(x),A.download="stormforge_sounding.txt",A.click(),URL.revokeObjectURL(A.href)}),t("#btn-import").addEventListener("click",()=>{if(this.importBox.classList.toggle("visible"),this.importBox.classList.contains("visible")){const M=this.simScreen.querySelector(".side-panel");M==null||M.scrollTo({top:M.scrollHeight,behavior:"smooth"}),this.importText.focus()}});const f=M=>{var w;const x=t("#import-msg");if(!M.trim()){x.textContent="Paste sounding text or open a file first.",x.style.color="var(--danger)";return}if(!this.skewt){x.textContent="Start a simulation before importing.",x.style.color="var(--danger)";return}this.setPanelView("skewt");const A=this.skewt.importText(M);x.textContent=A.message,x.style.color=A.ok?"var(--ok)":"var(--danger)",A.ok&&(this.sounding=this.skewt.getLevels(),(w=this.hodo)==null||w.setLevels(this.sounding),this.solver&&this.sessionMode==="live"?(this.solver.reset(this.sounding,{bubbleStrength:this.bubbleStrength,synoptic:this.synoptic}),x.textContent=`${A.message} Loaded into Skew-T and applied to the sim.`):A.ok&&(x.textContent=`${A.message} (review mode — not applied to physics)`))};t("#btn-import-go").addEventListener("click",()=>{f(this.importText.value)});const _=this.simScreen.querySelector("#import-file");_==null||_.addEventListener("change",()=>{var A;const M=(A=_.files)==null?void 0:A[0];if(!M)return;const x=new FileReader;x.onload=()=>{const w=String(x.result??"");this.importText.value=w,f(w),_.value=""},x.readAsText(M)}),t("#btn-default").addEventListener("click",()=>{var M,x;(M=this.skewt)==null||M.resetDefault(),this.skewt&&(this.sounding=this.skewt.getLevels(),(x=this.hodo)==null||x.setLevels(this.sounding))})}bindTeleport(){const t=this.simScreen.querySelector("#teleport-panel"),e=this.simScreen.querySelector("#teleport-map"),n=this.simScreen.querySelector("#teleport-alt"),i=this.simScreen.querySelector("#teleport-alt-val"),r=this.simScreen.querySelector("#btn-teleport");r.addEventListener("click",()=>{const o=t.classList.toggle("hidden")===!1;if(r.classList.toggle("active",o),!o||!this.renderer)return;const a=this.renderer.playerState();n.value=String(Math.round(a.altitudeM)),i.textContent=`${Math.round(a.altitudeM)} m`,this.drawTeleportMap(),this.refreshPlayerHud()}),n.addEventListener("input",()=>{if(i.textContent=`${n.value} m`,!this.renderer)return;const o=this.renderer.playerState();this.renderer.teleportTo(o.xn,o.yn,Number(n.value)),this.drawTeleportMap(),this.refreshPlayerHud()}),e.addEventListener("click",o=>{if(!this.renderer)return;const a=e.getBoundingClientRect(),c=(o.clientX-a.left)/Math.max(1,a.width),l=1-(o.clientY-a.top)/Math.max(1,a.height);this.renderer.teleportTo(c,l,Number(n.value)),this.drawTeleportMap(),this.refreshPlayerHud()})}drawTeleportMap(){const t=this.simScreen.querySelector("#teleport-map"),e=t==null?void 0:t.getContext("2d");if(!t||!e||!this.renderer)return;const n=t.width,i=t.height;e.clearRect(0,0,n,i),e.fillStyle="#1d4a30",e.fillRect(0,0,n,i),e.strokeStyle="rgba(190, 230, 200, 0.28)",e.lineWidth=1;for(let o=1;o<8;o++){const a=o/8*n,c=o/8*i;e.beginPath(),e.moveTo(a,0),e.lineTo(a,i),e.moveTo(0,c),e.lineTo(n,c),e.stroke()}e.strokeStyle="#e4f2e8",e.strokeRect(1,1,n-2,i-2),e.fillStyle="#e8eef8",e.font="12px Segoe UI, sans-serif",e.textAlign="center",e.textBaseline="top",e.fillText("N",n/2,6),e.textBaseline="bottom",e.fillText("S",n/2,i-4),e.textBaseline="middle",e.textAlign="left",e.fillText("E",n-16,i/2),e.textAlign="right",e.fillText("W",16,i/2);const r=this.renderer.playerState();e.fillStyle="#ffd36a",e.beginPath(),e.arc(r.xn*n,(1-r.yn)*i,5,0,Math.PI*2),e.fill(),e.lineWidth=1.5,e.strokeStyle="#1a1408",e.stroke()}refreshPlayerHud(){var c;if(!this.renderer)return;const t=this.renderer.playerState(),e=t.eastM/1e3,n=t.northM/1e3,i=(l,u,p)=>`${Math.abs(l).toFixed(1)} km ${l>=0?u:p}`,r=`${i(e,"E","W")} · ${i(n,"N","S")} · ${Math.round(t.altitudeM)} m`,o=this.simScreen.querySelector("#player-where");o&&(o.textContent=r);const a=this.simScreen.querySelector("#teleport-where");a&&!((c=this.simScreen.querySelector("#teleport-panel"))!=null&&c.classList.contains("hidden"))&&(a.textContent=r,this.drawTeleportMap())}syncSunUi(t=!0){var o;if(!this.solver)return;const e=this.solver.radiation,n=this.solver.getSolarStatus(),i=Ch(e.latitudeDeg,e.month,e.solarHour);(o=this.renderer)==null||o.setSun(n.sunFrac,i);const r=this.simScreen.querySelector("#sun-clock");if(r.textContent=`${n.clock} · ${n.label}`,r.classList.toggle("night",!n.isDay),t&&!this.scrubbingSolar){const a=this.simScreen.querySelector("#live-hour"),c=this.simScreen.querySelector("#live-lat"),l=this.simScreen.querySelector("#live-month");a.value=String(e.solarHour),c.value=String(Math.round(e.latitudeDeg)),l.value=String(e.month),this.simScreen.querySelector("#live-hour-val").textContent=kr(e.solarHour),this.simScreen.querySelector("#live-lat-val").textContent=`${Math.round(e.latitudeDeg)}°`,this.simScreen.querySelector("#live-month-val").textContent=_l[e.month-1]??String(e.month)}else this.simScreen.querySelector("#live-hour-val").textContent=kr(e.solarHour),this.simScreen.querySelector("#live-lat-val").textContent=`${Math.round(e.latitudeDeg)}°`,this.simScreen.querySelector("#live-month-val").textContent=_l[e.month-1]??String(e.month)}startRun(t){var n,i,r,o,a,c;this.runName=t.name,this.bubbleStrength=t.bubbleStrength,this.pendingSetup=t,this.outputIntervalSec=Math.max(.5,t.outputIntervalSec),this.frameStore=null,this.batchCancel=!1,document.title=`Stormforge — ${this.runName}`;const e=new Ml({nx:t.nx,ny:t.ny,nz:t.nz,zTop:t.zTop});this.sounding=((n=t.sounding)==null?void 0:n.length)>0?t.sounding.map(l=>({...l})):vn(t.zTop,Math.max(20,t.nz+1)),this.solver=new Oh(e),this.synoptic=t.synoptic,this.solver.rebuild(e,this.sounding,{bubbleStrength:t.bubbleStrength,synoptic:this.synoptic}),this.solver.setRadiation({enabled:!0,latitudeDeg:t.latitudeDeg,month:t.month,solarHour:t.startHour,diurnalSpeed:15}),this.syncSunUi(!0),this.setup.hide(),this.simScreen.classList.add("active"),this.sessionMode=t.runMode==="batch"?"batching":"live",this.setPaused(t.runMode==="batch"),this.setClockPaused(!1),this.showClouds=!0,this.showRadar3d=!1,this.showRadar2d=!1,this.showSurfaceWinds=!1,this.mapProduct="refl",this.mapBucket=-1,this.mapPackedProduct=null,(i=this.simScreen.querySelector("#btn-clouds"))==null||i.classList.toggle("active",!0),(r=this.simScreen.querySelector("#btn-radar3d"))==null||r.classList.toggle("active",!1),(o=this.simScreen.querySelector("#btn-radar2d"))==null||o.classList.toggle("active",!1),(a=this.simScreen.querySelector("#btn-winds"))==null||a.classList.toggle("active",!1),(c=this.simScreen.querySelector("#radar-legend"))==null||c.classList.add("hidden"),this.syncSessionControls(),requestAnimationFrame(()=>{requestAnimationFrame(()=>this.mountSimView(e,t.zTop))})}mountSimView(t,e){var r,o,a,c;this.viewport.querySelectorAll("canvas").forEach(l=>{l.parentElement===this.viewport&&l.remove()}),(r=this.radar2d)==null||r.dispose(),this.radar2d=null,(o=this.renderer)==null||o.dispose(),this.renderer=new ng(this.viewport);const n=this.simScreen.querySelector("#teleport-alt");n.max=String(Math.max(20,Math.round(e)-2)),n.value="2",this.simScreen.querySelector("#teleport-alt-val").textContent="2 m",this.renderer.setGrid(t),this.renderer.resize(),this.radar2d=new sg(this.viewport),this.radar2d.setGrid(t.nx,t.ny),this.radar2d.setProduct(this.mapProduct),this.radar2d.setOnProductChange(l=>{this.mapProduct=l,this.mapBucket=-1,this.sessionMode==="playback"&&this.showPlaybackFrame(this.playbackIndex)}),this.radar2d.setVisible(!1),this.radar2d.setWindsVisible(!1),this.renderer.setWindsVisible(!1),this.mapBucket=-1,this.mapPackedProduct=null,(a=this.skewt)==null||a.dispose(),(c=this.hodo)==null||c.dispose(),this.skewtCanvas=this.simScreen.querySelector("#skewt-canvas"),this.hodoCanvas=this.simScreen.querySelector("#hodo-canvas"),this.skewtCanvas.classList.remove("hidden"),this.hodoCanvas.classList.add("hidden"),this.skewt=new Cl(this.skewtCanvas,e),this.hodo=new Rl(this.hodoCanvas,e);const i=this.simScreen.querySelector("#skewt-metrics");this.skewt.setMetricsElement(i),this.skewt.setLevels(this.sounding),this.hodo.setLevels(this.sounding),this.skewt.onChange=l=>{this.sounding=l},this.hodo.onChange=l=>{this.sounding=l},this.setPanelView("skewt"),this.skewt.resize(),this.renderer.resize(),this.syncSessionControls(),this.lastTs=performance.now(),this.stopLoop(),this.loop(this.lastTs),this.sessionMode==="batching"&&this.pendingSetup&&this.beginBatch(this.pendingSetup)}async beginBatch(t){if(!this.solver)return;this.batchCancel=!1,this.sessionMode="batching",this.syncSessionControls();const e=this.simScreen.querySelector("#batch-status"),n=this.simScreen.querySelector("#batch-progress-bar"),i=this.simScreen.querySelector("#batch-progress-meta");try{const r=await Oc(this.solver,{durationSec:t.durationSec,outputIntervalSec:t.outputIntervalSec,fixedDt:Dr,shouldCancel:()=>this.batchCancel,onProgress:o=>{e&&(e.textContent=o.message),n&&(n.style.width=`${(o.frac*100).toFixed(1)}%`),i&&(i.textContent=`${o.frames} frames · t=${o.t.toFixed(0)}s`)}});if(this.batchCancel){this.returnToMenu();return}this.enterPlayback(r)}catch{if(this.batchCancel){this.returnToMenu();return}e&&(e.textContent="Batch failed."),i&&(i.textContent="Return to main menu and try again.")}}returnToMenu(){var t,e,n,i;this.stopLoop(),this.frameStore=null,this.sessionMode="live",this.pendingSetup=null,this.batchCancel=!1,(t=this.renderer)==null||t.dispose(),this.renderer=null,(e=this.radar2d)==null||e.dispose(),this.radar2d=null,(n=this.skewt)==null||n.dispose(),this.skewt=null,(i=this.hodo)==null||i.dispose(),this.hodo=null,this.solver=null,this.syncSessionControls(),this.simScreen.classList.remove("active"),this.setup.show()}enterPlayback(t){var n;this.frameStore=t,this.sessionMode="playback",this.playbackIndex=0,this.playbackAccumMs=0,this.playbackSpeed=Number(((n=this.simScreen.querySelector("#playback-speed"))==null?void 0:n.value)||1);const e=this.simScreen.querySelector("#playback-scrub");e.max=String(Math.max(0,t.length-1)),e.value="0",this.setPlaybackPlaying(!0),this.syncSessionControls(),this.showPlaybackFrame(0)}showPlaybackFrame(t){if(!this.frameStore||!this.renderer)return;const e=this.frameStore.length;if(e<1)return;const n=Math.max(0,Math.min(e-1,t));this.playbackIndex=n;const i=this.frameStore.get(n);if(!i)return;const r=this.simScreen.querySelector("#playback-scrub");r&&(r.value=String(n));const o=this.simScreen.querySelector("#playback-meta");o&&(o.textContent=`frame ${n+1}/${e} · t=${i.t.toFixed(0)}s`),this.solver&&this.solver.setSolarHour(i.solarHour),this.showRadar2d&&this.radar2d?(this.radar2d.setProduct("refl"),this.mapProduct="refl",this.radar2d.update(a=>{a.set(i.radar)})):(this.renderer.setVolumeVisible(this.showClouds),this.renderer.setRadarVisible(this.showRadar3d),this.showClouds&&this.renderer.updateVolume(a=>{if(a.length===i.volume.length)a.set(i.volume);else if(this.solver){const c=this.solver.grid;Uc(i.volume,c.nx,c.ny,c.nz,a)}},1,1,!0),this.showRadar3d&&this.renderer.updateRadar(a=>{a.set(i.radar)}),this.renderer.render()),this.updateStatsLine(!0,i.t),this.syncSunUi(!0)}mapRefreshDue(t){if(!this.solver)return!1;const e=Math.max(.5,this.outputIntervalSec);return Math.floor(this.solver.time/e)!==this.mapBucket||t!==this.mapPackedProduct}markMapPacked(t){var n;const e=Math.max(.5,this.outputIntervalSec);this.mapBucket=Math.floor((((n=this.solver)==null?void 0:n.time)??0)/e),this.mapPackedProduct=t}pushSurfaceWinds(){var e;if(!this.showSurfaceWinds||!this.solver||this.sessionMode!=="live")return;const t=j0(this.solver.grid,this.solver.fields);this.showRadar2d&&this.radar2d?this.radar2d.updateWinds(t):(e=this.renderer)==null||e.updateWinds(t)}updateStatsLine(t,e){if(!this.solver)return;const n=this.solver.grid,i=this.solver.cloudRainStats(),r=Math.floor(n.nz*.25),o=Math.hypot(this.solver.fields.u0[r],this.solver.fields.v0[r]),a=this.solver.getSolarStatus();let c=0,l=0;for(let M=0;M<n.ny;M++)for(let x=0;x<n.nx;x++){const A=n.idx(x,M,0);c+=this.solver.fields.theta[A]-this.solver.fields.theta0[0],l++}const u=l?c/l:0,p=(u>=0?"+":"")+`${u.toFixed(1)}K`,d=a.isDay?`sun ${a.sunFrac.toFixed(2)} dTs=${p}`:`IR dTs=${p}`,h=(n.xExtent/1e3).toFixed(0),g=(n.yExtent/1e3).toFixed(0),v=(n.zTop/1e3).toFixed(1),m=(this.showRadar2d?[`map:${this.mapProduct}`]:[this.showClouds?"clouds":null,this.showRadar3d?"radar3d":null]).concat(this.showSurfaceWinds?["winds"]:[]).filter(Boolean).join("+")||"—",f=e??this.solver.time,_=this.sessionMode==="playback"?" · REVIEW":this.sessionMode==="batching"?" · BATCH":"";this.statsEl.textContent=`${this.runName} · ${n.nx}×${n.ny}×${n.nz} (${h}×${g}×${v}km) · t=${f.toFixed(0)}s · ${m} · ${d} · wind≈${o.toFixed(1)}m/s · qc=${i.cloudMax.toExponential(2)} qr=${i.rainMax.toExponential(2)}`+(this.sessionMode==="live"&&this.paused?" · PAUSED":"")+(this.sessionMode==="playback"&&!this.playbackPlaying?" · PAUSED":"")+(this.clockPaused?" · CLOCK":"")+_}syncLightning(t){var e;if(!(!this.solver||!this.renderer)){if(this.simSpeed===1&&!this.paused&&this.sessionMode==="live"){const n=this.solver.grid;for(const i of this.solver.rollLightning(t))this.renderer.addLightning({i:i.i,j:i.j,x:((i.i+.5)/n.nx-.5)*n.xExtent,z:-((i.j+.5)/n.ny-.5)*n.yExtent,y:-n.zTop/2+(i.k+.5)*n.dz})}else this.simSpeed!==1&&this.renderer.clearLightning();this.renderer.tickLightning(t),(e=this.radar2d)==null||e.setLightning(this.renderer.lightningMarks())}}stopLoop(){this.raf&&cancelAnimationFrame(this.raf),this.raf=0}}const bc=document.getElementById("app");if(!bc)throw new Error("#app missing");new rg(bc);
