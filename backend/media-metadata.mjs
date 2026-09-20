function stripJpegMetadata(buf){
  if(!Buffer.isBuffer(buf)||buf.length<4||buf[0]!==0xff||buf[1]!==0xd8)return buf;
  const parts=[buf.subarray(0,2)];let i=2;
  while(i<buf.length){
    if(buf[i]!==0xff){parts.push(buf.subarray(i));break}
    const marker=buf[i+1];
    if(marker===0xda||marker===0xd9){parts.push(buf.subarray(i));break}
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7)){parts.push(buf.subarray(i,i+2));i+=2;continue}
    if(i+4>buf.length)return buf;
    const size=buf.readUInt16BE(i+2),end=i+2+size;
    if(size<2||end>buf.length)return buf;
    if(marker!==0xe1)parts.push(buf.subarray(i,end));
    i=end;
  }
  return Buffer.concat(parts);
}
function stripPngMetadata(buf){
  const sig=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if(!Buffer.isBuffer(buf)||buf.length<8||!buf.subarray(0,8).equals(sig))return buf;
  const parts=[buf.subarray(0,8)],drop=new Set(["eXIf","tEXt","zTXt","iTXt"]);let i=8;
  while(i<buf.length){
    if(i+12>buf.length){parts.push(buf.subarray(i));break}
    const size=buf.readUInt32BE(i),end=i+12+size;
    if(end>buf.length)return buf;
    const type=buf.subarray(i+4,i+8).toString("ascii");
    if(!drop.has(type))parts.push(buf.subarray(i,end));
    i=end;
  }
  return Buffer.concat(parts);
}
function stripWebpMetadata(buf){
  if(!Buffer.isBuffer(buf)||buf.length<12||buf.subarray(0,4).toString("ascii")!=="RIFF"||buf.subarray(8,12).toString("ascii")!=="WEBP")return buf;
  const chunks=[];let i=12;
  while(i<buf.length){
    if(i+8>buf.length)return buf;
    const type=buf.subarray(i,i+4).toString("ascii"),size=buf.readUInt32LE(i+4),end=i+8+size+(size%2);
    if(end>buf.length)return buf;
    if(type!=="EXIF"&&type!=="XMP ")chunks.push(buf.subarray(i,end));
    i=end;
  }
  const out=Buffer.concat([buf.subarray(0,12),...chunks]);
  out.writeUInt32LE(Math.max(4,out.length-8),4);
  return out;
}
export function sanitizeMediaBuffer(type,buf){
  if(type==="image/jpeg")return stripJpegMetadata(buf);
  if(type==="image/png")return stripPngMetadata(buf);
  if(type==="image/webp")return stripWebpMetadata(buf);
  return buf;
}
