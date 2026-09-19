import {pool} from "./runtime.mjs";

export const ALLOWED_MEDIA_TYPES=Object.freeze([
  "image/jpeg","image/png","image/webp","image/gif",
  "video/mp4","video/webm","video/quicktime",
  "audio/mpeg","audio/ogg","audio/webm","audio/wav","audio/mp4",
  "application/pdf"
]);

export const SETTING_SPECS=Object.freeze({
  registration_enabled:{type:"boolean",default:true,group:"security"},
  login_rate_limit_15m:{type:"integer",min:5,max:240,default:30,group:"security"},
  captcha_escalation_enabled:{type:"boolean",default:false,group:"security"},
  captcha_escalation_threshold:{type:"integer",min:2,max:20,default:6,group:"security"},
  new_account_restrictions_enabled:{type:"boolean",default:true,group:"security"},
  reports_limit_per_hour:{type:"integer",min:1,max:60,default:12,group:"security"},
  friend_requests_limit_per_hour:{type:"integer",min:1,max:120,default:30,group:"security"},
  dm_limit_per_minute:{type:"integer",min:1,max:120,default:30,group:"security"},

  post_limit_per_hour:{type:"integer",min:1,max:120,default:30,group:"content"},
  comment_limit_per_hour:{type:"integer",min:1,max:300,default:120,group:"content"},
  story_lifetime_hours:{type:"integer",min:1,max:72,default:24,group:"content"},
  upload_max_mb:{type:"integer",min:1,max:8,default:8,group:"content"},
  upload_max_image_mb:{type:"integer",min:1,max:8,default:8,group:"content"},
  upload_max_video_mb:{type:"integer",min:1,max:8,default:8,group:"content"},
  upload_max_audio_mb:{type:"integer",min:1,max:8,default:8,group:"content"},
  allowed_media_types:{type:"string_array",allowed:ALLOWED_MEDIA_TYPES,minItems:1,maxItems:20,default:ALLOWED_MEDIA_TYPES,group:"content"},
  pinned_post_limit:{type:"integer",min:0,max:1,default:1,group:"content"},

  rooms_enabled:{type:"boolean",default:true,group:"rooms"},
  room_create_limit_per_day:{type:"integer",min:1,max:50,default:5,group:"rooms"},
  room_default_max_members:{type:"integer",min:2,max:500,default:100,group:"rooms"},
  room_max_members_cap:{type:"integer",min:2,max:500,default:500,group:"rooms"},
  room_invite_limit_per_hour:{type:"integer",min:1,max:240,default:60,group:"rooms"},
  voice_participant_max:{type:"integer",min:4,max:100,default:24,group:"rooms"},

  live_create_limit_per_hour:{type:"integer",min:1,max:12,default:4,group:"realtime"},
  live_max_viewers:{type:"integer",min:1,max:8,default:8,group:"realtime"},
  live_default_slow_mode_seconds:{type:"integer",min:0,max:120,default:0,group:"realtime"},

  maintenance_mode:{type:"boolean",default:false,group:"platform"},
  maintenance_message:{type:"string",minLength:0,maxLength:240,default:"جاري تحديث مربوعة، بنرجعولك خلال دقائق.",group:"platform"},
  maintenance_eta_minutes:{type:"integer",min:0,max:1440,default:0,group:"platform"},
  site_font:{type:"enum",values:["readex","cairo"],default:"readex",group:"platform"}
});

export const FEATURE_SPECS=Object.freeze({
  engagement:{default:true,group:"platform"},
  map:{default:true,group:"platform"},
  calls:{default:true,group:"realtime"},
  live:{default:true,group:"realtime"},
  voice_rooms:{default:true,group:"rooms"},
  guest_explore:{default:true,group:"platform"},
  push:{default:true,group:"platform"}
});

let cache={at:0,settings:null,features:null};
const CACHE_MS=5000;

export function invalidateOperationalControls(){cache={at:0,settings:null,features:null}}

export function parseOperationalSetting(key,value){
  const spec=SETTING_SPECS[key];
  if(!spec)return{ok:false,error:"SETTING_NOT_FOUND"};
  if(spec.type==="boolean")return typeof value==="boolean"?{ok:true,value}:{ok:false,error:"SETTING_TYPE_INVALID"};
  if(spec.type==="integer"){
    const n=Number(value);
    return Number.isInteger(n)&&n>=spec.min&&n<=spec.max?{ok:true,value:n}:{ok:false,error:"SETTING_RANGE_INVALID"};
  }
  if(spec.type==="enum")return spec.values.includes(String(value))?{ok:true,value:String(value)}:{ok:false,error:"SETTING_VALUE_INVALID"};
  if(spec.type==="string"){
    const s=String(value??"").trim();
    return s.length>=Number(spec.minLength||0)&&s.length<=Number(spec.maxLength||500)?{ok:true,value:s}:{ok:false,error:"SETTING_LENGTH_INVALID"};
  }
  if(spec.type==="string_array"){
    if(!Array.isArray(value))return{ok:false,error:"SETTING_TYPE_INVALID"};
    const clean=[...new Set(value.map(x=>String(x||"").trim()).filter(Boolean))];
    if(clean.length<spec.minItems||clean.length>spec.maxItems||clean.some(x=>!spec.allowed.includes(x)))return{ok:false,error:"SETTING_VALUE_INVALID"};
    return{ok:true,value:clean};
  }
  return{ok:false,error:"SETTING_TYPE_INVALID"};
}

export function operationalSettingMeta(){
  return Object.fromEntries(Object.entries(SETTING_SPECS).map(([key,s])=>[key,{
    type:s.type,group:s.group,min:s.min,max:s.max,minLength:s.minLength,maxLength:s.maxLength,
    values:s.values||s.allowed||undefined,default:s.default
  }]));
}

export async function operationalControls({fresh=false}={}){
  if(!fresh&&cache.settings&&Date.now()-cache.at<CACHE_MS)return cache;
  const keys=Object.keys(SETTING_SPECS),featureKeys=Object.keys(FEATURE_SPECS);
  try{
    const [settingsRows,featureRows]=await Promise.all([
      pool.query(`SELECT key,value FROM admin_system_settings WHERE key=ANY($1::text[])`,[keys]),
      pool.query(`SELECT key,enabled FROM feature_flags WHERE key=ANY($1::text[])`,[featureKeys])
    ]);
    const settings=Object.fromEntries(keys.map(k=>[k,SETTING_SPECS[k].default]));
    for(const row of settingsRows.rows)settings[row.key]=row.value;
    const features=Object.fromEntries(featureKeys.map(k=>[k,Boolean(FEATURE_SPECS[k].default)]));
    for(const row of featureRows.rows)features[row.key]=Boolean(row.enabled);
    cache={at:Date.now(),settings,features};
  }catch{
    cache={
      at:Date.now(),
      settings:Object.fromEntries(keys.map(k=>[k,SETTING_SPECS[k].default])),
      features:Object.fromEntries(featureKeys.map(k=>[k,Boolean(FEATURE_SPECS[k].default)]))
    };
  }
  return cache;
}

export async function operationalSetting(key){
  const state=await operationalControls();
  return Object.prototype.hasOwnProperty.call(state.settings,key)?state.settings[key]:SETTING_SPECS[key]?.default;
}

export async function operationalFeature(key){
  const state=await operationalControls();
  return Object.prototype.hasOwnProperty.call(state.features,key)?Boolean(state.features[key]):Boolean(FEATURE_SPECS[key]?.default);
}
