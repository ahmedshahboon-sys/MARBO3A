import {ImageResponse} from "next/og";

export const runtime="edge";
export const alt="مربوعة – MARBO3A";
export const size={width:1200,height:630};
export const contentType="image/png";

export default function OpenGraphImage(){
  const symbol="https://marbo3a.ly/brand/official/marbo3a-mark.png";
  return new ImageResponse(
    <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#090d12",position:"relative",overflow:"hidden",fontFamily:"Arial, sans-serif"}}>
      <div style={{position:"absolute",width:520,height:520,borderRadius:260,background:"rgba(255,122,0,.13)",right:-120,top:-180,filter:"blur(8px)"}}/>
      <div style={{position:"absolute",width:420,height:420,borderRadius:210,background:"rgba(255,92,0,.08)",left:-150,bottom:-180,filter:"blur(10px)"}}/>
      <div style={{width:1020,height:470,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 76px",border:"1px solid rgba(255,255,255,.10)",borderRadius:44,background:"rgba(17,22,28,.92)"}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",textAlign:"left"}}>
          <div style={{fontSize:66,fontWeight:900,color:"#fff",lineHeight:1.05,letterSpacing:5}}>MARBO3A</div>
          <div style={{fontSize:30,color:"#b9c0c9",marginTop:26}}>Libyan social platform</div>
          <div style={{fontSize:23,color:"#ff8a24",marginTop:22}}>Social • Friends • Messages • Rooms</div>
        </div>
        <div style={{width:300,height:300,borderRadius:64,display:"flex",alignItems:"center",justifyContent:"center",background:"#11161d",border:"1px solid rgba(255,122,0,.22)",boxShadow:"0 28px 80px rgba(255,122,0,.18)"}}>
          <img src={symbol} width={230} height={230} style={{objectFit:"contain",borderRadius:48}}/>
        </div>
      </div>
    </div>,size
  );
}
