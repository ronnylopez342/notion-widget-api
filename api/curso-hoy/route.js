<div id="cursohoy"></div>
<script>
const U="https://notion-widget-api-7nsm.vercel.app/api/curso-hoy";
const $=s=>document.getElementById(s);
const e=s=>String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
const f=d=>{if(!d)return"";let[a,b,c]=String(d).slice(0,10).split("-");return`${c}/${b}`};

fetch(U).then(r=>r.json()).then(d=>{
  if(!d.ok||!Array.isArray(d.materias)) throw 0;

  const fechaReferencia=String(d.fecha_usada||d.fecha_hoy||"").slice(0,10);

  $("cursohoy").innerHTML=`
  <style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:transparent}
  #cursohoy{font-family:Inter,Arial,sans-serif;text-transform:uppercase}

  .w{
    background:#fff;
    border:1px solid #e2e8f0;
    border-radius:18px;
    padding:10px;
    box-shadow:0 8px 20px rgba(15,23,42,.06)
  }

  .hero{text-align:center;margin-bottom:8px}

  .pill{
    display:inline-block;
    padding:6px 10px;
    border:1px solid #e2e8f0;
    border-radius:999px;
    background:#f8fafc;
    font-size:9px;
    font-weight:900;
    color:#0f172a
  }

  .title{
    margin-top:8px;
    font-size:24px;
    line-height:1.05;
    font-weight:900;
    color:#0f172a;
    text-align:center
  }

  .top{
    margin:10px 0;
    background:linear-gradient(180deg,#fff7ed 0%,#ffedd5 100%);
    border:1px solid rgba(249,115,22,.2);
    border-radius:14px;
    padding:10px;
    text-align:center
  }

  .lab{
    font-size:9px;
    font-weight:900;
    letter-spacing:.06em;
    color:#64748b
  }

  .val{
    font-size:20px;
    font-weight:900;
    color:#0f172a;
    margin-top:2px
  }

  .txt{
    margin-top:4px;
    font-size:10px;
    line-height:1.35;
    color:#475569;
    font-weight:800;
    overflow-wrap:anywhere;
    word-break:break-word
  }

  .g{
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:8px
  }

  .c{
    background:#fff;
    border:1px solid rgba(239,68,68,.16);
    border-radius:16px;
    padding:10px;
    box-shadow:0 4px 12px rgba(15,23,42,.04);
    text-align:center;
    overflow:hidden
  }

  .c.ok{
    background:linear-gradient(180deg,#f0fdf4 0%,#dcfce7 100%);
    border:1px solid rgba(34,197,94,.28)
  }

  .h{
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:6px;
    margin-bottom:8px
  }

  .dot{
    width:14px;
    height:14px;
    border-radius:999px;
    background:radial-gradient(circle at 30% 30%,#fb7185,#e11d48)
  }

  .dot.ok{
    background:radial-gradient(circle at 30% 30%,#4ade80,#16a34a)
  }

  .m{
    font-size:11px;
    line-height:1.15;
    font-weight:900;
    color:#0f172a;
    text-align:center;
    overflow-wrap:anywhere;
    word-break:break-word
  }

  .q{
    min-width:24px;
    height:24px;
    padding:0 8px;
    border:1px solid #e2e8f0;
    border-radius:999px;
    background:#f8fafc;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:10px;
    font-weight:900;
    margin:0 auto
  }

  .c.ok .q{
    background:#ecfdf5;
    border-color:rgba(34,197,94,.25);
    color:#166534
  }

  .items{
    max-height:260px;
    overflow-y:auto;
    overflow-x:hidden;
    padding-right:4px
  }

  .items::-webkit-scrollbar{width:6px}
  .items::-webkit-scrollbar-thumb{
    background:#cbd5e1;
    border-radius:999px
  }
  .items::-webkit-scrollbar-track{background:transparent}

  .t{
    background:#f8fafc;
    border:1px solid rgba(148,163,184,.14);
    border-radius:12px;
    padding:8px;
    margin-bottom:6px;
    text-align:center
  }

  .tt{
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:2px;
    margin-bottom:4px;
    font-size:9px;
    font-weight:900;
    color:#64748b
  }

  .nm{
    font-size:10px;
    line-height:1.25;
    font-weight:900;
    color:#0f172a;
    text-align:center;
    overflow-wrap:anywhere;
    word-break:break-word
  }

  .ax{
    margin-top:4px;
    font-size:9px;
    line-height:1.2;
    font-weight:800;
    color:#475569;
    text-align:center;
    overflow-wrap:anywhere;
    word-break:break-word
  }

  .empty{
    background:#f8fafc;
    border:1px dashed rgba(148,163,184,.28);
    border-radius:12px;
    padding:10px;
    font-size:10px;
    line-height:1.3;
    font-weight:800;
    color:#475569;
    text-align:center
  }

  .empty.ok{
    background:#f0fdf4;
    border:1px dashed rgba(34,197,94,.35);
    color:#166534;
    font-weight:900
  }

  @media(max-width:780px){
    .g{grid-template-columns:1fr}
    .title{font-size:20px}
    .val{font-size:18px}
    .items{max-height:220px}
  }
  </style>

  <div class="w">
    <div class="hero">
      <div class="pill">📚 CONTENIDO DEL CURSO</div>
      <div class="title">HOY TOCA ESTUDIAR ESTO</div>
    </div>

    <div class="top">
      <div class="lab">DÍA ACTUAL</div>
      <div class="val">${e(d.day||"HOY")}</div>
      <div class="txt">${e(d.mode||"TEMAS DE HOY")}. FECHA MOSTRADA: ${e(f(fechaReferencia))}. MATERIAS: ${e(d.total_materias_hoy||0)}.</div>
    </div>

    <div class="g">
      ${d.materias.length ? d.materias.map(m=>{
        const itemsRef=Array.isArray(m.items)
          ? m.items.filter(x=>{
              const fx=String(x.fecha_iso||x.fecha_key||"").slice(0,10);
              return fx===fechaReferencia;
            })
          : [];

        const total=itemsRef.length;
        const alDia=total===0;

        return `
        <div class="c ${alDia?'ok':''}">
          <div class="h">
            <span class="dot ${alDia?'ok':''}"></span>
            <span class="m">${e(m.materia)}</span>
            <span class="q">${alDia?'OK':e(total)}</span>
          </div>

          ${
            itemsRef.length
              ? `<div class="items">${itemsRef.map(x=>`
                  <div class="t">
                    <div class="tt">
                      <span>${e(f(x.fecha_iso||x.fecha_key))}</span>
                      <span>${e(x.unidad||"")}</span>
                    </div>
                    <div class="nm">${e(x.tema||"")}</div>
                    ${x.anexo?`<div class="ax">${e(x.anexo)}</div>`:""}
                  </div>
                `).join("")}</div>`
              : `<div class="empty ok">MATERIA AL DÍA</div>`
          }
        </div>`;
      }).join("") : `
        <div class="c ok" style="grid-column:1/-1">
          <div class="h">
            <span class="dot ok"></span>
            <span class="m">MATERIA AL DÍA</span>
            <span class="q">OK</span>
          </div>
          <div class="empty ok">NO HAY TEMAS PARA LA FECHA MOSTRADA.</div>
        </div>
      `}
    </div>
  </div>`;
}).catch(()=>{
  $("cursohoy").innerHTML=`
  <style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:transparent}
  #cursohoy{font-family:Inter,Arial,sans-serif;text-transform:uppercase}
  .e{
    background:#fff;
    border:1px solid rgba(220,38,38,.16);
    border-radius:18px;
    padding:14px;
    box-shadow:0 8px 20px rgba(15,23,42,.06);
    text-align:center
  }
  .t{
    color:#991b1b;
    font-size:18px;
    font-weight:900;
    margin-bottom:6px
  }
  .p{
    color:#7f1d1d;
    font-size:11px;
    font-weight:800;
    line-height:1.35
  }
  </style>
  <div class="e">
    <div class="t">NO PUDE LEER EL CURSO</div>
    <div class="p">REVISA LA API CURSO-HOY EN VERCEL Y VUELVE A INTENTAR.</div>
  </div>`;
});
</script>
