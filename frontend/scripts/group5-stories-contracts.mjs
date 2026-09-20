import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
function must(file,tokens,label){const src=read(file);for(const token of tokens)if(!src.includes(token))throw new Error(`${label}: missing ${token} in ${file}`)}

must("app/StoryRail.js",[
  "sessionMarker","cookieHeaders","/api/stories","/api/uploads/video",
  "video/mp4,video/webm,video/quicktime","story-overlay-open","story-viewers-panel",
  "story-social-tools","/reaction","/reply","/highlight","mutes","?story="
],"story lifecycle UI");
must("app/ui-v3-unified-scale.css",[
  ".story-viewer{position:fixed","height:100dvh","env(safe-area-inset-top","env(safe-area-inset-bottom",
  ".story-viewer .story-stage :is(img,video)","object-fit:contain"
],"story responsive geometry");
must("app/LiveEntryRuntime.js",[
  "marbo3a-live-story-mount","live-story-person","story-person:not(.live-story-person)",
  "LiveStoryButtons","storyMount&&currentLives.length>0"
],"story/live rail integration");
must("app/live-entry.css",[
  ".live-story-mount","live-story-person","live-story-label","story-person[hidden]"
],"story/live styles");
console.log("Group 5 Stories & Media frontend contracts OK");
