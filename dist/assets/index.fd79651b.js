import{r as s,j as h}from"./index.4a2ae916.js";const n=`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
    <rect width="120" height="120" rx="8" fill="#F2F3F5"/>
    <path d="M30 80 L52 56 L66 70 L82 50 L96 80 Z" fill="#C9CDD4"/>
    <circle cx="44" cy="42" r="8" fill="#C9CDD4"/>
    <text x="60" y="104" text-anchor="middle" font-size="12" fill="#86909C" font-family="PingFang SC, Helvetica, Arial, sans-serif">\u6682\u65E0\u56FE\u7247</text>
  </svg>`)}`;function d(a){const{src:t,alt:i="",className:o,style:l,width:f,height:u,fallback:e}=a,r=s.exports.useRef(!1),[x,c]=s.exports.useState(t||e||n);s.exports.useEffect(()=>{r.current=!1,c(t||e||n)},[t,e]);function g(){r.current||(r.current=!0,c(e||n))}return h("img",{src:x,alt:i,className:o,style:l,width:f,height:u,onError:g})}export{d as S};
